"""Export complete stacked SVG scenes from independently completed parts."""

from copy import deepcopy
from pathlib import Path
import argparse
import xml.etree.ElementTree as ET


ASSETS = Path(__file__).resolve().parents[1] / "src/assets/cow-workspace"
ARM_THICKNESS_BASELINE = ASSETS / "rig-source/arm-thickness-before"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def group_from_file(filename, name):
    """Load a native part, relative archive, or absolute reference into a layer."""
    source = ET.parse(ASSETS / filename).getroot()
    group = ET.Element(f"{{{SVG}}}g", {"data-layer": name})
    for child in source:
        if child.tag.rsplit("}", 1)[-1] not in {"title", "desc"}:
            group.append(deepcopy(child))
    return group


def cow_pose_groups(phase, arm_assets=None):
    """Compose the complete rig at its unchanged shared world coordinates."""
    if phase not in {"thinking", "typing", "glance"}:
        raise ValueError(f"Unsupported cow pose: {phase}")
    arm_assets = ASSETS if arm_assets is None else Path(arm_assets).resolve()
    groups = []
    body = "cowBodyTyping" if phase == "typing" else "cowBodyComplete"
    groups.append(group_from_file(f"rig-{body}.svg", "cow-body"))
    if phase != "typing":
        groups.append(group_from_file(arm_assets / "rig-cowArmRightResting.svg", "right-arm"))
    groups.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
    eyes = {
        "thinking": "cowEyesThinking",
        "typing": "cowEyesWorking",
        "glance": "cowEyesObserver",
    }[phase]
    groups.append(group_from_file(f"rig-{eyes}.svg", "cow-eyes"))
    mouth = "cowMouthSmile" if phase == "glance" else "cowMouthNeutral"
    groups.append(group_from_file(f"rig-{mouth}.svg", "cow-mouth"))
    if phase == "typing":
        groups.append(group_from_file(arm_assets / "rig-cowArmLeftTyping.svg", "left-arm"))
        groups.append(group_from_file(arm_assets / "rig-cowArmRightTyping.svg", "right-arm"))
    else:
        groups.append(group_from_file(arm_assets / "rig-cowArmLeftThinking.svg", "thinking-arm"))
    return groups


