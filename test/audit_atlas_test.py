"""Regression cases for structural audit mistakes; no claims about drawn poses."""

import importlib.util
from io import BytesIO
from pathlib import Path
import sys
import unittest

from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "audit_atlas", Path(__file__).resolve().parents[1] / "scripts" / "audit-atlas.py"
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def fixture(idle_frames=6, look=True):
    image = Image.new("RGBA", (1536, 2288))
    draw = ImageDraw.Draw(image)
    counts = [idle_frames, 8, 8, 4, 5, 8, 6, 6, 6, 8 if look else 0, 8 if look else 0]
    for row, count in enumerate(counts):
        for column in range(count):
            x, y = column * 192, row * 208
            draw.rectangle((x + 40, y + 5, x + 150, y + 202), fill=(30, 90, 80, 255))
    image.format = "PNG"
    return image


def clear_cell(image, row, column):
    image.paste((0, 0, 0, 0), (column * 192, row * 208, (column + 1) * 192, (row + 1) * 208))


class AuditTests(unittest.TestCase):
    def test_six_or_seven_idle_frames(self):
        for count in (6, 7):
            self.assertEqual(audit.audit_image(fixture(count))["problems"], [])

    def test_hole_fails_even_when_count_is_correct(self):
        image = fixture()
        clear_cell(image, 0, 2)
        image.paste(image.crop((0, 0, 192, 208)), (6 * 192, 0))
        self.assertTrue(any("only at the end" in issue for issue in audit.audit_image(image)["problems"]))

    def test_lying_frame_is_never_exempt(self):
        image = fixture()
        clear_cell(image, 5, 5)
        ImageDraw.Draw(image).rectangle((5 * 192 + 5, 5 * 208 + 62, 5 * 192 + 186, 5 * 208 + 144), fill="red")
        issues = audit.audit_image(image)["problems"]
        self.assertTrue(any("column 5 occupied height" in issue for issue in issues))
        self.assertTrue(any("column 5 occupied bottom" in issue for issue in issues))

    def test_baseline_is_absolute_not_taken_from_bad_idle(self):
        source = fixture()
        image = Image.new("RGBA", source.size)
        for row in range(11):
            band = source.crop((0, row * 208, 1536, (row + 1) * 208))
            image.paste(band, (0, row * 208 - 6))
        image.format = "PNG"
        self.assertTrue(any("expected 203" in issue for issue in audit.audit_image(image)["problems"]))

    def test_jumping_height_and_ground_contact_can_change(self):
        image = fixture()
        clear_cell(image, 4, 2)
        ImageDraw.Draw(image).rectangle((2 * 192 + 40, 4 * 208 + 5, 2 * 192 + 150, 4 * 208 + 170), fill="red")
        self.assertEqual(audit.audit_image(image)["problems"], [])

    def test_optional_look_requires_complete_pair(self):
        self.assertEqual(audit.audit_image(fixture(look=False))["problems"], [])
        image = fixture(look=False)
        image.paste(image.crop((0, 208, 1536, 416)), (0, 9 * 208))
        self.assertTrue(any("both be present" in issue for issue in audit.audit_image(image)["problems"]))

    def test_rgb_conversion_does_not_manufacture_valid_alpha(self):
        image = fixture().convert("RGB")
        image.format = "PNG"
        issues = audit.audit_image(image)["problems"]
        self.assertTrue(any("no alpha" in issue for issue in issues))
        self.assertTrue(any("no fully transparent" in issue for issue in issues))

    def test_palette_transparency_is_valid(self):
        image = fixture().convert("P", palette=Image.Palette.ADAPTIVE, colors=16)
        data = BytesIO()
        image.save(data, format="PNG", transparency=0)
        data.seek(0)
        with Image.open(data) as saved:
            self.assertEqual(audit.audit_image(saved)["problems"], [])

    def test_wrong_size_does_not_pad_and_audit_cells(self):
        image = Image.new("RGBA", (192, 208))
        image.format = "PNG"
        result = audit.audit_image(image)
        self.assertEqual(result["rows"], [])
        self.assertTrue(any("expected 1536x2288" in issue for issue in result["problems"]))

    def test_format_size_and_cell_edge_checks(self):
        image = fixture()
        image.format = "JPEG"
        ImageDraw.Draw(image).point((0, 20), fill="red")
        issues = audit.audit_image(image, audit.MAX_BYTES + 1)["problems"]
        self.assertTrue(any("expected WEBP or PNG" in issue for issue in issues))
        self.assertTrue(any("20 MiB" in issue for issue in issues))
        self.assertTrue(any("cell edge" in issue for issue in issues))


if __name__ == "__main__":
    unittest.main()
