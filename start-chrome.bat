@echo off
echo Starting Chrome with remote debugging...
echo.
echo Chrome will open on port 9222
echo Navigate to https://grok.com/imagine and login
echo Then run: npm start
echo.
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
