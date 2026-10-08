#!/bin/bash
# Native unit tests of the pure parts of the A380X FADEC (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a380x/src/wasm/fadec_a380x/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror relight_start_test.cpp -o ../obj/relight_start_test
../obj/relight_start_test
clang++ -std=c++20 -Wall -Wextra -Werror auto_relight_test.cpp -o ../obj/auto_relight_test
../obj/auto_relight_test
# With WITHOUT_THE_FIX=1 the start sequence test uses the FADEC decisions before the start sequence and must fail.
FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FLAGS="-DWITHOUT_THE_FIX"
fi
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS start_sequence_test.cpp -o ../obj/start_sequence_test
../obj/start_sequence_test
