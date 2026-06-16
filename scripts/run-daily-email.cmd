@echo off
chcp 65001 >nul
title DailyBrief · 生成日报并发送邮箱

set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "C:\Users\zhewe\daily-brief"

echo.
echo  ========================================
echo   DailyBrief · 生成日报并发送邮箱
echo  ========================================
echo.
echo  [%date% %time%] 开始生成（约 5-8 分钟，请勿关闭窗口）...
echo.

call npm run daily
if errorlevel 1 (
    echo.
    echo  [失败] 日报生成出错，请查看 logs\daily-*.log
    echo.
    pause
    exit /b 1
)

echo.
echo  [%date% %time%] 生成完成，正在发送邮件...
echo.

call npm run notify-email
if errorlevel 1 (
    echo.
    echo  [失败] 邮件发送出错，请检查 .env.local 中的 SMTP 配置
    echo.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo   完成！请查收邮箱（含附件 HTML）
echo  ========================================
echo.
timeout /t 15 >nul
