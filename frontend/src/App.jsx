import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";
const HISTORY_KEY = "repomind_repository_history";

function App() {
  // ============================================================
  // CORE STATE
  // ============================================================

  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [repository, setRepository] = useState(null);
  const [repositoryPath, setRepositoryPath] = useState("");
  const [statistics, setStatistics] = useState(null);
  const [files, setFiles] = useState([]);
  const [vectorCount, setVectorCount] = useState(0);
  const [, setIndexing] = useState(false);

  const [activeView, setActiveView] = useState("overview");
  const [history, setHistory] = useState(() => {
    try {
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      const parsed = savedHistory ? JSON.parse(savedHistory) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiSources, setAiSources] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const [codeAnalysisLoading, setCodeAnalysisLoading] = useState(false);
  const [bugAnalysis, setBugAnalysis] = useState(null);
  const [bugAnalysisError, setBugAnalysisError] = useState("");
  const [refactorAnalysis, setRefactorAnalysis] = useState(null);
  const [refactorAnalysisError, setRefactorAnalysisError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      console.error("History saving error:", err);
    }
  }, [history]);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const saveToHistory = ({ url, repositoryName, path, statistics: repoStatistics, files: repoFiles }) => {
    const normalizedUrl = url.trim().toLowerCase();
    const historyItem = {
      id: `${repositoryName}-${normalizedUrl}`,
      repository: repositoryName,
      url: url.trim(),
      path,
      statistics: repoStatistics,
      files: repoFiles || [],
      analyzedAt: new Date().toISOString()
    };

    setHistory((previousHistory) => [
      historyItem,
      ...previousHistory.filter((item) => item.url?.trim().toLowerCase() !== normalizedUrl)
    ].slice(0, 10));
  };

  const removeFromHistory = (historyId) => {
    setHistory((previousHistory) => previousHistory.filter((item) => item.id !== historyId));
  };

  const clearHistory = () => setHistory([]);

  const formatHistoryDate = (dateString) => {
    if (!dateString) return "Unknown";
    try {
      return new Date(dateString).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch {
      return "Unknown";
    }
  };

  const resetRepositoryState = () => {
    setRepository(null);
    setRepositoryPath("");
    setStatistics(null);
    setFiles([]);
    setVectorCount(0);
    setIndexing(false);
    setSelectedFile(null);
    setFileContent("");
    setFileError("");
    setSearchResults([]);
    setSearchAnswer("");
    setAiAnswer("");
    setAiSources([]);
    setBugAnalysis(null);
    setBugAnalysisError("");
    setRefactorAnalysis(null);
    setRefactorAnalysisError("");
  };

  const openHistoryRepository = (item) => {
    if (!item) return;
    setRepoUrl(item.url || "");
    setRepository(item.repository || null);
    setRepositoryPath(item.path || "");
    setStatistics(item.statistics || null);
    setFiles(Array.isArray(item.files) ? item.files : []);
    setSelectedFile(null);
    setFileContent("");
    setFileError("");
    setSearchQuery("");
    setSearchResults([]);
    setSearchAnswer("");
    setQuestion("");
    setAiAnswer("");
    setAiSources([]);
    setBugAnalysis(null);
    setBugAnalysisError("");
    setRefactorAnalysis(null);
    setRefactorAnalysisError("");
    setMessage("Repository loaded from local history.");
    setError("");
    setActiveView("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ============================================================
  // API JSON HELPER
  // ============================================================

  const getJsonResponse = async (response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  // ============================================================
  // ANALYZE REPOSITORY
  // ============================================================

  const analyzeRepository = async () => {
    const url = repoUrl.trim();

    // ----------------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------------

    if (!url) {
      setError(
        "Please enter a GitHub repository URL."
      );
      return;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      setError(
        "Please enter a valid GitHub repository URL."
      );
      return;
    }

    if (
      parsedUrl.hostname !== "github.com" &&
      parsedUrl.hostname !== "www.github.com"
    ) {
      setError(
        "Please enter a valid GitHub repository URL."
      );
      return;
    }

    const pathParts = parsedUrl.pathname
      .split("/")
      .filter(Boolean);

    if (pathParts.length < 2) {
      setError(
        "Please enter a complete GitHub repository URL."
      );
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    resetRepositoryState();

    try {
      // ========================================================
      // STEP 1 — CLONE / CONNECT
      // ========================================================

      setMessage(
        "Connecting to GitHub repository..."
      );

      console.log(
        "STEP 1: Cloning repository:",
        url
      );

      const cloneResponse = await fetch(
        `${API_BASE}/repository/clone`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            repo_url: url
          })
        }
      );

      const cloneData =
        await getJsonResponse(cloneResponse);

      console.log(
        "Clone response:",
        cloneData
      );

      if (!cloneResponse.ok) {
        throw new Error(
          cloneData.message ||
            `Repository connection failed (${cloneResponse.status})`
        );
      }

      /*
       * Backend may return:
       *
       * {
       *   success: true,
       *   path: "..."
       * }
       *
       * OR:
       *
       * {
       *   success: false,
       *   message: "Repository already exists...",
       *   path: "..."
       * }
       */

      const alreadyExists =
        typeof cloneData.message === "string" &&
        cloneData.message
          .toLowerCase()
          .includes("already exists");

      if (
        cloneData.success === false &&
        !alreadyExists
      ) {
        throw new Error(
          cloneData.message ||
            "Repository cloning failed."
        );
      }

      if (alreadyExists) {
        setMessage(
          "Repository already exists locally. Continuing analysis..."
        );
      }

      // --------------------------------------------------------
      // IMPORTANT:
      // Backend may return either repository_path or path.
      // --------------------------------------------------------

      const path =
        cloneData.repository_path ||
        cloneData.path ||
        cloneData.repo_path;

      if (!path) {
        console.error(
          "Clone response did not contain a path:",
          cloneData
        );

        throw new Error(
          "Repository path was not returned by the backend."
        );
      }

      console.log(
        "Repository path:",
        path
      );

      setRepositoryPath(path);

      // ========================================================
      // STEP 2 — SCAN
      // ========================================================

      setMessage(
        "Scanning repository files..."
      );

      console.log(
        "STEP 2: Scanning repository:",
        path
      );

      /*
       * IMPORTANT FIX
       *
       * OLD CODE:
       *
       * body: JSON.stringify({
       *   file_path: 
       * })
       *
       * selectedFile is null here.
       *
       * CORRECT:
       *
       * Send the repository path returned by clone.
       */

      const scanResponse =
        await fetch(
          `${API_BASE}/repository/scan`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              repository_path: path
            })
          }
        );

      const scanData =
        await getJsonResponse(scanResponse);

      console.log(
        "Scan response:",
        scanData
      );

      if (!scanResponse.ok) {
        throw new Error(
          scanData.message ||
            `Repository scan failed (${scanResponse.status})`
        );
      }

      if (
        scanData.success === false
      ) {
        throw new Error(
          scanData.message ||
            "Repository scan failed."
        );
      }

      // ========================================================
      // STEP 3 — ANALYZE
      // ========================================================

      setMessage(
        "Analyzing files, classes, functions and dependencies..."
      );

      console.log(
        "STEP 3: Analyzing repository:",
        path
      );

      const analyzeResponse =
        await fetch(
          `${API_BASE}/repository/analyze`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              repository_path: path
            })
          }
        );

      const analyzeData =
        await getJsonResponse(
          analyzeResponse
        );

      console.log(
        "Analyze response:",
        analyzeData
      );

      if (!analyzeResponse.ok) {
        throw new Error(
          analyzeData.message ||
            `Repository analysis failed (${analyzeResponse.status})`
        );
      }

      if (
        analyzeData.success === false
      ) {
        throw new Error(
          analyzeData.message ||
            "Repository analysis failed."
        );
      }

      // ========================================================
      // REPOSITORY NAME
      // ========================================================

      const repositoryName =
        analyzeData.repository ||
        analyzeData.repository_name ||
        getRepositoryNameFromUrl(url);

      // ========================================================
      // STATISTICS
      // ========================================================

      const repoStatistics =
        analyzeData.statistics || {
          total_files: 0,
          source_files: 0,
          python_files: 0,
          javascript_files: 0,
          typescript_files: 0,
          java_files: 0,
          cpp_files: 0,
          other_source_files: 0,
          classes: 0,
          functions: 0,
          methods: 0,
          imports: 0
        };

      // ========================================================
      // FILES
      // ========================================================

      const repoFiles =
        Array.isArray(analyzeData.files) &&
        analyzeData.files.length > 0
          ? analyzeData.files
          : (Array.isArray(scanData.files)
            ? scanData.files.map((filePath) => ({
              file: filePath,
              extension: getExtension(filePath),
              classes: [],
              functions: [],
              methods: [],
              imports: [],
              class_count: 0,
              function_count: 0,
              method_count: 0,
              import_count: 0
            }))
            : []);

      console.log(
        "Repository:",
        repositoryName
      );

      console.log(
        "Files discovered:",
        repoFiles.length
      );

      // ========================================================
      // UPDATE UI
      // ========================================================

      setRepository(
        repositoryName
      );

      setRepositoryPath(
        path
      );

      setStatistics(
        repoStatistics
      );

      setFiles(
        repoFiles
      );

      // Index the parsed repository before presenting it as ready.
      setIndexing(true);
      setMessage("Indexing code chunks and generating embeddings...");

      const indexResponse = await fetch(
        `${API_BASE}/repository/index`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            repository_path: path
          })
        }
      );

      const indexData = await getJsonResponse(indexResponse);

      if (!indexResponse.ok || indexData.success === false) {
        throw new Error(
          indexData.message ||
            `Repository indexing failed (${indexResponse.status})`
        );
      }

      const vectorResponse = await fetch(
        `${API_BASE}/repository/vector-count?repository_path=${encodeURIComponent(path)}`
      );
      const vectorData = await getJsonResponse(vectorResponse);

      if (!vectorResponse.ok || vectorData.success === false) {
        throw new Error(
          vectorData.message ||
            `Vector count failed (${vectorResponse.status})`
        );
      }

      setVectorCount(vectorData.total_vectors || 0);
      setIndexing(false);

      setSelectedFile(null);
      setFileContent("");
      setFileError("");

      setActiveView(
        "overview"
      );

      // ========================================================
      // SAVE HISTORY
      // ========================================================

      saveToHistory({
        url,
        repositoryName,
        path,
        statistics:
          repoStatistics,
        files: repoFiles
      });

      setMessage(
        `Analysis complete. ${repoFiles.length} source files indexed.`
      );

    } catch (err) {
      console.error(
        "Repository analysis error:",
        err
      );

      setError(
        err.message ||
          "Could not connect to RepoMind AI backend."
      );

      setMessage("");

    } finally {
      setIndexing(false);
      setLoading(false);
    }
  };

  // ============================================================
  // ENTER KEY
  // ============================================================

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !loading
    ) {
      event.preventDefault();
      analyzeRepository();
    }
  };

  // ============================================================
  // LOAD FILE CONTENT
  // ============================================================

  const loadFileContent = async (
    filePath
  ) => {
    if (!filePath) {
      return;
    }

    setSelectedFile(
      (previous) => ({
        ...(previous || {}),
        file: filePath,
        extension:
          getExtension(filePath)
      })
    );

    setFileContent("");
    setFileError("");
    setFileLoading(true);

    try {
      console.log(
        "Loading file:",
        filePath
      );

      const response =
        await fetch(
          `${API_BASE}/repository/file-content`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              /*
               * Sending both makes this frontend
               * compatible with either backend naming.
               */
              repository_path: filePath
            })
          }
        );

      const data =
        await getJsonResponse(
          response
        );

      console.log(
        "File content response:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Could not load file (${response.status})`
        );
      }

      if (
        data.success === false
      ) {
        throw new Error(
          data.message ||
            "Could not load file."
        );
      }

      setFileContent(
        data.content ||
        data.file_content ||
        ""
      );

    } catch (err) {
      console.error(
        "File content error:",
        err
      );

      setFileError(
        err.message ||
          "Could not load file."
      );

    } finally {
      setFileLoading(false);
    }
  };

  // ============================================================
  // OPEN FILE
  // ============================================================

  const openFile = async (file) => {
    if (!file?.file) {
      return;
    }

    setActiveView("files");
    setSelectedFile(file);

    await loadFileContent(
      file.file
    );
  };

  const openFileInExplanation = async (file) => {
    if (!file?.file) {
      return;
    }

    setSelectedFile(file);
    await loadFileContent(file.file);
  };

  const openFileForBugDetection = async (file) => {
    if (!file?.file) {
      return;
    }

    setSelectedFile(file);
    setBugAnalysis(null);
    setBugAnalysisError("");
    await loadFileContent(file.file);
    await runCodeAnalysis("bugs", file);
  };

  const openFileForRefactor = async (file) => {
    if (!file?.file) {
      return;
    }

    setSelectedFile(file);
    setRefactorAnalysis(null);
    setRefactorAnalysisError("");
    await loadFileContent(file.file);
    await runCodeAnalysis("refactor", file);
  };

  // ============================================================
  // SEMANTIC SEARCH
  // ============================================================

  const performSearch = async () => {
    const query =
      searchQuery.trim();

    if (!query) {
      return;
    }

    setSearchLoading(true);
    setSearchResults([]);
    setSearchAnswer("");
    setError("");

    try {
      const response =
        await fetch(
          `${API_BASE}/repository/search`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              query,
                limit: 8,
                repository_path: repositoryPath
            })
          }
        );

      const data =
        await getJsonResponse(
          response
        );

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Semantic search failed."
        );
      }

      if (
        data.success === false
      ) {
        throw new Error(
          data.message ||
            "Semantic search failed."
        );
      }

      setSearchResults(
        Array.isArray(
          data.sources
        )
          ? data.sources
          : []
      );

      setSearchAnswer(
        data.answer || ""
      );

    } catch (err) {
      console.error(
        "Semantic search error:",
        err
      );

      setError(
        err.message ||
          "Semantic search failed."
      );

    } finally {
      setSearchLoading(false);
    }
  };

  // ============================================================
  // ASK REPO
  // ============================================================

  const askRepoMind = async () => {
    const query =
      question.trim();

    if (!query) {
      return;
    }

    setAiLoading(true);
    setAiAnswer("");
    setAiSources([]);
    setError("");

    try {
      const response =
        await fetch(
          `${API_BASE}/repository/search`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              query,
                limit: 8,
                repository_path: repositoryPath
            })
          }
        );

      const data =
        await getJsonResponse(
          response
        );

      if (!response.ok) {
        throw new Error(
          data.message ||
            "AI request failed."
        );
      }

      if (
        data.success === false
      ) {
        throw new Error(
          data.message ||
            "AI request failed."
        );
      }

      setAiAnswer(
        data.answer || ""
      );

      setAiSources(
        Array.isArray(
          data.sources
        )
          ? data.sources
          : []
      );

    } catch (err) {
      console.error(
        "Ask RepoMind error:",
        err
      );

      setError(
        err.message ||
          "Could not get AI response."
      );

    } finally {
      setAiLoading(false);
    }
  };

  const runCodeAnalysis = async (analysisType, targetFile = selectedFile) => {
    if (!repositoryPath) {
      setError("Analyze a repository before running code analysis.");
      return;
    }

    setCodeAnalysisLoading(true);
    setError("");
    if (analysisType === "bugs") {
      setBugAnalysisError("");
    } else {
      setRefactorAnalysisError("");
    }

    try {
      const request = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository_path: repositoryPath,
          file_path: targetFile?.file || "",
          max_files: 8
        })
      };
      let response;

      try {
        response = await fetch(`${API_BASE}/repository/${analysisType}`, request);
      } catch (firstError) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        response = await fetch(`${API_BASE}/repository/${analysisType}`, request);
      }
      const data = await getJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || `Could not run ${analysisType} analysis.`
        );
      }

      if (analysisType === "bugs") {
        setBugAnalysis(data);
      } else {
        setRefactorAnalysis(data);
      }
    } catch (err) {
      if (analysisType === "bugs") {
        setBugAnalysisError(err.message || "Bug detection failed.");
      } else {
        setRefactorAnalysisError(err.message || "Code improvement review failed.");
      }
      setError(err.message || "Code analysis failed.");
    } finally {
      setCodeAnalysisLoading(false);
    }
  };

  // ============================================================
  // NAVIGATION
  // ============================================================

  const navigate = (view) => {
    setActiveView(view);
    setError("");
  };

  // ============================================================
  // FILE ICON
  // ============================================================

  const getFileIcon = (
    extension
  ) => {
    switch (
      extension?.toLowerCase()
    ) {
      case ".py":
        return "PY";

      case ".js":
      case ".jsx":
        return "JS";

      case ".ts":
      case ".tsx":
        return "TS";

      case ".java":
        return "JV";

      case ".cpp":
        return "C++";

      case ".c":
        return "C";

      case ".go":
        return "GO";

      case ".rs":
        return "RS";

      case ".json":
        return "{}";

      case ".html":
        return "HTML";

      case ".css":
        return "CSS";

      case ".md":
        return "MD";

      default:
        return "FILE";
    }
  };

  // ============================================================
  // LANGUAGE NAME
  // ============================================================

  const getLanguageName = (
    extension
  ) => {
    switch (
      extension?.toLowerCase()
    ) {
      case ".py":
        return "Python";

      case ".js":
      case ".jsx":
        return "JavaScript";

      case ".ts":
      case ".tsx":
        return "TypeScript";

      case ".java":
        return "Java";

      case ".cpp":
        return "C++";

      case ".c":
        return "C";

      case ".go":
        return "Go";

      case ".rs":
        return "Rust";

      case ".json":
        return "JSON";

      case ".html":
        return "HTML";

      case ".css":
        return "CSS";

      case ".md":
        return "Markdown";

      default:
        return "Other";
    }
  };

  // ============================================================
  // LANGUAGE STATISTICS
  // ============================================================

  const languageList =
    useMemo(() => {
      const counts = {};

      files.forEach(
        (file) => {
          const language =
            getLanguageName(
              file.extension
            );

          counts[language] =
            (counts[language] ||
              0) + 1;
        }
      );

      return Object.entries(
        counts
      ).sort(
        (a, b) =>
          b[1] - a[1]
      );
    }, [files]);

  // ============================================================
  // TOTAL ENTITIES
  // ============================================================

  const totalEntities =
    (statistics?.classes ||
      0) +
    (statistics?.functions ||
      0) +
    (statistics?.methods ||
      0);

  // ============================================================
  // LANDING PAGE
  // ============================================================

  if (!repository) {
    return (
      <div className="app">

        <header className="header landing-header">

          <div className="logo landing-logo">

            <div className="logo-mark">
              <span>R</span>
            </div>

            <div className="brand-text">

              <h1>
                Repo Mind - AI
              </h1>

              <p>
                AI Codebase Intelligence
              </p>

            </div>

          </div>

          <nav className="landing-nav" aria-label="Primary navigation">
            <span className="landing-nav-active">⌂ Home</span>
          </nav>

          <div className="status landing-status">

            <span className="status-dot"></span>

            Backend Connected

          </div>

        </header>

        <main className="main landing-main">

          <section className="hero landing-hero">

            <div className="hero-badge">

              <span></span>

              AI CODEBASE INTELLIGENCE

            </div>

            <div className="landing-hero-grid">
              <div className="landing-hero-copy">
                <h2>
                  <strong>RepoMind<span>-AI</span></strong>
                  <small>AI CODEBASE INTELLIGENCE</small>
                  Understand any <em>codebase.</em>
                </h2>

                <p>
                  Analyze, search, and transform your repositories with the power of AI.<br />
                  Get instant insights, find what matters, and understand your codebase.
                </p>
              </div>

              <div className="landing-visual" aria-label="Repository intelligence preview">
                <div className="landing-orbit orbit-one"></div>
                <div className="landing-orbit orbit-two"></div>
                <div className="landing-code-window">
                  <div className="landing-window-bar"><i></i><i></i><i></i><span>repository / intelligence</span></div>
                  <div className="landing-code-lines"><b>import</b> repository <b>from</b> "./core"<br /><mark>analyze</mark>(codebase)<br />&nbsp;&nbsp;→ map_dependencies()<br />&nbsp;&nbsp;→ explain_code()<br />&nbsp;&nbsp;→ detect_risks()</div>
                  <div className="landing-ai-node">✦</div>
                </div>
                <span className="landing-float float-left">Better<br />Code.</span>
                <span className="landing-float float-right">Smarter<br />Decisions.</span>
              </div>
            </div>

            <div className="landing-capabilities">
              <span>⌕ Smart Analysis</span>
              <span>▣ Code Search</span>
              <span>♧ Bug Detection</span>
              <span>↗ Refactoring</span>
              <span>▤ Repo Insights</span>
            </div>

            {/* ==================================================
                REPOSITORY INPUT
            ================================================== */}

            <div className="repository-input">

              <label htmlFor="repo-url">
                GITHUB REPOSITORY
              </label>

              <div className="input-wrapper">

                <span className="input-prefix">
                  git
                </span>

                <input
                  id="repo-url"
                  type="text"
                  value={repoUrl}
                  onChange={(event) =>
                    setRepoUrl(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  placeholder="https://github.com/username/project"
                  disabled={loading}
                />

              </div>

              <button
                className="analyze-button"
                onClick={
                  analyzeRepository
                }
                disabled={loading}
              >
                {loading
                  ? "Analyzing Repository..."
                  : "Analyze Repository →"}
              </button>

            </div>

            <div className="landing-steps">
              <div><b>◉</b><strong>1. Clone</strong><small>Fetch repository from GitHub</small></div>
              <span>→</span>
              <div><b>‹/›</b><strong>2. Analyze</strong><small>Parse, index and understand</small></div>
              <span>→</span>
              <div><b>✦</b><strong>3. Understand</strong><small>Get AI-powered insights</small></div>
            </div>

            <div className="landing-feature-grid">
              <div><b>♧</b><strong>AST Analysis</strong><small>Deep code structure understanding using AST.</small></div>
              <div><b>⌕</b><strong>Semantic Search</strong><small>Find relevant code using natural language.</small></div>
              <div><b>✦</b><strong>Code Intelligence</strong><small>Get answers about your codebase.</small></div>
              <div><b>▤</b><strong>Dependency Mapping</strong><small>Visualize and understand project dependencies.</small></div>
              <div><b>✧</b><strong>AI Understanding</strong><small>Get refactoring suggestions and better code.</small></div>
            </div>

            {/* ==================================================
                MESSAGE
            ================================================== */}

            {message && (
              <div className="success-card">

                <div className="alert-icon">
                  ✓
                </div>

                <div>

                  <strong>
                    Repository Analysis
                  </strong>

                  <p>
                    {message}
                  </p>

                </div>

              </div>
            )}

            {/* ==================================================
                ERROR
            ================================================== */}

            {error && (
              <div className="error-card">

                <div className="alert-icon">
                  !
                </div>

                <div>

                  <strong>
                    Analysis Error
                  </strong>

                  <p>
                    {error}
                  </p>

                </div>

              </div>
            )}

            {/* ==================================================
                FEATURES
            ================================================== */}

            <div className="hero-features">

              <span>
                AST Analysis
              </span>

              <span>
                Semantic Search
              </span>

              <span>
                Code Intelligence
              </span>

              <span>
                Dependency Mapping
              </span>

              <span>
                AI Understanding
              </span>

            </div>

            {/* ==================================================
                HISTORY
            ================================================== */}

            {history.length > 0 && (
              <div className="landing-history">

                <div className="landing-history-header">

                  <div>

                    <span className="eyebrow">
                      RECENT REPOSITORIES
                    </span>

                    <h3>
                      Continue where you left off
                    </h3>

                  </div>

                  <button
                    className="history-clear-button"
                    onClick={
                      clearHistory
                    }
                  >
                    Clear history
                  </button>

                </div>

                <div className="landing-history-list">

                  {history
                    .slice(0, 5)
                    .map(
                      (item) => (
                        <button
                          className="history-card"
                          key={item.id}
                          onClick={() =>
                            openHistoryRepository(
                              item
                            )
                          }
                        >

                          <div className="history-card-icon">
                            R
                          </div>

                          <div className="history-card-info">

                            <strong>
                              {item.repository}
                            </strong>

                            <span>
                              {item.url}
                            </span>

                          </div>

                          <div className="history-card-date">

                            {formatHistoryDate(
                              item.analyzedAt
                            )}

                          </div>

                          <span className="history-arrow">
                            →
                          </span>

                        </button>
                      )
                    )}

                </div>

              </div>
            )}

          </section>

        </main>

        <footer className="dashboard-footer">

          <span>
            RepoMind
          </span>

          <span>•</span>

          <span>
            AI Codebase Intelligence
          </span>

          <span>•</span>

          <span>
            Tree-sitter
          </span>

          <span>•</span>

          <span>
            Qdrant
          </span>

          <span>•</span>

          <span>
            Groq
          </span>

        </footer>

      </div>
    );
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  return (
    <div className="app">

      {/* ========================================================
          HEADER
      ======================================================== */}

      <header className="header dashboard-header">

        <div className="logo">

          <div className="logo-mark">
            <span>R</span>
          </div>

          <div className="brand-text">

            <h1>
              RepoMind-AI
            </h1>

            <p>
              AI Codebase Intelligence
            </p>

          </div>

        </div>

        <div className="header-right">

          <div className="header-repository">
            {repository}
          </div>

          <div className="status">

            <span className="status-dot"></span>

            Repository Ready

          </div>

        </div>

      </header>

      {/* ========================================================
          DASHBOARD
      ======================================================== */}

      <main className="main dashboard">

        {/* ======================================================
            SIDEBAR
        ====================================================== */}

        <aside className="sidebar">

          {/* REPOSITORY */}

          <div className="sidebar-section">

            <div className="sidebar-title">
              REPOSITORY
            </div>

            <div className="repository-name">

              <div className="repo-mark">
                R
              </div>

              <div className="repository-name-info">

                <strong title={repository}>
                  {repository}
                </strong>

                <span>
                  Repository analyzed
                </span>

              </div>

            </div>

          </div>

          {/* EXPLORE */}

          <div className="sidebar-section">

            <div className="sidebar-title">
              EXPLORE
            </div>

            <nav>

              <NavButton
                active={
                  activeView ===
                  "overview"
                }
                icon="◈"
                label="Overview"
                onClick={() =>
                  navigate(
                    "overview"
                  )
                }
              />

              <NavButton
                active={
                  activeView ===
                  "files"
                }
                icon="□"
                label="Files"
                count={
                  statistics?.source_files ||
                  0
                }
                onClick={() =>
                  navigate(
                    "files"
                  )
                }
              />

              <NavButton
                active={
                  activeView ===
                  "classes"
                }
                icon="C"
                label="Classes"
                count={
                  statistics?.classes ||
                  0
                }
                onClick={() =>
                  navigate(
                    "classes"
                  )
                }
              />

              <NavButton
                active={
                  activeView ===
                  "functions"
                }
                icon="ƒ"
                label="Functions"
                count={
                  statistics?.functions ||
                  0
                }
                onClick={() =>
                  navigate(
                    "functions"
                  )
                }
              />

              <NavButton
                active={
                  activeView ===
                  "imports"
                }
                icon="↳"
                label="Dependencies"
                count={
                  statistics?.imports ||
                  0
                }
                onClick={() =>
                  navigate(
                    "imports"
                  )
                }
              />

            </nav>

          </div>

          {/* INTELLIGENCE */}

          <div className="sidebar-section">

            <div className="sidebar-title">
              INTELLIGENCE
            </div>

            <nav>

              <NavButton
                active={
                  activeView ===
                  "ask"
                }
                icon="✦"
                label="Ask RepoMind"
                onClick={() =>
                  navigate("ask")
                }
              />

              <NavButton
                active={
                  activeView ===
                  "search"
                }
                icon="⌕"
                label="Semantic Search"
                onClick={() =>
                  navigate(
                    "search"
                  )
                }
              />

              <NavButton
                active={
                  activeView ===
                  "explain"
                }
                icon="◇"
                label="Explain Code"
                onClick={() =>
                  navigate(
                    "explain"
                  )
                }
              />

              <NavButton
                active={
                  activeView ===
                  "architecture"
                }
                icon="⌁"
                label="Architecture"
                onClick={() =>
                  navigate(
                    "architecture"
                  )
                }
              />

              <NavButton
                active={activeView === "bugs"}
                icon="!"
                label="Bug Detection"
                onClick={() => navigate("bugs")}
              />

              <NavButton
                active={activeView === "refactor"}
                icon="↗"
                label="Improve Code"
                onClick={() => navigate("refactor")}
              />

            </nav>

          </div>

          {/* HISTORY */}

          <div className="sidebar-section history-section">

            <div className="sidebar-title history-title-row">

              <span>
                HISTORY
              </span>

              {history.length > 0 && (
                <button
                  className="sidebar-clear-history"
                  onClick={
                    clearHistory
                  }
                >
                  Clear
                </button>
              )}

            </div>

            <div className="sidebar-history-list">

              {history.length === 0 ? (

                <div className="history-empty">

                  <span>
                    No repositories yet
                  </span>

                  <small>
                    Analyzed repositories
                    will appear here.
                  </small>

                </div>

              ) : (

                history
                  .slice(0, 6)
                  .map(
                    (item) => (
                      <div
                        className={`sidebar-history-item ${
                          item.url?.toLowerCase() ===
                          repoUrl?.toLowerCase()
                            ? "current"
                            : ""
                        }`}
                        key={item.id}
                      >

                        <button
                          className="sidebar-history-main"
                          onClick={() =>
                            openHistoryRepository(
                              item
                            )
                          }
                        >

                          <span className="history-mini-icon">
                            R
                          </span>

                          <span className="history-mini-info">

                            <strong>
                              {item.repository}
                            </strong>

                            <small>
                              {formatHistoryDate(
                                item.analyzedAt
                              )}
                            </small>

                          </span>

                        </button>

                        <button
                          className="history-remove"
                          title="Remove"
                          onClick={() =>
                            removeFromHistory(
                              item.id
                            )
                          }
                        >
                          ×
                        </button>

                      </div>
                    )
                  )

              )}

            </div>

          </div>

          {/* ENGINE STATUS */}

          <div className="sidebar-bottom">

            <div className="engine-status">

              <span className="engine-dot"></span>

              <div>

                <strong>
                  Analysis Engine
                </strong>

                <span>
                  Tree-sitter · Qdrant · AI
                </span>

              </div>

            </div>

          </div>

        </aside>

        {/* ======================================================
            DASHBOARD CONTENT
        ====================================================== */}

        <section className="dashboard-content">

          {/* OVERVIEW */}

          {activeView ===
            "overview" && (
            <Overview
              repository={
                repository
              }
              statistics={
                statistics
              }
              files={files}
              languageList={
                languageList
              }
              totalEntities={
                totalEntities
              }
              vectorCount={vectorCount}
              getFileIcon={
                getFileIcon
              }
              getLanguageName={
                getLanguageName
              }
              onFiles={() =>
                navigate(
                  "files"
                )
              }
              onSearch={() =>
                navigate(
                  "search"
                )
              }
              onAsk={() =>
                navigate("ask")
              }
              history={history}
              onOpenHistory={openHistoryRepository}
              formatHistoryDate={formatHistoryDate}
              onOpenFile={
                openFile
              }
            />
          )}

          {/* FILES */}

          {activeView ===
            "files" && (
            <FilesView
              files={files}
              getFileIcon={
                getFileIcon
              }
              getLanguageName={
                getLanguageName
              }
              onOpenFile={
                openFile
              }
              selectedFile={
                selectedFile
              }
              fileContent={
                fileContent
              }
              fileLoading={
                fileLoading
              }
              fileError={
                fileError
              }
            />
          )}

          {/* CLASSES */}

          {activeView ===
            "classes" && (
            <EntityView
              title="Classes"
              eyebrow="CODE ENTITIES"
              description="Classes discovered across the repository."
              type="class"
              files={files}
            />
          )}

          {/* FUNCTIONS */}

          {activeView ===
            "functions" && (
            <EntityView
              title="Functions & Methods"
              eyebrow="CODE ENTITIES"
              description="Functions and methods discovered across the repository."
              type="function"
              files={files}
            />
          )}

          {/* IMPORTS */}

          {activeView ===
            "imports" && (
            <EntityView
              title="Dependencies"
              eyebrow="CODE RELATIONSHIPS"
              description="Imports and dependencies discovered across the repository."
              type="import"
              files={files}
            />
          )}

          {/* ASK */}

          {activeView ===
            "ask" && (
            <AskView
              question={
                question
              }
              setQuestion={
                setQuestion
              }
              answer={
                aiAnswer
              }
              sources={
                aiSources
              }
              loading={
                aiLoading
              }
              onAsk={
                askRepoMind
              }
              onOpenFile={
                openFile
              }
            />
          )}

          {/* SEARCH */}

          {activeView ===
            "search" && (
            <SearchView
              query={
                searchQuery
              }
              setQuery={
                setSearchQuery
              }
              results={
                searchResults
              }
              answer={
                searchAnswer
              }
              loading={
                searchLoading
              }
              onSearch={
                performSearch
              }
              onOpenFile={
                openFile
              }
            />
          )}

          {/* EXPLAIN */}

          {activeView ===
            "explain" && (
            <ExplainView
              selectedFile={
                selectedFile
              }
              fileContent={
                fileContent
              }
              fileLoading={
                fileLoading
              }
              fileError={
                fileError
              }
              files={files}
              onSelectFile={
                openFileInExplanation
              }
            />
          )}

          {/* ARCHITECTURE */}

          {activeView ===
            "architecture" && (
            <ArchitectureView
              repository={
                repository
              }
              statistics={
                statistics
              }
              files={files}
            />
          )}

          {activeView === "bugs" && (
            <CodeAnalysisView
              type="bugs"
              files={files}
              selectedFile={selectedFile}
              onOpenFile={openFile}
              onSelectFile={openFileForBugDetection}
              fileContent={fileContent}
              fileLoading={fileLoading}
              fileError={fileError}
              analysisError={bugAnalysisError}
              loading={codeAnalysisLoading}
              result={bugAnalysis}
              onRun={() => runCodeAnalysis("bugs")}
            />
          )}

          {activeView === "refactor" && (
            <CodeAnalysisView
              type="refactor"
              files={files}
              selectedFile={selectedFile}
              onOpenFile={openFile}
              onSelectFile={openFileForRefactor}
              fileContent={fileContent}
              fileLoading={fileLoading}
              fileError={fileError}
              analysisError={refactorAnalysisError}
              loading={codeAnalysisLoading}
              result={refactorAnalysis}
              onRun={() => runCodeAnalysis("refactor")}
            />
          )}

        </section>

      </main>

      {/* FOOTER */}

      <footer className="dashboard-footer">

        <span>
          RepoMind
        </span>

        <span>•</span>

        <span>
          AI Codebase Intelligence
        </span>

        <span>•</span>

        <span>
          Tree-sitter
        </span>

        <span>•</span>

        <span>
          Qdrant
        </span>

        <span>•</span>

        <span>
          Groq
        </span>

      </footer>

    </div>
  );
}

// ============================================================
// NAV BUTTON
// ============================================================

function NavButton({
  active,
  icon,
  label,
  count,
  onClick
}) {
  return (
    <button
      className={`nav-item ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >

      <span className="nav-icon">
        {icon}
      </span>

      <span className="nav-label">
        {label}
      </span>

      {count !== undefined && (
        <span className="nav-count">
          {count}
        </span>
      )}

    </button>
  );
}

// ============================================================
// OVERVIEW
// ============================================================

function Overview({
  repository,
  statistics,
  files,
  languageList,
  totalEntities,
  vectorCount,
  getFileIcon,
  getLanguageName,
  onFiles,
  onSearch,
  onAsk,
  history,
  onOpenHistory,
  formatHistoryDate,
  onOpenFile
}) {
  return (
    <div>

      <div className="overview-repository-hero">
        <div className="overview-repository-icon">R</div>

        <div>

          <div className="eyebrow">
            PYTHON REPOSITORY
          </div>

          <h2 className="overview-repository-name">
            {repository}
          </h2>

          <p>
            Explore the structure, source code, entities and dependencies of your repository.
          </p>

          <div className="overview-repository-tags">
            <span>Python</span>
            <span>{statistics?.source_files || 0} files</span>
            <span>{totalEntities} entities</span>
            <span>{statistics?.imports || 0} dependencies</span>
          </div>

        </div>

        <div className="overview-analysis-status">

          <span className="status-dot"></span>

          <strong>Analysis Complete</strong>
          <small>AST, embeddings and dependencies ready</small>

        </div>

      </div>

      <div className="stats-grid">

        <StatCard
          label="FILES"
          value={statistics?.source_files || 0}
          description="Total repository files"
          symbol="□"
          tone="blue"
        />

        <StatCard
          label="CLASSES"
          value={statistics?.classes || 0}
          description="Classes discovered"
          symbol="C"
          tone="purple"
        />

        <StatCard
          label="FUNCTIONS"
          value={statistics?.functions || 0}
          description="Functions discovered"
          symbol="ƒ"
          tone="cyan"
        />

        <StatCard
          label="DEPENDENCIES"
          value={statistics?.imports || 0}
          description="External dependencies"
          symbol="↗"
          tone="gold"
        />

      </div>

      <div className="overview-grid">

        {/* REPOSITORY STRUCTURE */}

        <div className="panel overview-explorer-panel">

          <div className="panel-header">

            <div>

              <h3>
                Repository Explorer
              </h3>

              <p>
                Browse and explore the structure of your repository.
              </p>

            </div>

            <button
              className="text-button"
              onClick={onFiles}
            >
              View all →
            </button>

          </div>

          <div className="file-list compact">

            {files.length === 0 ? (

              <div className="empty-state">

                <strong>
                  No source files found
                </strong>

                <span>
                  No supported source files
                  were detected.
                </span>

              </div>

            ) : (

              files
                .slice(0, 8)
                .map(
                  (file, index) => (
                    <button
                      className="file-card"
                      key={`${file.file}-${index}`}
                      onClick={() =>
                        onOpenFile(
                          file
                        )
                      }
                    >

                      <div className="file-main">

                        <span className="file-icon">
                          {getFileIcon(
                            file.extension
                          )}
                        </span>

                        <div className="file-name-wrapper">

                          <strong>
                            {file.file}
                          </strong>

                          <span>
                            {getLanguageName(
                              file.extension
                            )}
                          </span>

                        </div>

                      </div>

                      <div className="file-stats">

                        <span>
                          {file.class_count ||
                            0}{" "}
                          C
                        </span>

                        <span>
                          {file.function_count ||
                            0}{" "}
                          F
                        </span>

                        <span>
                          {file.import_count ||
                            0}{" "}
                          I
                        </span>

                      </div>

                    </button>
                  )
                )

            )}

          </div>

        </div>

        {/* LANGUAGE */}

        <div className="panel overview-composition-panel">

          <div className="panel-header">

            <div>

              <h3>
                Codebase Composition
              </h3>

              <p>
                Languages detected in the repository.
              </p>

            </div>

          </div>

          <div className="language-list">

            {languageList.length === 0 ? (

              <div className="empty-state">
                No languages detected.
              </div>

            ) : (

              languageList.map(
                ([language, count]) => (
                  <div
                    className="language-row"
                    key={language}
                  >

                    <span className="language-name">
                      {language}
                    </span>

                    <span className="language-count">
                      {count} files
                    </span>

                  </div>
                )
              )

            )}

          </div>

          <div className="summary-footer">

            <span>
              Total entities
            </span>

            <strong>
              {totalEntities}
            </strong>

          </div>

        </div>

      </div>

      <div className="overview-health panel">
        <div className="overview-health-title">
          <div className="overview-health-icon">✓</div>
          <div>
            <span className="eyebrow">REPOSITORY HEALTH</span>
            <h3>Analysis readiness</h3>
            <p>Current status of repository analysis.</p>
          </div>
        </div>
        <div className="overview-health-items">
          <span>✓ AST Analysis Complete</span>
          <span>✓ Code Entities Indexed</span>
          <span>✓ Semantic Index Ready</span>
          <span>✓ Dependency Mapping Complete</span>
        </div>
        <div className="overview-health-coverage">
          <div><span>Analysis Coverage</span><strong>100%</strong></div>
          <div className="overview-health-bar"><i></i></div>
          <small>{statistics?.source_files || 0} files analyzed · {totalEntities} entities discovered · {vectorCount} vectors</small>
        </div>
      </div>

      {history.length > 0 && (
        <div className="overview-recent panel">
          <div className="panel-header">
            <div><h3>Recent Repositories</h3><p>Your recently analyzed repositories.</p></div>
            <span className="text-button">View All →</span>
          </div>
          <div className="overview-recent-grid">
            {history.slice(0, 3).map((item) => (
              <button key={item.id} onClick={() => onOpenHistory(item)}>
                <span className="overview-recent-mark">R</span>
                <span><strong>{item.repository}</strong><small>{formatHistoryDate(item.analyzedAt)}</small></span>
                <b>Analyzed</b>
                <em>→</em>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUICK ACTIONS */}

      <div className="quick-actions">

        <button
          onClick={onFiles}
        >

          <span>
            □
          </span>

          <div>

            <strong>
              Explore Files
            </strong>

            <small>
              Browse and inspect source code
            </small>

          </div>

          <b>
            →
          </b>

        </button>

        <button
          onClick={onSearch}
        >

          <span>
            ⌕
          </span>

          <div>

            <strong>
              Search Code
            </strong>

            <small>
              Find relevant code semantically
            </small>

          </div>

          <b>
            →
          </b>

        </button>

        <button
          onClick={onAsk}
        >

          <span>
            ✦
          </span>

          <div>

            <strong>
              Ask RepoMind
            </strong>

            <small>
              Understand your code with AI
            </small>

          </div>

          <b>
            →
          </b>

        </button>

      </div>

    </div>
  );
}

// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  label,
  value,
  description,
  symbol,
  tone = "blue"
}) {
  return (
    <div className={`stat-card stat-card-${tone}`}>

      <div className="stat-top">

        <span>
          {label}
        </span>

        <span className="stat-symbol">
          {symbol}
        </span>

      </div>

      <strong>
        {value}
      </strong>

      <small>
        {description}
      </small>

    </div>
  );
}

// ============================================================
// FILES VIEW
// ============================================================

function FilesView({
  files,
  getFileIcon,
  getLanguageName,
  onOpenFile,
  selectedFile,
  fileContent,
  fileLoading,
  fileError
}) {
  return (
    <div className="content-panel">

      <div className="page-heading small">

        <div>

          <div className="eyebrow">
            CODEBASE
          </div>

          <h2>
            Files
          </h2>

          <p>
            Browse every analyzed source file
            and inspect its actual code.
          </p>

        </div>

        <div className="view-count">
          {files.length} files
        </div>

      </div>

      <div className="file-explorer">

        {/* FILE LIST */}

        <div className="file-browser panel">

          <div className="panel-header">

            <div>

              <h3>
                Source Files
              </h3>

              <p>
                Select a file to inspect it.
              </p>

            </div>

          </div>

          <div className="file-list">

            {files.length === 0 ? (

              <div className="empty-state">
                No files found.
              </div>

            ) : (

              files.map(
                (file, index) => (
                  <div
                    className="file-item"
                    key={`${file.file}-${index}`}
                  >
                    <button
                      className={`file-card ${
                        selectedFile?.file ===
                        file.file
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        onOpenFile(
                          file
                        )
                      }
                    >

                    <div className="file-main">

                      <span className="file-icon">
                        {getFileIcon(
                          file.extension
                        )}
                      </span>

                      <div className="file-name-wrapper">

                        <strong>
                          {file.file}
                        </strong>

                        <span>
                          {getLanguageName(
                            file.extension
                          )}
                        </span>

                      </div>

                    </div>

                    <div className="file-stats">

                      <span>
                        {file.class_count ||
                          0}{" "}
                        Classes
                      </span>

                      <span>
                        {file.function_count ||
                          0}{" "}
                        Functions
                      </span>

                      <span>
                        {file.import_count ||
                          0}{" "}
                        Imports
                      </span>

                    </div>

                    </button>

                    {selectedFile?.file === file.file && (
                      <FileCodeViewer
                        selectedFile={selectedFile}
                        fileContent={fileContent}
                        fileLoading={fileLoading}
                        fileError={fileError}
                        getFileIcon={getFileIcon}
                        getLanguageName={getLanguageName}
                      />
                    )}
                  </div>
                )
              )

            )}

          </div>

        </div>

      </div>

    </div>
  );
}

