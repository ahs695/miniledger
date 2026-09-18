const { Pool } = require("pg");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

const SLOW_QUERY_THRESHOLD_MS = 100;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    logger.warn(`slow query (${duration}ms): ${text}`);
  }

  return res;
}

module.exports = { pool, query };
