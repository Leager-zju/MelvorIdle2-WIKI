"""Build an offline Wiki ZIP from an installed game. Only the ZIP is transported."""
import hashlib
import shutil
import sys
from pathlib import Path
from zipfile import BadZipFile

from build import build
from extract import extract
from publish import pack_offline, publish, unpack_offline, verify_site


def bundle(game, stage, build_id, cache):
    key_file = cache.with_suffix('.key')
    packer = Path(__file__).resolve().parent
    fingerprint = hashlib.sha256((packer/'build.py').read_bytes()+(packer/'extract.py').read_bytes()).hexdigest()
    game_info = game.stat()
    key = f'{build_id}:{game_info.st_size}:{game_info.st_mtime_ns}:{fingerprint}'
    report = stage/'extraction-report.json'
    output = stage/'site'
    package = stage/'offline.zip'
    snapshot = stage/'snapshot'
    if key_file.is_file() and cache.is_file() and key_file.read_text(encoding='ascii') == key:
        try:
            unpack_offline(cache, snapshot)
        except (BadZipFile, ValueError):
            print('Rebuilding the local Wiki data cache', flush=True)
        else:
            publish(snapshot, output)
            (output/'melvor-idle-2-wiki.zip').replace(package)
            print('Reused local Wiki data for Steam Build '+build_id, flush=True)
            return

    output.mkdir()
    extract(game, stage/'unpacked', report)
    build(stage/'unpacked', output, report)
    verify_site(output)
    pack_offline(output, package)
    replacement = stage/'cache.zip'
    shutil.copyfile(package, replacement)
    key_file.unlink(missing_ok=True)
    replacement.replace(cache)
    replacement_key = stage/'cache.key'
    replacement_key.write_text(key, encoding='ascii')
    replacement_key.replace(key_file)


if __name__ == '__main__':
    game, stage, build_id, cache = sys.argv[1:]
    bundle(Path(game), Path(stage), build_id, Path(cache))
