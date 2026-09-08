from fastapi import APIRouter, Query
from pydantic import BaseModel
import os

from app.models.schemas import (
    RepositoryRequest,
    RepositoryPathRequest,
    CodeAnalysisRequest
)

from app.services.github_service import GitHubService
from app.parser.repository_parser import RepositoryParser
from app.parser.tree_sitter_parser import TreeSitterParser
from app.parser.ast_extractor import ASTExtractor
from app.services.indexing_service import IndexingService
from app.services.llm_service import LLMService


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/repository",
    tags=["Repository"]
)


# ============================================================
# SERVICES
# ============================================================

github_service = GitHubService()
parser = RepositoryParser()
tree_parser = TreeSitterParser()
ast_extractor = ASTExtractor()
indexing_service = IndexingService()
llm_service = LLMService()


# ============================================================
# SEARCH REQUEST
# ============================================================

class SearchRequest(BaseModel):
    query: str
    limit: int = 8
    repository_path: str = ""


def _analysis_context(request: CodeAnalysisRequest):
    repository_path = request.repository_path
    target_file = request.file_path or (
        repository_path if os.path.isfile(repository_path) else ""
    )

    if target_file:
        files = [target_file]
    elif os.path.isdir(repository_path):
        files = []
        for root, dirs, filenames in os.walk(repository_path):
            dirs[:] = [
                directory for directory in dirs
                if directory not in {
                    ".git", "node_modules", "__pycache__", ".venv",
                    "venv", "env", ".idea", ".vscode", "dist", "build",
                    ".next", "target"
                }
            ]
            for filename in sorted(filenames):
                if os.path.splitext(filename)[1].lower() in {
                    ".py", ".js", ".jsx", ".ts", ".tsx", ".java",
                    ".cpp", ".c", ".h", ".hpp", ".go", ".rs"
                }:
                    files.append(os.path.join(root, filename))
                    if len(files) >= request.max_files:
                        break
            if len(files) >= request.max_files:
                break
    else:
        return "", ""

    parts = []
    for file_path in files[:request.max_files]:
        if not os.path.isfile(file_path):
            continue
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as file:
                source = file.read()[:9000]
            ast_summary = ""
            tree = tree_parser.parse_file(file_path)
            if tree is not None:
                with open(file_path, "rb") as file:
                    chunks = ast_extractor.extract(tree.root_node, file.read())
                entities = [
                    f"{chunk.get('category')}: {chunk.get('name')} "
                    f"({chunk.get('start')}-{chunk.get('end')})"
                    for chunk in chunks
                    if chunk.get("category") != "other" and chunk.get("name")
                ][:80]
                ast_summary = "AST entities: " + ", ".join(entities)
            parts.append(f"FILE: {file_path}\n{ast_summary}\nSOURCE:\n{source}")
        except OSError:
            continue

    return "\n\n---\n\n".join(parts)[:32000], target_file or repository_path


def _run_code_analysis(request: CodeAnalysisRequest, analysis_type: str):
    if not request.repository_path:
        return {"success": False, "message": "Repository path is required."}
    if not os.path.exists(request.repository_path):
        return {"success": False, "message": "Repository path not found."}
    if request.file_path and not os.path.isfile(request.file_path):
        return {"success": False, "message": "Selected file was not found."}

    context, target = _analysis_context(request)
    result = llm_service.generate_code_analysis(analysis_type, context, target)
    return {"success": result.get("success", False), "target": target, **result}


# ============================================================
# CLONE REPOSITORY
# ============================================================

@router.post("/clone")
def clone_repository(request: RepositoryRequest):

    try:

        result = github_service.clone_repository(
            request.repo_url
        )

        return result

    except Exception as e:

        return {
            "success": False,
            "message": f"Repository cloning failed: {str(e)}"
        }


# ============================================================
# SCAN REPOSITORY
# ============================================================

@router.post("/scan")
def scan_repository(request: RepositoryPathRequest):

    repository_path = request.repository_path

    # --------------------------------------------------------
    # Validate path
    # --------------------------------------------------------

    if not repository_path:

        return {
            "success": False,
            "message": "Repository path is required."
        }

    if not os.path.exists(repository_path):

        return {
            "success": False,
            "message": f"Repository path not found: {repository_path}"
        }

    if not os.path.isdir(repository_path):

        return {
            "success": False,
            "message": "Provided path is not a repository directory."
        }

    # --------------------------------------------------------
    # Scan repository
    # --------------------------------------------------------

    try:

        files = parser.get_all_files(
            repository_path
        )

        return {

            "success": True,

            "repository_path":
                repository_path,

            "total_files":
                len(files),

            "files":
                files

        }

    except Exception as e:

        return {

            "success": False,

            "message":
                f"Repository scanning failed: {str(e)}"

        }


