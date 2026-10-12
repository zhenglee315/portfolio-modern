"""Split the approved working eyes into a native frame and two tracking irises.

Only this directory is written. Every untouched native rectangle retains its
original geometry, fill and opacity. No raster embedding or new eye expression
is introduced; the existing iris footprint is restored with its sclera color.
"""

from collections import defaultdict
from hashlib import sha256
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET


HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "rig-cowEyesWorking.svg"
RECTANGLE = re.compile(r"M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)H(-?[\d.]+)z")
X0, Y0 = 384.3081339712919, 266.9737629820304
STEP = 0.9339712918660287
SCLERA = "#fcf4ec"
# Angled slit openings follow the original stepped lids. Bands are on the
# approved working-eye trace's original four-source-pixel sample grid.
OPENING_BANDS = [
    (74, 80, 24, 32),
    (80, 87, 16, 61),
    (87, 88, 24, 68),
    (88, 94, 24, 98),
    (94, 95, 24, 143),
    (95, 101, 24, 151),
    (101, 108, 32, 166),
    (108, 115, 39, 166),
    (115, 117, 46, 158),
    (117, 123, 46, 158),
    (123, 128, 61, 150),
]
IRIS_BANDS = [
    (88, 115, 68, 143),
    (115, 123, 74, 137),
    (123, 128, 81, 130),
]
# The approved trace has a one-cell pale antialias fringe around the iris rim.
# Restore that fringe too so a moving iris cannot leave its old outline behind.
RESTORATION_BANDS = [
    (88, 115, 66, 145),
    (115, 123, 72, 139),
    (123, 128, 79, 132),
]


def number(value):
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


def command(x, y, width=1, height=1):
    left, top = X0 + x * STEP, Y0 + y * STEP
    return f"M{number(left)} {number(top)}h{number(width * STEP)}v{number(height * STEP)}H{number(left)}z"


def band_cells(bands, right=False):
    return {
        (444 - x if right else x, y)
        for top, bottom, left, end in bands
        for y in range(top, bottom)
        for x in range(left, end)
    }


def clip_path(bands, right=False):
    # Adjacent horizontal bands share edges; one continuous stepped polygon
    # keeps interpolation and native crisp rendering deterministic.
    edges = [(top, bottom, 445 - end, 445 - left) if right else (top, bottom, left, end)
             for top, bottom, left, end in bands]
    points = [(edges[0][2], edges[0][0])]
    for top, bottom, left, end in edges:
        points.extend([(left, top), (left, bottom)])
    for top, bottom, left, end in reversed(edges):
        points.extend([(end, bottom), (end, top)])
    points.append((edges[0][2], edges[0][0]))
    return "M" + "L".join(f"{number(X0 + x * STEP)} {number(Y0 + y * STEP)}" for x, y in points) + "Z"


def paths_for_cells(cells):
    grouped = defaultdict(list)
    for y in sorted({y for x, y in cells}):
        xs = sorted(x for x, yy in cells if yy == y)
        i = 0
        while i < len(xs):
            start, end, value = xs[i], xs[i] + 1, cells[xs[i], y]
            i += 1
            while i < len(xs) and xs[i] == end and cells[xs[i], y] == value:
                end += 1
                i += 1
            grouped[value].append(command(start, y, end - start))
    return [(fill, opacity, "".join(commands)) for (fill, opacity), commands in grouped.items()]


def write_svg(name, identifier, paths, bounds, description, definitions=()):
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" viewBox="{" ".join(map(number, bounds))}">',
        f"<title>{name}</title>",
        f"<desc>{description}</desc>",
    ]
    if definitions:
        lines.append("<defs>")
        for definition_id, geometry in definitions:
            lines.append(f'<path id="{definition_id}" d="{geometry}"/>')
        lines.append("</defs>")
    lines.append(f'<g id="{identifier}" data-rig-part="{identifier}">')
    for fill, opacity, geometry in paths:
        alpha = f' opacity="{opacity}"' if opacity is not None else ""
        lines.append(f'<path fill="{fill}"{alpha} d="{geometry}"/>')
    lines.extend(["</g>", "</svg>", ""])
    (HERE / f"rig-{identifier}.svg").write_text("\n".join(lines))


