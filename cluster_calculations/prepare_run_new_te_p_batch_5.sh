#!/usr/bin/env bash
set -euo pipefail

ROOT="${TMCC_REMOTE_ROOT:-$HOME/tmcc-database}"
TEMPLATE="$ROOT/Nb2Te2C-Pbar3m1"
RUNNER="$ROOT/run_fast_static_dos_export_serial.sh"
LOG="$ROOT/new-te-p-batch-5.log"
MAX_JOBS="${TMCC_MAX_PARALLEL:-5}"

# New, non-Fe fast candidates. These are not the already imported Nb/Ta/Cu
# examples; they are the first Te-based host-metal expansion batch.
CANDIDATES=(
  "TMCC-0101:Ti2Te2C-Pbar3m1:Ti:Ti2Te2C:ti2te2c-p-3m1"
  "TMCC-0102:Zr2Te2C-Pbar3m1:Zr:Zr2Te2C:zr2te2c-p-3m1"
  "TMCC-0103:Hf2Te2C-Pbar3m1:Hf:Hf2Te2C:hf2te2c-p-3m1"
  "TMCC-0104:V2Te2C-Pbar3m1:V:V2Te2C:v2te2c-p-3m1"
  "TMCC-0105:Mo2Te2C-Pbar3m1:Mo:Mo2Te2C:mo2te2c-p-3m1"
)

ensure_runner() {
  if [ -f "$RUNNER" ]; then
    return 0
  fi
  cat > "$RUNNER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p work

export PYTHONPATH="$PWD/scripts:${PYTHONPATH:-}"
export SKIP_BAND_STRUCTURE=1

set +u
source /etc/profile.d/30_meta_modules.sh
module load py-gpaw
set -u

echo "Fast serial static/DOS/export workflow started at $(date)"
echo "Host: $(hostname)"
echo "Mode=serial"

python scripts/00_check_input.py
gpaw python scripts/01_relax_positions.py
gpaw python scripts/03_static_single_point.py
python scripts/04_export_website_bundle.py
gpaw python scripts/05_dos_band_structure.py
python scripts/04_export_website_bundle.py

echo "Fast serial static/DOS/export workflow finished at $(date)"
EOF
  chmod +x "$RUNNER"
}

is_done() {
  local dir="$1"
  [ -d "$dir/website_bundle" ] && return 0
  [ -d "$dir/downloaded_from_metacentrum/website_bundle" ] && return 0
  [ -f "$dir/work/dos.csv" ] && [ -f "$dir/work/summary_static.json" ] && return 0
  return 1
}

prepare_candidate() {
  local material_id="$1"
  local folder="$2"
  local metal="$3"
  local formula="$4"
  local slug="$5"
  local dir="$ROOT/$folder"

  if [ ! -d "$TEMPLATE" ]; then
    echo "__MISSING_TEMPLATE__ $TEMPLATE" | tee -a "$LOG"
    return 1
  fi

  if [ ! -d "$dir" ]; then
    cp -a "$TEMPLATE" "$dir"
    rm -rf "$dir/work" "$dir/website_bundle" "$dir/downloaded_from_metacentrum"
  fi

  python - "$dir" "$material_id" "$metal" "$formula" "$slug" <<'PY'
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
material_id, metal, formula, slug = sys.argv[2:6]

config_path = root / "material_config.json"
config = json.loads(config_path.read_text(encoding="utf-8-sig"))
config.update({
    "material_id": material_id,
    "slug": slug,
    "family": "TMCC",
    "material_type": "pristine",
    "formula": formula,
    "host": {"formula": formula, "metal": metal, "chalcogen": "Te", "anion": "C"},
    "intercalation": None,
    "experimental_status": "computational",
    "required_elements": [metal, "Te", "C"],
    "input_file": "structure.cif",
    "workflow_version": "tmcc-generated-te-p-v0.1",
    "calculation": {
        "spin_polarized": False,
        "initial_magnetic_moments": {},
        "dft_u": None,
        "setups": None,
        "note": "Generated non-spin-polarized PBE baseline; DFT+U not used."
    }
})
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

cif_path = root / "input" / "structure.cif"
text = cif_path.read_text(encoding="utf-8", errors="ignore")
# Replace every Nb token, including CIF type symbols such as Nb0+ and labels
# such as Nb1. The template is a Nb-only host, so this is intentionally broad.
text = text.replace("Nb", metal)
text = text.replace("Niobium", metal)
cif_path.write_text(text, encoding="utf-8")
PY
}

run_one() {
  local spec="$1"
  IFS=":" read -r material_id folder metal formula slug <<< "$spec"
  local dir="$ROOT/$folder"

  echo "__START__ $material_id $folder $(date)" | tee -a "$LOG"
  prepare_candidate "$material_id" "$folder" "$metal" "$formula" "$slug"

  if is_done "$dir"; then
    echo "__SKIP_DONE__ $material_id $folder $(date)" | tee -a "$LOG"
    return 0
  fi

  if pgrep -u "$USER" -af "$dir" >/dev/null 2>&1; then
    echo "__SKIP_RUNNING__ $material_id $folder $(date)" | tee -a "$LOG"
    return 0
  fi

  cp "$RUNNER" "$dir/run_fast_static_dos_export_serial.sh"
  (
    cd "$dir"
    bash run_fast_static_dos_export_serial.sh > new-te-p-fast.log 2>&1
  )
  local rc=$?
  echo "__END__ $material_id $folder rc=$rc $(date)" | tee -a "$LOG"
  return "$rc"
}

wait_for_slot() {
  while [ "$(jobs -pr | wc -l)" -ge "$MAX_JOBS" ]; do
    sleep 10
  done
}

ensure_runner
echo "__BATCH_START__ new Te P candidates max_jobs=$MAX_JOBS $(date)" | tee -a "$LOG"
for spec in "${CANDIDATES[@]}"; do
  wait_for_slot
  run_one "$spec" &
done
wait
echo "__BATCH_DONE__ new Te P candidates $(date)" | tee -a "$LOG"
