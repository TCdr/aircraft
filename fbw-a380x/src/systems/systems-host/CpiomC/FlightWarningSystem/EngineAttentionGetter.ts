// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { OIL_PSI_RED_MAX, OIL_TEMP_AMBER_CELSIUS } from '../../../instruments/src/SD/Pages/Engine/OilIndications';

/*
 * The amber attention getting box of an engine on the EWD and the ENG SD page: it asks the crew to watch the parameters
 * of that engine and appears as soon as an amber or red indication of it appears on the EWD or the ENG SD page.
 *
 * FwsCore already boxes an engine with ENG FAIL, and an EGT, N1 or N3 (the GP7200 N2) above its limit (EGT amber or
 * red, N1 red, N3 red cross: EngineParameterAlerts). This module adds the other amber and red indications of the ENG SD
 * page and of the EWD:
 * - the oil pressure in red at or below 25 PSI (SD OilIndications oilPressureIsRed),
 * - the oil temperature in amber above 177 °C (SD OilIndications oilTemperatureClass),
 * - the amber CLOGGED below the fuel flow and below the oil pressure (SD EngineColumn and OilPressureGauge, shown while
 *   the engine runs),
 * - the amber REV 2(3) of the EWD: on ground with the reverser lever in the REV detent and the reverse mode not
 *   available, or a thrust reverser unlocked in flight.
 *
 * Design choices:
 * - The oil indications count while the engine runs (FADEC state ON), as the oil alerts (EngineOilAlerts): a stopped
 *   engine has no oil pressure, and its 0 PSI must not box it.
 * - "Reverse mode not available": the reverser is inoperative (REVERSER FAULT, CTL FAULT, LOCKED, INHIBITED, THR LEVER
 *   FAULT: FadecReverserAlerts isReverserInoperative) with its lever in the reverse range. The EWD shows REV in amber
 *   during every normal deployment too, until the cowls are open: that short transit is not boxed.
 * - Not boxed: the amber XX of an unpowered FADEC (the engine parameters are lost, not abnormal), the oil quantity and
 *   the vibrations, which pulse in green (advisories).
 */

export interface EngineAttentionGetterInputs {
  /** The FADEC reports the engine running (L:A32NX_ENGINE_STATE:n = 1) */
  engineRunning: boolean;
  oilPressurePsi: number;
  oilTemperatureCelsius: number;
  /** L:A32NX_ENGINE_n_FUEL_FILTER_CLOGGED */
  fuelFilterClogged: boolean;
  /** L:A32NX_ENGINE_n_OIL_FILTER_CLOGGED */
  oilFilterClogged: boolean;
  /** Engines 2 and 3 only: the REV indication is amber (reverserRevIndicationAmber), false for engines 1 and 4 */
  reverserIndicationAmber: boolean;
}

/**
 * The amber REV 2(3) indication of the EWD (see the file comment).
 * @param onGround the aircraft is on the ground
 * @param thrustLeverAngle L:A32NX_AUTOTHRUST_TLA:n, negative in the reverse range
 * @param reverserInoperative the reverser cannot deploy (FadecReverserAlerts isReverserInoperative)
 * @param reverserUnlocked ENG 2(3) REVERSER UNLOCKED (L:A32NX_REVERSER_n_UNLOCKED)
 */
export function isReverserIndicationAmber(
  onGround: boolean,
  thrustLeverAngle: number,
  reverserInoperative: boolean,
  reverserUnlocked: boolean,
): boolean {
  return (onGround && thrustLeverAngle < 0 && reverserInoperative) || (!onGround && reverserUnlocked);
}

/** Whether an amber or red indication of the engine, other than ENG FAIL and the EGT / N1 / N3 limits, shows */
export function hasOtherAmberOrRedEngineIndication(inputs: EngineAttentionGetterInputs): boolean {
  const oilIndicationAbnormal =
    inputs.engineRunning &&
    (inputs.oilPressurePsi <= OIL_PSI_RED_MAX ||
      inputs.oilTemperatureCelsius > OIL_TEMP_AMBER_CELSIUS ||
      inputs.fuelFilterClogged ||
      inputs.oilFilterClogged);
  return oilIndicationAbnormal || inputs.reverserIndicationAmber;
}
