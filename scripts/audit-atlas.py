#!/usr/bin/env python3
"""Check atlas structure and occupied bounds; animation quality needs visual review.

Usage: python scripts/audit-atlas.py [spritesheet.webp] [--json]
Requires Pillow. Coordinates are zero based; bounding-box bottoms are exclusive.
The bounds include hair and the microphone staff: they are NOT body measurements,
shoe positions, or a head/body ratio. A successful audit is only a structural pass.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow is required: python -m pip install pillow")

CELL_WIDTH, CELL_HEIGHT = 192, 208
COLUMNS, ROWS = 8, 11
SHEET_WIDTH, SHEET_HEIGHT = CELL_WIDTH * COLUMNS, CELL_HEIGHT * ROWS
MAX_BYTES = 20 * 1024 * 1024
BASELINE = 203
BASELINE_TOLERANCE = 2
HEIGHT_TOLERANCE = 0.03
RUN_HEIGHT_TOLERANCE = 0.08

# The optional seventh idle drawing is not played by the six-frame idle cycle.
# Look poses may be omitted only as a complete set, never half a set.
EXPECTED = {
    0: ("idle", (6, 7)),
    1: ("runningRight", (8,)),
    2: ("runningLeft", (8,)),
    3: ("waving", (4,)),
    4: ("jumping", (5,)),
    5: ("failed", (8,)),
    6: ("waiting", (6,)),
    7: ("running", (6,)),
    8: ("review", (6,)),
    9: ("look 000-157.5", (0, 8)),
    10: ("look 180-337.5", (0, 8)),
}
RUN_ROWS = (1, 2, 7)
GROUNDED_ROWS = (0, 3, 5, 6, 8, 9, 10)


def cells(image: Image.Image):
    for row in range(ROWS):
        for column in range(COLUMNS):
            x, y = column * CELL_WIDTH, row * CELL_HEIGHT
            yield row, column, image.crop((x, y, x + CELL_WIDTH, y + CELL_HEIGHT))


def measure(cell: Image.Image) -> dict | None:
    alpha = cell.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return None
    # This coverage is a reproducible diagnostic, never a head/body ratio.
    histogram = alpha.crop((0, 0, CELL_WIDTH, 90)).histogram()
    coverage = sum(value * count for value, count in enumerate(histogram)) / (255 * CELL_WIDTH * 90)
    return {
        "left": box[0], "top": box[1], "right": box[2], "bottom": box[3],
        "width": box[2] - box[0], "height": box[3] - box[1],
        "topBandCoverage": round(coverage, 4),
    }


def face_pixels(cell: Image.Image) -> int:
    """Count skin-toned pixels: a cheap proxy for how much face is visible.

    A real 16-step turntable hides the face at the back and cuts it roughly in
    half at the sides, so the count must swing widely across rows 9-10.
    """
    data = cell.tobytes()
    count = 0
    for index in range(0, len(data), 4):
        r, g, b, a = data[index], data[index + 1], data[index + 2], data[index + 3]
        if a > 200 and r > 190 and g > 130 and b > 110 and r > g + 25 and g > b:
            count += 1
    return count


def look_turntable(image: Image.Image) -> dict | None:
    faces, widths = [], []
    for index in range(16):
        row, column = 9 + index // 8, index % 8
        x, y = column * CELL_WIDTH, row * CELL_HEIGHT
        cell = image.crop((x, y, x + CELL_WIDTH, y + CELL_HEIGHT))
        box = cell.getchannel("A").getbbox()
        if box is None:
            return None
        faces.append(face_pixels(cell))
        widths.append(box[2] - box[0])
    top = max(faces) or 1
    spread = (max(faces) - min(faces)) / top
    return {
        "faces": faces,
        "widths": widths,
        "faceSpread": round(spread, 3),
        "widthSpread": round((max(widths) - min(widths)) / (max(widths) or 1), 3),
    }


def audit_image(image: Image.Image, file_size: int = 0) -> dict:
    report = {
        "size": list(image.size), "format": image.format,
        "problems": [], "notes": [], "rows": [],
    }
    problems = report["problems"]
    if image.format not in ("WEBP", "PNG"):
        problems.append(f"format is {image.format!r}, expected WEBP or PNG")
    if getattr(image, "is_animated", False):
        problems.append("the atlas must be a still image, not an animated image")
    if file_size > MAX_BYTES:
        problems.append("file exceeds 20 MiB")
    if "A" not in image.getbands() and "transparency" not in image.info:
        problems.append("image has no alpha channel or palette transparency")
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    if alpha.getextrema()[0] != 0:
        problems.append("image has no fully transparent pixels")
    if alpha.getbbox() is None:
        problems.append("image is entirely transparent")
    if image.size != (SHEET_WIDTH, SHEET_HEIGHT):
        problems.append(f"sheet is {image.width}x{image.height}, expected {SHEET_WIDTH}x{SHEET_HEIGHT}")
        # Pillow pads out-of-range crops; do not audit a padded, misleading grid.
        return report

    per_row = {row: [] for row in EXPECTED}
    for row, column, cell in cells(image):
        data = measure(cell)
        if data is not None:
            per_row[row].append({"column": column, **data})

    if bool(per_row[9]) != bool(per_row[10]):
        problems.append("look rows 9 and 10 must both be present or both be empty")

    for row, (name, expected) in EXPECTED.items():
        found = per_row[row]
        entry = {"row": row, "name": name, "frames": len(found),
                 "expected": list(expected), "cells": found, "issues": []}
        report["rows"].append(entry)

        def fail(message):
            message = f"row {row} ({name}): {message}"
            problems.append(message)
            entry["issues"].append(message)

        if len(found) not in expected:
            fail(f"has {len(found)} painted cells, expected {' or '.join(map(str, expected))}")
        if [item["column"] for item in found] != list(range(len(found))):
            fail("painted cells must start at column 0 with empty cells only at the end")
        if not found:
            continue
        median = statistics.median(item["height"] for item in found)
        entry.update({
            "medianHeight": median,
            "medianWidth": statistics.median(item["width"] for item in found),
            "boundsBottom": statistics.median(item["bottom"] for item in found),
        })
        # Jump anticipation/apex can legitimately change occupied height. Runs
        # also need room for passing/flight poses; standing loops are tighter.
        if row != 4:
            tolerance = RUN_HEIGHT_TOLERANCE if row in RUN_ROWS else HEIGHT_TOLERANCE
            for item in found:
                deviation = abs(item["height"] - median) / median
                if deviation > tolerance:
                    fail(f"column {item['column']} occupied height {item['height']} differs "
                         f"{deviation:.1%} from row median {median:g} (limit {tolerance:.0%})")
        if row in GROUNDED_ROWS:
            for item in found:
                if abs(item["bottom"] - BASELINE) > BASELINE_TOLERANCE:
                    fail(f"column {item['column']} occupied bottom y={item['bottom']}, "
                         f"expected {BASELINE} +/- {BASELINE_TOLERANCE}")
        for item in found:
            if item["left"] == 0 or item["right"] == CELL_WIDTH or item["top"] == 0 or item["bottom"] == CELL_HEIGHT:
                fail(f"column {item['column']} touches a cell edge; check clipping or spill")

    report["notes"].append(
        "Bounds include the staff and hair. Review body proportions, actual shoe contact, "
        "pose continuity, handedness, gaze directions and loop seams visually."
    )
    if not per_row[9] and not per_row[10]:
        report["notes"].append("Look poses are omitted; consumers must keep pointer look disabled.")
    else:
        turntable = look_turntable(image)
        if turntable is not None:
            report["look"] = turntable
            if turntable["faceSpread"] < 0.45:
                report["notes"].append(
                    "Look rows 9-10 barely change the visible face "
                    f"(spread {turntable['faceSpread']:.0%}): they read as 16 near-identical front "
                    "views, so pointer look looks like a twitch instead of a turn. Redraw them as a "
                    "real turntable (see docs/atlas-brief.md)."
                )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheet", nargs="?", default="spritesheet.webp", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        with Image.open(args.sheet) as image:
            report = audit_image(image, args.sheet.stat().st_size)
    except (OSError, ValueError) as error:
        report = {"problems": [str(error)], "notes": [], "rows": []}
    report["sheet"] = str(args.sheet)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"sheet   {args.sheet}  {report.get('size', 'unreadable')}")
        print("All coordinates are zero based; bounds include staff and hair; bottom is exclusive.")
        print(f"{'row':>3}  {'animation':<16} {'frames':>8} {'height':>7} {'width':>6} {'bottom':>7}")
        for entry in report["rows"]:
            expected = '|'.join(map(str, entry['expected']))
            print(f"{entry['row']:>3}  {entry['name']:<16} {entry['frames']:>2}/{expected:<5} "
                  f"{entry.get('medianHeight', 0):>7g} {entry.get('medianWidth', 0):>6g} "
                  f"{entry.get('boundsBottom', 0):>7g}")
        look = report.get("look")
        if look:
            print(f"{'look':>3}  {'directions':<16} {len(look['faces']):>2}/16    "
                  f"face spread {look['faceSpread']:>5.0%}  width spread {look['widthSpread']:>5.0%}")
        for note in report["notes"]:
            print(f"note   {note}")
        for problem in report["problems"]:
            print(f"FAIL   {problem}")
        if not report["problems"]:
            print("OK     structural checks passed; visual animation review is still required")
    return 1 if report["problems"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
