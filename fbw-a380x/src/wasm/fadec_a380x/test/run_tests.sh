#!/bin/bash
# Native unit tests of the pure parts of the A380X FADEC (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a380x/src/wasm/fadec_a380x/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror relight_start_test.cpp -o ../obj/relight_start_test
../obj/relight_start_test
