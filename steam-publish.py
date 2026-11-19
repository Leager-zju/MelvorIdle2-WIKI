"""Run on the logged-in Windows Steam computer after pushes to main."""
import argparse
import contextlib
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent
REPO = 'Leager-zju/MelvorIdle2-WIKI'
API = 'https://api.github.com/repos/'+REPO
DRAFT = 'wiki-windows-staging'
APP_ID = '3218350'
STATE = ROOT/'.wiki-steam'
os.environ.update(GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='never')


def run(*args, input=None, timeout=240):
    return subprocess.run(args, input=input, capture_output=True, text=True, check=True,
                          cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW, timeout=timeout)


def github_token():
    credential = run('git', '-c', 'credential.interactive=never', 'credential', 'fill',
                     input=f'protocol=https\nhost=github.com\npath={REPO}.git\n\n').stdout
    return next(line.removeprefix('password=') for line in credential.splitlines() if line.startswith('password='))


def request(url, token=None, method='GET', data=None, media='application/json'):
    req = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': media,
                                  'Accept': 'application/vnd.github+json', 'User-Agent': 'MelvorIdle2-Wiki'})
    if token:
        req.add_unredirected_header('Authorization', 'Bearer '+token)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'{method} {urllib.parse.urlsplit(url).path}: HTTP {error.code}') from None


def installed_build(manifest):
    fields = dict(re.findall(r'^\s*"(appid|buildid|StateFlags|TargetBuildID)"\s*"([0-9]+)"',
                             manifest.read_text(encoding='utf-8'), re.M))
    if fields.get('appid') != APP_ID:
        raise ValueError('Unexpected Steam app manifest')
    build = fields['buildid']
    return build, fields.get('StateFlags') == '4' and fields.get('TargetBuildID', build) in ('0', build)


def latest_build():
    info = request('https://api.steamcmd.net/v1/info/'+APP_ID)
    build = info['data'][APP_ID]['depots']['branches']['public']['buildid']
    if not re.fullmatch(r'[1-9][0-9]*', build):
        raise ValueError('Invalid Steam public Build ID')
    return build


def process_running(name):
    return f'"{name}"'.lower() in run('tasklist', '/FI', f'IMAGENAME eq {name}', '/FO', 'CSV', '/NH').stdout.lower()


def save_state(state):
    temp = STATE/'state.tmp'
    temp.write_text(json.dumps(state), encoding='utf-8')
    temp.replace(STATE/'state.json')


