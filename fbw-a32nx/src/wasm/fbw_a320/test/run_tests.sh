#!/bin/bash
# Native unit tests of the pure parts of the A32NX fbw module (no MSFS SDK), built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a32nx/src/wasm/fbw_a320/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
# FLS deviations and the ILS bus words they replace on an FLS approach (fbw-common FlsReceiver.h)
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src fls_guidance_test.cpp -o ../obj/fls_guidance_test
../obj/fls_guidance_test
# With WITHOUT_THE_FIX=1 the next tests use the logic before the fix and must fail
FIX_FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FIX_FLAGS="-DWITHOUT_THE_FIX"
fi
# GLS words on the ILS bus, the FMS inputs and the autoland monitor inputs on a GLS approach, and what the generated FmgcComputer does with
# them: arming, LOC and G/S capture, LAND, FLARE, ROLL OUT, loss of the signal (fbw-common GlsReceiver.h). With WITHOUT_THE_FIX=1 the ILS bus keeps the
# words of the detuned receiver and the autoland monitor reads the radio, so the test must fail.
clang++ -std=c++20 -Wall -Wextra -Werror -fsyntax-only $FIX_FLAGS -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src gls_guidance_test.cpp
clang++ -std=c++20 -Wall -Wextra -w $FIX_FLAGS -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src   gls_guidance_test.cpp ../src/fmgc/Fmgc.cpp ../src/model/*.cpp ../src/Arinc429Utils.cpp -o ../obj/gls_guidance_test
../obj/gls_guidance_test
