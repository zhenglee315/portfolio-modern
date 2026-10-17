import { expect, it } from 'vitest';
import { publicSiteOrigin } from '@/shared/lib/site-url';

it('requires an explicit safe public origin for SEO URLs', () => {
  expect(publicSiteOrigin('https://example.com/')).toBe('https://example.com');
  for (const value of [
    '',
    'javascript:alert(1)',
    'https://user:secret@example.com',
    'https://example.com/private?x=1',
  ])
    expect(publicSiteOrigin(value)).toBeUndefined();
});
