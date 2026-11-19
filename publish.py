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

    verify_site(output)
    pack_offline(output, output/'melvor-idle-2-wiki.zip')
    copy_site_metadata(output)


def verify_site(output):
    subprocess.run(['node', str(ROOT/'verify.cjs'), str(output)], check=True,
                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    (output/'verification-report.json').unlink()


def pack_offline(output, package):
    with ZipFile(package, 'w', ZIP_DEFLATED) as archive:
        archive.write(output/'index.html', 'index.html')
        for image in sorted((output/'assets').iterdir()):
            archive.write(image, f'assets/{image.name}')


def copy_site_metadata(output):
    for name in ('.nojekyll', 'sitemap.xml', '344b3445630b79ecf9033adc03853a5f.txt'):
        shutil.copyfile(ROOT/name, output/name)


def use_offline_package(package, output):
    output.mkdir()
    names = set()
    with ZipFile(package) as archive:
        for name in archive.namelist():
            icon = re.fullmatch(r'assets/([0-9a-f]{24})\.(webp|png)', name)
            if name in names or (name != 'index.html' and not icon):
                raise ValueError(f'Unexpected offline ZIP member: {name}')
            names.add(name)
            data = archive.read(name)
            if icon and hashlib.sha256(data).hexdigest()[:24] != icon[1]:
                raise ValueError(f'Icon hash mismatch: {name}')
            target = output/name
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(data)
    verify_site(output)
    shutil.copyfile(package, output/'melvor-idle-2-wiki.zip')
    copy_site_metadata(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path, help='new directory for verified Pages files')
    parser.add_argument('--offline-zip', action='store_true', help='read a completed offline ZIP from the Windows updater')
    args = parser.parse_args()
    (use_offline_package if args.offline_zip else publish)(args.snapshot, args.output)
