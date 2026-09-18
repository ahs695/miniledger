require("dotenv").config();

const fs = require("fs");
const path = require("path");
const winston = require("winston");
const { pool } = require("../db");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

function splitStatements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function migrate() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = splitStatements(sql);

    logger.info(`running migration ${file} (${statements.length} statement(s))`);

    for (const statement of statements) {
      logger.info(`executing: ${statement}`);
      await pool.query(statement);
    }

    logger.info(`migration ${file} completed successfully`);
  }
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`migration failed: ${err.message}`);
    return pool.end().finally(() => process.exit(1));
  });
