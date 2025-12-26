import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Test comment: Editing extension.ts to test auto-open functionality
// Test 6: Testing with improved vscode.open command approach
// Test 7: Testing with preserveFocus: false and viewColumn options - should ensure visibility

// Allowed file extensions
const ALLOWED_EXTENSIONS = [
  '.php', '.ts', '.js', '.jsx', '.tsx', '.vue',
  '.py', '.rb', '.go', '.cs', '.rs', '.c', '.cpp',
  '.css', '.json',
  '.md', '.mdx', '.mdc' // README-style files
];

// Test comment: This file was edited to test auto-open functionality

// Disallowed file names/patterns
const DISALLOWED_PATTERNS = [
  /^yarn\.lock$/,
  /^package-lock\.json$/,
  /\.env$/,
  /\.lock$/,
  /\.log$/,
  /\.sql$/,
  /\.txt$/
];

// Excluded directories
const EXCLUDED_DIRS = [
  'vendor',
  'node_modules',
  '.git',
  'build',
  'dist',
  'cache',
  '.cache',
  'storage',  // Laravel storage directory (includes compiled views)
  'bootstrap' // Laravel bootstrap cache
];

let fileWatcher: vscode.FileSystemWatcher | undefined;
let openedFiles = new Set<string>();
let lastCheckedFiles = new Map<string, number>();
let outputChannel: vscode.OutputChannel;

// Track documents that were just created/modified
const documentModificationTimes = new Map<string, number>();
// Track files that were opened by this extension (to avoid re-opening)
const autoOpenedFiles = new Set<string>();

// Track package manager operations (composer, npm, etc.)
let isPackageManagerRunning = false;
let packageManagerCooldown: NodeJS.Timeout | undefined;

