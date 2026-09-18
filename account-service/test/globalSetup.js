require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

module.exports = async () => {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error(
      "DATABASE_URL_TEST must be set (in .env) to run the account-service test suite"
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });

  // The test database is disposable — reset it to a clean slate before
  // (re-)applying every migration, so the suite is hermetic and repeatable
  // regardless of what an earlier run left behind. This ONLY ever targets
  // DATABASE_URL_TEST, never the real DATABASE_URL.
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await pool.query(statement);
    }
  }

  await pool.end();
};
