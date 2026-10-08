// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_ENGINEOILFAILURES_HPP
#define FLYBYWIRE_AIRCRAFT_ENGINEOILFAILURES_HPP

#include <algorithm>
#include <cmath>

/**
 * @brief The physical effect of the engine oil failures of the flyPad on the oil quantity, pressure and temperature that
 * the FADEC computes. The failures themselves are published by the systems (fbw-common systems engine/oil_failure.rs as
 * L:A32NX_ENGINE_n_OIL_LEAK and L:A32NX_ENGINE_n_OIL_OVERHEAT). The numbers are aircraft data: each FADEC passes its own.
 *
 * Pure functions without the MSFS SDK, unit tested natively (fadec_common/test/run_tests.sh).
 *
 * Design choice: the FCOMs give the alert thresholds of the oil parameters but not how fast a leak or an overheat
 * develops. A leak empties the oil system at a fixed rate while the oil pump turns; once the tank is nearly empty the pump
 * no longer delivers its normal pressure. An overheat (the oil no longer cooled enough) drives the oil temperature towards
 * a temperature that rises with the engine core speed, so that reducing thrust reduces it.
 */
namespace EngineOilFailures {

/**
 * @brief The oil lost overboard by a leak during one update.
 * @param leaking The oil leak failure of the engine is active.
 * @param coreSpeedPercent The engine core speed (N2 on the A32NX, N3 on the A380X), in percent.
 * @param totalQuantity The oil quantity in the whole oil system (tank and circuit), in quarts.
 * @param leakRateQuartsPerSecond The leak rate of the aircraft, in quarts per second.
 * @param deltaTimeSeconds The time of the update, in seconds.
 * @return The quantity lost, in quarts, never more than the oil left.
 */
inline double leakedQuantity(bool leaking, double coreSpeedPercent, double totalQuantity, double leakRateQuartsPerSecond,
                             double deltaTimeSeconds) {
  // Design choice: the oil only leaks while the core turns the oil pump through the accessory gearbox.
  constexpr double OIL_PUMP_MIN_CORE_SPEED_PERCENT = 10.0;
  if (!leaking || coreSpeedPercent < OIL_PUMP_MIN_CORE_SPEED_PERCENT || totalQuantity <= 0.0) {
    return 0.0;
  }
  return (std::min)(totalQuantity, leakRateQuartsPerSecond * deltaTimeSeconds);
}

/**
 * @brief The fraction of its normal pressure the oil pump delivers with the oil left in the tank.
 * @param tankQuantity The oil quantity in the tank, in quarts.
 * @param fullPressureTankQuantity At or above this tank quantity the pump delivers its normal pressure, in quarts.
 * @param noPressureTankQuantity At or below this tank quantity the pump delivers no pressure, in quarts.
 * @return 1 with enough oil, falling linearly to 0 as the tank empties.
 */
inline double pressureFactor(double tankQuantity, double fullPressureTankQuantity, double noPressureTankQuantity) {
  if (tankQuantity >= fullPressureTankQuantity) {
    return 1.0;
  }
  if (tankQuantity <= noPressureTankQuantity) {
    return 0.0;
  }
  return (tankQuantity - noPressureTankQuantity) / (fullPressureTankQuantity - noPressureTankQuantity);
}

/** @brief The oil temperatures an overheat drives the oil towards, and how fast. */
struct OverheatParameters {
  /** The temperature reached at idle, in degree Celsius */
  double idleTemperature;
  /** The temperature reached at 100 % core speed, in degree Celsius */
  double fullThrustTemperature;
  /** The time constant of the approach to that temperature, in seconds */
  double timeConstantSeconds;
};

/**
 * @brief The temperature the oil of an overheating engine heads to: from idleTemperature at the idle core speed to
 * fullThrustTemperature at 100 % core speed, linear in between.
 */
inline double overheatTargetTemperature(double coreSpeedPercent, double idleCoreSpeedPercent, const OverheatParameters& parameters) {
  const double span     = 100.0 - idleCoreSpeedPercent;
  const double fraction = span > 0.0 ? std::clamp((coreSpeedPercent - idleCoreSpeedPercent) / span, 0.0, 1.0) : 1.0;
  return parameters.idleTemperature + (parameters.fullThrustTemperature - parameters.idleTemperature) * fraction;
}

/**
 * @brief The oil temperature of an overheating engine after one update: a first order approach to the temperature of
 * overheatTargetTemperature, so that it rises at high thrust and falls back when the thrust is reduced.
 */
inline double overheatTemperature(double previousTemperature,
                                  double coreSpeedPercent,
                                  double idleCoreSpeedPercent,
                                  double deltaTimeSeconds,
                                  const OverheatParameters& parameters) {
  const double target = overheatTargetTemperature(coreSpeedPercent, idleCoreSpeedPercent, parameters);
  const double blend  = 1.0 - std::exp(-deltaTimeSeconds / parameters.timeConstantSeconds);
  return previousTemperature + (target - previousTemperature) * blend;
}

/**
 * @brief The oil temperature of an overheating engine, kept by the FADEC itself.
 *
 * MSFS runs its own oil temperature model on GENERAL ENG OIL TEMPERATURE (engines.cfg oil_temp_cooling_constant,
 * oil_temp_heating_constant, oil_temp_tc): between two FADEC updates it moves the value the FADEC wrote towards its own
 * temperature. An overheat integrated from the value read back therefore settles where the FADEC push and the MSFS pull
 * balance, far below its target: sim test 2026-10-06, A380X engine 4 at FL200 and 84 % N3, the oil temperature stopped
 * at 128 C for a 203 C target, and ENG OIL TEMP HI (196 C) never came up. The tracker takes the value read back only
 * when the failure begins, then integrates its own temperature and the FADEC writes it every update.
 */
class OverheatTracker {
 public:
  /**
   * @param overheating The oil overheat failure of the engine is active.
   * @param simTemperature The oil temperature read back from MSFS, in degree Celsius.
   * @return The oil temperature to write while overheating, or simTemperature without the failure.
   */
  double update(bool                      overheating,
                double                    simTemperature,
                double                    coreSpeedPercent,
                double                    idleCoreSpeedPercent,
                double                    deltaTimeSeconds,
                const OverheatParameters& parameters) {
    if (!overheating) {
      active = false;
      return simTemperature;
    }
    if (!active) {
      active      = true;
      temperature = simTemperature;
    }
    temperature = overheatTemperature(temperature, coreSpeedPercent, idleCoreSpeedPercent, deltaTimeSeconds, parameters);
    return temperature;
  }

 private:
  bool   active      = false;
  double temperature = 0.0;
};

}  // namespace EngineOilFailures

#endif  // FLYBYWIRE_AIRCRAFT_ENGINEOILFAILURES_HPP
