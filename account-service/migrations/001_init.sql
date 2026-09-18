CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz DEFAULT now()
);
