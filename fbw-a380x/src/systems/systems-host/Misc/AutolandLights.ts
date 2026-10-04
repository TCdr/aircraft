// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';

/** Half period of the AUTOLAND light flashing (1 Hz, half on, half off), ms */
const FLASH_HALF_PERIOD_MS = 500;

/**
 * Whether an AUTOLAND light is lit. A380 FCOM DSC-22-FG-80-100: the light flashes in autoland below 200 ft RA when
 * the autoland conditions are lost, and "as long as the AUTOLAND light is pressed, the AUTOLAND light flashes".
 * The flashing is computed here because the cockpit lamp code cannot read the sim time (both
 * "(E:ABSOLUTE TIME, seconds) 1 %" and a sine of "(E:SIMULATION TIME, seconds)" kept the light dark in the sim).
 * @param autolandWarning the autoland warning is active
 * @param lightPressed the AUTOLAND light pushbutton is held pressed (light test)
 * @param timeMs a running time in ms
 * @returns whether the light is lit at that time
 */
export function isAutolandLightLit(autolandWarning: boolean, lightPressed: boolean, timeMs: number): boolean {
  const flashOn = Math.floor(timeMs / FLASH_HALF_PERIOD_MS) % 2 === 0;
  return (autolandWarning || lightPressed) && flashOn;
}

/** Drives the captain's and first officer's AUTOLAND lights on the glareshield (glareshield.xml reads the L:vars). */
export class AutolandLights implements Instrument {
  private readonly sides = [
    { test: 'L:A380X_GLARESHIELD_AUTOLAND_TEST_L', light: 'L:A380X_GLARESHIELD_AUTOLAND_LIGHT_L', lit: false },
    { test: 'L:A380X_GLARESHIELD_AUTOLAND_TEST_R', light: 'L:A380X_GLARESHIELD_AUTOLAND_LIGHT_R', lit: false },
  ];

  /** @inheritdoc */
  init(): void {
    for (const side of this.sides) {
      SimVar.SetSimVarValue(side.light, SimVarValueType.Bool, false);
    }
  }

  /** @inheritdoc */
  onUpdate(): void {
    const warning = SimVar.GetSimVarValue('L:A32NX_AUTOPILOT_AUTOLAND_WARNING', SimVarValueType.Bool) > 0;
    const now = Date.now();
    for (const side of this.sides) {
      const lit = isAutolandLightLit(warning, SimVar.GetSimVarValue(side.test, SimVarValueType.Bool) > 0, now);
      if (lit !== side.lit) {
        side.lit = lit;
        SimVar.SetSimVarValue(side.light, SimVarValueType.Bool, lit);
      }
    }
  }
}
