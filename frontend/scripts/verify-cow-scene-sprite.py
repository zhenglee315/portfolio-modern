"""Check external SVG groups and runtime metadata against original vector sources.

Uses an XML parser independently of the generator, preserving path order and all
fill, d, opacity and transform values. Run with Python 3 and Node 24 available.
"""

import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET


FRONTEND = Path(__file__).resolve().parents[1]
ASSETS = FRONTEND / "src/assets/cow-workspace"
NS = "{http://www.w3.org/2000/svg}"


def source_data():
    """Node's native type stripping reads the trusted checked-in source modules."""
    modules = {
        "rig": (ASSETS / "rig.ts").as_uri(),
        "props": (ASSETS / "complete-props.ts").as_uri(),
        "globe": (ASSETS / "globe-rotation.ts").as_uri(),
        "metadata": (ASSETS / "scene-metadata.ts").as_uri(),
    }
    program = "\n".join(
        f"const {name} = await import({json.dumps(uri)});"
        for name, uri in modules.items()
    )
    program += "\nprocess.stdout.write(JSON.stringify({rig, props, globe, metadata}));"
    result = subprocess.run(
        ["node", "--input-type=module", "-e", program],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def verify():
    data = source_data()
    rig, props, globe, metadata = (
        data[name] for name in ("rig", "props", "globe", "metadata")
    )
    expected = {
        **{f"rig-{name}": paths for name, paths in rig["COW_RIG_PARTS"].items()},
        **{f"prop-{name}": paths for name, paths in props["COMPLETE_COW_PROPS"].items()
           if name != "deskContactShadows"},
        "globe-base": globe["COW_GLOBE_ROTATION_BASE"],
        **{f"globe-frame-{index}": frame["paths"]
           for index, frame in enumerate(globe["COW_GLOBE_ROTATION_FRAMES"])},
        "globe-overlay": globe["COW_GLOBE_ROTATION_OVERLAY"],
    }
    root = ET.parse(ASSETS / "scene-sprite.svg").getroot()
    assert root.tag == NS + "svg"
    assert root.attrib["viewBox"] == props["COMPLETE_COW_PROP_VIEWBOX"]
    definitions = root.find(NS + "defs")
    assert definitions is not None
    assert len(root) == 1, "Sprite must contain only vector definitions."
    assert len(definitions) == len(expected), "Unexpected or missing sprite groups."
    actual = {}
    for group in definitions:
        assert group.tag == NS + "g"
        assert set(group.attrib) == {"id"}
        assert group.attrib["id"] not in actual, "Duplicate sprite group ID."
        paths = []
        for path in group:
            assert path.tag == NS + "path", "Sprite may only contain native vector paths."
            attributes = dict(path.attrib)
            if "opacity" in attributes:
                attributes["opacity"] = float(attributes["opacity"])
            paths.append(attributes)
        actual[group.attrib["id"]] = paths
    assert actual == expected, "Sprite geometry, materials or path order differs from source."
    assert set(metadata) == {
        "COW_RIG_PART_IDS", "COMPLETE_COW_PROP_IDS", "COMPLETE_COW_PROP_VIEWBOX",
        "COW_GLOBE_ROTATION_BASE_ID", "COW_GLOBE_ROTATION_OVERLAY_ID",
        "COW_GLOBE_ROTATION_DURATION", "COW_GLOBE_ROTATION_FRAMES",
    }, "Runtime metadata must contain only scene composition and animation information."
    assert metadata["COMPLETE_COW_PROP_VIEWBOX"] == props["COMPLETE_COW_PROP_VIEWBOX"]
    assert metadata["COW_RIG_PART_IDS"] == {
        name: f"rig-{name}" for name in rig["COW_RIG_PARTS"]
    }
    assert metadata["COMPLETE_COW_PROP_IDS"] == {
        name: f"prop-{name}" for name in props["COMPLETE_COW_PROPS"]
        if name != "deskContactShadows"
    }
    assert metadata["COW_GLOBE_ROTATION_BASE_ID"] == "globe-base"
    assert metadata["COW_GLOBE_ROTATION_OVERLAY_ID"] == "globe-overlay"
    assert metadata["COW_GLOBE_ROTATION_DURATION"] == globe["COW_GLOBE_ROTATION_DURATION"]
    assert metadata["COW_GLOBE_ROTATION_FRAMES"] == [
        {"angle": frame["angle"], "id": f"globe-frame-{index}"}
        for index, frame in enumerate(globe["COW_GLOBE_ROTATION_FRAMES"])
    ]
    animation = (ASSETS / "scene-globe-animation.css").read_text()
    intervals = re.findall(r"([\d.]+)%,\s*100%", animation)
    assert len(intervals) == 1, "Globe frames must share one visibility interval."
    frame_count = len(globe["COW_GLOBE_ROTATION_FRAMES"])
    assert abs(float(intervals[0]) - 100 / frame_count) < 1e-8
    duration = globe["COW_GLOBE_ROTATION_DURATION"]
    delays = [0 if index == 0 else -(frame_count - index) * duration / frame_count
              for index in range(frame_count)]
    # Sample each original frame midway through its interval for two full turns.
    for sample in range(frame_count * 2):
        elapsed = (sample + 0.5) * duration / frame_count
        visible = [index for index, delay in enumerate(delays)
                   if (elapsed - delay) % duration < duration / frame_count]
        assert visible == [sample % frame_count], "Globe frame order or overlap differs."
    print(f"Cow sprite parity verified: {len(expected)} groups, "
          f"{sum(len(paths) for paths in expected.values())} exact vector paths.")


if __name__ == "__main__":
    verify()
