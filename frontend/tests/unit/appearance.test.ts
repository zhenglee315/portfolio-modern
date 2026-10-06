import { describe, expect, it } from 'vitest';
import {
  normalizeAppearance,
  readAppearance,
  appearanceBootstrapScript,
} from '@/features/appearance';

describe('appearance normalization and persistence boundary', () => {
  it('clamps steps, rejects non-finite values and retains strict theme/boolean values', () => {
    expect(
      normalizeAppearance({ theme: 'evil', speed: NaN, brightness: 150, paused: 'true' }),
    ).toEqual({ theme: 'mist', speed: 1, brightness: 100, paused: false });
    expect(
      normalizeAppearance({ theme: 'amber', speed: 0.47, brightness: 23, paused: true }),
    ).toEqual({ theme: 'amber', speed: 0.5, brightness: 25, paused: true });
    expect(normalizeAppearance(null)).toEqual({
      theme: 'mist',
      speed: 1,
      brightness: 80,
      paused: false,
    });
  });
  it('uses the cookie before storage and survives malformed content', () => {
    localStorage.setItem('portfolio-appearance', JSON.stringify({ theme: 'blue' }));
    document.cookie = `portfolio-appearance=${encodeURIComponent(JSON.stringify({ theme: 'amber' }))}; Path=/`;
    expect(readAppearance().theme).toBe('amber');
    document.cookie = 'portfolio-appearance=broken; Path=/';
    expect(readAppearance().theme).toBe('mist');
    document.cookie = 'portfolio-appearance=; Max-Age=0; Path=/';
    localStorage.clear();
  });
  it('restores trusted first-paint values using the same normalizer', () => {
    localStorage.setItem('portfolio-appearance', JSON.stringify({ theme: 'mint', brightness: 55 }));
    // Execute the actual trusted bootstrap in the test document, not a mirrored implementation.
    window.eval(appearanceBootstrapScript);
    expect(document.documentElement.dataset.theme).toBe('mint');
    expect(document.documentElement.style.getPropertyValue('--field-brightness')).toBe('0.55');
    localStorage.clear();
  });
});
