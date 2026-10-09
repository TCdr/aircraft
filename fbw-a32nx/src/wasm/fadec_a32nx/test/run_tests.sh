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
