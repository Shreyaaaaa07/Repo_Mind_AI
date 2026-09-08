from typing import Any


class CodeChunkExtractor:

    def __init__(self):
        self.chunks = []

    def extract(
        self,
        ast_nodes: list[dict[str, Any]],
        source_code: str,
        file_path: str
    ) -> list[dict[str, Any]]:

        self.chunks = []

        lines = source_code.splitlines()

        for node in ast_nodes:

            if node["type"] not in [
                "function_definition",
                "class_definition"
            ]:
                continue

            start_row = node["start"][0]
            end_row = node["end"][0]

            code_lines = lines[start_row:end_row + 1]
            code = "\n".join(code_lines)

            chunk_type = (
                "function"
                if node["type"] == "function_definition"
                else "class"
            )

            first_line = code_lines[0].strip() if code_lines else ""

            name = "unknown"

            if chunk_type == "function":
                if first_line.startswith("def "):
                    name = first_line.split("def ", 1)[1].split("(", 1)[0]

            elif chunk_type == "class":
                if first_line.startswith("class "):
                    name = first_line.split("class ", 1)[1].split("(", 1)[0]
                    name = name.split(":", 1)[0].strip()

            self.chunks.append({
                "type": chunk_type,
                "name": name,
                "file_path": file_path,
                "start_line": start_row + 1,
                "end_line": end_row + 1,
                "code": code
            })

        return self.chunks