#!/bin/bash
# Native unit tests of the pure parts of the A380X fbw module (no MSFS SDK), built with the host compiler and run.
# usage (in the dev-env container): bash fbw-a380x/src/wasm/fbw_a380/test/run_tests.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../obj
# With WITHOUT_THE_FIX=1 the next tests use the logic before the fix and must fail
FLAGS=""
if [ "${WITHOUT_THE_FIX:-0}" = "1" ]; then
  FLAGS="-DWITHOUT_THE_FIX"
fi
# GLS words on the ILS bus and what the generated A380PrimComputerFg does with them (fbw-common GlsReceiver.h). With WITHOUT_THE_FIX=1
# the ILS bus keeps the words of the detuned receiver and the test must fail. The model sources are built without -Werror, the test with it.
clang++ -std=c++20 -Wall -Wextra -Werror -fsyntax-only -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src gls_guidance_test.cpp
clang++ -std=c++20 $FLAGS -w -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src gls_guidance_test.cpp ../src/model/*.cpp \
  -o ../obj/gls_guidance_test
../obj/gls_guidance_test
# Health of the multi-mode receivers on the ILS buses (fbw-common MultiModeReceiverHealth.h, IlsBusBuilder.h): which words a dead function takes
# away, and that each bus follows its own MMR.
clang++ -std=c++20 -Wall -Wextra -Werror -I ../src/model -I ../../../../../fbw-common/src/wasm/fbw_common/src mmr_health_test.cpp -o ../obj/mmr_health_test
../obj/mmr_health_test
