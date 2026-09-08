# Start the backend from project root using the backend venv
$venv = Join-Path $PSScriptRoot 'backend\venv\Scripts\python.exe'
if (-Not (Test-Path $venv)) {
    Write-Error "Virtualenv not found at $venv. Create venv first (python -m venv backend\venv)."
    exit 1
}

# Local Qdrant uses a single-process storage lock, so reload mode is unsafe.
& $venv -m uvicorn app.main:app --app-dir backend
