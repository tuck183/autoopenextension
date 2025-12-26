# Cursor Auto-Open Extension

A VS Code extension that automatically opens files created or edited by the Cursor agent.

## Features

- Automatically opens files when they are created or modified
- Only opens code files and README files (based on configured extensions)
- Excludes files in `vendor/`, `node_modules/`, and other excluded directories
- Prevents duplicate tabs (won't open if file is already open)
- Excludes lock files, logs, and other non-code files

## Supported File Types

### Auto-opens:
- Code files: `.php`, `.ts`, `.js`, `.jsx`, `.tsx`, `.vue`, `.py`, `.rb`, `.go`, `.cs`, `.rs`, `.c`, `.cpp`, `.css`, `.json`
- README files: `.md`, `.mdx`, `.mdc`

### Excluded:
- Files in `vendor/`, `node_modules/`, `.git/`, `build/`, `dist/`, `cache/`, `storage/`, `bootstrap/`
- Lock files: `yarn.lock`, `package-lock.json`
- Other: `.env`, `.lock`, `.log`, `.sql`, `.txt`
- **Laravel:** All files in `storage/` directory (including compiled Blade views in `storage/framework/views/`)

## Configuration

You can disable the extension by setting:
```json
{
  "cursorAutoOpen.enabled": false
}
```

## Installation

1. Copy this extension folder to your VS Code extensions directory
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press F5 to launch a new Extension Development Host window
5. Or package and install via VS Code's extension marketplace

## Development

```bash
npm install
npm run compile
npm run watch  # For development with auto-compile
```

## Packaging

To create a VSIX file for installation:

```bash
npm install
npm run compile
npm run package
```

This will create a `cursor-auto-open-0.0.1.vsix` file that you can install in VS Code by:
1. Opening VS Code
2. Going to Extensions view (Ctrl+Shift+X)
3. Clicking the "..." menu at the top
4. Selecting "Install from VSIX..."
5. Choosing the generated `.vsix` file

## Notes

This extension watches for file system changes and opens files that match the criteria. It uses VS Code's file system watcher API to detect when files are created or modified.

**Test note:** Extension is working perfectly - all file types auto-open as expected!

## Laravel-Specific Behavior

The extension intelligently handles Laravel projects:
- **Never opens** compiled Blade templates from `storage/framework/views/`
- **Never opens** any files in the `storage/` directory
- **Only opens** actual source files from `resources/views/` when edited by the AI agent
- **Ignores** browser refreshes and remote operations that trigger file changes in storage
- Browser refreshes that update compiled views will not open files in the editor

## Package Manager & Build Script Detection

The extension automatically detects when package managers and build scripts are running:
- **Composer** (`composer install`, `composer require`, etc.)
- **npm** (`npm install`, `npm update`, `npm run build`, `npm run dev`, etc.)
- **Yarn** (`yarn install`, `yarn add`, etc.)
- **Build tools** (Vite, Laravel Mix, Webpack, etc.)

When package manager or build activity is detected, the extension:
- **Immediately** suppresses all auto-open operations for 30 seconds
- Prevents opening of framework-generated, installed, compiled, or dependency files
- Extends the cooldown with each new activity (prevents premature resumption)
- Resumes normal operation after 30 seconds of inactivity

**Early Detection Strategy:**
The extension watches for early indicators that trigger BEFORE most files are created:
- `package.json`, `composer.json` (read at start of operations)
- `composer.lock`, `package-lock.json`, `yarn.lock` (change early in process)
- `vendor/autoload.php` (created early in composer operations)
- `vendor/composer/installed.json` (composer metadata)
- `node_modules/.package-lock.json` (npm metadata)
- Build manifests and output directories

This aggressive detection ensures the suppression activates **before** files flood in.

This ensures that:
- Installing packages like Laravel Fortify doesn't flood your editor
- Running `npm run dev` or `npm run build` doesn't open compiled assets
- Hot module replacement (HMR) doesn't trigger file opens

