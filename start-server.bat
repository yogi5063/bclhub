@echo off
cd /d D:\Perklabs-mis\fip-mis-saas
set NODE_ENV=development
set PORT=3000
set UPLOAD_DIR=D:/Perklabs-mis/Upload
for /f "tokens=2 delims==" %%a in ('findstr "JWT_SECRET" .env') do set JWT_SECRET=%%a
for /f "tokens=2 delims==" %%a in ('findstr "ANTHROPIC_API_KEY" .env') do set ANTHROPIC_API_KEY=%%a
echo Starting FIP MIS with AI CFO on port 3000...
node server/index.js
