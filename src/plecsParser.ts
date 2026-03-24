/**
 * Parser for PLECS (.plecs) circuit simulation files.
 *
 * PLECS files use a custom nested block format:
 *   BlockType {
 *     Key   Value
 *     NestedBlock { ... }
 *   }
 *
 * Values can be quoted strings, bare words, or bracket arrays [x, y; x2, y2].
 */

// ── Data structures ──

export interface PlecsComponent {
  type: string;
  name: string;
  show: string;
  position: [number, number];
  direction: string;
  flipped: boolean;
  labelPosition: string;
  parameters: PlecsParameter[];
  // Raw location for scopes etc.
  location?: [number, number, number, number];
  // Goto/From tag name (extracted from GotoTag parameter)
  tagName?: string;
  // Nested schematic for Subsystem components
  subCircuit?: PlecsCircuit;
}

export interface PlecsParameter {
  variable: string;
  value: string;
  show: string;
}

export interface PlecsConnection {
  type: string;            // "Wire" or "Signal"
  srcComponent: string;
  srcTerminal: number;
  dstComponent?: string;
  dstTerminal?: number;
  points: [number, number][];
  branches: PlecsBranch[];
}

export interface PlecsBranch {
  points: [number, number][];
  dstComponent?: string;
  dstTerminal?: number;
  branches: PlecsBranch[];
}

export interface PlecsAnnotation {
  name: string;
  position: [number, number];
}

export interface PlecsCircuit {
  name: string;
  version: string;
  schematicLocation: [number, number, number, number];
  components: PlecsComponent[];
  connections: PlecsConnection[];
  annotations: PlecsAnnotation[];
  // Top-level simulation parameters
  simParams: Record<string, string>;
}

// ── Tokenizer ──

type Token =
  | { type: 'LBRACE' }
  | { type: 'RBRACE' }
  | { type: 'STRING'; value: string }
  | { type: 'WORD'; value: string }
  | { type: 'ARRAY'; value: string }
  | { type: 'EOF' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace (but not newlines for multi-line string handling)
    if (input[i] === ' ' || input[i] === '\t' || input[i] === '\r' || input[i] === '\n') {
      i++;
      continue;
    }

    // Line comments (PLECS doesn't really have comments, but skip just in case)
    if (input[i] === '/' && input[i + 1] === '/') {
      while (i < len && input[i] !== '\n') i++;
      continue;
    }

    // Braces
    if (input[i] === '{') {
      tokens.push({ type: 'LBRACE' });
      i++;
      continue;
    }
    if (input[i] === '}') {
      tokens.push({ type: 'RBRACE' });
      i++;
      continue;
    }

    // Quoted string (may span multiple lines with concatenated quotes)
    if (input[i] === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < len) {
        if (input[i] === '"') {
          i++; // skip closing quote
          // Check for continuation: skip whitespace/newlines, if next char is '"', concatenate
          let j = i;
          while (j < len && (input[j] === ' ' || input[j] === '\t' || input[j] === '\r' || input[j] === '\n')) {
            j++;
          }
          if (j < len && input[j] === '"') {
            // Continuation string
            i = j + 1; // skip the opening quote of continuation
            continue;
          }
          break;
        }
        if (input[i] === '\\') {
          i++;
          if (i < len) {
            if (input[i] === 'n') str += '\n';
            else if (input[i] === 't') str += '\t';
            else str += input[i];
            i++;
          }
          continue;
        }
        str += input[i];
        i++;
      }
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Bracket array: [x, y; x2, y2] or [ ]
    if (input[i] === '[') {
      let depth = 1;
      let arr = '';
      i++; // skip [
      while (i < len && depth > 0) {
        if (input[i] === '[') depth++;
        if (input[i] === ']') depth--;
        if (depth > 0) arr += input[i];
        i++;
      }
      tokens.push({ type: 'ARRAY', value: arr.trim() });
      continue;
    }

    // Bare word (identifiers, numbers, etc.)
    if (isWordChar(input[i])) {
      let word = '';
      while (i < len && isWordChar(input[i])) {
        word += input[i];
        i++;
      }
      tokens.push({ type: 'WORD', value: word });
      continue;
    }

    // Skip any other character
    i++;
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_.\-+]/.test(ch);
}

