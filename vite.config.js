import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function runCanvasImport({ days = 14, includeOverdue = false }) {
  const scriptPath = path.resolve(process.cwd(), "..", "DayLy_CLI.py");
  const baseArgs = [scriptPath, "canvas", "--days", String(days), "--apply"];
  if (includeOverdue) baseArgs.push("--include-overdue");

  const candidates =
    process.platform === "win32"
      ? [
          { cmd: "py", args: ["-3", ...baseArgs] },
          { cmd: "python", args: baseArgs },
        ]
      : [
          { cmd: "python3", args: baseArgs },
          { cmd: "python", args: baseArgs },
        ];

  return new Promise((resolve, reject) => {
    let idx = 0;

    const attempt = () => {
      if (idx >= candidates.length) {
        reject(new Error("Could not start Python. Install Python or update PATH."));
        return;
      }

      const current = candidates[idx++];
      const child = spawn(current.cmd, current.args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let spawnFailed = false;

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", () => {
        spawnFailed = true;
      });

      child.on("close", (code) => {
        if (spawnFailed) {
          attempt();
          return;
        }

        if (code !== 0) {
          reject(
            new Error(stderr || stdout || `Canvas import failed with exit code ${code}.`)
          );
          return;
        }

        const summaryMatch = stdout.match(
          /Inserted=(\d+),\s*Skipped\(dupes\)=(\d+)/i
        );

        resolve({
          inserted: summaryMatch ? Number(summaryMatch[1]) : null,
          skipped: summaryMatch ? Number(summaryMatch[2]) : null,
          output: stdout.trim(),
        });
      });
    };

    attempt();
  });
}

function canvasScannerPlugin() {
  return {
    name: "dayly-canvas-scanner-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/api/canvas-scan" || req.method !== "POST") {
          next();
          return;
        }

        try {
          const bodyRaw = await readBody(req);
          const body = bodyRaw ? JSON.parse(bodyRaw) : {};
          const days = Number.isFinite(Number(body.days)) ? Number(body.days) : 14;
          const includeOverdue = Boolean(body.includeOverdue);

          const result = await runCanvasImport({ days, includeOverdue });

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : "Canvas scan failed.",
            })
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), canvasScannerPlugin()],
});
