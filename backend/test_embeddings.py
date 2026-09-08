from app.services.embedding_service import EmbeddingService


embedding_service = EmbeddingService()

code = """
def calculate_sum(a, b):
    return a + b
"""

embedding = embedding_service.generate_embedding(code)

print("Embedding generated successfully!")
print("Vector dimensions:", len(embedding))
print("First 10 values:", embedding[:10])