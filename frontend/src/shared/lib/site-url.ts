/** Accept an explicitly configured public web origin for canonical metadata.
 * Credentials, query strings and fragments are rejected; no deployment origin is guessed.
 */
export function publicSiteOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
