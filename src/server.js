const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/companies", require("../routes/companies"));
//app.use("/api/companis", require("./routes/companis"));
app.use("/api/students", require("../routes/students"));
app.use("/api/faculty", require("../routes/faculty"));
const PORT = 5000;
const pool = require("../services/db");
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("DB connection failed", err);
  } else {
    console.log("DB connected", res.rows[0]);
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
