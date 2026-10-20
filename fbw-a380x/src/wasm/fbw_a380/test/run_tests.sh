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
# DOx derated takeoff: the FADEC model takes its FLX path with the derated rating (TakeoffDerate.h). With WITHOUT_THE_FIX=1 the
# PRIM word is passed as it is and the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS -I ../src -I ../src/model takeoff_derate_test.cpp \
  ../src/model/A380FadecComputer.cpp ../src/model/A380FadecComputer_data.cpp -o ../obj/takeoff_derate_test
../obj/takeoff_derate_test
# The DEGRADED (N1) mode of the FADECs: thrust frozen until the lever moves, A/THR lost with three or four engines
# (FadecDegradedMode.h). With WITHOUT_THE_FIX=1 the FADEC model gets the lever and the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS -I ../src -I ../src/model fadec_degraded_mode_test.cpp \
  ../src/model/A380FadecComputer.cpp ../src/model/A380FadecComputer_data.cpp -o ../obj/fadec_degraded_mode_test
../obj/fadec_degraded_mode_test
# NAV AIR DATA / ALL AIR DATA / AOA DISAGREE: the ADRs rejected by the PRIM air data monitoring go to the PRIM model as failed
# (AirDataRejection.h). With WITHOUT_THE_FIX=1 the ADRs are sent as before and the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS -I ../src -I ../src/model air_data_rejection_test.cpp \
  ../src/model/A380PrimComputerGeneralLogic.cpp ../src/model/A380PrimComputerGeneralLogic_data.cpp \
  ../src/model/look1_iflf_binlxpw.cpp -o ../obj/air_data_rejection_test
../obj/air_data_rejection_test
# Alpha floor inhibited above M 0.5 (A380 FCOM DSC-22-27): the generated A380PrimComputerFe model, as it is
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model alpha_floor_mach_inhibit_test.cpp \
  ../src/model/A380PrimComputerFe.cpp ../src/model/A380PrimComputerFe_data.cpp ../src/model/look1_binlxpw.cpp \
  ../src/model/look2_binlxpw.cpp ../src/model/plook_binx.cpp ../src/model/binsearch_u32d.cpp \
  ../src/model/intrp3d_l_pw.cpp ../src/model/look2_iflf_binlxpw.cpp -o ../obj/alpha_floor_mach_inhibit_test
../obj/alpha_floor_mach_inhibit_test
# F/CTL PRIM 1(2)(3) ELEVATOR (RUDDER) ACTUATOR FAULT: the PRIM gives up the actuator, the generated A380SecComputer model takes
# it over (failures/PrimActuatorControlFailures.h). With WITHOUT_THE_FIX=1 the PRIM outputs are kept and the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS -I ../src -I ../src/model prim_actuator_control_test.cpp \
  ../src/model/A380SecComputer.cpp ../src/model/A380SecComputer_data.cpp ../src/model/A380LateralDirectLaw.cpp \
  ../src/model/A380PitchDirectLaw.cpp ../src/Arinc429Utils.cpp -o ../obj/prim_actuator_control_test
../obj/prim_actuator_control_test
# Sidestick, rudder pedal, rudder trim motor, speed brakes lever, PRIM wheel speed and spoiler failures (flyPad ATA 27): the
# inputs of the PRIMs and SECs and the spoiler orders (FlightControlInputFailures.h), with the generated A380PrimComputerFctl
# model for the ground spoilers. With WITHOUT_THE_FIX=1 the inputs are the ones before the failures and the test must fail.
# The PRIM model needs the generated law models, so the whole model folder is built, without -Werror: the generated code
# has warnings of its own (unused variables, unhandled enum values).
clang++ -std=c++20 -Wall -Wextra $FLAGS -I ../src -I ../src/model flight_control_input_failures_test.cpp ../src/model/*.cpp \
  -o ../obj/flight_control_input_failures_test
../obj/flight_control_input_failures_test
