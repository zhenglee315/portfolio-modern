import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const extensions = new Set([
  '.html',
  '.data',
  '.js',
  '.css',
  '.woff2',
  '.svg',
  '.json',
  '.txt',
  '.gz',
]);
const privateContent =
  /(?:\/Users\/|\/home\/|\/agent\/|SYSTEM\/config|config\.yaml|DATABASE\.META|API_BUILD_TARGET|API_SERVER_TARGET|API_PROXY_TARGET)/;

/** Verify deliverable files and measured asset ceilings without disclosing matched content.
 * @param directory Public client artifact only; no private source or backend files are read.
 * @returns Aggregate byte counts for public assets; violations reject artifact acceptance.
 */
export async function verifyPublic(directory) {
  const totals = {
    js: 0,
    jsGzip: 0,
    css: 0,
    cssGzip: 0,
    fonts: 0,
    mascot: 0,
    map: 0,
    offlineMap: 0,
    offlineMapGzip: 0,
  };
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
      if (extension === '.gz') {
        const source = await readFile(path.slice(0, -3));
        if (!gunzipSync(data).equals(source))
          throw new Error('Compressed public asset does not match its validated source.');
      }
      if (!['.woff2', '.gz'].includes(extension) && privateContent.test(data.toString('utf8')))
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
      if (extension !== '.gz' && entry.name.startsWith('cow-engineer-'))
        totals.mascot += data.length;
      if (/^JourneyMap-.*\.js$/.test(entry.name)) totals.map += data.length;
      if (/^offline-atlas-.*\.json$/.test(entry.name)) {
        totals.offlineMap += data.length;
        totals.offlineMapGzip += gzipSync(data).length;
      }
    }
  }
  await inspect(directory);
  const ceilings = {
    // Aggregate files include Profile and the Leaflet picker loaded only when its modal opens.
    // Public visits do not load Profile; closed pickers request neither Leaflet nor local atlas data.
    // Measured with the picker and Profile gesture/help styles: ~426 KB CSS, including lazy routes.
    // Retain bounded headroom for hash variation and subsequent small fixes.
    // Private editor pagination, swipe actions and shared drag deletion measure ~1.586 MB total.
    js: 1_590_000,
    // Shared editor page-size controls and scoped reads measure ~525.2 KB gzip across lazy routes.
    jsGzip: 526_000,
    css: 427_000,
    cssGzip: 90_000,
    fonts: 250_000,
    mascot: 1_250_000,
    map: 250_000,
    // Versioned world boundaries and 7,342 city points are separate same-origin JSON, never JS.
    offlineMap: 3_150_000,
    offlineMapGzip: 1_000_000,
  };
  const exceeded = Object.entries(ceilings)
    .filter(([metric, ceiling]) => totals[metric] > ceiling)
    .map(([metric, ceiling]) => `${metric} ${totals[metric]} bytes > ${ceiling} bytes`);
  if (exceeded.length) throw new Error(`Public asset budget exceeded: ${exceeded.join('; ')}.`);
  return totals;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const totals = await verifyPublic(fileURLToPath(new URL('../build/client/', import.meta.url)));
  console.log(
    `Public artifact verified: JS gzip ${Math.round(totals.jsGzip / 1024)} KiB, CSS gzip ${Math.round(totals.cssGzip / 1024)} KiB.`,
  );
}
