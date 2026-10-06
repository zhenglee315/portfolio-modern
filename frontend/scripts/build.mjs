import { spawn } from 'node:child_process';
import { access, readFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyPublic } from './verify-public.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../build/', import.meta.url);
const staging = new URL('../.build-staging/', import.meta.url);
const previous = new URL('../.build-previous/', import.meta.url);

/** Test artifact presence without treating an absent previous build as a failure. */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Build into an isolated artifact directory and publish only a complete prerender.
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
      env: { ...process.env, PORTFOLIO_BUILD_DIR: '.build-staging' },
    });
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
  if (code !== 0) {
    await rm(staging, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  // Router prerender may render loader errors into HTML with exit status zero.
  // Acceptance therefore validates public content, rather than trusting the CLI status alone.
  for (const [path, locale] of [
    ['index.html', 'en'],
    ['en/index.html', 'en'],
    ['zh-Hans/index.html', 'zh-Hans'],
    ['zh-Hant/index.html', 'zh-Hant'],
  ]) {
    let valid = false;
    try {
      const html = await readFile(new URL(`client/${path}`, staging), 'utf8');
      valid =
        html.includes(`<html lang="${locale}"`) && /<h1[^>]*data-profile-content[^>]*>/.test(html);
    } catch {
      /* Missing locale output cannot replace the last accepted artifact. */
    }
    if (!valid) {
      console.error('Static publication requires valid profile content in every locale.');
      await rm(staging, { recursive: true, force: true });
      process.exitCode = 1;
      return;
    }
  }
  try {
    await verifyPublic(fileURLToPath(new URL('client/', staging)));
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
