"""Build a native, orthographically projected globe turn from the existing SVG.

Only new rotation data, CSS and SVG exports are written. The existing globe is
read verbatim for the static/reduced-motion version. Its front green continents
are sampled in spherical longitude/latitude; the unseen hemisphere is completed
with hand-authored, stylized UV continent polygons in the same palette. This is
decorative geography, not an accurate world map.

Usage: python3 frontend/scripts/build-cow-globe-rotation.py
"""

import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET


FRONTEND = Path(__file__).resolve().parents[1]
ASSETS = FRONTEND / "src/assets/cow-workspace"
NS = "{http://www.w3.org/2000/svg}"
RECT = re.compile(r"M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)H([\d.]+)z")
FRAME_COUNT = 120
DURATION = 36
GRID = 4
OCEAN = "#3897b8"
OCEAN_PALETTE = ("#1b4e89", "#1c7ccc", "#1c84cc", "#228fe1",
                 "#2b98e8", "#3aafe8", "#56c8e9")
GLOSS_COLORS = {"#66b8a9", "#a3c6bd", "#bcd4ba"}

# Longitude is measured from the original front view. Both horizon meridians
# (+/-90 degrees) stay ocean. These closed contours complete only the unseen
# rear hemisphere, and never cut or replace any source front continent.
BACK_CONTINENTS = (
    ((111, 27), (118, 43), (132, 51), (139, 64), (153, 60),
     (156, 50), (168, 49), (178, 39), (185, 36), (180, 22),
     (188, 12), (182, 2), (169, 6), (162, -5), (149, -7),
     (144, 4), (133, 7), (130, 18), (117, 16)),
    ((167, -12), (179, -8), (194, -16), (204, -19), (212, -34),
     (207, -46), (196, -58), (186, -52), (183, -40), (171, -36),
     (166, -25), (159, -20)),
    ((212, 34), (220, 47), (236, 49), (247, 42), (251, 29),
     (242, 19), (244, 10), (235, 3), (224, 9), (218, 21),
     (205, 25)),
    ((233, -24), (244, -20), (253, -27), (249, -39),
     (239, -43), (231, -34)),
    ((197, 60), (204, 66), (214, 65), (218, 59), (208, 54)),
    ((222, -5), (228, -3), (232, -9), (228, -14), (221, -11)),
)


def number(value):
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


