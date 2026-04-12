@echo off
REM Create the OpsFlush scheduled task
REM Run this as Administrator

SET GOOGLE_CLOUD_PROJECT=supple-synapse-470605-c5
SET GOOGLE_APPLICATION_CREDENTIALS=C:\Users\Louise\my-app\pipeline\service-account.json

schtasks /create /tn "MarketData-OpsFlush" /tr "cmd /c \"set GOOGLE_CLOUD_PROJECT=%GOOGLE_CLOUD_PROJECT%&& set GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%&& cd /d C:\Users\Louise\my-app && node scripts\flush-ops-metrics.js\"" /sc daily /st 16:10 /d MON,TUE,WED,THU,FRI /f

echo.
echo Created: MarketData-OpsFlush (daily at 4:10 PM ET, Mon-Fri)
echo Verify: schtasks /query /tn "MarketData-OpsFlush"
