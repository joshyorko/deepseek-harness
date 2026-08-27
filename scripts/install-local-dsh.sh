#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
output="$repo_root/.artifacts/dsh-homebrew-local"
tap_name="${DSH_HOMEBREW_TAP:-joshyorko/dsh-local}"

for command_name in awk brew curl dagger git install systemd-inhibit; do
  command -v "$command_name" >/dev/null || {
    echo "install-local: missing required command: $command_name" >&2
    exit 1
  }
done

commit_hash="$(git -C "$repo_root" rev-parse --short HEAD)"
rm -rf -- "$output"

systemd-inhibit --what=sleep --why="Building local dsh Homebrew artifact" env DAGGER_NO_NAG=1 dagger --progress=tty call homebrew --source="$repo_root" --commit-hash="$commit_hash" --output="$output"

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

if ! linkage_output="$(brew linkage --test dsh 2>&1)"; then
  mapfile -t linkage_lines <<<"$linkage_output"
  if [[ "${#linkage_lines[@]}" -ne 2 \
    || "${linkage_lines[0]}" != "Unwanted system libraries:" \
    || ! "${linkage_lines[1]}" =~ ^\ \ /.+/libtinfo\.so\.6$ ]]; then
    printf '%s\n' "$linkage_output" >&2
    exit 1
  fi

  libtinfo_path="${linkage_lines[1]#  }"
  mapfile -t libtinfo_owners < <(
    brew linkage --reverse dsh | awk -v library="$libtinfo_path" '
      $0 == library { found = 1; next }
      found && /^  / { print; next }
      found { exit }
    '
  )
  if [[ "${#libtinfo_owners[@]}" -ne 1 \
    || ! "${libtinfo_owners[0]}" =~ ^\ \ libexec/node_modules/@openai/codex-linux-[^/]+/vendor/[^/]+/codex-resources/zsh/bin/zsh$ ]]; then
    printf '%s\n' "$linkage_output" >&2
    exit 1
  fi
  echo "install-local: accepted upstream Codex zsh linkage to $libtinfo_path"
fi

installed_root="$(brew --prefix dsh)"
node_bin="$(brew --prefix node@24)/bin/node"
dsh --version
grep -R -q -- 'authorization.list' "$installed_root/libexec/node_modules/@deepseek-ai/dsh-host-apiproxy/lib"
(
  cd "$installed_root/libexec"
  "$node_bin" --input-type=module --eval "await import('sharp')"
)

dsh_web_log="$(mktemp)"
dsh_web_pid=""
cleanup_dsh_web() {
  if [[ -n "$dsh_web_pid" ]] && kill -0 "$dsh_web_pid" 2>/dev/null; then
    kill "$dsh_web_pid" 2>/dev/null || true
  fi
  if [[ -n "$dsh_web_pid" ]]; then
    wait "$dsh_web_pid" 2>/dev/null || true
  fi
  rm -f -- "$dsh_web_log"
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
  dsh_web_url="$(grep -Eo 'http://127\.0\.0\.1:[0-9]+' "$dsh_web_log" | head -n 1 || true)"
  if [[ -n "$dsh_web_url" ]] && curl --fail --silent --show-error --max-time 2 --output /dev/null "$dsh_web_url/"; then
    dsh_web_ready=1
    break
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
