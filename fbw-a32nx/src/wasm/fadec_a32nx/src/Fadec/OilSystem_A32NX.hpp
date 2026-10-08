// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_OILSYSTEM_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_OILSYSTEM_A32NX_HPP

#include "EngineOilFailures.hpp"
#include "Polynomials_A32NX.hpp"

/**
 * @brief The engine oil quantities of the A32NX FADEC and the data of its oil failures (fadec_common
 * EngineOilFailures.hpp). Pure functions, unit tested natively (fadec_a32nx/test/run_tests.sh).
 */
namespace OilSystem_A32NX {

/*
 * Design choices, the FCOM gives no rates:
 * - an oil leak empties the oil system (A32NX_ENGINE_OIL_TOTAL) at 2 qt/min; the tank quantity shown on the SD is the total
 *   less the oil in the circuit (about 20 % at idle, 30 % at take-off thrust) and falls about 1.6 qt/min;
 * - the oil pump delivers its normal pressure down to 2.5 qt in the whole oil system and no pressure at 0.6 qt, so that ENG
 *   OIL LO PR (below 13 PSI, FCOM PRO-ABN-ENG l.80569) follows the 3.25 QT pulsing of the SD oil quantity (FCOM
 *   DSC-70-90-40 l.64513), reached at about 4.5 qt in the system. A healthy engine holds 14 to 20 qt;
 * - an oil overheat drives the oil to 135 C at idle, below the 140 C advisory, and to 175 C at 100 % N2, above the 155 C
 *   of ENG OIL HI TEMP (FCOM PRO-ABN-ENG l.80528-80530), with a 60 s time constant.
 */
constexpr double                                LEAK_RATE              = 2.0 / 60.0;  // qt/s
constexpr double                                FULL_PRESSURE_TOTAL_QTY = 2.5;         // qt
constexpr double                                NO_PRESSURE_TOTAL_QTY   = 0.6;         // qt
constexpr EngineOilFailures::OverheatParameters OVERHEAT               = {135.0, 175.0, 60.0};

/**
 * @brief The oil quantity in the tank (the SD reading) for the oil of the whole system and the engine thrust.
 *
 * The oil gulping polynomial (Polynomial_A32NX::oilGulpPct, 20 % at idle to 30 % at 27 000 lbf) takes the thrust in
 * pounds, as the FADEC of the A32NX did before its migration (fadec_a320 RegPolynomials.h with
 * SimVars::getThrust in pounds). The migrated FADEC passed it in newtons: the gulping passed 100 % above about
 * 15 700 lbf and the tank read nearly empty in every climb (sim test 2026-10-06: 0.6 qt with 14.7 qt in the system).
 * @param totalQuantity The oil in the whole oil system (A32NX_ENGINE_OIL_TOTAL), in quarts.
 * @param thrustPounds The engine thrust (TURB ENG JET THRUST), in pounds.
 */
inline double tankQuantity(double totalQuantity, double thrustPounds) {
  return EngineOilFailures::tankQuantity(totalQuantity, Polynomial_A32NX::oilGulpPct(thrustPounds));
}

/** @brief The fraction of its normal pressure the oil pump delivers with the oil of the whole system. */
inline double pressureFactor(double totalQuantity) {
  return EngineOilFailures::pressureFactor(totalQuantity, FULL_PRESSURE_TOTAL_QTY, NO_PRESSURE_TOTAL_QTY);
}

}  // namespace OilSystem_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_OILSYSTEM_A32NX_HPP
