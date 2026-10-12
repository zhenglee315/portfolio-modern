import fs from 'node:fs';
import { createRequire } from 'node:module';
import postcss, { type Root, type Rule } from 'postcss';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapCss } from '../../bootstrap-css';

const require = createRequire(import.meta.url);
const file = require.resolve('bootstrap/dist/css/bootstrap.css');
const css = fs.readFileSync(file, 'utf8');
const sourceMap = JSON.parse(fs.readFileSync(`${file}.map`, 'utf8'));
const original = postcss.parse(css, { from: file });
let selected: Root;

function rules(root: Root, selector: string): Rule[] {
  const matches: Rule[] = [];
  root.walkRules((rule) => {
    if (rule.selectors.includes(selector)) matches.push(rule);
  });
  return matches;
}

beforeAll(async () => {
  selected = (await postcss([bootstrapCss()]).process(css, { from: file, map: false })).root;
});
beforeEach(() => {
  vi.spyOn(fs, 'readFileSync');
});
afterEach(() => vi.restoreAllMocks());

describe('precompiled Bootstrap selection', () => {
  it('preserves official declarations for resets, interactive components and dynamic utilities', () => {
    for (const selector of [
      'body',
      'h1',
      '.btn',
      '.btn-link',
      '.dropdown-toggle::after',
      '.dropdown-menu',
      '.modal',
      '.modal-backdrop',
      '.btn-close',
      '.offcanvas',
      '.offcanvas-backdrop',
      '.clearfix::after',
      '.visually-hidden',
      '.d-none',
      '.py-5',
      '.table',
      '.form-control',
      '.form-select',
      '.form-check-input',
      '.form-switch',
      '.pagination',
      '.page-link',
      '.badge',
      '.spinner-border',
    ]) {
      const upstream = rules(original, selector);
      expect(upstream.length, selector).toBeGreaterThan(0);
      expect(
        rules(selected, selector).map((rule) => rule.toString()),
        selector,
      ).toEqual(upstream.map((rule) => rule.toString()));
    }
    expect(rules(selected, ':root')[0]?.toString()).toBe(rules(original, ':root')[0]?.toString());
  });

  it('retains responsive wrappers and reduced-motion declarations without flattening them', () => {
    for (const selector of ['.container', '.offcanvas-sm', '.modal-fullscreen-sm-down', '.btn']) {
      const contexts = (root: Root) =>
        rules(root, selector).map((rule) => ({
          css: rule.toString(),
          context:
            rule.parent?.type === 'atrule' ? `${rule.parent.name} ${rule.parent.params}` : '',
        }));
      expect(contexts(selected), selector).toEqual(contexts(original));
    }
  });

  it('excludes unused components while retaining the upstream license', () => {
    for (const selector of ['.row', '.card', '.carousel', '.accordion']) {
      expect(rules(original, selector).length, selector).toBeGreaterThan(0);
      expect(rules(selected, selector), selector).toHaveLength(0);
    }
    expect(selected.toString()).toContain('Licensed under MIT');
    expect(selected.toString()).not.toContain('sourceMappingURL=');
    expect(selected.toString().length).toBeLessThan(css.length * 0.8);
  });

  it('leaves application styles untouched', async () => {
    const input = '.card { color: var(--text); }';
    const result = await postcss([bootstrapCss()]).process(input, {
      from: '/portfolio/src/styles/global.css',
      map: false,
    });
    expect(result.css).toBe(input);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it.each([
    'C:\\portfolio\\node_modules\\bootstrap\\dist\\css\\bootstrap.css',
    '\\\\server\\portfolio\\node_modules\\bootstrap\\dist\\css\\bootstrap.css',
    'C:/portfolio/node_modules/bootstrap/dist/css/bootstrap.css',
  ])('selects the same CSS for the native or normalized path %s', async (path) => {
    const root = postcss.parse(css, { from: file });
    root.source!.input.file = path;
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(sourceMap));
    const result = await postcss([bootstrapCss()]).process(root, { from: path, map: false });
    expect(fs.readFileSync).toHaveBeenCalledWith(`${path}.map`, 'utf8');
    expect(result.css).toBe(selected.toString());
    expect(rules(result.root, '.card')).toHaveLength(0);
  });

  it.each([
    '../../scss/_root.scss',
    '../../scss/utilities/_api.scss',
    ...[
      'color-bg',
      'colored-links',
      'focus-ring',
      'icon-link',
      'ratio',
      'position',
      'stacks',
      'visually-hidden',
      'stretched-link',
      'text-truncation',
      'vr',
    ].map((name) => `../../scss/helpers/_${name}.scss`),
    ...[
      'utilities',
      'caret',
      'backdrop',
      'visually-hidden',
      'clearfix',
      'text-truncate',
      'color-mode',
      'border-radius',
      'lists',
      'image',
      'container',
      'gradients',
      'transition',
      'buttons',
    ].map((name) => `../../scss/mixins/_${name}.scss`),
    '../../scss/vendor/_rfs.scss',
  ])('rejects a source map upgrade that renames required source %s', async (source) => {
    const changed = {
      ...sourceMap,
      sources: sourceMap.sources.map((entry: string) =>
        entry === source ? entry.replace('.scss', '-renamed.scss') : entry,
      ),
    };
    vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(changed));
    await expect(
      postcss([bootstrapCss()]).process(css, { from: file, map: false }),
    ).rejects.toThrow(`Missing sources: ${source}`);
  });

  it('requires review when upstream adds a new helper', async () => {
    const source = '../../scss/helpers/_new-helper.scss';
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ ...sourceMap, sources: [...sourceMap.sources, source] }),
    );
    await expect(
      postcss([bootstrapCss()]).process(css, { from: file, map: false }),
    ).rejects.toThrow(`Unexpected helper sources: ${source}`);
  });
});
