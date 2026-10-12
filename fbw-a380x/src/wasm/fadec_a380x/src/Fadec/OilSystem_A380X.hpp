// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_OILSYSTEM_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_OILSYSTEM_A380X_HPP

#include "EngineOilFailures.hpp"
#include "Polynomials_A380X.hpp"

/**
 * @brief The engine oil quantities of the A380X FADEC and the data of its oil failures (fadec_common
 * EngineOilFailures.hpp). Pure functions, unit tested natively (fadec_a380x/test/run_tests.sh).
 */
namespace OilSystem_A380X {

/*
 * Design choices, the FCOM gives no rates:
 * - an oil leak empties the oil system (A32NX_ENGINE_OIL_TOTAL) at 2 qt/min; the tank quantity shown on the SD is the total
 *   less the oil in the circuit (about 20 % at idle to 37 % at 70 000 lbf) and falls about 1.6 qt/min;
 * - the oil pump delivers its normal pressure down to 1.3 qt in the whole oil system and no pressure at 0.3 qt, so that ENG
 *   OIL PRESS LO (below 25 PSI, FCOM PRO-ABN-ECAM-10-70 l.172486) follows the 1.2 qt oil advisory of the SD (FCOM
 *   DSC-70-90 OIL QUANTITY, a380_fcom.txt l.113343), reached at about 1.5 to 1.9 qt in the system. A healthy engine
 *   holds 17 to 20 qt;
 * - an oil overheat drives the oil to 170 C at idle, between the 163 C pulsing and the 177 C amber of the SD (FCOM
 *   DSC-70-90 OIL TEMPERATURE, l.113362-113371), and to 230 C at 100 % N3, above the 196 C of ENG OIL TEMP HI (FCOM
 *   l.172561), with a 60 s time constant. The target rises with the square root of the N3 fraction above idle: about 214 C
 *   at a cruise N3 half way between idle and 100 % (OIL TEMP HI after about 2 min), back at 196 C at a fifth of the way.
 *   The procedure "THR LEVER ... REDUCE BELOW OIL TEMP LIMIT. Gradually reduce thrust on the affected engine, to decrease
 *   the oil temperature below limit" (FCOM l.172585-172586) then brings it below 196 C, at IDLE within about 1 min. A linear
 *   target (225 C at 100 % N3) only reached 196.3 C after 4 min at cruise N1 55-60 % (sim test 2026-10-07).
 */
constexpr double                                LEAK_RATE               = 2.0 / 60.0;  // qt/s
constexpr double                                FULL_PRESSURE_TOTAL_QTY = 1.3;         // qt
constexpr double                                NO_PRESSURE_TOTAL_QTY   = 0.3;         // qt
constexpr EngineOilFailures::OverheatParameters OVERHEAT                = {170.0, 230.0, 60.0, 0.5};

/** The A380X oil gulping polynomial (Polynomial_A380X::oilGulpPct) takes the thrust in newtons */
constexpr double POUNDS_TO_NEWTONS = 4.4482216153;

/**
 * @brief The oil quantity in the tank (the SD reading) for the oil of the whole system and the engine thrust.
 * @param totalQuantity The oil in the whole oil system (A32NX_ENGINE_OIL_TOTAL), in quarts.
 * @param thrustPounds The engine thrust (TURB ENG JET THRUST), in pounds.
 */
inline double tankQuantity(double totalQuantity, double thrustPounds) {
  return EngineOilFailures::tankQuantity(totalQuantity, Polynomial_A380X::oilGulpPct(thrustPounds * POUNDS_TO_NEWTONS));
}

/** @brief The fraction of its normal pressure the oil pump delivers with the oil of the whole system. */
inline double pressureFactor(double totalQuantity) {
  return EngineOilFailures::pressureFactor(totalQuantity, FULL_PRESSURE_TOTAL_QTY, NO_PRESSURE_TOTAL_QTY);
}

}  // namespace OilSystem_A380X

#endif  // FLYBYWIRE_AIRCRAFT_OILSYSTEM_A380X_HPP
