@echo off
echo Navigating to the application directory...
cd game-launcher-app

echo.
echo Building the application...
echo This might take a moment.
call npm run build

echo.
echo Build complete. Starting the application...
call npm start

echo.
echo Application has been closed or an error occurred.
pause
