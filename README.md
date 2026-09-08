# RepoMind-AI

Project scaffold for RepoMind-AI.

## Structure

- `backend/`
  - `app/`
    - `routers/`
    - `services/`
    - `parser/`
    - `rag/`
    - `embeddings/`
    - `models/`
    - `database/`
    - `utils/`
    - `config/`
    - `main.py`
  - `requirements.txt`
  - `.env`
- `frontend/`
- `repositories/`
- `vector_db/`

## Running the backend

From the project root you can start the backend using the provided helper scripts:

PowerShell:

```powershell
.\start-backend.ps1
```

CMD:

```bat
run_backend.bat
```

Or run directly (from project root) using the virtualenv Python and Uvicorn:

```powershell
backend\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend
```

## AI code review

After a repository is analyzed and indexed, the dashboard provides:

- **Bug Detection**: potential bugs with severity, explanation, and suggested fixes.
- **Code Improvement**: refactoring suggestions with before/after guidance and impact.

The API endpoints are `POST /repository/bugs` and `POST /repository/refactor`.
Both accept `repository_path`, an optional `file_path`, and optional `max_files`.
Set `GROQ_API_KEY` in the backend environment to enable generated analysis.
