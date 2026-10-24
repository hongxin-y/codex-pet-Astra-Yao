#!/usr/bin/env python3
"""Audit a Codex v2 pet spritesheet against the Atlas Astra Yao contract.

Usage:
    python scripts/audit-atlas.py [spritesheet.webp] [--json]

The script only needs Pillow. It prints one line per row (frames, median
character height, baseline, outliers) and a final verdict, so whoever draws the
atlas can see immediately whether a regenerated sheet is consistent. Exit code
is 1 when any hard rule fails, so it can be wired into CI later.

Rules checked
-------------
sheet     1536x2288 px, RGBA webp/png, 8 columns x 11 rows of 192x208.
frames    each row must expose the expected number of non-empty cells.
baseline  for every standing row the character's feet must sit on the same
          pixel row (+/- 2 px) as row 0; row 5 column 5 may lie down.
height    inside a row the alpha bounding-box height must stay within 3 % of
          the row median - this is what "some frames look smaller" means.
head      the alpha mass in the top 90 px of each cell is compared across rows;
          a row whose head mass differs by more than 15 % from row 0 has a
          different head/body ratio, which reads as a different drawing.
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the artist machine may not have Pillow
    sys.exit("Pillow is required: python -m pip install pillow")

CELL_WIDTH = 192
CELL_HEIGHT = 208
COLUMNS = 8
ROWS = 11
SHEET_WIDTH = CELL_WIDTH * COLUMNS
SHEET_HEIGHT = CELL_HEIGHT * ROWS

# row -> (codex name, expected painted cells, may contain a non-standing cell)
EXPECTED = {
    0: ("idle", 7, False),
    1: ("runningRight", 8, False),
    2: ("runningLeft", 8, False),
    3: ("waving", 4, False),
    4: ("jumping", 5, False),
    5: ("failed", 8, True),
    6: ("waiting", 6, False),
    7: ("running", 6, False),
    8: ("review", 6, False),
    9: ("look 000-157.5", 8, False),
    10: ("look 180-337.5", 8, False),
}

HEIGHT_TOLERANCE = 0.03
BASELINE_TOLERANCE = 2
HEAD_MASS_TOLERANCE = 0.15


def cells(image: Image.Image):
    for row in range(ROWS):
        for column in range(COLUMNS):
            box = (column * CELL_WIDTH, row * CELL_HEIGHT, (column + 1) * CELL_WIDTH, (row + 1) * CELL_HEIGHT)
            yield row, column, image.crop(box)


def measure(cell: Image.Image) -> dict | None:
    alpha = cell.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return None
    # Head band: the top 90 px of the cell. The staff shares that band, so the
    # value is only advisory - it is compared row to row, not frame to frame.
    head = alpha.crop((0, 0, CELL_WIDTH, 90))
    head_box = head.getbbox()
    head_mass = 0
    if head_box is not None:
        histogram = head.histogram()
        head_mass = head_mass + sum(histogram[25:])
        head_mass = head_mass * 100 // max(1, head_box[2] * 90)
    return {
        "width": box[2] - box[0],
        "height": box[3] - box[1],
        "top": box[1],
        "bottom": box[3],
        "head_mass": head_mass,
    }


def main() -> int:
    args = [arg for arg in sys.argv[1:] if not arg.startswith("-")]
    as_json = "--json" in sys.argv
    sheet_path = Path(args[0]) if args else Path("spritesheet.webp")
    if not sheet_path.exists():
        sys.exit(f"no such file: {sheet_path}")

    image = Image.open(sheet_path)
    problems: list[str] = []
    notes: list[str] = []

    if image.size != (SHEET_WIDTH, SHEET_HEIGHT):
        problems.append(f"sheet is {image.size[0]}x{image.size[1]}, expected {SHEET_WIDTH}x{SHEET_HEIGHT}")
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    per_row: dict[int, list[dict]] = {}
    for row, column, cell in cells(image):
        data = measure(cell)
        if data is not None:
            data["column"] = column
            per_row.setdefault(row, []).append(data)

    reference = per_row.get(0, [])
    if not reference:
        problems.append("row 0 (idle) is empty")
    baseline = statistics.median(item["bottom"] for item in reference) if reference else None
    head_reference = statistics.median(item["head_mass"] for item in reference) if reference else None

    rows_report = []
    for row, (name, expected, has_lying) in EXPECTED.items():
        found = per_row.get(row, [])
        painted = len(found)
        entry = {"row": row, "name": name, "frames": painted, "expected": expected, "issues": []}

        if painted != expected:
            message = f"row {row} ({name}) has {painted} painted cells, expected {expected}"
            problems.append(message)
            entry["issues"].append(message)

        if found:
            heights = [item["height"] for item in found]
            median = statistics.median(heights)
            bottoms = [item["bottom"] for item in found]
            entry["medianHeight"] = median
            entry["medianWidth"] = statistics.median(item["width"] for item in found)
            entry["baseline"] = statistics.median(bottoms)
            entry["headMass"] = statistics.median(item["head_mass"] for item in found)

            standing = [item for item in found if item["bottom"] >= median - CELL_HEIGHT * 0.1]
            outliers = []
            for item in found:
                deviation = abs(item["height"] - median) / median
                if deviation > HEIGHT_TOLERANCE:
                    if has_lying and item["bottom"] < baseline - 20:
                        notes.append(
                            f"row {row} column {item['column']}: lying pose ({item['height']} px tall), "
                            "the plugin's `columns` list skips it"
                        )
                        continue
                    outliers.append(
                        f"column {item['column']}: {item['height']} px ({deviation * 100:+.1f} % vs row median {median:.0f})"
                    )
            if outliers:
                message = f"row {row} ({name}) has frames with a different height: " + "; ".join(outliers)
                problems.append(message)
                entry["issues"].append(message)

            off_baseline = [
                f"column {item['column']}: feet at y={item['bottom']}"
                for item in standing
                if baseline is not None and abs(item["bottom"] - baseline) > BASELINE_TOLERANCE
            ]
            if off_baseline:
                message = (
                    f"row {row} ({name}) does not stand on the row 0 baseline (y={baseline:.0f}): "
                    + "; ".join(off_baseline)
                )
                problems.append(message)
                entry["issues"].append(message)

            if head_reference is not None and row not in (5,):
                drift = (entry["headMass"] - head_reference) / head_reference
                if abs(drift) > HEAD_MASS_TOLERANCE:
                    # Advisory only: the staff shares the head band, so a raised
                    # staff raises the number without any drawing problem.
                    note = (
                        f"row {row} ({name}) head band mass {entry['headMass']} differs {drift * 100:+.0f} % "
                        f"from row 0 ({head_reference}); compare head/body ratio by eye"
                    )
                    notes.append(note)
                    entry["issues"].append(f"advisory: {note}")

        rows_report.append(entry)

    if as_json:
        print(json.dumps({"sheet": str(sheet_path), "problems": problems, "notes": notes, "rows": rows_report}, indent=2))
        return 1 if problems else 0

    print(f"sheet   {sheet_path}  {image.size[0]}x{image.size[1]}  {SHEET_WIDTH}x{SHEET_HEIGHT} expected")
    print(f"baseline row 0 feet at y={baseline}")
    print()
    print(f"{'row':>3}  {'animation':<16} {'frames':>6}  {'height':>6}  {'width':>5}  {'feet':>4}  {'head':>4}")
    for entry in rows_report:
        print(
            f"{entry['row']:>3}  {entry['name']:<16} {entry['frames']:>2}/{entry['expected']:<3} "
            f"{entry.get('medianHeight', 0):>6.0f}  {entry.get('medianWidth', 0):>5.0f}  "
            f"{entry.get('baseline', 0):>4.0f}  {entry.get('headMass', 0):>4}"
        )

    if notes:
        print()
        for note in notes:
            print(f"note   {note}")
    print()
    if problems:
        for problem in problems:
            print(f"FAIL   {problem}")
        return 1
    print("OK     every row matches the atlas contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
