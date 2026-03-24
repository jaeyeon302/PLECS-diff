/**
 * SVG symbol definitions for PLECS circuit components.
 *
 * Each symbol is drawn in a local coordinate system centered at (0, 0)
 * with the component oriented horizontally (terminals at left and right).
 * The caller applies rotation/flip transforms based on the component's
 * Direction and Flipped properties.
 *
 * Terminal offsets (before rotation) for 2-terminal components:
 *   Terminal 1: (-25, 0)  — left
 *   Terminal 2: (+25, 0)  — right
 *
 * For 3-terminal (MOSFET):
 *   Terminal 1 (drain):  (0, -25)
 *   Terminal 2 (source): (0, +25)
 *   Terminal 3 (gate):   (-25, 0)
 */

export interface TerminalOffset {
  x: number;
  y: number;
}

export interface ComponentSymbol {
  /** SVG path/shapes for the component body (no transform applied) */
  svgBody: string;
  /** Terminal positions in local coordinates (index 0 = terminal 1, etc.) */
  terminals: TerminalOffset[];
  /** Display label (short) */
  label: string;
  /** Width and height of the symbol area for hit testing */
  width: number;
  height: number;
}

const T = 25; // terminal offset from center

function resistorSymbol(): ComponentSymbol {
  // IEC/European: rectangle box, white fill
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-15" y2="0" stroke-width="1.5"/>
      <rect x="-15" y="-6" width="30" height="12" fill="white" stroke-width="1.5"/>
      <line x1="15" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }],
    label: 'R',
    width: 50,
    height: 16,
  };
}

function capacitorSymbol(): ComponentSymbol {
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-4" y2="0" stroke-width="1.5"/>
      <rect x="-4" y="-10" width="8" height="20" fill="white" stroke="none"/>
      <line x1="-4" y1="-10" x2="-4" y2="10" stroke-width="2"/>
      <line x1="4" y1="-10" x2="4" y2="10" stroke-width="2"/>
      <line x1="4" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }],
    label: 'C',
    width: 50,
    height: 24,
  };
}

function inductorSymbol(): ComponentSymbol {
  // IEC/European: filled rectangle box, black fill
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-15" y2="0" stroke-width="1.5"/>
      <rect x="-15" y="-6" width="30" height="12" fill="black" stroke-width="1.5"/>
      <line x1="15" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }],
    label: 'L',
    width: 50,
    height: 16,
  };
}

function dcVoltageSourceSymbol(): ComponentSymbol {
  // American style: circle with + (terminal 1, right) and − (terminal 2, left)
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-12" y2="0" stroke-width="1.5"/>
      <circle cx="0" cy="0" r="12" fill="white" stroke-width="1.5"/>
      <text x="5" y="4" font-size="10" text-anchor="middle" font-weight="bold" class="symbol-text">+</text>
      <text x="-5" y="4" font-size="10" text-anchor="middle" font-weight="bold" class="symbol-text">−</text>
      <line x1="12" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }],
    label: 'V',
    width: 50,
    height: 28,
  };
}

function diodeSymbol(): ComponentSymbol {
  // IEC/European: filled triangle with bar
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-8" y2="0" stroke-width="1.5"/>
      <polygon points="-8,-8 -8,8 8,0" fill="currentColor" stroke-width="1.5"/>
      <line x1="8" y1="-8" x2="8" y2="8" stroke-width="2"/>
      <line x1="8" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }],
    label: 'D',
    width: 50,
    height: 20,
  };
}

function mosfetSymbol(): ComponentSymbol {
  // N-channel MOSFET: gate on left, drain at top, source at bottom
  // Drawn vertically: terminals 1(drain) at top, 2(source) at bottom, 3(gate) at left
  return {
    svgBody: `
      <!-- Channel body -->
      <line x1="0" y1="-25" x2="0" y2="-8" stroke-width="1.5"/>
      <line x1="0" y1="-8" x2="8" y2="-8" stroke-width="1.5"/>
      <line x1="8" y1="-12" x2="8" y2="12" stroke-width="2"/>
      <line x1="12" y1="-10" x2="12" y2="-4" stroke-width="1.5"/>
      <line x1="12" y1="-1" x2="12" y2="5" stroke-width="1.5"/>
      <line x1="12" y1="6" x2="12" y2="12" stroke-width="1.5"/>
      <!-- Drain -->
      <line x1="12" y1="-7" x2="0" y2="-7" stroke-width="1.5"/>
      <!-- Source -->
      <line x1="12" y1="9" x2="0" y2="9" stroke-width="1.5"/>
      <line x1="0" y1="9" x2="0" y2="25" stroke-width="1.5"/>
      <!-- Gate -->
      <line x1="-25" y1="0" x2="8" y2="0" stroke-width="1.5"/>
      <!-- Arrow on source -->
      <polygon points="4,9 8,5 8,13" fill="currentColor" stroke="none"/>
    `,
    terminals: [
      { x: 0, y: -T },   // terminal 1: drain (top)
      { x: 0, y: T },    // terminal 2: source (bottom)
      { x: -T, y: 0 },   // terminal 3: gate (left)
    ],
    label: 'M',
    width: 40,
    height: 50,
  };
}

