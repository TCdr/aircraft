#!/bin/bash
# Native unit tests of the pure parts shared by the FADECs (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-common/src/wasm/fadec_common/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror engine_oil_failures_test.cpp -o ../obj/engine_oil_failures_test
../obj/engine_oil_failures_test
