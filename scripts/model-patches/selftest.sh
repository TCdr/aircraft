#!/bin/bash
# Proves that scripts/check-model-patches.sh catches what it is meant to catch, on a throw-away copy of the repository.
# usage: ./scripts/model-patches/selftest.sh
set -euo pipefail

# The checkout in the dev-env container belongs to another user than the one running the container.
git() {
  command git -c safe.directory='*' "$@"
}

# Located from this file, not from the working directory, so the selftest works from anywhere.
cd "$(dirname "$0")/../.."
repo=$PWD
git rev-parse --git-dir > /dev/null 2>&1 || { echo "SELFTEST CANNOT RUN: no git repository is reachable from $repo" >&2; exit 1; }

model_dirs=(fbw-a32nx/src/wasm/fbw_a320/src/model fbw-a380x/src/wasm/fbw_a380/src/model)
untouched_file=fbw-a32nx/src/wasm/fbw_a320/src/model/FacComputer.cpp
recorded_file=fbw-a380x/src/wasm/fbw_a380/src/model/A380PrimComputerFe.cpp
new_file=${model_dirs[0]}/UnrecordedNewFile.cpp
reverted_patch=scripts/model-patches/02-a32nx-cl-detent.patch
fake_base=1111111111111111111111111111111111111111

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
copy="$scratch/repo"

failures=0
ci=false

# A clone sharing the objects of this repository holds BASE; the working files (possibly uncommitted) are copied over it.
git clone -q --shared --no-checkout "$repo" "$copy"
git -C "$copy" reset -q
for dir in "${model_dirs[@]}"; do
  mkdir -p "$copy/$dir"
  cp -r "$dir/." "$copy/$dir/"
done
mkdir -p "$copy/scripts"
cp scripts/check-model-patches.sh "$copy/scripts/"
cp -r scripts/model-patches "$copy/scripts/"

base=$(tr -d ' \r\n' < scripts/model-patches/BASE)
if git -C "$copy" cat-file -e "$base^{commit}" 2> /dev/null; then
  has_base=true
else
  has_base=false
  echo "note: BASE is not in this clone, the expectations that need it are skipped"
fi

run_check() {
  (
    cd "$copy"
    # The caller's environment must not decide whether the check runs as in CI.
    if [ "$ci" = true ]; then export GITHUB_ACTIONS=true; else unset GITHUB_ACTIONS; fi
    bash scripts/check-model-patches.sh 2>&1
  ) || true
}

# $1 label, $2 expected result (PASS or FAIL), $3 text the output must contain
expect() {
  local label=$1 expected=$2 needle=${3:-} output
  output=$(run_check)
  if grep -q "^$expected" <<< "$output" && { [ -z "$needle" ] || grep -qF -- "$needle" <<< "$output"; }; then
    echo "ok   $label"
  else
    echo "NOT OK $label: expected $expected${needle:+ naming $needle}, got:"
    sed 's/^/     /' <<< "$output" | head -n 15
    failures=$((failures + 1))
  fi
}

# Restores one file of the copy from this repository's working tree.
restore() {
  cp "$repo/$1" "$copy/$1"
}

expect "pristine copy as checked out" PASS

for dir in "${model_dirs[@]}"; do
  find "$copy/$dir" -type f -exec sed -i 's/\r$//' {} +
done
expect "pristine copy with LF line endings" PASS

(cd "$copy" && git -c core.autocrlf=false apply --reverse "$reverted_patch")
expect "a patch reverted" FAIL "$(basename "$reverted_patch")"
(cd "$copy" && git -c core.autocrlf=false apply "$reverted_patch")
expect "patch re-applied" PASS

if [ "$has_base" = true ]; then
  [ -f "$copy/$untouched_file" ] || { echo "NOT OK test setup: $untouched_file does not exist"; exit 1; }
  printf '// unrecorded hand edit\n' >> "$copy/$untouched_file"
  expect "an unrecorded edit of a file no patch touches" FAIL "$untouched_file"
  sed -i '$d' "$copy/$untouched_file"
  expect "unrecorded edit removed" PASS

  rm "$copy/$untouched_file"
  expect "a model file no patch touches deleted" FAIL "$untouched_file"
  restore "$untouched_file"
  sed -i 's/\r$//' "$copy/$untouched_file"
  expect "deleted file restored" PASS

  printf '// unrecorded new file\n' > "$copy/$new_file"
  expect "an untracked new file in model/" FAIL "$new_file"
  rm "$copy/$new_file"
  expect "untracked file removed" PASS

  # Far from the hunk of the patch that touches this file, so reversing the patches still succeeds.
  sed -i 's/flight_envelope\.beta_target_deg = 0\.0;/flight_envelope.beta_target_deg = 1.0;/' "$copy/$recorded_file"
  # The copy is LF while the repo file may be CRLF, so a byte comparison would always differ: look for the edited value.
  if ! grep -q 'flight_envelope.beta_target_deg = 1.0;' "$copy/$recorded_file"; then echo "NOT OK test setup: the edit outside the hunks changed nothing"; exit 1; fi
  expect "an edit of a patched file outside its hunks" FAIL "$recorded_file"
  restore "$recorded_file"
  sed -i 's/\r$//' "$copy/$recorded_file"
  expect "edit outside the hunks removed" PASS
fi

sed -i 's/mach <= 0.5/mach <= 0.6/' "$copy/$recorded_file"
expect "a line inside a recorded hunk edited" FAIL "$recorded_file"
restore "$recorded_file"
sed -i 's/\r$//' "$copy/$recorded_file"

# A BASE that is not in the clone selects the weak form.
printf '%s\n' "$fake_base" > "$copy/scripts/model-patches/BASE"
expect "weak form: pristine copy" PASS "PASS (weak form)"
(cd "$copy" && git -c core.autocrlf=false apply --reverse "$reverted_patch")
expect "weak form: a patch reverted" FAIL "$(basename "$reverted_patch")"
(cd "$copy" && git -c core.autocrlf=false apply "$reverted_patch")
ci=true
expect "weak form refused in CI" FAIL "CI requires the strong form"
ci=false
cp "$repo/scripts/model-patches/BASE" "$copy/scripts/model-patches/BASE"

if [ "$failures" -ne 0 ]; then
  echo "SELFTEST FAILED: $failures expectation(s) not met"
  exit 1
fi
echo "SELFTEST PASSED"