# ============================================================
# PARSE SINGLE FILE
# ============================================================

@router.post("/parse")
def parse_file(request: RepositoryPathRequest):

    file_path = request.repository_path

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    if not file_path:

        return {
            "success": False,
            "message": "File path is required."
        }

    if not os.path.exists(file_path):

        return {
            "success": False,
            "message": f"File not found: {file_path}"
        }

    if not os.path.isfile(file_path):

        return {
            "success": False,
            "message": "Provided path is not a file."
        }

    # --------------------------------------------------------
    # Parse
    # --------------------------------------------------------

    tree = tree_parser.parse_file(
        file_path
    )

    if tree is None:

        return {
            "success": False,
            "message": "Unsupported file type."
        }

    # --------------------------------------------------------
    # Read source
    # --------------------------------------------------------

    try:

        with open(
            file_path,
            "rb"
        ) as f:

            source_code = f.read()

    except Exception as e:

        return {
            "success": False,
            "message":
                f"Could not read file: {str(e)}"
        }

    # --------------------------------------------------------
    # Extract AST
    # --------------------------------------------------------

    try:

        ast = ast_extractor.extract(
            tree.root_node,
            source_code
        )

        return {

            "success": True,

            "file":
                file_path,

            "root_node":
                tree.root_node.type,

            "total_chunks":
                len(ast),

            "chunks":
                ast[:100]

        }

    except Exception as e:

        return {

            "success": False,

            "message":
                f"AST extraction failed: {str(e)}"

        }


# ============================================================
# FILE CONTENT
# ============================================================

@router.post("/file-content")
def get_file_content(
    request: RepositoryPathRequest
):

    file_path = request.repository_path

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    if not file_path:

        return {
            "success": False,
            "message": "File path is required."
        }

    if not os.path.exists(file_path):

        return {
            "success": False,
            "message": f"File not found: {file_path}"
        }

    if not os.path.isfile(file_path):

        return {
            "success": False,
            "message": "The provided path is not a file."
        }

    # --------------------------------------------------------
    # Read file
    # --------------------------------------------------------

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="replace"
        ) as f:

            source_code = f.read()

        extension = os.path.splitext(
            file_path
        )[1].lower()

        line_count = (
            len(source_code.splitlines())
            if source_code
            else 0
        )

        size_bytes = os.path.getsize(
            file_path
        )

        return {

            "success": True,

            "file":
                file_path,

            "file_path":
                file_path,

            "extension":
                extension,

            "line_count":
                line_count,

            "size_bytes":
                size_bytes,

            "content":
                source_code

        }

    except Exception as e:

        return {

            "success": False,

            "message":
                f"Could not read file: {str(e)}"

        }


# ============================================================
# INDEX REPOSITORY / FILE
# ============================================================

@router.post("/index")
def index_repository_or_file(
    request: RepositoryPathRequest
):

    path = request.repository_path

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    if not path:

        return {
            "success": False,
            "message": "Path is required."
        }

    if not os.path.exists(path):

        return {
            "success": False,
            "message": f"Path not found: {path}"
        }

    # --------------------------------------------------------
    # Repository
    # --------------------------------------------------------

    if os.path.isdir(path):

        try:

            return indexing_service.index_repository(
                path
            )

        except Exception as e:

            return {

                "success": False,

                "message":
                    f"Repository indexing failed: {str(e)}"

            }

    # --------------------------------------------------------
    # Single file
    # --------------------------------------------------------

    if os.path.isfile(path):

        try:

            return indexing_service.index_file(
                path
            )

        except Exception as e:

            return {

                "success": False,

                "message":
                    f"File indexing failed: {str(e)}"

            }

    return {

        "success": False,

        "message":
            f"Invalid path: {path}"

    }


# ============================================================
# VECTOR COUNT
# ============================================================

@router.get("/vector-count")
def vector_count(repository_path: str = Query(default="")):

    try:

        count = (
            indexing_service
            .vector_service
            .get_collection_count(repository_path or None)
        )

        return {

            "success": True,

            "total_vectors":
                count

        }

    except Exception as e:

        return {

            "success": False,

            "message":
                f"Could not get vector count: {str(e)}"

        }


