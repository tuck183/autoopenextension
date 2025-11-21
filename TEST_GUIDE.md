# Extension Testing Guide

## Step 1: Reload VS Code to Load Updated Extension

1. **Reload the window** to activate the updated extension:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Reload Window" and select it
   - OR press `Ctrl+R` (or `Cmd+R` on Mac)

2. **Verify extension is active**:
   - Open Output panel: `View → Output` (or `Ctrl+Shift+U`)
   - Select "Log (Extension Host)" from the dropdown
   - Look for: `"Open Changed Files extension activated"`

## Step 2: Test Scenarios

### Test 1: Single File Creation (Should OPEN)
**Expected**: File should auto-open

1. Close all open files in VS Code
2. Have an AI agent create a new file: `test-single.js`
3. **Result**: File should automatically open ✅

### Test 2: Two Files with Delay (Should OPEN)
**Expected**: Both files should open

1. Close all open files
2. Have an AI agent create/modify 2 files with a few seconds delay between them
3. **Result**: Both files should open ✅

### Test 3: Three Files with Delay (Should OPEN)
**Expected**: All 3 files should open (spread over 3+ seconds)

1. Close all open files
2. Have an AI agent create/modify 3 files with delays between them
3. **Result**: All 3 files should open ✅

### Test 4: Four Files Rapidly (Should NOT OPEN)
**Expected**: Files should NOT open (detected as batch operation)

1. Close all open files
2. Run a Git operation that changes 4+ files rapidly:
   ```bash
   git checkout <another-branch>
   # or
   git pull
   ```
3. **Result**: Files should NOT open ✅

### Test 5: Git Checkout (Should NOT OPEN)
**Expected**: Files should NOT open

1. Close all open files
2. Switch branches: `git checkout <branch-name>`
3. **Result**: Changed files should NOT open ✅

## Step 3: Monitor Console Logs

To see what the extension is detecting:

1. Open Developer Tools: `Help → Toggle Developer Tools` (or `Ctrl+Shift+I`)
2. Go to the **Console** tab
3. Look for extension logs:
   - `"File change detected: <path>"`
   - `"Is batch operation? <true/false>"`
   - `"Opening file: <path>"` or `"Skipping - ..."`

## Current Thresholds (After Your Update)

- **GIT_BATCH_THRESHOLD**: 4 files
- **GIT_RAPID_THRESHOLD**: 3 files within 1 second
- **Timing check**: If 4+ files change within 2 seconds → Git operation

## Quick Test Script

You can manually test by creating files rapidly vs with delays:

```bash
# Rapid creation (should NOT open - simulates Git)
touch test1.js test2.js test3.js test4.js

# Delayed creation (should OPEN - simulates AI agent)
touch test-delay1.js
sleep 2
touch test-delay2.js
sleep 2
touch test-delay3.js
```

## Troubleshooting

If files aren't opening when they should:
1. Check extension is enabled in Extensions panel
2. Check `openChangedFiles.autoOpen` setting is `true`
3. Check console logs for errors
4. Try reloading VS Code window again


