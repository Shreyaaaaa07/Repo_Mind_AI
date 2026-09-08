from app.parser.tree_sitter_parser import TreeSitterParser
from app.parser.ast_extractor import ASTExtractor
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService

import os
import hashlib
import subprocess


class IndexingService:

    def __init__(self):

        self.tree_parser = TreeSitterParser()
        self.ast_extractor = ASTExtractor()

        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()

    # ==================================================
    # INDEX SINGLE FILE
    # ==================================================

    def index_file(
        self,
        file_path: str,
        repository_path=None,
        repository_id=None,
        repository_name=None,
        commit_hash=None
    ):

        # --------------------------------------------------
        # 1. Check file exists
        # --------------------------------------------------

        if not os.path.exists(file_path):

            return {
                "success": False,
                "message": f"File not found: {file_path}"
            }

        if not os.path.isfile(file_path):

            return {
                "success": False,
                "message": f"Not a file: {file_path}"
            }

        # --------------------------------------------------
        # 2. Read source code
        # --------------------------------------------------

        try:

            with open(
                file_path,
                "rb"
            ) as f:

                source_code = f.read()

        except Exception as e:

            return {
                "success": False,
                "message": f"Could not read file: {str(e)}"
            }

        # --------------------------------------------------
        # 3. Parse using Tree-sitter
        # --------------------------------------------------

        try:

            tree = self.tree_parser.parse_file(
                file_path
            )

        except Exception as e:

            return {
                "success": False,
                "message": f"Parsing failed: {str(e)}"
            }

        if tree is None:

            return {
                "success": False,
                "message": "Unsupported file type."
            }

        # --------------------------------------------------
        # 4. Extract AST chunks
        # --------------------------------------------------

        try:

            chunks = self.ast_extractor.extract(
                tree.root_node,
                source_code
            )

        except Exception as e:

            return {
                "success": False,
                "message": f"AST extraction failed: {str(e)}"
            }

        if not chunks:

            return {
                "success": False,
                "message": "No code chunks found."
            }

        # --------------------------------------------------
        # 5. Prepare embedding text
        #
        # IMPORTANT:
        # Include metadata + code.
        # --------------------------------------------------

        texts = []
        valid_chunks = []

        meaningful_categories = {
            "class",
            "function",
            "method",
            "import"
        }

        meaningful_chunks = [
            chunk
            for chunk in chunks
            if chunk.get("category") in meaningful_categories
        ]

        chunks_to_index = (
            meaningful_chunks[:200]
            if meaningful_chunks
            else chunks[:50]
        )

        for chunk in chunks_to_index:

            code = chunk.get("code", "")

            if not code or not code.strip():
                continue

            node_type = chunk.get(
                "type",
                "unknown"
            )

            start = chunk.get(
                "start",
                ""
            )

            end = chunk.get(
                "end",
                ""
            )

            # --------------------------------------------------
            # Limit extremely large chunks
            # --------------------------------------------------

            MAX_CODE_LENGTH = 6000

            code_for_embedding = code[:MAX_CODE_LENGTH]

            embedding_text = f"""
Repository source code.

File: {file_path}
Language: {os.path.splitext(file_path)[1].lower().lstrip('.')}
Category: {chunk.get("category", "unknown")}
Name: {chunk.get("name") or "unnamed"}
Parent: {chunk.get("parent") or "none"}
Node type: {node_type}
Start line: {start}
End line: {end}

Code:
{code_for_embedding}
"""

            texts.append(
                embedding_text
            )

            valid_chunks.append(
                chunk
            )

        if not texts:

            return {
                "success": False,
                "message": "Chunks do not contain usable code."
            }

        # --------------------------------------------------
        # 6. Generate embeddings
        # --------------------------------------------------

        try:

            embeddings = (
                self.embedding_service
                .generate_embeddings(
                    texts
                )
            )

        except Exception as e:

            return {
                "success": False,
                "message": (
                    f"Embedding generation failed: {str(e)}"
                )
            }

        # --------------------------------------------------
        # 7. Store vectors in Qdrant
        # --------------------------------------------------

        stored = 0

        failed = 0

        for chunk, embedding in zip(
            valid_chunks,
            embeddings
        ):

            try:

                point_id = (
                    self.vector_service
                    .get_next_id()
                )

                payload = {

                    "file": file_path,

                    "repository": repository_path,

                    "repository_id": repository_id,

                    "repository_name": repository_name,

                    "commit_hash": commit_hash,

                    "file_path": file_path,

                    "language": os.path.splitext(file_path)[1].lower().lstrip("."),

                    "category": chunk.get("category"),

                    "name": chunk.get("name"),

                    "parent": chunk.get("parent"),

                    "type": chunk.get(
                        "type"
                    ),

                    "start": chunk.get(
                        "start"
                    ),

                    "end": chunk.get(
                        "end"
                    ),

                    "code": chunk.get(
                        "code"
                    )

                }

                self.vector_service.insert_embedding(

                    point_id=point_id,

                    embedding=embedding,

                    payload=payload

                )

                stored += 1

            except Exception as e:

                failed += 1

                print(
                    f"Failed to store vector "
                    f"for {file_path}: {str(e)}"
                )

        # --------------------------------------------------
        # 8. Return result
        # --------------------------------------------------

        return {

            "success": True,

            "file": file_path,

            "total_chunks": len(chunks),

            "valid_code_chunks": len(valid_chunks),

            "embeddings_generated": len(embeddings),

            "stored_in_qdrant": stored,

            "failed_vectors": failed

        }

    # ==================================================
    # INDEX ENTIRE REPOSITORY
    # ==================================================

    def index_repository(
        self,
        repository_path: str
    ):

        # --------------------------------------------------
        # 1. Validate repository
        # --------------------------------------------------

        if not os.path.exists(
            repository_path
        ):

            return {

                "success": False,

                "message":
                    f"Repository not found: "
                    f"{repository_path}"

            }

        if not os.path.isdir(
            repository_path
        ):

            return {

                "success": False,

                "message":
                    f"Path is not a directory: "
                    f"{repository_path}"

            }

        self.vector_service.clear_repository(repository_path)

        repository_name = os.path.basename(
            os.path.normpath(repository_path)
        )
        repository_id = hashlib.sha256(
            os.path.abspath(repository_path).lower().encode("utf-8")
        ).hexdigest()[:16]
        commit_hash = self.get_commit_hash(repository_path)

        # --------------------------------------------------
        # 2. Supported extensions
        # --------------------------------------------------

        supported_extensions = {

            ".py",
            ".js",
            ".ts",
            ".tsx",
            ".jsx",

            ".java",

            ".cpp",
            ".cc",
            ".cxx",
            ".c",
            ".h",
            ".hpp",

            ".go",

            ".rs"

        }

        # --------------------------------------------------
        # 3. Directories to ignore
        # --------------------------------------------------

        ignored_directories = {

            ".git",
            ".github",

            "node_modules",

            "__pycache__",

            ".venv",
            "venv",
            "env",

            ".idea",
            ".vscode",

            "dist",
            "build",

            ".next",

            "coverage"

        }

        # --------------------------------------------------
        # 4. Find source files
        # --------------------------------------------------

        files = []

        for root, dirs, filenames in os.walk(
            repository_path
        ):

            # Modify dirs in-place so os.walk
            # does not enter ignored directories.

            dirs[:] = [

                directory

                for directory in dirs

                if directory
                not in ignored_directories

            ]

            for filename in filenames:

                extension = os.path.splitext(
                    filename
                )[1].lower()

                if extension not in supported_extensions:
                    continue

                file_path = os.path.join(
                    root,
                    filename
                )

                files.append(
                    file_path
                )

        # --------------------------------------------------
        # 5. Index files
        # --------------------------------------------------

        results = []

        successful_files = 0
        failed_files = 0

        total_chunks = 0
        total_embeddings = 0
        total_stored = 0

        # --------------------------------------------------
        # Sort files for predictable indexing
        # --------------------------------------------------

        files.sort()

        for index, file_path in enumerate(
            files,
            start=1
        ):

            print(
                f"[{index}/{len(files)}] "
                f"Indexing: {file_path}"
            )

            result = self.index_file(
                file_path,
                repository_path=repository_path,
                repository_id=repository_id,
                repository_name=repository_name,
                commit_hash=commit_hash
            )

            results.append(
                result
            )

            if result.get(
                "success",
                False
            ):

                successful_files += 1

                total_chunks += result.get(
                    "valid_code_chunks",
                    0
                )

                total_embeddings += result.get(
                    "embeddings_generated",
                    0
                )

                total_stored += result.get(
                    "stored_in_qdrant",
                    0
                )

            else:

                failed_files += 1

        # --------------------------------------------------
        # 6. Return final result
        # --------------------------------------------------

        return {

            "success": True,

            "repository":
                repository_path,

            "repository_id": repository_id,

            "repository_name": repository_name,

            "commit_hash": commit_hash,

            "total_source_files":
                len(files),

            "successful_files":
                successful_files,

            "failed_files":
                failed_files,

            "total_chunks":
                total_chunks,

            "total_embeddings":
                total_embeddings,

            "total_vectors_stored":
                total_stored,

            "files":
                results

        }

    def get_commit_hash(self, repository_path):
        try:
            result = subprocess.run(
                ["git", "-C", repository_path, "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip() or None
        except (OSError, subprocess.CalledProcessError):
            return None