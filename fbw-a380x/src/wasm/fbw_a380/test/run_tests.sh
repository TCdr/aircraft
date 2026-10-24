#!/bin/bash
# Native unit tests of the pure parts of the A380X fbw module (no MSFS SDK), with the generated A380FadecComputer: built with the
# host compiler and run.
# usage (in the dev-env container): bash fbw-a380x/src/wasm/fbw_a380/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
# Thrust limit type after a FLEX takeoff: a lever a hair above the CL detent is still CL (the limit does not stay on FLX)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model clb_limit_after_flex_takeoff_test.cpp \
  ../src/model/A380FadecComputer.cpp ../src/model/A380FadecComputer_data.cpp -o ../obj/clb_limit_after_flex_takeoff_test
../obj/clb_limit_after_flex_takeoff_test