function log(message: string) {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
  console.log(message);
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Cursor Auto-Open');
  log('Cursor Auto-Open extension activated');

  const config = vscode.workspace.getConfiguration('cursorAutoOpen');

  if (!config.get<boolean>('enabled', true)) {
    log('Extension is disabled in settings');
    return;
  }

  // Get workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    console.log('No workspace folders found');
    return;
  }

  // Create file watcher for all workspace folders
  const pattern = new vscode.RelativePattern(
    workspaceFolders[0],
    '**/*'
  );

  fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  // Aggressive package manager detection
  // Strategy: Watch for early indicators and set a LONG cooldown immediately

  // 1. Watch package definition files - these are read at the START of operations
  const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
  const composerJsonWatcher = vscode.workspace.createFileSystemWatcher('**/composer.json');

  // 2. Watch lock files - these change early in the process
  const lockFileWatcher = vscode.workspace.createFileSystemWatcher('**/{composer.lock,package-lock.json,yarn.lock}');

  // 3. Watch vendor/autoload.php and node_modules/.package-lock.json (created early)
  const autoloadWatcher = vscode.workspace.createFileSystemWatcher('**/vendor/autoload.php');
  const npmLockWatcher = vscode.workspace.createFileSystemWatcher('**/node_modules/.package-lock.json');

  // 4. Watch specific indicator files that signal package manager activity
  const composerInstalledWatcher = vscode.workspace.createFileSystemWatcher('**/vendor/composer/installed.json');

  // 5. Watch build output directories (for npm run commands)
  const buildWatcher = vscode.workspace.createFileSystemWatcher('**/{public/build,public/js,public/css,dist}/**');
  const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/{mix-manifest.json,manifest.json,.vite/manifest.json}');

  let activityStartTime = 0;

  const handlePackageManagerActivity = (source: string) => {
    const now = Date.now();

    if (!isPackageManagerRunning) {
      isPackageManagerRunning = true;
      activityStartTime = now;
      log(`🚫 Package manager/build activity detected (${source}) - suppressing auto-open for 30 seconds`);
    } else {
      // Already running, extend the cooldown
      log(`🔄 Package manager activity continuing (${source}) - extending cooldown`);
    }

    // Clear existing cooldown and set new one
    if (packageManagerCooldown) {
      clearTimeout(packageManagerCooldown);
    }

    // Increased to 30 seconds for more thorough coverage
    packageManagerCooldown = setTimeout(() => {
      isPackageManagerRunning = false;
      const duration = ((Date.now() - activityStartTime) / 1000).toFixed(1);
      log(`✅ Package manager cooldown expired after ${duration}s - resuming auto-open`);
    }, 30000); // 30 second cooldown
  };

  // Package definition files - watch for changes (composer require, npm install <package>)
  packageJsonWatcher.onDidChange(() => handlePackageManagerActivity('package.json'));
  composerJsonWatcher.onDidChange(() => handlePackageManagerActivity('composer.json'));

  // Lock files - these change at the START and END of operations
  lockFileWatcher.onDidChange(() => handlePackageManagerActivity('lock file'));
  lockFileWatcher.onDidCreate(() => handlePackageManagerActivity('lock file created'));

  // Autoload files - created very early in composer operations
  autoloadWatcher.onDidChange(() => handlePackageManagerActivity('autoload.php'));
  autoloadWatcher.onDidCreate(() => handlePackageManagerActivity('autoload.php created'));

  // npm lock file in node_modules
  npmLockWatcher.onDidChange(() => handlePackageManagerActivity('node_modules lock'));
  npmLockWatcher.onDidCreate(() => handlePackageManagerActivity('node_modules lock created'));

  // Composer installed.json
  composerInstalledWatcher.onDidChange(() => handlePackageManagerActivity('composer installed.json'));
  composerInstalledWatcher.onDidCreate(() => handlePackageManagerActivity('composer installed.json created'));

  // Build outputs
  buildWatcher.onDidChange(() => handlePackageManagerActivity('build output'));
  buildWatcher.onDidCreate(() => handlePackageManagerActivity('build output created'));
  manifestWatcher.onDidChange(() => handlePackageManagerActivity('build manifest'));
  manifestWatcher.onDidCreate(() => handlePackageManagerActivity('build manifest created'));

  context.subscriptions.push(
    packageJsonWatcher,
    composerJsonWatcher,
    lockFileWatcher,
    autoloadWatcher,
    npmLockWatcher,
    composerInstalledWatcher,
    buildWatcher,
    manifestWatcher
  );

  // Watch for file creation
  fileWatcher.onDidCreate(async (uri) => {
    log(`File created: ${uri.fsPath}`);

    if (isPackageManagerRunning) {
      log(`Skipping file creation (package manager is running): ${uri.fsPath}`);
      return;
    }

    if (shouldAutoOpen(uri)) {
      log(`Should auto-open created file: ${uri.fsPath}`);
      await openFile(uri);
    } else {
      log(`Skipping created file (doesn't match criteria): ${uri.fsPath}`);
    }
  });

  // Watch for file changes (external file system changes)
  // Note: This can fire on browser refreshes, package managers, or remote operations
  // We'll be more selective about which changes trigger auto-open
  fileWatcher.onDidChange(async (uri) => {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    log(`File changed (external): ${relativePath}`);

    if (isPackageManagerRunning) {
      log(`Skipping file change (package manager is running): ${relativePath}`);
      return;
    }

    // Skip if it's a Laravel storage file (e.g., compiled views from browser refresh)
    if (relativePath.includes('storage/') || relativePath.includes('storage\\')) {
      log(`Ignoring external change in storage directory: ${relativePath}`);
      return;
    }

    if (shouldAutoOpen(uri)) {
      const filePath = uri.fsPath;
      const now = Date.now();
      const lastChecked = lastCheckedFiles.get(filePath) || 0;

      // Debounce: don't check the same file more than once per 2 seconds
      // Increased from 1s to reduce noise from browser refreshes
      if (now - lastChecked < 2000) {
        log(`Skipping ${filePath} (debounced - likely browser refresh or auto-update)`);
        return;
      }

      lastCheckedFiles.set(filePath, now);

      // Add a small delay to ensure file is fully written
      await new Promise(resolve => setTimeout(resolve, 200));
      await openFile(uri);
    } else {
      log(`Skipping changed file (doesn't match criteria): ${relativePath}`);
    }
  });

  context.subscriptions.push(fileWatcher);

  // Track when documents are first opened to detect new files being edited
  const openedDocuments = new Set<string>();

  // Watch for when documents are opened
  const openDisposable = vscode.workspace.onDidOpenTextDocument(async (document) => {
    if (document.uri.scheme === 'file') {
      const filePath = document.uri.fsPath;
      openedDocuments.add(filePath);
      documentModificationTimes.set(filePath, Date.now());
      log(`Document opened: ${filePath}`);
    }
  });

  context.subscriptions.push(openDisposable);

  // Watch for when documents change (catches edits made through VS Code APIs)
  // This is the key - when Cursor agent edits files, it uses VS Code's edit API
  const changeDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const document = event.document;

    if (isPackageManagerRunning) {
      return; // Silently skip during package manager operations
    }

    if (document.uri.scheme === 'file' && shouldAutoOpen(document.uri)) {
      const filePath = document.uri.fsPath;
      const now = Date.now();

      // If this document was just opened (within last 500ms), it might be a new edit
      // Check if it's visible - if not, open it
      const visibleEditors = vscode.window.visibleTextEditors;
      const isVisible = visibleEditors.some(editor => editor.document.uri.fsPath === filePath);

      if (!isVisible && !autoOpenedFiles.has(filePath)) {
        // File was edited but is not visible - open it
        log(`File changed (internal), not visible, opening: ${filePath}`);
        documentModificationTimes.set(filePath, now);
        await new Promise(resolve => setTimeout(resolve, 100));
        await openFile(document.uri);
      }
    }
  });

  context.subscriptions.push(changeDisposable);

  // Watch for when files are saved
  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (isPackageManagerRunning) {
      return; // Silently skip during package manager operations
    }

    if (document.uri.scheme === 'file' && shouldAutoOpen(document.uri)) {
      const filePath = document.uri.fsPath;
      documentModificationTimes.set(filePath, Date.now());

      log(`File saved: ${filePath}`);

      // Check if file is already visible
      const visibleEditors = vscode.window.visibleTextEditors;
      const isVisible = visibleEditors.some(editor => editor.document.uri.fsPath === filePath);

      if (!isVisible && !autoOpenedFiles.has(filePath)) {
        log(`File saved but not visible, should auto-open: ${filePath}`);
        // Small delay to ensure UI is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        await openFile(document.uri);
      } else {
        log(`File saved but already visible or auto-opened: ${filePath}`);
      }
    }
  });

  context.subscriptions.push(saveDisposable);

  // Track opened files
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      openedFiles.add(editor.document.uri.fsPath);
    }
  });

  // Clean up opened files set when documents are closed
  vscode.workspace.onDidCloseTextDocument((doc) => {
    openedFiles.delete(doc.uri.fsPath);
  });

  log('Cursor Auto-Open extension setup complete');

  // Don't auto-show output channel - user can open manually if needed
  // outputChannel.show(true);
}

