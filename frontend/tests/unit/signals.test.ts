import { expect, it } from 'vitest';
import { signalGeometry } from '@/pages/portfolio/model/signals';

it('bounds field allocation independently of a large viewport or invalid dimensions', () => {
  expect(signalGeometry(390, 844).crosses.length).toBeGreaterThan(0);
  expect(signalGeometry(15360, 8640).crosses.length).toBeLessThanOrEqual(400);
  expect(signalGeometry(0, Infinity)).toEqual({ grid: '', crosses: [] });
});
