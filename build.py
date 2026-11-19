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


def game_version(unpacked):
    match = re.search(rb'application/config/version.{0,16}?(\d+(?:\.\d+)+)', (unpacked/'project.binary').read_bytes(), re.S)
    assert match, 'game version not found in project.binary'
    return match[1].decode()


def load_icons(game, unpacked, assets):
    icons = {}
    assets.mkdir(exist_ok=True)
    unpacked = unpacked.resolve()
    paths = {o.get(k) for objects in game['Objects'].values() for o in objects
             for k in ('Icon', 'Media', 'Sprite') if isinstance(o.get(k), str)} | {LOGO, FAVICON}
    for path in sorted(paths):
        if not path.startswith('res://'):
            continue
        source = unpacked/path[6:]
        if not source.resolve().is_relative_to(unpacked):
            raise ValueError(path)
        imported = Path(str(source)+'.import')
        if not imported.exists():
            continue
        match = re.search(r'^path="res://([^"]+)"', imported.read_text('utf-8'), re.M)
        if not match:
            continue
        texture = (unpacked/match[1]).resolve()
        assert texture.is_relative_to(unpacked)
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
        (assets/filename).write_bytes(image)
        icons[path] = 'assets/'+filename
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


def build(unpacked=ROOT/'unpacked', output_dir=ROOT, report_path=ROOT/'extraction-report.json'):
    game = json.loads((unpacked/'Data/Packages/MelvorBase.json').read_text('utf-8-sig'))
    # The shop hides the bonfire unlock until Firemaking level 121 in this game version.
    game['Objects'].pop('FiremakingBonfire', None)
    game['Objects']['ShopPurchase'] = [o for o in game['Objects']['ShopPurchase'] if o['Id'] != 'UnlockBonfire']
    shop = game['EntityConfig']['MelvorBase:Shop']
    shop['Purchases'] = [r for r in shop['Purchases'] if r['Id'] != 'MelvorBase:UnlockBonfire']
    firemaking = game['EntityConfig']['MelvorBase:Firemaking']
    firemaking.pop('Bonfires', None)
    firemaking['ValueStatistics'] = [r for r in firemaking['ValueStatistics'] if not r['Id'].startswith('MelvorBase:FiremakingBonfire')]
    translations = parse_po((unpacked/'Locale/zh_CN.po').read_text('utf-8-sig'))
    assert translations, 'no Chinese translations found'
    # Keep context-specific translations separate; ambiguous text falls back to English.
    plain = {key: value for (context, key), value in translations.items() if not context}
    contextual = {context+'\x04'+key: value for (context, key), value in translations.items() if context}
    report = json.loads(report_path.read_text(encoding='utf-8'))
    icons = load_icons(game, unpacked, output_dir/'assets')
    assert LOGO in icons and FAVICON in icons
    version = game_version(unpacked)
    payload = {'game': game, 'translations': plain, 'contextual': contextual, 'report': report, 'icons': icons, 'version': version}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    template = (ROOT/'template.html').read_text('utf-8')
    template = template.replace('__STYLE__', (ROOT/'style.css').read_text('utf-8'))
    template = template.replace('__LOGO__', icons[LOGO]).replace('__FAVICON__', icons[FAVICON])
    brotli = (ROOT/'vendor/brotli/decode.js').read_text('utf-8')
    assert brotli.count('export let BrotliDecode') == 1, 'unexpected vendored Brotli decoder'
    brotli = brotli.replace('export let BrotliDecode', 'const BrotliDecode')
    scripts = [brotli] + [(ROOT/name).read_text('utf-8') for name in ('app.js', 'player-format.js', 'features.js', 'save.js', 'combat-simulator.js', 'wiki-ui.js', 'contents.js')]
    template = template.replace('__APP__', '\n'.join(scripts))
    assert template.count('__DATA__') == 1
    output = template.replace('__DATA__', encoded)
    (output_dir/'index.html').write_text(output, encoding='utf-8')
    print(f'Built {sum(map(len, game["Objects"].values()))} entries; {len(translations)} translations; {len(icons)} icons; {len(output.encode())} bytes', flush=True)
    return version


if __name__ == '__main__':
    assert parse_po('msgid "Hello"\n" world"\nmsgstr "Hi"\n\n') == {('', 'Hello world'): 'Hi'}
    assert parse_po('#, fuzzy\nmsgid "A"\nmsgstr "B"\n') == {}
    assert parse_po('msgctxt "C"\nmsgid "A"\nmsgstr "B"\n') == {('C', 'A'): 'B'}
    build()
