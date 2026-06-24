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

function findPackageJson(dir) {
  const results = [];

  function scan(folder) {
    const files = fs.readdirSync(folder);

    for (const file of files) {
      const fullPath = path.join(folder, file);

      if (fs.statSync(fullPath).isDirectory()) {
        if (
          file !== "node_modules" &&
          file !== ".git"
        ) {
          scan(fullPath);
        }
      } else if (file === "package.json") {
        results.push(folder);
      }
    }
  }

  scan(dir);

  return results;
}
function detectBestRoot(packageDirs) {
  let bestDir = null;
  let bestScore = -999;

  for (const dir of packageDirs) {
    const packagePath = path.join(
      dir,
      "package.json"
    );

    const packageJson = JSON.parse(
      fs.readFileSync(packagePath)
    );

    let score = 0;

    // Strong backend signals
    if (
      packageJson.scripts &&
      packageJson.scripts.start
    ) {
      score += 100;
    }

    if (
      packageJson.scripts &&
      packageJson.scripts.dev
    ) {
      score += 20;
    }

    if (
      packageJson.dependencies?.express
    )
      score += 50;

    if (
      packageJson.dependencies?.mongoose
    )
      score += 30;

    if (
      packageJson.dependencies?.cors
    )
      score += 20;

    // Frontend signals
    if (
      packageJson.dependencies?.react
    )
      score -= 50;

    if (
      packageJson.dependencies?.vite
    )
      score -= 30;

    if (
      packageJson.dependencies?.next
    )
      score += 80;

    console.log(
      "Scanned:",
      dir,
      "Score:",
      score
    );

    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  return bestDir;
}
function detectProjectType(projectPath) {
  const files = fs.readdirSync(projectPath);

  if (files.includes("package.json")) {
    return "node";
  }

  if (
    files.includes("requirements.txt") ||
    files.includes("app.py") ||
    files.includes("main.py")
  ) {
    return "python";
  }

  if (
    files.includes("pom.xml") ||
    files.includes("build.gradle")
  ) {
    return "java";
  }

  if (files.includes("composer.json")) {
    return "php";
  }

  if (files.includes("go.mod")) {
    return "go";
  }

  if (files.includes("Cargo.toml")) {
    return "rust";
  }

  if (files.includes("index.html")) {
    return "static";
  }

  return "unknown";
}
function detectInstallCommand(projectType) {
  switch (projectType) {
    case "node":
      return "npm install";

    case "python":
      return "pip install -r requirements.txt";

    case "java":
      return "mvn install";

    case "php":
      return "composer install";

    case "go":
      return "go mod tidy";

    case "rust":
      return "cargo build";

    default:
      return null;
  }
}
function detectStartCommand(
  projectPath,
  projectType
) {
  if (projectType === "node") {
    return "npm";
  }

  if (projectType === "python") {
    if (
      fs.existsSync(path.join(projectPath, "app.py"))
    ) {
      return "python app.py";
    }

    if (
      fs.existsSync(path.join(projectPath, "main.py"))
    ) {
      return "python main.py";
    }
  }

  if (projectType === "java") {
    return "mvn spring-boot:run";
  }

  if (projectType === "php") {
    return "php -S 0.0.0.0:$PORT";
  }

  if (projectType === "go") {
    return "go run main.go";
  }

  if (projectType === "rust") {
    return "cargo run";
  }

  return null;
}

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

   let projectPath;

if (rootDir) {
  projectPath =
    rootDir === "."
      ? deployPath
      : path.join(deployPath, rootDir);
} else {
 const packageDirs =
  findPackageJson(deployPath);

projectPath =
  packageDirs.length > 0
    ? detectBestRoot(packageDirs)
    : deployPath;

  console.log(
    "Auto detected root:",
    projectPath
  );
}
const projectType =
  detectProjectType(projectPath);

console.log(
  "Detected project type:",
  projectType
);
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

   const installCommand =
  detectInstallCommand(projectType);

const runInstall =
  installCommand
    ? `cd ${projectPath} && ${installCommand}`
    : `cd ${projectPath}`;

exec(
  runInstall,
      (installErr) => {
        if (installErr) {
          console.log(installErr);

          return;
        }

        exec(
          `pm2 delete ${repoName}`,
          () => {
          let detectedCommand =
  startCommand ||
  detectStartCommand(
  projectPath,
  projectType
);

console.log(
  "Detected start command:",
  detectedCommand
);

if (!detectedCommand) {
  console.log(
    "Could not detect start command"
  );
  return;
}

let pm2Command;

if (projectType === "node") {
  pm2Command = `cd ${projectPath} && pm2 start npm --name ${repoName} -- start`;
} else {
  pm2Command = `cd ${projectPath} && pm2 start "${detectedCommand}" --name ${repoName} --interpreter bash`;
}

exec(
  pm2Command,
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