def compose(phase):
    scene = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 1254 1254",
        "shape-rendering": "crispEdges",
        "role": "img",
        "aria-labelledby": "scene-title",
    })
    ET.SubElement(scene, f"{{{SVG}}}title", {"id": "scene-title"}).text = (
        f"牛工程師的完整 SVG 桌面 · {phase}"
    )
    scene.extend(cow_pose_groups(phase))
    scene.append(group_from_file("complete-desk.svg", "desk"))
    for name in ["plantPot", "plantLeaves", "books", "laptop"]:
        scene.append(group_from_file(f"complete-{name}.svg", name))
    for name in ["globe", "coffee", "openBook"]:
        scene.append(group_from_file(f"complete-{name}.svg", name))
    filename = {
        "thinking": "complete-workspace.svg",
        "typing": "complete-workspace-typing.svg",
        "glance": "complete-workspace-glance.svg",
    }[phase]
    ET.ElementTree(scene).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_pose_review(filename="rig-poses-review.svg"):
    """Compare complete poses at one scale, without props or per-part fitting."""
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 2052 1292", "role": "img",
        "aria-labelledby": "poses-review-title poses-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "poses-review-title",
    }).text = "牛工程師兩種姿勢 · 相同比例對照"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "poses-review-description",
    }).text = "左邊思考，右邊打字。兩欄使用相同視角與顯示尺度，完整呈現角色，不含桌面道具。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "2052", "height": "1292", "fill": "#f3efe5",
    })
    for offset, phase, label in [
        (24, "thinking", "思考姿勢"),
        (1040, "typing", "打字姿勢"),
    ]:
        card = ET.SubElement(board, f"{{{SVG}}}g", {"data-pose": phase})
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "24", "width": "988", "height": "1244",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "79", "font-size": "32",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = f"{label} · 相同比例"
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "111", "font-size": "18",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "相同視角與顯示尺度 · 完整輪廓"
        drawing = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 19), "y": "160", "width": "950", "height": "1100",
            "viewBox": "150 45 1100 1100", "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        drawing.extend(cow_pose_groups(phase))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_body_review(filename="rig-body-review.svg"):
    """Inspect the complete neutral torso alone and in its full cow pose."""
    body = ET.parse(ASSETS / "rig-cowBodyComplete.svg").getroot()
    x, y, width, height = map(float, body.get("viewBox").split())
    padded_bounds = [x - 12, y - 12, width + 24, height + 24]
    body_viewbox = " ".join(f"{value:.4f}".rstrip("0").rstrip(".")
                            for value in padded_bounds)
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 960 600", "role": "img",
        "aria-labelledby": "body-review-title body-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "body-review-title",
    }).text = "牛工程師衣身與組合檢查"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "body-review-description",
    }).text = "左欄單獨查看完整衣身，右欄疊上頭、眼睛與手臂，不含桌面道具。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "960", "height": "600", "fill": "#f3efe5",
    })
    for offset, kind, label, subtitle, viewbox in [
        (20, "body", "完整衣身", "獨立查看衣身輪廓", body_viewbox),
        (500, "cow", "疊上頭與手臂", "原座標的思考姿勢", "150 45 1100 1100"),
    ]:
        card = ET.SubElement(board, f"{{{SVG}}}g", {"data-body-review": kind})
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "20", "width": "440", "height": "560",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "64", "font-size": "26",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = label
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "91", "font-size": "15",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = subtitle
        drawing = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 20), "y": "112", "width": "400", "height": "448",
            "viewBox": viewbox, "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        if kind == "body":
            drawing.append(group_from_file("rig-cowBodyComplete.svg", "cow-body"))
        else:
            drawing.extend(cow_pose_groups("thinking"))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_eyes_review(filename="rig-eyes-review.svg"):
    """Compare observer-eye pairs on the same complete head at one scale."""
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 960 520", "role": "img",
        "aria-labelledby": "eyes-review-title eyes-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "eyes-review-title",
    }).text = "牛工程師直視眼神對照"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "eyes-review-description",
    }).text = "左欄原本眼神，右欄新直視眼神。兩欄使用同一牛頭與相同顯示尺度。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "960", "height": "520", "fill": "#f3efe5",
    })
    for offset, kind, label, eyes_file in [
        (20, "original", "原本眼神", "rig-source/cowEyesObserverOriginal-v1.svg"),
        (500, "observer", "新直視眼神", "rig-cowEyesObserver.svg"),
    ]:
        card = ET.SubElement(board, f"{{{SVG}}}g", {"data-eye-review": kind})
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "20", "width": "440", "height": "480",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "64", "font-size": "26",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = label
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "91", "font-size": "15",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "同一牛頭 · 同尺度"
        drawing = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 20), "y": "112", "width": "400", "height": "368",
            "viewBox": "185 45 875 715", "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        drawing.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
        drawing.append(group_from_file(eyes_file, "cow-eyes"))
        drawing.append(group_from_file("rig-cowMouthNeutral.svg", "cow-mouth"))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_working_eyes_review(filename="rig-working-eyes-review.svg"):
    """Compare complete working-eye alpha and placement without altering art."""
    variants = [
        (20, "original", "原本工作眼神", "rig-source/cowEyesWorkingOriginal-v1.svg"),
        (500, "working", "新工作眼神", "rig-cowEyesWorking.svg"),
    ]
    bounds = []
    for _, _, _, eyes_file in variants:
        source = ET.parse(ASSETS / eyes_file).getroot()
        x, y, width, height = map(float, source.get("viewBox").split())
        bounds.append((x, y, x + width, y + height))
    left = min(box[0] for box in bounds) - 8
    top = min(box[1] for box in bounds) - 8
    right = max(box[2] for box in bounds) + 8
    bottom = max(box[3] for box in bounds) + 8
    eyes_viewbox = " ".join(f"{value:.4f}".rstrip("0").rstrip(".")
                            for value in [left, top, right - left, bottom - top])
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 960 650", "role": "img",
        "aria-labelledby": "working-eyes-review-title working-eyes-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "working-eyes-review-title",
    }).text = "牛工程師工作眼神對照"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "working-eyes-review-description",
    }).text = "上方在相同棋盤底獨立查看眼睛，下方在同一牛頭上以相同比例比較原本與新的工作眼神。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "960", "height": "650", "fill": "#f3efe5",
    })
    defs = ET.SubElement(board, f"{{{SVG}}}defs")
    pattern = ET.SubElement(defs, f"{{{SVG}}}pattern", {
        "id": "working-eyes-checker", "width": "24", "height": "24",
        "patternUnits": "userSpaceOnUse",
    })
    ET.SubElement(pattern, f"{{{SVG}}}rect", {
        "width": "24", "height": "24", "fill": "#f4f2ed",
    })
    for x, y in [(0, 0), (12, 12)]:
        ET.SubElement(pattern, f"{{{SVG}}}rect", {
            "x": str(x), "y": str(y), "width": "12", "height": "12",
            "fill": "#d8d5cd",
        })
    for offset, kind, label, eyes_file in variants:
        card = ET.SubElement(board, f"{{{SVG}}}g", {"data-working-eye-review": kind})
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "20", "width": "440", "height": "610",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "64", "font-size": "26",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = label
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "91", "font-size": "15",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "同一牛頭 · 同尺度"
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "120", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "獨立眼睛"
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset + 20), "y": "132", "width": "400", "height": "130",
            "fill": "url(#working-eyes-checker)",
        })
        independent = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 28), "y": "140", "width": "384", "height": "114",
            "viewBox": eyes_viewbox, "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        independent.append(group_from_file(eyes_file, "cow-eyes"))
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "289", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "疊上同一牛頭"
        head = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 20), "y": "300", "width": "400", "height": "310",
            "viewBox": "185 45 875 715", "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        head.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
        head.append(group_from_file(eyes_file, "cow-eyes"))
        head.append(group_from_file("rig-cowMouthNeutral.svg", "cow-mouth"))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_working_eyes_lively_review(
        filename="rig-working-eyes-lively-review.svg",
        before_file="rig-source/cowEyesWorkingIndependent-v1.svg",
        before_label="原本寫代碼", middle_label="重新生成・寫代碼",
        observer_label="看著你・參考", title="牛工程師寫代碼眼神與直視參考",
        review_id="lively-eyes"):
    """Compare old/new working eyes and observer reference at one head scale."""
    variants = [
        (20, "original", before_label, before_file),
        (500, "working", middle_label, "rig-cowEyesWorking.svg"),
        (980, "observer", observer_label, "rig-cowEyesObserver.svg"),
    ]
    bounds = []
    for _, _, _, eyes_file in variants:
        source = ET.parse(ASSETS / eyes_file).getroot()
        x, y, width, height = map(float, source.get("viewBox").split())
        bounds.append((x, y, x + width, y + height))
    left = min(box[0] for box in bounds) - 8
    top = min(box[1] for box in bounds) - 8
    right = max(box[2] for box in bounds) + 8
    bottom = max(box[3] for box in bounds) + 8
    eyes_viewbox = " ".join(f"{value:.4f}".rstrip("0").rstrip(".")
                            for value in [left, top, right - left, bottom - top])
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 1440 640", "role": "img",
        "aria-labelledby": f"{review_id}-review-title {review_id}-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": f"{review_id}-review-title",
    }).text = title
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": f"{review_id}-review-description",
    }).text = (f"左欄{before_label}，中欄{middle_label}，右欄{observer_label}。"
              "上方在相同棋盤底獨立查看眼睛，下方使用同一牛頭與相同顯示尺度。")
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "1440", "height": "640", "fill": "#f3efe5",
    })
    defs = ET.SubElement(board, f"{{{SVG}}}defs")
    pattern = ET.SubElement(defs, f"{{{SVG}}}pattern", {
        "id": f"{review_id}-checker", "width": "24", "height": "24",
        "patternUnits": "userSpaceOnUse",
    })
    ET.SubElement(pattern, f"{{{SVG}}}rect", {
        "width": "24", "height": "24", "fill": "#f4f2ed",
    })
    for x, y in [(0, 0), (12, 12)]:
        ET.SubElement(pattern, f"{{{SVG}}}rect", {
            "x": str(x), "y": str(y), "width": "12", "height": "12",
            "fill": "#d8d5cd",
        })
    for offset, kind, label, eyes_file in variants:
        card = ET.SubElement(board, f"{{{SVG}}}g", {
            f"data-{review_id.replace('-eyes', '-eye')}-review": kind,
        })
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "20", "width": "440", "height": "600",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "64", "font-size": "26",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = label
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "91", "font-size": "15",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "同一牛頭 · 同尺度"
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "120", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "獨立眼睛"
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset + 20), "y": "132", "width": "400", "height": "130",
            "fill": f"url(#{review_id}-checker)",
        })
        independent = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 28), "y": "140", "width": "384", "height": "114",
            "viewBox": eyes_viewbox, "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        independent.append(group_from_file(eyes_file, "cow-eyes"))
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "289", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "疊上同一牛頭"
        head = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 20), "y": "300", "width": "400", "height": "300",
            "viewBox": "185 45 875 715", "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        head.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
        head.append(group_from_file(eyes_file, "cow-eyes"))
        head.append(group_from_file("rig-cowMouthNeutral.svg", "cow-mouth"))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_working_eyes_focus_review(filename="rig-working-eyes-focus-review.svg"):
    """Compare the focused expression with its previous art and observer eyes."""
    compose_working_eyes_lively_review(
        filename=filename,
        before_file="rig-source/cowEyesWorkingLively-v2.svg",
        before_label="修改前・寫代碼", middle_label="專注寫代碼",
        observer_label="看著你", title="牛工程師專注眼神與直視眼神對照",
        review_id="focused-eyes",
    )


