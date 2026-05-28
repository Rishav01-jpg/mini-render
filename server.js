const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Mini Render Backend Running");
});

app.post("/deploy", (req, res) => {
  const { repoUrl } = req.body;

  console.log("GitHub Repo:", repoUrl);

  res.json({
    success: true,
    message: "Deployment started",
    repoUrl,
  });
});

const PORT = 7000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});