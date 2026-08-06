@echo off
chcp 65001 >nul
title GitHub 一键强制提交工具 (WDGZ)

echo ========================================================
echo   StampMaster Pro - GitHub 代码强制覆盖更新工具
echo   目标仓库: https://github.com/lyy197673/WDGZ
echo ========================================================
echo.

:: 1. 检查 Git 是否安装
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Git 环境！请先下载安装 Git: https://git-scm.com/
    echo.
    pause
    exit /b
)

:: 2. 初始化 Git 本地仓库（若尚未初始化）
if not exist ".git" (
    echo [信息] 正在初始化本地 Git 仓库...
    git init
)

:: 3. 切换/重置本地分支为 main
git checkout -B main

:: 4. 强制重置/关联远程仓库地址
echo [信息] 正在设置远程仓库地址...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/lyy197673/WDGZ.git

:: 5. 添加当前目录下所有文件
echo [信息] 正在添加所有文件到暂存区...
git add .

:: 6. 生成提交信息并 Commit
set commit_msg=Update code - %date% %time%
echo [信息] 正在提交本地修改 [%commit_msg%]...
git commit -m "%commit_msg%"

:: 7. 强制推送到 GitHub (强制覆盖远端原有代码)
echo.
echo [警告] 正在强制覆盖推送到 GitHub 远程 main 分支...
echo ========================================================
git push -f origin main

echo ========================================================
if %errorlevel% equ 0 (
    echo.
    echo [成功] 代码已成功强制覆盖提交到 GitHub 仓库！
    echo 仓库地址: https://github.com/lyy197673/WDGZ
) else (
    echo.
    echo [失败] 推送失败！
    echo 常见原因：
    echo 1. 首次推送需输入 GitHub 账号密码/Personal Access Token 授权。
    echo 2. 本地网络无法访问 GitHub（需开启代理加速）。
)

echo.
pause