"""Trace the actual desk reference into eight SVG assets, using Python stdlib.

Source PNG is read only. Its pixels retain the original coordinates in every part.
"""
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
import json
import math
import struct
import zlib
import xml.etree.ElementTree as ET

FRONTEND = Path(__file__).resolve().parents[1]
SOURCE = FRONTEND.parent / "backend/SYSTEM/static/icon/logo.png"
OUTPUT = FRONTEND / "src/assets/cow-workspace"
GRID, COLORS = 2, 512
NS = "{http://www.w3.org/2000/svg}"
NAMES = ["cowTorso", "cowHead", "cowEyes", "cowBrows", "cowPupils",
         "cowThinkingArm", "cowTypingHands", "laptop", "mug", "steam",
         "plantPot", "plantLeaves", "books", "globeFrame", "globeMap",
         "openBook", "openBookDetails", "desk", "deskContactShadows"]
ASSETS = {"cow": ["cowTorso", "cowHead", "cowThinkingArm"], "laptop": ["laptop"],
          "coffee": ["mug", "steam"], "plant": ["plantLeaves", "plantPot"],
          "books": ["books"], "globe": ["globeMap", "globeFrame"],
          "openBook": ["openBook"], "desk": ["desk"]}
BOOK_SURFACES = [
    ([(21, 819), (155, 793), (394, 817), (401, 879), (301, 897), (25, 880)], "#29425b"),
    ([(25, 881), (300, 897), (406, 879), (406, 936), (301, 962), (18, 944)], "#243f33"),
    ([(21, 946), (296, 966), (405, 946), (404, 989), (296, 1016), (26, 999)], "#664232"),
    ([(14, 995), (295, 1019), (397, 993), (401, 1049), (297, 1076), (12, 1049)], "#324e6a"),
    ([(18, 1055), (296, 1078), (399, 1059), (399, 1105), (294, 1139), (14, 1104)], "#2c2d35"),
]
# Contact shadows retain original pixels in the complete scene. Independent
# exports omit them, so a laptop or mug does not carry a cast-shadow fragment.
PROP_EDGES = [
    ("laptop", (444, 1000, 466, 1040)), ("laptop", (504, 1064, 522, 1078)),
    ("laptop", (846, 1024, 872, 1096)), ("mug", (872, 1024, 888, 1096)),
    ("mug", (1020, 1076, 1066, 1120)), ("mug", (994, 1120, 1018, 1126)),
    ("mug", (952, 1122, 980, 1140)), ("plantPot", (1080, 1072, 1088, 1126)),
    ("plantPot", (1102, 1136, 1190, 1142)), ("globeFrame", (312, 1130, 356, 1158)),
    ("globeFrame", (394, 1132, 418, 1148)), ("books", (296, 1110, 315, 1134)),
    ("globeFrame", (315, 1110, 322, 1134)), ("openBook", (384, 1170, 478, 1210)),
    ("openBook", (512, 1214, 556, 1220)), ("openBook", (558, 1220, 608, 1228)),
    ("openBook", (610, 1228, 652, 1244)), ("openBook", (970, 1182, 986, 1206)),
]


def read_png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    offset, packed = 8, []
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            width, height, depth, mode, _, _, interlace = struct.unpack(">IIBBBBB", payload)
            assert (depth, mode, interlace) == (8, 6, 0), "Expected 8-bit RGBA PNG"
        elif kind == b"IDAT":
            packed.append(payload)
        offset += length + 12
    raw = zlib.decompress(b"".join(packed))
    stride, rows, previous = width * 4, [], bytearray(width * 4)
    for y in range(height):
        start = y * (stride + 1)
        method, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
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
                ds = (abs(p - left), abs(p - above), abs(p - diagonal))
                predictor = (left, above, diagonal)[ds.index(min(ds))]
            else:
                assert method == 0
                predictor = 0
            row[x] = (row[x] + predictor) & 255
        rows.append(row)
        previous = row
    return width, height, rows


def write_png(path, width, height, rows):
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) +
                    chunk(b"IDAT", zlib.compress(b"".join(b"\x00" + row for row in rows), 9)) + chunk(b"IEND", b""))


def inside(x, y, points):
    hit = False
    ax, ay = points[-1]
    for bx, by in points:
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
        ax, ay = bx, by
    return hit


