#!/bin/bash
# Native unit tests of the pure parts of ndwxr (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/ndwxr/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++17 -Wall -Wextra -Werror wxr_controls_test.cpp -o ../obj/wxr_controls_test
../obj/wxr_controls_test
