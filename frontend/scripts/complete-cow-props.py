"""Trace new independent transparent prop PNGs; never read old scene fragments."""

import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import xml.etree.ElementTree as ET
import zlib

FRONTEND = Path(__file__).resolve().parents[1]
OUTPUT = FRONTEND / "src/assets/cow-workspace"
SIZE = 1254
NS = "{http://www.w3.org/2000/svg}"
KEYS = ("laptop", "mug", "steam", "plantPot", "plantLeaves", "books", "globeFrame", "globeMap", "openBook", "desk", "deskContactShadows")
ASSETS = {"laptop": ("laptop",), "coffee": ("mug", "steam"), "plantPot": ("plantPot",), "plantLeaves": ("plantLeaves",), "plant": ("plantPot", "plantLeaves"), "books": ("books",), "globe": ("globeMap", "globeFrame"), "openBook": ("openBook",), "desk": ("desk",)}
DIRECT = {"laptop": "laptop", "coffee": "mug", "plantPot": "plantPot", "plantLeaves": "plantLeaves", "books": "books", "openBook": "openBook", "desk": "desk"}


def read_png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    offset, packed = 8, []
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            width, height, depth, mode, _, _, interlace = struct.unpack(">IIBBBBB", payload)
            assert (depth, mode, interlace) == (8, 6, 0), "Expected RGBA PNG"
        elif kind == b"IDAT":
            packed.append(payload)
        offset += length + 12
    raw = zlib.decompress(b"".join(packed))
    stride, rows, previous = width * 4, [], bytearray(width * 4)
    for y in range(height):
        start = y * (stride + 1)
        method, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        if method:
            for x in range(stride):
                left, above, diagonal = row[x - 4] if x >= 4 else 0, previous[x], previous[x - 4] if x >= 4 else 0
                if method == 1:
                    predictor = left
                elif method == 2:
                    predictor = above
                elif method == 3:
                    predictor = (left + above) // 2
                elif method == 4:
                    p = left + above - diagonal
                    ds = abs(p - left), abs(p - above), abs(p - diagonal)
                    predictor = (left, above, diagonal)[ds.index(min(ds))]
                else:
                    raise ValueError(f"Invalid PNG filter {method}")
                row[x] = (row[x] + predictor) & 255
        rows.append(row)
        previous = row
    return width, height, rows


def bounds_for(width, rows, threshold):
    left, top, right, bottom, zero = width, len(rows), -1, -1, 0
    for y, row in enumerate(rows):
        for x in range(width):
            a = row[x * 4 + 3]
            zero += a == 0
            if a >= threshold:
                left, top, right, bottom = min(left, x), min(top, y), max(right, x), max(bottom, y)
    assert right >= left and zero > width * len(rows) * 0.04, "Source must have real transparency and visible artwork"
    return [left, top, right + 1, bottom + 1]


def place(bounds, entry):
    left, top, right, bottom = bounds
    bx, by, bw, bh = entry["box"]
    scale = min(bw / (right - left), bh / (bottom - top))
    width, height = (right - left) * scale, (bottom - top) * scale
    x = bx + (bw - width) / 2
    y = by if entry.get("align") == "center-top" else by + bh - height
    return {"scale": scale, "translateX": x - left * scale, "translateY": y - top * scale,
            "placedAlphaBounds": [x, y, x + width, y + height]}


def world(x, y, placement):
    return x * placement["scale"] + placement["translateX"], y * placement["scale"] + placement["translateY"]


def sphere_for(rows, bounds, placement, override=None):
    if override:
        source = override
    else:
        xs, ys = [], []
        for y in range(bounds[1], bounds[3], 2):
            for x in range(bounds[0], bounds[2], 2):
                r, g, b, a = rows[y][x * 4:x * 4 + 4]
                if a >= 192 and ((b > r + 25 and b > g - 15) or (g > r + 15 and g > b + 10)):
                    xs.append(x); ys.append(y)
        assert len(xs) > 100, "Provide sourceSphere for globe"
        source = {"cx": (min(xs) + max(xs) + 2) / 2, "cy": (min(ys) + max(ys) + 2) / 2,
                  "r": min(max(xs) - min(xs) + 2, max(ys) - min(ys) + 2) / 2}
    cx, cy = world(source["cx"], source["cy"], placement)
    return source, {"cx": round(cx, 3), "cy": round(cy, 3), "r": round(source["r"] * placement["scale"], 3)}


