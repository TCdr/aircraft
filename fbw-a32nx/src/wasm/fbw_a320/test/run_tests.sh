#!/bin/bash
# Native unit tests of the pure parts of the A32NX fbw module (no MSFS SDK), with the generated FadecComputer thrust loop: built
# with the host compiler and run. The hold is the shared fbw-common/src/wasm/fbw_common/src/EngineStartThrottleHold.h.
# Add -DWITHOUT_THE_FALLBACK to see the "start ends below idle" checks fail without the fallback.
# usage (in the dev-env container): bash fbw-a32nx/src/wasm/fbw_a320/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  engine_start_throttle_hold_test.cpp ../src/model/FadecComputer.cpp ../src/model/FadecComputer_data.cpp \
  -o ../obj/engine_start_throttle_hold_test
../obj/engine_start_throttle_hold_test
