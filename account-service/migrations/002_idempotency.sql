CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  response jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
