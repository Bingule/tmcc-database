#!/usr/bin/env bash
set -euo pipefail

ROOT="${TMCC_REMOTE_ROOT:-$HOME/tmcc-database}"
RUNNER="$ROOT/run_fast_static_dos_export_serial.sh"
LOG="$ROOT/non-fe-fast-parallel-5.log"
MAX_JOBS="${TMCC_MAX_PARALLEL:-5}"

# Fast-result queue: structure relaxation/static energy/DOS/export only.
# Fe-intercalated systems are excluded because they need spin-polarized handling
# and can block the short nonmagnetic queue.
MATERIALS=(
  "Ta2S2C-Pbar3m1"
  "Ta2S2C-Rbar3m"
  "Ta2Se2C-Pbar3m1"
  "Ta2Se2C-Rbar3m"
  "Nb2Te2C-Pbar3m1"
  "Ta2Te2C-Pbar3m1"
  "Cu0.5-Nb2S2C-Pbar3m1"
  "Cu0.5-Ta2S2C-Pbar3m1"
  "Nb2CS-P63mmc"
  "Ta2CS-P63mmc"
)

is_done() {
  local dir="$1"
  [ -d "$dir/downloaded_from_metacentrum/website_bundle" ] && return 0
  [ -d "$dir/website_bundle" ] && return 0
  [ -f "$dir/work/dos.csv" ] && [ -f "$dir/work/summary_static.json" ] && return 0
  return 1
}

run_one() {
  local name="$1"
  local dir="$ROOT/$name"
  echo "__START__ $name $(date)" | tee -a "$LOG"

  if [ ! -d "$dir" ]; then
    echo "__MISSING_DIR__ $name $dir" | tee -a "$LOG"
    return 0
  fi

  if is_done "$dir"; then
    echo "__SKIP_DONE__ $name $(date)" | tee -a "$LOG"
    return 0
  fi

  if pgrep -u "$USER" -af "$dir" >/dev/null 2>&1; then
    echo "__SKIP_RUNNING__ $name $(date)" | tee -a "$LOG"
    return 0
  fi

  cp "$RUNNER" "$dir/run_fast_static_dos_export_serial.sh"
  (
    cd "$dir"
    bash run_fast_static_dos_export_serial.sh > non-fe-fast.log 2>&1
  )
  local rc=$?
  echo "__END__ $name rc=$rc $(date)" | tee -a "$LOG"
  return "$rc"
}

wait_for_slot() {
  while [ "$(jobs -pr | wc -l)" -ge "$MAX_JOBS" ]; do
    sleep 10
  done
}

echo "__BATCH_START__ non-Fe fast queue max_jobs=$MAX_JOBS $(date)" | tee -a "$LOG"
for name in "${MATERIALS[@]}"; do
  wait_for_slot
  run_one "$name" &
done
wait
echo "__BATCH_DONE__ non-Fe fast queue $(date)" | tee -a "$LOG"
