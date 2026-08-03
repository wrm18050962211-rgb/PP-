#!/usr/bin/env bash
set -euo pipefail

component="${1:-}"
commit_sha="${2:-}"

case "$component" in
  admin)
    release_root="/opt/still-admin"
    probe_host="admin.weareinframe.com"
    probe_path="/"
    ;;
  website)
    release_root="/opt/still-website"
    probe_host="www.weareinframe.com"
    probe_path="/payment.html"
    ;;
  *)
    echo "Usage: $0 <admin|website> <40-character-commit-sha>" >&2
    exit 2
    ;;
esac

if [[ ! "$commit_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "Commit SHA must contain 40 hexadecimal characters." >&2
  exit 2
fi

release_dir="$release_root/releases/${commit_sha,,}"
current_link="$release_root/current"
next_link="$release_root/.current-next"

test -f "$release_dir/index.html"
test -f "$release_dir/release.json"
node -e 'const fs=require("node:fs");const [p,s]=process.argv.slice(1);const m=JSON.parse(fs.readFileSync(p,"utf8"));if(m.commitSha!==s.toLowerCase())process.exit(1)' "$release_dir/release.json" "$commit_sha"
nginx -t

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
fi

ln -sfn "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"

if ! curl --fail --silent --show-error --max-time 10 --header "Host: $probe_host" "http://127.0.0.1$probe_path" >/dev/null; then
  if [[ -n "$previous_release" ]]; then
    ln -sfn "$previous_release" "$next_link"
    mv -Tf "$next_link" "$current_link"
  else
    rm -f "$current_link"
  fi
  echo "Release probe failed; previous static release restored." >&2
  exit 1
fi

echo "$component now points to ${commit_sha,,}"