def palette_for(histogram):
    boxes = [list(histogram)]
    while len(boxes) < COLORS:
        def score(box):
            extent = max(max(c[i] for c in box) - min(c[i] for c in box) for i in range(3))
            return extent * sum(histogram[c] for c in box)
        candidates = [(score(box), i) for i, box in enumerate(boxes) if len(box) > 1]
        if not candidates:
            break
        _, index = max(candidates)
        box = boxes.pop(index)
        channel = max(range(3), key=lambda i: max(c[i] for c in box) - min(c[i] for c in box))
        box.sort(key=lambda c: c[channel])
        halfway, cumulative, split = sum(histogram[c] for c in box) / 2, 0, 1
        for i, color in enumerate(box[:-1]):
            cumulative += histogram[color]
            split = i + 1
            if cumulative >= halfway:
                break
        boxes.extend([box[:split], box[split:]])
    palette = []
    for box in boxes:
        total = sum(histogram[c] for c in box)
        palette.append(tuple(round(sum(c[i] * histogram[c] for c in box) / total) for i in range(3)))
    lookup = {color: min(range(len(palette)), key=lambda k: sum(
        (color[i] - palette[k][i]) ** 2 * (2, 4, 3)[i] for i in range(3))) for color in histogram}
    return palette, lookup


def vector_paths(rows, palette):
    grouped, active = defaultdict(list), {}
    for y, row in enumerate(rows):
        current, x = {}, 0
        while x < len(row):
            value, end = row[x], x + 1
            while end < len(row) and row[end] == value:
                end += 1
            if value is not None:
                key = (*value, x, end - x)
                old = active.pop(key, None)
                current[key] = (old[0], old[1] + GRID) if old else (y * GRID, GRID)
            x = end
        for (part, color, alpha, x, width), (top, height) in active.items():
            grouped[(part, color, alpha)].append(f"M{x * GRID} {top}h{width * GRID}v{height}H{x * GRID}z")
        active = current
    for (part, color, alpha, x, width), (top, height) in active.items():
        grouped[(part, color, alpha)].append(f"M{x * GRID} {top}h{width * GRID}v{height}H{x * GRID}z")
    result = {name: [] for name in NAMES}
    for (part, color, alpha), geometry in grouped.items():
        path = {"fill": "#" + "".join(f"{c:02x}" for c in palette[color]), "d": "".join(geometry)}
        if alpha != 255:
            path["opacity"] = round(alpha / 255, 4)
        result[part].append(path)
    return result


