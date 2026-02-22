import { Router } from "express";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import http from "http";
import fs from "fs";

const router = Router();

let poseProcess: ChildProcess | null = null;
const POSE_STREAM_PORT = 8765;

type LogListener = (line: string, source: "stdout" | "stderr") => void;
const logListeners = new Set<LogListener>();

function broadcastLog(line: string, source: "stdout" | "stderr") {
  logListeners.forEach((fn) => fn(line, source));
}

/**
 * Start pose_tracker.py as subprocess. Uses --stream for MJPEG web output.
 */
router.post("/start", async (req, res) => {
  if (poseProcess) {
    return res.status(400).json({ error: "Pose tracker already running" });
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const posePath = path.join(repoRoot, "backend", "pose_tracker.py");
  const workoutPath = path.join(repoRoot, "backend", "workouts", "example_day.csv");

  const venvPython =
    process.platform === "win32"
      ? path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe")
      : path.join(repoRoot, "backend", ".venv", "bin", "python");
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : process.platform === "win32" ? "python" : "python3";
  poseProcess = spawn(pythonCmd, [posePath, "--workout", workoutPath, "--stream"], {
    cwd: path.join(repoRoot, "backend"),
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  poseProcess.stdout?.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter((s: string) => s.trim());
    lines.forEach((l: string) => {
      broadcastLog(l, "stdout");
      console.log(`[pose] ${l}`);
    });
  });
  poseProcess.stderr?.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter((s: string) => s.trim());
    lines.forEach((l: string) => {
      broadcastLog(l, "stderr");
      console.error(`[pose stderr] ${l}`);
    });
  });
  poseProcess.on("exit", (code) => {
    broadcastLog(`[Process exited with code ${code}]`, "stdout");
    poseProcess = null;
    console.log(`[pose] Process exited with code ${code}`);
  });

  res.json({ ok: true, message: "Pose tracker started" });
});

/**
 * Stop the pose tracker process.
 */
router.post("/stop", (req, res) => {
  if (!poseProcess) {
    return res.json({ ok: true, message: "Not running" });
  }
  poseProcess.kill("SIGTERM");
  poseProcess = null;
  res.json({ ok: true, message: "Pose tracker stopped" });
});

/**
 * SSE stream of pose_tracker stdout/stderr.
 */
router.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const listener: LogListener = (line, source) => {
    res.write(`data: ${JSON.stringify({ line, source })}\n\n`);
  };
  logListeners.add(listener);

  if (!poseProcess) {
    res.write(`data: ${JSON.stringify({ line: "Pose tracker not running. Click Start to launch.", source: "stdout" })}\n\n`);
  }

  req.on("close", () => {
    logListeners.delete(listener);
  });
});

/**
 * Proxy MJPEG stream from pose_tracker (when --stream).
 */
router.get("/stream", (req, res) => {
  const opts = {
    hostname: "127.0.0.1",
    port: POSE_STREAM_PORT,
    path: "/stream",
    method: "GET",
  };

  const proxy = http.request(opts, (proxyRes) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Pose tracker stream not available. Start the tracker first.");
    }
  });

  req.on("close", () => proxy.destroy());
  proxy.end();
});

export { router as poseTrackerRouter };
