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
- Files in `vendor/`, `node_modules/`, `.git/`, `build/`, `dist/`, `cache/`
- Lock files: `yarn.lock`, `package-lock.json`
- Other: `.env`, `.lock`, `.log`, `.sql`, `.txt`

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

