#!/bin/bash
# Checks that the hand edits of the generated fly-by-wire model/ folders are exactly the ones recorded in
# scripts/model-patches/. An edit made outside the patch set would be lost silently the next time the folders are regenerated
# from the Simulink sources (which this fork does not have), and a recorded edit that went missing would be a regression.
#
# With the BASE commit in the clone the files are rebuilt from BASE plus the patches and compared with the tree, and any
# model/ file that differs from BASE (or is new) without being part of a patch is reported. Without BASE, or without a
# reachable repository, only the recorded edits are verified (every patch must still be reversible on the tree); CI refuses
# that weak form.
#
# usage: ./scripts/check-model-patches.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# The checkout in the dev-env container belongs to another user than the one running the container.
git() {
  command git -c safe.directory='*' "$@"
}

patch_dir=scripts/model-patches
model_dirs=(fbw-a32nx/src/wasm/fbw_a320/src/model fbw-a380x/src/wasm/fbw_a380/src/model)

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Git on Windows checks the sources out with CRLF while the repository and the patches hold LF, so every comparison and every
# patch application below runs on CR-stripped copies.
strip_cr() {
  tr -d '\r'
}

base=$(strip_cr < "$patch_dir/BASE" | tr -d ' \n')
[ -n "$base" ] || fail "$patch_dir/BASE is empty"

patch_files=("$patch_dir"/*.patch)
[ -e "${patch_files[0]}" ] || fail "no patch in $patch_dir"

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

mkdir "$scratch/patches" "$scratch/tree"
for patch in "${patch_files[@]}"; do
  strip_cr < "$patch" > "$scratch/patches/$(basename "$patch")"
done

touched_files=$(cat "$scratch"/patches/*.patch | sed -n 's|^+++ b/||p' | sort -u)

patches_touching() {
  local file=$1 patch names=()
  for patch in "$scratch"/patches/*.patch; do
    if grep -q "^+++ b/$file\$" "$patch"; then
      names+=("$(basename "$patch")")
    fi
  done
  echo "${names[*]:-}"
}

while IFS= read -r file; do
  [ -f "$file" ] || fail "$file is part of the recorded patches ($(patches_touching "$file")) but is missing from the tree"
done <<< "$touched_files"

# Recorded edits present: reverse every patch, last one first, on a copy of the tree files. The first patch that no longer
# reverses is the one whose edit was reverted or changed by hand.
copy_tree() {
  local file
  while IFS= read -r file; do
    mkdir -p "$scratch/tree/$(dirname "$file")"
    strip_cr < "$file" > "$scratch/tree/$file"
  done <<< "$touched_files"
}

copy_tree
for ((i = ${#patch_files[@]} - 1; i >= 0; i--)); do
  name=$(basename "${patch_files[$i]}")
  if ! (cd "$scratch/tree" && git -c core.autocrlf=false apply --reverse "$scratch/patches/$name") 2> "$scratch/apply.log"; then
    cat "$scratch/apply.log" >&2
    fail "$name is not present in the tree as recorded (reverted or edited by hand)"
  fi
done

weak_reason=
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  weak_reason="repository not reachable (no git repository found from $PWD)"
elif ! git cat-file -e "$base^{commit}" 2> /dev/null; then
  weak_reason="BASE $base is not in this clone"
fi

if [ -n "$weak_reason" ]; then
  # A silent fallback would let CI pass without ever comparing against BASE.
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    fail "$weak_reason; CI requires the strong form, so BASE must be fetched before this check runs"
  fi
  echo "PASS (weak form): $weak_reason; the recorded edits are present, unrecorded edits cannot be detected."
  exit 0
fi

# A file that differs from BASE but is named by no patch can only be an unrecorded hand edit or an upstream change after BASE.
changed=$(git diff --name-only "$base" -- "${model_dirs[@]}") || fail "git diff against BASE $base failed"
untracked=$(git ls-files --others --exclude-standard -- "${model_dirs[@]}") || fail "git ls-files failed"
changed_unrecorded=$(printf '%s\n' "$changed" | grep -vxF "$touched_files" || true)
unrecorded=$(printf '%s\n%s\n' "$changed_unrecorded" "$untracked" | grep -v '^$' || true)
if [ -n "$unrecorded" ]; then
  echo "$unrecorded" >&2
  fail "the model file(s) above differ from BASE (or are new) without being part of a recorded patch"
fi

# Reversing the patches cannot see an edit inside a patched file but outside the patch hunks; only a rebuild from BASE can.
rm -rf "$scratch/tree"
mkdir "$scratch/tree"
while IFS= read -r file; do
  mkdir -p "$scratch/tree/$(dirname "$file")"
  git show "$base:$file" | strip_cr > "$scratch/tree/$file" || fail "$file does not exist in BASE $base"
done <<< "$touched_files"

for patch in "${patch_files[@]}"; do
  name=$(basename "$patch")
  if ! (cd "$scratch/tree" && git -c core.autocrlf=false apply "$scratch/patches/$name") 2> "$scratch/apply.log"; then
    cat "$scratch/apply.log" >&2
    fail "$name does not apply on BASE plus the patches before it"
  fi
done

while IFS= read -r file; do
  if ! diff -u --label "tree/$file" --label "BASE+patches/$file" <(strip_cr < "$file") <(strip_cr < "$scratch/tree/$file") > "$scratch/diff.log"; then
    head -n 40 "$scratch/diff.log" >&2
    fail "$file differs from BASE plus the recorded patches (patches touching it: $(patches_touching "$file"))"
  fi
done <<< "$touched_files"

echo "PASS (strong form): the model/ edits are exactly the ${#patch_files[@]} recorded patches on BASE $base."
