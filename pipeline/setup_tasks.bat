@echo off
REM =====================================================
REM Windows Task Scheduler setup for market data refresh
REM Run this script as Administrator to create scheduled tasks
REM =====================================================

SET PYTHON=py
SET SCRIPT_DIR=%~dp0
SET PIPELINE=%SCRIPT_DIR%refresh_schedule.py

REM Set environment variables for the tasks
SET POLYGON_API_KEY=RBgXtvfJpX5Ol5zVecRpwqdNjYpAjJJr
SET GOOGLE_CLOUD_PROJECT=supple-synapse-470605-c5
SET GOOGLE_APPLICATION_CREDENTIALS=%SCRIPT_DIR%service-account.json

echo =====================================================
echo Creating scheduled tasks for market data refresh
echo =====================================================

REM 1) Live snapshots: every 1 minute during market hours (Mon-Fri 9:25-16:05 ET)
REM   ~18 rows per run, ~7000 rows/day, ~$0.002/day BQ cost
schtasks /create /tn "MarketData-LiveSnapshot" /tr "cmd /c \"set POLYGON_API_KEY=%POLYGON_API_KEY%&& set GOOGLE_CLOUD_PROJECT=%GOOGLE_CLOUD_PROJECT%&& set GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%&& %PYTHON% %PIPELINE% refresh-live\"" /sc minute /mo 1 /st 09:25 /et 16:05 /d MON,TUE,WED,THU,FRI /f
echo Created: LiveSnapshot (every 1 min, market hours)

REM 2) 1-minute bars: every 15 minutes during market hours
REM   ~21K rows per symbol per run, rolling 3-day window
schtasks /create /tn "MarketData-Bars1m" /tr "cmd /c \"set POLYGON_API_KEY=%POLYGON_API_KEY%&& set GOOGLE_CLOUD_PROJECT=%GOOGLE_CLOUD_PROJECT%&& set GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%&& %PYTHON% %PIPELINE% refresh-1m\"" /sc minute /mo 15 /st 09:30 /et 16:05 /d MON,TUE,WED,THU,FRI /f
echo Created: Bars1m (every 15 min, market hours)

REM 3) Daily bars: once at 17:00 ET (after market close + settlement)
REM   ~90 rows total per run, extremely cheap
schtasks /create /tn "MarketData-Bars1d" /tr "cmd /c \"set POLYGON_API_KEY=%POLYGON_API_KEY%&& set GOOGLE_CLOUD_PROJECT=%GOOGLE_CLOUD_PROJECT%&& set GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%&& %PYTHON% %PIPELINE% refresh-1d\"" /sc daily /st 17:00 /d MON,TUE,WED,THU,FRI /f
echo Created: Bars1d (daily at 5:00 PM)

REM 4) Ops metrics flush: once at 16:10 ET (after market close)
REM   Drains recalc/invalidation/alert events from localStorage to BQ
schtasks /create /tn "MarketData-OpsFlush" /tr "cmd /c \"set GOOGLE_CLOUD_PROJECT=%GOOGLE_CLOUD_PROJECT%&& set GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%&& cd /d C:\Users\Louise\my-app && node scripts/flush-ops-metrics.js\"" /sc daily /st 16:10 /d MON,TUE,WED,THU,FRI /f
echo Created: OpsFlush (daily at 4:10 PM)

echo.
echo =====================================================
echo All tasks created. Verify with:
echo   schtasks /query /tn "MarketData-LiveSnapshot"
echo   schtasks /query /tn "MarketData-Bars1m"
echo   schtasks /query /tn "MarketData-Bars1d"
echo   schtasks /query /tn "MarketData-OpsFlush"
echo.
echo To delete tasks:
echo   schtasks /delete /tn "MarketData-LiveSnapshot" /f
echo   schtasks /delete /tn "MarketData-Bars1m" /f
echo   schtasks /delete /tn "MarketData-Bars1d" /f
echo   schtasks /delete /tn "MarketData-OpsFlush" /f
echo =====================================================