function ammeterSymbol(): ComponentSymbol {
  // American style: circle with A, terminal 1 = left (+), terminal 2 = right (−), terminal 3 = signal out (south)
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-10" y2="0" stroke-width="1.5"/>
      <circle cx="0" cy="0" r="10" fill="white" stroke-width="1.5"/>
      <text x="0" y="4" font-size="10" text-anchor="middle" font-weight="bold" class="symbol-text">A</text>
      <line x1="10" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }, { x: 0, y: 10 }],
    label: 'A',
    width: 50,
    height: 24,
  };
}

function voltmeterSymbol(): ComponentSymbol {
  // American style: circle with V, terminal 1 = left (+), terminal 2 = right (−), terminal 3 = signal out (south)
  return {
    svgBody: `
      <line x1="-25" y1="0" x2="-10" y2="0" stroke-width="1.5"/>
      <circle cx="0" cy="0" r="10" fill="white" stroke-width="1.5"/>
      <text x="0" y="4" font-size="10" text-anchor="middle" font-weight="bold" class="symbol-text">V</text>
      <line x1="10" y1="0" x2="25" y2="0" stroke-width="1.5"/>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }, { x: 0, y: 10 }],
    label: 'V',
    width: 50,
    height: 24,
  };
}

function scopeSymbol(): ComponentSymbol {
  return {
    svgBody: `
      <rect x="-15" y="-12" width="30" height="24" rx="2" fill="white" stroke-width="1.5"/>
      <polyline points="-10,4 -5,4 -3,-6 1,6 4,-4 7,4 10,4" fill="none" stroke-width="1"/>
    `,
    terminals: [
      { x: -8, y: -12 },  // terminal 1 (top-left input)
      { x: 8, y: -12 },   // terminal 2 (top-right input)
    ],
    label: 'Scope',
    width: 34,
    height: 28,
  };
}

function pulseGeneratorSymbol(): ComponentSymbol {
  return {
    svgBody: `
      <rect x="-15" y="-12" width="30" height="24" rx="2" fill="white" stroke-width="1.5"/>
      <polyline points="-8,4 -8,-4 -2,-4 -2,4 4,4 4,-4 10,-4" fill="none" stroke-width="1.2"/>
    `,
    terminals: [{ x: T, y: 0 }],
    label: 'PWM',
    width: 34,
    height: 28,
  };
}

function gotoSymbol(tagName: string): ComponentSymbol {
  // Right-pointing flag shape with tag name
  const tw = Math.max(30, tagName.length * 6 + 16);
  const hw = tw / 2;
  return {
    svgBody: `
      <polygon points="${-hw},-10 ${hw - 8},-10 ${hw},0 ${hw - 8},10 ${-hw},10" fill="white" stroke-width="1.5"/>
      <text x="${-4}" y="4" font-size="9" text-anchor="middle" class="symbol-text">${escapeXml(tagName)}</text>
    `,
    terminals: [{ x: -hw, y: 0 }],
    label: tagName,
    width: tw,
    height: 24,
  };
}

function fromSymbol(tagName: string): ComponentSymbol {
  // Left-pointing flag shape with tag name
  const tw = Math.max(30, tagName.length * 6 + 16);
  const hw = tw / 2;
  return {
    svgBody: `
      <polygon points="${-hw},0 ${-hw + 8},-10 ${hw},-10 ${hw},10 ${-hw + 8},10" fill="white" stroke-width="1.5"/>
      <text x="4" y="4" font-size="9" text-anchor="middle" class="symbol-text">${escapeXml(tagName)}</text>
    `,
    terminals: [{ x: hw, y: 0 }],
    label: tagName,
    width: tw,
    height: 24,
  };
}

function subsystemSymbol(name: string): ComponentSymbol {
  // Double-bordered rectangle
  return {
    svgBody: `
      <rect x="-30" y="-20" width="60" height="40" fill="white" stroke-width="1.5"/>
      <rect x="-27" y="-17" width="54" height="34" fill="none" stroke-width="0.5"/>
      <text x="0" y="4" font-size="8" text-anchor="middle" class="symbol-text">${escapeXml(name)}</text>
    `,
    terminals: [{ x: -30, y: 0 }, { x: 30, y: 0 }, { x: 0, y: -20 }, { x: 0, y: 20 }],
    label: name,
    width: 64,
    height: 44,
  };
}

function genericSymbol(label: string): ComponentSymbol {
  return {
    svgBody: `
      <rect x="-18" y="-12" width="36" height="24" rx="2" fill="white" stroke-width="1.5"/>
      <text x="0" y="4" font-size="8" text-anchor="middle" class="symbol-text">${escapeXml(label)}</text>
    `,
    terminals: [{ x: -T, y: 0 }, { x: T, y: 0 }],
    label,
    width: 40,
    height: 28,
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Component type → symbol mapping ──

const symbolMap: Record<string, () => ComponentSymbol> = {
  Resistor: resistorSymbol,
  Capacitor: capacitorSymbol,
  Inductor: inductorSymbol,
  DCVoltageSource: dcVoltageSourceSymbol,
  ACVoltageSource: dcVoltageSourceSymbol,
  Diode: diodeSymbol,
  Mosfet: mosfetSymbol,
  IGBT: mosfetSymbol,
  Ammeter: ammeterSymbol,
  Voltmeter: voltmeterSymbol,
  Scope: scopeSymbol,
  PulseGenerator: pulseGeneratorSymbol,
};

/**
 * Get the symbol for a component. For Goto/From, pass the tag name.
 * For Subsystem, pass the component name.
 */
export function getComponentSymbol(type: string, tagOrName?: string): ComponentSymbol {
  if (type === 'Goto') return gotoSymbol(tagOrName || '?');
  if (type === 'From') return fromSymbol(tagOrName || '?');
  if (type === 'Subsystem') return subsystemSymbol(tagOrName || 'Sub');
  const factory = symbolMap[type];
  return factory ? factory() : genericSymbol(type);
}

// ── Transform helpers ──

/**
 * Returns the SVG transform string for a component based on its
 * position, direction, and flipped state.
 */
export function getComponentTransform(
  position: [number, number],
  direction: string,
  flipped: boolean,
  componentType: string,
): string {
  const [cx, cy] = position;
  let rotation = 0;

  // The MOSFET symbol is already drawn vertically (drain top, source bottom, gate left),
  // which is the "up" orientation. Other 2-terminal components are drawn horizontally.
  const isMosfet = componentType === 'Mosfet' || componentType === 'IGBT';

  if (isMosfet) {
    // MOSFET default is vertical (up)
    switch (direction) {
      case 'up': rotation = 0; break;
      case 'right': rotation = 90; break;
      case 'down': rotation = 180; break;
      case 'left': rotation = 270; break;
    }
  } else {
    // 2-terminal default is horizontal
    switch (direction) {
      case 'right': rotation = 0; break;
      case 'down': rotation = 90; break;
      case 'left': rotation = 180; break;
      case 'up': rotation = 270; break;
    }
  }

  let transform = `translate(${cx}, ${cy})`;
  if (rotation !== 0) {
    transform += ` rotate(${rotation})`;
  }
  if (flipped) {
    // Mirror across the main axis
    if (rotation === 0 || rotation === 180) {
      transform += ' scale(1, -1)';
    } else {
      transform += ' scale(-1, 1)';
    }
  }

  return transform;
}

/**
 * Compute the absolute position of a terminal given the component's
 * position, direction, flipped state, and terminal index.
 */
export function getTerminalPosition(
  position: [number, number],
  direction: string,
  flipped: boolean,
  componentType: string,
  terminalIndex: number, // 1-based
  tagOrName?: string,
): [number, number] {
  const symbol = getComponentSymbol(componentType, tagOrName);
  const termIdx = terminalIndex - 1;
  if (termIdx < 0 || termIdx >= symbol.terminals.length) {
    return position;
  }

  let { x, y } = symbol.terminals[termIdx];
  const isMosfet = componentType === 'Mosfet' || componentType === 'IGBT';

  // Apply rotation
  let rotation = 0;
  if (isMosfet) {
    switch (direction) {
      case 'up': rotation = 0; break;
      case 'right': rotation = 90; break;
      case 'down': rotation = 180; break;
      case 'left': rotation = 270; break;
    }
  } else {
    switch (direction) {
      case 'right': rotation = 0; break;
      case 'down': rotation = 90; break;
      case 'left': rotation = 180; break;
      case 'up': rotation = 270; break;
    }
  }

  // Apply flip before rotation
  if (flipped) {
    if (rotation === 0 || rotation === 180) {
      y = -y;
    } else {
      x = -x;
    }
  }

  // Rotate
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;

  return [position[0] + rx, position[1] + ry];
}
