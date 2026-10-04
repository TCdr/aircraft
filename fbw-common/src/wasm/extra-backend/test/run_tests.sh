#!/bin/bash
# Native unit tests of the pure parts of the extra-backend (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/extra-backend/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror preset_load_target_test.cpp -o ../obj/preset_load_target_test
../obj/preset_load_target_test
clang++ -std=c++20 -Wall -Wextra -Werror ini_write_test.cpp -o ../obj/ini_write_test
../obj/ini_write_test
