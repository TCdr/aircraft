#!/bin/bash
# Native unit tests of the pure parts of ndwxr (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/ndwxr/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++17 -Wall -Wextra -Werror vd_runways_test.cpp -o ../obj/vd_runways_test
../obj/vd_runways_test
clang++ -std=c++17 -Wall -Wextra -Werror cds_display_test.cpp -o ../obj/cds_display_test
../obj/cds_display_test
