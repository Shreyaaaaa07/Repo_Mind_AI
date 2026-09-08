from git import Repo
import os


class GitHubService:

    def clone_repository(self, repo_url: str):

        backend_root = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..")
        )
        repositories_dir = os.path.join(backend_root, "repositories")

        # Create repositories directory if it does not exist
        if not os.path.exists(repositories_dir):
            os.makedirs(repositories_dir)

        # Extract repository name
        repo_name = (
            repo_url.rstrip("/")
            .split("/")[-1]
            .replace(".git", "")
        )

        repo_path = os.path.abspath(os.path.join(
            repositories_dir,
            repo_name
        ))

        # ==================================================
        # REPOSITORY ALREADY EXISTS
        # ==================================================

        if os.path.exists(repo_path):

            return {
                "success": True,
                "message": "Repository already exists. Using existing repository.",
                "repository_name": repo_name,
                "path": repo_path,
                "already_exists": True
            }

        # ==================================================
        # CLONE NEW REPOSITORY
        # ==================================================

        try:

            Repo.clone_from(
                repo_url,
                repo_path
            )

        except Exception as e:

            return {
                "success": False,
                "message": f"Failed to clone repository: {str(e)}"
            }

        # ==================================================
        # SUCCESS
        # ==================================================

        return {
            "success": True,
            "message": "Repository cloned successfully.",
            "repository_name": repo_name,
            "path": repo_path,
            "already_exists": False
        }