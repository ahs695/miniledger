require("dotenv").config();

if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    "DATABASE_URL_TEST must be set (in .env) to run the account-service test suite"
  );
}

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