// ── Parser ──

interface ParsedBlock {
  type: string;
  properties: Map<string, string>;
  children: ParsedBlock[];
}

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'EOF' };
  }

  private advance(): Token {
    return this.tokens[this.pos++] || { type: 'EOF' };
  }

  private expect(type: Token['type']): Token {
    const tok = this.advance();
    if (tok.type !== type) {
      throw new Error(`Expected ${type}, got ${tok.type} at position ${this.pos - 1}`);
    }
    return tok;
  }

  /** Parse the top-level block: `Plecs { ... }` or `BlockName { ... }` */
  parseBlock(): ParsedBlock {
    const typeTok = this.advance();
    let blockType: string;
    if (typeTok.type === 'WORD') {
      blockType = typeTok.value;
    } else if (typeTok.type === 'STRING') {
      blockType = typeTok.value;
    } else {
      throw new Error(`Expected block type name, got ${typeTok.type}`);
    }

    this.expect('LBRACE');
    const block = this.parseBlockBody(blockType);
    this.expect('RBRACE');
    return block;
  }

  private parseBlockBody(blockType: string): ParsedBlock {
    const block: ParsedBlock = {
      type: blockType,
      properties: new Map(),
      children: [],
    };

    while (true) {
      const tok = this.peek();
      if (tok.type === 'RBRACE' || tok.type === 'EOF') break;

      // Read the key
      const keyTok = this.advance();
      let key: string;
      if (keyTok.type === 'WORD') {
        key = keyTok.value;
      } else if (keyTok.type === 'STRING') {
        key = keyTok.value;
      } else {
        continue; // skip unexpected tokens
      }

      const next = this.peek();

      // If followed by '{', it's a child block
      if (next.type === 'LBRACE') {
        this.advance(); // consume '{'
        const child = this.parseBlockBody(key);
        this.expect('RBRACE');
        block.children.push(child);
      } else if (next.type === 'STRING') {
        // Value is a quoted string
        const valTok = this.advance() as { type: 'STRING'; value: string };
        block.properties.set(key, valTok.value);
      } else if (next.type === 'ARRAY') {
        // Value is an array
        const valTok = this.advance() as { type: 'ARRAY'; value: string };
        block.properties.set(key, `[${valTok.value}]`);
      } else if (next.type === 'WORD') {
        // Value is a bare word
        const valTok = this.advance() as { type: 'WORD'; value: string };
        block.properties.set(key, valTok.value);
      } else {
        // Key with no value — skip
      }
    }

    return block;
  }

  /** Parse the entire file (may have content after the top block like DemoSignature) */
  parseFile(): ParsedBlock {
    return this.parseBlock();
  }
}

// ── High-level extraction ──

