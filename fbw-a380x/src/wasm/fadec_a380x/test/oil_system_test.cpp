// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the A380X engine oil quantities (src/Fadec/OilSystem_A380X.hpp): run test/run_tests.sh.

#include <cstdio>

#include "../src/Fadec/OilSystem_A380X.hpp"

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
  // A healthy engine, from idle to beyond take-off thrust (the Trent 972B is rated about 70 000 lbf), with the least and
  // the most oil of the FADEC initialisation (17 and 20 qt), and the least after a 15 h flight (0.4 qt/h burned): the SD
  // oil quantity never pulses (below the 1.2 qt oil advisory, FCOM DSC-70-90 l.113343) and the oil pump always delivers
  // its full pressure, so no ENG OIL PRESS LO without a failure (the pressure follows the oil of the whole system, never
  // the tank reading, which falls as the oil moves into the circuit at high thrust: sim test 2026-10-06 on the A32NX).
  for (const double total : {17.0, 20.0, 17.0 - 0.4 * 15.0}) {
    for (double thrustPounds = 0.0; thrustPounds <= 85000.0; thrustPounds += 500.0) {
      const double tank = OilSystem_A380X::tankQuantity(total, thrustPounds);
      expectTrue("healthy engine: the SD oil quantity stays well above the 1.2 qt advisory", tank >= 5.0, tank);
      expectTrue("healthy engine: the tank never reads more than the oil of the system", tank <= total, tank);
    }
    expectTrue("healthy engine: full oil pressure", OilSystem_A380X::pressureFactor(total) == 1.0, total);
  }

  // A leak: the SD advisory (1.2 qt in the tank) comes first, then the pressure falls, and ENG OIL PRESS LO (25 PSI of
  // a normal 60 PSI) last
  double total = 18.0;
  double advisoryAt = -1.0, pressureFallsAt = -1.0, lowPressureAt = -1.0;
  for (int second = 0; second < 900; ++second) {
    total -= EngineOilFailures::leakedQuantity(true, 85.0, total, OilSystem_A380X::LEAK_RATE, 1.0);
    if (advisoryAt < 0 && OilSystem_A380X::tankQuantity(total, 30000.0) < 1.2) {
      advisoryAt = second;
    }
    if (pressureFallsAt < 0 && OilSystem_A380X::pressureFactor(total) < 1.0) {
      pressureFallsAt = second;
    }
    if (lowPressureAt < 0 && 60.0 * OilSystem_A380X::pressureFactor(total) < 25.0) {
      lowPressureAt = second;
    }
  }
  expectTrue("leak: the SD advisory comes before the pressure falls", advisoryAt >= 0 && advisoryAt < pressureFallsAt, advisoryAt);
  expectTrue("leak: ENG OIL PRESS LO comes last, within 10 min", pressureFallsAt < lowPressureAt && lowPressureAt < 600, lowPressureAt);

  // An oil overheat at cruise (sim test 2026-10-07, FL200, A/THR, N1 55-60 %: N3 82.6 %, idle N3 61 % from Table1502 at
  // FL200, Mach 0.55, ISA): the linear target (225 C at 100 % N3) crept from 190 C to 196.3 C in 60 s and OIL TEMP HI came
  // after 4 min. It must come clearly, about 2 min after the failure, and "THR LEVER ... REDUCE BELOW OIL TEMP LIMIT"
  // (FCOM PRO-ABN-ECAM-10-70 ENG OIL TEMP HI, l.172585-172586) must bring it back below 196 C, at IDLE within 2 min. In
  // flight the idle core speed runs about 2 % above the idle of the FADEC (A32NX recording 2026-10-06: 1.7 to 2.6 %).
  {
    const double                     idleN3 = 61.0;
    EngineOilFailures::OverheatTracker tracker;
    double                           temperature = 85.0;
    const double cruiseTarget = EngineOilFailures::overheatTargetTemperature(82.6, idleN3, OilSystem_A380X::OVERHEAT);
    expectTrue("overheat: the cruise target is clearly above the 196 C of OIL TEMP HI", cruiseTarget > 205.0, cruiseTarget);
    const double alertAt = secondsToCross(tracker, temperature, 82.6, idleN3, OilSystem_A380X::OVERHEAT, 196.0, false, 600.0);
    expectTrue("overheat: OIL TEMP HI about 2 min after the failure at cruise", alertAt > 60.0 && alertAt < 150.0, alertAt);
    secondsToCross(tracker, temperature, 82.6, idleN3, OilSystem_A380X::OVERHEAT, 1000.0, false, 600.0);  // settled at cruise
    const double clearAt =
        secondsToCross(tracker, temperature, idleN3 + 2.0, idleN3, OilSystem_A380X::OVERHEAT, 196.0, true, 600.0);
    expectTrue("overheat: THR LEVER IDLE brings the oil below 196 C within 2 min", clearAt > 0.0 && clearAt < 120.0, clearAt);
    const double idleTarget = EngineOilFailures::overheatTargetTemperature(idleN3 + 2.0, idleN3, OilSystem_A380X::OVERHEAT);
    expectTrue("overheat: the flight idle target stays clearly below 196 C", idleTarget < 190.0, idleTarget);
    const double climbTarget = EngineOilFailures::overheatTargetTemperature(92.0, idleN3, OilSystem_A380X::OVERHEAT);
    expectTrue("overheat: the climb target is above 220 C", climbTarget > 220.0, climbTarget);
  }

  if (failures == 0) {
    std::printf("oil_system_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