def circle(cx, cy, radius, reverse=False):
    sweep = 1 if reverse else 0
    return f"M{cx-radius:g} {cy:g}a{radius:g} {radius:g} 0 1 {sweep} {2*radius:g} 0a{radius:g} {radius:g} 0 1 {sweep} {-2*radius:g} 0z"


def steam_for(rows, bounds, placement):
    points = []
    for y in range(bounds[1], round(bounds[1] + (bounds[3] - bounds[1]) * 0.25), 2):
        for x in range(bounds[0], bounds[2], 2):
            r, g, b, a = rows[y][x * 4:x * 4 + 4]
            if a >= 192 and r > g + 10 and g > b + 5:
                points.append((x, y))
    center = ((min(x for x, y in points) + max(x for x, y in points)) / 2,
              (min(y for x, y in points) + max(y for x, y in points)) / 2)
    cx, cy = world(*center, placement)
    cx, cy = round(cx / 2) * 2, round(cy / 2) * 2
    paths = []
    for shift, opacity in ((-7, 0.74), (8, 0.42)):
        left = [(round((cx + shift + math.sin(i / 4) * (7 + i * 0.18)) / 2) * 2, cy - i * 6) for i in range(31)]
        right = [(x + (6 if i < 22 else 4), y) for i, (x, y) in reversed(list(enumerate(left)))]
        paths.append({"fill": "#ead7bd", "d": "M" + "L".join(f"{x} {y}" for x, y in left + right) + "z", "opacity": opacity})
    return paths, [cx, cy]


