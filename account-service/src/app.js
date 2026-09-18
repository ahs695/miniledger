const express = require("express");
const morgan = require("morgan");

const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.use(require("./routes/users"));
app.use(require("./routes/wallets"));
app.use(require("./routes/auth"));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "account-service" });
});

module.exports = app;
