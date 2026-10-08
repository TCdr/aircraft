#!/bin/bash
# Native unit tests of the pure parts of fbw_common (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/fbw_common/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror fadec_failure_inputs_test.cpp -o ../obj/fadec_failure_inputs_test
../obj/fadec_failure_inputs_test
