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
  const BATCH_DETECTION_WINDOW = 5000; // 5 second window to detect batch changes (Git operations can take time)
  const GIT_BATCH_THRESHOLD = 4; // If 3+ files change, likely a batch operation (Git, composer, etc.)
  const GIT_RAPID_THRESHOLD = 3; // If 2 files change within 1 second, likely Git (very fast)
  const RAPID_CHANGE_WINDOW = 1000; // 1 second window for rapid changes (Git operations are usually very fast)

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
   * Key distinction: Git operations are VERY rapid (all files change within 1-2 seconds)
   * AI agents usually have some delay between file changes
   */
  function isLikelyBatchOperation() {
    const now = Date.now();
    const recentChanges = Array.from(recentFileChanges.values())
      .filter(timestamp => (now - timestamp) < BATCH_DETECTION_WINDOW);

    // Check for very rapid changes (within 1 second) - this is almost certainly Git
    const rapidChanges = recentChanges.filter(timestamp => (now - timestamp) < RAPID_CHANGE_WINDOW);
    if (rapidChanges.length >= GIT_RAPID_THRESHOLD) {
      // If 2+ files changed within 1 second, it's very likely Git
      return true;
    }

    // For slower changes, check if they're all happening very close together
    // Git operations: files change within 1-2 seconds of each other
    // AI agents: files change with more spacing (2-5 seconds apart)
    if (recentChanges.length >= GIT_BATCH_THRESHOLD) {
      // Sort timestamps to check spacing
      const sortedChanges = [...recentChanges].sort((a, b) => a - b);

      // Check if all changes happened within a 2-second window
      // (Git operations are very tight, AI agents have more spread)
      const timeSpan = sortedChanges[sortedChanges.length - 1] - sortedChanges[0];
      if (timeSpan < 2000) {
        // All files changed within 2 seconds - very likely Git
        return true;
      }

      // If changes are spread over 3+ seconds, it might be an AI agent
      // Allow these through (return false)
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

    // Wait a bit to see if this is part of a batch operation (like Git)
    // Use a shorter wait for initial check, then check again
    await new Promise(resolve => setTimeout(resolve, Math.min(BATCH_DETECTION_WINDOW, 3000)));

    // If multiple files changed in quick succession, it's likely Git - ignore
    const isBatch = isLikelyBatchOperation();
    console.log('Is batch operation?', isBatch, 'recent changes:', recentFileChanges.size);

    if (isBatch) {
      // Mark that we're in a Git operation period
      gitOperationActive = true;
      gitOperationEndTime = Date.now() + GIT_OPERATION_COOLDOWN;
      console.log('Skipping - detected as batch operation (likely Git), setting Git operation period');
      return;
    }

    // Additional check: if file is in Git repository and we're seeing rapid changes, it's likely Git
    const isInRepo = await isFileInGitRepository(uri.fsPath);
    if (isInRepo) {
      // Check again after a short delay to see if more files changed
      await new Promise(resolve => setTimeout(resolve, 1000));
      const isStillBatch = isLikelyBatchOperation();
      if (isStillBatch) {
        gitOperationActive = true;
        gitOperationEndTime = Date.now() + GIT_OPERATION_COOLDOWN;
        console.log('Skipping - file in Git repo during batch operation:', uri.fsPath);
        return;
      }
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
