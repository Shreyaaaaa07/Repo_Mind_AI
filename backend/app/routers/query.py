# Query router placeholder

from fastapi import APIRouter

router = APIRouter()


@router.post("/query")
def run_query():
    return {"result": []}
