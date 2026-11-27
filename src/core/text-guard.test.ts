// Guard (ID-269): player-facing text lives in src/ui/text, not in the simulation, so that
// rewording never counts as a sim change (src/core is what the balance cache hashes). Scans
// every non-test core source with the TypeScript parser for a string that reads as a sentence
// (a word, a space, a lowercase word) and any string under a text key (name, text, tip,
// reason, label, title, role, trait). Throw and `new …Error` messages are dev text and pass.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CORE = dirname(fileURLToPath(import.meta.url));

/** Dev text by design: the balance report, the debug panel's refusals, test fixtures. */
const DEV_FILES = ['sim.ts', 'debug.ts', 'testing.ts'];
/** Survivor names are save data and picked by the RNG: they stay in core. */
const NAME_LISTS = ['RECRUIT_NAMES', 'STARTER_ROSTER'];

const TEXT_KEYS = new Set(['name', 'text', 'tip', 'reason', 'label', 'title', 'role', 'trait']);
const SENTENCE = /[A-Za-z][A-Za-z'’]* +[a-z]/;

/** What a literal says, a template's holes as `${}`. */
const textOf = (n: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression) =>
  ts.isTemplateExpression(n)
    ? n.head.text + n.templateSpans.map((s) => '${}' + s.literal.text).join('')
    : n.text;

const isError = (n: ts.Node): boolean => {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isThrowStatement(p)) return true;
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
  }
  return false;
};

const inNameList = (n: ts.Node): boolean => {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) && NAME_LISTS.includes(p.name.getText())) return true;
  }
  return false;
};

/** The player-facing strings in `source`, as "line: text". */
function textHits(source: string): string[] {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateExpression(n)
    ) {
      const p = n.parent;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return;
      const text = textOf(n);
      const keyed =
        ts.isPropertyAssignment(p) &&
        p.initializer === n &&
        TEXT_KEYS.has(p.name.getText().replace(/['"]/g, ''));
      if ((keyed || SENTENCE.test(text)) && !isError(n) && !inNameList(n)) {
        hits.push(`${file.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${text}`);
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return hits;
}

/** Every non-test source under src/core but the balance tests, by path from it. */
function sources(dir = CORE): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'balance' ? [] : sources(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [relative(CORE, path)] : [];
  });
}

describe('no player-facing text in src/core (ID-269)', () => {
  const files = sources().filter((f) => !DEV_FILES.includes(f));
  const hits = Object.fromEntries(
    files.map((f) => [f, textHits(readFileSync(join(CORE, f), 'utf8'))]),
  );

  it('flags no core file (only the dev files above are exempt)', () => {
    const found = Object.entries(hits).filter(([, h]) => h.length > 0);
    expect(Object.fromEntries(found)).toEqual({});
  });

  it('scans the simulation, not an empty list', () => {
    expect(files).toEqual(expect.arrayContaining(['data.ts', 'hordeonly.ts', 'horde.ts']));
  });

  it('flags a sentence under a text key, and a sentence anywhere', () => {
    expect(textHits("const r = { ok: false, reason: 'Needs 40 Scrap' };")).toHaveLength(1);
    expect(textHits("const t = { name: 'Rifle' };")).toHaveLength(1);
    expect(textHits('const c = { text: `Hits ${n} enemies` };')).toHaveLength(1);
    expect(textHits("const why = 'Not ready yet';")).toHaveLength(1);
    expect(textHits('const why = `The squad is full (${n}/${n})`;')).toHaveLength(1);
  });

  it('passes throw and Error messages, ids, codes and survivor names', () => {
    expect(textHits("throw new RangeError('no such gun here');")).toEqual([]);
    expect(textHits('const e = new Error(`bad time ${now}`);')).toEqual([]);
    expect(textHits("const r = { ok: false, code: 'no-cash', kind: 'gun' };")).toEqual([]);
    expect(textHits("const RECRUIT_NAMES = ['Ada', 'Bo'];")).toEqual([]);
    expect(textHits("import { x } from './data.ts';")).toEqual([]);
    expect(textHits("type K = 'a b';")).toEqual([]);
  });
});
