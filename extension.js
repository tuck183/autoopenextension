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
    '.next', '.nuxt', '.cache', 'coverage', '.nyc_output'
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

  // Track recent file changes to detect batch operations (like Git)
  const recentFileChanges = new Map();
  const BATCH_DETECTION_WINDOW = 500; // 500ms window to detect batch changes

  function shouldIgnorePath(fsPath) {
    const pathSegments = fsPath.split(path.sep);
    for (const segment of pathSegments) {
      if (IGNORED_DIRS.has(segment.toLowerCase())) {
        return true;
      }
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
   * Check if this is likely a batch operation (like Git checkout/merge)
   * by detecting if multiple files changed within a short time window
   */
  function isLikelyBatchOperation() {
    const now = Date.now();
    const recentChanges = Array.from(recentFileChanges.values())
      .filter(timestamp => (now - timestamp) < BATCH_DETECTION_WINDOW);

    // If 3+ files changed within 500ms, it's likely a batch operation (Git)
    return recentChanges.length >= 3;
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

    // Wait a bit to see if this is part of a batch operation (like Git)
    await new Promise(resolve => setTimeout(resolve, BATCH_DETECTION_WINDOW));

    // If multiple files changed in quick succession, it's likely Git - ignore
    const isBatch = isLikelyBatchOperation();
    console.log('Is batch operation?', isBatch, 'recent changes:', recentFileChanges.size);
    if (isBatch) {
      console.log('Skipping - detected as batch operation (likely Git)');
      return;
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
