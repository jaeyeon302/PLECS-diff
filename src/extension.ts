/**
 * VS Code extension entry point for PLECS Diff Viewer.
 *
 * Provides the command "PLECS Diff: Compare File Between Commits" which:
 * 1. Lets the user pick a .plecs file (or uses the current file / right-click target)
 * 2. Shows a list of git commits that touched the file
 * 3. Lets the user pick OLD and NEW commits
 * 4. Opens a side-by-side rendered diff in a webview panel
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { parsePlecsFile } from './plecsParser';
import { diffCircuits } from './diffEngine';
import { PlecsDiffPanel } from './diffViewPanel';

// ── Git helpers ──

function exec(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

interface GitCommit {
  hash: string;
  shortHash: string;
  date: string;
  message: string;
}

async function getCommitsForFile(cwd: string, filePath: string): Promise<GitCommit[]> {
  const relPath = path.relative(cwd, filePath);
  const log = await exec(
    `git log --pretty=format:"%H|%h|%ai|%s" -- "${relPath}"`,
    cwd,
  );
  return log
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, shortHash, date, ...msgParts] = line.split('|');
      return { hash, shortHash, date, message: msgParts.join('|') };
    });
}

async function getFileAtCommit(cwd: string, filePath: string, commitHash: string): Promise<string> {
  const relPath = path.relative(cwd, filePath);
  return exec(`git show ${commitHash}:"${relPath}"`, cwd);
}

async function getWorkingCopy(filePath: string): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(filePath);
  return doc.getText();
}

// ── Find .plecs files ──

async function findPlecsFiles(cwd: string): Promise<string[]> {
  const pattern = new vscode.RelativePattern(cwd, '**/*.plecs');
  const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);
  return uris.map(u => u.fsPath);
}

// ── Main command ──

async function compareCommits(uri?: vscode.Uri) {
  // Determine workspace root
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const cwd = workspaceFolder.uri.fsPath;

  // Determine the .plecs file to diff
  let filePath: string | undefined;

  if (uri) {
    filePath = uri.fsPath;
  } else {
    // Check active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.fileName.endsWith('.plecs')) {
      filePath = activeEditor.document.fileName;
    }
  }

  if (!filePath) {
    // Let user pick a .plecs file
    const files = await findPlecsFiles(cwd);
    if (files.length === 0) {
      vscode.window.showErrorMessage('No .plecs files found in workspace.');
      return;
    }
    const picks = files.map(f => ({
      label: path.relative(cwd, f),
      detail: f,
    }));
    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Select a .plecs file to diff',
    });
    if (!selected) return;
    filePath = selected.detail;
  }

  // Get commits that modified this file
  let commits: GitCommit[];
  try {
    commits = await getCommitsForFile(cwd, filePath);
  } catch {
    vscode.window.showErrorMessage('Failed to get git log. Is this a git repository?');
    return;
  }

  if (commits.length < 1) {
    vscode.window.showInformationMessage('No git commits found for this file.');
    return;
  }

  // Add "Working Copy" option
  const commitOptions = [
    { label: '$(file) Working Copy', description: 'Current file on disk', hash: 'WORKING' },
    ...commits.map(c => ({
      label: `$(git-commit) ${c.shortHash}`,
      description: `${c.date.substring(0, 10)} — ${c.message}`,
      hash: c.hash,
    })),
  ];

  // Pick OLD commit
  const oldPick = await vscode.window.showQuickPick(commitOptions, {
    placeHolder: 'Select the OLD (base) version',
  });
  if (!oldPick) return;

  // Pick NEW commit
  const newPick = await vscode.window.showQuickPick(commitOptions, {
    placeHolder: 'Select the NEW (compare) version',
  });
  if (!newPick) return;

  if (oldPick.hash === newPick.hash) {
    vscode.window.showInformationMessage('Same version selected for both sides. Nothing to diff.');
    return;
  }

  // Fetch file contents
  try {
    const oldContent = oldPick.hash === 'WORKING'
      ? await getWorkingCopy(filePath)
      : await getFileAtCommit(cwd, filePath, oldPick.hash);

    const newContent = newPick.hash === 'WORKING'
      ? await getWorkingCopy(filePath)
      : await getFileAtCommit(cwd, filePath, newPick.hash);

    // Parse both
    const oldCircuit = parsePlecsFile(oldContent);
    const newCircuit = parsePlecsFile(newContent);

    // Diff
    const diff = diffCircuits(oldCircuit, newCircuit);

    // Labels
    const oldLabel = oldPick.hash === 'WORKING' ? 'Working Copy' : `${oldPick.label.replace('$(git-commit) ', '')} (${oldPick.description})`;
    const newLabel = newPick.hash === 'WORKING' ? 'Working Copy' : `${newPick.label.replace('$(git-commit) ', '')} (${newPick.description})`;

    // Show panel
    PlecsDiffPanel.show(
      vscode.Uri.file(cwd),
      diff,
      oldLabel,
      newLabel,
    );

    if (diff.changes.length === 0) {
      vscode.window.showInformationMessage('No circuit differences found between the selected versions.');
    } else {
      vscode.window.showInformationMessage(
        `Found ${diff.changes.length} difference(s). Use ← → keys or buttons to navigate.`,
      );
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Error: ${err.message}`);
  }
}

// ── Activation ──

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('plecsDiff.compareCommits', compareCommits);
  context.subscriptions.push(disposable);
}

export function deactivate() {}
