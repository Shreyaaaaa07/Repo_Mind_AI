from qdrant_client import QdrantClient
from uuid import uuid4
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
    MatchValue,
    PointStruct,
    VectorParams
)


class VectorService:

    def __init__(self):

        # ==================================================
        # QDRANT CLIENT
        # ==================================================

        self.client = QdrantClient(
            path="vector_db"
        )

        # ==================================================
        # COLLECTION CONFIGURATION
        # ==================================================

        self.collection_name = "repomind_code"

        # all-MiniLM-L6-v2 produces 384-dimensional vectors
        self.vector_size = 384

        # Create collection if it does not exist
        self._create_collection()

    # ==================================================
    # CREATE COLLECTION
    # ==================================================

    def _create_collection(self):

        collections = self.client.get_collections()

        collection_names = [
            collection.name
            for collection in collections.collections
        ]

        if self.collection_name not in collection_names:

            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE
                )
            )

            print(
                f"Created Qdrant collection: "
                f"{self.collection_name}"
            )

        else:

            print(
                f"Qdrant collection already exists: "
                f"{self.collection_name}"
            )

    # ==================================================
    # INSERT EMBEDDING
    # ==================================================

    def insert_embedding(
        self,
        point_id,
        embedding,
        payload
    ):

        # --------------------------------------------------
        # Validate embedding size
        # --------------------------------------------------

        if embedding is None:

            raise ValueError(
                "Embedding cannot be None."
            )

        if len(embedding) != self.vector_size:

            raise ValueError(
                f"Invalid embedding dimension. "
                f"Expected {self.vector_size}, "
                f"got {len(embedding)}."
            )

        # --------------------------------------------------
        # Create Qdrant point
        # --------------------------------------------------

        point = PointStruct(

            id=point_id,

            vector=embedding,

            payload=payload

        )

        # --------------------------------------------------
        # Store / update point
        # --------------------------------------------------

        self.client.upsert(

            collection_name=self.collection_name,

            points=[point]

        )

        return True

    # ==================================================
    # SEARCH VECTOR DATABASE
    # ==================================================

    def search(
        self,
        embedding,
        limit=5,
        repository_path=None
    ):

        # --------------------------------------------------
        # Validate embedding
        # --------------------------------------------------

        if embedding is None:

            raise ValueError(
                "Search embedding cannot be None."
            )

        if len(embedding) != self.vector_size:

            raise ValueError(
                f"Invalid search embedding dimension. "
                f"Expected {self.vector_size}, "
                f"got {len(embedding)}."
            )

        # --------------------------------------------------
        # Search Qdrant
        # --------------------------------------------------

        query_filter = None

        if repository_path:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="repository",
                        match=MatchValue(value=repository_path)
                    )
                ]
            )

        results = self.client.query_points(

            collection_name=self.collection_name,

            query=embedding,

            limit=limit,

            query_filter=query_filter

        )

        return results.points

    # ==================================================
    # GENERATE NEXT VECTOR ID
    # ==================================================

    def get_next_id(self):
        return str(uuid4())

    # ==================================================
    # GET COLLECTION COUNT
    # ==================================================

    def get_collection_count(self, repository_path=None):

        query_filter = None

        if repository_path:
            query_filter = Filter(
                must=[
                    FieldCondition(
                        key="repository",
                        match=MatchValue(value=repository_path)
                    )
                ]
            )

        result = self.client.count(

            collection_name=self.collection_name,

            count_filter=query_filter

        )

        return result.count

    def clear_repository(self, repository_path):

        if not repository_path:
            return False

        repository_filter = Filter(
            must=[
                FieldCondition(
                    key="repository",
                    match=MatchValue(value=repository_path)
                )
            ]
        )

        self.client.delete(
            collection_name=self.collection_name,
            points_selector=FilterSelector(filter=repository_filter),
            wait=True
        )

        return True

    # ==================================================
    # DELETE ALL VECTORS
    # ==================================================

    def clear_collection(self):

        """
        Delete all vectors from the current collection
        while keeping the collection itself.
        """

        self.client.delete_collection(
            collection_name=self.collection_name
        )

        self._create_collection()

        return True