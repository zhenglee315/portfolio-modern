import mascot from '@/assets/icons/cow-engineer.svg?url';

const trustedIcons = new Set([
  'src/assets/icons/cow-engineer.svg',
  'assets/icons/cow-engineer.svg',
  'assets/cow-engineer.svg',
  'cow-engineer.svg',
]);

/** Resolve API artwork identifiers to bundled assets; never fetch arbitrary image URLs. */
export const contactArtwork = (icon: string) => (trustedIcons.has(icon) ? mascot : undefined);
