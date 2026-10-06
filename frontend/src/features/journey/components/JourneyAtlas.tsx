import { memo, useLayoutEffect, useRef } from 'react';
import atlas from '@/assets/maps/world.svg?raw';
import type { JourneyStop } from '../schemas/journey';

// Only trusted repository markup crosses this boundary; API fields never become SVG markup.
const artwork = {
  __html: atlas.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
};

/** Preserve atlas DOM and country decoration across chapter, popup and locale rerenders.
 * @param finalCountry Validated country code from the final authoritative Journey record.
 * Country highlighting runs only when its value changes; React owns no copied country state.
 */
export const JourneyAtlas = memo(function JourneyAtlas({
  finalCountry,
}: {
  finalCountry?: JourneyStop['countryCode'];
}) {
  const root = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    root.current?.querySelectorAll<SVGPathElement>('.country').forEach((country) => {
      country.classList.toggle('final-country', country.dataset.country === finalCountry);
    });
  }, [finalCountry]);
  return <g ref={root} data-journey-atlas dangerouslySetInnerHTML={artwork} />;
});
