"""Trace independently drawn transparent rig images into native SVG paths.

Usage: python3 scripts/trace-cow-rig.py path/to/manifest.json

Each manifest entry names a complete part, a PNG source, and its placement in
the shared 1254-square scene. Optional ``crop`` is [left, top, right, bottom]
in normalized source coordinates. The selected source is trimmed to its
visible alpha>=8 bounds by default; ``trim: false`` retains canvas spacing.
The optional ``fragments`` array maps multiple crops from one PNG into a part.
Entries with the same ``sharedMaster`` name trace one common source only once,
then select its already mapped, palette-matched cells for each independent part.
Each selected drawing is traced independently. Native source overlays retain
visible garment and eye detail; optional exclusion masks remove neighboring
scene objects from those overlays. Exports contain no embedded raster images.
``nativeSvgSource`` imports a complete native pixel SVG without resampling.
``nativeEdits`` applies exact, source-checked rectangle replacements after a
PNG trace, so an independent feature can move out without masking its old copy.
"""

from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
import argparse
import json
import math
import re
import shutil
import struct
import zlib
import xml.etree.ElementTree as ET


FRONTEND = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = FRONTEND / "src/assets/cow-workspace"
RECTANGLE_COMMAND = re.compile(r"M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)H(-?[\d.]+)z")


def closed_rectangles(geometry):
    """Read the established pixel-path format, including world-coordinate floats."""
    matches = list(RECTANGLE_COMMAND.finditer(geometry))
    if not matches or "".join(match.group(0) for match in matches) != geometry:
        raise ValueError("Native pixel paths must contain only complete closed rectangle commands")
    for match in matches:
        x, y, width, height, last = map(float, match.groups())
        if not all(math.isfinite(value) for value in (x, y, width, height, last)) or x != last or width <= 0 or height <= 0:
            raise ValueError("Native rectangles must have finite coordinates and positive dimensions")
    return matches


def native_svg_source(source):
    """Import the whole transparent native drawing; no selection or transform."""
    root = ET.parse(source).getroot()
    paths = []
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in {"svg", "g", "title", "desc", "path"}:
            raise ValueError(f"Unsupported native SVG element {tag}: {source}")
        if any(key in node.attrib for key in ("transform", "style", "clip-path", "mask", "filter")):
            raise ValueError(f"Native SVG sources must contain their complete geometry directly: {source}")
        if tag != "path":
            if "opacity" in node.attrib or "fill" in node.attrib:
                raise ValueError(f"Put native fill and opacity on individual paths: {source}")
            continue
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", node.get("fill", "")):
            raise ValueError(f"Native SVG paths need a literal RGB fill: {source}")
        path = {"fill": node.attrib["fill"], "d": node.attrib["d"]}
        closed_rectangles(path["d"])
        if "opacity" in node.attrib:
            opacity = float(node.attrib["opacity"])
            if not math.isfinite(opacity) or not 0 < opacity <= 1:
                raise ValueError(f"Invalid native path opacity: {source}")
            path["opacity"] = opacity
        paths.append(path)
    if not paths:
        raise ValueError(f"Empty native SVG drawing: {source}")
    return paths, {
        "sourceSha256": sha256(source.read_bytes()).hexdigest(),
        "method": "whole-native-svg-source", "paths": len(paths),
        "rectangles": sum(len(closed_rectangles(path["d"])) for path in paths),
        "sampleColorRmse": 0, "sceneCoordinates": True,
    }


def apply_native_edits(paths, metadata, spec_path):
    """Replace explicitly named cells, retaining every other native command."""
    spec = json.loads(spec_path.read_text())
    if spec["sourceSha256"] != metadata["sourceSha256"]:
        raise ValueError(f"Native edit source changed: {spec_path}")
    digest = sha256(json.dumps(paths, separators=(",", ":")).encode()).hexdigest()
    if digest != spec["tracedPathsSha256"]:
        raise ValueError(f"Native edit trace geometry or palette changed: {spec_path}")
    edits = {}
    for edit in spec["replacements"]:
        if len(closed_rectangles(edit["d"])) != 1:
            raise ValueError("Each native edit must name one exact existing rectangle")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", edit["replacementFill"]):
            raise ValueError("Native replacement fill must be a literal RGB color")
        key = (edit["fill"], edit.get("opacity"), edit["d"])
        if key in edits:
            raise ValueError("Duplicate native rectangle edit")
        edits[key] = edit
    result, restored, matched = [], defaultdict(list), set()
    for path in paths:
        retained = []
        for rectangle in closed_rectangles(path["d"]):
            command = rectangle.group(0)
            key = (path["fill"], path.get("opacity"), command)
            if key in edits:
                matched.add(key)
                restored[(edits[key]["replacementFill"], path.get("opacity"))].append(command)
            else:
                retained.append(command)
        if retained:
            result.append({**path, "d": "".join(retained)})
    if matched != set(edits):
        raise ValueError(f"Missing exact native edit rectangles: {len(edits) - len(matched)}")
    for (fill, opacity), commands in restored.items():
        path = {"fill": fill, "d": "".join(commands)}
        if opacity is not None:
            path["opacity"] = opacity
        result.append(path)
    metadata["nativeEdits"] = {
        "source": str(spec_path), "sourceSha256": sha256(spec_path.read_bytes()).hexdigest(),
        "method": spec["method"], "replacedRectangles": len(matched),
        "preservedFootprints": True, "originalStrokeRetainedInHead": False,
    }
    metadata["paths"] = len(result)
    return result


