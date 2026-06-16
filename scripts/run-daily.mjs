#!/usr/bin/env node
/**
 * Scheduler wrapper for `npm run daily`. Runs the pipeline, tees stdout+stderr
 * to logs/daily-<YYYY-MM-DD>.log, and triggers email + browser on success.
 *
 * Invoked by:
 *   - Windows Task Scheduler  →  node.exe scripts\run-daily.mjs
 *   - Windows logon catch-up  →  node.exe scripts\run-daily.mjs --logon
 *   - macOS launchd            →  node scripts/run-daily.mjs
 *   - Linux cron / systemd     →  node scripts/run-daily.mjs
 *
 * Skips if today's report already exists (use --force to override).
 * --logon: only runs after DAILY_SCHEDULE_HOUR (default 9) local time.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

// Scheduled tasks often inherit a minimal PATH — ensure node/npm are reachable.
if (process.platform === "win32") {
  const extra = [
    path.dirname(process.execPath),
    path.join(process.env.ProgramFiles ?? "", "nodejs"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "nodejs"),
    path.join(process.env.APPDATA ?? "", "npm"),
  ].filter(Boolean);
  process.env.Path = [...extra, process.env.Path ?? process.env.PATH ?? ""].join(";");
  process.env.PATH = process.env.Path;
}

const forceRun = process.argv.includes("--force");
const logonRun = process.argv.includes("--logon");
const scheduleHour = Number(process.env.DAILY_SCHEDULE_HOUR ?? "9");

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.REPORT_TZ?.trim() || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localHour() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.REPORT_TZ?.trim() || undefined,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? new Date().getHours());
}

const today = todayKey();
const now = () => new Date().toTimeString().slice(0, 8);

const logDir = path.join(projectRoot, "logs");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `daily-${today}.log`);

function appendLog(line) {
  fs.appendFileSync(logFile, line);
}

const reportFile = path.join(projectRoot, "daily_reports", today, `${today}.html`);

if (!forceRun && fs.existsSync(reportFile)) {
  appendLog(`[${now()}] skip: today's report already exists (${reportFile})\n`);
  process.exit(0);
}

if (logonRun && !forceRun && localHour() < scheduleHour) {
  appendLog(
    `[${now()}] skip: logon catch-up before ${String(scheduleHour).padStart(2, "0")}:00\n`,
  );
  process.exit(0);
}

appendLog(`[${now()}] running npm run daily${logonRun ? " (logon catch-up)" : ""}\n`);

// Mirror deploy stdout/stderr into the daily log instead of the parent
// stdio (which the scheduler swallowed anyway). Returns the spawnSync result.
function spawnSyncShim(cmd, args, opts) {
  const r = spawnSync(cmd, args, { ...opts, stdio: "pipe", shell: true, env: process.env });
  const out = (r.stdout?.toString("utf8") ?? "") + (r.stderr?.toString("utf8") ?? "");
  if (out) fs.appendFileSync(logFile, out);
  return r;
}

// `shell: true` lets us write 'npm' instead of resolving npm.cmd vs npm
// across platforms. The downside (shell injection) is not a concern here
// since we're not passing user-controlled args.
const child = spawn("npm", ["run", "daily"], {
  cwd: projectRoot,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});

const logStream = fs.createWriteStream(logFile, { flags: "a" });
child.stdout.pipe(logStream);
child.stderr.pipe(logStream);

child.on("close", (code) => {
  if (code === 0) {
    fs.appendFileSync(logFile, `\n[${now()}] OK\n`);

    // Deploy to remote host (no-op if DEPLOY_HOST not set in .env.local).
    // Runs synchronously so the log captures the outcome, but a failure
    // here is non-fatal — daily.html is on disk, the user can rerun
    // `npm run deploy` later.
    fs.appendFileSync(logFile, `[${now()}] deploying…\n`);
    const deployResult = spawnSyncShim("node", ["scripts/deploy.mjs"], {
      cwd: projectRoot,
    });
    if (deployResult.status === 0) {
      fs.appendFileSync(logFile, `[${now()}] deploy OK\n`);
    } else {
      fs.appendFileSync(
        logFile,
        `[${now()}] deploy FAILED (exit ${deployResult.status}) — non-fatal, run \`npm run deploy\` to retry\n`,
      );
    }

    // Email report (no-op if SMTP_* / NOTIFY_EMAIL_TO not set in .env.local).
    fs.appendFileSync(logFile, `[${now()}] emailing…\n`);
    const emailResult = spawnSyncShim("node", ["--use-system-ca", "scripts/notify-email.mjs"], {
      cwd: projectRoot,
    });
    if (emailResult.status === 0) {
      fs.appendFileSync(logFile, `[${now()}] email OK\n`);
    } else {
      fs.appendFileSync(
        logFile,
        `[${now()}] email FAILED (exit ${emailResult.status}) — non-fatal, run \`npm run notify-email\` to retry\n`,
      );
    }

    // Detached so we don't block on Chrome's lifetime. Errors here are
    // cosmetic — the report exists on disk regardless.
    const opener = spawn("npm", ["run", "open"], {
      cwd: projectRoot,
      shell: true,
      detached: true,
      stdio: "ignore",
    });
    opener.unref();
    process.exit(0);
  } else {
    fs.appendFileSync(logFile, `\n[${now()}] FAILED: npm run daily exited ${code}\n`);
    process.exit(1);
  }
});

child.on("error", (err) => {
  fs.appendFileSync(logFile, `\n[${now()}] FAILED to spawn: ${err.message}\n`);
  process.exit(1);
});
