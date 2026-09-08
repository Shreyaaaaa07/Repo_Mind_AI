# Qdrant client integration placeholder

from typing import Any


class QdrantClient:
    def __init__(self, url: str, api_key: str | None = None) -> None:
        self.url = url
        self.api_key = api_key

    def connect(self) -> None:
        pass

    def upload(self, payload: Any) -> None:
        pass
