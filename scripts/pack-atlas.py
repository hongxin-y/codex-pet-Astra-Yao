#!/usr/bin/env python3
"""Losslessly pack reviewed 192x208 cells. Never crop, scale, or recenter art."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
COUNTS = (6, 8, 8, 4, 5, 8, 6, 6, 6, 8, 8)


def pack(source, output):
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['schema'] != 2 or manifest['cell'] != [192, 208] or manifest['size'] != [1536, 2288]:
        raise ValueError('Unsupported atlas manifest geometry')
    if len(manifest['rows']) != len(COUNTS):
        raise ValueError('Expected eleven reviewed rows')
    atlas = Image.new('RGBA', (1536, 2288))
    for index, (record, count) in enumerate(zip(manifest['rows'], COUNTS)):
        if record['row'] != index or record['frames'] != count:
            raise ValueError(f'Unexpected row order/frame count at row {index}')
        path = (source / record['file']).resolve()
        path.relative_to(source.resolve())
        if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
            raise ValueError(f'Row {index} changed since review; review it and update its manifest')
        with Image.open(path) as opened:
            if opened.mode != 'RGBA' or opened.size != (1536, 208):
                raise ValueError(f'Row {index} must already be 1536x208 RGBA')
            row = opened.copy()
        for column in range(8):
            occupied = row.getchannel('A').crop((column * 192, 0, (column + 1) * 192, 208)).getbbox()
            if bool(occupied) != (column < count):
                raise ValueError(f'Wrong occupancy in row {index}, column {column}')
        # Unmasked paste is a byte copy. Alpha compositing would alter soft edges.
        atlas.paste(row, (0, index * 208))
    raw = atlas.tobytes()
    if hashlib.sha256(raw).hexdigest() != manifest['rgbaSha256']:
        raise ValueError('Assembled pixels differ from the reviewed atlas')
    if any(raw[i + 3] == 0 and any(raw[i:i + 3]) for i in range(0, len(raw), 4)):
        raise ValueError('Hidden RGB residue in transparent source pixels')
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix='.atlas-', suffix='.webp', dir=output.parent)
    os.close(descriptor)
    candidate = Path(name)
    try:
        atlas.save(candidate, format='WEBP', lossless=True, exact=True, method=6)
        if not 0 < candidate.stat().st_size <= 20 * 1024 * 1024:
            raise ValueError('Encoded atlas exceeds the 20 MiB limit')
        with Image.open(candidate) as decoded:
            if decoded.convert('RGBA').tobytes() != raw:
                raise ValueError('WebP round trip changed reviewed RGBA pixels')
        os.replace(candidate, output)
    finally:
        candidate.unlink(missing_ok=True)
    print(f'Packed 73 reviewed frames, no geometric transforms: {output} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'assets/atlas-source/coherent')
    parser.add_argument('--output', type=Path, default=ROOT / 'spritesheet.webp')
    args = parser.parse_args()
    pack(args.source, args.output)
