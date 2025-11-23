const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
  console.log('Open Changed Files extension activated');
  const config = vscode.workspace.getConfiguration('openChangedFiles');
  const autoOpen = config.get('autoOpen');
  console.log('Auto-open setting:', autoOpen);

  const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);

  // Ignored directories including .cursor/, .vscode/, and build/
  const IGNORED_DIRS = new Set([
    'node_modules', 'vendor', '.git', '.svn', '.hg',
    '.cursor', '.vscode', 'build', 'dist', 'out',
    '.next', '.nuxt', '.cache', 'coverage', '.nyc_output',
    'storage', 'bootstrap' // Laravel directories (storage contains cached views, bootstrap contains cache)
  ]);

  const ALLOWED_EXTS = new Set([
    '.js', '.jsx', '.ts', '.tsx',
    '.mjs', '.cjs', '.cts', '.mts',
    '.php', '.phtml', '.py', '.rb', '.go', '.java', '.cs', '.kt', '.kts', '.rs',
    '.cpp', '.cxx', '.cc', '.c', '.h', '.hpp', '.hh',
    '.vue', '.svelte', '.astro', '.mdx',
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.json', '.yml', '.yaml', '.xml', '.md', '.sql', '.sh', '.ps1', '.bat'
  ]);

  // Cache to track recent file checks and avoid duplicate processing
  const recentChecks = new Map();
  const CHECK_CACHE_TTL = 1000; // 1 second

  // Track recent file changes to detect batch operations (like Git, composer, etc.)
  const recentFileChanges = new Map();
  const BATCH_DETECTION_WINDOW = 3000; // 3 second window to detect batch changes
  const GIT_BATCH_THRESHOLD = 10; // If 10+ files change, likely a batch operation (Git, composer, etc.)
  const GIT_RAPID_THRESHOLD = 5; // If 5+ files change within 500ms, likely Git (very fast)
  const RAPID_CHANGE_WINDOW = 500; // 500ms window for rapid changes (Git operations are extremely fast)

  // Track if we're currently in a Git operation period
  let gitOperationActive = false;
  let gitOperationEndTime = 0;
  const GIT_OPERATION_COOLDOWN = 10000; // 10 seconds after batch detection, assume Git operation is complete

  function shouldIgnorePath(fsPath) {
    const normalizedPath = fsPath.toLowerCase().replace(/\\/g, '/'); // Normalize to forward slashes
    const pathSegments = fsPath.split(path.sep);

    // Check each segment in the path
    for (const segment of pathSegments) {
      if (IGNORED_DIRS.has(segment.toLowerCase())) {
        return true;
      }
    }

    // Additional checks for Laravel-specific paths
    // Ignore storage/framework/* (cached views, sessions, etc.)
    if (normalizedPath.includes('/storage/framework/')) {
      return true;
    }

    // Ignore bootstrap/cache/* (Laravel bootstrap cache)
    if (normalizedPath.includes('/bootstrap/cache/')) {
      return true;
    }

    return false;
  }

  function shouldOpenFile(fsPath) {
    // Ignore files under vendor, VCS, and build directories
    if (shouldIgnorePath(fsPath)) {
      return false;
    }

    // Allow only recognized code file extensions
    const ext = path.extname(fsPath).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) {
      return true;
    }

    return false;
  }

  /**
   * Check if the user currently has this file open in an editor
   * If the file is open, it's likely the user is editing it, not Cursor
   */
  function isFileOpenByUser(fsPath) {
    const openEditors = vscode.window.visibleTextEditors;
    for (const editor of openEditors) {
      if (editor.document.uri.fsPath === fsPath) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a file is likely tracked by Git (heuristic check)
   * Returns true if file is within a Git repository
   */
  async function isFileInGitRepository(fsPath) {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension || !gitExtension.isActive) {
        return false;
      }

      const api = gitExtension.exports.getAPI(1);
      if (!api) {
        return false;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
      if (!workspaceFolder) {
        return false;
      }

      const repository = api.getRepository(workspaceFolder.uri);
      if (!repository) {
        return false;
      }

      // Check if file is within the Git repository
      const repoPath = repository.rootUri.fsPath;
      if (fsPath.startsWith(repoPath)) {
        // File is within Git repository - likely tracked (or would be affected by Git operations)
        return true;
      }
    } catch (err) {
      // If Git API fails, don't block - just return false
      console.log('Git API check failed:', err.message);
    }
    return false;
  }

  /**
   * Check if this is likely a batch operation (like Git checkout/merge, composer update)
   * by detecting if multiple files changed within a short time window
   * 
   * Key distinction: Git operations are EXTREMELY rapid (all files change within 500ms)
   * AI agents may be fast but rarely change 5+ files within 500ms
   */
  function isLikelyBatchOperation() {
    const now = Date.now();
    const recentChanges = Array.from(recentFileChanges.values())
      .filter(timestamp => (now - timestamp) < BATCH_DETECTION_WINDOW);

    // Check for extremely rapid changes (within 500ms) - this is almost certainly Git
    // AI agents rarely modify 5+ files within 500ms
    const rapidChanges = recentChanges.filter(timestamp => (now - timestamp) < RAPID_CHANGE_WINDOW);
    if (rapidChanges.length >= GIT_RAPID_THRESHOLD) {
      // If 5+ files changed within 500ms, it's very likely Git
      console.log('Detected rapid batch:', rapidChanges.length, 'files within', RAPID_CHANGE_WINDOW, 'ms');
      return true;
    }

    // For slower changes, only block if MANY files change (10+)
    // This catches large Git operations while allowing AI agents to modify multiple files
    if (recentChanges.length >= GIT_BATCH_THRESHOLD) {
      // Sort timestamps to check spacing
      const sortedChanges = [...recentChanges].sort((a, b) => a - b);

      // Check if all changes happened within a very tight window (1 second)
      // Git operations: files change within 500ms-1 second of each other
      // AI agents: even if fast, usually have 1-2 second gaps
      const timeSpan = sortedChanges[sortedChanges.length - 1] - sortedChanges[0];
      if (timeSpan < 1000) {
        // 10+ files changed within 1 second - very likely Git
        console.log('Detected large batch:', recentChanges.length, 'files within', timeSpan, 'ms');
        return true;
      }

      // If changes are spread over 1+ seconds, it might be an AI agent
      // Allow these through (return false)
      console.log('Allowing through - changes spread over', timeSpan, 'ms (likely AI agent)');
    }

    return false;
  }

  /**
   * Check if we're currently in a Git operation period
   */
  function isInGitOperationPeriod() {
    const now = Date.now();
    if (gitOperationActive && now < gitOperationEndTime) {
      return true;
    }
    // Reset if cooldown period has passed
    if (now >= gitOperationEndTime) {
      gitOperationActive = false;
    }
    return false;
  }

  /**
   * Handle file changes - open if Cursor/AI made the change
   */
  async function handleFileChange(uri) {
    console.log('File change detected:', uri.fsPath);
    if (!autoOpen || !shouldOpenFile(uri.fsPath)) {
      console.log('Skipping file (autoOpen:', autoOpen, 'shouldOpen:', shouldOpenFile(uri.fsPath), ')');
      return;
    }

    // Avoid duplicate processing
    const now = Date.now();
    const lastCheck = recentChecks.get(uri.fsPath);
    if (lastCheck && (now - lastCheck) < CHECK_CACHE_TTL) {
      return;
    }
    recentChecks.set(uri.fsPath, now);

    // Track this change for batch detection
    recentFileChanges.set(uri.fsPath, now);

    // Clean old cache entries
    if (recentChecks.size > 100) {
      const cutoff = now - CHECK_CACHE_TTL * 10;
      for (const [key, value] of recentChecks.entries()) {
        if (value < cutoff) {
          recentChecks.delete(key);
        }
      }
    }

    // Clean old batch detection entries
    if (recentFileChanges.size > 50) {
      const cutoff = now - BATCH_DETECTION_WINDOW * 2;
      for (const [key, value] of recentFileChanges.entries()) {
        if (value < cutoff) {
          recentFileChanges.delete(key);
        }
      }
    }

    // If user has the file open, they're editing it - don't auto-open
    const isOpen = isFileOpenByUser(uri.fsPath);
    console.log('File open by user?', isOpen, 'for:', uri.fsPath);
    if (isOpen) {
      console.log('Skipping - file is already open by user');
      return;
    }

    // Check if we're in an active Git operation period
    if (isInGitOperationPeriod()) {
      console.log('Skipping - currently in Git operation period:', uri.fsPath);
      return;
    }

    // Count how many files changed recently (within detection window)
    const recentCount = Array.from(recentFileChanges.values())
      .filter(timestamp => (now - timestamp) < BATCH_DETECTION_WINDOW).length;

    console.log('Recent file changes count:', recentCount, 'for:', uri.fsPath);

    // Smart opening logic based on file count
    // 1-2 files: Open immediately (no wait)
    // 3-9 files: Very short wait (300ms) to check for rapid Git operations
    // 10+ files: Longer wait (1s) to detect large Git operations
    
    if (recentCount <= 2) {
      console.log('Single or pair file change - opening immediately');
      // No wait needed, proceed directly to open
    } else if (recentCount >= 3 && recentCount < 10) {
      // 3-9 files: AI agents often modify this many files
      // Only wait briefly to catch extremely rapid Git operations
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check if it's an extremely rapid batch (5+ files within 500ms = Git)
      const rapidChanges = Array.from(recentFileChanges.values())
        .filter(timestamp => (now - timestamp) < RAPID_CHANGE_WINDOW);
      
      if (rapidChanges.length >= GIT_RAPID_THRESHOLD) {
        // 5+ files within 500ms = definitely Git
        gitOperationActive = true;
        gitOperationEndTime = Date.now() + GIT_OPERATION_COOLDOWN;
        console.log('Skipping - rapid batch detected (5+ files within 500ms)');
        return;
      }
      // Otherwise, allow through - likely AI agent
      console.log('Allowing through - 3-9 files with normal timing (likely AI agent)');
    } else {
      // 10+ files: Could be Git or large AI operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const isBatch = isLikelyBatchOperation();
      if (isBatch) {
        gitOperationActive = true;
        gitOperationEndTime = Date.now() + GIT_OPERATION_COOLDOWN;
        console.log('Skipping - large batch operation detected (likely Git)');
        return;
      }
      // Allow through if not detected as batch
    }

    // File was changed/created and user doesn't have it open
    // This is likely from Cursor or another AI tool - open it
    try {
      // Check file size before opening (VS Code has a 50MB limit)
      const stats = fs.statSync(uri.fsPath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > 50) {
        console.log('Skipping file - too large:', uri.fsPath, 'Size:', fileSizeMB.toFixed(2), 'MB');
        return;
      }

      console.log('Opening file:', uri.fsPath, 'Size:', fileSizeMB.toFixed(2), 'MB');

      // Try to open the file - use the URI directly which is more reliable
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
      console.log('File opened successfully:', uri.fsPath);
    } catch (err) {
      // Handle specific error cases
      if (err.message && err.message.includes('50MB')) {
        console.log('Skipping file - exceeds 50MB limit:', uri.fsPath);
      } else if (err.code === 'ENOENT') {
        console.log('File no longer exists:', uri.fsPath);
      } else {
        console.error('Error opening file:', uri.fsPath, err.message || err);
      }
    }
  }

  watcher.onDidChange(handleFileChange);
  watcher.onDidCreate(handleFileChange);

  context.subscriptions.push(watcher);
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
