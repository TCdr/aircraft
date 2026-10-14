// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the flyPad failure of the FG TCAS mode (Failures::TcasMode, src/fmgc/FmgcTcasBusInput.h) with the
// generated FmgcComputer: run test/run_tests.sh.
//
// A320 FCOM DSC-22_30-70-85 (a320_fcom.txt l.30499-30503): the TCAS mode is not available when the TCAS mode is failed
// (AUTO FLT TCAS MODE FAULT). The FMGC computes logic.tcas_mode_available from the TCAS sensitivity level word: valid,
// TA/RA (bits 26 and 27 set, bit 25 STBY clear) and the radio height above 900 ft.
// Add -DWITHOUT_THE_FAILURE_INPUT to see the failure checks fail with the bus passed through unchanged (before the fix).

#include <cstdio>

#include "../src/fmgc/Fmgc.h"
#include "../src/fmgc/FmgcTcasBusInput.h"

#ifdef WITHOUT_THE_FAILURE_INPUT
// before the fix: FlyByWireInterface gave the FMGCs the TCAS bus whatever the failures
#define fmgcTcasBusInput(bus, failed) (bus)
#endif

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;

static constexpr uint32_T normalOperation = 3;

/// A working TCAS in TA/RA: the sensitivity level word as TcasComputer.ts writes it (bits 26 and 27 set, normal
/// operation), no resolution advisory.
static base_tcas_bus workingTcasInTaRa() {
  base_tcas_bus bus{};
  bus.sensitivity_level.SSM = normalOperation;
  bus.sensitivity_level.Data = static_cast<real32_T>((1u << 25) | (1u << 26));  // bits 26 and 27 (1-based)
  bus.vertical_resolution_advisory.SSM = normalOperation;
  bus.vertical_resolution_advisory.Data = 0;
  return bus;
}

/// FMGC 1 in flight at 3000 ft RA, powered, with the given TCAS bus input, after 2 s.
static bool tcasModeAvailable(const base_tcas_bus& tcasBus) {
  Fmgc fmgc(true);
  base_ra_bus ra{};
  ra.radio_height_ft.SSM = normalOperation;
  ra.radio_height_ft.Data = 3000;
  for (double t = 0; t < 2; t += frameTime) {
    fmgc.modelInputs.in.bus_inputs.ra_own_bus = ra;
    fmgc.modelInputs.in.bus_inputs.ra_opp_bus = ra;
    fmgc.modelInputs.in.bus_inputs.tcas_bus = tcasBus;
    fmgc.update(frameTime, t, false, true);
  }
  return fmgc.getDebugOutputs().logic.tcas_mode_available;
}

static void theBusIsUnchangedWithoutTheFailure() {
  const base_tcas_bus tcas = workingTcasInTaRa();
  const base_tcas_bus input = fmgcTcasBusInput(tcas, false);
  expect(input.sensitivity_level.SSM == tcas.sensitivity_level.SSM, "sensitivity level SSM kept");
  expect(input.sensitivity_level.Data == tcas.sensitivity_level.Data, "sensitivity level data kept");
  expect(input.vertical_resolution_advisory.SSM == tcas.vertical_resolution_advisory.SSM, "RA word SSM kept");
}

static void theFailureBlanksTheBus() {
  const base_tcas_bus input = fmgcTcasBusInput(workingTcasInTaRa(), true);
  expect(input.sensitivity_level.SSM == 0, "sensitivity level word failure warning");
  expect(input.sensitivity_level.Data == 0, "sensitivity level word blank");
  expect(input.vertical_resolution_advisory.SSM == 0, "RA word failure warning");
}

static void theFmgcLosesTheTcasModeWithTheFailure() {
  expect(tcasModeAvailable(fmgcTcasBusInput(workingTcasInTaRa(), false)), "TCAS mode available without the failure");
  expect(!tcasModeAvailable(fmgcTcasBusInput(workingTcasInTaRa(), true)), "TCAS mode not available with the failure");
}

int main() {
  theBusIsUnchangedWithoutTheFailure();
  theFailureBlanksTheBus();
  theFmgcLosesTheTcasModeWithTheFailure();
  if (failures > 0) {
    std::printf("%d check(s) failed\n", failures);
    return 1;
  }
  std::printf("fmgc_tcas_mode_failure_test: all checks passed\n");
  return 0;
}
