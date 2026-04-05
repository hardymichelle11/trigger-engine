@echo off
SET POLYGON_API_KEY=RBgXtvfJpX5Ol5zVecRpwqdNjYpAjJJr
SET GOOGLE_CLOUD_PROJECT=supple-synapse-470605-c5
SET GOOGLE_APPLICATION_CREDENTIALS=C:\Users\Louise\my-app\pipeline\service-account.json
py C:\Users\Louise\my-app\pipeline\refresh_schedule.py %*
