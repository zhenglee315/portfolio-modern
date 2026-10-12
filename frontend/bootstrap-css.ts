import fs from 'node:fs';
import type { ChildNode, Container, Plugin, Rule } from 'postcss';
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';

// Select the application foundations and used components, including management tables/forms.
// Use upstream's compiled CSS and source map; never compile or patch vendor Sass.
const modules = new Set([
  ...[
    'root',
    'reboot',
    'type',
    'images',
    'containers',
    'buttons',
    'transitions',
    'dropdown',
    'close',
    'modal',
    'offcanvas',
    'tables',
    'pagination',
    'badge',
    'spinners',
  ].map((name) => `../../scss/_${name}.scss`),
  ...['labels', 'form-text', 'form-control', 'form-select', 'form-check', 'input-group'].map(
    (name) => `../../scss/forms/_${name}.scss`,
  ),
]);
const emittingMixins = new Set(
  ['utilities', 'caret', 'backdrop', 'visually-hidden'].map(
    (name) => `../../scss/mixins/_${name}.scss`,
  ),
);
const helpers = new Set(
  [
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
);
const utilitiesApi = '../../scss/utilities/_api.scss';
const clearfixMixin = '../../scss/mixins/_clearfix.scss';

// Validate every source contributing to the retained CSS. Supporting mixins are
// checked without selecting all of their output from unrelated components.
const requiredSources = new Set([
  ...modules,
  ...helpers,
  ...emittingMixins,
  utilitiesApi,
  clearfixMixin,
  '../../scss/vendor/_rfs.scss',
  ...[
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
]);

/** Keep selected Bootstrap rules, including mixin output inside responsive wrappers.
 * The official source map identifies owners without matching application class usage.
 * All helpers/utilities remain available to lazy and server-rendered components.
 */
export function bootstrapCss(): Plugin {
  return {
    postcssPlugin: 'portfolio-bootstrap-css',
    Once(root) {
      const file = root.source?.input.file;
      // Match native Windows and POSIX paths, while keeping the native path for disk access.
      if (!file || !file.replaceAll('\\', '/').endsWith('/bootstrap/dist/css/bootstrap.css'))
        return;
      const map = JSON.parse(fs.readFileSync(`${file}.map`, 'utf8')) as RawSourceMap;
      const missing = [...requiredSources].filter((source) => !map.sources.includes(source));
      const unexpectedHelpers = map.sources.filter(
        (source) => source.startsWith('../../scss/helpers/') && !helpers.has(source),
      );
      if (missing.length || unexpectedHelpers.length)
        throw root.error(
          [
            'Bootstrap CSS source map changed; review the selected modules.',
            ...(missing.length ? [`Missing sources: ${missing.join(', ')}`] : []),
            ...(unexpectedHelpers.length
              ? [`Unexpected helper sources: ${unexpectedHelpers.join(', ')}`]
              : []),
          ].join('\n'),
        );
      const consumer = new SourceMapConsumer(map);
      const selected = (node: ChildNode, rule: Rule) => {
        const start = node.source?.start;
        if (!start) throw node.error('Bootstrap rule is missing its source position.');
        const { source } = consumer.originalPositionFor({
          line: start.line,
          column: start.column - 1,
        });
        return (
          modules.has(source) ||
          helpers.has(source) ||
          source === utilitiesApi ||
          emittingMixins.has(source) ||
          (source === clearfixMixin && rule.selector === '.clearfix::after')
        );
      };
      const prune = (parent: Container) => {
        for (const node of [...(parent.nodes ?? [])]) {
          // Preserve the upstream license banner; discard its now-invalid source-map URL.
          if (node.type === 'comment' && !node.text.startsWith('!')) node.remove();
          if (node.type === 'atrule' && node.nodes) {
            prune(node);
            if (!node.nodes.length) node.remove();
          }
          if (node.type === 'rule' && ![node, ...node.nodes].some((part) => selected(part, node)))
            node.remove();
        }
      };
      prune(root);
    },
  };
}
