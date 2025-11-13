# Open Changed Files

This is a VS Code extension that automatically opens files modified or created by agentic AI tools (like Cursor, GitHub Copilot, etc.), while intelligently ignoring user changes, Git operations, and vendor files.

## Features

✅ **Auto-opens AI-generated files** - Automatically opens files when Cursor or other AI tools edit or create them  
✅ **Smart filtering** - Ignores files you're already editing (your changes)  
✅ **Git-aware** - Detects and ignores batch operations from Git (checkout, merge, rebase)  
✅ **Noise filtering** - Automatically ignores build artifacts, vendor files, Laravel cache files, and system directories

## How It Works

The extension monitors file system changes in your workspace and:

1. **Detects file changes** - Watches for files being created or modified
2. **Checks if you're editing** - If you have the file open, it assumes you're making the change (ignores it)
3. **Detects batch operations** - If multiple files change within 2 seconds, it's likely a Git or Composer operation (ignores it)
4. **Opens AI-generated files** - If a file changes/creates and you don't have it open, it opens it for you

## Ignored Directories

The extension automatically ignores changes in these directories:
- `.git/`, `.svn/`, `.hg/` - Version control
- `.cursor/`, `.vscode/` - Editor configuration
- `node_modules/`, `vendor/` - Dependencies
- `build/`, `dist/`, `out/` - Build outputs
- `.next/`, `.nuxt/`, `.cache/` - Framework caches
- `coverage/`, `.nyc_output/` - Test coverage
- `storage/`, `bootstrap/` - Laravel cache directories (including `storage/framework/views`)

## Supported File Types

The extension only processes code files with these extensions:
- JavaScript/TypeScript: `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.cts`, `.mts`
- Web: `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.vue`, `.svelte`, `.astro`, `.mdx`
- Backend: `.php`, `.phtml`, `.py`, `.rb`, `.go`, `.java`, `.cs`, `.kt`, `.kts`, `.rs`
- C/C++: `.cpp`, `.cxx`, `.cc`, `.c`, `.h`, `.hpp`, `.hh`
- Config: `.json`, `.yml`, `.yaml`, `.xml`, `.md`, `.sql`
- Scripts: `.sh`, `.ps1`, `.bat`

## Configuration

### `openChangedFiles.autoOpen`

Enable or disable automatic file opening.

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically open files when they are changed on disk.

## Usage

1. Install the extension
2. The extension activates automatically when you open a workspace
3. When Cursor (or another AI tool) edits or creates a file, it will automatically open in your editor
4. Files you're already editing won't be auto-opened (to avoid interrupting your work)

## Examples

### Scenario 1: Cursor creates a new file
- Cursor generates `utils/helper.js`
- File automatically opens so you can review the changes

### Scenario 2: Cursor edits an existing file
- Cursor modifies `src/components/Button.tsx`
- If you don't have it open, it automatically opens
- If you're already editing it, it won't interrupt you

### Scenario 3: Git checkout
- You run `git checkout feature-branch`
- Multiple files change at once
- Extension detects batch operation and ignores all changes

## Requirements

- VS Code version 1.80.0 or higher

## Installation

### From VSIX

1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions view (Ctrl+Shift+X)
4. Click `...` menu → "Install from VSIX..."
5. Select the `.vsix` file

### From Command Line

```bash
code --install-extension open-changed-files-1.0.0.vsix
```

## Development

### Building

```bash
npm install
npx @vscode/vsce package --allow-missing-repository --allow-star-activation
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

If you encounter any issues or have feature requests, please open an issue on the repository.

