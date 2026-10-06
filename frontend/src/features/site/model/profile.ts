import type { Site } from '../schemas/site';

/** Keep the original family-first rule only when both name parts are entirely Han. */
export function fullName(profile: Site['profile']) {
  const han = /^\p{Script=Han}+$/u;
  return han.test(profile.firstName) && han.test(profile.familyName)
    ? `${profile.familyName}${profile.firstName}`
    : `${profile.firstName} ${profile.familyName}`.trim();
}

/** Disable unsafe or malformed user-facing social URLs; no arbitrary URI schemes. */
export function safeSocialUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Construct a bounded mail link without allowing header or control-character injection. */
export function emailUrl(value: string): string | undefined {
  return /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(value) ? `mailto:${value}` : undefined;
}
