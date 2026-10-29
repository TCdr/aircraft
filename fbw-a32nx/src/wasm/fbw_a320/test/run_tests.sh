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
# Reverse thrust: the hold must pass the negative MSFS throttle of the thrust loop (sim test 2026-10-06, s8_main1.log)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  reverse_throttle_test.cpp ../src/model/FadecComputer.cpp ../src/model/FadecComputer_data.cpp \
  -o ../obj/reverse_throttle_test
../obj/reverse_throttle_test
# Power-up self-test of the FMGC, ELAC and SEC after a power outage (PowerSupplyMonitor recovery order)
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  power_recovery_self_test_test.cpp ../src/fmgc/Fmgc.cpp ../src/elac/Elac.cpp ../src/sec/Sec.cpp \
  ../src/model/*.cpp ../src/Arinc429Utils.cpp ../src/utils/PowerSupplyMonitor.cpp ../src/utils/ConfirmNode.cpp \
  ../src/utils/HysteresisNode.cpp ../src/utils/PulseNode.cpp ../src/utils/SRFlipFLop.cpp \
  -o ../obj/power_recovery_self_test_test
../obj/power_recovery_self_test_test
# SEC thrust lever reverse signal (the thrust reverser needs it from at least one SEC)
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  sec_thrust_reverse_test.cpp ../src/sec/Sec.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp ../src/utils/PowerSupplyMonitor.cpp \
  ../src/utils/ConfirmNode.cpp ../src/utils/HysteresisNode.cpp ../src/utils/PulseNode.cpp ../src/utils/SRFlipFLop.cpp \
  -o ../obj/sec_thrust_reverse_test
../obj/sec_thrust_reverse_test
# FAC rudder actuator failures (flyPad 22006-22011): FAC 2 takes a function over, the faults the FAC reports to the FWC
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  fac_actuator_failure_test.cpp ../src/fac/Fac.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp \
  ../src/utils/PulseNode.cpp ../src/utils/SRFlipFLop.cpp \
  -o ../obj/fac_actuator_failure_test
../obj/fac_actuator_failure_test
# FG TCAS mode failure (flyPad 22012): the blanked TCAS bus makes the FMGC TCAS mode unavailable
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  fmgc_tcas_mode_failure_test.cpp ../src/fmgc/Fmgc.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp \
  ../src/utils/PowerSupplyMonitor.cpp \
  -o ../obj/fmgc_tcas_mode_failure_test
../obj/fmgc_tcas_mode_failure_test
# Sidestick, sidestick priority logic and stabilizer electrical control failures (flyPad 27019-27022): the ELAC and SEC
# inputs, and the ELAC losing the pitch axis with the THS motor fault
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  flight_control_failure_inputs_test.cpp ../src/elac/Elac.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp \
  ../src/utils/PowerSupplyMonitor.cpp ../src/utils/ConfirmNode.cpp ../src/utils/HysteresisNode.cpp ../src/utils/PulseNode.cpp \
  ../src/utils/SRFlipFLop.cpp \
  -o ../obj/flight_control_failure_inputs_test
../obj/flight_control_failure_inputs_test
# ELAC pitch law after a dual hydraulic loss, high speed protection limit, sidestick priority latch
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  elac_law_and_protection_test.cpp ../src/model/*.cpp \
  -o ../obj/elac_law_and_protection_test
../obj/elac_law_and_protection_test
# FLS deviations and the ILS bus words they replace on an FLS approach (fbw-common FlsReceiver.h)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src fls_guidance_test.cpp -o ../obj/fls_guidance_test
../obj/fls_guidance_test
# With WITHOUT_THE_FIX=1 the next tests use the logic before the fix and must fail
FIX_FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FIX_FLAGS="-DWITHOUT_THE_FIX"
fi
# AUTOLAND warning light: RA disagree and untimely flare (A320 FCOM DSC-22_30-80-30-10)
clang++ -std=c++20 -Wall -Wextra -Werror $FIX_FLAGS autoland_warning_test.cpp -o ../obj/autoland_warning_test
../obj/autoland_warning_test
# FAC alpha floor: sidestick case and engine-out loss (A320 FCOM DSC-22_40-30)
clang++ -std=c++20 -Wall -Wextra -Werror $FIX_FLAGS alpha_floor_conditions_test.cpp -o ../obj/alpha_floor_conditions_test
../obj/alpha_floor_conditions_test
# Thrust limit type after a FLX takeoff: a lever a hair above the CL detent is still CL (the limit does not stay on FLX)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model $FIX_FLAGS \
  clb_limit_after_flex_takeoff_test.cpp ../src/model/FadecComputer.cpp ../src/model/FadecComputer_data.cpp \
  -o ../obj/clb_limit_after_flex_takeoff_test
../obj/clb_limit_after_flex_takeoff_test
# Autopilot disconnection on overspeed (VMO + 15 kt / MMO + 0.04): the generated FmgcComputer with an engaged autopilot
clang++ -std=c++20 -Wall -Wextra -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  ap_overspeed_disconnect_test.cpp ../src/fmgc/Fmgc.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp \
  ../src/utils/PowerSupplyMonitor.cpp -o ../obj/ap_overspeed_disconnect_test
../obj/ap_overspeed_disconnect_test
# FADEC automatic TOGA at takeoff without flex (ENG THR LEVERS NOT SET), with the generated FadecComputer
clang++ -std=c++20 -Wall -Wextra -Werror $FIX_FLAGS -I ../src -I ../src/model \
  takeoff_auto_toga_test.cpp ../src/model/FadecComputer.cpp ../src/model/FadecComputer_data.cpp \
  -o ../obj/takeoff_auto_toga_test
../obj/takeoff_auto_toga_test
# Speed brake lever transducers and ground spoiler function of a SEC under the flyPad failures, with the generated SecComputer
# (WITHOUT_THE_FIX=1: the failure flags do nothing, the failure checks must fail)
clang++ -std=c++20 -Wall -Wextra $FIX_FLAGS -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src \
  sec_ground_spoiler_failure_test.cpp ../src/sec/Sec.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp ../src/utils/PowerSupplyMonitor.cpp \
  ../src/utils/ConfirmNode.cpp ../src/utils/HysteresisNode.cpp ../src/utils/PulseNode.cpp ../src/utils/SRFlipFLop.cpp \
  -o ../obj/sec_ground_spoiler_failure_test
../obj/sec_ground_spoiler_failure_test
