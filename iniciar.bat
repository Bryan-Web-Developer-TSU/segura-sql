@echo off
title SeguraSQL - Panel de pentesting SQL
cd /d "%~dp0"

echo [*] Comprobando dependencias...
python -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo [ERROR] No se pudieron instalar las dependencias.
    pause
    exit /b 1
)

echo.
echo [*] Iniciando SeguraSQL en http://127.0.0.1:8776 ...
echo [*] Pulsa Ctrl+C para detener.
echo.
python app.py

pause
