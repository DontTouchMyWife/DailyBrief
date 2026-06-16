# GitHub Actions 部署（含自动发邮件）

本目录是 **GitHub 云部署专用副本**，不影响本地 `C:\Users\zhewe\daily-brief`。

## 一次性设置

### 1. 登录 GitHub CLI

```powershell
gh auth login
```

按提示选：GitHub.com → HTTPS → Login with browser

### 2. 创建仓库并推送

```powershell
cd C:\Users\zhewe\daily-brief-github
pwsh scripts/setup-github.ps1
```

脚本会：
- 创建 GitHub 仓库 `DailyBrief`（若不存在）
- 从本地 `.env.local` 写入 Secrets / Variables
- 推送代码
- 手动触发第一次 workflow

### 3. 开启 Pages（首次 workflow 成功后）

仓库 → **Settings → Pages → Source** → 分支 `gh-pages` / `/ (root)`

报告地址：`https://<你的用户名>.github.io/DailyBrief/`

## 定时

- 默认 **北京时间 9:00**（`REPORT_TZ=Asia/Shanghai`, `REPORT_HOUR=9`）
- 生成报告 → **发邮件** → 发布 Pages

## Secrets 清单

| Secret | 说明 |
|--------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API |
| `SMTP_USER` | 发件 QQ 邮箱 |
| `SMTP_PASS` | QQ 邮箱授权码 |
| `NOTIFY_EMAIL_TO` | 收件人，逗号分隔 |

可选 Secrets：`SMTP_HOST`（默认 smtp.qq.com）、`SMTP_PORT`（465）、`SMTP_SECURE`（true）