def read_png(path):
    """Read noninterlaced 8-bit RGB/RGBA, gray, or indexed PNG using stdlib."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    offset, packed, palette, transparency = 8, [], None, b""
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        if len(payload) != length:
            raise ValueError(f"Truncated PNG: {path}")
        if kind == b"IHDR":
            width, height, depth, mode, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if depth != 8 or interlace or compression or filtering or mode not in {0, 2, 3, 4, 6}:
                raise ValueError(f"Expected noninterlaced 8-bit PNG, got depth={depth}, mode={mode}, interlace={interlace}: {path}")
        elif kind == b"PLTE":
            palette = [payload[i:i + 3] for i in range(0, len(payload), 3)]
        elif kind == b"tRNS":
            transparency = payload
        elif kind == b"IDAT":
            packed.append(payload)
        offset += length + 12
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[mode]
    stride = width * channels
    raw = zlib.decompress(b"".join(packed))
    if len(raw) != height * (stride + 1):
        raise ValueError(f"Invalid pixel data length: {path}")
    rows, previous = [], bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        method = raw[start]
        row = bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left = row[x - channels] if x >= channels else 0
            above = previous[x]
            diagonal = previous[x - channels] if x >= channels else 0
            if method == 0:
                predictor = 0
            elif method == 1:
                predictor = left
            elif method == 2:
                predictor = above
            elif method == 3:
                predictor = (left + above) // 2
            elif method == 4:
                p = left + above - diagonal
                distances = (abs(p - left), abs(p - above), abs(p - diagonal))
                predictor = (left, above, diagonal)[distances.index(min(distances))]
            else:
                raise ValueError(f"Unknown PNG filter {method}: {path}")
            row[x] = (row[x] + predictor) & 255
        previous = row
        if mode == 6:
            rows.append(row)
            continue
        rgba = bytearray(width * 4)
        for x in range(width):
            cell = row[x * channels:x * channels + channels]
            if mode == 2:
                rgb = cell
                transparent_rgb = struct.unpack(">HHH", transparency) if transparency else None
                alpha = 0 if tuple(rgb) == transparent_rgb else 255
            elif mode == 3:
                if palette is None or cell[0] >= len(palette):
                    raise ValueError(f"Invalid indexed PNG palette: {path}")
                rgb = palette[cell[0]]
                alpha = transparency[cell[0]] if cell[0] < len(transparency) else 255
            else:
                rgb = bytes([cell[0]]) * 3
                transparent_gray = struct.unpack(">H", transparency)[0] if transparency else None
                alpha = cell[1] if mode == 4 else (0 if cell[0] == transparent_gray else 255)
            rgba[x * 4:x * 4 + 4] = bytes(rgb) + bytes([alpha])
        rows.append(rgba)
    return width, height, rows


def number(value):
    """Compact deterministic coordinates, retaining subpixel placement."""
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


def inside_polygon(x, y, points):
    hit = False
    ax, ay = points[-1]
    for bx, by in points:
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
        ax, ay = bx, by
    return hit


def cells_to_paths(cells):
    grouped, active = defaultdict(list), {}
    by_row = defaultdict(list)
    for x, y in cells:
        by_row[y].append(x)
    ys = range(min(by_row), max(by_row) + 2, 2) if by_row else []
    for y in ys:
        xs = sorted(by_row[y])
        current, i = {}, 0
        while i < len(xs):
            x, end = xs[i], xs[i] + 2
            value = cells[(x, y)]
            i += 1
            while i < len(xs) and xs[i] == end and cells[(xs[i], y)] == value:
                end += 2
                i += 1
            key = (*value, x, end - x)
            old = active.pop(key, None)
            current[key] = (old[0], old[1] + 2) if old else (y, 2)
        for key, (top, height) in active.items():
            grouped[key[:2]].append(f"M{key[2]} {top}h{key[3]}v{height}H{key[2]}z")
        active = current
    for key, (top, height) in active.items():
        grouped[key[:2]].append(f"M{key[2]} {top}h{key[3]}v{height}H{key[2]}z")
    paths = []
    for (fill, opacity), geometry in grouped.items():
        path = {"fill": fill, "d": "".join(geometry)}
        if opacity is not None:
            path["opacity"] = float(opacity)
        paths.append(path)
    return paths


def vector_underlay(drawings):
    cells = {}
    for drawing in drawings:
        polygon = drawing["polygon"]
        xs, ys = zip(*polygon)
        for y in range(math.floor(min(ys) / 2) * 2, math.ceil(max(ys) / 2) * 2, 2):
            for x in range(math.floor(min(xs) / 2) * 2, math.ceil(max(xs) / 2) * 2, 2):
                if inside_polygon(x + 1, y + 1, polygon):
                    cells[(x, y)] = (drawing["fill"], None)
    return cells_to_paths(cells)


def original_pixels(config, base_dir):
    source = Path(config["source"])
    source = (source if source.is_absolute() else base_dir / source).resolve()
    width, height, rows = read_png(source)
    samples, histogram = {}, Counter()
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            values = [rows[yy][xx * 4:xx * 4 + 4] for yy in range(y, min(y + 2, height))
                      for xx in range(x, min(x + 2, width))]
            alpha_sum = sum(value[3] for value in values)
            if not alpha_sum:
                continue
            alpha = min(255, round(alpha_sum / len(values) / 17) * 17)
            if not alpha:
                continue
            rgb = tuple(round(sum(value[ch] * value[3] for value in values) / alpha_sum) for ch in range(3))
            key = tuple(min(255, (channel // 8) * 8 + 4) for channel in rgb)
            samples[(x, y)] = (key, alpha)
            histogram[key] += 1
    palette, lookup = color_palette(histogram, 512)
    cells = {}
    def within(rects, x, y):
        return any(left <= x < right and top <= y < bottom for left, top, right, bottom in rects)
    for (x, y), (key, alpha) in samples.items():
        cx, cy = x + 1, y + 1
        if not (cy < config.get("allAbove", 0) or inside_polygon(cx, cy, config["includePolygon"])):
            continue
        if within(config.get("excludeRects", []), cx, cy):
            continue
        cells[(x, y)] = ("#" + "".join(f"{ch:02x}" for ch in palette[lookup[key]]),
                          None if alpha == 255 else str(round(alpha / 255, 4)))
    return cells_to_paths(cells), {"source": str(source), "sourceSha256": sha256(source.read_bytes()).hexdigest(),
                                  "cells": len(cells), "configuration": config}


def native_overlay(config, base_dir):
    """Retain original visible native cells above a completed drawing.

    This preserves reference detail without making incomplete slices the
    actual rig surfaces: all excluded areas have the complete AI drawing below.
    Original observer-eye patches can also be exported in original coordinates.
    """
    source = Path(config["source"])
    source = (source if source.is_absolute() else base_dir / source).resolve()
    root = ET.parse(source).getroot()
    group = next((node for node in root.iter() if node.get("id") == config["group"]), None)
    if group is None:
        raise ValueError(f"Missing native group {config['group']} in {source}")
    exclusions = []
    for mask in config.get("excludeMasks", []):
        mask_source = Path(mask["source"])
        mask_source = mask_source if mask_source.is_absolute() else base_dir / mask_source
        mask_data = json.loads(mask_source.read_text())
        for region in mask_data["regions"]:
            if region["name"] in mask["names"]:
                exclusions.extend(region["polygons"])
    cells = {}
    pattern = re.compile(r"M(\d+) (\d+)h(\d+)v(\d+)H(\d+)z")
    def within(rects, x, y):
        return any(left <= x < right and top <= y < bottom for left, top, right, bottom in rects)
    for node in group.iter("{http://www.w3.org/2000/svg}path"):
        value = (node.attrib["fill"], node.get("opacity"))
        rgb = tuple(int(value[0][i:i + 2], 16) for i in (1, 3, 5))
        if max(rgb) > config.get("maximumRgbChannel", 255):
            continue
        geometry = node.attrib["d"]
        matches = list(pattern.finditer(geometry))
        if "".join(m.group(0) for m in matches) != geometry:
            raise ValueError(f"Original native overlay must use 2px closed rectangle paths: {source}")
        for match in matches:
            x, y, width, height, last = map(int, match.groups())
            if x != last or any(v % 2 for v in (x, y, width, height)):
                raise ValueError(f"Original native overlay is not on the expected 2px grid: {source}")
            for yy in range(y, y + height, 2):
                for xx in range(x, x + width, 2):
                    cx, cy = xx + 1, yy + 1
                    if "includeRects" in config and not within(config["includeRects"], cx, cy):
                        continue
                    if "includeRect" in config and not within([config["includeRect"]], cx, cy):
                        continue
                    if "includePolygon" in config and not inside_polygon(cx, cy, config["includePolygon"]):
                        continue
                    if within(config.get("excludeRects", []), cx, cy) or any(inside_polygon(cx, cy, p) for p in exclusions):
                        continue
                    cells[(xx, yy)] = value
    # Merge each row's equal-color cells, then merge identical runs vertically.
    grouped, active = defaultdict(list), {}
    ys = range(min(y for _, y in cells), max(y for _, y in cells) + 2, 2) if cells else []
    for y in ys:
        xs = sorted(x for x, yy in cells if yy == y)
        current, i = {}, 0
        while i < len(xs):
            x, end = xs[i], xs[i] + 2
            value = cells[(x, y)]
            i += 1
            while i < len(xs) and xs[i] == end and cells[(xs[i], y)] == value:
                end += 2
                i += 1
            key = (*value, x, end - x)
            old = active.pop(key, None)
            current[key] = (old[0], old[1] + 2) if old else (y, 2)
        for key, (top, height) in active.items():
            grouped[key[:2]].append(f"M{key[2]} {top}h{key[3]}v{height}H{key[2]}z")
        active = current
    for key, (top, height) in active.items():
        grouped[key[:2]].append(f"M{key[2]} {top}h{key[3]}v{height}H{key[2]}z")
    paths = []
    for (fill, opacity), geometry in grouped.items():
        path = {"fill": fill, "d": "".join(geometry)}
        if opacity is not None:
            path["opacity"] = float(opacity)
        paths.append(path)
    return paths, {"source": str(source), "sourceSha256": sha256(source.read_bytes()).hexdigest(),
                   "cells": len(cells), "group": config["group"], "configuration": config}


def color_palette(histogram, limit):
    boxes = [list(histogram)]
    while len(boxes) < limit:
        candidates = []
        for i, box in enumerate(boxes):
            if len(box) > 1:
                extent = max(max(c[ch] for c in box) - min(c[ch] for c in box) for ch in range(3))
                candidates.append((extent * sum(histogram[c] for c in box), i))
        if not candidates:
            break
        _, index = max(candidates)
        box = boxes.pop(index)
        channel = max(range(3), key=lambda ch: max(c[ch] for c in box) - min(c[ch] for c in box))
        box.sort(key=lambda c: c[channel])
        half = sum(histogram[c] for c in box) / 2
        cumulative, split = 0, 1
        for i, color in enumerate(box[:-1]):
            cumulative += histogram[color]
            split = i + 1
            if cumulative >= half:
                break
        boxes.extend([box[:split], box[split:]])
    palette = []
    for box in boxes:
        total = sum(histogram[c] for c in box)
        palette.append(tuple(round(sum(c[i] * histogram[c] for c in box) / total) for i in range(3)))
    lookup = {color: min(range(len(palette)), key=lambda k: sum(
        (color[i] - palette[k][i]) ** 2 * (2, 4, 3)[i] for i in range(3))) for color in histogram}
    return palette, lookup


def selected_bounds(entry, width, height, rows):
    crop = entry.get("crop", [0, 0, 1, 1])
    if len(crop) != 4 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in crop):
        raise ValueError(f"Invalid normalized crop for {entry['name']}")
    left, top, right, bottom = crop
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        raise ValueError(f"Crop must be normalized [left, top, right, bottom]: {entry['name']}")
    x0, y0 = math.floor(left * width), math.floor(top * height)
    x1, y1 = math.ceil(right * width), math.ceil(bottom * height)
    if entry.get("trim", True):
        # Image generation sometimes leaves alpha 1..7 speckles in distant
        # transparent canvas pixels. They must not determine placement scale.
        threshold = entry.get("trimAlphaThreshold", 8)
        if not isinstance(threshold, int) or not 1 <= threshold <= 255:
            raise ValueError(f"trimAlphaThreshold must be 1..255: {entry['name']}")
        visible = []
        for y in range(y0, y1):
            xs = [x for x in range(x0, x1) if rows[y][x * 4 + 3] >= threshold]
            if xs:
                visible.append((min(xs), y, max(xs) + 1, y + 1))
        if not visible:
            raise ValueError(f"Selected source is fully transparent: {entry['name']}")
        x0, y0 = min(v[0] for v in visible), min(v[1] for v in visible)
        x1, y1 = max(v[2] for v in visible), max(v[3] for v in visible)
    return x0, y0, x1, y1


def trace_shared_master_partition(entry, source, grid, limit, cache):
    """Partition one traced master without independently resizing its parts."""
    master_name = entry["sharedMaster"]
    if not isinstance(master_name, str) or not master_name.strip():
        raise ValueError(f"sharedMaster must be a nonempty group name: {entry['name']}")
    if entry.get("verticalMap") or entry.get("maximumRgbChannel", 255) != 255:
        raise ValueError("sharedMaster partitions require one unwarped, unfiltered master palette")
    defaults = {
        "crop": [0, 0, 1, 1], "trim": True, "trimAlphaThreshold": 8,
        "alphaCutoff": 0, "keepLargestComponent": False, "requireTransparency": True,
    }
    configuration = {key: entry.get(key, value) for key, value in defaults.items()}
    configuration["placement"] = entry["placement"]
    signature = json.dumps({"source": str(source.resolve()), "grid": grid,
                            "palette": limit, **configuration}, sort_keys=True)
    if master_name in cache and cache[master_name]["signature"] != signature:
        raise ValueError(f"All {master_name!r} partitions must share source, trim, placement, grid, and palette")
    reused = master_name in cache
    if not reused:
        source_entry = {"name": master_name, **configuration}
        master_paths, master_meta = trace_entry(source_entry, source, grid, limit)
        x0, y0, x1, y1 = master_meta["selectedPixels"]
        px, py, pw, ph = entry["placement"]
        columns, row_count = math.ceil((x1 - x0) / grid), math.ceil((y1 - y0) / grid)
        step_x, step_y = grid * pw / (x1 - x0), grid * ph / (y1 - y0)
        rows = [[None] * columns for _ in range(row_count)]
        pattern = re.compile(r"M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)H(-?[\d.]+)z")
        for path in master_paths:
            value = (path["fill"], path.get("opacity"))
            matches = list(pattern.finditer(path["d"]))
            if "".join(match.group(0) for match in matches) != path["d"]:
                raise ValueError("Master trace must contain closed, axis-aligned rectangles")
            for match in matches:
                x, y, width, height, _ = map(float, match.groups())
                left, top = round((x - px) / step_x), round((y - py) / step_y)
                right = columns if x + width >= px + pw - 0.0002 else round((x + width - px) / step_x)
                bottom = row_count if y + height >= py + ph - 0.0002 else round((y + height - py) / step_y)
                for yy in range(top, bottom):
                    rows[yy][left:right] = [value] * (right - left)
        cache[master_name] = {"signature": signature, "rows": rows, "meta": master_meta,
                              "step": (step_x, step_y), "shape": (columns, row_count)}
    master = cache[master_name]
    px, py, pw, ph = entry["placement"]
    step_x, step_y = master["step"]
    columns, row_count = master["shape"]
    def within(rects, x, y):
        return any(left <= x < right and top <= y < bottom for left, top, right, bottom in rects)
    samples, selected_cells = [], 0
    for yy, source_row in enumerate(master["rows"]):
        row = []
        cy = py + (yy * step_y + min((yy + 1) * step_y, ph)) / 2
        for xx, value in enumerate(source_row):
            cx = px + (xx * step_x + min((xx + 1) * step_x, pw)) / 2
            keep = value is not None
            if "includePolygon" in entry:
                keep = keep and inside_polygon(cx, cy, entry["includePolygon"])
            if "clipPolygon" in entry:
                keep = keep and inside_polygon(cx, cy, entry["clipPolygon"])
            if "includeRect" in entry:
                keep = keep and within([entry["includeRect"]], cx, cy)
            if "includeRects" in entry:
                keep = keep and within(entry["includeRects"], cx, cy)
            keep = keep and not within(entry.get("excludeRects", []), cx, cy)
            keep = keep and not any(inside_polygon(cx, cy, polygon)
                                    for polygon in entry.get("excludePolygons", []))
            row.append(value if keep else None)
            selected_cells += bool(keep)
        samples.append(row)
    if not selected_cells:
        raise ValueError(f"Empty master partition: {entry['name']}")
    grouped, active, rectangles = defaultdict(list), {}, 0
    for yy, row in enumerate(samples):
        current, xx = {}, 0
        while xx < columns:
            value, end = row[xx], xx + 1
            while end < columns and row[end] == value:
                end += 1
            if value is not None:
                key = (*value, xx, end)
                old = active.pop(key, None)
                current[key] = (old[0], yy + 1) if old else (yy, yy + 1)
            xx = end
        for key, span in active.items():
            grouped[key[:2]].append((key[2], key[3], *span))
            rectangles += 1
        active = current
    for key, span in active.items():
        grouped[key[:2]].append((key[2], key[3], *span))
        rectangles += 1
    paths = []
    for (fill, opacity), rects in grouped.items():
        commands = []
        for left, right, top, bottom in rects:
            x, y = px + left * step_x, py + top * step_y
            width = min(right * step_x, pw) - left * step_x
            height = min(bottom * step_y, ph) - top * step_y
            commands.append(f"M{number(x)} {number(y)}h{number(width)}v{number(height)}H{number(x)}z")
        path = {"fill": fill, "d": "".join(commands)}
        if opacity is not None:
            path["opacity"] = opacity
        paths.append(path)
    metadata = {**master["meta"], "paths": len(paths), "rectangles": rectangles,
                "sharedMaster": master_name, "sharedMasterReused": reused,
                "selectedMasterCells": selected_cells, "rmseScope": "wholeSharedMaster"}
    return paths, metadata


def trace_entry(entry, source, grid, limit, master_cache=None):
    if "sharedMaster" in entry:
        return trace_shared_master_partition(entry, source, grid, limit,
                                             master_cache if master_cache is not None else {})
    width, height, rows = read_png(source)
    cutoff = entry.get("alphaCutoff", 0)
    if cutoff:
        for row in rows:
            for x in range(width):
                if row[x * 4 + 3] < cutoff:
                    row[x * 4 + 3] = 0
    transparent_pixels = sum(row[x * 4 + 3] == 0 for row in rows for x in range(width))
    if entry.get("requireTransparency", True) and not transparent_pixels:
        raise ValueError(f"Part source has no transparent background: {entry['name']}. Export a transparent PNG before tracing.")
    x0, y0, x1, y1 = selected_bounds(entry, width, height, rows)
    if entry.get("keepLargestComponent"):
        # Remove separate alpha speckles from generated eye-patch canvases.
        # Connectivity is calculated inside this fragment's crop, so each eye
        # keeps its own drawing rather than competing with the other eye.
        visited, largest = bytearray(width * height), []
        for y in range(y0, y1):
            for x in range(x0, x1):
                index = y * width + x
                if visited[index] or not rows[y][x * 4 + 3]:
                    continue
                stack, component = [index], []
                visited[index] = 1
                while stack:
                    pixel = stack.pop()
                    component.append(pixel)
                    xx, yy = pixel % width, pixel // width
                    for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)):
                        if x0 <= nx < x1 and y0 <= ny < y1:
                            neighbor = ny * width + nx
                            if not visited[neighbor] and rows[ny][nx * 4 + 3]:
                                visited[neighbor] = 1
                                stack.append(neighbor)
                if len(component) > len(largest):
                    largest = component
        keep = set(largest)
        for y in range(y0, y1):
            for x in range(x0, x1):
                if y * width + x not in keep:
                    rows[y][x * 4 + 3] = 0
        x0, y0, x1, y1 = selected_bounds(entry, width, height, rows)
    placement = entry["placement"]
    if (len(placement) != 4 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in placement)
            or placement[2] <= 0 or placement[3] <= 0):
        raise ValueError(f"placement must be [x, y, positive width, positive height]: {entry['name']}")
    px, py, pw, ph = placement
    sx, sy = pw / (x1 - x0), ph / (y1 - y0)
    vertical_map = entry.get("verticalMap", [])
    def mapped_y(value):
        for (start, mapped_start), (end, mapped_end) in zip(vertical_map, vertical_map[1:]):
            if start <= value <= end:
                return mapped_start + (value - start) * (mapped_end - mapped_start) / (end - start)
        return value
    samples, histogram, source_values = [], Counter(), []
    for y in range(y0, y1, grid):
        row = []
        for x in range(x0, x1, grid):
            values = [rows[yy][xx * 4:xx * 4 + 4]
                      for yy in range(y, min(y + grid, y1)) for xx in range(x, min(x + grid, x1))]
            alpha_sum = sum(v[3] for v in values)
            alpha = round(alpha_sum / len(values))
            if not alpha:
                row.append(None)
                continue
            rgb = tuple(round(sum(v[ch] * v[3] for v in values) / alpha_sum) for ch in range(3))
            cx = px + (x - x0 + min(grid, x1 - x) / 2) * sx
            cy = mapped_y(py + (y - y0 + min(grid, y1 - y) / 2) * sy)
            if "includePolygon" in entry and not inside_polygon(cx, cy, entry["includePolygon"]):
                row.append(None)
                continue
            if "includeRect" in entry:
                left, top, right, bottom = entry["includeRect"]
                if not (left <= cx < right and top <= cy < bottom):
                    row.append(None)
                    continue
            if "includeRects" in entry and not any(left <= cx < right and top <= cy < bottom
                                                    for left, top, right, bottom in entry["includeRects"]):
                row.append(None)
                continue
            if "clipPolygon" in entry and not inside_polygon(cx, cy, entry["clipPolygon"]):
                row.append(None)
                continue
            for repair in entry.get("recolorRects", []):
                left, top, right, bottom = repair["rect"]
                if left <= cx < right and top <= cy < bottom:
                    fill = repair["fill"]
                    if not re.fullmatch(r"#[0-9a-fA-F]{6}", fill):
                        raise ValueError(f"recolorRects fill must be a six-digit hex color: {entry['name']}")
                    rgb = tuple(int(fill[i:i + 2], 16) for i in (1, 3, 5))
            if max(rgb) > entry.get("maximumRgbChannel", 255):
                replacement = entry.get("replaceExcludedRgb")
                if replacement is None:
                    row.append(None)
                    continue
                if not re.fullmatch(r"#[0-9a-fA-F]{6}", replacement):
                    raise ValueError(f"replaceExcludedRgb must be a six-digit hex color: {entry['name']}")
                rgb = tuple(int(replacement[i:i + 2], 16) for i in (1, 3, 5))
            color = tuple(min(255, (v // 8) * 8 + 4) for v in rgb)
            histogram[color] += 1
            row.append((color, alpha))
            source_values.append((color, rgb, alpha))
        samples.append(row)
    if not histogram:
        raise ValueError(f"Empty part after sampling: {entry['name']}")
    palette, lookup = color_palette(histogram, limit)
    grouped, active, rectangles = defaultdict(list), {}, 0
    for row_index, row in enumerate(samples):
        current, x = {}, 0
        while x < len(row):
            value, end = row[x], x + 1
            while end < len(row) and row[end] == value:
                end += 1
            if value is not None:
                color, alpha = value
                key = (lookup[color], alpha, x, end)
                old = active.pop(key, None)
                current[key] = (old[0], row_index + 1) if old else (row_index, row_index + 1)
            x = end
        for key, span in active.items():
            grouped[key[:2]].append((key[2], key[3], *span))
            rectangles += 1
        active = current
    for key, span in active.items():
        grouped[key[:2]].append((key[2], key[3], *span))
        rectangles += 1
    paths = []
    for (color, alpha), rects in grouped.items():
        commands = []
        for left, right, top, bottom in rects:
            rx = px + left * grid * sx
            ry = py + top * grid * sy
            rw = (min(right * grid, x1 - x0) - left * grid) * sx
            rh = (min(bottom * grid, y1 - y0) - top * grid) * sy
            vertical_segments = [ry] + [value[0] for value in vertical_map if ry < value[0] < ry + rh] + [ry + rh]
            for upper, lower in zip(vertical_segments, vertical_segments[1:]):
                mapped_top, mapped_bottom = mapped_y(upper), mapped_y(lower)
                commands.append(f"M{number(rx)} {number(mapped_top)}h{number(rw)}v{number(mapped_bottom - mapped_top)}H{number(rx)}z")
        path = {"fill": "#" + "".join(f"{ch:02x}" for ch in palette[color]), "d": "".join(commands)}
        if alpha != 255:
            path["opacity"] = round(alpha / 255, 6)
        paths.append(path)
    weight = sum(alpha for _, _, alpha in source_values)
    rmse = math.sqrt(sum(sum((rgb[ch] - palette[lookup[color]][ch]) ** 2 for ch in range(3)) * alpha
                         for color, rgb, alpha in source_values) / (3 * weight))
    meta = {
        "sourceSize": [width, height], "selectedPixels": [x0, y0, x1, y1],
        "transparentPixels": transparent_pixels,
        "placement": placement, "grid": grid, "paletteColors": len(palette),
        "paths": len(paths), "rectangles": rectangles, "sampleColorRmse": round(rmse, 4),
        "sourceSha256": sha256(source.read_bytes()).hexdigest(),
    }
    return paths, meta


def write_svg(path, name, paths, placement, digest):
    x, y, width, height = placement
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" viewBox="{number(x)} {number(y)} {number(width)} {number(height)}">',
             f"<title>{name}</title>",
             f"<desc>Independent completed drawing traced to native vector paths. Source SHA-256 {digest}.</desc>",
             f'<g data-rig-part="{name}">']
    for p in paths:
        opacity = f' opacity="{p["opacity"]}"' if "opacity" in p else ""
        lines.append(f'<path fill="{p["fill"]}"{opacity} d="{p["d"]}"/>')
    lines.extend(["</g>", "</svg>", ""])
    path.write_text("\n".join(lines))


def drawing_bounds(paths):
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    pattern = re.compile(r"M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)H(-?[\d.]+)z")
    for path in paths:
        for match in pattern.finditer(path["d"]):
            x, y, width, height, _ = map(float, match.groups())
            bounds = [min(bounds[0], x), min(bounds[1], y), max(bounds[2], x + width), max(bounds[3], y + height)]
    x, y, right, bottom = bounds
    return {"x": round(x, 4), "y": round(y, 4), "width": round(right - x, 4), "height": round(bottom - y, 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text())
    entries = manifest["entries"]
    if not entries:
        raise ValueError("Manifest must include at least one completed drawing")
    names = [entry["name"] for entry in entries]
    if len(set(names)) != len(names) or not all(re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", name) for name in names):
        raise ValueError("Entry names must be unique TypeScript identifiers")
    grid, limit = manifest.get("grid", 2), manifest.get("palette", 512)
    if not isinstance(grid, int) or grid < 1 or not isinstance(limit, int) or not 1 <= limit <= 1024:
        raise ValueError("grid must be positive integer; palette must be 1..1024")
    output = args.output.resolve()
    source_dir = output / "rig-source"
    source_dir.mkdir(parents=True, exist_ok=True)
    parts, bounds, provenance, master_cache = {}, {}, [], {}
    for entry in entries:
        if "nativeSvgSource" in entry:
            if "source" in entry:
                raise ValueError("Choose source PNG or nativeSvgSource, not both")
            source = Path(entry["nativeSvgSource"])
            source = (source if source.is_absolute() else manifest_path.parent / source).resolve()
            print(f"Importing {entry['name']} from whole native {source.name}", flush=True)
            paths, meta = native_svg_source(source)
            saved_reference = entry["nativeSvgSource"]
        elif "source" in entry:
            source = Path(entry["source"])
            source = source if source.is_absolute() else manifest_path.parent / source
            source = source.resolve()
            print(f"Tracing {entry['name']} from {source.name}", flush=True)
            if entry.get("skipTrace"):
                paths, meta = [], {"sourceSha256": sha256(source.read_bytes()).hexdigest(), "rectangles": 0,
                                  "sampleColorRmse": 0, "sourceArchivedOnly": True}
            elif "fragments" in entry:
                paths, fragment_metadata = [], []
                for fragment in entry["fragments"]:
                    fragment_paths, fragment_meta = trace_entry({**entry, **fragment}, source, grid, limit, master_cache)
                    paths.extend(fragment_paths)
                    fragment_metadata.append(fragment_meta)
                meta = {"sourceSha256": sha256(source.read_bytes()).hexdigest(),
                        "fragments": fragment_metadata,
                        "rectangles": sum(item["rectangles"] for item in fragment_metadata),
                        "sampleColorRmse": max(item["sampleColorRmse"] for item in fragment_metadata)}
            else:
                paths, meta = trace_entry(entry, source, grid, limit, master_cache)
            saved_source = source_dir / f"{entry['name']}.png"
            if saved_source.resolve() != source:
                shutil.copyfile(source, saved_source)
            saved_reference = f"rig-source/{entry['name']}.png"
        else:
            if "nativeOverlay" not in entry:
                raise ValueError(f"Entry needs source PNG or nativeOverlay: {entry['name']}")
            paths, meta = [], {"rectangles": 0, "sampleColorRmse": 0}
            saved_reference = entry["nativeOverlay"]["source"]
        if "sourceUnderlays" in entry:
            underlay_paths, underlay_metadata = [], []
            for index, configuration in enumerate(entry["sourceUnderlays"]):
                underlay_source = Path(configuration["source"])
                underlay_source = (underlay_source if underlay_source.is_absolute()
                                   else manifest_path.parent / underlay_source).resolve()
                underlay_entry = {"name": f"{entry['name']}Underlay{index}", **configuration}
                completed_paths, completed_meta = trace_entry(underlay_entry, underlay_source,
                                                               grid, limit, master_cache)
                underlay_paths.extend(completed_paths)
                underlay_metadata.append({**configuration, **completed_meta})
            paths = underlay_paths + paths
            meta["sourceUnderlays"] = underlay_metadata
        if "vectorUnderlay" in entry:
            paths = vector_underlay(entry["vectorUnderlay"]) + paths
        if "nativeOverlays" in entry:
            native_layers = []
            for config in entry["nativeOverlays"]:
                overlay, native_meta = native_overlay(config, manifest_path.parent)
                paths.extend(overlay)
                native_layers.append(native_meta)
            meta["nativeOverlays"] = native_layers
        if "nativeOverlay" in entry:
            overlay, native_meta = native_overlay(entry["nativeOverlay"], manifest_path.parent)
            paths.extend(overlay)
            meta["nativeOverlay"] = native_meta
            meta.setdefault("sourceSha256", native_meta["sourceSha256"])
            print(f"  Preserved {native_meta['cells']} original native cells", flush=True)
        if "nativeOriginal" in entry:
            overlay, native_meta = original_pixels(entry["nativeOriginal"], manifest_path.parent)
            paths.extend(overlay)
            meta["nativeOriginal"] = native_meta
            print(f"  Preserved {native_meta['cells']} full original PNG cells", flush=True)
        if "nativeEdits" in entry:
            spec_path = Path(entry["nativeEdits"])
            spec_path = (spec_path if spec_path.is_absolute() else manifest_path.parent / spec_path).resolve()
            paths = apply_native_edits(paths, meta, spec_path)
        parts[entry["name"]] = paths
        bounds[entry["name"]] = drawing_bounds(paths)
        meta["drawingBounds"] = bounds[entry["name"]]
        write_svg(output / f"rig-{entry['name']}.svg", entry["name"], paths,
                  [bounds[entry["name"]][key] for key in ("x", "y", "width", "height")], meta["sourceSha256"])
        provenance.append({**entry, **meta, "source": saved_reference})
        print(f"  {meta['rectangles']} closed rectangles; sample RGB RMSE {meta['sampleColorRmse']}", flush=True)
    left = min(value["x"] for value in bounds.values())
    top = min(value["y"] for value in bounds.values())
    right = max(value["x"] + value["width"] for value in bounds.values())
    bottom = max(value["y"] + value["height"] for value in bounds.values())
    bounds["cow"] = {"x": left, "y": top, "width": right - left, "height": bottom - top}
    name_type = " | ".join(json.dumps(name) for name in names)
    ts = (
        "/** Generated from complete independent part drawings; do not edit path data by hand. */\n"
        "export interface CowRigPath { fill: string; d: string; opacity?: number; transform?: string; }\n"
        f"export type CowRigPartName = {name_type};\n"
    )
    for name, paths in parts.items():
        ts += f"const {name}Paths: readonly CowRigPath[] = " + json.dumps(paths, separators=(",", ":")) + ";\n"
    ts += (
        "export const COW_RIG_PARTS: Record<CowRigPartName, readonly CowRigPath[]> = {"
        + ",".join(f"{name}: {name}Paths" for name in names) + "};\n"
        "export const COW_RIG_BOUNDS: Record<CowRigPartName | 'cow', { x: number; y: number; width: number; height: number }> = "
        + json.dumps(bounds, separators=(",", ":")) + ";\n"
    )
    (output / "rig.ts").write_text(ts)
    neutral_names = ["cowBodyComplete"] + (["cowArmRightResting"] if "cowArmRightResting" in parts else []) + [
        "cowHeadComplete", "cowEyesThinking" if "cowEyesThinking" in parts else "cowEyesObserver"] + (["cowMouthNeutral"] if "cowMouthNeutral" in parts else []) + ["cowArmLeftThinking"]
    if all(name in parts for name in neutral_names):
        combined = [path for name in neutral_names for path in parts[name]]
        cow_bounds = bounds["cow"]
        write_svg(output / "rig-cow.svg", "cow", combined,
                  [cow_bounds[key] for key in ("x", "y", "width", "height")],
                  sha256(json.dumps(provenance, sort_keys=True).encode()).hexdigest())
    (output / "rig-provenance.json").write_text(json.dumps({
        "sceneSize": manifest.get("sceneSize", [1254, 1254]),
        "method": "Independent transparent drawings, alpha-weighted sampling, per-part palette and merged closed rectangles.",
        "promptsSource": manifest.get("promptsSource"),
        "prompt": manifest.get("prompt"), "entries": provenance,
    }, indent=2) + "\n")
    print(f"Wrote {len(entries)} independent SVG parts and rig.ts", flush=True)


if __name__ == "__main__":
    main()
