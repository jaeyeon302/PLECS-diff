/**
 * Webview panel for displaying PLECS circuit diffs side-by-side
 * with navigation between individual changes.
 */

import * as vscode from 'vscode';
import { PlecsCircuit } from './plecsParser';
import { DiffResult } from './diffEngine';
import { renderCircuitSvg } from './circuitRenderer';

export class PlecsDiffPanel {
  public static currentPanel: PlecsDiffPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private rootDiff: DiffResult;
  private currentChangeIndex: number = 0;
  private oldCommitLabel: string;
  private newCommitLabel: string;
  /** Stack of subsystem names we've drilled into */
  private subsystemPath: string[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    diff: DiffResult,
    oldCommitLabel: string,
    newCommitLabel: string,
  ) {
    this.panel = panel;
    this.rootDiff = diff;
    this.oldCommitLabel = oldCommitLabel;
    this.newCommitLabel = newCommitLabel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      null,
      this.disposables,
    );

    this.updateContent();
  }

  /** Resolve the current diff based on subsystemPath */
  private get activeDiff(): DiffResult {
    let diff = this.rootDiff;
    for (const name of this.subsystemPath) {
      const sub = diff.subDiffs.get(name);
      if (!sub) break;
      diff = sub;
    }
    return diff;
  }

  public static show(
    extensionUri: vscode.Uri,
    diff: DiffResult,
    oldCommitLabel: string,
    newCommitLabel: string,
  ) {
    const column = vscode.ViewColumn.One;

    if (PlecsDiffPanel.currentPanel) {
      PlecsDiffPanel.currentPanel.rootDiff = diff;
      PlecsDiffPanel.currentPanel.oldCommitLabel = oldCommitLabel;
      PlecsDiffPanel.currentPanel.newCommitLabel = newCommitLabel;
      PlecsDiffPanel.currentPanel.currentChangeIndex = 0;
      PlecsDiffPanel.currentPanel.subsystemPath = [];
      PlecsDiffPanel.currentPanel.updateContent();
      PlecsDiffPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'plecsDiff',
      `PLECS Diff: ${diff.newCircuit.name}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    PlecsDiffPanel.currentPanel = new PlecsDiffPanel(panel, diff, oldCommitLabel, newCommitLabel);
  }

  private handleMessage(message: { command: string; index?: number; name?: string }) {
    const diff = this.activeDiff;
    switch (message.command) {
      case 'prev':
        if (diff.changes.length > 0) {
          this.currentChangeIndex =
            (this.currentChangeIndex - 1 + diff.changes.length) % diff.changes.length;
          this.updateContent();
        }
        break;
      case 'next':
        if (diff.changes.length > 0) {
          this.currentChangeIndex = (this.currentChangeIndex + 1) % diff.changes.length;
          this.updateContent();
        }
        break;
      case 'goto':
        if (message.index !== undefined && message.index >= 0 && message.index < diff.changes.length) {
          this.currentChangeIndex = message.index;
          this.updateContent();
        }
        break;
      case 'enterSub':
        if (message.name && diff.subDiffs.has(message.name)) {
          this.subsystemPath.push(message.name);
          this.currentChangeIndex = 0;
          this.updateContent();
        }
        break;
      case 'goBack':
        if (this.subsystemPath.length > 0) {
          this.subsystemPath.pop();
          this.currentChangeIndex = 0;
          this.updateContent();
        }
        break;
      case 'goToRoot':
        this.subsystemPath = [];
        this.currentChangeIndex = 0;
        this.updateContent();
        break;
    }
  }

  private updateContent() {
    const diff = this.activeDiff;

    const oldSvg = renderCircuitSvg(
      diff.oldCircuit,
      diff,
      'old',
      this.currentChangeIndex,
    );
    const newSvg = renderCircuitSvg(
      diff.newCircuit,
      diff,
      'new',
      this.currentChangeIndex,
    );

    const totalChanges = diff.changes.length;
    const currentChange = totalChanges > 0 ? diff.changes[this.currentChangeIndex] : null;

    this.panel.webview.html = this.getHtml(oldSvg, newSvg, totalChanges, currentChange, diff);
  }

  private getHtml(
    oldSvg: string,
    newSvg: string,
    totalChanges: number,
    currentChange: { type: string; componentName: string; details: string } | null,
    diff: DiffResult,
  ): string {
    const changeListHtml = diff.changes
      .map((c, i) => {
        const active = i === this.currentChangeIndex ? 'active' : '';
        const icon = getChangeIcon(c.type);
        const enterBtn = c.type === 'subsystem-changed'
          ? ` <button class="enter-sub-btn" data-name="${escapeHtml(c.componentName)}">Enter &gt;</button>`
          : '';
        return `<div class="change-item ${active} change-${c.type}" data-index="${i}">${icon} <strong>${escapeHtml(c.componentName)}</strong>: ${escapeHtml(c.details)}${enterBtn}</div>`;
      })
      .join('');

    // Breadcrumb for subsystem navigation
    const breadcrumbParts = ['Root'];
    for (const name of this.subsystemPath) {
      breadcrumbParts.push(name);
    }
    const breadcrumbHtml = this.subsystemPath.length > 0
      ? `<div class="breadcrumb">
          <button class="breadcrumb-btn" onclick="vscode.postMessage({command:'goToRoot'})">Root</button>
          ${this.subsystemPath.map((name, i) => {
            const isLast = i === this.subsystemPath.length - 1;
            return ` &gt; ${isLast ? `<span class="breadcrumb-current">${escapeHtml(name)}</span>` : `<button class="breadcrumb-btn" onclick="vscode.postMessage({command:'goBack'})">${escapeHtml(name)}</button>`}`;
          }).join('')}
         </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: #1e1e1e;
    --fg: #cccccc;
    --border: #404040;
    --accent: #569cd6;
    --added: #4ec9b0;
    --removed: #f44747;
    --changed: #dcdcaa;
    --position: #c586c0;
    --connection: #9cdcfe;
    --highlight: #ffcc0066;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Header bar ── */
  .header {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    background: #252526;
    border-bottom: 1px solid var(--border);
    gap: 12px;
    flex-shrink: 0;
  }
  .header h2 { font-size: 14px; font-weight: 600; }
  .nav-btn {
    background: #333;
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 4px 12px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 13px;
  }
  .nav-btn:hover { background: #444; }
  .nav-btn:disabled { opacity: 0.4; cursor: default; }
  .change-counter {
    font-size: 13px;
    color: var(--accent);
    min-width: 60px;
    text-align: center;
  }
  .change-detail {
    flex: 1;
    font-size: 12px;
    color: var(--changed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .commit-labels {
    display: flex;
    gap: 16px;
    font-size: 11px;
    color: #888;
  }

  /* ── Main content ── */
  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Side-by-side panels ── */
  .panel-container {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  .panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow: hidden;
  }
  .panel:last-child { border-right: none; }
  .panel-header {
    padding: 6px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    flex-shrink: 0;
  }
  .panel-header.old { color: var(--removed); }
  .panel-header.new { color: var(--added); }
  .svg-container {
    flex: 1;
    overflow: hidden;
    padding: 0;
    position: relative;
    cursor: grab;
  }
  .svg-container.panning { cursor: grabbing; }
  .svg-container svg {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  /* ── Zoom controls ── */
  .zoom-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
  .zoom-btn {
    background: #333;
    border: 1px solid var(--border);
    color: var(--fg);
    width: 28px;
    height: 28px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .zoom-btn:hover { background: #444; }
  .zoom-level {
    font-size: 12px;
    color: #888;
    min-width: 42px;
    text-align: center;
  }

  /* ── Change list sidebar ── */
  .sidebar {
    width: 300px;
    background: #252526;
    border-left: 1px solid var(--border);
    overflow-y: auto;
    flex-shrink: 0;
  }
  .sidebar-header {
    padding: 8px 12px;
    font-weight: 600;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: #252526;
  }
  .change-item {
    padding: 6px 12px;
    border-bottom: 1px solid #333;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.4;
  }
  .change-item:hover { background: #2a2d2e; }
  .change-item.active { background: #37373d; border-left: 3px solid var(--accent); }
  .change-item strong { font-weight: 600; }
  .change-added { border-left-color: var(--added); }
  .change-removed { border-left-color: var(--removed); }
  .change-param-changed { color: var(--changed); }
  .change-position-changed { color: var(--position); }
  .change-connection-changed { color: var(--connection); }
  .change-sim-param-changed { color: #888; }

  /* ── SVG styles ── */
  .circuit-svg {
    max-width: 100%;
    max-height: 100%;
  }
  .circuit-svg { background: white; }
  .circuit-svg .component { stroke: #222; fill: none; }
  .circuit-svg .symbol-text { fill: #222; stroke: none; }
  .circuit-svg .comp-label { fill: #444; }
  .circuit-svg .param-label { fill: #666; }
  .circuit-svg .power-wire { stroke: #222; stroke-width: 1.5; }
  .circuit-svg .signal-wire { stroke: #22aa44; stroke-width: 1.5; }
  .circuit-svg .junction { fill: #222; }
  .circuit-svg .annotation { fill: #444; }

  /* Diff highlighting */
  .circuit-svg .diff-added { stroke: var(--added) !important; fill: none; }
  .circuit-svg .diff-added.comp-label,
  .circuit-svg .diff-added.param-label { fill: var(--added) !important; stroke: none !important; }
  .circuit-svg .diff-removed { stroke: var(--removed) !important; fill: none; }
  .circuit-svg .diff-removed.comp-label,
  .circuit-svg .diff-removed.param-label { fill: var(--removed) !important; stroke: none !important; }
  .circuit-svg .diff-param-changed { stroke: var(--changed) !important; fill: none; }
  .circuit-svg .diff-param-changed.comp-label,
  .circuit-svg .diff-param-changed.param-label { fill: var(--changed) !important; stroke: none !important; }
  .circuit-svg .diff-position-changed { stroke: var(--position) !important; fill: none; }
  .circuit-svg .diff-position-changed.comp-label,
  .circuit-svg .diff-position-changed.param-label { fill: var(--position) !important; stroke: none !important; }

  .circuit-svg .ghost-component {
    stroke: var(--position);
    fill: none;
    opacity: 0.3;
    stroke-dasharray: 3, 3;
  }
  .circuit-svg .position-change-line {
    stroke: var(--position);
    stroke-width: 1;
    stroke-dasharray: 4, 4;
    opacity: 0.5;
  }
  .circuit-svg .highlight-ring {
    fill: var(--highlight);
    stroke: #ffcc00;
    stroke-width: 2;
    stroke-dasharray: 6, 3;
  }
  .circuit-svg .change-annotation {
    fill: var(--changed);
    font-style: italic;
  }

  /* No changes state */
  .no-changes {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #888;
    font-size: 16px;
  }

  /* Keyboard shortcut hint */
  .shortcut-hint {
    font-size: 11px;
    color: #666;
  }

  /* ── Breadcrumb ── */
  .breadcrumb {
    padding: 4px 16px;
    background: #2a2a2a;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: #888;
    flex-shrink: 0;
  }
  .breadcrumb-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
    text-decoration: underline;
  }
  .breadcrumb-btn:hover { color: #7abcf7; }
  .breadcrumb-current { color: var(--fg); font-weight: 600; }

  /* Enter subsystem button */
  .enter-sub-btn {
    background: #333;
    border: 1px solid var(--border);
    color: var(--accent);
    padding: 1px 6px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 11px;
    margin-left: 4px;
  }
  .enter-sub-btn:hover { background: #444; }
  .change-subsystem-changed { color: #ce9178; }
</style>
</head>
<body>

<div class="header">
  <h2>PLECS Diff</h2>
  ${this.subsystemPath.length > 0 ? `<button class="nav-btn" onclick="vscode.postMessage({command:'goBack'})">&#9664; Back</button>` : ''}
  <button class="nav-btn" onclick="navigate('prev')" ${totalChanges === 0 ? 'disabled' : ''}>&#9664; Prev</button>
  <span class="change-counter">${totalChanges > 0 ? `${this.currentChangeIndex + 1} / ${totalChanges}` : 'No changes'}</span>
  <button class="nav-btn" onclick="navigate('next')" ${totalChanges === 0 ? 'disabled' : ''}>Next &#9654;</button>
  <span class="change-detail">${currentChange ? `${getChangeIcon(currentChange.type)} ${escapeHtml(currentChange.details)}` : ''}</span>
  <span class="shortcut-hint">← → keys to navigate</span>
  <div class="zoom-bar">
    <button class="zoom-btn" onclick="zoomBy(-0.2)" title="Zoom out (-)">−</button>
    <span class="zoom-level" id="zoom-level">100%</span>
    <button class="zoom-btn" onclick="zoomBy(0.2)" title="Zoom in (+)">+</button>
    <button class="zoom-btn" onclick="resetView()" title="Reset view (0)" style="font-size:12px;">⟲</button>
  </div>
</div>
${breadcrumbHtml}
<div class="main-content">
  <div class="panel-container">
    <div class="panel">
      <div class="panel-header old">OLD — ${escapeHtml(this.oldCommitLabel)}</div>
      <div class="svg-container" id="old-panel">${oldSvg}</div>
    </div>
    <div class="panel">
      <div class="panel-header new">NEW — ${escapeHtml(this.newCommitLabel)}</div>
      <div class="svg-container" id="new-panel">${newSvg}</div>
    </div>
  </div>
  <div class="sidebar">
    <div class="sidebar-header">Changes (${totalChanges})</div>
    ${totalChanges > 0 ? changeListHtml : '<div class="no-changes">No differences found</div>'}
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  function navigate(direction) {
    vscode.postMessage({ command: direction });
  }

  // Click on change items → goto index
  document.querySelectorAll('.change-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList && e.target.classList.contains('enter-sub-btn')) return;
      const idx = parseInt(el.dataset.index);
      vscode.postMessage({ command: 'goto', index: idx });
    });
  });

  // Click on "Enter >" buttons to drill into subsystems
  document.querySelectorAll('.enter-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      vscode.postMessage({ command: 'enterSub', name: name });
    });
  });

  // ── Zoom & Pan state (shared across both panels) ──
  let scale = 1;
  let panX = 0;
  let panY = 0;
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const ZOOM_STEP = 0.15;

  const oldPanel = document.getElementById('old-panel');
  const newPanel = document.getElementById('new-panel');
  const zoomLabel = document.getElementById('zoom-level');

  function applyTransform() {
    [oldPanel, newPanel].forEach(panel => {
      const svg = panel.querySelector('svg');
      if (!svg) return;
      svg.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
    });
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  /** Zoom by delta, centered on a point in container coords */
  function zoomAt(delta, cx, cy) {
    const oldScale = scale;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
    const ratio = scale / oldScale;
    // Adjust pan so the point under the cursor stays fixed
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    applyTransform();
  }

  function zoomBy(delta) {
    // Zoom centered on the middle of the panel
    const rect = oldPanel.getBoundingClientRect();
    zoomAt(delta, rect.width / 2, rect.height / 2);
  }

  function resetView() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  // Fit the SVG into the panel on initial load
  function fitToView() {
    const svg = oldPanel.querySelector('svg');
    if (!svg) return;
    const vb = svg.getAttribute('viewBox');
    if (!vb) return;
    const parts = vb.split(/\\s+/).map(Number);
    const svgW = parts[2], svgH = parts[3];
    const rect = oldPanel.getBoundingClientRect();
    const scaleX = rect.width / svgW;
    const scaleY = rect.height / svgH;
    scale = Math.min(scaleX, scaleY) * 0.95; // 95% to leave a small margin
    // Center
    panX = (rect.width - svgW * scale) / 2;
    panY = (rect.height - svgH * scale) / 2;
    applyTransform();
  }

  // ── Mouse wheel zoom ──
  function onWheel(e) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    // Scale-proportional zoom so it feels consistent at any zoom level
    zoomAt(delta * scale, cx, cy);
  }
  oldPanel.addEventListener('wheel', onWheel, { passive: false });
  newPanel.addEventListener('wheel', onWheel, { passive: false });

  // ── Mouse drag pan ──
  let isPanning = false;
  let startX = 0, startY = 0;
  let startPanX = 0, startPanY = 0;

  function onPointerDown(e) {
    if (e.button !== 0) return; // left button only
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = panX;
    startPanY = panY;
    e.currentTarget.classList.add('panning');
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!isPanning) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    applyTransform();
  }
  function onPointerUp(e) {
    if (!isPanning) return;
    isPanning = false;
    oldPanel.classList.remove('panning');
    newPanel.classList.remove('panning');
  }

  [oldPanel, newPanel].forEach(panel => {
    panel.addEventListener('pointerdown', onPointerDown);
    panel.addEventListener('pointermove', onPointerMove);
    panel.addEventListener('pointerup', onPointerUp);
    panel.addEventListener('pointercancel', onPointerUp);
  });

  // ── Keyboard navigation ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigate('prev');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigate('next');
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(ZOOM_STEP * scale);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(-ZOOM_STEP * scale);
    } else if (e.key === '0') {
      e.preventDefault();
      resetView();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      vscode.postMessage({ command: 'goBack' });
    }
  });

  // Fit on load
  requestAnimationFrame(fitToView);
</script>

</body>
</html>`;
  }

  private dispose() {
    PlecsDiffPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

function getChangeIcon(type: string): string {
  switch (type) {
    case 'added': return '➕';
    case 'removed': return '➖';
    case 'param-changed': return '🔧';
    case 'position-changed': return '📍';
    case 'direction-changed': return '🔄';
    case 'connection-changed': return '🔌';
    case 'subsystem-changed': return '📦';
    case 'sim-param-changed': return '⚙️';
    default: return '•';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
