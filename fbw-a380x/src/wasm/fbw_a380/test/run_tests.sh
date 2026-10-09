#!/bin/bash
# Native unit tests of the pure parts of the A380X fbw module (no MSFS SDK), with the generated A380FadecComputer thrust loop,
# and of the SimData layout against its SimConnect definition: built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a380x/src/wasm/fbw_a380/test/run_tests.sh
# Add -DWITHOUT_THE_FIX to the compile line to see the checks fail without the hold of EngineStartThrottleHold.h.
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  engine_start_throttle_hold_test.cpp ../src/model/A380FadecComputer.cpp ../src/model/A380FadecComputer_data.cpp \
  -o ../obj/engine_start_throttle_hold_test
../obj/engine_start_throttle_hold_test
# SimConnect definition 0 against the SimData struct (SDK headers stubbed: only the struct layout is needed)
clang++ -std=c++20 -Wall -Wextra -Werror -I sdk_stubs sim_data_layout_test.cpp -o ../obj/sim_data_layout_test
../obj/sim_data_layout_test ../src/interface/SimConnectInterface.cpp
# ENG FADEC FAULT: the engine follows its lever, no THRUST LOCK (FadecFailureInputs.h)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  fadec_fault_manual_thrust_test.cpp ../src/model/A380FadecComputer.cpp ../src/model/A380FadecComputer_data.cpp \
  -o ../obj/fadec_fault_manual_thrust_test
../obj/fadec_fault_manual_thrust_test
# ENG THRUST LOSS and ENG T.O THRUST DISAGREE: the FADEC failures (FadecThrustFailures.h). With WITHOUT_THE_FIX=1 the FADEC
# inputs are the ones before the failures and the test must fail.
FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FLAGS="-DWITHOUT_THE_FIX"
fi
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS -I ../src -I ../src/model fadec_thrust_failures_test.cpp \
  ../src/model/A380FadecComputer.cpp ../src/model/A380FadecComputer_data.cpp -o ../obj/fadec_thrust_failures_test
../obj/fadec_thrust_failures_test
