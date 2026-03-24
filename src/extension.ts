/**
 * VS Code extension entry point for PLECS Diff Viewer.
 *
 * Provides:
 * - A status-bar button (like Git Graph) that opens the PLECS Diff panel
 * - Commit selection happens *inside* the webview panel, not via quick-picks
 * - Activates when .plecs files are found in the workspace
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { parsePlecsFile } from './plecsParser';
import { diffCircuits } from './diffEngine';
import { PlecsDiffPanel } from './diffViewPanel';

const MAX_GIT_STDOUT_BYTES = 200 * 1024 * 1024;

// ── Git helpers ──

function toGitPath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath).split(path.sep).join('/');
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn('git', args, { cwd });
    const stdoutChunks: Buffer[] = [];
    let stderr = '';
    let stdoutBytes = 0;
    let killedForLargeStdout = false;

    child.stdout.on('data', chunk => {
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;

      // Keep memory usage bounded for very large git output.
      if (stdoutBytes > MAX_GIT_STDOUT_BYTES) {
        killedForLargeStdout = true;
        child.kill();
      }
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', err => {
      reject(err);
    });

    child.on('close', code => {
      if (killedForLargeStdout) {
        reject(new Error(`git stdout exceeded maxBuffer of ${MAX_GIT_STDOUT_BYTES} bytes`));
        return;
      }

      if (code === 0) {
        const buffer = Buffer.concat(stdoutChunks);
        let stdout = '';
        
        // 윈도우 환경 및 PLECS 특성상 UTF-16 LE 인코딩(BOM: FF FE) 대응
        // Mac 환경에서는 UTF-8로 동작하므로 기본 폴백(Fallback) 유지
        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
          stdout = buffer.toString('utf16le');
        } else {
          stdout = buffer.toString('utf8');
        }
        
        resolve(stdout);
        return;
      }

      const msg = stderr.trim() || `git exited with code ${code}`;
      reject(new Error(msg));
    });
  });
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  date: string;
  message: string;
}

export async function getCommitsForFile(cwd: string, filePath: string): Promise<GitCommit[]> {
  const relPath = toGitPath(cwd, filePath);
  const log = await runGit(cwd, ['log', '--pretty=format:%H|%h|%ai|%s', '--', relPath]);
  return log
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, shortHash, date, ...msgParts] = line.split('|');
      return { hash, shortHash, date, message: msgParts.join('|') };
    });
}

export async function getFileAtCommit(cwd: string, filePath: string, commitHash: string): Promise<string> {
  const relPath = toGitPath(cwd, filePath);
  return runGit(cwd, ['show', `${commitHash}:${relPath}`]);
}

export async function getWorkingCopy(filePath: string): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(filePath);
  return doc.getText();
}

// ── Find .plecs files ──

async function findPlecsFiles(cwd: string): Promise<string[]> {
  const pattern = new vscode.RelativePattern(cwd, '**/*.plecs');
  const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);
  return uris.map(u => u.fsPath);
}

// ── Open panel (status bar button or command palette) ──

async function openPlecsDiff(uri?: vscode.Uri) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }
  const cwd = workspaceFolder.uri.fsPath;

  // Determine the .plecs file
  let filePath: string | undefined;

  if (uri) {
    filePath = uri.fsPath;
  } else {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.fileName.endsWith('.plecs')) {
      filePath = activeEditor.document.fileName;
    }
  }

  if (!filePath) {
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

  // Get commits
  let commits: GitCommit[];
  try {
    commits = await getCommitsForFile(cwd, filePath);
  } catch {
    vscode.window.showErrorMessage('Failed to get git log. Is this a git repository?');
    return;
  }

  // Open the panel — commit selection happens inside the webview
  PlecsDiffPanel.show(cwd, filePath, commits);
}

// ── Activation ──

export function activate(context: vscode.ExtensionContext) {
  // Status bar button — always visible when extension is active
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(git-compare) PLECS Diff';
  statusBarItem.tooltip = 'Open PLECS Diff Viewer';
  statusBarItem.command = 'plecsDiff.open';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('plecsDiff.open', () => openPlecsDiff()),
    vscode.commands.registerCommand('plecsDiff.compareCommits', (uri?: vscode.Uri) => openPlecsDiff(uri)),
  );
}

export function deactivate() {}
