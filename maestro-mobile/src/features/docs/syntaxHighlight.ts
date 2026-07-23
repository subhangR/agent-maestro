// Dependency-free, offline syntax tokenizer. Produces a flat list of colored
// runs (token + kind) that CodeBlock renders as nested <Text> spans. No CDN, no
// heavy highlighter lib — just per-language regex passes over the source.
//
// Kinds map to theme-driven colors in CodeBlock. The generic fallback still
// highlights strings / numbers / comments so unknown languages look reasonable.

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'boolean'
  | 'punctuation'
  | 'property'
  | 'function';

export interface Token {
  text: string;
  kind: TokenKind;
}

type Lang = 'js' | 'json' | 'bash' | 'python' | 'generic';

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this',
  'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof',
  'in', 'of', 'try', 'catch', 'finally', 'throw', 'delete', 'void', 'interface', 'type',
  'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'static', 'as', 'namespace',
]);

const PY_KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import',
  'from', 'as', 'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield',
  'global', 'nonlocal', 'pass', 'del', 'assert', 'async', 'await', 'and', 'or', 'not',
  'in', 'is', 'None', 'self',
]);

const BASH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac',
  'function', 'in', 'select', 'until', 'echo', 'cd', 'export', 'source', 'return', 'local',
  'set', 'unset', 'read', 'exit',
]);

const BOOLEANS = new Set(['true', 'false', 'null', 'undefined', 'True', 'False', 'None', 'NaN']);

/** Normalize a fence info string to one of our supported language buckets. */
export function normalizeLang(info: string | undefined): Lang {
  const l = (info ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  switch (l) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'javascript':
    case 'typescript':
      return 'js';
    case 'json':
    case 'jsonc':
    case 'json5':
      return 'json';
    case 'sh':
    case 'bash':
    case 'shell':
    case 'zsh':
    case 'console':
      return 'bash';
    case 'py':
    case 'python':
      return 'python';
    default:
      return 'generic';
  }
}

/** A human label for the header chip (falls back to the raw info string). */
export function langLabel(info: string | undefined): string {
  const raw = (info ?? '').trim().split(/\s+/)[0] ?? '';
  return raw.length > 0 ? raw : 'code';
}

// One ordered pass with alternation; first matching group wins so we never split
// a string literal mid-token. Each entry is [regex-source, kind].
function patternsFor(lang: Lang): Array<[string, TokenKind]> {
  const string = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|` + '`(?:\\\\.|[^`\\\\])*`';
  const number = String.raw`\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b0x[0-9a-fA-F]+\b`;
  const ident = String.raw`[A-Za-z_$][\w$]*`;

  switch (lang) {
    case 'js':
      return [
        [String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`, 'comment'],
        [string, 'string'],
        [String.raw`\b(?:${[...JS_KEYWORDS].join('|')})\b`, 'keyword'],
        [String.raw`\b(?:${[...BOOLEANS].join('|')})\b`, 'boolean'],
        [String.raw`${ident}(?=\s*\()`, 'function'],
        [number, 'number'],
        [String.raw`[{}()[\];:,.<>=+\-*/%&|!?]`, 'punctuation'],
      ];
    case 'json':
      return [
        [String.raw`"(?:\\.|[^"\\])*"(?=\s*:)`, 'property'],
        [String.raw`"(?:\\.|[^"\\])*"`, 'string'],
        [String.raw`\b(?:true|false|null)\b`, 'boolean'],
        [number, 'number'],
        [String.raw`[{}()[\],:]`, 'punctuation'],
      ];
    case 'bash':
      return [
        [String.raw`#[^\n]*`, 'comment'],
        [string, 'string'],
        [String.raw`\$\{?${ident}\}?|\$\d+`, 'property'],
        [String.raw`\b(?:${[...BASH_KEYWORDS].join('|')})\b`, 'keyword'],
        [number, 'number'],
        [String.raw`[{}()[\];|&<>=]`, 'punctuation'],
      ];
    case 'python':
      return [
        [String.raw`#[^\n]*`, 'comment'],
        [String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|${string}`, 'string'],
        [String.raw`\b(?:${[...PY_KEYWORDS].join('|')})\b`, 'keyword'],
        [String.raw`\b(?:True|False|None)\b`, 'boolean'],
        [String.raw`${ident}(?=\s*\()`, 'function'],
        [number, 'number'],
        [String.raw`[{}()[\];:,.<>=+\-*/%&|!?@]`, 'punctuation'],
      ];
    default:
      return [
        [String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*`, 'comment'],
        [string, 'string'],
        [String.raw`\b(?:${[...BOOLEANS].join('|')})\b`, 'boolean'],
        [number, 'number'],
      ];
  }
}

/**
 * Tokenize source into colored runs. Everything not matched by a pattern is
 * emitted as `plain`. Safe on arbitrary input (no catastrophic backtracking on
 * the anchored alternations we use).
 */
export function tokenize(source: string, info: string | undefined): Token[] {
  const lang = normalizeLang(info);
  const parts = patternsFor(lang);
  const combined = new RegExp(parts.map(([src]) => `(${src})`).join('|'), 'g');
  const kinds = parts.map(([, k]) => k);

  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = combined.exec(source)) !== null) {
    if (m.index > last) {
      out.push({ text: source.slice(last, m.index), kind: 'plain' });
    }
    // Find which alternation group matched.
    let kind: TokenKind = 'plain';
    for (let g = 1; g < m.length; g++) {
      if (m[g] !== undefined) {
        kind = kinds[g - 1] ?? 'plain';
        break;
      }
    }
    out.push({ text: m[0], kind });
    last = m.index + m[0].length;
    // Guard against zero-length matches (shouldn't happen, but avoids a loop).
    if (m[0].length === 0) combined.lastIndex++;
  }
  if (last < source.length) {
    out.push({ text: source.slice(last), kind: 'plain' });
  }
  return out;
}
