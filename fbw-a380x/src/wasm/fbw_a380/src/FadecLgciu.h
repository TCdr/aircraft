#pragma once

// The LGCIU that gives each A380X FADEC its on-ground signal.
//
// The aircraft has 4 FADECs (one per engine) but only 2 LGCIUs (L:A32NX_LGCIU_1/2_..., arrays of 2 in
// FlyByWireInterface). The FADEC loop used the engine index as the LGCIU index, so engines 3 and 4 read past the end
// of the LGCIU arrays.
//
// Design choice (the A380 FCOM does not say which LGCIU each FADEC uses): the engines are split by side, like the
// A32NX where engine 1 reads LGCIU 1 and engine 2 reads LGCIU 2: engines 1 and 2 (left wing) read LGCIU 1, engines 3
// and 4 (right wing) read LGCIU 2.

constexpr int FADEC_COUNT = 4;
constexpr int LGCIU_COUNT = 2;

/// The index (0 or 1) of the LGCIU that gives its on-ground signal to the FADEC of an engine (index 0 to 3).
constexpr int lgciuIndexForFadec(int fadecIndex) {
  return fadecIndex < FADEC_COUNT / 2 ? 0 : 1;
}

// Every FADEC reads an LGCIU that exists.
static_assert(lgciuIndexForFadec(0) == 0 && lgciuIndexForFadec(1) == 0, "engines 1 and 2 read LGCIU 1");
static_assert(lgciuIndexForFadec(2) == 1 && lgciuIndexForFadec(3) == 1, "engines 3 and 4 read LGCIU 2");
static_assert(lgciuIndexForFadec(FADEC_COUNT - 1) < LGCIU_COUNT, "no FADEC reads past the LGCIU arrays");
