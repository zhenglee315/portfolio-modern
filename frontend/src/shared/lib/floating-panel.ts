type Bounds = { left: number; top: number; width: number; height: number };

/** Clamp an anchored panel between optional protected upper/lower surfaces.
 * @param topBoundary Protected header's bottom in container coordinates; defaults to zero.
 * @returns Position, tail orientation and available height. Oversized callers constrain their
 * content to maxHeight before their final measurement; overPoint suppresses a misleading tail.
 */
export function floatingPosition(
  anchor: Bounds,
  container: Bounds,
  width: number,
  height: number,
  bottom = container.height,
  topBoundary = 0,
) {
  const x = anchor.left + anchor.width / 2 - container.left,
    y = anchor.top + anchor.height / 2 - container.top;
  const left = Math.max(12, Math.min(container.width - width - 12, x - width * 0.65));
  const minimumTop = Math.max(12, topBoundary + 12);
  const maximumTop = Math.max(minimumTop, bottom - height - 24);
  const desired = y - height - 24 < minimumTop ? y + 24 : y - height - 24;
  const top = Math.max(minimumTop, Math.min(maximumTop, desired));
  return {
    left,
    top,
    below: top > y,
    tail: Math.max(26, Math.min(width - 42, x - left)),
    maxHeight: Math.max(0, bottom - topBoundary - 36),
    overPoint: y >= top && y <= top + height,
  };
}

/** Place a side panel without changing the existing right-side geometry.
 * Left placement falls back to the ordinary above/below panel when its shell cannot fit,
 * so the returned side also determines whether a horizontal tail can point at the anchor.
 */
export function floatingSidePosition(
  anchor: Bounds,
  container: Bounds,
  width: number,
  height: number,
  side: 'left' | 'right',
  bottom = container.height,
  topBoundary = 0,
) {
  const ordinary = floatingPosition(anchor, container, width, height, bottom, topBoundary);
  const left = anchor.left - container.left - width - 18;
  if (side === 'left' && (left < 14 || left + width > container.width - 14)) {
    return { ...ordinary, side: null };
  }
  return {
    ...ordinary,
    left:
      side === 'left'
        ? left
        : Math.max(
            14,
            Math.min(
              container.width - width - 14,
              anchor.left + anchor.width - container.left + 18,
            ),
          ),
    top:
      side === 'left'
        ? Math.max(
            topBoundary + 12,
            Math.min(
              bottom - height - 12,
              anchor.top + anchor.height / 2 - container.top - height / 2,
            ),
          )
        : Math.max(12, Math.min(container.height - height - 12, anchor.top - container.top)),
    below: false,
    side,
  };
}
