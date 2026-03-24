/**
 * Renders a parsed PLECS circuit to SVG.
 */

import {
  PlecsCircuit,
  PlecsComponent,
  PlecsConnection,
  PlecsBranch,
  PlecsAnnotation,
} from './plecsParser';
import {
  getComponentSymbol,
  getComponentTransform,
  getTerminalPosition,
} from './componentSymbols';
import { DiffResult, DiffChange } from './diffEngine';

const PADDING = 40;

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBoundingBox(circuit: PlecsCircuit): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const expand = (x: number, y: number, margin = 30) => {
    minX = Math.min(minX, x - margin);
    minY = Math.min(minY, y - margin);
    maxX = Math.max(maxX, x + margin);
    maxY = Math.max(maxY, y + margin);
  };

  for (const comp of circuit.components) {
    expand(comp.position[0], comp.position[1]);
  }

  for (const conn of circuit.connections) {
    for (const pt of conn.points) expand(pt[0], pt[1], 5);
    const expandBranch = (b: PlecsBranch) => {
      for (const pt of b.points) expand(pt[0], pt[1], 5);
      for (const sub of b.branches) expandBranch(sub);
    };
    for (const br of conn.branches) expandBranch(br);
  }

  for (const ann of circuit.annotations) {
    expand(ann.position[0], ann.position[1], 50);
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 600, maxY: 400 };
  }

  return { minX: minX - PADDING, minY: minY - PADDING, maxX: maxX + PADDING, maxY: maxY + PADDING };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Get CSS class for a component based on diff changes */
function getChangeClass(
  componentName: string,
  diff: DiffResult | undefined,
  changeType?: string,
): string {
  if (!diff) return '';
  const change = diff.changes.find(
    c => c.componentName === componentName && (!changeType || c.type === changeType),
  );
  if (!change) return '';
  switch (change.type) {
    case 'added': return 'diff-added';
    case 'removed': return 'diff-removed';
    case 'param-changed': return 'diff-param-changed';
    case 'position-changed': return 'diff-position-changed';
    case 'connection-changed': return 'diff-connection-changed';
    default: return 'diff-changed';
  }
}

function getAnyChangeClass(componentName: string, diff: DiffResult | undefined): string {
  if (!diff) return '';
  const changes = diff.changes.filter(c => c.componentName === componentName);
  if (changes.length === 0) return '';
  // Priority: added/removed > param > position
  if (changes.some(c => c.type === 'added')) return 'diff-added';
  if (changes.some(c => c.type === 'removed')) return 'diff-removed';
  if (changes.some(c => c.type === 'param-changed')) return 'diff-param-changed';
  if (changes.some(c => c.type === 'position-changed')) return 'diff-position-changed';
  return 'diff-changed';
}

/** Get the dynamic label for Goto/From/Subsystem */
function getTagOrName(comp: PlecsComponent): string | undefined {
  if (comp.type === 'Goto' || comp.type === 'From') return comp.tagName;
  if (comp.type === 'Subsystem') return comp.name;
  return undefined;
}

