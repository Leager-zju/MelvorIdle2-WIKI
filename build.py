"""Build the self-contained static wiki (index.html + assets/) from extracted game data."""
import ast
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOGO = 'res://Assets/Logos/Mi2_logo_horizontal_white_w800.png'
FAVICON = 'res://Assets/Logo_V3_64.png'


def game_version():
    match = re.search(rb'application/config/version.{0,16}?(\d+(?:\.\d+)+)', (ROOT/'unpacked/project.binary').read_bytes(), re.S)
    assert match, 'game version not found in project.binary'
    return match[1].decode()


def load_icons(game):
    icons = {}
    (ROOT/'assets').mkdir(exist_ok=True)
    paths = {o.get(k) for objects in game['Objects'].values() for o in objects
             for k in ('Icon', 'Media', 'Sprite') if isinstance(o.get(k), str)} | {LOGO, FAVICON}
    for path in sorted(paths):
        if not path.startswith('res://'):
            continue
        source = ROOT/'unpacked'/path[6:]
        if not source.resolve().is_relative_to((ROOT/'unpacked').resolve()):
            raise ValueError(path)
        imported = Path(str(source)+'.import')
        if not imported.exists():
            continue
        match = re.search(r'^path="res://([^"]+)"', imported.read_text('utf-8'), re.M)
        if not match:
            continue
        texture = (ROOT/'unpacked'/match[1]).resolve()
        assert texture.is_relative_to((ROOT/'unpacked').resolve())
        content = texture.read_bytes()
        if content[:4] != b'GST2' or len(content) < 56:
            continue
        version, = struct.unpack_from('<I', content, 4)
        fmt, = struct.unpack_from('<I', content, 36)
        if version != 1 or fmt not in (1, 2):
            continue
        size, = struct.unpack_from('<I', content, 52)
        image = content[56:56+size]
        assert len(image) == size
        assert image.startswith(b'\x89PNG') if fmt == 1 else image[:4] == b'RIFF' and image[8:12] == b'WEBP'
        filename = hashlib.sha256(image).hexdigest()[:24]+('.png' if fmt == 1 else '.webp')
        (ROOT/'assets'/filename).write_bytes(image)
        icons[path] = 'assets/'+filename
    assert 'res://Assets/Items/StoneSword.png' in icons
    return icons


def parse_po(text):
    result = {}
    entry = {}
    field = None

    def flush():
        if entry.get('msgid') and entry.get('msgstr') and not entry.get('fuzzy'):
            result[(entry.get('msgctxt', ''), entry['msgid'])] = entry['msgstr']

    for line in (text + '\n\n').splitlines():
        line = line.strip()
        if not line:
            flush()
            entry = {}
            field = None
        elif line.startswith('#,') and 'fuzzy' in line:
            entry['fuzzy'] = True
        elif line.startswith(('msgctxt ', 'msgid ', 'msgstr ', 'msgstr[0] ')):
            field, value = line.split(' ', 1)
            field = 'msgstr' if field == 'msgstr[0]' else field
            entry[field] = ast.literal_eval(value)
        elif line.startswith('"') and field:
            entry[field] += ast.literal_eval(line)
        elif not line.startswith('#'):
            field = None
    return result


def build():
    game = json.loads((ROOT/'unpacked/Data/Packages/MelvorBase.json').read_text('utf-8-sig'))
    translations = parse_po((ROOT/'unpacked/Locale/zh_CN.po').read_text('utf-8-sig'))
    assert translations[('', 'Local Save')] == '\u672c\u5730\u5b58\u6863'
    # Keep context-specific translations separate; ambiguous text falls back to English.
    plain = {key: value for (context, key), value in translations.items() if not context}
    contextual = {context+'\x04'+key: value for (context, key), value in translations.items() if context}
    report = json.loads((ROOT/'extraction-report.json').read_text())
    icons = load_icons(game)
    assert LOGO in icons and FAVICON in icons
    payload = {'game': game, 'translations': plain, 'contextual': contextual, 'report': report, 'icons': icons, 'version': game_version()}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    template = (ROOT/'template.html').read_text('utf-8')
    template = template.replace('__STYLE__', (ROOT/'style.css').read_text('utf-8'))
    template = template.replace('__LOGO__', icons[LOGO]).replace('__FAVICON__', icons[FAVICON])
    template = template.replace('__APP__', '\n'.join((ROOT/name).read_text('utf-8') for name in ('app.js', 'player-format.js', 'features.js', 'wiki-ui.js', 'contents.js')))
    assert template.count('__DATA__') == 1
    output = template.replace('__DATA__', encoded)
    (ROOT/'index.html').write_text(output, encoding='utf-8')
    print(f'Built {sum(map(len, game["Objects"].values()))} entries; {len(translations)} translations; {len(icons)} icons; {len(output.encode())} bytes')


if __name__ == '__main__':
    assert parse_po('msgid "Hello"\n" world"\nmsgstr "Hi"\n\n') == {('', 'Hello world'): 'Hi'}
    assert parse_po('#, fuzzy\nmsgid "A"\nmsgstr "B"\n') == {}
    assert parse_po('msgctxt "C"\nmsgid "A"\nmsgstr "B"\n') == {('C', 'A'): 'B'}
    build()
