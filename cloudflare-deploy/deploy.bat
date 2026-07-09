@echo off
chcp 65001 >nul
echo ==========================================
echo   弈·棋道 - Cloudflare Pages 部署脚本
echo ==========================================
echo.

REM 检查是否已设置 API Token
if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo [!] 未检测到 CLOUDFLARE_API_TOKEN 环境变量
  echo.
  echo 请按以下步骤操作：
  echo 1. 打开 https://dash.cloudflare.com/profile/api-tokens
  echo 2. 点击 "Create Token"
  echo 3. 选择 "Edit Cloudflare Workers" 模板
  echo 4. 在 Account Settings 中选择你的账户
  echo 5. 创建后复制 Token
  echo 6. 运行以下命令设置环境变量：
  echo    set CLOUDFLARE_API_TOKEN=你的token
  echo 7. 再次运行此脚本
  echo.
  set /p token="或者现在直接粘贴你的 Token: "
  set CLOUDFLARE_API_TOKEN=%token%
)

echo.
echo [*] 第1步: 创建 Cloudflare Pages 项目...
echo.
wrangler pages project create yi-chess --production-branch main 2>nul
if %ERRORLEVEL% EQU 0 (
  echo.
  echo [√] 项目创建成功！
) else (
  echo.
  echo [*] 项目可能已存在，继续部署...
)

echo.
echo [*] 第2步: 部署游戏文件...
echo.
wrangler pages deploy cloudflare-deploy --project-name yi-chess --branch main

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ==========================================
  echo   部署成功！
  echo   你的游戏已上线 Cloudflare Pages
  echo   地址: https://yi-chess.pages.dev
  echo ==========================================
) else (
  echo.
  echo [!] 部署失败，请检查错误信息
  echo.
  echo 常见问题：
  echo - Token 权限不足: 请确保选择了 "Edit Cloudflare Workers" 模板
  echo - 项目名冲突: 请在 Cloudflare Dashboard 手动创建项目
  echo - 网络问题: 请检查网络连接后重试
)

pause
