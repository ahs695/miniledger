const dns = require("dns");
const mongoose = require("mongoose");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

// Node's resolver (via c-ares) sends raw DNS queries straight to the OS's
// configured nameserver, bypassing the Windows DNS client service. On this
// machine that nameserver is 127.0.0.1, which refuses those raw queries —
// so mongodb+srv:// lookups (needed for Atlas) fail with
// "querySrv ECONNREFUSED" even though normal DNS resolution works fine
// everywhere else. Pointing Node at a public resolver directly works around it.
if (process.env.MONGO_URI && process.env.MONGO_URI.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // mongoose.connect() resolves as soon as the connection is open; schema
    // indexes (e.g. the unique idempotencyKey index on Transaction) are then
    // built in the background and are NOT guaranteed to exist yet. Without
    // waiting here, requests handled right after a cold start could insert
    // duplicate idempotencyKey values before the unique index is ready.
    // Model.init() resolves once that model's indexes are confirmed built.
    await require("./models/Transaction").init();

    logger.info(`connected to MongoDB (${mongoose.connection.name})`);
  } catch (err) {
    logger.error(`failed to connect to MongoDB: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { connectDB };
