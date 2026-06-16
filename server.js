const express = require("express");
const cors = require("cors");
const simpleGit = require("simple-git");
const { exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();

const PORTS_FILE = path.join(
  __dirname,
  "ports.json"
);

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.use(express.json());

function getNextPort() {
  const data = JSON.parse(
    fs.readFileSync(PORTS_FILE)
  );

  const port = data.nextPort;

  data.nextPort++;

  fs.writeFileSync(
    PORTS_FILE,
    JSON.stringify(data, null, 2)
  );

  return port;
}

app.get("/", (req, res) => {
  res.send("Mini Render Backend Running");
});

app.post("/deploy", async (req, res) => {
  try {
    const {
      repoUrl,
      rootDir,
      startCommand,
      envText = "",
    } = req.body;

    if (!repoUrl) {
      return res.status(400).json({
        success: false,
        message: "Repo URL required",
      });
    }

    const repoName = repoUrl
      .split("/")
      .pop()
      .replace(".git", "");

    const deployPath = path.join(
      __dirname,
      "apps",
      repoName
    );

    // Create apps folder
    if (!fs.existsSync(path.join(__dirname, "apps"))) {
      fs.mkdirSync(path.join(__dirname, "apps"));
    }

    // Delete old deployment
    if (fs.existsSync(deployPath)) {
      fs.rmSync(deployPath, {
        recursive: true,
        force: true,
      });
    }

    const git = simpleGit();

    await git.clone(repoUrl, deployPath);

    const projectPath =
      rootDir && rootDir !== "."
        ? path.join(deployPath, rootDir)
        : deployPath;

    const assignedPort = getNextPort();

    console.log(
      `Assigned Port: ${assignedPort}`
    );

    const envContent =
      envText.trim() +
      `\nPORT=${assignedPort}`;

    fs.writeFileSync(
      path.join(projectPath, ".env"),
      envContent
    );

    console.log(".env file created");

    exec(
      `cd ${projectPath} && npm install`,
      (installErr) => {
        if (installErr) {
          console.log(installErr);

          return;
        }

        exec(
          `pm2 delete ${repoName}`,
          () => {
            const fileToRun =
              startCommand || "server.js";

            exec(
              `cd ${projectPath} && pm2 start ${fileToRun} --name ${repoName}`,
              (pm2Err) => {
                if (pm2Err) {
                  console.log(pm2Err);

                  return;
                }

                console.log(
                  `${repoName} deployed successfully`
                );

                const nginxConfig = `
location /${repoName}/ {
    proxy_pass http://localhost:${assignedPort}/;

    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';

    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
`;

                fs.writeFileSync(
                  `/etc/nginx/snippets/${repoName}.conf`,
                  nginxConfig
                );

                console.log(
                  `NGINX route created for ${repoName}`
                );

                try {
                  execSync("sudo nginx -t");

                  execSync(
                    "sudo systemctl reload nginx"
                  );

                  console.log(
                    "NGINX reloaded successfully"
                  );
                } catch (err) {
                  console.log(
                    "NGINX reload failed"
                  );

                  console.log(err);
                }
              }
            );
          }
        );
      }
    );

    res.json({
      success: true,
      message: "Deployment started",
      assignedPort,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const PORT = 7000;

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});