def main():
    root = ET.parse(SOURCE).getroot()
    openings = [band_cells(OPENING_BANDS, right=side == 1) for side in range(2)]
    irises = [band_cells(IRIS_BANDS, right=side == 1) for side in range(2)]
    restoration = [band_cells(RESTORATION_BANDS, right=side == 1) for side in range(2)]
    removal = (openings[0] & restoration[0]) | (openings[1] & restoration[1])
    frame, restored, native = [], {}, {}
    for node in root.iter("{http://www.w3.org/2000/svg}path"):
        fill, opacity = node.get("fill"), node.get("opacity")
        retained, changed = [], {}
        for rectangle in RECTANGLE.finditer(node.get("d")):
            x, y, width, height, _ = map(float, rectangle.groups())
            ix, iy = round((x - X0) / STEP), round((y - Y0) / STEP)
            nx, ny = round(width / STEP), round(height / STEP)
            footprint = {(xx, yy) for yy in range(iy, iy + ny) for xx in range(ix, ix + nx)}
            native.update({cell: (fill, opacity) for cell in footprint})
            if not footprint & removal:
                retained.append(rectangle.group(0))
                continue
            for cell in footprint:
                if cell in removal:
                    restored[cell] = (SCLERA, opacity)
                else:
                    changed[cell] = (fill, opacity)
        if retained:
            frame.append((fill, opacity, "".join(retained)))
        frame.extend(paths_for_cells(changed))
    frame.extend(paths_for_cells(restored))
    digest = sha256(SOURCE.read_bytes()).hexdigest()
    write_svg("Approved working brows and eye contours, without irises", "denied-eye-frame", frame,
              list(map(float, root.get("viewBox").split())),
              f"Derived from the approved working-eye native SVG SHA-256 {digest}. Original eyebrows, central crease and lids preserved; only iris interiors restored with original sclera color {SCLERA}.",
              [(f"denied-eye-opening-{label}", clip_path(OPENING_BANDS, right=side == 1))
               for side, label in enumerate(("left", "right"))])
    metadata = []
    for side, label in enumerate(("left", "right")):
        selected = {cell: native[cell] for cell in irises[side] if cell in native}
        # Complete only the previously hidden upper half by mirroring the
        # existing lower iris. The static lid clip hides this completion at rest.
        for (x, y), value in list(selected.items()):
            reflected = (x, 195 - y)
            if reflected[1] < 88:
                selected[reflected] = value
        left = 68 if side == 0 else 302
        center = {"x": X0 + (left + 37.5) * STEP, "y": Y0 + 98 * STEP}
        bounds = [X0 + left * STEP, Y0 + 68 * STEP, 75 * STEP, 60 * STEP]
        write_svg(f"Independent approved {label} gray-brown iris and pupil", f"denied-pupil-{label}",
                  paths_for_cells(selected), bounds,
                  f"Independent native SVG pixels extracted from the approved working eyes SHA-256 {digest}. Original gray-brown palette, black pupil and white catchlight retained; only hidden upper rows completed from the same iris.")
        aperture = openings[side]
        width = (max(x for x, y in aperture) - min(x for x, y in aperture) + 1) * STEP
        height = (max(y for x, y in aperture) - min(y for x, y in aperture) + 1) * STEP
        metadata.append({
            "id": label,
            "assetId": f"denied-pupil-{label}",
            "center": center,
            "width": width,
            "height": height,
            "pupilWidth": bounds[2],
            "pupilHeight": bounds[3],
            "clipId": f"denied-eye-opening-{label}",
            "clipPath": clip_path(OPENING_BANDS, right=side == 1),
            "maxOffset": {"x": 20, "y": 8},
        })
    (HERE / "eyes.ts").write_text(
        "/** Native working-eye split in the shared 1254 × 1254 scene coordinates. */\n"
        "export const DENIED_EYE_FRAME_ID = 'denied-eye-frame' as const;\n\n"
        "export const DENIED_EYES = " + json.dumps([
            {key: value for key, value in eye.items() if key != "clipPath"}
            for eye in metadata
        ], indent=2) + " as const;\n"
    )
    (HERE / "eyes-provenance.json").write_text(json.dumps({
        "source": "../rig-cowEyesWorking.svg",
        "sourceSha256": digest,
        "sourcePng": "../rig-source/cowEyesWorkingFocusedRedrawnV3.png",
        "sceneSize": [1254, 1254],
        "frameViewBox": list(map(float, root.get("viewBox").split())),
        "method": "Exact native rectangle preservation outside iris masks; existing iris colors and original sclera reused; hidden pupil upper rows mirrored from the same native iris.",
        "restoredSampleCells": len(restored),
        "originalContourCommandsRetained": True,
        "openingBands": OPENING_BANDS,
        "irisBands": IRIS_BANDS,
        "restorationBands": RESTORATION_BANDS,
        "eyes": metadata,
    }, indent=2) + "\n")
    print(json.dumps({"eyes": metadata, "restoredCells": len(restored)}, indent=2))


if __name__ == "__main__":
    main()