function parsePosition(val: string | undefined): [number, number] {
  if (!val) return [0, 0];
  const m = val.match(/\[?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]?/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  return [0, 0];
}

function parseLocation(val: string | undefined): [number, number, number, number] {
  if (!val) return [0, 0, 0, 0];
  const nums = val.replace(/[[\]]/g, '').split(/[,;]/).map(s => parseFloat(s.trim()));
  if (nums.length >= 4) return [nums[0], nums[1], nums[2], nums[3]];
  return [0, 0, 0, 0];
}

function parsePoints(val: string | undefined): [number, number][] {
  if (!val) return [];
  const clean = val.replace(/[[\]]/g, '');
  if (clean.trim() === '') return [];
  // Points can be: "x1, y1; x2, y2" or "x1, y1"
  const segments = clean.split(';');
  return segments.map(seg => {
    const parts = seg.trim().split(',').map(s => parseFloat(s.trim()));
    return [parts[0], parts[1]] as [number, number];
  });
}

function extractComponent(block: ParsedBlock): PlecsComponent {
  const params: PlecsParameter[] = [];
  for (const child of block.children) {
    if (child.type === 'Parameter') {
      params.push({
        variable: child.properties.get('Variable') || '',
        value: child.properties.get('Value') || '',
        show: child.properties.get('Show') || 'off',
      });
    }
  }

  // Extract Goto/From tag name
  const compType = block.properties.get('Type') || '';
  let tagName: string | undefined;
  if (compType === 'Goto' || compType === 'From') {
    const tagParam = params.find(p => p.variable === 'GotoTag');
    tagName = tagParam?.value || block.properties.get('Tag') || '?';
  }

  // Extract nested schematic for Subsystem
  let subCircuit: PlecsCircuit | undefined;
  const schematicChild = block.children.find(c => c.type === 'Schematic');
  if (schematicChild) {
    subCircuit = extractSchematic(schematicChild, block.properties.get('Name') || 'Subsystem');
  }

  return {
    type: compType,
    name: block.properties.get('Name') || '',
    show: block.properties.get('Show') || 'off',
    position: parsePosition(block.properties.get('Position')),
    direction: block.properties.get('Direction') || 'right',
    flipped: block.properties.get('Flipped') === 'on',
    labelPosition: block.properties.get('LabelPosition') || 'south',
    parameters: params,
    location: block.properties.has('Location') ? parseLocation(block.properties.get('Location')) : undefined,
    tagName,
    subCircuit,
  };
}

function extractBranch(block: ParsedBlock): PlecsBranch {
  const branch: PlecsBranch = {
    points: parsePoints(block.properties.get('Points')),
    branches: [],
  };
  branch.dstComponent = block.properties.get('DstComponent');
  const dst = block.properties.get('DstTerminal');
  if (dst) branch.dstTerminal = parseInt(dst);

  for (const child of block.children) {
    if (child.type === 'Branch') {
      branch.branches.push(extractBranch(child));
    }
  }
  return branch;
}

function extractConnection(block: ParsedBlock): PlecsConnection {
  const conn: PlecsConnection = {
    type: block.properties.get('Type') || 'Wire',
    srcComponent: block.properties.get('SrcComponent') || '',
    srcTerminal: parseInt(block.properties.get('SrcTerminal') || '1'),
    points: parsePoints(block.properties.get('Points')),
    branches: [],
  };
  const dst = block.properties.get('DstComponent');
  if (dst) conn.dstComponent = dst;
  const dstTerm = block.properties.get('DstTerminal');
  if (dstTerm) conn.dstTerminal = parseInt(dstTerm);

  for (const child of block.children) {
    if (child.type === 'Branch') {
      conn.branches.push(extractBranch(child));
    }
  }
  return conn;
}

function extractAnnotation(block: ParsedBlock): PlecsAnnotation {
  return {
    name: block.properties.get('Name') || '',
    position: parsePosition(block.properties.get('Position')),
  };
}

/** Extract a PlecsCircuit from a Schematic block */
function extractSchematic(schematicBlock: ParsedBlock, name: string): PlecsCircuit {
  const circuit: PlecsCircuit = {
    name,
    version: '',
    schematicLocation: parseLocation(schematicBlock.properties.get('Location')),
    components: [],
    connections: [],
    annotations: [],
    simParams: {},
  };

  for (const child of schematicBlock.children) {
    if (child.type === 'Component') {
      circuit.components.push(extractComponent(child));
    } else if (child.type === 'Connection') {
      circuit.connections.push(extractConnection(child));
    } else if (child.type === 'Annotation') {
      circuit.annotations.push(extractAnnotation(child));
    }
  }

  return circuit;
}

export function parsePlecsFile(content: string): PlecsCircuit {
  const tokens = tokenize(content);
  const parser = new Parser(tokens);
  const root = parser.parseFile();

  // root is the Plecs block
  const simParams: Record<string, string> = {};
  for (const [key, val] of root.properties) {
    simParams[key] = val;
  }

  // Find the Schematic block
  const schematicBlock = root.children.find(c => c.type === 'Schematic');

  const circuit = schematicBlock
    ? extractSchematic(schematicBlock, root.properties.get('Name') || '')
    : {
        name: root.properties.get('Name') || '',
        version: '',
        schematicLocation: [0, 0, 800, 600] as [number, number, number, number],
        components: [],
        connections: [],
        annotations: [],
        simParams: {},
      };

  circuit.version = root.properties.get('Version') || '';
  circuit.simParams = simParams;

  return circuit;
}
