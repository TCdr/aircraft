// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ValveLineCss } from './EngineBleedValveIndication';

/*
 * The APU bleed valve of the BLEED page, with the APU master switch ON: green crossline when not fully open, green in
 * line when fully open, amber crossline when fully closed with the APU BLEED pb ON for more than 10 s.
 */

/** How long the APU BLEED pb is ON before a closed valve shows amber, in milliseconds */
export const APU_BLEED_PB_CONFIRMATION_MS = 10_000;

/**
 * @param valveOpen L:A32NX_APU_BLEED_AIR_VALVE_OPEN
 * @param apuMasterSwitchOn L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON
 * @param bleedPbOnConfirmed the APU BLEED pb has been ON for more than 10 s
 * @returns the line style of the valve symbol
 */
export function apuBleedValveCss(
  valveOpen: boolean,
  apuMasterSwitchOn: boolean,
  bleedPbOnConfirmed: boolean,
): ValveLineCss {
  return !valveOpen && apuMasterSwitchOn && bleedPbOnConfirmed ? 'AmberLine' : 'GreenLine';
}
