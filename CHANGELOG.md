# Changelog

All notable changes to the "Open Changed Files" extension will be documented in this file.

## [1.1.1] - 2024-12-XX

### Fixed
- **Critical Fix**: Fixed issue where no files were auto-opening due to excessive wait times
  - Removed 1-second wait for single file changes (1-2 files now open immediately)
  - Reduced wait time for 3-9 files from 1 second to 300ms
  - Removed extra Git repository check delay that was blocking all files
  - Single files and pairs now open instantly without any delay
  - 3-9 files open after brief 300ms check (only blocks if 5+ files within 500ms)

### Changed
- Improved file opening logic with smart wait times based on file count
  - 1-2 files: No wait, open immediately
  - 3-9 files: 300ms wait, only block if extremely rapid (5+ within 500ms)
  - 10+ files: 1 second wait for batch detection
- Simplified batch detection to only block extremely rapid changes
- Added better console logging for debugging file opening behavior

## [1.1.0] - 2024-12-XX

### Fixed
- **Critical Fix**: Adjusted batch detection thresholds to allow AI agents to modify 3-9 files without blocking
  - Increased `GIT_RAPID_THRESHOLD` from 3 to 5 files (within 500ms)
  - Increased `GIT_BATCH_THRESHOLD` from 4 to 10 files
  - Reduced wait time from 3 seconds to 1 second for faster file opening
  - Made timing checks more lenient (1 second window instead of 2 seconds)
  - AI agents can now modify multiple files (3-9) and they will all open automatically

### Changed
- Improved batch detection logic with better timing analysis
- Added detailed console logging for batch detection debugging
- Reduced `BATCH_DETECTION_WINDOW` from 5 seconds to 3 seconds

## [1.0.9] - 2024-12-XX

### Fixed
- Improved timing-based batch detection to distinguish Git operations from AI agent changes
  - Git operations: files change within 1-2 seconds (very rapid)
  - AI agents: files change with delays (2-5 seconds apart)
  - Files spread over 3+ seconds are now allowed through (treated as AI agent)

### Changed
- Enhanced `isLikelyBatchOperation()` to analyze timing patterns
- Added time span analysis to detect rapid vs. delayed file changes

## [1.0.8] - 2024-12-XX

### Fixed
- Adjusted batch detection thresholds to be less aggressive
  - Changed `GIT_BATCH_THRESHOLD` from 3 to 4 files
  - Changed `GIT_RAPID_THRESHOLD` from 2 to 3 files
  - This allows AI agents modifying 2-3 files to open properly

## [1.0.7] - 2024-12-XX

### Added
- **Git Operation Detection**: Comprehensive Git operation detection to prevent files from opening during Git commands
  - Detects batch operations (3+ files changing)
  - Detects rapid changes (2+ files within 1 second)
  - Implements "Git operation period" with 10-second cooldown
  - Uses VS Code Git API to check if files are in Git repositories
  - Multi-stage detection with timing analysis

### Changed
- Increased `BATCH_DETECTION_WINDOW` from 2 seconds to 5 seconds
  - Better detection of longer-running Git operations
- Lowered `GIT_BATCH_THRESHOLD` from 3 to 2 files initially (later adjusted)
- Added Git repository awareness checks

## [1.0.6] - 2024-12-XX

### Added
- **Laravel Support**: Added support for ignoring Laravel-specific cache directories
  - Added `storage` directory to ignored paths
  - Added `bootstrap` directory to ignored paths
  - Explicit checks for `storage/framework/*` (cached views, sessions, etc.)
  - Explicit checks for `bootstrap/cache/*` (Laravel bootstrap cache)
  - Prevents cached view files from opening when web pages load

### Fixed
- Fixed issue where `composer update` would open vendor files
  - Vendor files are now properly ignored
- Fixed issue where Laravel cached view files would open when loading web pages
  - `storage/framework/views` files are now ignored

### Changed
- Improved path normalization for cross-platform compatibility (Windows/Unix)
- Updated ignored directories list with Laravel-specific paths

## [1.0.5] - 2024-12-XX

### Changed
- Version bump (no functional changes documented)

## [1.0.4] - 2024-12-XX

### Initial Release
- Basic file watching and auto-opening functionality
- Ignores files in `node_modules`, `vendor`, `.git`, build directories
- Detects if user has file open (doesn't auto-open if already open)
- Basic batch operation detection (3+ files within 500ms)
- Supports common file extensions (JS, TS, PHP, Python, etc.)
- Configuration option: `openChangedFiles.autoOpen`

### Features
- Auto-opens files modified or created by AI agents (Cursor, Copilot, etc.)
- Smart filtering to ignore user changes (files already open)
- Basic Git-aware detection (batch operations)
- Noise filtering for build artifacts and vendor files

---

## [1.0.0] - 2024-12-XX

### Initial Release
- First version of the extension
- Core functionality for auto-opening files changed by AI agents

---

## Summary of Major Improvements (1.0.0 → 1.1.1)

1. **Laravel Support**: Added comprehensive Laravel cache directory ignoring
2. **Git Detection**: Implemented sophisticated Git operation detection to prevent files from opening during Git commands
3. **Threshold Optimization**: Fine-tuned batch detection thresholds to allow AI agents to modify multiple files (3-9) while still blocking Git operations
4. **Timing Analysis**: Added intelligent timing pattern analysis to distinguish rapid Git operations from AI agent changes
5. **Performance**: Optimized wait times - single files open immediately, 3-9 files open after 300ms check
6. **Critical Fix (1.1.1)**: Fixed blocking issue where excessive wait times prevented all files from opening

