require("dotenv").config();

const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

function validateEnv(requiredVars) {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }
}

try {
  validateEnv(["PORT", "DATABASE_URL", "JWT_SECRET"]);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require("./app");

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  logger.info(
    `account-service started on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`
  );
});
