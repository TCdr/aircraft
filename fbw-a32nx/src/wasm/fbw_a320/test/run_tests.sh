#!/bin/bash
# Native unit tests of the pure parts of the A32NX fbw module (no MSFS SDK), built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a32nx/src/wasm/fbw_a320/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
# FLS deviations and the ILS bus words they replace on an FLS approach (fbw-common FlsReceiver.h)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src fls_guidance_test.cpp -o ../obj/fls_guidance_test
../obj/fls_guidance_test
