import { describe, expect, it } from 'vitest';
import { readMapLocation, selectedMapLocation } from '@/pages/profile/model/location';

describe('profile map coordinates', () => {
  it.each([
    ['', ''],
    ['', '0'],
    ['0', ''],
    ['91', '20'],
    ['0', '-181'],
    ['NaN', '1'],
  ])('rejects incomplete or invalid coordinates %s, %s', (lat, lng) => {
    expect(readMapLocation(lat, lng)).toBeNull();
  });
  it('retains real zero coordinates and valid pole/dateline values', () => {
    expect(readMapLocation('0', '0')).toEqual({ latitude: 0, longitude: 0 });
    expect(readMapLocation('90', '180')).toEqual({ latitude: 90, longitude: 180 });
  });
  it('wraps world copies, clamps the Mercator range and rounds consistently', () => {
    expect(selectedMapLocation({ lat: 100, lng: 541 })).toEqual({
      latitude: 85.051129,
      longitude: -179,
    });
    expect(selectedMapLocation({ lat: -100, lng: -541 })).toEqual({
      latitude: -85.051129,
      longitude: 179,
    });
    expect(selectedMapLocation({ lat: 51.52461234, lng: -0.13401234 })).toEqual({
      latitude: 51.524612,
      longitude: -0.134012,
    });
  });
});
