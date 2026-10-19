// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the FADEC air data selection and NORMAL / DEGRADED mode (src/Fadec/AirDataSelection_A380X.hpp): run
// test/run_tests.sh.

#include <cstdio>

#include "../src/Fadec/AirDataSelection_A380X.hpp"

using Selection = AirDataSelection_A380X;
using Source    = AirDataSelection_A380X::Source;

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double STATIC_PRESSURE_HPA = 750.0;
static constexpr double TOTAL_PRESSURE_HPA  = 860.0;
static constexpr double TAT_DEG_C           = -5.0;

/// Every ADIRU and engine sensor valid with the same air data
static Selection::Inputs healthy() {
  Selection::Inputs inputs;
  const double      values[Selection::PARAMETERS] = {STATIC_PRESSURE_HPA, TOTAL_PRESSURE_HPA, TAT_DEG_C};
  for (int parameter = 0; parameter < Selection::PARAMETERS; ++parameter) {
    for (int adiru = 0; adiru < Selection::ADIRUS; ++adiru) {
      inputs.adiru[adiru][parameter] = {values[parameter], true};
    }
    for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
      inputs.engine[fadec][parameter] = {values[parameter], true};
    }
  }
  return inputs;
}

static void allAdirusOff(Selection::Inputs& inputs) {
  for (int adiru = 0; adiru < Selection::ADIRUS; ++adiru) {
    for (int parameter = 0; parameter < Selection::PARAMETERS; ++parameter) {
      inputs.adiru[adiru][parameter].valid = false;
    }
  }
}

/// The engine SENSOR FAULT: its total pressure and total temperature probes failed
static void engineSensorFault(Selection::Inputs& inputs, int fadec) {
  inputs.engine[fadec][Selection::PT].valid  = false;
  inputs.engine[fadec][Selection::TAT].valid = false;
}

static void testNormalOperationUsesTheAdirus() {
  const Selection::Result result = Selection::evaluate(healthy());
  for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
    expect(!result.fadec[fadec].degraded, "healthy: NORMAL mode");
    for (int parameter = 0; parameter < Selection::PARAMETERS; ++parameter) {
      expect(result.fadec[fadec].source[parameter] == Source::Adiru1, "healthy: the ADIRU data is used");
    }
  }
}

static void testAllAdirusLostTheEngineSensorsKeepTheNormalMode() {
  Selection::Inputs inputs = healthy();
  allAdirusOff(inputs);
  const Selection::Result result = Selection::evaluate(inputs);
  for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
    expect(!result.fadec[fadec].degraded, "ADRs off: NORMAL mode on the engine sensors");
    expect(result.fadec[fadec].source[Selection::PT] == Source::Engine, "ADRs off: engine PT");
  }
}

static void testAParameterTotallyLostRevertsToDegraded() {
  Selection::Inputs inputs = healthy();
  allAdirusOff(inputs);
  engineSensorFault(inputs, 1);
  const Selection::Result result = Selection::evaluate(inputs);
  expect(result.fadec[1].degraded, "ADRs off + engine 2 sensor fault: FADEC 2 DEGRADED");
  expect(result.fadec[1].source[Selection::PT] == Source::Lost, "FADEC 2 PT lost");
  expect(result.fadec[1].source[Selection::TAT] == Source::Lost, "FADEC 2 TAT lost");
  expect(result.fadec[1].source[Selection::P0] == Source::Engine, "FADEC 2 P0 from its engine");
  expect(!result.fadec[0].degraded && !result.fadec[2].degraded && !result.fadec[3].degraded, "the other FADECs NORMAL");
}

static void testAnEngineSensorFaultAloneKeepsTheAdiruData() {
  Selection::Inputs inputs = healthy();
  engineSensorFault(inputs, 0);
  const Selection::Result result = Selection::evaluate(inputs);
  expect(!result.fadec[0].degraded, "engine 1 sensor fault, ADRs valid: NORMAL");
  expect(result.fadec[0].source[Selection::TAT] == Source::Adiru1, "engine 1 sensor fault: ADIRU TAT");
}

