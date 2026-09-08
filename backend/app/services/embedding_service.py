from sentence_transformers import SentenceTransformer


class EmbeddingService:

    def __init__(self):

        # ==================================================
        # EMBEDDING MODEL
        # ==================================================

        # Model will NOT be loaded during application startup.
        # It will be loaded only when an embedding is required.
        self.model = None

        self.model_name = "all-MiniLM-L6-v2"

        # all-MiniLM-L6-v2 generates 384-dimensional
        # sentence/code embeddings.
        self.vector_size = 384

    # ==================================================
    # LAZY LOAD MODEL
    # ==================================================

    def _get_model(self):

        if self.model is None:

            print(
                "Loading embedding model..."
            )

            self.model = SentenceTransformer(
                self.model_name
            )

            print(
                "Embedding model loaded."
            )

        return self.model

    # ==================================================
    # GENERATE SINGLE EMBEDDING
    # ==================================================

    def generate_embedding(
        self,
        text: str
    ):

        """
        Convert a single text/code chunk
        into a 384-dimensional embedding vector.
        """

        if not text or not text.strip():

            raise ValueError(
                "Text cannot be empty."
            )

        model = self._get_model()

        embedding = model.encode(
            text,
            convert_to_numpy=True
        )

        # --------------------------------------------------
        # Validate dimension
        # --------------------------------------------------

        if len(embedding) != self.vector_size:

            raise ValueError(
                f"Invalid embedding dimension. "
                f"Expected {self.vector_size}, "
                f"got {len(embedding)}."
            )

        return embedding.tolist()

    # ==================================================
    # GENERATE MULTIPLE EMBEDDINGS
    # ==================================================

    def generate_embeddings(
        self,
        texts: list[str]
    ):

        """
        Convert multiple text/code chunks
        into embedding vectors.
        """

        if not texts:

            return []

        # --------------------------------------------------
        # Validate input
        # --------------------------------------------------

        for text in texts:

            if not text or not text.strip():

                raise ValueError(
                    "Embedding text cannot be empty."
                )

        # --------------------------------------------------
        # Load model only when required
        # --------------------------------------------------

        model = self._get_model()

        # --------------------------------------------------
        # Generate embeddings
        # --------------------------------------------------

        embeddings = model.encode(

            texts,

            convert_to_numpy=True,

            show_progress_bar=False

        )

        # --------------------------------------------------
        # Validate dimensions
        # --------------------------------------------------

        if embeddings.shape[1] != self.vector_size:

            raise ValueError(
                f"Invalid embedding dimension. "
                f"Expected {self.vector_size}, "
                f"got {embeddings.shape[1]}."
            )

        return embeddings.tolist()