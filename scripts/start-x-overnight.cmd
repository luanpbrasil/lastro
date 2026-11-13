@echo off
setlocal
cd /d "%~dp0.."
node scripts/publish-x-issues.mjs --check-branch
if errorlevel 1 (
  echo Stop: this launcher requires feat/add-twitter-integration.
  exit /b 1
)
set "PATH=%CD%\.cache\tools\github-cli\bin;%PATH%"
set "LASTRO_GH=%CD%\.cache\tools\github-cli\bin\gh.exe"
if not exist "%LASTRO_GH%" (
  echo Stop: GitHub CLI is not available. See docs\agents\x-overnight-run.md.
  exit /b 1
)
"%LASTRO_GH%" auth status
if errorlevel 1 (
  echo Stop: complete gh auth login before leaving the run unattended.
  exit /b 1
)
call codex.cmd login status
if errorlevel 1 exit /b 1
if /i "%~1"=="--check" (
  echo Client preflight passed. Startup will publish or verify the GitHub issues.
  exit /b 0
)
node scripts/publish-x-issues.mjs
if errorlevel 1 (
  echo Stop: GitHub publication or verification failed. Inspect the output before retrying.
  exit /b 1
)
echo Starting a NEW Astra session for tickets 01, 02, 03, 04 and one final PR.
echo Keep this terminal open and the computer awake.
if /i "%~1"=="--background" (
  if not exist ".cache\x-overnight" mkdir ".cache\x-overnight"
  call codex.cmd exec --model gpt-6-astra --approve-for-me --config model_reasoning_effort=high --json --output-last-message ".cache\x-overnight\coordinator-final.md" "Read docs/agents/x-overnight-run.md and execute the authorized sequential implementation through pushing one pull request. Start ticket 01, then 02, 03, 04; continue without waiting for routine confirmations. Use the existing feature branch and fresh Astra implementation context per ticket." > ".cache\x-overnight\coordinator.jsonl" 2> ".cache\x-overnight\coordinator-errors.log"
  exit /b
)
call codex.cmd --model gpt-6-astra --approve-for-me --config model_reasoning_effort=high "Read docs/agents/x-overnight-run.md and execute the authorized sequential implementation through pushing one pull request. Start ticket 01, then 02, 03, 04; continue without waiting for routine confirmations. Use the existing feature branch and fresh Astra implementation context per ticket."
exit /b %ERRORLEVEL%