# ============================================================
# SEMANTIC CODE SEARCH + AI
# ============================================================

@router.post("/search")
def search_code(
    request: SearchRequest
):

    try:

        # ----------------------------------------------------
        # 1. QUERY EMBEDDING
        # ----------------------------------------------------

        embeddings = (
            indexing_service
            .embedding_service
            .generate_embeddings(
                [request.query]
            )
        )

        query_embedding = embeddings[0]

        # ----------------------------------------------------
        # 2. SEARCH VECTOR DATABASE
        # ----------------------------------------------------

        result_limit = max(1, min(request.limit, 20))

        results = (
            indexing_service
            .vector_service
            .search(
                query_embedding,
                limit=result_limit,
                repository_path=request.repository_path or None
            )
        )

        # ----------------------------------------------------
        # 3. BUILD CONTEXT
        # ----------------------------------------------------

        context_parts = []

        MAX_CODE_PER_RESULT = 4000
        MAX_TOTAL_CONTEXT = 12000

        total_chars = 0

        for index, result in enumerate(results):

            payload = result.payload or {}

            file_path = payload.get(
                "file",
                "Unknown file"
            )

            node_type = payload.get(
                "type",
                "Unknown"
            )

            category = payload.get(
                "category",
                "Unknown"
            )

            name = payload.get(
                "name",
                "Unnamed"
            )

            parent = payload.get(
                "parent",
                "None"
            )

            start = payload.get(
                "start"
            )

            end = payload.get(
                "end"
            )

            code = payload.get(
                "code"
            ) or ""

            code = code[
                :MAX_CODE_PER_RESULT
            ]

            part = f"""
SOURCE #{index + 1}

File:
{file_path}

Node type:
{node_type}

Category:
{category}

Entity name:
{name}

Parent:
{parent}

Start:
{start}

End:
{end}

Actual source code:
------------------
{code}
------------------
"""

            if (
                total_chars + len(part)
                > MAX_TOTAL_CONTEXT
            ):
                break

            context_parts.append(
                part
            )

            total_chars += len(part)

        context = "\n\n".join(
            context_parts
        )

        # ----------------------------------------------------
        # 4. AI ANSWER
        # ----------------------------------------------------

        answer = llm_service.generate_answer(
            question=request.query,
            context=context
        )

        # ----------------------------------------------------
        # 5. SOURCES
        # ----------------------------------------------------

        sources = []

        for result in results:

            payload = result.payload or {}

            sources.append({

                "score":
                    float(result.score),

                "file":
                    payload.get("file"),

                "type":
                    payload.get("type"),

                "category":
                    payload.get("category"),

                "name":
                    payload.get("name"),

                "parent":
                    payload.get("parent"),

                "start":
                    (payload.get("start") or [0, 0])[0] + 1,

                "end":
                    (payload.get("end") or [0, 0])[0] + 1,

                "code":
                    payload.get("code")

            })

        # ----------------------------------------------------
        # 6. RESPONSE
        # ----------------------------------------------------

        return {

            "success": True,

            "query":
                request.query,

            "answer":
                answer,

            "sources":
                sources

        }

    except Exception as e:

        return {

            "success": False,

            "message":
                f"Semantic search failed: {str(e)}"

        }


@router.post("/bugs")
def detect_bugs(request: CodeAnalysisRequest):
    return _run_code_analysis(request, "bugs")


@router.post("/refactor")
def suggest_refactors(request: CodeAnalysisRequest):
    return _run_code_analysis(request, "refactoring")


# ============================================================
# FULL REPOSITORY ANALYSIS
# ============================================================

