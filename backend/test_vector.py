from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService


# Create services
embedding_service = EmbeddingService()
vector_service = VectorService()


# Example code
code = """
def calculate_sum(a, b):
    return a + b
"""


# Generate embedding
embedding = embedding_service.generate_embedding(code)

print("Embedding generated")
print("Dimensions:", len(embedding))


# Store embedding
vector_service.insert_embedding(
    point_id=1,
    embedding=embedding,
    payload={
        "file": "test.py",
        "type": "function",
        "code": code
    }
)

print("Embedding stored in Qdrant")


# Search
results = vector_service.search(
    embedding=embedding,
    limit=5
)

print("Search completed")
print("Number of results:", len(results))

for result in results:

    print("\nResult:")
    print("Score:", result.score)
    print("Payload:", result.payload)