const express = require("express");
const cors = require("cors");
const simpleGit = require("simple-git");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Mini Render Backend Running");
});

app.post("/deploy", async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({
        success: false,
        message: "Repo URL required",
      });
    }

    // Project Name
    const repoName = repoUrl.split("/").pop();

    // Deployment Path
    const deployPath = path.join(__dirname, "apps", repoName);

    // Create apps folder if not exists
    if (!fs.existsSync(path.join(__dirname, "apps"))) {
      fs.mkdirSync(path.join(__dirname, "apps"));
    }

    // Clone Repo
    const git = simpleGit();

    await git.clone(repoUrl, deployPath);

    // Install Dependencies
    exec(`cd ${deployPath} && npm install`, (err) => {
      if (err) {
        console.log(err);
        return;
      }

      // Run App
      exec(
        `cd ${deployPath} && pm2 start server.js --name ${repoName}`,
        (err) => {
          if (err) {
            console.log(err);
            return;
          }

          console.log(`${repoName} deployed successfully`);
        }
      );
    });

    res.json({
      success: true,
      message: "Deployment started",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Deployment failed",
    });
  }
});

const PORT = 7000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});