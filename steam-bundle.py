"""Build an offline Wiki ZIP from an installed game. Only the ZIP is transported."""
import sys
from pathlib import Path

from build import build
from extract import extract
from publish import pack_offline, verify_site


if __name__ == '__main__':
    game, stage = map(Path, sys.argv[1:])
    report = stage/'extraction-report.json'
    output = stage/'site'
    output.mkdir()
    extract(game, stage/'unpacked', report)
    build(stage/'unpacked', output, report)
    verify_site(output)
    pack_offline(output, stage/'offline.zip')
