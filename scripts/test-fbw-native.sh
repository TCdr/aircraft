#!/bin/bash
# Checks the hand edits of the generated model/ folders, then runs the native tests of both fly-by-wire modules (they compile
# the generated model code with clang++ and guard the edits).
# usage: ./scripts/dev-env/run.sh scripts/test-fbw-native.sh

set -e

bash scripts/check-model-patches.sh
bash fbw-a32nx/src/wasm/fbw_a320/test/run_tests.sh
bash fbw-a380x/src/wasm/fbw_a380/test/run_tests.sh
