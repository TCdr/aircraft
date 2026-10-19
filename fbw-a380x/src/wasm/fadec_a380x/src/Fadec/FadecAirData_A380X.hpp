// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_FADECAIRDATA_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_FADECAIRDATA_A380X_HPP

#include <string>

#include "AirDataSelection_A380X.hpp"
#include "DataManager.h"
#include "arinc429.hpp"

/**
 * @class FadecAirData_A380X
 *
 * The air data sources of the four FADECs (AirDataSelection_A380X) on the sim data: the ADR outputs of the three ADIRUs and the
 * engine sensors. Writes the NORMAL / DEGRADED mode of each FADEC, read by the FADEC models of the flight computers (fbw_a380
 * FadecDegradedMode.h), the E/WD and the FWS.
 *
 * Design choice: the flyPad failure ENG 1(2)(3)(4) SENSOR FAULT (an engine total pressure or total temperature probe failed)
 * takes away the engine PT and TAT. The engine static pressure sensor has no failure. The engine probes measure the sim air.
 */
class FadecAirData_A380X {
 public:
  void initialize(DataManager* dm) {
    simTotalAirTemperature = dm->make_simple_aircraft_var("TOTAL AIR TEMPERATURE", UNITS.Celsius, true);
    for (int adiru = 0; adiru < AirDataSelection_A380X::ADIRUS; ++adiru) {
      const std::string prefix = "A32NX_ADIRS_ADR_" + std::to_string(adiru + 1) + "_";
      adrStaticPressure[adiru] = dm->make_named_var(prefix + "CORRECTED_AVERAGE_STATIC_PRESSURE", UNITS.Number, AUTO_READ);
      adrMach[adiru]           = dm->make_named_var(prefix + "MACH", UNITS.Number, AUTO_READ);
      adrTotalAirTemperature[adiru] = dm->make_named_var(prefix + "TOTAL_AIR_TEMPERATURE", UNITS.Number, AUTO_READ);
    }
    for (int engine = 0; engine < AirDataSelection_A380X::FADECS; ++engine) {
      const std::string prefix = "A32NX_ENGINE_" + std::to_string(engine + 1) + "_";
      engineSensorFault[engine] = dm->make_named_var(prefix + "SENSOR_FAULT", UNITS.Number, AUTO_READ);
      degradedMode[engine]      = dm->make_named_var(prefix + "FADEC_DEGRADED_MODE", UNITS.Number, AUTO_WRITE);
      source[engine][AirDataSelection_A380X::P0]  = dm->make_named_var(prefix + "FADEC_P0_SOURCE", UNITS.Number, AUTO_WRITE);
      source[engine][AirDataSelection_A380X::PT]  = dm->make_named_var(prefix + "FADEC_PT_SOURCE", UNITS.Number, AUTO_WRITE);
      source[engine][AirDataSelection_A380X::TAT] = dm->make_named_var(prefix + "FADEC_TAT_SOURCE", UNITS.Number, AUTO_WRITE);
    }
  }

  /**
   * @param ambientPressure the sim static pressure, in hPa
   * @param mach the sim Mach number
   */
  void update(double ambientPressure, double mach) {
    AirDataSelection_A380X::Inputs inputs;
    for (int adiru = 0; adiru < AirDataSelection_A380X::ADIRUS; ++adiru) {
      readAdiru(adiru, inputs);
    }

    const double totalPressure       = AirDataSelection_A380X::totalPressure(ambientPressure, mach);
    // the sim TAT the ADRs also measure: the comparison with the ADRs only sees the failures
    const double totalAirTemperature = simTotalAirTemperature->get();
    for (int engine = 0; engine < AirDataSelection_A380X::FADECS; ++engine) {
      const bool probesFailed                            = engineSensorFault[engine]->getAsBool();
      inputs.engine[engine][AirDataSelection_A380X::P0]  = {ambientPressure, true};
      inputs.engine[engine][AirDataSelection_A380X::PT]  = {totalPressure, !probesFailed};
      inputs.engine[engine][AirDataSelection_A380X::TAT] = {totalAirTemperature, !probesFailed};
    }

    const AirDataSelection_A380X::Result result = AirDataSelection_A380X::evaluate(inputs);
    for (int engine = 0; engine < AirDataSelection_A380X::FADECS; ++engine) {
      degradedMode[engine]->set(result.fadec[engine].degraded ? 1.0 : 0.0);
      for (int parameter = 0; parameter < AirDataSelection_A380X::PARAMETERS; ++parameter) {
        source[engine][parameter]->set(static_cast<double>(result.fadec[engine].source[parameter]));
      }
    }
  }

 private:
  AircraftVariablePtr simTotalAirTemperature;  // degrees C
  NamedVariablePtr adrStaticPressure[AirDataSelection_A380X::ADIRUS];       // ARINC 429, hPa
  NamedVariablePtr adrMach[AirDataSelection_A380X::ADIRUS];                 // ARINC 429
  NamedVariablePtr adrTotalAirTemperature[AirDataSelection_A380X::ADIRUS];  // ARINC 429, degrees C
  NamedVariablePtr engineSensorFault[AirDataSelection_A380X::FADECS];
  NamedVariablePtr degradedMode[AirDataSelection_A380X::FADECS];
  NamedVariablePtr source[AirDataSelection_A380X::FADECS][AirDataSelection_A380X::PARAMETERS];

  void readAdiru(int adiru, AirDataSelection_A380X::Inputs& inputs) const {
    const Arinc429NumericWord staticPressure(adrStaticPressure[adiru]->get());
    const Arinc429NumericWord mach(adrMach[adiru]->get());
    const Arinc429NumericWord totalAirTemperature(adrTotalAirTemperature[adiru]->get());

    // The ADR sends its Mach as no computed data below M 0.1: the total pressure is then the static pressure to well within
    // the tolerance of the comparison.
    const bool   machAvailable = mach.isNormalOperation() || mach.ssm() == Arinc429SignStatus::NoComputedData;
    const double machValue     = mach.isNormalOperation() ? mach.value() : 0.0;

    inputs.adiru[adiru][AirDataSelection_A380X::P0] = {staticPressure.value(), staticPressure.isNormalOperation()};
    inputs.adiru[adiru][AirDataSelection_A380X::PT] = {AirDataSelection_A380X::totalPressure(staticPressure.value(), machValue),
                                                       staticPressure.isNormalOperation() && machAvailable};
    inputs.adiru[adiru][AirDataSelection_A380X::TAT] = {totalAirTemperature.value(), totalAirTemperature.isNormalOperation()};
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_FADECAIRDATA_A380X_HPP
