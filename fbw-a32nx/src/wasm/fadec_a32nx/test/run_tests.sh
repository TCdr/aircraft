#!/bin/bash
# Native unit tests of the pure parts of the A32NX FADEC (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a32nx/src/wasm/fadec_a32nx/test/run_tests.sh
# With WITHOUT_THE_FIX=1 the test uses the FADEC decisions before the start sequence and must fail.
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FLAGS="-DWITHOUT_THE_FIX"
fi
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS start_sequence_test.cpp -o ../obj/start_sequence_test
../obj/start_sequence_test
