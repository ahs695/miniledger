require("dotenv").config();

const winston = require("winston");
const { connectDB } = require("./db");

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
  validateEnv(["PORT", "MONGO_URI", "JWT_SECRET", "ACCOUNT_SERVICE_URL"]);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = require("./app");

const PORT = process.env.PORT || 4002;

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(
      `transaction-service started on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`
    );
  });
});
