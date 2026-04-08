#!/bin/zsh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_PORT=1420

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

collect_pids_by_comm() {
  local name="$1"
  ps -axo pid=,comm= | awk -v name="$name" '
    $2 == name { print $1 }
  ' 2>/dev/null || true
}

cd "$REPO_DIR"

port_pids=("${(@f)$(lsof -tiTCP:${DEV_PORT} -sTCP:LISTEN 2>/dev/null || true)}")
kill_pids "port ${DEV_PORT}" "${port_pids[@]}"

app_pids=("${(@f)$(collect_pids_by_pattern "$REPO_DIR/src-tauri/target/debug/typething")}")
kill_pids "typething app" "${app_pids[@]}"

relative_app_pids=("${(@f)$(collect_pids_by_pattern "target/debug/typething")}")
kill_pids "typething relative app" "${relative_app_pids[@]}"

named_app_pids=("${(@f)$(collect_pids_by_comm "typething")}")
kill_pids "typething app name match" "${named_app_pids[@]}"

vite_pids=("${(@f)$(collect_pids_by_pattern "$REPO_DIR/node_modules/.bin/vite")}")
kill_pids "vite" "${vite_pids[@]}"

tauri_pids=("${(@f)$(collect_pids_by_pattern "$REPO_DIR/node_modules/.bin/tauri")}")
kill_pids "tauri dev" "${tauri_pids[@]}"

PATH="/opt/homebrew/opt/rustup/bin:$PATH" pnpm tauri dev