def sample(source, grid, sphere):
    placement, width, rows = source["placement"], source["width"], source["rows"]
    x0, y0, x1, y1 = placement["placedAlphaBounds"]
    result = {}
    for gy in range(max(0, math.floor(y0 / grid)), min(SIZE // grid, math.ceil(y1 / grid))):
        for gx in range(max(0, math.floor(x0 / grid)), min(SIZE // grid, math.ceil(x1 / grid))):
            samples = []
            for dy in range(grid):
                for dx in range(grid):
                    sx = math.floor((gx * grid + dx + 0.5 - placement["translateX"]) / placement["scale"])
                    sy = math.floor((gy * grid + dy + 0.5 - placement["translateY"]) / placement["scale"])
                    if 0 <= sx < width and 0 <= sy < len(rows):
                        value = rows[sy][sx * 4:sx * 4 + 4]
                        if value[3] >= source["traceAlphaThreshold"]:
                            samples.append(value)
            total = sum(c[3] for c in samples)
            if not total:
                continue
            alpha = min(255, round(total / (grid * grid) / 17) * 17)
            if not alpha:
                continue
            rgb = tuple(min(255, (round(sum(c[i] * c[3] for c in samples) / total) // 8) * 8 + 4) for i in range(3))
            name = DIRECT.get(source["name"])
            if source["name"] == "globe":
                cx, cy, radius = sphere["cx"], sphere["cy"], sphere["r"]
                corners = [(gx * grid, gy * grid), ((gx + 1) * grid, gy * grid), (gx * grid, (gy + 1) * grid), ((gx + 1) * grid, (gy + 1) * grid)]
                wooden_meridian = rgb[0] > rgb[1] + 12 and rgb[1] > rgb[2] + 12
                if wooden_meridian:
                    name = "globeFrame"
                elif all((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 for x, y in corners):
                    name = "globeMap"
                elif (gx * grid + grid / 2 - cx) ** 2 + (gy * grid + grid / 2 - cy) ** 2 <= (radius + grid) ** 2:
                    continue
                else:
                    name = "globeFrame"
            result[(gx, gy)] = (name, rgb, alpha)
    return result


def quantize(histogram, maximum):
    boxes = [list(histogram)]
    while len(boxes) < maximum:
        candidates = []
        for i, box in enumerate(boxes):
            if len(box) > 1:
                spread = max(max(c[j] for c in box) - min(c[j] for c in box) for j in range(3))
                candidates.append((spread * sum(histogram[c] for c in box), i))
        if not candidates:
            break
        _, index = max(candidates); box = boxes.pop(index)
        channel = max(range(3), key=lambda j: max(c[j] for c in box) - min(c[j] for c in box))
        box.sort(key=lambda c: c[channel]); half = sum(histogram[c] for c in box) / 2
        total, split = 0, 1
        for i, color in enumerate(box[:-1]):
            total += histogram[color]; split = i + 1
            if total >= half:
                break
        boxes.extend((box[:split], box[split:]))
    palette = [tuple(round(sum(c[j] * histogram[c] for c in box) / sum(histogram[c] for c in box)) for j in range(3)) for box in boxes]
    lookup = {c: min(range(len(palette)), key=lambda k: sum((c[j] - palette[k][j]) ** 2 * (2, 4, 3)[j] for j in range(3))) for c in histogram}
    return palette, lookup


def trace(cells, grid, palette, lookup):
    grouped, active = defaultdict(list), {}
    for gy in range(SIZE // grid):
        current, gx = {}, 0
        while gx < SIZE // grid:
            raw = cells.get((gx, gy)); value = (raw[0], lookup[raw[1]], raw[2]) if raw else None
            end = gx + 1
            while end < SIZE // grid:
                raw = cells.get((end, gy)); other = (raw[0], lookup[raw[1]], raw[2]) if raw else None
                if other != value:
                    break
                end += 1
            if value:
                key = (*value, gx, end - gx); old = active.pop(key, None)
                current[key] = (old[0], old[1] + grid) if old else (gy * grid, grid)
            gx = end
        for (name, color, alpha, x, width), (top, height) in active.items():
            grouped[(name, color, alpha)].append(f"M{x*grid} {top}h{width*grid}v{height}H{x*grid}z")
        active = current
    for (name, color, alpha, x, width), (top, height) in active.items():
        grouped[(name, color, alpha)].append(f"M{x*grid} {top}h{width*grid}v{height}H{x*grid}z")
    result = {name: [] for name in KEYS}
    for (name, color, alpha), geometry in grouped.items():
        path = {"fill": "#" + "".join(f"{c:02x}" for c in palette[color]), "d": "".join(geometry)}
        if alpha != 255:
            path["opacity"] = round(alpha / 255, 4)
        result[name].append(path)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--manifest", type=Path, default=OUTPUT / "props-redraw-manifest.json")
    args = parser.parse_args(); config = json.loads(args.manifest.read_text())
    missing = [e["name"] for e in config["props"] if not (args.manifest.parent / e["source"]).exists()]
    if missing and not args.inspect:
        print(json.dumps({"status": "waiting-for-independent-sources", "missing": missing, "outputsChanged": False})); return
    sources, provenance, part_bounds, steam, sphere = [], [], {}, [], None
    for entry in config["props"]:
        path = args.manifest.parent / entry["source"]
        if not path.exists():
            continue
        width, height, rows = read_png(path)
        threshold = entry.get("alphaThreshold", config.get("alphaThreshold", 192))
        bounds = bounds_for(width, rows, threshold); placement = place(bounds, entry)
        record = {"name": entry["name"], "source": entry["source"], "sourceSha256": sha256(path.read_bytes()).hexdigest(), "sourceSize": [width, height], "alphaBounds": bounds, "alphaThreshold": threshold, "placementBox": entry["box"], "placement": placement, "inputKind": "new-complete-independent-illustration"}
        source = {"name": entry["name"], "width": width, "rows": rows, "placement": placement, "traceAlphaThreshold": entry.get("traceAlphaThreshold", threshold)}
        if entry["name"] == "globe":
            record["sourceSphere"], sphere = sphere_for(rows, bounds, placement, entry.get("sourceSphere")); record["worldSphere"] = sphere
            part_bounds["globeMap"] = [sphere["cx"] - sphere["r"], sphere["cy"] - sphere["r"], sphere["cx"] + sphere["r"], sphere["cy"] + sphere["r"]]
            part_bounds["globeFrame"] = placement["placedAlphaBounds"]
        else:
            part_bounds[DIRECT[entry["name"]]] = placement["placedAlphaBounds"]
        if entry["name"] == "coffee":
            steam, center = steam_for(rows, bounds, placement); record["nativeSteamMouthCenter"] = center
            part_bounds["steam"] = [center[0] - 28, center[1] - 184, center[0] + 36, center[1] + 2]
        sources.append(source); provenance.append(record)
        print(json.dumps({"prepared": entry["name"], "placement": placement, **({"worldSphere": sphere} if entry["name"] == "globe" else {})}), flush=True)
    if args.inspect:
        print(json.dumps({"status": "inspection-only", "sources": provenance, "outputsChanged": False})); return
    grid = config.get("grid", 2); histogram, groups = Counter(), []
    for source in sources:
        cells = sample(source, grid, sphere); groups.append(cells)
        for name, color, alpha in cells.values():
            histogram[color] += alpha
        print(json.dumps({"sampled": source["name"], "gridCells": len(cells)}), flush=True)
    palette, lookup = quantize(histogram, config.get("paletteColors", 384))
    parts = {key: [] for key in KEYS}
    for cells in groups:
        result = trace(cells, grid, palette, lookup)
        for key in KEYS:
            parts[key].extend(result[key])
    cx, cy, radius = sphere["cx"], sphere["cy"], sphere["r"]
    parts["globeMap"].insert(0, {"fill": "#3897b8", "d": circle(cx, cy, radius)})
    parts["globeFrame"].insert(0, {"fill": "#17151b", "d": circle(cx, cy, radius + grid) + circle(cx, cy, radius, True)})
    parts["steam"], parts["deskContactShadows"] = steam, []
    export_bounds = {}
    for name, keys in ASSETS.items():
        boxes = [part_bounds[key] for key in keys]
        left, top = max(0, math.floor(min(b[0] for b in boxes) - 4)), max(0, math.floor(min(b[1] for b in boxes) - 4))
        right, bottom = min(SIZE, math.ceil(max(b[2] for b in boxes) + 4)), min(SIZE, math.ceil(max(b[3] for b in boxes) + 4))
        export_bounds[name] = f"{left} {top} {right-left} {bottom-top}"
    module = '/* Generated from new independent prop PNGs. No original scene paths. */\nexport interface CompleteCowPropPath { fill: string; d: string; opacity?: number }\nexport const COMPLETE_COW_PROP_VIEWBOX = \'0 0 1254 1254\';\n'
    module += "export const COMPLETE_COW_PROPS: Record<" + " | ".join(json.dumps(k) for k in KEYS) + ", readonly CompleteCowPropPath[]> = " + json.dumps(parts) + ";\n"
    module += "export const COMPLETE_COW_PROP_BOUNDS: Record<" + " | ".join(json.dumps(k) for k in ASSETS) + ", string> = " + json.dumps(export_bounds) + ";\n"
    module += "export const COMPLETE_COW_GLOBE_GEOMETRY = " + json.dumps(sphere) + " as const;\n"
    (OUTPUT / "complete-props.ts").write_text(module)
    ET.register_namespace("", NS[1:-1])
    for name, keys in ASSETS.items():
        svg = ET.Element(NS + "svg", {"viewBox": export_bounds[name], "shape-rendering": "crispEdges", "role": "img", "aria-labelledby": "title"})
        ET.SubElement(svg, NS + "title", {"id": "title"}).text = "Redrawn independent cow workspace · " + name
        for key in keys:
            group = ET.SubElement(svg, NS + "g", {"id": key})
            for path in parts[key]:
                ET.SubElement(group, NS + "path", {k: str(v) for k, v in path.items()})
        (OUTPUT / f"complete-{name}.svg").write_text(ET.tostring(svg, encoding="unicode") + "\n")
    metadata = {"sourceManifest": args.manifest.name, "coordinateSpace": [SIZE, SIZE], "grid": grid, "paletteColors": len(palette), "provenance": "Only newly illustrated independent prop-source PNGs; no old scene, masks, fragments, source SVGs or contact shadows are read.", "sources": provenance, "bounds": export_bounds, "globeGeometry": sphere, "pathCounts": {k: len(v) for k, v in parts.items()}, "deskContactShadows": "Empty", "nativeGeometry": "Complete opaque globe circle, circular dark rim, and new native coffee steam."}
    (OUTPUT / "complete-props.source-map.json").write_text(json.dumps(metadata, indent=2) + "\n")
    formatter = FRONTEND / "node_modules/.bin/prettier"
    if formatter.exists():
        subprocess.run([str(formatter), "--write", str(OUTPUT / "complete-props.ts"), str(OUTPUT / "complete-props.source-map.json"), str(args.manifest)], cwd=FRONTEND, check=True, capture_output=True, text=True)
    print(json.dumps({"status": "new-independent-props-complete", "bounds": export_bounds, "globeGeometry": sphere, "pathCounts": metadata["pathCounts"]}), flush=True)


if __name__ == "__main__":
    main()