/** Render a single component to SVG */
function renderComponent(
  comp: PlecsComponent,
  diff: DiffResult | undefined,
  side: 'old' | 'new',
): string {
  const tagOrName = getTagOrName(comp);
  const symbol = getComponentSymbol(comp.type, tagOrName);
  const transform = getComponentTransform(comp.position, comp.direction, comp.flipped, comp.type);
  const changeClass = getAnyChangeClass(comp.name, diff);
  const dataAttr = `data-component="${escapeXml(comp.name)}"`;

  // Build parameter label
  const visibleParams = comp.parameters.filter(p => p.show === 'on');
  const paramLabel = visibleParams.map(p => `${p.variable}=${p.value}`).join(', ');

  // Find change details for annotation
  let changeAnnotation = '';
  if (diff) {
    const paramChange = diff.changes.find(
      c => c.componentName === comp.name && c.type === 'param-changed',
    );
    if (paramChange && paramChange.details) {
      changeAnnotation = paramChange.details;
    }
  }

  const labelOffsetY = comp.labelPosition === 'north' || comp.labelPosition === 'south'
    ? (comp.labelPosition === 'north' ? -22 : 22)
    : 0;
  const labelOffsetX = comp.labelPosition === 'east' || comp.labelPosition === 'west'
    ? (comp.labelPosition === 'east' ? 30 : -30)
    : 0;

  let svg = `<g class="component ${changeClass}" ${dataAttr} transform="${transform}">`;
  svg += symbol.svgBody;
  svg += `</g>`;

  // Component name label (not rotated)
  svg += `<text x="${comp.position[0] + labelOffsetX}" y="${comp.position[1] + labelOffsetY}" `;
  svg += `text-anchor="middle" font-size="9" class="comp-label ${changeClass}">${escapeXml(comp.name)}</text>`;

  // Parameter value label
  if (paramLabel) {
    const paramLabelY = labelOffsetY > 0 ? labelOffsetY + 10 : labelOffsetY - 10;
    svg += `<text x="${comp.position[0] + labelOffsetX}" y="${comp.position[1] + paramLabelY}" `;
    svg += `text-anchor="middle" font-size="8" class="param-label ${changeClass}">${escapeXml(paramLabel)}</text>`;
  }

  // Change annotation (show old→new for param changes)
  if (changeAnnotation && side === 'new') {
    svg += `<text x="${comp.position[0]}" y="${comp.position[1] - 30}" `;
    svg += `text-anchor="middle" font-size="7" class="change-annotation">${escapeXml(changeAnnotation)}</text>`;
  }

  return svg;
}

/** Build wire path segments from a connection */
function buildWirePaths(
  conn: PlecsConnection,
  circuit: PlecsCircuit,
): string[][] {
  const paths: string[][] = [];

  // Find source terminal position
  const srcComp = circuit.components.find(c => c.name === conn.srcComponent);
  let startPt: [number, number] | undefined;
  if (srcComp) {
    startPt = getTerminalPosition(
      srcComp.position, srcComp.direction, srcComp.flipped, srcComp.type, conn.srcTerminal,
      getTagOrName(srcComp),
    );
  }

  // Collect the main path points
  const mainPoints: [number, number][] = [];
  if (startPt) mainPoints.push(startPt);
  for (const pt of conn.points) mainPoints.push(pt);

  // If there's a direct destination (no branches)
  if (conn.dstComponent && conn.branches.length === 0) {
    const dstComp = circuit.components.find(c => c.name === conn.dstComponent);
    if (dstComp && conn.dstTerminal !== undefined) {
      const endPt = getTerminalPosition(
        dstComp.position, dstComp.direction, dstComp.flipped, dstComp.type, conn.dstTerminal,
        getTagOrName(dstComp),
      );
      mainPoints.push(endPt);
    }
    paths.push(mainPoints.map(p => `${p[0]},${p[1]}`));
    return paths;
  }

  // Process branches recursively
  const processBranch = (branch: PlecsBranch, parentPoints: [number, number][]) => {
    const branchPoints: [number, number][] = [...parentPoints];
    for (const pt of branch.points) branchPoints.push(pt);

    if (branch.dstComponent && branch.branches.length === 0) {
      const dstComp = circuit.components.find(c => c.name === branch.dstComponent);
      if (dstComp && branch.dstTerminal !== undefined) {
        const endPt = getTerminalPosition(
          dstComp.position, dstComp.direction, dstComp.flipped, dstComp.type, branch.dstTerminal,
          getTagOrName(dstComp),
        );
        branchPoints.push(endPt);
      }
      paths.push(branchPoints.map(p => `${p[0]},${p[1]}`));
      return;
    }

    for (const sub of branch.branches) {
      processBranch(sub, branchPoints);
    }

    // If branch has a destination AND sub-branches, also draw to destination
    if (branch.dstComponent) {
      const dstComp = circuit.components.find(c => c.name === branch.dstComponent);
      if (dstComp && branch.dstTerminal !== undefined) {
        const endPt = getTerminalPosition(
          dstComp.position, dstComp.direction, dstComp.flipped, dstComp.type, branch.dstTerminal,
          getTagOrName(dstComp),
        );
        const dstPoints = [...branchPoints, endPt];
        paths.push(dstPoints.map(p => `${p[0]},${p[1]}`));
      }
    }
  };

  for (const branch of conn.branches) {
    processBranch(branch, mainPoints);
  }

  return paths;
}

