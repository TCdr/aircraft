#!/bin/bash
# Native unit tests of the pure parts of the A32NX fbw module (no MSFS SDK), with the generated FadecComputer: built with the host
# compiler and run.
# usage (in the dev-env container): bash fbw-a32nx/src/wasm/fbw_a320/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
# Thrust limit type after a FLX takeoff: a lever a hair above the CL detent is still CL (the limit does not stay on FLX)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model \
  clb_limit_after_flex_takeoff_test.cpp ../src/model/FadecComputer.cpp ../src/model/FadecComputer_data.cpp \
  -o ../obj/clb_limit_after_flex_takeoff_test
../obj/clb_limit_after_flex_takeoff_test
# Autopilot disconnection on overspeed (VMO + 15 kt / MMO + 0.04): the generated FmgcComputer with an engaged autopilot
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  ap_overspeed_disconnect_test.cpp ../src/fmgc/Fmgc.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp \
  -o ../obj/ap_overspeed_disconnect_test
../obj/ap_overspeed_disconnect_test
