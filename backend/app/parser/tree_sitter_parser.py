from tree_sitter_language_pack import get_parser
import os


class TreeSitterParser:

    def __init__(self):
        # Lazily attempt to load available language parsers. Missing languages
        # are skipped so imports do not fail on platforms where a language
        # runtime isn't available.
        mapping = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".tsx": "tsx",
            ".java": "java",
            ".cpp": "cpp",
            ".c": "c",
            ".go": "go",
            ".rs": "rust",
        }

        self.parsers = {}
        for ext, lang in mapping.items():
            try:
                parser = get_parser(lang)
            except Exception:
                # Language not available on this system; skip it.
                parser = None
            if parser is not None:
                self.parsers[ext] = parser

    def get_parser(self, extension: str):
        return self.parsers.get(extension)

    def parse_file(self, file_path: str):
        extension = os.path.splitext(file_path)[1]

        parser = self.get_parser(extension)

        if parser is None:
            return None

        with open(file_path, "rb") as f:
            source_code = f.read()

        tree = parser.parse(source_code)

        return tree