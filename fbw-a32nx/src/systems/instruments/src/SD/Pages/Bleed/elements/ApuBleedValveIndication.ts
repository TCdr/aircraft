// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ValveLineCss } from './EngineBleedValveIndication';

/*
 * The APU bleed valve of the BLEED page, A320 FCOM DSC-36-20 ECAM BLEED PAGE (4) APU BLEED VALVE (a320_fcom.txt
 * l.57801-57808): "Crossline - Green: The APU valve is not fully open, and the APU master switch is ON. In line - Green: The
 * APU valve is fully open, and the APU master switch is ON. Crossline - Amber: The APU valve is fully closed, the APU master
 * switch is ON, and the APU bleed switch is ON for more than 10 s."
 */

/** l.57808: how long the APU BLEED pb is ON before a closed valve shows amber, in milliseconds */
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