/** Render a connection as SVG polylines */
function renderConnection(
  conn: PlecsConnection,
  circuit: PlecsCircuit,
  diff: DiffResult | undefined,
): string {
  const wirePaths = buildWirePaths(conn, circuit);
  const isSignal = conn.type === 'Signal';
  const strokeClass = isSignal ? 'signal-wire' : 'power-wire';

  let svg = '';
  for (const pts of wirePaths) {
    svg += `<polyline points="${pts.join(' ')}" class="${strokeClass}" fill="none"/>`;
  }

  // Draw junction dots where branches split
  for (const branch of conn.branches) {
    if (branch.branches.length > 0 && branch.points.length > 0) {
      const junctionPt = branch.points[branch.points.length - 1];
      svg += `<circle cx="${junctionPt[0]}" cy="${junctionPt[1]}" r="2.5" class="junction"/>`;
    }
  }

  return svg;
}

/** Render annotation */
function renderAnnotation(ann: PlecsAnnotation): string {
  // Strip HTML tags from the annotation name
  const text = ann.name.replace(/<[^>]+>/g, '').trim();
  return `<text x="${ann.position[0]}" y="${ann.position[1]}" text-anchor="middle" font-size="12" font-weight="bold" class="annotation">${escapeXml(text)}</text>`;
}

/** Ghost overlay for position-changed components (shows old position) */
function renderGhostComponent(
  comp: PlecsComponent,
  oldPosition: [number, number],
): string {
  const symbol = getComponentSymbol(comp.type, getTagOrName(comp));
  const transform = getComponentTransform(oldPosition, comp.direction, comp.flipped, comp.type);
  return `<g class="ghost-component" transform="${transform}">${symbol.svgBody}</g>`;
}

// ── Main render function ──

export function renderCircuitSvg(
  circuit: PlecsCircuit,
  diff: DiffResult | undefined,
  side: 'old' | 'new',
  highlightIndex: number = -1,
): string {
  const bbox = computeBoundingBox(circuit);
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.minX} ${bbox.minY} ${width} ${height}" width="100%" height="100%" class="circuit-svg">`;

  // Render connections first (behind components)
  for (const conn of circuit.connections) {
    svg += renderConnection(conn, circuit, diff);
  }

  // Render ghost components for position changes (on the 'new' side)
  if (diff && side === 'new') {
    for (const change of diff.changes) {
      if (change.type === 'position-changed' && change.oldPosition) {
        const comp = circuit.components.find(c => c.name === change.componentName);
        if (comp) {
          svg += renderGhostComponent(comp, change.oldPosition);
          // Draw a dashed line from old to new position
          svg += `<line x1="${change.oldPosition[0]}" y1="${change.oldPosition[1]}" `;
          svg += `x2="${comp.position[0]}" y2="${comp.position[1]}" class="position-change-line"/>`;
        }
      }
    }
  }

  // Render components
  for (const comp of circuit.components) {
    svg += renderComponent(comp, diff, side);
  }

  // Render annotations
  for (const ann of circuit.annotations) {
    svg += renderAnnotation(ann);
  }

  // Highlight ring for the currently focused diff
  if (diff && highlightIndex >= 0 && highlightIndex < diff.changes.length) {
    const change = diff.changes[highlightIndex];
    const comp = circuit.components.find(c => c.name === change.componentName);
    if (comp) {
      svg += `<circle cx="${comp.position[0]}" cy="${comp.position[1]}" r="35" class="highlight-ring"/>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

export { BBox, computeBoundingBox };
