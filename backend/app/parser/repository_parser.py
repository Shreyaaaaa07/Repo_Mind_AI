import os


class RepositoryParser:

    def __init__(self):
        self.supported_extensions = {
            ".py",
            ".js",
            ".ts",
            ".tsx",
            ".jsx",
            ".java",
            ".cpp",
            ".c",
            ".cs",
            ".go",
            ".php",
            ".rb",
            ".swift",
            ".kt",
            ".rs",
            ".html",
            ".css",
            ".sql",
            ".json",
            ".yaml",
            ".yml",
            ".md"
        }

    def get_all_files(self, repository_path: str):

        files = []

        for root, dirs, filenames in os.walk(repository_path):

            dirs[:] = [
                d for d in dirs
                if d not in {
                    ".git",
                    "__pycache__",
                    "node_modules",
                    ".venv",
                    "venv",
                    "dist",
                    "build"
                }
            ]

            for filename in filenames:

                file_path = os.path.join(root, filename)

                extension = os.path.splitext(filename)[1].lower()

                if extension in self.supported_extensions:
                    files.append(file_path)

        return files