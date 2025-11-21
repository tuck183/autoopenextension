# Extension Verification Guide

## How to Verify the Extension is Working

### Step 1: Check Extension is Installed and Active
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Open Changed Files"
4. Verify it's installed and enabled
5. Check the Output panel (View → Output) and select "Log (Extension Host)" to see extension logs

### Step 2: Test Single File Creation (Should Open)
1. Close all files in VS Code
2. Have an AI agent (like Cursor) create a NEW single file (e.g., `test-new-file.js`)
3. The file should automatically open

### Step 3: Test Multiple Files from AI (Should Open)
1. Close all files in VS Code
2. Have an AI agent modify 2 files with a small delay between them
3. Both files should open (they're not rapid enough to be Git)

### Step 4: Test Git Operations (Should NOT Open)
1. Close all files in VS Code
2. Run `git checkout <branch>` or `git pull`
3. Files should NOT automatically open (detected as batch operation)

### Step 5: Check Console Logs
1. Open Developer Tools (Help → Toggle Developer Tools)
2. Check Console for extension logs:
   - "Open Changed Files extension activated"
   - "File change detected: ..."
   - "Is batch operation? ..."
   - "Opening file: ..." or "Skipping - ..."

## Current Behavior

The extension uses timing patterns to distinguish Git operations from AI agent changes:

- **3+ files changing within 2 seconds** = Rapid batch (Git, composer) → Files DON'T open
- **3+ files changing spread over 3+ seconds** = AI agent (has delays) → Files DO open
- **2 files changing within 1 second** = Rapid change (likely Git) → Files DON'T open  
- **2 files changing with delay** = Could be AI agent → Files DO open
- **1 file changing** = Likely AI agent → File DOES open
- **Files already open** = User is editing → File DOESN'T open again

### Key Insight
Git operations are **very rapid** - all files change almost simultaneously (within 1-2 seconds). AI agents typically have **small delays** between file changes (2-5 seconds apart), which allows the extension to distinguish them.

## Troubleshooting

If files aren't opening when they should:
1. Check `openChangedFiles.autoOpen` setting is `true`
2. Check extension is enabled
3. Check console logs for errors
4. Reload VS Code window (Ctrl+R or Cmd+R)

