import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const extensions = new Set(['.html', '.data', '.js', '.css', '.woff2', '.svg', '.json', '.txt']);
const privateContent =
  /(?:\/Users\/|\/home\/|\/agent\/|SYSTEM\/config|config\.yaml|DATABASE\.META|API_BUILD_TARGET|API_PROXY_TARGET)/;

/** Verify deliverable files and measured asset ceilings without disclosing matched content.
 * @param directory Public client artifact only; no private source or backend files are read.
 * @returns Aggregate byte counts for public assets; violations reject artifact acceptance.
 */
export async function verifyPublic(directory) {
  const totals = { js: 0, jsGzip: 0, css: 0, cssGzip: 0, fonts: 0, mascot: 0, map: 0 };
  /** Recursively inspect only the supplied public output directory. */
  async function inspect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (['agent', 'backend', 'src', 'node_modules'].includes(entry.name))
          throw new Error('Unexpected private directory in public output.');
        await inspect(path);
        continue;
      }
      const extension = extname(entry.name);
      if (!extensions.has(extension) || entry.isSymbolicLink())
        throw new Error('Unexpected file type in public output.');
      const data = await readFile(path);
      if (extension !== '.woff2' && privateContent.test(data.toString('utf8')))
        throw new Error('Private configuration reference detected in public output.');
      if (extension === '.js') {
        totals.js += data.length;
        totals.jsGzip += gzipSync(data).length;
      }
      if (extension === '.css') {
        totals.css += data.length;
        totals.cssGzip += gzipSync(data).length;
      }
      if (extension === '.woff2') totals.fonts += data.length;
      if (entry.name.startsWith('cow-engineer-')) totals.mascot += data.length;
      if (/^JourneyMap-.*\.js$/.test(entry.name)) totals.map += data.length;
    }
  }
  await inspect(directory);
  if (
    totals.js > 1_050_000 ||
    totals.jsGzip > 350_000 ||
    totals.css > 330_000 ||
    totals.cssGzip > 60_000 ||
    totals.fonts > 250_000 ||
    totals.mascot > 1_250_000 ||
    totals.map > 250_000
  )
    throw new Error('Public asset budget exceeded.');
  return totals;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const totals = await verifyPublic(fileURLToPath(new URL('../build/client/', import.meta.url)));
  console.log(
    `Public artifact verified: JS gzip ${Math.round(totals.jsGzip / 1024)} KiB, CSS gzip ${Math.round(totals.cssGzip / 1024)} KiB.`,
  );
}
