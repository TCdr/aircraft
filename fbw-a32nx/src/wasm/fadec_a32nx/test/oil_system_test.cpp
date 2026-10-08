// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the A32NX engine oil quantities (src/Fadec/OilSystem_A32NX.hpp): run test/run_tests.sh.

#include <cstdio>

#include "../src/Fadec/OilSystem_A32NX.hpp"

static int failures = 0;

static void expectTrue(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (%f)\n", what, value);
    ++failures;
  }
}

/// The first time an oil overheat held at a core speed takes the oil temperature across a threshold (upwards, or downwards
/// with falling = true), in seconds, or -1; the tracker keeps its own temperature (EngineOilFailures::OverheatTracker).
static double secondsToCross(EngineOilFailures::OverheatTracker& tracker,
                             double&                             temperature,
                             double                              coreSpeed,
                             double                              idleCoreSpeed,
                             const EngineOilFailures::OverheatParameters& parameters,
                             double                              threshold,
                             bool                                falling,
                             double                              maxSeconds) {
  const double frame = 0.05;
  for (int step = 1; step <= static_cast<int>(maxSeconds / frame); ++step) {
    temperature = tracker.update(true, temperature, 85.0, coreSpeed, idleCoreSpeed, frame, parameters);
    if (falling ? temperature < threshold : temperature > threshold) {
      return step * frame;
    }
  }
  return -1.0;
}

int main() {
  // A healthy engine, from idle to beyond take-off thrust (the LEAP-1A26 is rated about 27 000 lbf), with the least and
  // the most oil of the FADEC initialisation (14 and 20 qt), and the least after a 15 h flight (0.4 qt/h burned): the SD
  // oil quantity never pulses (it pulses below 3.25 QT until 4.75 QT, FCOM DSC-70-90-40 l.64513-64514) and the oil
  // pump always delivers its full pressure, so no ENG OIL LO PR without a failure (sim test 2026-10-06: a false ENG OIL
  // LO PR in a normal climb, the tank read 0.6 qt with 14.7 qt in the system).
  for (const double total : {14.0, 20.0, 14.0 - 0.4 * 15.0}) {
    for (double thrustPounds = 0.0; thrustPounds <= 35000.0; thrustPounds += 250.0) {
      const double tank = OilSystem_A32NX::tankQuantity(total, thrustPounds);
      expectTrue("healthy engine: the SD oil quantity stays above the 4.75 QT end of the pulsing", tank >= 4.75, tank);
      expectTrue("healthy engine: the tank never reads more than the oil of the system", tank <= total, tank);
    }
    expectTrue("healthy engine: full oil pressure", OilSystem_A32NX::pressureFactor(total) == 1.0, total);
  }

  // The gulping: about 20 % of the oil in the circuit at idle and 30 % at take-off thrust
  const double idleTank    = OilSystem_A32NX::tankQuantity(17.0, 1000.0);
  const double takeoffTank = OilSystem_A32NX::tankQuantity(17.0, 27000.0);
  expectTrue("idle: about 80 % of the oil in the tank", idleTank > 13.0 && idleTank < 14.0, idleTank);
  expectTrue("take-off: about 70 % of the oil in the tank", takeoffTank > 11.5 && takeoffTank < 12.5, takeoffTank);

  // A leak: the SD pulsing (3.25 QT in the tank) comes first, then the pressure falls, and ENG OIL LO PR (13 PSI of a
  // normal 75 PSI at cruise) last
  double total = 17.0;
  double pulsingAt = -1.0, pressureFallsAt = -1.0, lowPressureAt = -1.0;
  for (int second = 0; second < 900; ++second) {
    total -= EngineOilFailures::leakedQuantity(true, 90.0, total, OilSystem_A32NX::LEAK_RATE, 1.0);
    if (pulsingAt < 0 && OilSystem_A32NX::tankQuantity(total, 12000.0) < 3.25) {
      pulsingAt = second;
    }
    if (pressureFallsAt < 0 && OilSystem_A32NX::pressureFactor(total) < 1.0) {
      pressureFallsAt = second;
    }
    if (lowPressureAt < 0 && 75.0 * OilSystem_A32NX::pressureFactor(total) < 13.0) {
      lowPressureAt = second;
    }
  }
  expectTrue("leak: the SD quantity pulses before the pressure falls", pulsingAt >= 0 && pulsingAt < pressureFallsAt, pulsingAt);
  expectTrue("leak: ENG OIL LO PR comes last, within 10 min", pressureFallsAt < lowPressureAt && lowPressureAt < 600, lowPressureAt);

  // An oil overheat at cruise (sim test 2026-10-06, N1 77 %: ENG OIL HI TEMP, above 155 C, after about 2 min; the recording
  // fits a cruise N2 of 95 % with the idle N2 of 67 % of the FADEC at FL150). THR LEVER IDLE (FCOM PRO-ABN-ENG ENG 1(2) OIL
  // HI TEMP, l.80536) must bring it back below 155 C, and below the 140 C advisory, with the flight idle N2 about 2 % above
  // the idle of the FADEC (recording 2026-10-06: 1.7 to 2.6 %).
  {
    const double                     idleN2 = 67.0;
    EngineOilFailures::OverheatTracker tracker;
    double                           temperature = 85.0;
    const double alertAt = secondsToCross(tracker, temperature, 95.0, idleN2, OilSystem_A32NX::OVERHEAT, 155.0, false, 600.0);
    expectTrue("overheat: ENG OIL HI TEMP about 2 min after the failure at cruise", alertAt > 60.0 && alertAt < 150.0, alertAt);
    secondsToCross(tracker, temperature, 95.0, idleN2, OilSystem_A32NX::OVERHEAT, 1000.0, false, 600.0);  // settled at cruise
    const double clearAt =
        secondsToCross(tracker, temperature, idleN2 + 2.0, idleN2, OilSystem_A32NX::OVERHEAT, 155.0, true, 600.0);
    expectTrue("overheat: THR LEVER IDLE brings the oil below 155 C within 1 min", clearAt > 0.0 && clearAt < 60.0, clearAt);
    const double advisoryClearAt =
        secondsToCross(tracker, temperature, idleN2 + 2.0, idleN2, OilSystem_A32NX::OVERHEAT, 140.0, true, 900.0);
    expectTrue("overheat: and below the 140 C advisory within 5 min", advisoryClearAt > 0.0 && advisoryClearAt < 300.0,
               advisoryClearAt);
  }

  if (failures == 0) {
    std::printf("oil_system_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
