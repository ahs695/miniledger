const express = require("express");
const morgan = require("morgan");
const cors = require("cors");

const app = express();

// Allow-all CORS so the local dashboard/ static page (opened via file:// or
// any static server, different origin either way) can call this API directly
// from the browser. Fine for local/portfolio use; would need a real origin
// allowlist before this API is ever exposed beyond localhost.
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use(require("./routes/transfer"));
app.use(require("./routes/transactions"));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "transaction-service" });
});

module.exports = app;
