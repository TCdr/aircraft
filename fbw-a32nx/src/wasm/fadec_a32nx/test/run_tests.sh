#!/bin/bash
# Native unit tests of the pure parts of the A32NX FADEC (no MSFS SDK): built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a32nx/src/wasm/fadec_a32nx/test/run_tests.sh
# With WITHOUT_THE_FIX=1 the test uses the FADEC decisions before the start sequence and must fail.
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
# A sim LVar that is not A32NX_-prefixed (XMLVAR_*, ...) must be created with noPrefix = true.
bash ../../../../../fbw-common/src/wasm/cpp-msfs-framework/test/check_named_var_prefix.sh ../src
FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FLAGS="-DWITHOUT_THE_FIX"
fi
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS start_sequence_test.cpp -o ../obj/start_sequence_test
../obj/start_sequence_test
# The fan blocked failure (ENG 1(2) LOW N1): with WITHOUT_THE_FIX=1 the engine model ignores it and the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror -Wno-unused-lambda-capture $FLAGS fan_blocked_start_test.cpp -o ../obj/fan_blocked_start_test
../obj/fan_blocked_start_test
# Polynomials_A32NX.hpp has a pre-existing unused lambda capture (also a warning of the WASM build)
clang++ -std=c++20 -Wall -Wextra -Werror -Wno-unused-lambda-capture -I../../../../../fbw-common/src/wasm/fadec_common/src oil_system_test.cpp -o ../obj/oil_system_test
../obj/oil_system_test
# The wing tank each engine burns from (gravity feeding): with WITHOUT_THE_FIX=1 gravity feeding burns no tank fuel and the
# test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS cross_feed_burn_test.cpp -o ../obj/cross_feed_burn_test
../obj/cross_feed_burn_test
# The wing tank leak failures (FUEL F. USED/FOB DISAGREE): with WITHOUT_THE_FIX=1 the leak takes no fuel and the test must
# fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS wing_tank_leak_test.cpp -o ../obj/wing_tank_leak_test
../obj/wing_tank_leak_test
# The least N2 rise of a burning start (the start N2 floor): with WITHOUT_THE_FIX=1 it is a fixed step per frame and the test
# must fail (the displayed N2 creeps faster at a higher frame rate).
clang++ -std=c++20 -Wall -Wextra -Werror -Wno-unused-lambda-capture $FLAGS start_n2_floor_test.cpp -o ../obj/start_n2_floor_test
../obj/start_n2_floor_test
# The idle setting (modulated idle with the bleed demand, approach idle with the flaps out): with WITHOUT_THE_FIX=1 it is the
# minimum idle in every case and the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror $FLAGS idle_control_test.cpp -o ../obj/idle_control_test
../obj/idle_control_test
