# miniledger

miniledger is a small microservices-based ledger system that tracks accounts and the transactions applied to them, built with Node.js and Express. It is composed of independently runnable services that can be developed, tested, and deployed on their own, and orchestrated together locally via Docker Compose.

## Services

- **account-service** — manages account data
- **transaction-service** — manages transaction data
