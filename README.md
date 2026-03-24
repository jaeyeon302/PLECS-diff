
# PLECS Diff Viewer

![PLECS Diff Viewer Screenshot](assets/screenshot.png)

Visual diff viewer for PLECS circuit files (`.plecs`) across Git commits inside VS Code.


## Features

- Compare a PLECS file between two commits, or between a commit and your working copy.
- Open from status bar command (`PLECS Diff`) or from file context menu.
- View circuit-level changes and navigate subsystem differences in the panel.

## Requirements

- VS Code `1.85.0` or newer
- A Git repository containing `.plecs` files
- PLECS files committed in Git history for commit-to-commit comparisons

## Install (Offline VSIX)

Use this method when internet access is restricted or Marketplace install is unavailable.

1. Build the VSIX package:

```bash
./build.sh
```

Optional: set a temporary package version for that build only:

```bash
./build.sh --version 0.2.0
```

2. Install in VS Code using command line:

```bash
code --install-extension build_extension/<generated-file>.vsix
```

Example:

```bash
code --install-extension build_extension/plecs-diff-viewer-0.2.0.vsix
```

3. Install in VS Code UI:

1. Open Extensions view.
2. Select the `...` menu.
3. Choose `Install from VSIX...`.
4. Select the VSIX file from `build_extension/`.

## How To Use

### Option A: Open from Status Bar

1. Open a workspace that contains `.plecs` files in a Git repository.
2. Click `PLECS Diff` in the VS Code status bar.
3. Select the target `.plecs` file (if prompted).
4. In the panel, choose the `OLD` and `NEW` commits (or `Working Copy`).
5. Click compare to view the visual diff.

### Option B: Open from File Context

1. In Explorer, right-click a `.plecs` file.
2. Select `PLECS Diff: Compare File Between Commits`.
3. Select `OLD` and `NEW` versions in the panel.

## Build And Package

```bash
./build.sh
```

Build output:

- VSIX file is generated under `build_extension/`.
- The package includes this `README.md` file and uses it as the extension readme.

## Development

Install dependencies:

```bash
npm install
```

Build extension bundle:

```bash
npm run build
```

Watch mode:

```bash
npm run watch
```

## Troubleshooting

- `Failed to get git log`: make sure the workspace root is a Git repository and the file is tracked.
- `Error loading diff`: verify the selected file exists in the selected commit and is a valid PLECS file.
- No `.plecs` files found: open the correct workspace folder and check file extension.
