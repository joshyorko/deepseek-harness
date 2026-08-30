#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
output="$repo_root/.artifacts/dsh-homebrew-local"
tap_name="${DSH_HOMEBREW_TAP:-joshyorko/dsh-local}"

for command_name in brew curl dagger git install systemd-inhibit; do
  command -v "$command_name" >/dev/null || {
    echo "install-local: missing required command: $command_name" >&2
    exit 1
  }
done

commit_hash="$(git -C "$repo_root" rev-parse HEAD)"
rm -rf -- "$output"

systemd-inhibit \
  --what=sleep \
  --why="Building local dsh Homebrew artifact" \
  env DAGGER_NO_NAG=1 dagger --progress=tty call homebrew \
    --source="$repo_root" \
    --commit-hash="$commit_hash" \
    export --path="$output"

mapfile -t archives < <(find "$output" -maxdepth 1 -type f -name 'dsh-homebrew-*.tar.gz' -print)
if [[ "${#archives[@]}" -ne 1 ]]; then
  echo "install-local: expected one dsh Homebrew archive, found ${#archives[@]}" >&2
  exit 1
fi

if ! brew tap | grep -Fxq "$tap_name"; then
  brew tap-new "$tap_name"
fi
tap_root="$(brew --repository "$tap_name")"
formula="$output/Formula/dsh.rb"
archive="${archives[0]}"

install -D -m 0644 "$formula" "$tap_root/Formula/dsh.rb"
install -m 0644 "$archive" "$tap_root/$(basename "$archive")"
brew style "$tap_root/Formula/dsh.rb"

if brew list --formula dsh >/dev/null 2>&1; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew reinstall "$tap_name/dsh"
else
  HOMEBREW_NO_AUTO_UPDATE=1 brew install "$tap_name/dsh"
fi

brew test "$tap_name/dsh"

installed_root="$(brew --prefix dsh)"
node_bin="$(brew --prefix node@24)/bin/node"
dsh --version
if [[ ! -d "$installed_root/libexec/node_modules/@deepseek-ai/dsh-llm-pi-ai-oauth" ]]; then
  echo "install-local: installed bundle is missing the pi-ai OAuth companion" >&2
  exit 1
fi
(
  cd "$installed_root/libexec"
  "$node_bin" --input-type=module --eval "await import('sharp')"
)

dsh_web_log="$(mktemp)"
dsh_web_headers="$(mktemp)"
dsh_web_pid=""
cleanup_dsh_web() {
  if [[ -n "$dsh_web_pid" ]] && kill -0 "$dsh_web_pid" 2>/dev/null; then
    kill "$dsh_web_pid" 2>/dev/null || true
  fi
  if [[ -n "$dsh_web_pid" ]]; then
    wait "$dsh_web_pid" 2>/dev/null || true
  fi
  rm -f -- "$dsh_web_log"
  rm -f -- "$dsh_web_headers"
}
trap cleanup_dsh_web EXIT
trap 'exit 130' INT TERM

dsh web --no-open --port 0 >"$dsh_web_log" 2>&1 &
dsh_web_pid="$!"
dsh_web_url=""
dsh_web_ready=0
for _attempt in {1..60}; do
  if ! kill -0 "$dsh_web_pid" 2>/dev/null; then
    break
  fi
  dsh_web_url="$(grep -Eo 'http://127\.0\.0\.1:[0-9]+/\?token=[A-Za-z0-9_-]+' "$dsh_web_log" | head -n 1 || true)"
  if [[ -n "$dsh_web_url" ]]; then
    dsh_web_base="${dsh_web_url%%\?token=*}"
    curl --silent --show-error --max-time 2 --dump-header "$dsh_web_headers" --output /dev/null "$dsh_web_url" || true
    dsh_web_cookie="$(awk 'tolower($1) == "set-cookie:" { sub(/\r$/, "", $0); sub(/^[^:]*:[[:space:]]*/, "", $0); sub(/;.*/, "", $0); print; exit }' "$dsh_web_headers")"
    if [[ -n "$dsh_web_cookie" ]] && curl --fail --silent --show-error --max-time 2 --cookie "$dsh_web_cookie" --output /dev/null "$dsh_web_base"; then
      dsh_web_ready=1
      break
    fi
  fi
  sleep 0.5
done

if [[ "$dsh_web_ready" -ne 1 ]]; then
  echo "install-local: dsh web failed to become ready" >&2
  while IFS= read -r line; do
    printf '%s\n' "$line" >&2
  done <"$dsh_web_log"
  exit 1
fi

cleanup_dsh_web
trap - EXIT INT TERM
echo "install-local: dsh web smoke passed at $dsh_web_url"
echo "install-local: installed local authorization-enabled dsh from $commit_hash"