static void testAnErroneousAdiruIsRejected() {
  Selection::Inputs inputs = healthy();
  // an erroneous pitot input: the airspeed, Mach and so the total pressure of ADR 1 read low
  inputs.adiru[0][Selection::PT].value = TOTAL_PRESSURE_HPA - 35.0;
  const Selection::Result result = Selection::evaluate(inputs);
  expect(!result.adiruValid[0][Selection::PT], "ADIRU 1 PT disagrees with the four FADECs: no validity");
  expect(result.adiruValid[0][Selection::P0], "ADIRU 1 P0 still valid");
  for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
    expect(result.fadec[fadec].source[Selection::PT] == Source::Adiru2, "erroneous ADIRU 1 PT: ADIRU 2 PT used");
    expect(result.fadec[fadec].source[Selection::P0] == Source::Adiru1, "erroneous ADIRU 1 PT: ADIRU 1 P0 kept");
    expect(!result.fadec[fadec].degraded, "erroneous ADIRU 1 PT: NORMAL");
  }
}

static void testAnErroneousEngineSensorKeepsTheValidAdiru() {
  Selection::Inputs inputs = healthy();
  inputs.engine[2][Selection::TAT].value = TAT_DEG_C + 20.0;
  const Selection::Result result = Selection::evaluate(inputs);
  expect(result.adiruValid[0][Selection::TAT], "ADIRU 1 TAT agrees with three FADECs: valid");
  expect(result.fadec[2].source[Selection::TAT] == Source::Adiru1, "erroneous engine 3 TAT: the valid ADIRU is used");
}

static void testOneAdiruLeftIsUsedWithItsValiditySignal() {
  Selection::Inputs inputs = healthy();
  allAdirusOff(inputs);
  for (int parameter = 0; parameter < Selection::PARAMETERS; ++parameter) {
    inputs.adiru[2][parameter].valid = true;
  }
  Selection::Result result = Selection::evaluate(inputs);
  expect(result.fadec[0].source[Selection::PT] == Source::Adiru3, "ADIRU 3 alone, consistent: used");

  inputs.adiru[2][Selection::PT].value = TOTAL_PRESSURE_HPA - 35.0;
  result = Selection::evaluate(inputs);
  expect(result.fadec[0].source[Selection::PT] == Source::Engine, "ADIRU 3 alone, erroneous: engine PT used");
}

static void testAllEngineSensorsFailedTheAdirusStayValid() {
  Selection::Inputs inputs = healthy();
  for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
    engineSensorFault(inputs, fadec);
  }
  Selection::Result result = Selection::evaluate(inputs);
  for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
    expect(!result.fadec[fadec].degraded, "four engine sensor faults, ADRs valid: NORMAL");
    expect(result.fadec[fadec].source[Selection::TAT] == Source::Adiru1, "four engine sensor faults: ADIRU TAT");
  }

  allAdirusOff(inputs);
  result = Selection::evaluate(inputs);
  for (int fadec = 0; fadec < Selection::FADECS; ++fadec) {
    expect(result.fadec[fadec].degraded, "four engine sensor faults and ADRs off: DEGRADED");
  }
}

static void testTotalPressure() {
  const double pt = Selection::totalPressure(1013.25, 0.5);
  expect(pt > 1201.5 && pt < 1202.5, "PT of M 0.5 at sea level: 1201.9 hPa");
  expect(Selection::totalPressure(500.0, 0.0) == 500.0, "PT at rest is P0");
}

int main() {
  testNormalOperationUsesTheAdirus();
  testAllAdirusLostTheEngineSensorsKeepTheNormalMode();
  testAParameterTotallyLostRevertsToDegraded();
  testAnEngineSensorFaultAloneKeepsTheAdiruData();
  testAnErroneousAdiruIsRejected();
  testAnErroneousEngineSensorKeepsTheValidAdiru();
  testOneAdiruLeftIsUsedWithItsValiditySignal();
  testAllEngineSensorsFailedTheAdirusStayValid();
  testTotalPressure();
  if (failures > 0) {
    std::printf("air_data_selection_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("air_data_selection_test: all passed\n");
  return 0;
}