function FileCodeViewer({
  selectedFile,
  fileContent,
  fileLoading,
  fileError,
  getFileIcon,
  getLanguageName
}) {
  return (
    <div className="code-viewer panel">

      <div className="code-header">

        <div>

          <span className="code-file-icon">
            {getFileIcon(selectedFile.extension)}
          </span>

          <div>

            <strong>
              {selectedFile.file}
            </strong>

            <span>
              {getLanguageName(selectedFile.extension)}
            </span>

          </div>

        </div>

      </div>

      {fileLoading && (
        <div className="code-loading">
          Loading source code...
        </div>
      )}

      {fileError && (
        <div className="error-card">
          <strong>Could not load file</strong>
          <p>{fileError}</p>
        </div>
      )}

      {!fileLoading && !fileError && (
        <pre className="code-block">
          <code>{fileContent}</code>
        </pre>
      )}

    </div>
  );
}

// ============================================================
// ENTITY VIEW
// ============================================================

function EntityView({
  title,
  eyebrow,
  description,
  type,
  files
}) {
  const entities = [];

  files.forEach(
    (file) => {
      let items = [];

      if (type === "class") {
        items =
          file.classes || [];
      }

      if (type === "function") {
        items = [
          ...(file.functions ||
            []),
          ...(file.methods ||
            [])
        ];
      }

      if (type === "import") {
        items =
          file.imports || [];
      }

      items.forEach(
        (entity) => {
          entities.push({
            ...entity,
            file: file.file
          });
        }
      );
    }
  );

  const icon =
    type === "class"
      ? "C"
      : type === "function"
      ? "ƒ"
      : "↳";

  return (
    <div className="content-panel">

      <div className="page-heading small">

        <div>

          <div className="eyebrow">
            {eyebrow}
          </div>

          <h2>
            {title}
          </h2>

          <p>
            {description}
          </p>

        </div>

        <div className="view-count">
          {entities.length} entities
        </div>

      </div>

      <div className="panel">

        {entities.length === 0 ? (

          <div className="empty-state">

            <strong>
              No{" "}
              {title.toLowerCase()}
              discovered
            </strong>

            <span>
              RepoMind did not detect
              matching entities.
            </span>

          </div>

        ) : (

          <div className="entity-list">

            {entities.map(
              (entity, index) => (
                <div
                  className="entity-card"
                  key={`${entity.file}-${entity.name}-${index}`}
                >

                  <div
                    className={`entity-icon ${
                      type === "class"
                        ? "class-icon"
                        : type ===
                          "function"
                        ? "function-icon"
                        : "import-icon"
                    }`}
                  >
                    {icon}
                  </div>

                  <div className="entity-info">

                    <strong>
                      {entity.name ||
                        "Unnamed entity"}
                    </strong>

                    <span>
                      {entity.file}
                    </span>

                  </div>

                  <div className="entity-meta">

                    <span className="entity-type">
                      {entity.type ||
                        type}
                    </span>

                    {entity.start && (
                      <span>
                        L
                        {entity.start[0] +
                          1}
                      </span>
                    )}

                  </div>

                </div>
              )
            )}

          </div>

        )}

      </div>

    </div>
  );
}