def main(steam, game, check_only):
    token = github_token()
    sha = request(API+'/git/ref/heads/main', token)['object']['sha']
    manifest = game.parent.parent.parent/f'appmanifest_{APP_ID}.acf'
    if check_only:
        print('main:', sha, 'installed:', installed_build(manifest), 'public:', latest_build(),
              'Steam:', process_running('steam.exe'), 'game:', process_running(game.name), flush=True)
        return

    STATE.mkdir(exist_ok=True)
    path = STATE/'state.json'
    state = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    if state.get('published') == sha:
        return
    pending = state.get('pending')
    if pending and pending['sha'] == sha:
        runs = request(API+f'/actions/workflows/pages.yml/runs?head_sha={sha}&event=workflow_dispatch', token)['workflow_runs']
        match = next((job for job in runs if job['head_branch'] == 'main'
                      and job['display_title'] == f"Pages package {pending['asset']}"), None)
        if match and match['conclusion'] == 'success':
            save_state({'published': sha, 'build': pending['build']})
            print('Published', sha, 'Steam Build', pending['build'], flush=True)
            release = request(API+f"/releases/{pending['release']}", token)
            if release['draft'] and release['tag_name'] == DRAFT:
                for asset in release['assets']:
                    if re.fullmatch(r'wiki-[0-9a-f]{40}\.zip', asset['name']):
                        request(API+f"/releases/assets/{asset['id']}", token, 'DELETE')
            return
        if (match and match['status'] != 'completed') or time.time() - pending['time'] < 300:
            return
    if state.get('attempt') == sha and time.time() - state.get('time', 0) < 240:
        return
    state.update(attempt=sha, time=time.time())
    save_state(state)

    target = latest_build()
    installed, ready = installed_build(manifest)
    print('main:', sha, 'Steam installed:', installed, 'public:', target, flush=True)
    if installed != target:
        if int(installed) > int(target):
            raise RuntimeError('Steam public metadata is older than the installed build')
        if process_running(game.name) or not process_running('steam.exe'):
            print('Waiting for the game to exit and Steam to be running', flush=True)
            return
        if state.get('steam_requested') == target and time.time() - state.get('steam_time', 0) < 1800:
            print('Waiting for the Steam update already requested', flush=True)
            return
        subprocess.Popen([str(steam), '-silent', f'steam://validate/{APP_ID}'],
                         creationflags=subprocess.CREATE_NO_WINDOW)
        state.update(steam_requested=target, steam_time=time.time())
        save_state(state)
        print('Requested Steam to verify and update the installation', flush=True)
        return
    if not ready:
        print('Waiting for Steam to complete game installation', flush=True)
        return

    with TemporaryDirectory(dir=STATE) as temporary:
        stage = Path(temporary)
        run('git', '-c', 'http.sslBackend=openssl', 'fetch', '--no-tags', 'origin', sha)
        source_zip = stage/'source.zip'
        run('git', 'archive', '--format=zip', '--output='+str(source_zip), sha)
        source = stage/'source'
        with ZipFile(source_zip) as archive:
            archive.extractall(source)
        result = run(str(Path(sys.executable).with_name('python.exe')), str(source/'steam-bundle.py'),
                     str(game), str(stage), target, str(STATE/'snapshot.zip'), timeout=420)
        print(result.stdout.strip(), flush=True)
        if installed_build(manifest) != (target, True) or latest_build() != target:
            raise RuntimeError('Steam Build ID changed during the build')
        if request(API+'/git/ref/heads/main', token)['object']['sha'] != sha:
            print('main advanced during the build', flush=True)
            return
        asset, release = upload_package(token, sha, stage/'offline.zip')
        inputs = dict(source_sha=sha, asset_id=str(asset['id']), digest=asset['digest'], build_id=target)
        payload = json.dumps({'ref': 'main', 'inputs': inputs}).encode()
        request(API+'/actions/workflows/pages.yml/dispatches', token, 'POST', payload)
        state['pending'] = {'sha': sha, 'asset': asset['id'], 'release': release, 'build': target, 'time': time.time()}
        save_state(state)
        print('Dispatched verified package', asset['id'], 'for', sha, flush=True)


def upload_package(token, sha, package):
    releases = request(API+'/releases?per_page=100', token)
    release = next((release for release in releases if release['tag_name'] == DRAFT), None)
    if not release:
        data = json.dumps({'tag_name': DRAFT, 'name': 'Windows Pages staging', 'draft': True}).encode()
        release = request(API+'/releases', token, 'POST', data)
    if not release['draft']:
        raise RuntimeError('The Pages staging release must be a draft')
    name = f'wiki-{sha}.zip'
    for asset in release['assets']:
        if asset['name'] == name:
            request(API+f"/releases/assets/{asset['id']}", token, 'DELETE')
    upload = release['upload_url'].partition('{')[0]+'?'+urllib.parse.urlencode({'name': name})
    data = package.read_bytes()
    asset = request(upload, token, 'POST', data, 'application/zip')
    if asset['digest'] != 'sha256:'+hashlib.sha256(data).hexdigest():
        raise RuntimeError('The uploaded ZIP does not match the locally verified ZIP')
    return asset, release['id']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--steam', type=Path, required=True)
    parser.add_argument('--game', type=Path, default=ROOT.parent/'Melvor2.exe')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--log', action='store_true', help='write a rolling local log for Task Scheduler')
    args = parser.parse_args()
    if args.log:
        from io import StringIO
        output = StringIO()
        status = 0
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            try:
                main(args.steam.resolve(strict=True), args.game.resolve(strict=True), args.check)
            except Exception:
                traceback.print_exc()
                status = 1
        if output.getvalue():
            STATE.mkdir(exist_ok=True)
            log = STATE/'updater.log'
            if log.exists() and log.stat().st_size >= 256_000:
                log.replace(STATE/'updater.previous.log')
            with log.open('a', encoding='utf-8') as file:
                file.write(time.strftime('%Y-%m-%d %H:%M:%S\n')+output.getvalue()+'\n')
        raise SystemExit(status)
    main(args.steam.resolve(strict=True), args.game.resolve(strict=True), args.check)
