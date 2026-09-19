#!/bin/bash
# Native WASM ND weather radar gauge (MSFS_MapView.h based). Run through
# igniter as the `systems-ndwxr` task (`npm run build-a32nx:ndwxr` /
# `npm run build-a380x:ndwxr`), which also copies the result into the aircraft
# package output. Usage: ./build.sh [--a380x]  (default: A32NX)
# Mirrors fbw-common/src/wasm/terronnd/build.sh's toolchain/flags exactly
# (including all --export flags - dropping them caused a WASM load failure,
# ERR_INVALID_RESERVED_VALUE, during prototyping), but only compiles this
# module's own main.cpp + the vendored nanovg.cpp already shared with terronnd.

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
TERRONND_DIR="${DIR}/../terronnd"

if [ "$1" == "--a380x" ]; then
  AIRCRAFT_FLAG="A380X"
else
  AIRCRAFT_FLAG="A32NX"
fi

RAW_OUTPUT="${DIR}/obj/ndwxr_${AIRCRAFT_FLAG}_raw.wasm"
OUTPUT="${DIR}/out/ndwxr_${AIRCRAFT_FLAG}.wasm"

set -e

# separate object folder per aircraft, so the link step below only ever sees
# the objects of the variant being built
mkdir -p "${DIR}/obj/${AIRCRAFT_FLAG}"
pushd "${DIR}/obj/${AIRCRAFT_FLAG}"

clang++ \
  -c \
  -std=c++20 \
  -W \
  -Wall \
  -Wextra \
  -Wc++20-compat \
  -Wno-unused-command-line-argument \
  -Wno-ignored-attributes \
  -Wno-macro-redefined \
  -Wshadow \
  -Wdouble-promotion \
  -Wundef \
  -Wconversion \
  --sysroot "${MSFS_SDK}/WASM/wasi-sysroot" \
  -target wasm32-unknown-wasi \
  -D_MSFS_WASM=1 \
  -D__wasi__ \
  -D_LIBCC_NO_EXCEPTIONS \
  -D_LIBCPP_HAS_NO_THREADS \
  -D_WINDLL \
  -D_MBCS \
  -D${AIRCRAFT_FLAG} \
  -mthread-model single \
  -fno-exceptions \
  -fms-extensions \
  -fvisibility=hidden \
  -fno-common \
  -fstack-usage \
  -fdata-sections \
  -fno-stack-protector \
  -fstack-size-section \
  -mbulk-memory \
  -Werror=return-type \
  -O2 \
  -I "${MSFS_SDK}/WASM/include" \
  "${DIR}/src/main.cpp" \
  "${TERRONND_DIR}/src/nanovg/nanovg.cpp"

popd

mkdir -p "${DIR}/out"

wasm-ld \
  --no-entry \
  --allow-undefined \
  -L "${MSFS_SDK}/WASM/wasi-sysroot/lib/wasm32-wasi" \
  -lc "${MSFS_SDK}/WASM/wasi-sysroot/lib/wasm32-wasi/libclang_rt.builtins-wasm32.a" \
  --export __wasm_call_ctors \
  --export-dynamic \
  --export malloc \
  --export free \
  --export __wasm_call_ctors \
  --export mallinfo \
  --export mchunkit_begin \
  --export mchunkit_next \
  --export get_pages_state \
  --export mark_decommit_pages \
  --export-table \
  --gc-sections \
  --strip-debug \
  -O2 \
  -lc++ -lc++abi \
  ${DIR}/obj/${AIRCRAFT_FLAG}/*.o \
  -o "$RAW_OUTPUT"

# MSFS's WASM engine doesn't support the "sign-extension" instruction set
# clang emits by default - matches terronnd's own build pipeline
# (package.json's build-a32nx:terronnd script), which runs this exact
# post-process step before deployment. Skipping it caused
# ERR_INVALID_RESERVED_VALUE on module load in the first two attempts.
wasm-opt -O1 --signext-lowering -o "$OUTPUT" "$RAW_OUTPUT"

echo "Built ${OUTPUT}"
