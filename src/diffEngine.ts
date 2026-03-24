/**
 * Diff engine: compares two parsed PLECS circuits and produces a list of changes.
 */

import { PlecsCircuit, PlecsComponent, PlecsConnection } from './plecsParser';

export type ChangeType =
  | 'added'
  | 'removed'
  | 'param-changed'
  | 'position-changed'
  | 'direction-changed'
  | 'connection-changed'
  | 'sim-param-changed'
  | 'subsystem-changed';

export interface DiffChange {
  type: ChangeType;
  componentName: string;
  details: string;
  /** For position changes, the old position */
  oldPosition?: [number, number];
  /** For position changes, the new position */
  newPosition?: [number, number];
  /** Path of subsystem names from root (e.g. ["Controller", "Inner"]) */
  subsystemPath?: string[];
}

export interface DiffResult {
  changes: DiffChange[];
  oldCircuit: PlecsCircuit;
  newCircuit: PlecsCircuit;
  /** Subsystem diffs keyed by component name */
  subDiffs: Map<string, DiffResult>;
}

function positionEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function compareComponents(
  oldComps: PlecsComponent[],
  newComps: PlecsComponent[],
  subsystemPath: string[] = [],
): DiffChange[] {
  const changes: DiffChange[] = [];
  const oldMap = new Map<string, PlecsComponent>();
  const newMap = new Map<string, PlecsComponent>();

  for (const c of oldComps) oldMap.set(c.name, c);
  for (const c of newComps) newMap.set(c.name, c);

  // Check for removed components
  for (const [name, oldComp] of oldMap) {
    if (!newMap.has(name)) {
      changes.push({
        type: 'removed',
        componentName: name,
        details: `Component "${name}" (${oldComp.type}) removed`,
        subsystemPath,
      });
    }
  }

  // Check for added components
  for (const [name, newComp] of newMap) {
    if (!oldMap.has(name)) {
      changes.push({
        type: 'added',
        componentName: name,
        details: `Component "${name}" (${newComp.type}) added`,
        subsystemPath,
      });
    }
  }

  // Check for modified components
  for (const [name, newComp] of newMap) {
    const oldComp = oldMap.get(name);
    if (!oldComp) continue;

    // Position change
    if (!positionEqual(oldComp.position, newComp.position)) {
      changes.push({
        type: 'position-changed',
        componentName: name,
        details: `Position: [${oldComp.position}] → [${newComp.position}]`,
        oldPosition: oldComp.position,
        newPosition: newComp.position,
        subsystemPath,
      });
    }

    // Direction change
    if (oldComp.direction !== newComp.direction) {
      changes.push({
        type: 'direction-changed',
        componentName: name,
        details: `Direction: ${oldComp.direction} → ${newComp.direction}`,
        subsystemPath,
      });
    }

    // Parameter changes
    const oldParams = new Map(oldComp.parameters.map(p => [p.variable, p.value]));
    const newParams = new Map(newComp.parameters.map(p => [p.variable, p.value]));

    for (const [variable, newValue] of newParams) {
      const oldValue = oldParams.get(variable);
      if (oldValue !== undefined && oldValue !== newValue) {
        changes.push({
          type: 'param-changed',
          componentName: name,
          details: `${variable}: ${oldValue} → ${newValue}`,
          subsystemPath,
        });
      }
    }

    // New parameters
    for (const [variable, newValue] of newParams) {
      if (!oldParams.has(variable)) {
        changes.push({
          type: 'param-changed',
          componentName: name,
          details: `${variable}: (new) = ${newValue}`,
          subsystemPath,
        });
      }
    }

    // Subsystem content changes
    if (oldComp.subCircuit && newComp.subCircuit) {
      const subDiff = diffCircuits(oldComp.subCircuit, newComp.subCircuit, [...subsystemPath, name]);
      if (subDiff.changes.length > 0) {
        changes.push({
          type: 'subsystem-changed',
          componentName: name,
          details: `${subDiff.changes.length} change(s) inside subsystem "${name}"`,
          subsystemPath,
        });
      }
    }
  }

  return changes;
}

function compareConnections(
  oldConns: PlecsConnection[],
  newConns: PlecsConnection[],
): DiffChange[] {
  const changes: DiffChange[] = [];

  // Serialize connections for comparison
  const serialize = (conn: PlecsConnection): string => {
    return JSON.stringify({
      type: conn.type,
      src: conn.srcComponent,
      srcT: conn.srcTerminal,
      dst: conn.dstComponent,
      dstT: conn.dstTerminal,
      pts: conn.points,
      branches: conn.branches,
    });
  };

  const oldSet = new Set(oldConns.map(serialize));
  const newSet = new Set(newConns.map(serialize));

  // Find connection changes (simplified: just check if the set of connections differs)
  for (let i = 0; i < oldConns.length; i++) {
    const s = serialize(oldConns[i]);
    if (!newSet.has(s)) {
      const compName = oldConns[i].srcComponent;
      // Avoid duplicate change entries for the same component
      if (!changes.some(c => c.componentName === compName && c.type === 'connection-changed')) {
        changes.push({
          type: 'connection-changed',
          componentName: compName,
          details: `Wire routing changed from ${compName}`,
        });
      }
    }
  }

  return changes;
}

function compareSimParams(
  oldParams: Record<string, string>,
  newParams: Record<string, string>,
): DiffChange[] {
  const changes: DiffChange[] = [];

  const allKeys = new Set([...Object.keys(oldParams), ...Object.keys(newParams)]);
  for (const key of allKeys) {
    const oldVal = oldParams[key];
    const newVal = newParams[key];
    if (oldVal !== newVal) {
      changes.push({
        type: 'sim-param-changed',
        componentName: '__simulation__',
        details: `${key}: ${oldVal ?? '(none)'} → ${newVal ?? '(none)'}`,
      });
    }
  }

  return changes;
}

export function diffCircuits(
  oldCircuit: PlecsCircuit,
  newCircuit: PlecsCircuit,
  subsystemPath: string[] = [],
): DiffResult {
  const changes: DiffChange[] = [
    ...compareComponents(oldCircuit.components, newCircuit.components, subsystemPath),
    ...compareConnections(oldCircuit.connections, newCircuit.connections),
    ...compareSimParams(oldCircuit.simParams, newCircuit.simParams),
  ];

  // Build recursive subsystem diffs
  const subDiffs = new Map<string, DiffResult>();
  const oldMap = new Map(oldCircuit.components.map(c => [c.name, c]));
  const newMap = new Map(newCircuit.components.map(c => [c.name, c]));
  for (const [name, newComp] of newMap) {
    const oldComp = oldMap.get(name);
    if (oldComp?.subCircuit && newComp.subCircuit) {
      const subDiff = diffCircuits(oldComp.subCircuit, newComp.subCircuit, [...subsystemPath, name]);
      subDiffs.set(name, subDiff);
    }
  }

  // Sort: added/removed first, then param changes, then position, then connections
  const priority: Record<ChangeType, number> = {
    'added': 0,
    'removed': 1,
    'param-changed': 2,
    'subsystem-changed': 3,
    'position-changed': 4,
    'direction-changed': 5,
    'connection-changed': 6,
    'sim-param-changed': 7,
  };

  changes.sort((a, b) => priority[a.type] - priority[b.type]);

  return { changes, oldCircuit, newCircuit, subDiffs };
}
