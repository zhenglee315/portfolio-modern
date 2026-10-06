import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Fingerprint accepted public output without copying its data into a test report. */
async function fingerprint(directory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    hash.update(entry.name);
    hash.update(
      entry.isDirectory()
        ? await fingerprint(join(directory, entry.name))
        : await readFile(join(directory, entry.name)),
    );
  }
  return hash.digest('hex');
}

test('failed required profile prerender preserves the complete accepted artifact', async () => {
  const before = await fingerprint('build/client');
  await expect(
    promisify(execFile)(process.execPath, ['scripts/build.mjs'], {
      env: { ...process.env, API_BUILD_TARGET: 'http://127.0.0.1:4181/missing' },
      maxBuffer: 4 * 1024 * 1024,
    }),
  ).rejects.toMatchObject({ code: 1 });
  expect(await fingerprint('build/client')).toBe(before);
  await expect(stat('.build-staging')).rejects.toMatchObject({ code: 'ENOENT' });
});
