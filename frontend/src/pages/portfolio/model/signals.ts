export type SignalGeometry = { grid: string; crosses: string[] };

/** Build a viewport-sized signal grid with a strict allocation ceiling.
 * @param width Rendered field width, independent of document length.
 * @param height Rendered field height.
 * @returns Grid path and at most 400 centered cross paths; invalid dimensions yield no paths.
 */
export function signalGeometry(width: number, height: number): SignalGeometry {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return { grid: '', crosses: [] };
  let spacing = width < 600 ? 80 : 120;
  while (Math.ceil(width / spacing) * Math.ceil(height / spacing) > 400) spacing *= 1.1;
  const columns = Math.ceil(width / spacing),
    rows = Math.ceil(height / spacing);
  const x0 = (width - (columns - 1) * spacing) / 2,
    y0 = (height - (rows - 1) * spacing) / 2;
  const grid: string[] = [],
    crosses: string[] = [];
  for (let x = x0 % (spacing / 2); x < width; x += spacing / 2) grid.push(`M${x},0V${height}`);
  for (let y = y0 % (spacing / 2); y < height; y += spacing / 2) grid.push(`M0,${y}H${width}`);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const x = x0 + column * spacing,
        y = y0 + row * spacing;
      crosses.push(`M${x - 7},${y}h14 M${x},${y - 7}v14`);
    }
  return { grid: grid.join(' '), crosses };
}
