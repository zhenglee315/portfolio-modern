"""Export reusable cow poses from the retained native SVG parts.

Run from frontend with --character-only to omit the desk, or choose --eyes and
--mouth to assemble another expression without changing production assets.
Generated previews default to the ignored root agent/ directory.
"""

import argparse
import xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
ASSETS = FRONTEND / "src/assets/cow-workspace"
SVG = "http://www.w3.org/2000/svg"
PHASES = ("thinking", "typing", "glance")
EYES = {
    "thinking": "cowEyesThinking",
    "working": "cowEyesWorking",
    "observer": "cowEyesObserver",
}
MOUTHS = {"neutral": "cowMouthNeutral", "smile": "cowMouthSmile"}
ET.register_namespace("", SVG)


def group_from_file(filename, name):
    """Copy full native geometry in its shared scene coordinates."""
    source = ET.parse(ASSETS / filename).getroot()
    group = ET.Element(f"{{{SVG}}}g", {"data-layer": name})
    for child in source:
        if child.tag.rsplit("}", 1)[-1] not in {"title", "desc"}:
            group.append(deepcopy(child))
    return group


def cow_pose_groups(phase, eyes=None, mouth=None):
    """Keep the approved shoulder/head placement while composing an expression."""
    body = "cowBodyTyping" if phase == "typing" else "cowBodyComplete"
    groups = [group_from_file(f"rig-{body}.svg", "cow-body")]
    if phase != "typing":
        groups.append(group_from_file("rig-cowArmRightResting.svg", "right-arm"))
    groups.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
    eyes = eyes or {"thinking": "thinking", "typing": "working", "glance": "observer"}[phase]
    mouth = mouth or ("smile" if phase == "glance" else "neutral")
    groups.append(group_from_file(f"rig-{EYES[eyes]}.svg", "cow-eyes"))
    groups.append(group_from_file(f"rig-{MOUTHS[mouth]}.svg", "cow-mouth"))
    if phase == "typing":
        groups.append(group_from_file("rig-cowArmLeftTyping.svg", "left-arm"))
        groups.append(group_from_file("rig-cowArmRightTyping.svg", "right-arm"))
    else:
        groups.append(group_from_file("rig-cowArmLeftThinking.svg", "thinking-arm"))
    return groups


def compose(phase, output, character_only=False, eyes=None, mouth=None):
    """Write a self-contained SVG without modifying sources or runtime artwork."""
    scene = ET.Element(
        f"{{{SVG}}}svg",
        {
            "viewBox": "0 0 1254 1254",
            "shape-rendering": "crispEdges",
            "role": "img",
            "aria-labelledby": "scene-title",
        },
    )
    ET.SubElement(scene, f"{{{SVG}}}title", {"id": "scene-title"}).text = f"Cow workspace · {phase}"
    scene.extend(cow_pose_groups(phase, eyes, mouth))
    if not character_only:
        for name in (
            "desk",
            "plantPot",
            "plantLeaves",
            "books",
            "laptop",
            "globe",
            "coffee",
            "openBook",
        ):
            scene.append(group_from_file(f"complete-{name}.svg", name))
    prefix = "cow" if character_only else "workspace"
    suffix = "".join(f"-{value}" for value in (eyes, mouth) if value)
    target = output / f"{prefix}-{phase}{suffix}.svg"
    ET.ElementTree(scene).write(target, encoding="unicode")
    print(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("all", *PHASES), default="all")
    parser.add_argument("--character-only", action="store_true")
    parser.add_argument("--eyes", choices=tuple(EYES))
    parser.add_argument("--mouth", choices=tuple(MOUTHS))
    parser.add_argument("--output", type=Path, default=FRONTEND.parent / "agent/cow-workspace-previews")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for phase in PHASES if args.phase == "all" else (args.phase,):
        compose(phase, output, args.character_only, args.eyes, args.mouth)


if __name__ == "__main__":
    main()