// ============================================================
// ASK REPO VIEW
// ============================================================

function AskView({
  question,
  setQuestion,
  answer,
  sources,
  loading,
  onAsk,
  onOpenFile
}) {
  return (
    <div className="content-panel">

      <div className="page-heading small">

        <div>

          <div className="eyebrow">
            AI CODEBASE ASSISTANT
          </div>

          <h2>
            Ask RepoMind
          </h2>

          <p>
            Ask questions about the repository
            and get answers grounded in actual source code.
          </p>

        </div>

      </div>

      <div className="ai-workspace">

        <div className="ai-input-panel panel">

          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                  "Enter" &&
                event.ctrlKey &&
                !loading
              ) {
                event.preventDefault();
                onAsk();
              }
            }}
            placeholder="Example: Where is authentication implemented?"
          />

          <div className="prompt-chips" aria-label="Suggested questions">
            {[
              "Where is authentication handled?",
              "Where is the database connection created?",
              "How does this repository work?"
            ].map((prompt) => (
              <button
                className="prompt-chip"
                key={prompt}
                type="button"
                onClick={() => setQuestion(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="ai-input-footer">

            <span>
              Ctrl + Enter to ask
            </span>

            <button
              className="analyze-button"
              onClick={onAsk}
              disabled={
                loading ||
                !question.trim()
              }
            >
              {loading
                ? "Thinking..."
                : "Ask RepoMind →"}
            </button>

          </div>

        </div>

        {answer && (
          <div className="ai-answer panel">

            <div className="panel-header">

              <div>

                <span className="eyebrow">
                  AI RESPONSE
                </span>

                <h3>
                  RepoMind Answer
                </h3>

              </div>

            </div>

            <div className="answer-content">
              {answer}
            </div>

          </div>
        )}

        {sources.length > 0 && (
          <div className="panel">

            <div className="panel-header">

              <div>

                <h3>
                  Source Evidence
                </h3>

                <p>
                  Code used to ground the answer.
                </p>

              </div>

            </div>

            <div className="source-list">

              {sources.map(
                (source, index) => (
                  <button
                    className="source-card"
                    key={index}
                    onClick={() =>
                      onOpenFile({
                        file:
                          source.file,
                        extension:
                          getExtension(
                            source.file
                          )
                      })
                    }
                  >

                    <div className="source-header">

                      <strong>
                        {source.file}
                      </strong>

                      <span>
                        Score{" "}
                        {Number(
                          source.score ||
                            0
                        ).toFixed(3)}
                      </span>

                    </div>

                    <span>
                      {source.type}
                    </span>

                    <pre>
                      {source.code}
                    </pre>

                  </button>
                )
              )}

            </div>

          </div>
        )}

      </div>

    </div>
  );
}

// ============================================================
// SEMANTIC SEARCH VIEW
// ============================================================

function SearchView({
  query,
  setQuery,
  results,
  answer,
  loading,
  onSearch,
  onOpenFile
}) {
  return (
    <div className="content-panel">

      <div className="page-heading small">

        <div>

          <div className="eyebrow">
            CODE DISCOVERY
          </div>

          <h2>
            Semantic Search
          </h2>

          <p>
            Search the repository using natural language.
          </p>

        </div>

      </div>

      <div className="semantic-chat panel">
        <div className="semantic-chat-heading">
          <div>
            <span className="eyebrow">REPOSITORY CHAT</span>
            <h3>Ask about code or paste a snippet</h3>
            <p>Describe what you need to find, or paste code and ask RepoMind to locate related implementation.</p>
          </div>
          <span className="semantic-chat-status">CODE AWARE</span>
        </div>

        <div className="semantic-composer">
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !loading) {
                event.preventDefault();
                onSearch();
              }
            }}
            placeholder={'Ask: "Where is authentication handled?"\nOr paste code and ask: "Where is this pattern used?"'}
            rows={5}
          />
          <div className="semantic-composer-footer">
            <span>Shift + Enter for a new line</span>
            <button
              className="analyze-button"
              onClick={onSearch}
              disabled={loading || !query.trim()}
            >
              {loading ? "Searching..." : "Send to RepoMind →"}
            </button>
          </div>
        </div>
      </div>

      {(answer || results.length > 0) && (
        <div className="semantic-conversation">
          <div className="chat-message user-message">
            <span className="chat-speaker">YOU</span>
            <p>{query}</p>
          </div>
          {answer && (
            <div className="chat-message assistant-message">
              <span className="chat-speaker">REPOMIND AI</span>
              <div className="answer-content">{answer}</div>
            </div>
          )}
        </div>
      )}

      <div className="panel">

        <div className="panel-header">

          <div>

            <h3>
              Relevant Code
            </h3>

            <p>
              Semantically similar code
              from your repository.
            </p>

          </div>

          <span className="view-count">
            {results.length} results
          </span>

        </div>

        {results.length === 0 ? (

          <div className="empty-state">

            <strong>
              No search results
            </strong>

            <span>
              Try a more specific description
              of the code you are looking for.
            </span>

          </div>

        ) : (

          <div className="source-list">

            {results.map(
              (result, index) => (
                <button
                  className="source-card"
                  key={index}
                  onClick={() =>
                    onOpenFile({
                      file:
                        result.file,
                      extension:
                        getExtension(
                          result.file
                        )
                    })
                  }
                >

                  <div className="source-header">

                    <strong>
                      {result.file}
                    </strong>

                    <span>
                      Score{" "}
                      {Number(
                        result.score ||
                          0
                      ).toFixed(3)}
                    </span>

                  </div>

                  <span>
                    {result.type}
                  </span>

                  <pre>
                    {result.code}
                  </pre>

                </button>
              )
            )}

          </div>

        )}

      </div>

    </div>
  );
}

