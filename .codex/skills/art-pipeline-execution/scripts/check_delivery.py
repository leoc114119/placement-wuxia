#!/usr/bin/env python3
"""Read-only artifact-path/commit audit; prints a projbus-ready path list.

Input JSON is a list of repository-relative files, or {"artifact_paths": [...]}.
This is a transport audit, not an image/spec/approval validator. No writes/fetch/send.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys


def git(root, *args):
    return subprocess.run(
        ['git', '--literal-pathspecs', '-C', str(root), *args],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout


def audit(root, revision, paths):
    if not isinstance(paths, list) or not paths:
        raise ValueError('artifact_paths must be a non-empty list')
    root = Path(git(root, 'rev-parse', '--show-toplevel').decode().strip())
    # Resolve once: concurrent HEAD changes cannot change the audited revision.
    sha = git(root, 'rev-parse', '--verify', '--end-of-options',
              revision + '^{commit}').decode().strip()
    errors, records, seen = [], [], set()
    for name in paths:
        if not isinstance(name, str):
            errors.append({'path': repr(name), 'error': 'path must be string'})
            continue
        posix = PurePosixPath(name)
        if (not name or posix.is_absolute() or '\\' in name
                or any(x in ('', '.', '..') for x in name.split('/'))
                or any(ord(c) < 32 for c in name)):
            errors.append({'path': name, 'error': 'not a canonical repo-relative file'})
            continue
        if name in seen:
            errors.append({'path': name, 'error': 'duplicate path'})
            continue
        seen.add(name)
        entry = git(root, 'ls-tree', '-z', sha, '--', name)
        if not entry:
            errors.append({'path': name, 'error': 'missing from commit'})
            continue
        header, stored_path = entry.rstrip(b'\0').split(b'\t', 1)
        mode, kind, oid = header.split()
        if stored_path.decode() != name or kind != b'blob' or mode not in (b'100644', b'100755'):
            errors.append({'path': name, 'error': 'requires regular file, not directory/symlink'})
            continue
        work = root / name
        if not work.is_file() or work.is_symlink() or not work.resolve().is_relative_to(root):
            errors.append({'path': name, 'error': 'working file missing or unsafe'})
            continue
        committed = git(root, 'cat-file', 'blob', oid.decode())
        if work.read_bytes() != committed:
            errors.append({'path': name, 'error': 'working bytes differ from delivery commit'})
            continue
        records.append({'path': name, 'sha256': hashlib.sha256(committed).hexdigest(),
                        'bytes': len(committed)})
    return {'pass': not errors, 'commit_sha': sha, 'artifact_paths': paths,
            'checked': records, 'errors': errors,
            'scope': 'paths and bytes only; no remote, spec or approval verification'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='.')
    parser.add_argument('--commit', required=True)
    parser.add_argument('--paths-json', required=True)
    args = parser.parse_args()
    try:
        data = json.loads(Path(args.paths_json).read_text())
        result = audit(args.repo, args.commit,
                       data.get('artifact_paths') if isinstance(data, dict) else data)
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        result = {'pass': False, 'errors': [{'error': str(exc)}]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
