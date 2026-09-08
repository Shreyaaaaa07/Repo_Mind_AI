from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.repository import router as repository_router


app = FastAPI(
    title="RepoMind AI",
    description="AI-powered repository intelligence",
    version="1.0.0"
)


# ==================================================
# CORS
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# ROUTER
# ==================================================

app.include_router(repository_router)


# ==================================================
# ROOT
# ==================================================

@app.get("/")
def root():
    return {
        "success": True,
        "message": "RepoMind AI backend is running"
    }