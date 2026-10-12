import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const shared = new URL('../src/shared/', import.meta.url);
const guide = await readFile(new URL('README.md', shared), 'utf8');
const exports = new Set();

/** Inspect declared interfaces, components and helpers without loading browser modules or assets. */
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) {
      await inspect(url);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const source = ts.createSourceFile(
      fileURLToPath(url),
      await readFile(url, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        node.exportClause.elements.forEach((item) => exports.add(item.name.text));
      }
      if (!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
        continue;
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((item) => exports.add(item.name.getText(source)));
      } else if (node.name) exports.add(node.name.getText(source));
    }
  }
}

await inspect(shared);
const missing = [...exports]
  .filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return !new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(guide);
  })
  .sort();
if (missing.length) {
  console.error(`Shared README is missing exported contracts: ${missing.join(', ')}`);
  process.exitCode = 1;
} else console.log(`Shared README verified: ${exports.size} exported contracts are indexed.`);
