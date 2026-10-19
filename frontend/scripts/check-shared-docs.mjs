import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { featureEntryFiles } from './feature-entries.mjs';

/** Inspect declarations without importing browser modules, assets or their runtime side effects. */
async function declaredExports(url) {
  const source = ts.createSourceFile(
    fileURLToPath(url),
    await readFile(url, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set();
  for (const node of source.statements) {
    if (ts.isExportDeclaration(node)) {
      if (!node.exportClause) throw new Error(`${fileURLToPath(url)}: use explicit named exports.`);
      if (ts.isNamedExports(node.exportClause))
        node.exportClause.elements.forEach((item) => names.add(item.name.text));
      else if (ts.isNamespaceExport(node.exportClause)) names.add(node.exportClause.name.text);
    }
    if (!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
      continue;
    if (ts.isVariableStatement(node))
      node.declarationList.declarations.forEach((item) => names.add(item.name.getText(source)));
    else if (node.name) names.add(node.name.getText(source));
  }
  return names;
}

/** Shared infrastructure and page-owned reusable components keep separate ownership guides. */
async function inspect(directory) {
  const names = new Set();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    const found = entry.isDirectory()
      ? await inspect(url)
      : /\.(ts|tsx)$/.test(entry.name)
        ? await declaredExports(url)
        : [];
    for (const name of found) names.add(name);
  }
  return names;
}

function verify(names, guide, scope) {
  const missing = [...names]
    .filter((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(guide);
    })
    .sort();
  if (missing.length) {
    console.error(`${scope} README is missing exported contracts: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
}

const shared = new URL('../src/shared/', import.meta.url);
const features = new URL('../src/features/', import.meta.url);
const profile = new URL('../src/pages/profile/', import.meta.url);
const sharedNames = await inspect(shared);
verify(sharedNames, await readFile(new URL('README.md', shared), 'utf8'), 'Shared');
const featureGuide = await readFile(new URL('README.md', features), 'utf8');
let featureCount = 0;
// Only public feature entries belong in the cross-feature index; internal implementation stays private.
for (const entry of await readdir(features, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  for (const file of featureEntryFiles(entry.name)) {
    const names = await declaredExports(new URL(`${entry.name}/${file}`, features));
    featureCount += names.size;
    verify(names, featureGuide, `Feature ${entry.name}/${file}`);
  }
}
const profileNames = await inspect(new URL('components/', profile));
verify(profileNames, await readFile(new URL('README.md', profile), 'utf8'), 'Profile components');
if (!process.exitCode)
  console.log(
    `README exports verified: ${sharedNames.size} shared, ${featureCount} feature, ${profileNames.size} Profile component contracts.`,
  );
