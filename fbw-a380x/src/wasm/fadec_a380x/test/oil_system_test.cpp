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

  if (failures == 0) {
    std::printf("oil_system_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
