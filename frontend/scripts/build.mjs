import { spawn } from 'node:child_process';
import { access, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { verifyPublic } from './verify-public.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = new URL('../', import.meta.url);
const directory = process.env.PORTFOLIO_BUILD_DIR;
// Tests use the same validation/compression pipeline with their own atomic output directories.
const output = new URL(`${directory || 'build'}/`, project);
const staging = new URL(`${directory ? `${directory}-staging` : '.build-staging'}/`, project);
const previous = new URL(`${directory ? `${directory}-previous` : '.build-previous'}/`, project);

/** Test artifact presence without treating an absent previous build as a failure. */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Prepare compressed sidecars so Node and Nginx deliver the same bounded asset bytes.
 * @param directory Validated public client artifact; private server output is excluded.
 */
async function compressAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compressAssets(path);
    else if (['.js', '.css', '.svg', '.json'].includes(extname(entry.name))) {
      const body = await readFile(path);
      if (body.length >= 1024) await writeFile(`${path}.gz`, gzipSync(body, { level: 9 }));
    }
  }
}

/** Build into an isolated artifact directory and publish only complete server/client artifacts.
 * Failure keeps the last accepted build. An interrupted swap is recovered on the next run.
 * Concurrent builds are unsupported; CI and local callers must serialize publication.
 */
async function build() {
  if (!(await exists(output)) && (await exists(previous))) await rename(previous, output);
  await rm(staging, { recursive: true, force: true });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/@react-router/dev/bin.cjs', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, PORTFOLIO_BUILD_DIR: fileURLToPath(staging) },
    });
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
  if (code !== 0) {
    await rm(staging, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  // Runtime HTML is generated on request; builds do not query private deployment services.
  // Accept only a complete Node entry and a separate public client directory.
  if (!(await exists(new URL('server/index.js', staging)))) {
    await rm(staging, { recursive: true, force: true });
    throw new Error('Dynamic publication requires a complete server build.');
  }
  try {
    const publicDirectory = fileURLToPath(new URL('client/', staging));
    await verifyPublic(publicDirectory);
    await compressAssets(publicDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
  if (await exists(output)) await rename(output, previous);
  try {
    await rename(staging, output);
  } catch (error) {
    if (await exists(previous)) await rename(previous, output);
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
}

await build();
