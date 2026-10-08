#!/bin/bash
# Native unit tests of the pure parts of ndwxr (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/ndwxr/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++17 -Wall -Wextra -Werror view_park_test.cpp -o ../obj/view_park_test
../obj/view_park_test
