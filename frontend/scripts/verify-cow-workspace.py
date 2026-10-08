"""Check original fidelity and exact restoration of the standalone SVG assets.

This checks actual XML path geometry, not the generator's intermediate samples.
Standalone exports deliberately omit contact shadows. Restore only that group
from workspace.svg and require the resulting composition to match the full SVG.
Only the stdlib is used. Run from any directory with Python 3.
"""

from array import array
import importlib.util
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET


FRONTEND = Path(__file__).resolve().parents[1]
ASSETS = FRONTEND / "src/assets/cow-workspace"
ORDER = ("desk", "cow", "plant", "books", "laptop", "globe", "coffee", "openBook")
GRID = 2
MAX_RMSE = 5.0
OUTPUT = Path("/private/tmp/cow-svg-reassembled.png")
ASSET_OUTPUT = Path("/private/tmp/cow-svg-assets-reassembled.png")
RESTORED_OUTPUT = Path("/private/tmp/cow-svg-restored-reassembled.png")
COMPOSITE_TOLERANCE = 0.00001
RECTANGLE = re.compile(r"M(\d+) (\d+)h(\d+)v(\d+)H(\d+)z")
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}\Z")


def generator_helpers():
    spec = importlib.util.spec_from_file_location(
        "cow_workspace_generator", FRONTEND / "scripts/split-cow-workspace.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.read_png, module.write_png, module.SOURCE


def opacity(element, attribute):
    value = float(element.get(attribute, "1"))
    assert math.isfinite(value) and 0 <= value <= 1, f"Invalid {attribute}: {value}"
    return value


def draw_svg(path, canvas, width, height, counts, group_id=None):
    root = ET.parse(path).getroot()
    allowed = {"svg", "title", "desc", "g", "path"}
    viewbox = tuple(float(value) for value in root.get("viewBox", "").split())
    assert len(viewbox) == 4, f"Missing viewBox: {path.name}"
    vx, vy, vw, vh = viewbox
    assert 0 <= vx < vx + vw <= width and 0 <= vy < vy + vh <= height
    columns = width // GRID

    def visit(element, inherited_opacity=1.0):
        tag = element.tag.rsplit("}", 1)[-1]
        assert tag in allowed, f"Unsupported/nonvector SVG element {tag}: {path.name}"
        assert "transform" not in element.attrib, f"Unexpected transform: {path.name}"
        for key, value in element.attrib.items():
            assert key.rsplit("}", 1)[-1] != "href", f"External/raster reference: {path.name}"
            assert "data:" not in value and "url(" not in value, f"External reference: {path.name}"
        effective_opacity = inherited_opacity * opacity(element, "opacity")
        if tag == "path":
            fill = element.get("fill", "")
            assert HEX_COLOR.fullmatch(fill), f"Unsupported fill {fill}: {path.name}"
            alpha = effective_opacity * opacity(element, "fill-opacity")
            rgb = tuple(int(fill[start:start + 2], 16) for start in (1, 3, 5))
            source = tuple(channel * alpha for channel in rgb) + (255 * alpha,)
            remaining = 1 - alpha
            geometry = element.get("d", "")
            assert geometry and not RECTANGLE.sub("", geometry).strip(), (
                f"Nonrectangular or malformed path geometry: {path.name}"
            )
            counts["paths"] += 1
            for match in RECTANGLE.finditer(geometry):
                x, y, rect_width, rect_height, closing_x = map(int, match.groups())
                assert closing_x == x and rect_width > 0 and rect_height > 0
                assert 0 <= x < x + rect_width <= width and 0 <= y < y + rect_height <= height, (
                    f"Rectangle out of source bounds: {path.name}, {match.group()}"
                )
                assert all(value % GRID == 0 for value in (x, y, rect_width, rect_height)), (
                    f"Rectangle is not aligned to the {GRID}px grid: {path.name}"
                )
                assert vx <= x and vy <= y and x + rect_width <= vx + vw and y + rect_height <= vy + vh, (
                    f"Geometry is clipped by its asset viewBox: {path.name}, {match.group()}"
                )
                counts["rectangles"] += 1
                for row in range(y // GRID, (y + rect_height) // GRID):
                    start = (row * columns + x // GRID) * 4
                    end = (row * columns + (x + rect_width) // GRID) * 4
                    for index in range(start, end, 4):
                        for channel in range(4):
                            canvas[index + channel] = source[channel] + canvas[index + channel] * remaining
        for child in element:
            visit(child, effective_opacity)

    if group_id is None:
        visit(root)
    else:
        groups = [element for element in root
                  if element.tag.rsplit("}", 1)[-1] == "g" and element.get("id") == group_id]
        assert len(groups) == 1, f"Expected exactly one {group_id} group: {path.name}"
        visit(groups[0], opacity(root, "opacity"))


def compare_pixels(canvas, pixels, width, height, write_png, output):
    columns, rows = width // GRID, height // GRID
    error = visible_error = maximum_error = 0.0
    visible_cells = severe_cells = 0
    output_rows = [bytearray(width * 4) for _ in range(height)]
    for row in range(rows):
        for column in range(columns):
            index = (row * columns + column) * 4
            actual = canvas[index:index + 4]
            block = [pixels[y][x * 4:x * 4 + 4]
                     for y in range(row * GRID, row * GRID + GRID)
                     for x in range(column * GRID, column * GRID + GRID)]
            reference = [sum(pixel[channel] * pixel[3] / 255 for pixel in block) / 4
                         for channel in range(3)]
            reference.append(sum(pixel[3] for pixel in block) / 4)
            differences = [actual[channel] - reference[channel] for channel in range(4)]
            squared = sum(value * value for value in differences)
            error += squared
            cell_maximum = max(abs(value) for value in differences)
            maximum_error = max(maximum_error, cell_maximum)
            severe_cells += cell_maximum > 20
            if reference[3] > 0 or actual[3] > 0:
                visible_cells += 1
                visible_error += squared
            alpha = actual[3]
            rgba = bytes(tuple(max(0, min(255, round(actual[channel] * 255 / alpha)))
                               if alpha > 0 else 0 for channel in range(3)) +
                         (max(0, min(255, round(alpha))),))
            for y in range(row * GRID, row * GRID + GRID):
                for x in range(column * GRID, column * GRID + GRID):
                    output_rows[y][x * 4:x * 4 + 4] = rgba
    write_png(output, width, height, output_rows)
    rmse = math.sqrt(error / (columns * rows * 4))
    return {"premultipliedRGBA_RMSE": round(rmse, 4),
            "visibleRGBA_RMSE": round(math.sqrt(visible_error / (visible_cells * 4)), 4),
            "maxChannelError": round(maximum_error, 3), "cellsWithErrorOver20": severe_cells,
            "output": str(output), "passed": rmse <= MAX_RMSE}, rmse


def main():
    read_png, write_png, source = generator_helpers()
    width, height, pixels = read_png(source)
    assert (width, height) == (1254, 1254), "Unexpected reference dimensions"
    assert width % GRID == 0 and height % GRID == 0
    cohorts = {
        "fullScene": ([ASSETS / "workspace.svg"], OUTPUT),
        "independentAssets": ([ASSETS / f"{name}.svg" for name in ORDER], ASSET_OUTPUT),
        "restoredAssets": ([ASSETS / f"{name}.svg" for name in ORDER], RESTORED_OUTPUT),
    }
    stamps = {path: path.stat().st_mtime_ns
              for files, _ in cohorts.values() for path in files}
    results, errors, fidelity_canvases = {}, {}, {}
    cells = (width // GRID) * (height // GRID)
    for label, (files, output) in cohorts.items():
        canvas = array("f", [0.0]) * (cells * 4)
        counts = {"assets": len(files), "paths": 0, "rectangles": 0}
        for path in files:
            draw_svg(path, canvas, width, height, counts)
            if label == "restoredAssets" and path.stem == "desk":
                # Read only the actual contact-shadow group, in its scene order.
                # No other workspace pixels can hide export differences.
                draw_svg(ASSETS / "workspace.svg", canvas, width, height, counts,
                         group_id="deskContactShadows")
                counts["shadowGroups"] = 1
        metrics, rmse = compare_pixels(canvas, pixels, width, height, write_png, output)
        if label == "independentAssets":
            metrics["withinOriginalRMSELimit"] = metrics.pop("passed")
            metrics["informational"] = True
            metrics["note"] = "Standalone assets intentionally omit the contact shadows."
        else:
            fidelity_canvases[label] = canvas
        results[label], errors[label] = {**counts, **metrics}, rmse
    assert all(path.stat().st_mtime_ns == stamps[path] for path in stamps), (
        "SVG files changed during verification; rerun after generation completes"
    )
    full, restored = fidelity_canvases["fullScene"], fidelity_canvases["restoredAssets"]
    maximum_difference = max(abs(a - b) for a, b in zip(full, restored))
    equality = {"maxChannelDelta": round(maximum_difference, 8),
                "tolerance": COMPOSITE_TOLERANCE,
                "passed": maximum_difference <= COMPOSITE_TOLERANCE}
    targets = ("fullScene", "restoredAssets")
    result = {"grid": GRID, "limit": MAX_RMSE, **results,
              "restoredMatchesFullScene": equality,
              "passed": equality["passed"] and all(errors[label] <= MAX_RMSE for label in targets)}
    print(json.dumps(result, separators=(",", ":")), flush=True)
    assert equality["passed"], (
        f"Restored standalone exports differ from workspace.svg: {maximum_difference:.8f}"
    )
    failures = ", ".join(f"{label}={errors[label]:.4f}" for label in targets if errors[label] > MAX_RMSE)
    assert not failures, f"Exported SVG reconstruction exceeds RMSE {MAX_RMSE}: {failures}"


if __name__ == "__main__":
    main()
