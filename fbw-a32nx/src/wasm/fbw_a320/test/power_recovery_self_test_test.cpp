// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the power-up self-test of the FMGC, ELAC and SEC after a power supply outage (src/utils/PowerSupplyMonitor):
// run test/run_tests.sh.
//
// Each computer stops after a power outage longer than 20 ms and, when the power comes back, runs its startup sequence:
// FMGC: RAM reset + 30 s self-test on the ground (both nose gears compressed), ELAC: 1 s short self-test, or 8 s long
// self-test after an outage longer than 3 s with the three hydraulic systems unpressurised, SEC: 30 s self-test on the
// ground (no LGCIU reporting the main gear not compressed); in flight the FMGC and the SEC come back at once.
// The startup sequence (initSelfTests()) is skipped while the power supply fault is set, so the fault must be cleared
// before it runs, and the outage time must still be readable by it (ELAC long test). Before the fix the fault was still set
// at that moment: no self-test ran and the computers came back at once.

#include <cstdio>

#include "../src/elac/Elac.h"
#include "../src/fmgc/Fmgc.h"
#include "../src/sec/Sec.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;

/// Runs a computer for the given time (s) with the power supply on or off.
template <typename Computer>
static void run(Computer& computer, double seconds, bool isPowered) {
  for (double t = 0; t < seconds; t += frameTime) {
    computer.update(frameTime, 0, false, isPowered);
  }
}

static void fmgcRunsItsSelfTestAfterAPowerOutageOnTheGround() {
  Fmgc fmgc(true);
  fmgc.modelInputs.in.discrete_inputs.nose_gear_pressed_own = true;
  fmgc.modelInputs.in.discrete_inputs.nose_gear_pressed_opp = true;
  run(fmgc, 1, true);
  expect(fmgc.getDiscreteOutputs().fmgc_healthy, "FMGC healthy before the outage");

  run(fmgc, 1, false);
  expect(!fmgc.getDiscreteOutputs().fmgc_healthy, "FMGC failed during the outage");

  // 10 s after the power comes back the 30 s self-test is still running
  run(fmgc, 10, true);
  expect(!fmgc.getDiscreteOutputs().fmgc_healthy, "FMGC still in its self-test 10 s after the power came back");

  run(fmgc, 21, true);
  expect(fmgc.getDiscreteOutputs().fmgc_healthy, "FMGC healthy again after its 30 s self-test");
}

static void fmgcComesBackAtOnceInFlight() {
  Fmgc fmgc(true);
  run(fmgc, 1, true);
  run(fmgc, 1, false);
  run(fmgc, 0.5, true);
  expect(fmgc.getDiscreteOutputs().fmgc_healthy, "FMGC healthy at once in flight (no self-test in flight)");
}

// (Elac's copy constructor does not copy the inputs: set them up in place)
static void engageElacWithoutHydraulics(Elac& elac) {
  elac.modelInputs.in.discrete_inputs.elac_engaged_from_switch = true;
  elac.modelInputs.in.discrete_inputs.green_low_pressure = true;
  elac.modelInputs.in.discrete_inputs.blue_low_pressure = true;
  elac.modelInputs.in.discrete_inputs.yellow_low_pressure = true;
}

static void elacRunsItsLongSelfTestAfterALongOutageWithoutHydraulics() {
  Elac elac(true);
  engageElacWithoutHydraulics(elac);
  // the first engagement starts a long self-test (8 s): let it end
  run(elac, 10, true);
  expect(elac.modelInputs.in.sim_data.computer_running, "ELAC running before the outage");

  run(elac, 4, false);
  // after a 4 s outage without hydraulic pressure the self-test is the long one (8 s): still running 5 s later
  run(elac, 5, true);
  expect(!elac.modelInputs.in.sim_data.computer_running, "ELAC still in its long self-test 5 s after a 4 s outage");

  run(elac, 4, true);
  expect(elac.modelInputs.in.sim_data.computer_running, "ELAC running again after its 8 s long self-test");
}

static void elacRunsItsShortSelfTestAfterAShortOutage() {
  Elac elac(true);
  engageElacWithoutHydraulics(elac);
  run(elac, 10, true);

  run(elac, 1, false);
  run(elac, 0.5, true);
  expect(!elac.modelInputs.in.sim_data.computer_running, "ELAC in its 1 s short self-test after a 1 s outage");

  run(elac, 1, true);
  expect(elac.modelInputs.in.sim_data.computer_running, "ELAC running again after its 1 s short self-test");
}

