"""Guard against the previous packer's silent artwork changes."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pack_atlas',ROOT/'scripts/pack-atlas.py')
packer=importlib.util.module_from_spec(spec);spec.loader.exec_module(packer)


class PackingTests(unittest.TestCase):
    def test_pack_preserves_reviewed_rgba_including_soft_edges(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'sheet.webp'
            packer.pack(ROOT/'assets/atlas-source/coherent',output)
            with Image.open(output) as actual,Image.open(ROOT/'spritesheet.webp') as reviewed:
                self.assertEqual(actual.convert('RGBA').tobytes(),reviewed.convert('RGBA').tobytes())

    def test_unreviewed_art_does_not_replace_existing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'source';source.mkdir()
            canonical=ROOT/'assets/atlas-source/coherent'
            shutil.copyfile(canonical/'manifest.json',source/'manifest.json')
            shutil.copytree(canonical/'rows',source/'rows')
            row=source/json.loads((source/'manifest.json').read_text())['rows'][0]['file']
            with Image.open(row) as image:
                image.putpixel((96,100),(255,0,255,255));image.save(row)
            output=Path(directory)/'existing.webp';output.write_bytes(b'keep existing')
            with self.assertRaisesRegex(ValueError,'changed since review'):
                packer.pack(source,output)
            self.assertEqual(output.read_bytes(),b'keep existing')

    def test_encode_failure_keeps_existing_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'existing.webp';output.write_bytes(b'keep existing')
            with patch.object(Image.Image,'save',side_effect=OSError('encoder failed')):
                with self.assertRaises(OSError):
                    packer.pack(ROOT/'assets/atlas-source/coherent',output)
            self.assertEqual(output.read_bytes(),b'keep existing')
            self.assertEqual(list(Path(directory).glob('.atlas-*')),[])


if __name__=='__main__':unittest.main()
