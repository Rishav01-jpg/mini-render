const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Mini Render Backend Running");
});

const PORT = 7000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});