def compose_mouth_review(filename="rig-mouth-review.svg"):
    """Inspect both complete mouths alone and on one head with identical eyes."""
    variants = [
        (20, "neutral", "思考／打字 · 平嘴", "rig-cowMouthNeutral.svg"),
        (500, "smile", "看著你 · 微笑", "rig-cowMouthSmile.svg"),
    ]
    bounds = []
    for _, _, _, mouth_file in variants:
        source = ET.parse(ASSETS / mouth_file).getroot()
        x, y, width, height = map(float, source.get("viewBox").split())
        bounds.append((x, y, x + width, y + height))
    left = min(box[0] for box in bounds) - 8
    top = min(box[1] for box in bounds) - 8
    right = max(box[2] for box in bounds) + 8
    bottom = max(box[3] for box in bounds) + 8
    mouth_viewbox = " ".join(f"{value:.4f}".rstrip("0").rstrip(".")
                             for value in [left, top, right - left, bottom - top])
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 960 650", "role": "img",
        "aria-labelledby": "mouth-review-title mouth-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "mouth-review-title",
    }).text = "牛工程師獨立嘴型 · 平嘴與微笑"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "mouth-review-description",
    }).text = "上排在同一棋盤底、同尺度查看獨立嘴型，下排使用相同牛頭與直視眼睛，只更換平嘴或微笑。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "960", "height": "650", "fill": "#f3efe5",
    })
    defs = ET.SubElement(board, f"{{{SVG}}}defs")
    pattern = ET.SubElement(defs, f"{{{SVG}}}pattern", {
        "id": "mouth-review-checker", "width": "24", "height": "24",
        "patternUnits": "userSpaceOnUse",
    })
    ET.SubElement(pattern, f"{{{SVG}}}rect", {
        "width": "24", "height": "24", "fill": "#f4f2ed",
    })
    for x, y in [(0, 0), (12, 12)]:
        ET.SubElement(pattern, f"{{{SVG}}}rect", {
            "x": str(x), "y": str(y), "width": "12", "height": "12",
            "fill": "#d8d5cd",
        })
    for offset, state, label, mouth_file in variants:
        card = ET.SubElement(board, f"{{{SVG}}}g", {"data-mouth-review": state})
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "20", "width": "440", "height": "610",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "64", "font-size": "26",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = label
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "91", "font-size": "15",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "同一牛頭、眼睛 · 同尺度"
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "120", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "獨立嘴型"
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset + 20), "y": "132", "width": "400", "height": "130",
            "fill": "url(#mouth-review-checker)",
        })
        independent = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 28), "y": "140", "width": "384", "height": "114",
            "viewBox": mouth_viewbox, "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        independent.append(group_from_file(mouth_file, "cow-mouth"))
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "289", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "疊上同一牛頭與直視眼睛"
        head = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 20), "y": "300", "width": "400", "height": "310",
            "viewBox": "185 45 875 715", "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        head.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
        head.append(group_from_file("rig-cowEyesObserver.svg", "cow-eyes"))
        head.append(group_from_file(mouth_file, "cow-mouth"))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_three_expressions_review(filename="rig-three-expressions-review.svg"):
    """Compare three independent eyes and their mouths on the same head."""
    variants = [
        (20, "thinking", "思考 · 想事情", "cowEyesThinking", "cowMouthNeutral"),
        (500, "typing", "打字 · 專注", "cowEyesWorking", "cowMouthNeutral"),
        (980, "glance", "看著你 · 微笑", "cowEyesObserver", "cowMouthSmile"),
    ]
    bounds = []
    for _, _, _, eyes, _ in variants:
        source = ET.parse(ASSETS / f"rig-{eyes}.svg").getroot()
        x, y, width, height = map(float, source.get("viewBox").split())
        bounds.append((x, y, x + width, y + height))
    left = min(box[0] for box in bounds) - 8
    top = min(box[1] for box in bounds) - 8
    right = max(box[2] for box in bounds) + 8
    bottom = max(box[3] for box in bounds) + 8
    eyes_viewbox = " ".join(f"{value:.4f}".rstrip("0").rstrip(".")
                            for value in [left, top, right - left, bottom - top])
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 1440 640", "role": "img",
        "aria-labelledby": "expressions-review-title expressions-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "expressions-review-title",
    }).text = "牛工程師三種表情 · 思考、打字、看著你"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "expressions-review-description",
    }).text = "上排在相同棋盤底獨立顯示三組眼睛，下排在相同牛頭、相同尺度疊上對應眼睛與嘴型；思考和打字平嘴，看著你微笑。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "1440", "height": "640", "fill": "#f3efe5",
    })
    defs = ET.SubElement(board, f"{{{SVG}}}defs")
    pattern = ET.SubElement(defs, f"{{{SVG}}}pattern", {
        "id": "expressions-review-checker", "width": "24", "height": "24",
        "patternUnits": "userSpaceOnUse",
    })
    ET.SubElement(pattern, f"{{{SVG}}}rect", {
        "width": "24", "height": "24", "fill": "#f4f2ed",
    })
    for x, y in [(0, 0), (12, 12)]:
        ET.SubElement(pattern, f"{{{SVG}}}rect", {
            "x": str(x), "y": str(y), "width": "12", "height": "12",
            "fill": "#d8d5cd",
        })
    for offset, phase, label, eyes, mouth in variants:
        card = ET.SubElement(board, f"{{{SVG}}}g", {
            "data-expression-review": phase,
        })
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset), "y": "20", "width": "440", "height": "600",
            "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
        })
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "64", "font-size": "26",
            "font-family": "system-ui, sans-serif", "fill": "#282b2b",
        }).text = label
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "91", "font-size": "15",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "同一牛頭 · 同尺度"
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "120", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "獨立眼睛"
        ET.SubElement(card, f"{{{SVG}}}rect", {
            "x": str(offset + 20), "y": "132", "width": "400", "height": "130",
            "fill": "url(#expressions-review-checker)",
        })
        independent = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 28), "y": "140", "width": "384", "height": "114",
            "viewBox": eyes_viewbox, "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        independent.append(group_from_file(f"rig-{eyes}.svg", "cow-eyes"))
        ET.SubElement(card, f"{{{SVG}}}text", {
            "x": str(offset + 24), "y": "289", "font-size": "13",
            "font-family": "system-ui, sans-serif", "fill": "#767266",
        }).text = "疊上同一牛頭與對應嘴型"
        head = ET.SubElement(card, f"{{{SVG}}}svg", {
            "x": str(offset + 20), "y": "300", "width": "400", "height": "300",
            "viewBox": "185 45 875 715", "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        head.append(group_from_file("rig-cowHeadComplete.svg", "cow-head"))
        head.append(group_from_file(f"rig-{eyes}.svg", "cow-eyes"))
        head.append(group_from_file(f"rig-{mouth}.svg", "cow-mouth"))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_arm_thickness_review(filename="rig-arm-thickness-review.svg",
                                 baseline_assets=ARM_THICKNESS_BASELINE):
    """Compare old and current arms on the same current torso, head and eyes."""
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 960 1100", "role": "img",
        "aria-labelledby": "arm-thickness-review-title arm-thickness-review-description",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {
        "id": "arm-thickness-review-title",
    }).text = "牛工程師手臂比例前後對照"
    ET.SubElement(board, f"{{{SVG}}}desc", {
        "id": "arm-thickness-review-description",
    }).text = "上排思考，下排打字。左欄修改前手臂，右欄修正後手臂；四格使用相同顯示尺度，並疊在目前的衣身、頭與眼睛上。"
    ET.SubElement(board, f"{{{SVG}}}rect", {
        "width": "960", "height": "1100", "fill": "#f3efe5",
    })
    for row, phase, pose_label in [(20, "thinking", "思考"), (560, "typing", "打字")]:
        for offset, version, version_label, arms in [
            (20, "before", "修改前", baseline_assets),
            (500, "after", "修正後", ASSETS),
        ]:
            card = ET.SubElement(board, f"{{{SVG}}}g", {
                "data-pose": phase, "data-arm-version": version,
            })
            ET.SubElement(card, f"{{{SVG}}}rect", {
                "x": str(offset), "y": str(row), "width": "440", "height": "520",
                "rx": "12", "fill": "#faf7ef", "stroke": "#ddd7c9", "stroke-width": "2",
            })
            ET.SubElement(card, f"{{{SVG}}}text", {
                "x": str(offset + 24), "y": str(row + 44), "font-size": "26",
                "font-family": "system-ui, sans-serif", "fill": "#282b2b",
            }).text = f"{pose_label} · {version_label}"
            ET.SubElement(card, f"{{{SVG}}}text", {
                "x": str(offset + 24), "y": str(row + 71), "font-size": "15",
                "font-family": "system-ui, sans-serif", "fill": "#767266",
            }).text = "相同衣身、牛頭與眼神 · 同尺度"
            drawing = ET.SubElement(card, f"{{{SVG}}}svg", {
                "x": str(offset + 20), "y": str(row + 84), "width": "400", "height": "416",
                "viewBox": "150 45 1100 1100", "shape-rendering": "crispEdges",
                "preserveAspectRatio": "xMidYMid meet",
            })
            drawing.extend(cow_pose_groups(phase, arm_assets=arms))
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


def compose_arm_review(parts=None, filename="rig-arms-review.svg",
                       title="重新繪製的完整思考與放鬆手臂"):
    """Show complete independently drawn arms without scene occlusion."""
    board = ET.Element(f"{{{SVG}}}svg", {
        "viewBox": "0 0 960 600", "role": "img",
        "aria-labelledby": "arms-review-title",
    })
    ET.SubElement(board, f"{{{SVG}}}title", {"id": "arms-review-title"}).text = title
    defs = ET.SubElement(board, f"{{{SVG}}}defs")
    pattern = ET.SubElement(defs, f"{{{SVG}}}pattern", {
        "id": "arms-checker", "width": "24", "height": "24",
        "patternUnits": "userSpaceOnUse",
    })
    ET.SubElement(pattern, f"{{{SVG}}}rect", {
        "width": "24", "height": "24", "fill": "#f4f2ed",
    })
    for x, y in [(0, 0), (12, 12)]:
        ET.SubElement(pattern, f"{{{SVG}}}rect", {
            "x": str(x), "y": str(y), "width": "12", "height": "12",
            "fill": "#e4e1d9",
        })
    for offset, name, label in parts or [
        (0, "cowArmLeftThinking", "左側手臂 · 思考"),
        (480, "cowArmRightResting", "右側手臂 · 放鬆"),
    ]:
        ET.SubElement(board, f"{{{SVG}}}rect", {
            "x": str(offset + 20), "y": "20", "width": "440", "height": "512",
            "rx": "12", "fill": "url(#arms-checker)",
        })
        source = ET.parse(ASSETS / f"rig-{name}.svg").getroot()
        drawing = ET.SubElement(board, f"{{{SVG}}}svg", {
            "x": str(offset + 52), "y": "52", "width": "376", "height": "448",
            "viewBox": source.get("viewBox"), "shape-rendering": "crispEdges",
            "preserveAspectRatio": "xMidYMid meet",
        })
        for child in source:
            if child.tag.rsplit("}", 1)[-1] not in {"title", "desc"}:
                drawing.append(deepcopy(child))
        ET.SubElement(board, f"{{{SVG}}}text", {
            "x": str(offset + 28), "y": "572", "font-size": "24",
            "font-family": "system-ui, sans-serif", "fill": "#262b27",
        }).text = label
    ET.ElementTree(board).write(ASSETS / filename, encoding="unicode")
    print(filename)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    reviews = parser.add_mutually_exclusive_group()
    reviews.add_argument("--pose-review-only", action="store_true",
                         help="Only export the same-scale cow pose comparison board.")
    reviews.add_argument("--body-review-only", action="store_true",
                         help="Only export the torso and complete cow comparison board.")
    reviews.add_argument("--eyes-review-only", action="store_true",
                         help="Only export the old and new observer eyes on the same head.")
    reviews.add_argument("--working-eyes-review-only", action="store_true",
                         help="Only export old and new working eyes on checkerboard and head.")
    reviews.add_argument("--working-eyes-lively-review-only", action="store_true",
                         help="Only export old/new working eyes and the observer reference.")
    reviews.add_argument("--working-eyes-focus-review-only", action="store_true",
                         help="Only export focused working eyes, their previous art and observer eyes.")
    reviews.add_argument("--mouth-review-only", action="store_true",
                         help="Only export neutral and smiling mouths on checkerboard and one head.")
    reviews.add_argument("--three-expressions-review-only", action="store_true",
                         help="Only export thinking, typing and glance eyes with their mouths.")
    reviews.add_argument("--arm-thickness-review-only", action="store_true",
                         help="Only export the same-scale before/after arm proportion board.")
    parser.add_argument("--arm-thickness-baseline", type=Path, default=ARM_THICKNESS_BASELINE,
                        help="Directory containing the four baseline native arm SVG files.")
    args = parser.parse_args()
    if args.pose_review_only:
        compose_pose_review()
    elif args.body_review_only:
        compose_body_review()
    elif args.eyes_review_only:
        compose_eyes_review()
    elif args.working_eyes_review_only:
        compose_working_eyes_review()
    elif args.working_eyes_lively_review_only:
        compose_working_eyes_lively_review()
    elif args.working_eyes_focus_review_only:
        compose_working_eyes_focus_review()
    elif args.mouth_review_only:
        compose_mouth_review()
    elif args.three_expressions_review_only:
        compose_three_expressions_review()
    elif args.arm_thickness_review_only:
        compose_arm_thickness_review(baseline_assets=args.arm_thickness_baseline)
    else:
        for phase in ["thinking", "typing", "glance"]:
            compose(phase)
        compose_arm_review()
        compose_arm_review(
            parts=[(0, "cowArmLeftTyping", "左側手臂 · 打字"),
                   (480, "cowArmRightTyping", "右側手臂 · 打字")],
            filename="rig-typing-arms-review.svg",
            title="重新繪製的完整左右打字手臂",
        )
        compose_pose_review()
        compose_body_review()
        compose_eyes_review()
        compose_working_eyes_review()
        if (ASSETS / "rig-source/cowEyesWorkingIndependent-v1.svg").is_file():
            compose_working_eyes_lively_review()
        if (ASSETS / "rig-source/cowEyesWorkingLively-v2.svg").is_file():
            compose_working_eyes_focus_review()
        compose_mouth_review()
        compose_three_expressions_review()
        if args.arm_thickness_baseline.is_dir():
            compose_arm_thickness_review(baseline_assets=args.arm_thickness_baseline)
