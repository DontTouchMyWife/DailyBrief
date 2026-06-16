#!/usr/bin/env node
/**
 * Email today's daily report after a successful run.
 *
 * Manual:
 *   node scripts/notify-email.mjs
 *   node scripts/notify-email.mjs 2026-06-10
 *
 * Configuration (.env.local — all required to send):
 *   SMTP_HOST=smtp.qq.com
 *   SMTP_PORT=465
 *   SMTP_SECURE=true
 *   SMTP_USER=your@qq.com
 *   SMTP_PASS=qq_authorization_code
 *   NOTIFY_EMAIL_TO=recipient@qq.com
 *
 * Optional:
 *   NOTIFY_EMAIL_ATTACH=false  skip attaching the interactive .html (default: attach)
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { flattenHtmlForEmail } from "./email-flatten.mjs";

const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.trim();
const to = process.env.NOTIFY_EMAIL_TO?.trim();

if (!user || !pass || !to) {
  console.log("[notify-email] SMTP_USER / SMTP_PASS / NOTIFY_EMAIL_TO not set — skipping");
  process.exit(0);
}

const host = process.env.SMTP_HOST?.trim() || "smtp.qq.com";
const port = Number(process.env.SMTP_PORT?.trim() || "465");
const secure = (process.env.SMTP_SECURE?.trim() || "true").toLowerCase() !== "false";

const todayLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.REPORT_TZ?.trim() || undefined,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function reportPath(d) {
  return path.join("daily_reports", d, `${d}.html`);
}

const dateArg = process.argv[2];
let date = dateArg;
let htmlFile = date ? reportPath(date) : reportPath(todayLocal);

if (!dateArg && !fs.existsSync(htmlFile)) {
  const dirs = fs
    .readdirSync("daily_reports")
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .filter((f) => fs.existsSync(reportPath(f)))
    .sort();
  if (dirs.length === 0) {
    console.error("[notify-email] no reports in daily_reports/");
    process.exit(1);
  }
  date = dirs[dirs.length - 1];
  htmlFile = reportPath(date);
  console.log(`[notify-email] today's report missing, using latest: ${date}`);
} else if (dateArg) {
  date = dateArg;
} else {
  date = todayLocal;
}

if (!fs.existsSync(htmlFile)) {
  console.error(`[notify-email] file missing: ${htmlFile}`);
  process.exit(1);
}

const interactiveHtml = fs.readFileSync(htmlFile, "utf8");
const emailHtml = flattenHtmlForEmail(interactiveHtml);
const sizeKb = (Buffer.byteLength(interactiveHtml, "utf8") / 1024).toFixed(1);
console.log(`[notify-email] sending ${htmlFile} (${sizeKb} KB) → ${to}`);

const tlsInsecure =
  (process.env.SMTP_TLS_INSECURE?.trim() || "").toLowerCase() === "true";

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  // Node 24 on Windows may not trust smtp.qq.com without --use-system-ca or this fallback.
  ...(tlsInsecure ? { tls: { rejectUnauthorized: false } } : {}),
});

const attach =
  (process.env.NOTIFY_EMAIL_ATTACH?.trim() || "true").toLowerCase() !== "false";
const mail = {
  from: `"DailyBrief" <${user}>`,
  to: to.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
  subject: `DailyBrief ${date}`,
  // Inline body: all sections expanded (email clients block JavaScript tabs).
  html: emailHtml,
  text:
    `DailyBrief ${date}\n\n` +
    `邮件正文为全文展开版。下载附件 ${date}.html 并用浏览器打开，可切换标签栏。\n\n` +
    `Local path: ${path.resolve(htmlFile)}`,
};

if (attach) {
  mail.attachments = [
    {
      filename: `${date}.html`,
      path: path.resolve(htmlFile),
      contentType: "text/html; charset=utf-8",
    },
  ];
}

try {
  const info = await transporter.sendMail(mail);
  console.log(`[notify-email] sent (${info.messageId ?? "ok"})`);
} catch (e) {
  console.error(`[notify-email] FAILED: ${e.message}`);
  process.exit(1);
}
