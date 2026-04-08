#!/bin/zsh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_PORT=1420
BINARY_PATH="$REPO_DIR/src-tauri/target/debug/typething"

kill_pids() {
  local label="$1"
  shift
  local pids=()
  local pid

  for pid in "$@"; do
    if [ -n "$pid" ]; then
      pids+=("$pid")
    fi
  done

  if [ "${#pids[@]}" -eq 0 ]; then
    return
  fi

  echo "Stopping ${label}: ${pids[*]}"
  kill "${pids[@]}" 2>/dev/null || true
  sleep 1
  kill -9 "${pids[@]}" 2>/dev/null || true
}

collect_pids_by_pattern() {
  local pattern="$1"
  ps -axo pid=,command= | awk -v pattern="$pattern" '
    index($0, pattern) { print $1 }
  ' 2>/dev/null || true
}

cd "$REPO_DIR"

app_pids=("${(@f)$(collect_pids_by_pattern "$REPO_DIR/src-tauri/target/debug/typething")}")
kill_pids "typething app" "${app_pids[@]}"

binary_pids=("${(@f)$(lsof -t -- "$BINARY_PATH" 2>/dev/null || true)}")
kill_pids "typething binary" "${binary_pids[@]}"

vite_pids=("${(@f)$(collect_pids_by_pattern "$REPO_DIR/node_modules/.bin/vite")}")
kill_pids "vite" "${vite_pids[@]}"

tauri_pids=("${(@f)$(collect_pids_by_pattern "$REPO_DIR/node_modules/.bin/tauri")}")
kill_pids "tauri dev" "${tauri_pids[@]}"

PATH="/opt/homebrew/opt/rustup/bin:$PATH" pnpm tauri dev
