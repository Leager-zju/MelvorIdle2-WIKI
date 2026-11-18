"""Extract this installation's unencrypted Godot PCK. Original files stay read-only.
Format reference: https://github.com/godotengine/godot/blob/master/core/io/file_access_pack.cpp
"""
from pathlib import Path
import collections
import hashlib
import json
import mmap
import struct

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'unpacked'

def safe_target(name, output=OUT):
    name = name.removeprefix('res://')
    target = (output / name).resolve()
    if not target.is_relative_to(output.resolve()) or ':' in name or '\\' in name:
        raise ValueError(f'Unsafe resource path: {name!r}')
    return target

def extract(exe=ROOT.parent/'Melvor2.exe', output=OUT, report_path=ROOT/'extraction-report.json'):
    with exe.open('rb') as f:
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as data:
            pe = struct.unpack_from('<I', data, 0x3c)[0]
            assert data[pe:pe+4] == b'PE\0\0'
            sections = struct.unpack_from('<H', data, pe+6)[0]
            optional_size = struct.unpack_from('<H', data, pe+20)[0]
            section_start = pe + 24 + optional_size
            starts = []
            for i in range(sections):
                pos = section_start + i*40
                if data[pos:pos+8].rstrip(b'\0') == b'pck':
                    starts.append(struct.unpack_from('<I', data, pos+20)[0])
            assert len(starts) == 1, 'Expected one embedded PCK section'
            start = next(p for p in range(starts[0], starts[0]+8) if data[p:p+4] == b'GDPC')
            version,major,minor,patch,flags = struct.unpack_from('<5I',data,start+4)
            assert version in (3,4) and flags == 2, 'Unsupported or encrypted pack'
            base,index = struct.unpack_from('<QQ',data,start+24)
            pos = start + index
            count = struct.unpack_from('<I',data,pos)[0]; pos += 4
            assert 0 < count < 1000000
            entries=[]; seen=set()
            for _ in range(count):
                length = struct.unpack_from('<I',data,pos)[0]; pos += 4
                assert 0 < length < 32768
                name=data[pos:pos+length].decode('utf-8').rstrip('\0'); pos+=length
                offset,size=struct.unpack_from('<QQ',data,pos); pos+=16
                digest=bytes(data[pos:pos+16]); pos+=16
                entry_flags=struct.unpack_from('<I',data,pos)[0];pos+=4
                assert entry_flags == 0, f'Unsupported flags: {name}'
                target=safe_target(name, output)
                key=str(target).casefold();assert key not in seen, name;seen.add(key)
                offset += start + base
                assert start <= offset <= offset+size <= len(data), name
                entries.append((name,target,offset,size,digest))
            for name,target,offset,size,digest in entries:
                content=data[offset:offset+size]
                assert hashlib.md5(content).digest() == digest, f'MD5 mismatch: {name}'
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(content)
            report={'engine':f'{major}.{minor}.{patch}','pck_version':version,'files':count,
                    'bytes':sum(e[3] for e in entries),'md5_verified':count,
                    'source_sha256':hashlib.sha256(data).hexdigest(),
                    'extensions':dict(collections.Counter(Path(e[0]).suffix for e in entries))}
            report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
            return report

if __name__ == '__main__':
    for bad in ('../escape','/escape','C:/escape','..\\escape'):
        try: safe_target(bad)
        except ValueError: pass
        else: raise AssertionError(bad)
    print(json.dumps(extract(), indent=2))
