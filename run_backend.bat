@echo off
REM Run backend from project root using backend venv
set VENV=%~dp0backend\venv\Scripts\python.exe
if not exist "%VENV%" (
  echo Virtualenv not found at %VENV%. Create venv first: python -m venv backend\venv
  exit /b 1
)
REM Local Qdrant uses a single-process storage lock, so reload mode is unsafe.
"%VENV%" -m uvicorn app.main:app --app-dir backend
