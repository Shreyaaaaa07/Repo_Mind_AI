from pydantic import BaseModel, Field, model_validator


class RepositoryRequest(BaseModel):
    repo_url: str


class RepositoryPathRequest(BaseModel):
    repository_path: str = Field(default="")

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_file_path(cls, values):
        if isinstance(values, dict):
            values = values.copy()
            if not values.get("repository_path") and values.get("file_path"):
                values["repository_path"] = values["file_path"]
        return values


class CodeAnalysisRequest(RepositoryPathRequest):
    file_path: str = Field(default="")
    max_files: int = Field(default=8, ge=1, le=20)
