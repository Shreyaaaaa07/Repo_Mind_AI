from tree_sitter import Node


class ASTExtractor:

    def __init__(self):
        self.results = []

    # ==========================================================
    # EXTRACT
    # ==========================================================

    def extract(self, root_node: Node, source_code: bytes):
        """
        Traverse the Tree-sitter AST and extract structured
        information about the source code.

        Extracted information includes:

        - node type
        - category
        - name
        - parent
        - start position
        - end position
        - actual source code
        """

        self.results = []

        self.visit(
            node=root_node,
            source_code=source_code,
            parent=None
        )

        return self.results

    # ==========================================================
    # VISIT AST
    # ==========================================================

    def visit(
        self,
        node: Node,
        source_code: bytes,
        parent=None
    ):
        """
        Recursively visit every AST node.
        """

        node_type = node.type

        # ------------------------------------------------------
        # Extract source code
        # ------------------------------------------------------

        code = source_code[
            node.start_byte:node.end_byte
        ].decode(
            "utf-8",
            errors="replace"
        )

        # ------------------------------------------------------
        # Determine category
        # ------------------------------------------------------

        category = self.get_category(
            node_type
        )

        # ------------------------------------------------------
        # Extract entity name
        # ------------------------------------------------------

        name = self.get_node_name(
            node
        )

        # ------------------------------------------------------
        # Store node
        # ------------------------------------------------------

        self.results.append({

            "type": node_type,

            "category": category,

            "name": name,

            "parent": parent,

            "start": list(node.start_point),

            "end": list(node.end_point),

            "code": code
        })

        # ------------------------------------------------------
        # Determine parent for children
        # ------------------------------------------------------

        current_parent = name

        if category == "class" and name:
            current_parent = name

        # ------------------------------------------------------
        # Visit children
        # ------------------------------------------------------

        for child in node.children:

            self.visit(
                node=child,
                source_code=source_code,
                parent=current_parent
            )

    # ==========================================================
    # NODE CATEGORY
    # ==========================================================

    def get_category(self, node_type: str):
        """
        Convert Tree-sitter node types into
        RepoMind entities.
        """

        # ------------------------------------------------------
        # Classes
        # ------------------------------------------------------

        class_types = {
            "class_definition",
            "class_declaration",
            "class_specifier",
            "class",
            "interface_declaration",
            "interface_definition",
            "enum_declaration"
        }

        if node_type in class_types:
            return "class"

        # ------------------------------------------------------
        # Methods
        # ------------------------------------------------------

        method_types = {
            "method_definition",
            "method_declaration",
            "method",
            "function_item"
        }

        if node_type in method_types:
            return "method"

        # ------------------------------------------------------
        # Functions
        # ------------------------------------------------------

        function_types = {
            "function_definition",
            "function_declaration",
            "function_item",
            "function",
            "arrow_function"
        }

        if node_type in function_types:

            if node_type == "function_item":
                return "method"

            return "function"

        # ------------------------------------------------------
        # Imports
        # ------------------------------------------------------

        import_types = {
            "import_statement",
            "import_declaration",
            "import_clause",
            "import_specifier",
            "namespace_import",
            "named_imports"
        }

        if node_type in import_types:
            return "import"

        # ------------------------------------------------------
        # Generic fallback
        # ------------------------------------------------------

        return "other"

    # ==========================================================
    # NODE NAME
    # ==========================================================

    def get_node_name(self, node: Node):
        """
        Extract the name of classes, functions and methods.

        Tree-sitter uses different field names depending
        on the programming language, so we try several
        common possibilities.
        """

        category = self.get_category(
            node.type
        )

        # ------------------------------------------------------
        # Only named entities need names
        # ------------------------------------------------------

        if category not in {
            "class",
            "function",
            "method"
        }:
            return None

        # ------------------------------------------------------
        # Common Tree-sitter field names
        # ------------------------------------------------------

        possible_fields = [
            "name",
            "declarator",
            "function",
            "left"
        ]

        for field_name in possible_fields:

            try:

                child = node.child_by_field_name(
                    field_name
                )

            except Exception:
                child = None

            if child is not None:

                name = self.extract_identifier(
                    child
                )

                if name:
                    return name

        # ------------------------------------------------------
        # Search direct children
        # ------------------------------------------------------

        for child in node.children:

            if child.type in {
                "identifier",
                "type_identifier",
                "field_identifier",
                "property_identifier",
                "namespace_identifier"
            }:

                return self.get_text(
                    child
                )

        return None

    # ==========================================================
    # EXTRACT IDENTIFIER
    # ==========================================================

    def extract_identifier(self, node: Node):
        """
        Recursively find an identifier inside a node.
        """

        identifier_types = {
            "identifier",
            "type_identifier",
            "field_identifier",
            "property_identifier",
            "namespace_identifier"
        }

        if node.type in identifier_types:

            return self.get_text(
                node
            )

        for child in node.children:

            result = self.extract_identifier(
                child
            )

            if result:
                return result

        return None

    # ==========================================================
    # GET NODE TEXT
    # ==========================================================

    def get_text(self, node: Node):
        """
        Safely obtain text represented by a Tree-sitter node.

        Tree-sitter nodes don't directly contain the source text,
        so this method is replaced by source extraction in visit().
        """

        return getattr(
            node,
            "text",
            None
        )