function shouldAutoOpen(uri: vscode.Uri): boolean {
  const filePath = uri.fsPath;
  const relativePath = vscode.workspace.asRelativePath(uri, false);

  // Laravel-specific: Never open compiled Blade templates from storage/framework/views
  if (relativePath.includes('storage/framework/views') ||
    relativePath.includes('storage\\framework\\views')) {
    log(`Skipping Laravel compiled view: ${relativePath}`);
    return false;
  }

  // Laravel-specific: Never open any files in storage directory
  if (relativePath.startsWith('storage/') || relativePath.startsWith('storage\\')) {
    log(`Skipping Laravel storage file: ${relativePath}`);
    return false;
  }

  // Check if file is in excluded directory
  const pathParts = relativePath.split(path.sep);
  for (const part of pathParts) {
    if (EXCLUDED_DIRS.includes(part.toLowerCase())) {
      log(`Skipping file in excluded directory (${part}): ${relativePath}`);
      return false;
    }
  }

  // Check if file matches disallowed patterns
  const fileName = path.basename(filePath);
  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(fileName)) {
      log(`Skipping file matching disallowed pattern: ${relativePath}`);
      return false;
    }
  }

  // Check if file has allowed extension
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return false;
  }

  // Additional checks for specific file types
  // Exclude lock files even if they have .json extension
  if (fileName === 'yarn.lock' || fileName === 'package-lock.json') {
    return false;
  }

  return true;
}

