# Deployment design: ECS Fargate

This is a **design document**, not a record of what's provisioned. As of writing, nothing described here exists in AWS except the two ECR repositories and pushed images (see the repo's `CLAUDE.md` decisions log for exactly what's real). This describes the target architecture for running both services on ECS Fargate behind an ALB.

## Prerequisite this design depends on

**account-service's database must move to RDS (or an equivalent managed Postgres) before any of this works.** ECS tasks run on AWS's network and have no route to a database sitting on a developer's local machine (`localhost`, home/office network, or a laptop that isn't even always on) — there's no address AWS could resolve to reach it. This isn't a configuration detail to fix later; it's a hard requirement before account-service's task can start successfully. (The RDS provisioning steps — `db.t3.micro`, 20GB, same VPC as ECS, security group scoped to the ECS tasks' security group — were covered as a walkthrough earlier in this project and aren't repeated here.)

transaction-service's `MONGO_URI` already points at MongoDB Atlas, which is already internet-reachable, so no equivalent blocker there — though Atlas's Network Access should be tightened from `0.0.0.0/0` to the ECS environment's NAT Gateway IP before this is anything more than a portfolio demo (also covered in that earlier walkthrough).

## Container images

- `miniledger-account` and `miniledger-transaction` ECR repositories, `:latest` tag, built from each service's existing multi-stage `Dockerfile`.

## Task definitions

Two Fargate task definitions, same shape:

| | account-service | transaction-service |
|---|---|---|
| CPU | 256 (.25 vCPU) | 256 (.25 vCPU) |
| Memory | 512 MB | 512 MB |
| Network mode | `awsvpc` (required for Fargate) | `awsvpc` |
| Container port | 4001 | 4002 |
| Image | `<account-id>.dkr.ecr.<region>.amazonaws.com/miniledger-account:latest` | `.../miniledger-transaction:latest` |
| Logging | `awslogs` driver → a CloudWatch Logs group per service | same |
| Plain env vars | `PORT=4001` | `PORT=4002`, `ACCOUNT_SERVICE_URL` (see below) |
| Secrets (see below) | `DATABASE_URL`, `JWT_SECRET` | `MONGO_URI`, `JWT_SECRET` |

Each task gets its own IAM task role (least-privilege, no permissions needed today since neither service calls other AWS APIs directly) and a task **execution** role (used by ECS itself to pull the image and resolve secrets — separate from the task role).

## Secrets: Secrets Manager, not plaintext

`DATABASE_URL`, `MONGO_URI`, and `JWT_SECRET` must never appear as plaintext `environment` entries in a task definition — task definitions are visible to anyone with `ecs:DescribeTaskDefinition`, and plaintext values there effectively become long-lived secrets sitting in an easily-queried API response.

- Each value stored as its own secret in AWS Secrets Manager, e.g.:
  - `miniledger/account-service/database-url`
  - `miniledger/transaction-service/mongo-uri`
  - `miniledger/shared/jwt-secret` (same secret referenced by both task definitions, since both services currently use the same `JWT_SECRET` value)
- Referenced in the container definition under `secrets` (not `environment`), each as `{ "name": "DATABASE_URL", "valueFrom": "<secret-arn>" }`. ECS resolves these into real environment variables inside the container at task start.
- The **task execution role** needs `secretsmanager:GetSecretValue` scoped to exactly these three secret ARNs — not `secretsmanager:*`, not `Resource: "*"`.

## Networking / security groups

Three security groups, each scoped to only what needs to talk to it:

- **`miniledger-alb-sg`** (the ALB): inbound 80/443 from `0.0.0.0/0` (it's the public entry point); outbound to `miniledger-ecs-sg` only.
- **`miniledger-ecs-sg`** (both ECS services): inbound 4001 and 4002 from `miniledger-alb-sg` **only** — the tasks are never reachable directly from the internet, only through the ALB. Outbound: to `miniledger-rds-sg` on 5432, and to the internet (Atlas, and NAT-routed traffic in general) via a NAT Gateway, since the tasks live in private subnets.
- **`miniledger-rds-sg`** (from the earlier RDS walkthrough): inbound 5432 from `miniledger-ecs-sg` only.

Tasks run in private subnets; the ALB runs in public subnets.

## Service-to-service calls (transaction-service → account-service)

Worth naming two real options here rather than picking silently:

1. **Route through the ALB**, same as external traffic (`ACCOUNT_SERVICE_URL=https://<alb-dns-name>/accounts`) — simplest, reuses the router that already exists for this design, but the call technically leaves the VPC via the ALB's public listener and comes back in.
2. **AWS Cloud Map / ECS Service Connect** for private service discovery (`ACCOUNT_SERVICE_URL=http://account-service.miniledger.local:4001`) — keeps internal traffic off the public listener entirely; the more correct production pattern, more setup to stand up.

For a portfolio-scale deployment, option 1 is the pragmatic starting point and what the env var above assumes; option 2 is the natural next step if this ever needs to look more production-grade.

## ALB path-based routing

- One ALB, public subnets, `miniledger-alb-sg`.
- One listener (443 with an ACM cert, or 80 to start simple), two target groups:
  - `account-service-tg` → account-service's ECS service, port 4001, health check path `/health`.
  - `transaction-service-tg` → transaction-service's ECS service, port 4002, health check path `/health`.
- Listener rules, evaluated by priority:
  - Path pattern `/accounts/*` → forward to `account-service-tg`.
  - Path pattern `/transactions/*` → forward to `transaction-service-tg`.

**Real gap, flagged rather than glossed over**: the services' actual routes today are **not** prefixed — account-service exposes `POST /users`, `GET /wallets/:userId`, etc., not `POST /accounts/users`. An ALB listener rule matching `/accounts/*` only decides *which target group* gets the request; it does **not** rewrite the path (ALB has no path-rewrite feature), so account-service would receive the request at `/accounts/users` and 404, since no route matches that path today. Before this design can actually be wired up, either:
- account-service's/transaction-service's own route prefixes need to change to match (`/accounts/users`, `/transactions/transfer`, etc.), or
- something in front of the ALB (or a Lambda@Edge / CloudFront function, or switching the ALB rule to host-based routing instead of path-based) needs to strip the prefix before it reaches the service.

This doc describes the routing scheme as requested; reconciling it with the current route paths is follow-up work, not something silently assumed to already line up.

## ECS services

- Fargate launch type, desired count 1 to start (no redundancy — bump for anything beyond a demo), private subnets, `miniledger-ecs-sg`, each registered against its matching target group above.

## Explicitly out of scope for this first-pass design

- CI/CD (building/pushing images, updating task definitions on deploy).
- Autoscaling policies.
- TLS certificate / ACM setup for the ALB's 443 listener.
- CloudWatch alarms/dashboards, structured log retention policy.
- The RDS and Atlas provisioning steps themselves — covered as a walkthrough earlier in this project, intentionally not repeated here.
