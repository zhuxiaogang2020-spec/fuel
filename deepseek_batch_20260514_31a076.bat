@echo off
chcp 65001 >nul
title Claude Code with DeepSeek API

echo ========================================
echo   启动 Claude Code (DeepSeek 后端)
echo ========================================
echo.

:: 设置 DeepSeek API 环境变量
set ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
set ANTHROPIC_AUTH_TOKEN=sk-5f16ced3ecf94954a694352a6fd8f610
set ANTHROPIC_API_KEY=sk-5f16ced3ecf94954a694352a6fd8f610

:: 显示配置信息
echo [配置信息]
echo API地址: %ANTHROPIC_BASE_URL%
echo.
echo 按任意键启动 Claude Code ...
pause >nul

echo.
echo [启动中] 正在运行 Claude Code ...
echo.

:: 启动 claude（使用 DeepSeek-V4-Flash）
claude --model deepseek-v4-flash

echo.
echo [完成] Claude Code 已退出
pause