def main():
    width, height, pixels = read_png(SOURCE)
    config = json.loads((OUTPUT / "reference-masks.json").read_text())
    assert config["sourceSize"] == [width, height]
    regions, polygons_by_name = [], defaultdict(list)
    for region in config["regions"]:
        for poly in region["polygons"]:
            xs, ys = zip(*poly)
            regions.append((region["name"], (min(xs), min(ys), max(xs), max(ys)), poly))
            polygons_by_name[region["name"]].append(poly)
    samples, histogram, bounds = [], Counter(), {}
    for y in range(0, height, GRID):
        row = []
        for x in range(0, width, GRID):
            colors = [pixels[yy][xx * 4:xx * 4 + 4] for yy in range(y, min(y + GRID, height))
                      for xx in range(x, min(x + GRID, width))]
            alpha_sum = sum(c[3] for c in colors)
            if not alpha_sum:
                row.append(None)
                continue
            rgb = tuple(round(sum(c[i] * c[3] for c in colors) / alpha_sum) for i in range(3))
            alpha = min(255, round(alpha_sum / len(colors) / 17) * 17)
            if not alpha:
                row.append(None)
                continue
            color = tuple(min(255, (c // 8) * 8 + 4) for c in rgb)
            cx, cy = x + GRID / 2, y + GRID / 2
            # Small outline pixels outside a manually drawn mask stay with their
            # own object rather than leaking into the exported cow silhouette.
            if cy < 720:
                owner = "cowHead"
            elif cx < 416 and 774 <= cy < 1140:
                owner = "books"
            elif cx > 1080 and 876 <= cy < 1142:
                owner = "plantLeaves" if cy < 1012 else "plantPot"
            elif cy >= 1000:
                owner = "desk"
            else:
                owner = "cowTorso"
            for name, (left, top, right, bottom), poly in reversed(regions):
                if name == "openBookDetails":
                    continue
                if left <= cx <= right and top <= cy <= bottom and inside(cx, cy, poly):
                    owner = name
                    break
            # Include the antialiased warm edge of the steam, so it does not
            # remain on the hoodie when the light core moves.
            if 934 <= cx <= 1005 and 714 <= cy <= 914 and rgb[0] > rgb[2] + 7 and rgb[1] > 45:
                owner = "steam"
            # The table's dark outside border is part of the desk too. Color
            # alone cannot distinguish it from a hoodie or a ceramic outline.
            if owner == "books" and cy > 1100 and not any(
                    inside(cx, cy, p) for p in polygons_by_name["books"]):
                owner = "desk"
            if owner == "plantPot" and cx > 1224:
                owner = "desk"
            if owner == "mug" and cx > 1058 and 975 < cy < 1056 and rgb[0] > rgb[1] * 1.15 and rgb[0] > rgb[2] * 1.3:
                owner = "desk" if cy >= 1034 else "cowTorso"
            if owner == "desk" and max(rgb) <= 85:
                for name, (left, top, right, bottom) in PROP_EDGES:
                    if left <= cx < right and top <= cy < bottom:
                        owner = "deskContactShadows"
                        break
            histogram[color] += 1
            row.append((owner, color, alpha, rgb))
            old = bounds.setdefault(owner, [x, y, x + GRID, y + GRID])
            old[0], old[1], old[2], old[3] = min(old[0], x), min(old[1], y), max(old[2], x + GRID), max(old[3], y + GRID)
        samples.append(row)
    print("Decoded correct reference; quantizing colors", flush=True)
    palette, lookup = palette_for(histogram)
    traced = [[None if cell is None else (cell[0], lookup[cell[1]], cell[2]) for cell in row] for row in samples]
    parts = vector_paths(traced, palette)
    backfill = {name: [[None] * len(row) for row in samples]
                for name in ["desk", "cowTorso", "cowHead", "laptop", "books", "globeFrame", "plantPot"]}
    background_palette, background_lookup = [], {}
    for y, row in enumerate(samples):
        for x, cell in enumerate(row):
            if cell is None:
                continue
            owner, _, alpha, _ = cell
            if alpha != 255:
                continue
            cx, cy, candidates = x * GRID + 1, y * GRID + 1, []
            if owner != "desk" and any(inside(cx, cy, p) for p in polygons_by_name["desk"]):
                candidates.append(("desk", "#b27a52"))
            if owner not in {"cowTorso", "cowHead"} and any(inside(cx, cy, p) for p in polygons_by_name["cowTorso"]):
                candidates.append(("cowTorso", "#20212b"))
            if owner == "cowThinkingArm" and cy < 706:
                skin = pixels[int(cy)][650 * 4:650 * 4 + 3]
                candidates.append(("cowHead", "#" + "".join(f"{c:02x}" for c in skin)))
            if owner == "openBook" and any(inside(cx, cy, p) for p in polygons_by_name["laptop"]):
                candidates.append(("laptop", "#44434f"))
            if owner in {"globeFrame", "globeMap"}:
                for surface, fill in reversed(BOOK_SURFACES):
                    if inside(cx, cy, surface):
                        candidates.append(("books", "#e7d3b5" if cx >= 304 else fill))
                        break
            if owner == "openBook" and any(inside(cx, cy, p) for p in polygons_by_name["globeFrame"]):
                candidates.append(("globeFrame", "#64432e"))
            if owner == "mug" and any(inside(cx, cy, p) for p in polygons_by_name["plantPot"]):
                candidates.append(("plantPot", "#eee9e0"))
            for name, fill in candidates:
                if fill not in background_lookup:
                    background_lookup[fill] = len(background_palette)
                    background_palette.append(tuple(int(fill[i:i + 2], 16) for i in (1, 3, 5)))
                backfill[name][y][x] = (name, background_lookup[fill], alpha)
                old = bounds.setdefault(name, [x * GRID, y * GRID, (x + 1) * GRID, (y + 1) * GRID])
                old[0], old[1], old[2], old[3] = (min(old[0], x * GRID), min(old[1], y * GRID),
                                                max(old[2], (x + 1) * GRID), max(old[3], (y + 1) * GRID))
    for name, rows in backfill.items():
        parts[name] = vector_paths(rows, background_palette)[name] + parts[name]
    parts["cowTypingHands"] = [
        {"fill": "#302a28", "d": "M846 948h18v8h10v30h-9v10h-19v-11h-7v-26h7z"},
        {"fill": "#51463b", "d": "M850 954h11v8h7v20h-8v7h-11v-10h-5v-17h6z"},
    ]
    asset_bounds = {}
    for asset, names in ASSETS.items():
        boxes = [bounds[name] for name in names if name in bounds]
        left, top = max(0, min(b[0] for b in boxes) - 4), max(0, min(b[1] for b in boxes) - 4)
        right, bottom = min(width, max(b[2] for b in boxes) + 4), min(height, max(b[3] for b in boxes) + 4)
        asset_bounds[asset] = f"{left} {top} {right - left} {bottom - top}"
    module = ('/* Generated from backend/SYSTEM/static/icon/logo.png; original coordinates. */\n'
              'export interface CowWorkspacePath { fill: string; d: string; opacity?: number; transform?: string }\n'
              f'export const COW_WORKSPACE_VIEWBOX = "0 0 {width} {height}";\n')
    module += "export const COW_WORKSPACE_PARTS: Record<" + " | ".join(json.dumps(n) for n in NAMES) + ", readonly CowWorkspacePath[]> = " + json.dumps(parts) + ";\n"
    module += "export const COW_WORKSPACE_BOUNDS: Record<" + " | ".join(json.dumps(n) for n in ASSETS) + ", string> = " + json.dumps(asset_bounds) + ";\n"
    (OUTPUT / "parts.ts").write_text(module)
    ET.register_namespace("", NS[1:-1])
    for asset, names in ASSETS.items():
        svg = ET.Element(NS + "svg", {"viewBox": asset_bounds[asset], "shape-rendering": "crispEdges", "role": "img", "aria-labelledby": "title"})
        ET.SubElement(svg, NS + "title", {"id": "title"}).text = "Cow workspace · " + asset
        for name in names:
            group = ET.SubElement(svg, NS + "g", {"id": name})
            for path in parts[name]:
                ET.SubElement(group, NS + "path", {k: str(v) for k, v in path.items()})
        (OUTPUT / f"{asset}.svg").write_text(ET.tostring(svg, encoding="unicode") + "\n")
    scene = ET.Element(NS + "svg", {"viewBox": f"0 0 {width} {height}", "shape-rendering": "crispEdges", "role": "img", "aria-labelledby": "title"})
    ET.SubElement(scene, NS + "title", {"id": "title"}).text = "Cow workspace"
    for asset in ("desk", "cow", "plant", "books", "laptop", "globe", "coffee", "openBook"):
        names = ASSETS[asset] + (["deskContactShadows"] if asset == "desk" else [])
        for name in names:
            group = ET.SubElement(scene, NS + "g", {"id": name})
            for path in parts[name]:
                ET.SubElement(group, NS + "path", {k: str(v) for k, v in path.items()})
    (OUTPUT / "workspace.svg").write_text(ET.tostring(scene, encoding="unicode") + "\n")
    preview_rows, error, count = [bytearray(width * 4) for _ in range(height)], 0, 0
    for y, row in enumerate(samples):
        for x, cell in enumerate(row):
            if cell is None:
                continue
            _, key, alpha, rgb = cell
            color = palette[lookup[key]]
            error += sum((rgb[i] - color[i]) ** 2 for i in range(3))
            count += 3
            for yy in range(y * GRID, min(y * GRID + GRID, height)):
                for xx in range(x * GRID, min(x * GRID + GRID, width)):
                    preview_rows[yy][xx * 4:xx * 4 + 4] = bytes((*color, alpha))
    write_png(Path('/private/tmp/cow-vector-reconstruction.png'), width, height, preview_rows)
    metadata = {"source": "../../../../backend/SYSTEM/static/icon/logo.png", "sourceSha256": sha256(SOURCE.read_bytes()).hexdigest(),
                "sourceSize": [width, height], "grid": GRID, "paletteColors": len(palette),
                "colorRMSE": round(math.sqrt(error / count), 3), "bounds": asset_bounds,
                "pathCounts": {name: len(paths) for name, paths in parts.items()},
                "notes": ["Original coordinates are retained. No affine transforms or face replacement.",
                          "Occluded surfaces have simple backfills covered by the original foreground pixels in the neutral pose.",
                          "Contact shadows belong to the full scene only; independent props and desk omit cast-shadow fragments.",
                          "A 2-pixel grid and shared 512-color palette are used. Exported art contains SVG paths only."]}
    (OUTPUT / "source-map.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({"svgAssets": len(ASSETS), "rmse": metadata["colorRMSE"], "bytes": (OUTPUT / "parts.ts").stat().st_size, "paths": sum(len(p) for p in parts.values())}), flush=True)


if __name__ == "__main__":
    main()
