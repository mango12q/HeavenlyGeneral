@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  天朝小将 · 纯本地版
echo  数据保存在本机浏览器，无需联网
echo ============================================
echo.
echo 正在启动本地服务器 (端口 8090)...
echo 启动后请用浏览器打开: http://127.0.0.1:8090/game.html
echo 按 Ctrl+C 停止服务器
echo.
start "" "http://127.0.0.1:8090/game.html"
python -m http.server 8090 --directory "%~dp0"