async function openFile(uri: vscode.Uri): Promise<void> {
  const filePath = uri.fsPath;
  log(`Attempting to open file: ${filePath}`);

  // Check if file exists
  try {
    await fs.promises.access(filePath);
  } catch {
    log(`File does not exist yet: ${filePath}`);
    // File doesn't exist yet, might be a race condition
    return;
  }

  // Check file size - VS Code has a 50MB limit
  try {
    const stats = await fs.promises.stat(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > 50) {
      log(`File too large (${fileSizeMB.toFixed(2)}MB), skipping: ${filePath}`);
      return;
    }
  } catch (error) {
    log(`Could not check file size: ${filePath} - ${error}`);
    // Continue anyway
  }

  // Check all open text documents (including untitled and closed but in memory)
  const openDocuments = vscode.workspace.textDocuments;

  for (const doc of openDocuments) {
    if (doc.uri.fsPath === filePath && doc.uri.scheme === 'file') {
      // File is already open in memory, check if it's visible
      const visibleEditors = vscode.window.visibleTextEditors;
      const isVisible = visibleEditors.some(editor => editor.document.uri.fsPath === filePath);

      if (isVisible) {
        // File is already visible, don't open again
        log(`File already visible: ${filePath}`);
        openedFiles.add(filePath);
        autoOpenedFiles.add(filePath);
        return;
      } else {
        // File is in memory but not visible, show it
        log(`File in memory but not visible, showing: ${filePath}`);
        openedFiles.add(filePath);
        autoOpenedFiles.add(filePath);
        try {
          // Use preserveFocus: false to ensure the file gets focus and becomes visible
          await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Active
          });
          log(`Successfully showed file: ${filePath}`);
        } catch (error) {
          log(`Failed to show file: ${filePath} - ${error}`);
          // Fallback: try opening via command
          try {
            await vscode.commands.executeCommand('vscode.open', doc.uri);
            log(`Successfully opened file via command (fallback): ${filePath}`);
          } catch (error2) {
            log(`Fallback command also failed: ${filePath} - ${error2}`);
          }
        }
        return;
      }
    }
  }

  // File is not open, open it
  // The 50MB error is a VS Code API bug/quirk, not an actual file size issue
  // Use a more reliable approach with proper delays and error handling

  // Add delay to let VS Code process the file system change
  await new Promise(resolve => setTimeout(resolve, 300));

  // Try using VS Code's open command as primary method (more reliable)
  try {
    log(`Opening file via command: ${filePath}`);
    await vscode.commands.executeCommand('vscode.open', uri);
    openedFiles.add(filePath);
    autoOpenedFiles.add(filePath);
    log(`Successfully opened file via command: ${filePath}`);
    return;
  } catch (error1: any) {
    log(`Command method failed: ${filePath} - ${error1?.message || error1}`);
  }

  // Fallback: Try showTextDocument directly with URI
  try {
    log(`Trying showTextDocument with URI: ${filePath}`);
    await vscode.window.showTextDocument(uri, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Active
    });
    openedFiles.add(filePath);
    autoOpenedFiles.add(filePath);
    log(`Successfully opened file via showTextDocument: ${filePath}`);
    return;
  } catch (error2: any) {
    const errorMessage = error2?.message || String(error2);
    log(`showTextDocument failed: ${filePath} - ${errorMessage}`);

    // If it's the false 50MB error, wait longer and retry
    if (errorMessage.includes('50MB') || errorMessage.includes('synchronized')) {
      log(`Detected false 50MB error, waiting longer and retrying: ${filePath}`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        await vscode.window.showTextDocument(uri, {
          preview: false,
          preserveFocus: false,
          viewColumn: vscode.ViewColumn.Active
        });
        openedFiles.add(filePath);
        autoOpenedFiles.add(filePath);
        log(`Successfully opened file after retry: ${filePath}`);
        return;
      } catch (error3: any) {
        log(`Retry also failed: ${filePath} - ${error3?.message || error3}`);
      }
    }
  }

  // Last resort: Try openTextDocument
  try {
    log(`Trying openTextDocument as last resort: ${filePath}`);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Active
    });
    openedFiles.add(filePath);
    autoOpenedFiles.add(filePath);
    log(`Successfully opened file via openTextDocument: ${filePath}`);
  } catch (error4: any) {
    log(`All methods failed for: ${filePath} - ${error4?.message || error4}`);
  }
}

export function deactivate() {
  if (fileWatcher) {
    fileWatcher.dispose();
  }
  openedFiles.clear();
  autoOpenedFiles.clear();
  if (outputChannel) {
    outputChannel.dispose();
  }
}