def rgb(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def land_color(color):
    red, green, blue = rgb(color)
    return color not in GLOSS_COLORS and green > red + 12 and green > blue + 8


def inside_polygon(x, y, points):
    hit = False
    ax, ay = points[-1]
    for bx, by in points:
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
        ax, ay = bx, by
    return hit


def source_paths(group):
    return [{key: (float(value) if key == "opacity" else value)
             for key, value in node.attrib.items() if key in {"fill", "d", "opacity"}}
            for node in group.iter(NS + "path")]


def svg_paths(paths):
    return "".join('<path ' + " ".join(f'{key}="{value}"' for key, value in path.items()) + '/>'
                   for path in paths)


def circle(sphere):
    cx, cy, radius = (sphere[key] for key in ("cx", "cy", "r"))
    return (f"M{number(cx - radius)} {number(cy)}a{number(radius)} {number(radius)} 0 1 0 "
            f"{number(2 * radius)} 0a{number(radius)} {number(radius)} 0 1 0 "
            f"-{number(2 * radius)} 0z")


def within_circle(x, y, size, sphere):
    cx, cy, radius = (sphere[key] for key in ("cx", "cy", "r"))
    return all((xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2 + 1e-7
               for xx in (x, x + size) for yy in (y, y + size))


def merge_cells(cells, grid):
    """Combine adjacent same-material cells without adding a circle clip mask."""
    rows = defaultdict(dict)
    for (x, y), material in cells.items():
        rows[y][x] = material
    active, grouped = {}, defaultdict(list)
    if not rows:
        return []
    for y in range(min(rows), max(rows) + grid * 2, grid):
        xs, current, i = sorted(rows[y]), {}, 0
        while i < len(xs):
            x, end = xs[i], xs[i] + grid
            material = rows[y][x]
            i += 1
            while i < len(xs) and xs[i] == end and rows[y][xs[i]] == material:
                end += grid
                i += 1
            key = (*material, x, end - x)
            previous = active.pop(key, None)
            current[key] = (previous[0], previous[1] + grid) if previous else (y, grid)
        for key, (top, height) in active.items():
            grouped[key[:2]].append(f"M{number(key[2])} {number(top)}h{number(key[3])}"
                                   f"v{number(height)}H{number(key[2])}z")
        active = current
    paths = []
    for (color, opacity), pieces in sorted(grouped.items()):
        path = {"fill": color, "d": "".join(pieces)}
        if opacity != 1:
            path["opacity"] = opacity
        paths.append(path)
    return paths


def complete_gloss_land_holes(source_land, native_cells):
    """Complete only enclosed land gaps hidden by the original white gloss.

    The white reflection is screen-fixed, so its underlying material must still
    be land when that surface rotates away. An enclosed blue inlet with no white
    gloss remains unchanged. This repairs the new UV texture, never the source.
    """
    xs, ys = zip(*source_land)
    left, top, right, bottom = min(xs) - 2, min(ys) - 2, max(xs) + 2, max(ys) + 2
    white = {point for point, (color, _) in native_cells.items() if min(rgb(color)) > 175}
    missing = {(x, y) for y in range(top, bottom + 1, 2) for x in range(left, right + 1, 2)
               if (x, y) not in source_land}
    repaired = []
    while missing:
        start = min(missing)
        missing.remove(start)
        stack, component, exterior = [start], [], False
        while stack:
            point = stack.pop()
            component.append(point)
            x, y = point
            exterior |= x in (left, right) or y in (top, bottom)
            for neighbor in ((x - 2, y), (x + 2, y), (x, y - 2), (x, y + 2)):
                if neighbor in missing:
                    missing.remove(neighbor)
                    stack.append(neighbor)
        overlap = set(component) & white
        if exterior or not overlap:
            continue
        # A highlight repair is deliberately small. Unexpected broad missing
        # material should be reviewed instead of being silently painted over.
        if len(component) > 256:
            raise ValueError("White gloss intersects an unexpectedly large closed land gap")
        boundary = set()
        for x, y in component:
            for neighbor in ((x - 2, y), (x + 2, y), (x, y - 2), (x, y + 2)):
                if neighbor in source_land:
                    boundary.add(neighbor)
        if not boundary:
            raise ValueError("Closed gloss gap has no native green boundary")
        boundary = sorted(boundary)
        for x, y in component:
            nearest = min(boundary, key=lambda point: (point[0] - x) ** 2 + (point[1] - y) ** 2)
            source_land[(x, y)] = source_land[nearest]
        repaired.append({
            "nativeGrid": 2, "completedCells": len(component), "whiteGlossCells": len(overlap),
            "bounds": [min(x for x, y in component), min(y for x, y in component),
                       max(x for x, y in component) + 2, max(y for x, y in component) + 2],
            "method": "Closed non-land component intersecting small fixed white gloss; nearest original green boundary material.",
        })
    return repaired


def read_source(svg_path, source_map, repair_log=None):
    root = ET.parse(svg_path).getroot()
    map_group = next(node for node in root if node.get("id") == "globeMap")
    frame_group = next(node for node in root if node.get("id") == "globeFrame")
    sphere = json.loads(source_map.read_text())["globeGeometry"]
    paths = source_paths(map_group)
    native_cells, source_land, area = {}, {}, Counter()
    for path in paths:
        matches = list(RECT.finditer(path["d"]))
        if not matches:
            continue  # The complete, opaque native ocean circle.
        if "".join(m.group(0) for m in matches) != path["d"]:
            raise ValueError("Expected native rect paths in globeMap")
        material = (path["fill"], path.get("opacity", 1))
        for match in matches:
            x, y, width, height, last = map(float, match.groups())
            if x != last or any(value % 2 for value in (x, y, width, height)):
                raise ValueError("Expected complete globe's 2px native grid")
            for yy in range(int(y), int(y + height), 2):
                for xx in range(int(x), int(x + width), 2):
                    native_cells[(xx, yy)] = material
                    if land_color(material[0]):
                        source_land[(xx, yy)] = material[0]
                        area[material[0]] += 4
    if not source_land or not native_cells:
        raise ValueError("Existing globe must contain native ocean and green land")
    # Ten actual source colors retain the bright/medium/dark pixel-art texture.
    palette = [color for color, _ in area.most_common(10)]
    color_lookup = {color: min(palette, key=lambda candidate: sum(
        (rgb(color)[ch] - rgb(candidate)[ch]) ** 2 for ch in range(3))) for color in area}
    repairs = complete_gloss_land_holes(source_land, native_cells)
    if repair_log is not None:
        repair_log.extend(repairs)
    return root, sphere, native_cells, source_land, palette, color_lookup, paths, source_paths(frame_group)


def rays_for(sphere, grid):
    cx, cy, radius = (sphere[key] for key in ("cx", "cy", "r"))
    rays = []
    for y in range(math.floor((cy - radius) / grid) * grid,
                   math.ceil((cy + radius) / grid) * grid, grid):
        for x in range(math.floor((cx - radius) / grid) * grid,
                       math.ceil((cx + radius) / grid) * grid, grid):
            if not within_circle(x, y, grid, sphere):
                continue
            u, v = (x + grid / 2 - cx) / radius, (cy - y - grid / 2) / radius
            z = math.sqrt(max(0, 1 - u * u - v * v))
            rays.append((x, y, math.asin(v), math.atan2(u, z), u, v, z))
    return rays


def front_sample(longitude, latitude, sphere, source_land, color_lookup):
    # Forward projection of the source's inverse-orthographic UV: use only green
    # cells. Native rim/wood/unknown cells default to ocean, never dark continent.
    px = sphere["cx"] + sphere["r"] * math.cos(latitude) * math.sin(longitude)
    py = sphere["cy"] - sphere["r"] * math.sin(latitude)
    color = source_land.get((math.floor(px / 2) * 2, math.floor(py / 2) * 2))
    return color_lookup[color] if color else None


def rear_sample(longitude, latitude, palette):
    lon, lat = math.degrees(longitude) % 360, math.degrees(latitude)
    owner = next((index for index, contour in enumerate(BACK_CONTINENTS)
                  if inside_polygon(lon, lat, contour)), None)
    if owner is None:
        return None
    # Low-frequency two-dimensional terrain patches are quantized into native
    # palette facets. Both latitude and longitude contribute to every patch;
    # no modulo/hash pattern can collapse into vertical barcode stripes.
    field = (0.56 + 0.20 * math.sin(math.radians(lon * 2.4 + lat * 1.7))
             + 0.12 * math.cos(math.radians(lon * 1.2 - lat * 2.8))
             + 0.07 * math.cos(math.radians(lat * 4.5)))
    if field < 0.38:
        color = "#5cac5c"
    elif field < 0.55:
        color = "#62b65f"
    elif field < 0.70:
        color = "#7ccc6c"
    else:
        color = "#b2e56d"
    return color if color in palette else palette[0]


def build_land(theta, rays, sphere, source_land, palette, color_lookup):
    # Normalize the turn itself before ray addition, so the terminal phase uses
    # exactly the same floating-point arithmetic as phase zero.
    theta %= 2 * math.pi
    cells = {}
    for x, y, latitude, visible_longitude, *_ in rays:
        longitude = (visible_longitude + theta + math.pi) % (2 * math.pi) - math.pi
        if abs(longitude) <= math.pi / 2:
            color = front_sample(longitude, latitude, sphere, source_land, color_lookup)
        else:
            color = rear_sample(longitude, latitude, palette)
        if color:
            cells[(x, y)] = (color, 1)
    return cells


def fixed_surfaces(sphere, native_cells, rays):
    # Fill every ocean ray from one continuous light field, rather than retaining
    # blue source patches whose missing green cells encode the old coast shape.
    water = {}
    for x, y, _, _, u, v, z in rays_for(sphere, 2):
        intensity = min(1, max(0, 0.42 + 0.25 * z + 0.16 * (-u + v)))
        index = min(len(OCEAN_PALETTE) - 1, math.floor(intensity * len(OCEAN_PALETTE)))
        water[(x, y)] = (OCEAN_PALETTE[index], 1)
    gloss = {}
    for (x, y), material in native_cells.items():
        if not within_circle(x, y, 2, sphere):
            continue
        red, green, blue = rgb(material[0])
        # Keep only the small original white specular spot. The broad turquoise
        # gloss is intentionally omitted because it carried the old coast shape.
        if min(red, green, blue) > 175:
            gloss[(x, y)] = material
    base = [{"fill": OCEAN_PALETTE[0], "d": circle(sphere)}, *merge_cells(water, 2)]
    shade = {}
    for x, y, _, _, u, v, z in rays:
        # A screen-fixed, coarse rim/lower-right shade gives the rotating coast a
        # spherical light field. No material carries this shading around the UV.
        amount = max(0, (1 - z) * 0.12 + max(0, u - v - 0.22) * 0.035 - 0.025)
        quantized = round(amount / 0.025) * 0.025
        if quantized:
            shade[(x, y)] = ("#122849", round(min(0.175, quantized), 3))
    overlay = [*merge_cells(shade, GRID), *merge_cells(gloss, 2)]
    return base, overlay


def animation_css():
    rules = []
    for index in range(FRAME_COUNT):
        start, end = index / FRAME_COUNT * 100, (index + 1) / FRAME_COUNT * 100
        if index == 0:
            stops = f"0%{{opacity:1}}{end:.8f}%{{opacity:0}}100%{{opacity:0}}"
        else:
            stops = f"0%{{opacity:0}}{start:.8f}%{{opacity:1}}{end:.8f}%{{opacity:0}}"
            if index != FRAME_COUNT - 1:
                stops += "100%{opacity:0}"
        rules.append(f"@keyframes cow-globe-turn-{index}{{{stops}}}")
    return "\n".join(rules) + "\n"


def typescript(sphere, base, overlay, frames, source_hash):
    out = ["// Generated by scripts/build-cow-globe-rotation.py; native vector geometry only.",
           "export interface CowGlobeRotationPath { readonly fill: string; readonly d: string; readonly opacity?: number; }",
           "export interface CowGlobeRotationFrame { readonly angle: number; readonly paths: readonly CowGlobeRotationPath[]; }",
           f"export const COW_GLOBE_ROTATION_DURATION = {DURATION};",
           f"export const COW_GLOBE_ROTATION_FRAME_COUNT = {FRAME_COUNT};",
           f"export const COW_GLOBE_ROTATION_GRID = {GRID};",
           "export const COW_GLOBE_ROTATION_GEOMETRY = " + json.dumps(sphere) + " as const;",
           "export const COW_GLOBE_ROTATION_SOURCE_SHA = " + json.dumps(source_hash) + ";",
           "export const COW_GLOBE_ROTATION_BASE: readonly CowGlobeRotationPath[] = " + json.dumps(base, separators=(",", ":")) + ";",
           "export const COW_GLOBE_ROTATION_OVERLAY: readonly CowGlobeRotationPath[] = " + json.dumps(overlay, separators=(",", ":")) + ";"]
    for index, frame in enumerate(frames):
        out.append(f"const FRAME_{index}: readonly CowGlobeRotationPath[] = " + json.dumps(frame["paths"], separators=(",", ":")) + ";")
    out.append("export const COW_GLOBE_ROTATION_FRAMES: readonly CowGlobeRotationFrame[] = [")
    out += [f"  {{ angle: {number(frame['angle'])}, paths: FRAME_{index} }}," for index, frame in enumerate(frames)]
    out.append("];")
    return "\n".join(out) + "\n"


def review_svg(root, base, overlay, frames, frame_paths):
    view = list(map(float, root.get("viewBox").split()))
    x, y, width, height = view
    column_width, margin = width + 32, 24
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {number(column_width * 5 + margin * 2)} {number(height + 78)}" shape-rendering="crispEdges" role="img">',
           '<title>地球儀球面旋轉對照</title>',
           '<rect width="100%" height="100%" fill="#f6f4ed"/>']
    original_groups = "".join(ET.tostring(node, encoding="unicode") for node in root if node.get("id") in {"globeMap", "globeFrame"})
    tiles = [("原始靜態", original_groups)]
    for angle in (0, 90, 180, 270):
        frame = frames[round(angle / 360 * FRAME_COUNT)]
        tiles.append((f"旋轉 {angle}°", svg_paths(base) + svg_paths(frame["paths"]) + svg_paths(overlay) + svg_paths(frame_paths)))
    for index, (label, paths) in enumerate(tiles):
        left = margin + index * column_width
        out.append(f'<text x="{number(left)}" y="24" fill="#26312a" font-family="sans-serif" font-size="13">{label}</text>')
        out.append(f'<g transform="translate({number(left - x)} {number(48 - y)})">{paths}</g>')
    return "".join(out) + "</svg>\n"


def rotating_svg(root, base, overlay, frames, frame_paths, css):
    styles = (css + f".cow-globe-land{{opacity:0;animation-duration:{DURATION}s;animation-timing-function:step-end;animation-iteration-count:infinite}}"
              + "".join(f".cow-globe-land-{i}{{animation-name:cow-globe-turn-{i}}}" for i in range(FRAME_COUNT))
              + ".cow-globe-original{display:none}"
              + "@media(prefers-reduced-motion:reduce){.cow-globe-animated{display:none}.cow-globe-original{display:inline}}")
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{root.get("viewBox")}" shape-rendering="crispEdges" role="img" aria-labelledby="title">',
           '<title id="title">會轉動的地球儀</title>',
           '<desc>地球每 36 秒轉一圈，海洋光澤與框座保持固定。系統設定減少動態效果時顯示原始靜態圖。</desc>',
           f"<style>{styles}</style>", '<g class="cow-globe-animated">', svg_paths(base)]
    for index, frame in enumerate(frames):
        out.append(f'<g class="cow-globe-land cow-globe-land-{index}" data-angle="{number(frame["angle"])}">{svg_paths(frame["paths"])}</g>')
    out += [svg_paths(overlay), svg_paths(frame_paths), '</g><g class="cow-globe-original">']
    out += [ET.tostring(node, encoding="unicode") for node in root if node.get("id") in {"globeMap", "globeFrame"}]
    return "".join(out) + "</g></svg>\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=ASSETS)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or args.assets
    output.mkdir(parents=True, exist_ok=True)
    source = args.assets / "complete-globe.svg"
    source_map = args.assets / "complete-props.source-map.json"
    source_bytes = source.read_bytes()
    source_hash = sha256(source_bytes).hexdigest()
    land_repairs = []
    root, sphere, native_cells, source_land, palette, lookup, original_paths, frame_paths = read_source(source, source_map, land_repairs)
    rays = rays_for(sphere, GRID)
    base, overlay = fixed_surfaces(sphere, native_cells, rays)
    frames, material_frames = [], []
    for index in range(FRAME_COUNT):
        angle = index / FRAME_COUNT * 360
        cells = build_land(math.radians(angle), rays, sphere, source_land, palette, lookup)
        material_frames.append(cells)
        frames.append({"angle": angle, "paths": merge_cells(cells, GRID)})
    loop = build_land(2 * math.pi, rays, sphere, source_land, palette, lookup)
    assert loop == material_frames[0], "360-degree projection must exactly repeat frame zero"
    assert all(within_circle(x, y, GRID, sphere) for cells in material_frames for x, y in cells)
    assert all(frame["paths"] for frame in frames), "Every turn must contain a complete land surface"
    css = animation_css()
    (output / "globe-rotation.ts").write_text(typescript(sphere, base, overlay, frames, source_hash))
    (output / "globe-rotation.css").write_text(css)
    (output / "globe-rotation-review.svg").write_text(review_svg(root, base, overlay, frames, frame_paths))
    (output / "complete-globe-rotating.svg").write_text(rotating_svg(root, base, overlay, frames, frame_paths, css))
    # The readable audit records the decorative back-map provenance and numeric
    # containment/loop checks. No raster source is opened or generated.
    report = {
        "source": source.name, "sourceSha256": source_hash,
        "sourceMapSha256": sha256(source_map.read_bytes()).hexdigest(),
        "method": "Inverse/forward orthographic sphere, longitude += angle; no planar rotation.",
        "geometry": sphere, "frameCount": FRAME_COUNT, "durationSeconds": DURATION,
        "worldGrid": GRID, "raysPerFrame": len(rays), "landPalette": palette,
        "frontSourceLandCells": len(source_land),
        "sourceLandGlossHoleRepairs": land_repairs,
        "backSurface": "Closed native stylized continent contours in UV; decorative, not geographic reference.",
        "backContours": BACK_CONTINENTS,
        "fixedBasePaths": len(base), "fixedOverlayPaths": len(overlay),
        "frameLandCells": [len(cells) for cells in material_frames],
        "framePathCounts": [len(frame["paths"]) for frame in frames],
        "quarterTurnFrames": [0, FRAME_COUNT // 4, FRAME_COUNT // 2, FRAME_COUNT * 3 // 4],
        "loop360Equals0": loop == material_frames[0],
        "allLandRectCornersInsideSphere": True,
        "nativeFrameUnchanged": True,
        "staticExact": "Original globeMap and globeFrame native paths, with prefers-reduced-motion fallback.",
        "originalSvgUnchanged": source.read_bytes() == source_bytes,
    }
    (output / "globe-rotation-provenance.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("geometry", "frameCount", "durationSeconds", "worldGrid", "raysPerFrame", "fixedBasePaths", "fixedOverlayPaths", "framePathCounts", "loop360Equals0", "originalSvgUnchanged")}, indent=2))


if __name__ == "__main__":
    main()