@router.post("/analyze")
def analyze_repository(
    request: RepositoryPathRequest
):

    repository_path = request.repository_path

    # --------------------------------------------------------
    # Validate
    # --------------------------------------------------------

    if not repository_path:

        return {

            "success": False,

            "message":
                "Repository path is required."

        }

    if not os.path.exists(
        repository_path
    ):

        return {

            "success": False,

            "message":
                f"Path not found: {repository_path}"

        }

    if not os.path.isdir(
        repository_path
    ):

        return {

            "success": False,

            "message":
                "Analysis requires a repository directory."

        }

    # --------------------------------------------------------
    # Supported extensions
    # --------------------------------------------------------

    supported_extensions = parser.supported_extensions

    # --------------------------------------------------------
    # Statistics
    # --------------------------------------------------------

    total_files = 0
    source_files = 0

    python_files = 0
    javascript_files = 0
    typescript_files = 0
    java_files = 0
    cpp_files = 0
    other_source_files = 0

    total_classes = 0
    total_functions = 0
    total_methods = 0
    total_imports = 0

    files = []

    # --------------------------------------------------------
    # Walk repository
    # --------------------------------------------------------

    for root, dirs, filenames in os.walk(
        repository_path
    ):

        # ----------------------------------------------------
        # Ignore generated / dependency folders
        # ----------------------------------------------------

        dirs[:] = [

            directory

            for directory in dirs

            if directory not in {

                ".git",
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

                "target"

            }

        ]

        # ----------------------------------------------------
        # Process files
        # ----------------------------------------------------

        for filename in filenames:

            total_files += 1

            file_path = os.path.join(
                root,
                filename
            )

            extension = os.path.splitext(
                filename
            )[1].lower()

            # ------------------------------------------------
            # Only supported source files
            # ------------------------------------------------

            if (
                extension
                not in supported_extensions
            ):
                continue

            source_files += 1

            # ------------------------------------------------
            # Language counts
            # ------------------------------------------------

            if extension == ".py":

                python_files += 1

            elif extension in {
                ".js",
                ".jsx"
            }:

                javascript_files += 1

            elif extension in {
                ".ts",
                ".tsx"
            }:

                typescript_files += 1

            elif extension == ".java":

                java_files += 1

            elif extension in {
                ".cpp",
                ".c",
                ".h",
                ".hpp"
            }:

                cpp_files += 1

            else:

                other_source_files += 1

            # ------------------------------------------------
            # Parse file when a Tree-sitter grammar is available.
            # The file still belongs in the explorer if parsing fails.
            # ------------------------------------------------

            file_classes = []
            file_functions = []
            file_methods = []
            file_imports = []

            try:

                tree = tree_parser.parse_file(
                    file_path
                )

                chunks = []
                if tree is not None:
                    with open(
                        file_path,
                        "rb"
                    ) as f:
                        source_code = f.read()

                    chunks = ast_extractor.extract(
                        tree.root_node,
                        source_code
                    )

            except Exception as e:

                print(
                    f"Failed to analyze {file_path}: {e}"
                )

                continue

            # ------------------------------------------------
            # Entities
            # ------------------------------------------------

            for chunk in chunks:

                category = chunk.get(
                    "category"
                )

                entity = {

                    "name":
                        chunk.get("name"),

                    "type":
                        chunk.get("type"),

                    "start":
                        chunk.get("start"),

                    "end":
                        chunk.get("end"),

                    "parent":
                        chunk.get("parent")

                }

                if category == "class":

                    file_classes.append(
                        entity
                    )

                elif category == "function":

                    file_functions.append(
                        entity
                    )

                elif category == "method":

                    file_methods.append(
                        entity
                    )

                elif category == "import":

                    file_imports.append(
                        entity
                    )

            # ------------------------------------------------
            # Global totals
            # ------------------------------------------------

            total_classes += len(
                file_classes
            )

            total_functions += len(
                file_functions
            )

            total_methods += len(
                file_methods
            )

            total_imports += len(
                file_imports
            )

            # ------------------------------------------------
            # File analysis
            # ------------------------------------------------

            files.append({

                "file":
                    file_path,

                "extension":
                    extension,

                "classes":
                    file_classes,

                "functions":
                    file_functions,

                "methods":
                    file_methods,

                "imports":
                    file_imports,

                "class_count":
                    len(file_classes),

                "function_count":
                    len(file_functions),

                "method_count":
                    len(file_methods),

                "import_count":
                    len(file_imports)

            })

    # --------------------------------------------------------
    # Repository name
    # --------------------------------------------------------

    repository_name = os.path.basename(
        os.path.normpath(
            repository_path
        )
    )

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {

        "success": True,

        "repository":
            repository_name,

        "repository_path":
            repository_path,

        "statistics": {

            "total_files":
                total_files,

            "source_files":
                source_files,

            "python_files":
                python_files,

            "javascript_files":
                javascript_files,

            "typescript_files":
                typescript_files,

            "java_files":
                java_files,

            "cpp_files":
                cpp_files,

            "other_source_files":
                other_source_files,

            "classes":
                total_classes,

            "functions":
                total_functions,

            "methods":
                total_methods,

            "imports":
                total_imports

        },

        "files":
            files

    }