static void secRunsItsSelfTestAfterAPowerOutageOnTheGround() {
  Sec sec(true, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  // LGCIU 1 discrete word 2 valid, bit 11 (LH & RH gear shock absorbers compressed) set
  sec.modelInputs.in.bus_inputs.lgciu_1_bus.discrete_word_2.SSM = static_cast<uint32_T>(SignStatusMatrix::NormalOperation);
  sec.modelInputs.in.bus_inputs.lgciu_1_bus.discrete_word_2.Data = 1 << 10;
  run(sec, 1, true);
  expect(sec.modelInputs.in.sim_data.computer_running, "SEC running before the outage");

  run(sec, 1, false);
  run(sec, 10, true);
  expect(!sec.modelInputs.in.sim_data.computer_running, "SEC still in its 30 s self-test 10 s after the power came back");

  run(sec, 21, true);
  expect(sec.modelInputs.in.sim_data.computer_running, "SEC running again after its 30 s self-test");
}

// FCOM DSC-27-20-30 (a320_fcom.txt l.41172-41190): only the ELAC has a power-up test "after the occurrence of an
// electrical transient lasting longer than 25 ms", with its FAULT light and ECAM caution. The SEC FAULT light comes on,
// with an ECAM caution, "when a failure is detected" (F/CTL SEC 1(2)(3) FAULT, l.83757: "a failure of one SEC").
// In flight (LGCIU: main gear not compressed) a SEC power outage must not flash the FAULT light (F/CTL SEC 2 FAULT
// flickered twice, 27 s after DC BUS 2 came back, in the 2026-10-12 sim test) and the SEC comes back at once.
static void secComesBackAtOnceWithoutFaultLightAfterAPowerOutageInFlight() {
  Sec sec(false, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  // LGCIU 1 discrete word 2 valid, bit 11 (LH & RH gear shock absorbers compressed) clear
  sec.modelInputs.in.bus_inputs.lgciu_1_bus.discrete_word_2.SSM = static_cast<uint32_T>(SignStatusMatrix::NormalOperation);
  sec.modelInputs.in.bus_inputs.lgciu_1_bus.discrete_word_2.Data = 0;
  run(sec, 1, true);
  expect(sec.modelInputs.in.sim_data.computer_running, "SEC running in flight before the outage");

  run(sec, 1, false);
  bool faultLightSeen = false;
  for (double t = 0; t < 31; t += frameTime) {
    sec.update(frameTime, 0, false, true);
    faultLightSeen = faultLightSeen || sec.getDiscreteOutputs().sec_failed;
  }
  expect(!faultLightSeen, "no SEC FAULT light after a power outage in flight");
  expect(sec.modelInputs.in.sim_data.computer_running, "SEC running after a power outage in flight");
}

static void secComesBackAtOnceAfterAPowerOutageInFlight() {
  Sec sec(false, false);
  sec.modelInputs.in.discrete_inputs.sec_engaged_from_switch = true;
  sec.modelInputs.in.bus_inputs.lgciu_2_bus.discrete_word_2.SSM = static_cast<uint32_T>(SignStatusMatrix::NormalOperation);
  sec.modelInputs.in.bus_inputs.lgciu_2_bus.discrete_word_2.Data = 0;
  run(sec, 1, true);
  run(sec, 1, false);
  run(sec, 0.5, true);
  expect(sec.modelInputs.in.sim_data.computer_running, "SEC running 0.5 s after a power outage in flight (no self-test)");
}

int main() {
  fmgcRunsItsSelfTestAfterAPowerOutageOnTheGround();
  fmgcComesBackAtOnceInFlight();
  elacRunsItsLongSelfTestAfterALongOutageWithoutHydraulics();
  elacRunsItsShortSelfTestAfterAShortOutage();
  secRunsItsSelfTestAfterAPowerOutageOnTheGround();
  secComesBackAtOnceWithoutFaultLightAfterAPowerOutageInFlight();
  secComesBackAtOnceAfterAPowerOutageInFlight();

  if (failures > 0) {
    std::printf("power_recovery_self_test_test: %d check(s) failed\n", failures);
    return 1;
  }
  std::printf("power_recovery_self_test_test: all checks passed\n");
  return 0;
}