function CodeAnalysisView({
  type,
  files,
  selectedFile,
  onOpenFile,
  onSelectFile,
  fileContent,
  fileLoading,
  fileError,
  analysisError,
  loading,
  result,
  onRun
}) {
  const isBugMode = type === "bugs";
  const items = isBugMode
    ? (result?.findings || [])
    : (result?.suggestions || []);
  const reviewLabel = isBugMode ? "Bug Detection" : "Improve Code";

  return (
    <div className="content-panel">
      <div className="page-heading small">
        <div>
          <div className="eyebrow">AI CODE REVIEW</div>
          <h2>{isBugMode ? "Bug Detection" : "Code Improvement"}</h2>
          <p>
            {isBugMode
              ? "Find potential bugs with severity, evidence, and suggested fixes."
              : "Get practical refactoring suggestions with before-and-after guidance."}
          </p>
        </div>
        <button
          className="analyze-button"
          onClick={onRun}
          disabled={loading}
        >
          {loading
            ? "Analyzing..."
            : isBugMode
              ? "Detect Bugs →"
              : "Suggest Improvements →"}
        </button>
      </div>

      <AnalysisFilePicker
        files={files}
        selectedFile={selectedFile}
        onSelectFile={onSelectFile}
        heading={`Select a source file for ${reviewLabel}`}
        description={`Choose a file here, then review it without leaving ${reviewLabel}.`}
      />

      <div className="analysis-target panel">
        <div>
          <span className="eyebrow">ANALYSIS TARGET</span>
          <strong>{selectedFile?.file || "Entire indexed repository"}</strong>
          <p>
            {selectedFile
              ? "The selected file will be reviewed with its AST context."
              : "Run this review across the repository source context."}
          </p>
        </div>
        <span className="analysis-target-status">
          {selectedFile ? "FILE" : "REPOSITORY"}
        </span>
      </div>

      {!result ? (
        <>
          <div className="analysis-empty panel">
            <span>{isBugMode ? "!" : "↗"}</span>
            <h3>Ready for review</h3>
            <p>
              {selectedFile
                ? `This is the source code that will be reviewed in ${reviewLabel}.`
                : "Select a file from the list below or analyze the repository directly."}
            </p>
          </div>
          {selectedFile && (
            <ReviewSourcePreview
              content={fileContent}
              findings={[]}
              loading={fileLoading || loading}
              error={fileError}
              reviewed={false}
              analysisType={type}
            />
          )}
          {analysisError && (
            <div className="analysis-request-error panel">
              <strong>{reviewLabel} review failed</strong>
              <p>{analysisError}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="analysis-summary panel">
            <span className="eyebrow">AI SUMMARY</span>
            <p>{result.summary || "No summary was returned."}</p>
            <strong>{items.length} {isBugMode ? "potential issues" : "improvement suggestions"}</strong>
          </div>

          {selectedFile && (
            <ReviewSourcePreview
              content={fileContent}
              findings={items}
              loading={fileLoading || loading}
              error={fileError}
              reviewed
              analysisType={type}
            />
          )}

          <div className="analysis-review-section">
            <div className="analysis-review-heading">
              <div>
                <span className="eyebrow">{isBugMode ? "BUG REVIEW" : "IMPROVEMENT REVIEW"}</span>
                <h3>{isBugMode ? "Detected code issues" : "Suggested improvements and corrected code"}</h3>
              </div>
              <span>{items.length} result{items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="analysis-results">
              {items.length === 0 ? (
                <div className="analysis-empty panel">
                  <span>✓</span>
                  <h3>{isBugMode ? "No bugs found" : "No improvements suggested"}</h3>
                  <p>
                    {isBugMode
                      ? "The review found no supported bugs in this source file."
                      : "The model did not find a grounded improvement in the supplied source."}
                  </p>
                </div>
              ) : items.map((item, index) => (
                <article className="analysis-card panel" key={`${item.title}-${index}`}>
                <div className="analysis-card-header">
                  <div>
                    <span className={`analysis-badge ${String(item.severity || item.priority || "medium").toLowerCase()}`}>
                      {item.severity || item.priority || "medium"}
                    </span>
                    <h3>{item.title || (isBugMode ? "Potential issue" : "Improvement")}</h3>
                  </div>
                  <span className="analysis-location">
                    {item.file || "Source context"}{item.line ? `:${item.line}` : ""}
                  </span>
                </div>
                <p>{item.description}</p>
                {isBugMode ? (
                  <div className="analysis-fix">
                    <strong>Suggested fix</strong>
                    <span>{item.suggested_fix}</span>
                  </div>
                ) : (
                  <>
                    <div className="analysis-code-grid">
                      <div><strong>Before</strong><pre>{item.before || "Not provided"}</pre></div>
                      <div><strong>After</strong><pre>{item.after || "Not provided"}</pre></div>
                    </div>
                    <div className="analysis-fix"><strong>Impact</strong><span>{item.impact}</span></div>
                  </>
                )}
                </article>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function AnalysisFilePicker({ files, selectedFile, onSelectFile, heading, description }) {
  return (
    <div className="analysis-files panel">
      <div className="panel-header">
        <div>
          <h3>{heading}</h3>
          <p>{description}</p>
        </div>
        <span className="analysis-file-count">{files.length} files</span>
      </div>
      <div className="analysis-file-list">
        {files.map((file) => (
          <button
            className={selectedFile?.file === file.file ? "selected" : ""}
            key={file.file}
            onClick={() => onSelectFile(file)}
          >
            <span>{file.file}</span>
            <small>{file.function_count || 0} functions · {file.import_count || 0} imports</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewSourcePreview({ content, findings, loading, error, reviewed, analysisType }) {
  const isBugReview = analysisType === "bugs";
  const bugLines = new Set(
    (isBugReview ? findings : [])
      .map((finding) => Number(finding.line))
      .filter((line) => Number.isInteger(line) && line > 0)
  );

  return (
    <div className="bug-source panel">
      <div className="bug-source-header">
        <div>
          <span className="eyebrow">{loading ? "REVIEW IN PROGRESS" : reviewed ? "REVIEWED SOURCE" : "READY TO REVIEW"}</span>
          <h3>{loading ? `Reviewing selected source code...` : reviewed && isBugReview ? "Code with suspected bugs marked in red" : reviewed ? "Reviewed source code" : "Selected source code"}</h3>
        </div>
        <span>{loading ? "Analyzing..." : reviewed && isBugReview ? `${bugLines.size} marked lines` : reviewed ? "Review complete" : "Ready"}</span>
      </div>
      {loading ? (
        <div className="code-loading">Loading source code...</div>
      ) : error ? (
        <div className="error-card"><strong>Could not load source</strong><p>{error}</p></div>
      ) : (
        <pre className="bug-code-block">{(content || "No source code returned.").split(/\r?\n/).map((line, index) => {
          const lineNumber = index + 1;
          return (
            <span className={bugLines.has(lineNumber) ? "bug-code-line flagged" : "bug-code-line"} key={lineNumber}>
              <span className="bug-line-number">{String(lineNumber).padStart(3, " ")}</span>{line}{"\n"}
            </span>
          );
        })}</pre>
      )}
    </div>
  );
}

// ============================================================
// EXPLAIN VIEW
// ============================================================

function ExplainView({
  selectedFile,
  fileContent,
  fileLoading,
  fileError,
  files,
  onSelectFile
}) {
  const explanation = selectedFile
    ? getFileExplanation(selectedFile, fileContent)
    : "Select a source file to see a plain-language explanation of what it contains and how it fits into the repository.";

  return (
    <div className="content-panel">

      <div className="page-heading small">

        <div>

          <div className="eyebrow">
            CODE UNDERSTANDING
          </div>

          <h2>
            Explain Code
          </h2>

          <p>
            Select a source file to inspect
            its implementation.
          </p>

        </div>

      </div>

      <div className="explain-layout">

        <div className="panel explain-files">

          <div className="panel-header">

            <h3>
              Source Files
            </h3>

          </div>

          <div className="file-list">

            {files
              .slice(0, 50)
              .map(
                (file, index) => (
                  <button
                    className={`file-card ${
                      selectedFile?.file ===
                      file.file
                        ? "selected"
                        : ""
                    }`}
                    key={index}
                    onClick={() =>
                      onSelectFile(
                        file
                      )
                    }
                  >

                    <div className="file-main">

                      <span className="file-icon">
                        {getFileIconForPath(
                          file.file
                        )}
                      </span>

                      <div className="file-name-wrapper">

                        <strong>
                          {file.file}
                        </strong>

                        <span>
                          {file.function_count ||
                            0}{" "}
                          functions ·{" "}
                          {file.import_count ||
                            0}{" "}
                          imports
                        </span>

                      </div>

                    </div>

                  </button>
                )
              )}

          </div>

        </div>

        <div className="panel code-viewer">

          {!selectedFile ? (

            <div className="code-empty">

              <div className="code-empty-icon">
                ✦
              </div>

              <h3>
                Choose a file
              </h3>

              <p>
                RepoMind will show the actual
                source code here.
              </p>

            </div>

          ) : fileLoading ? (

            <div className="code-loading">
              Loading code...
            </div>

          ) : fileError ? (

            <div className="error-card">

              <strong>
                Could not load code
              </strong>

              <p>
                {fileError}
              </p>

            </div>

          ) : (

            <>

              <div className="code-header">

                <div>

                  <span className="code-file-icon">
                    {getFileIconForPath(
                      selectedFile.file
                    )}
                  </span>

                  <div>

                    <strong>
                      {selectedFile.file}
                    </strong>

                    <span>
                      Code inspection
                    </span>

                  </div>

                </div>

              </div>

              <div className="file-explanation">
                <span className="eyebrow">PLAIN-LANGUAGE EXPLANATION</span>
                <p>{explanation}</p>
              </div>

              <pre className="code-block">
                {fileContent}
              </pre>

            </>

          )}

        </div>

      </div>

    </div>
  );
}

// ============================================================
// ARCHITECTURE VIEW
// ============================================================

function ArchitectureView({
  repository,
  statistics,
  files
}) {
  const sourceFiles =
    statistics?.source_files ||
    files.length ||
    0;

  const entities =
    (statistics?.classes ||
      0) +
    (statistics?.functions ||
      0) +
    (statistics?.methods ||
      0);

  const imports =
    statistics?.imports ||
    0;

  const folderGroups = getFolderGroups(files);
  const architectureFlow = getArchitectureFlow(files);

  return (
    <div className="content-panel">

      <div className="page-heading small">

        <div>

          <div className="eyebrow">
            SYSTEM UNDERSTANDING
          </div>

          <h2>
            Architecture
          </h2>

          <p>
            High-level structural intelligence
            extracted from the repository.
          </p>

        </div>

      </div>

      <div className="architecture-grid">

        <div className="architecture-node">

          <span>
            REPOSITORY
          </span>

          <strong>
            {repository}
          </strong>

          <small>
            {sourceFiles} source files
          </small>

        </div>

        <div className="architecture-line"></div>

        <div className="architecture-node">

          <span>
            CODE ENTITIES
          </span>

          <strong>
            {entities}
          </strong>

          <small>
            Classes · Functions · Methods
          </small>

        </div>

        <div className="architecture-line"></div>

        <div className="architecture-node">

          <span>
            DEPENDENCIES
          </span>

          <strong>
            {imports}
          </strong>

          <small>
            Imports detected
          </small>

        </div>

      </div>

      <div className="architecture-folders">
        <div className="panel-header">
          <div>
            <span className="eyebrow">PROJECT MAP</span>
            <h3>How this repository is arranged</h3>
            <p>Top-level areas discovered from the analyzed source files.</p>
          </div>
        </div>

        <div className="folder-grid">
          {folderGroups.map((group) => (
            <div className="folder-card" key={group.name}>
              <span className="folder-icon">/</span>
              <div>
                <strong>{group.name}</strong>
                <span>{group.count} source files</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="architecture-flow panel">
        <div className="panel-header architecture-flow-header">
          <div>
            <span className="eyebrow">RUNTIME FLOW</span>
            <h3>How the project works</h3>
            <p>Files are grouped by their likely responsibility. Arrows show the direction from entry points through application logic into data and AI layers.</p>
          </div>
          <span className="architecture-flow-count">{architectureFlow.edges.length} detected links</span>
        </div>

        <div className="architecture-flowchart">
          {architectureFlow.layers.map((layer, index) => (
            <div className="architecture-layer" key={layer.id}>
              <div className="architecture-layer-heading">
                <span className="architecture-layer-index">0{index + 1}</span>
                <div>
                  <strong>{layer.label}</strong>
                  <small>{layer.description}</small>
                </div>
              </div>

              <div className="architecture-layer-nodes">
                {layer.files.length === 0 ? (
                  <span className="architecture-layer-empty">No matching files</span>
                ) : layer.files.map((file) => (
                  <div className="architecture-file-node" key={file.file}>
                    <span className="architecture-file-dot"></span>
                    <strong title={file.file}>{getArchitectureFileName(file.file)}</strong>
                    <small>{file.function_count || 0} fn · {file.import_count || 0} imp</small>
                  </div>
                ))}
              </div>

              {index < architectureFlow.layers.length - 1 && (
                <div className="architecture-flow-arrow" aria-hidden="true">→</div>
              )}
            </div>
          ))}
        </div>

        <div className="architecture-connections">
          <div className="architecture-connections-heading">
            <div>
              <span className="eyebrow">FILE CONNECTIONS</span>
              <h4>Detected source-to-source links</h4>
            </div>
            <span>From parsed imports</span>
          </div>
          {architectureFlow.edges.length === 0 ? (
            <p className="architecture-no-connections">No direct local file links were identified in the parsed imports.</p>
          ) : (
            <div className="architecture-edge-list">
              {architectureFlow.edges.map((edge) => (
                <div className="architecture-edge" key={`${edge.from}-${edge.to}`}>
                  <span title={edge.from}>{getArchitectureFileName(edge.from)}</span>
                  <b>→</b>
                  <span title={edge.to}>{getArchitectureFileName(edge.to)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel architecture-note">

        <div className="eyebrow">
          REPOSITORY INTELLIGENCE
        </div>

        <h3>
          Structural understanding
        </h3>

        <p>
          {getArchitectureExplanation(repository, folderGroups, sourceFiles, imports)}
        </p>

      </div>

    </div>
  );
}

function getFileExplanation(file, content = "") {
  const extension = getExtension(file.file);
  const language = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "React JSX",
    ".ts": "TypeScript",
    ".tsx": "React TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust"
  }[extension] || "source";
  const functions = file.function_count || 0;
  const imports = file.import_count || 0;
  const classes = file.class_count || 0;
  const lines = content ? content.split(/\r?\n/).length : 0;

  const structure = [
    `${classes} class${classes === 1 ? "" : "es"}`,
    `${functions} function${functions === 1 ? "" : "s"}`,
    `${imports} import${imports === 1 ? "" : "s"}`
  ].join(", ");

  return `${file.file} is a ${language} source file. It is about ${lines || "an unknown number of"} lines long and contains ${structure}. In simple terms, this file is one focused part of the repository: its functions and classes provide the behavior, while its imports connect that behavior to other modules. Use the source below to see the exact step-by-step implementation.`;
}

function getFolderGroups(files) {
  const groups = {};

  files.forEach((file) => {
    const parts = file.file.split(/[\\/]/).filter(Boolean);
    const repositoryIndex = parts.findIndex((part) => part === "AI_Recruitment_Copilot");
    const group = parts[repositoryIndex + 1] || parts[0] || "root";
    groups[group] = (groups[group] || 0) + 1;
  });

  return Object.entries(groups)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function getArchitectureFlow(files) {
  const layerDefinitions = [
    { id: "entry", label: "Entry points", description: "Starts the application", matches: ["main", "app", "index", "streamlit"] },
    { id: "interface", label: "Interfaces", description: "Routes and user-facing access", matches: ["router", "route", "api", "frontend"] },
    { id: "processing", label: "Processing", description: "Services, parsers and agents", matches: ["service", "parser", "agent", "processor"] },
    { id: "intelligence", label: "Data + intelligence", description: "Models, embeddings and retrieval", matches: ["database", "model", "schema", "embedding", "vector", "rag"] },
    { id: "support", label: "Support", description: "Configuration and verification", matches: ["config", "util", "test"] }
  ];

  const layers = layerDefinitions.map((layer) => ({
    ...layer,
    files: files.filter((file) => getArchitectureLayerId(file.file) === layer.id).slice(0, 5)
  }));

  const edges = [];
  files.forEach((source) => {
    const imports = Array.isArray(source.imports) ? source.imports : [];
    imports.forEach((importItem) => {
      const importedName = String(
        importItem.name || importItem.module || importItem.value || importItem.text || ""
      ).toLowerCase().replace(/\\/g, "/");
      const target = files.find((candidate) => {
        if (candidate.file === source.file || !importedName) return false;
        const candidatePath = candidate.file.toLowerCase().replace(/\\/g, "/");
        const candidateName = candidatePath.split("/").pop().replace(/\.[^.]+$/, "");
        return candidateName.length > 2 && (
          importedName.includes(candidateName) ||
          importedName.endsWith(candidatePath.replace(/\.[^.]+$/, ""))
        );
      });

      if (target && !edges.some((edge) => edge.from === source.file && edge.to === target.file)) {
        edges.push({ from: source.file, to: target.file });
      }
    });
  });

  return { layers, edges: edges.slice(0, 24) };
}

function getArchitectureLayerId(filePath) {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop().replace(/\.[^.]+$/, "");

  if (/^(main|index|app|streamlit)(_app)?$/.test(fileName)) return "entry";
  if (/(^|\/)(router|routers|route|routes|api|frontend)(\/|$)/.test(normalizedPath)) return "interface";
  if (/(^|\/)(service|services|parser|parsers|agent|agents|processor|processors)(\/|$)/.test(normalizedPath)) return "processing";
  if (/(^|\/)(database|model|models|schema|schemas|embedding|embeddings|vector|rag)(\/|$)/.test(normalizedPath)) return "intelligence";
  if (/(^|\/)(config|configs|util|utils|test|tests)(\/|$)/.test(normalizedPath)) return "support";
  return "processing";
}

function getArchitectureFileName(filePath) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function getArchitectureExplanation(repository, folders, sourceFiles, imports) {
  const folderNames = folders.map((folder) => folder.name).join(", ");
  return `${repository} is organized as a source-code repository with ${sourceFiles} analyzed files and ${imports} detected imports. Its main areas include ${folderNames || "the project root"}. The application flow generally moves from entry points and routes into services, parsers, agents, or data-access modules, while tests and configuration support those runtime paths. RepoMind extracted these relationships from the actual file tree and syntax, so this view is a structural overview rather than a generic template.`;
}

// ============================================================
// EXTENSION HELPER
// ============================================================

function getExtension(
  filePath = ""
) {
  const name =
    filePath.split(
      /[\\/]/
    ).pop() || "";

  const index =
    name.lastIndexOf(".");

  if (index === -1) {
    return "";
  }

  return name
    .substring(index)
    .toLowerCase();
}

// ============================================================
// FILE ICON HELPER
// ============================================================

function getFileIconForPath(
  filePath
) {
  const extension =
    getExtension(
      filePath
    );

  switch (extension) {
    case ".py":
      return "PY";

    case ".js":
    case ".jsx":
      return "JS";

    case ".ts":
    case ".tsx":
      return "TS";

    case ".java":
      return "JV";

    case ".cpp":
      return "C++";

    case ".c":
      return "C";

    case ".go":
      return "GO";

    case ".rs":
      return "RS";

    case ".json":
      return "{}";

    case ".html":
      return "HTML";

    case ".css":
      return "CSS";

    case ".md":
      return "MD";

    default:
      return "FILE";
  }
}

// ============================================================
// REPOSITORY NAME HELPER
// ============================================================

function getRepositoryNameFromUrl(
  url = ""
) {
  try {
    const cleanUrl =
      url
        .trim()
        .replace(
          /\/+$/,
          ""
        )
        .replace(
          /\.git$/,
          ""
        );

    const parts =
      cleanUrl.split(
        "/"
      );

    return (
      parts[parts.length - 1] ||
      "Repository"
    );

  } catch {
    return "Repository";
  }
}

export default App;