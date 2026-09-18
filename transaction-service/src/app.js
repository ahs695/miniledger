const express = require("express");
const morgan = require("morgan");

const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.use(require("./routes/transfer"));
app.use(require("./routes/transactions"));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "transaction-service" });
});

module.exports = app;
