"""Rebuild and verify the complete Wiki from an installed Melvor2.exe."""
import argparse
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from build import ROOT, build
from extract import extract


def update(exe, node):
    work = ROOT/'.wiki-update'
    try:
        work.mkdir()
    except FileExistsError:
        raise SystemExit(f'Update directory already exists: {work}. Check for a running update before retrying.') from None
    try:
        with TemporaryDirectory(dir=work) as directory:
            stage = Path(directory)
            report = stage/'extraction-report.json'
            unpacked = stage/'unpacked'
            print(f'Extracting {exe}', flush=True)
            extract(exe, unpacked, report)
            version = build(unpacked, stage, report)
            subprocess.run([node, str(ROOT/'verify.cjs'), str(stage)], check=True)

            assets = ROOT/'assets'
            if assets.resolve() != assets:
                raise ValueError(f'Unexpected assets directory: {assets}')
            assets.mkdir(exist_ok=True)
            # Install content-addressed images before replacing the page that references them.
            for source in (stage/'assets').iterdir():
                target = assets/source.name
                if target.is_symlink() or not target.is_file() or target.read_bytes() != source.read_bytes():
                    source.replace(target)
            for name in ('extraction-report.json', 'verification-report.json', 'index.html'):
                (stage/name).replace(ROOT/name)
            print(f'Wiki updated to v{version}: {ROOT/"index.html"}')
    finally:
        work.rmdir()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exe', nargs='?', type=Path, default=ROOT.parent/'Melvor2.exe',
                        help='path to Melvor2.exe (default: one directory above this script)')
    args = parser.parse_args()
    exe = args.exe.resolve()
    if not exe.is_file():
        parser.error(f'Melvor2.exe not found: {exe}')
    node = shutil.which('node')
    if not node:
        parser.error('Node.js is required to verify the generated site')
    try:
        update(exe, node)
    except subprocess.CalledProcessError as error:
        parser.exit(error.returncode, 'Wiki verification failed. The existing site was kept.\n')
