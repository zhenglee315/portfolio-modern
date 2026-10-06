export type Point = readonly [number, number];
export const mapBox = { width: 1080, height: 490 };

/** Extend the original Eurasian crop to every supplied stop and ultrawide atlas space. */
export function atlasViewport(points: Point[], width: number, height: number, wide: boolean) {
  const expanded = wide && height > 0 ? Math.max(1080, (490 * width) / height) : 1080;
  const left = Math.min((1080 - expanded) / 2, ...points.map((point) => point[0] - 60));
  const right = Math.max((1080 + expanded) / 2, ...points.map((point) => point[0] + 60));
  const top = Math.min(0, ...points.map((point) => point[1] - 50));
  const bottom = Math.max(490, ...points.map((point) => point[1] + 50));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Project validated coordinates onto the exact Mercator atlas used by the legacy site. */
export function projectPoint({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): Point {
  const radians = Math.PI / 180;
  const mercator = (value: number) =>
    Math.log(
      Math.tan(Math.PI / 4 + (Math.max(-85.051129, Math.min(85.051129, value)) * radians) / 2),
    );
  return [540 + 365 * (longitude - 58) * radians, 245 + 365 * (mercator(34) - mercator(latitude))];
}

/** Derive a bounded quadratic flight arc, with a visible loop for coincident stops. */
export function routePath(a: Point, b: Point) {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (distance < 1) return `M ${a} C ${a[0] + 20} ${a[1] - 30} ${b[0] - 20} ${b[1] - 30} ${b}`;
  return `M ${a} Q ${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2 - Math.min(85, Math.max(18, distance * 0.18))} ${b}`;
}

type Rect = { x: number; y: number; width: number; height: number };
type MeasuredLabel = { id: number; point: Point; width: number; height: number };

/** Check overlap in atlas units, independent of DOM and language. */
export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Place selected labels first, avoiding label/marker collisions and atlas edges.
 * @param labels DOM-measured text bounds; ordering remains stable except selection priority.
 * @param scale SVG screen scale, keeping visible spacing consistent across viewports.
 * @returns Rectangle positions; crowded text is hidden while markers remain selectable.
 */
export function placeLabels(
  labels: MeasuredLabel[],
  selectedId: number,
  scale: number,
  bounds = { x: 0, y: 0, ...mapBox },
) {
  const gap = 12 / Math.max(0.05, scale),
    padding = 4 / Math.max(0.05, scale);
  const occupied: Rect[] = [];
  const markers = labels.map((label) => ({
    x: label.point[0] - padding,
    y: label.point[1] - padding,
    width: padding * 2,
    height: padding * 2,
  }));
  const result = new Map<number, Rect | undefined>();
  const ordered = [...labels].sort(
    (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId),
  );
  for (const label of ordered) {
    let chosen: Rect | undefined;
    for (const radius of [gap, gap * 2.5, gap * 4]) {
      for (const [dx, dy] of [
        [1, -1],
        [1, 1],
        [-1, -1],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, 0],
        [-1, 0],
      ]) {
        const x =
          label.point[0] +
          (dx ?? 0) * radius -
          ((dx ?? 0) < 0 ? label.width : dx === 0 ? label.width / 2 : 0);
        const y =
          label.point[1] +
          (dy ?? 0) * radius -
          ((dy ?? 0) < 0 ? label.height : dy === 0 ? label.height / 2 : 0);
        const candidate = {
          x: Math.max(
            bounds.x + padding,
            Math.min(bounds.x + bounds.width - label.width - padding, x),
          ),
          y: Math.max(
            bounds.y + padding,
            Math.min(bounds.y + bounds.height - label.height - padding, y),
          ),
          width: label.width,
          height: label.height,
        };
        if (
          label.width > bounds.width - padding * 2 ||
          occupied.some((rect) => intersects(rect, candidate)) ||
          markers.some((rect) => intersects(rect, candidate))
        )
          continue;
        chosen = candidate;
        break;
      }
      if (chosen) break;
    }
    if (chosen) occupied.push(chosen);
    result.set(label.id, chosen);
  }
  return result;
}
