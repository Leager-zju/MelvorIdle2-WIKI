"""Build, verify and package Pages using the pinned, previously published Wiki."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from build import ROOT, render_site


def publish(snapshot, output):
    markup = (snapshot/'index.html').read_text(encoding='utf-8')
    match = re.search(r'<script id="payload" type="application/json">(.*?)</script>', markup, re.S)
    if not match:
        raise ValueError('Published Wiki payload is missing')
    payload = json.loads(match[1])
    output.mkdir(parents=True)
    (output/'assets').mkdir()
    icons = sorted(set(payload['icons'].values()))
    for icon in icons:
        match = re.fullmatch(r'assets/([0-9a-f]{24})\.(webp|png)', icon)
        if not match:
            raise ValueError(f'Unexpected icon path: {icon}')
        data = (snapshot/icon).read_bytes()
        if hashlib.sha256(data).hexdigest()[:24] != match[1]:
            raise ValueError(f'Icon hash mismatch: {icon}')
        (output/icon).write_bytes(data)
    render_site(payload, output)

    subprocess.run(['node', str(ROOT/'verify.cjs'), str(output)], check=True)
    (output/'verification-report.json').unlink()

    with ZipFile(output/'melvor-idle-2-wiki.zip', 'w', ZIP_DEFLATED) as archive:
        for name in ['index.html', *icons]:
            archive.write(output/name, name)

    for name in ('.nojekyll', 'sitemap.xml', '344b3445630b79ecf9033adc03853a5f.txt'):
        shutil.copyfile(ROOT/name, output/name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path, help='new directory for verified Pages files')
    args = parser.parse_args()
    publish(args.snapshot, args.output)
