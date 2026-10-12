// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429WordData } from '@flybywiresim/fbw-sdk';

/**
 * The automatic release of the cabin oxygen masks by the oxygen system control unit (OSCU). A380 FCOM DSC-35-30-10: the
 * containers "automatically open to release the masks, when: The cabin altitude is above 13 800 ft" (a380_fcom.txt
 * l.93310, l.93332-93333), as the MASK MAN ON pb does (l.93396); the PAX SYS ON light comes on, "Oxygen flows toward the
 * passenger masks" (l.93408-93410). The automatic release is supplied by DC ESS (DSC-35-50, l.93707).
 */

/** "The cabin altitude is above 13 800 ft" (a380_fcom.txt l.93333) */
export const CABIN_MASKS_RELEASE_ALTITUDE_FT = 13800;

/** Releases the masks once, when the cabin altitude goes above 13 800 ft (the crew can reset them afterwards). */
export class CabinMaskAutoRelease {
  private above = false;

  /**
   * @param cabinAltitudeFt the cabin altitude, null without a valid value
   * @param dcEssPowered the DC ESS busbar is powered
   * @returns true on the update where the masks are released
   */
  public update(cabinAltitudeFt: number | null, dcEssPowered: boolean): boolean {
    // Without a valid cabin altitude the state is kept, so that a sensor change-over does not release the masks again
    if (cabinAltitudeFt === null) {
      return false;
    }
    const above = cabinAltitudeFt > CABIN_MASKS_RELEASE_ALTITUDE_FT;
    const release = above && !this.above && dcEssPowered;
    // Unpowered, the release is not done: it happens when the power comes back with the cabin altitude still high
    this.above = above && (this.above || dcEssPowered);
    return release;
  }
}

/**
 * The first valid cabin altitude of the four CPIOM B pressure control applications, as the FWS reads them
 * (L:A32NX_PRESS_CABIN_ALTITUDE_B1 to _B4).
 * @param readWord reads an ARINC 429 L:var
 * @returns the cabin altitude in feet, null without a valid value
 */
export function readCabinAltitudeFt(readWord: (name: string) => Arinc429WordData): number | null {
  for (let cpcs = 1; cpcs <= 4; cpcs++) {
    const word = readWord(`L:A32NX_PRESS_CABIN_ALTITUDE_B${cpcs}`);
    if (word.isNormalOperation()) {
      return word.value;
    }
  }
  return null;
}

/** Sets L:A32NX_OXYGEN_MASKS_DEPLOYED and the PAX SYS ON light when the masks drop automatically. */
export class CabinOxygenMasks implements Instrument {
  private readonly autoRelease = new CabinMaskAutoRelease();

  private readonly cabinAltitudeWord = Arinc429Register.empty();

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    const cabinAltitudeFt = readCabinAltitudeFt((name) => this.cabinAltitudeWord.setFromSimVar(name));
    const dcEssPowered = SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', SimVarValueType.Bool) > 0;
    if (this.autoRelease.update(cabinAltitudeFt, dcEssPowered)) {
      SimVar.SetSimVarValue('L:A32NX_OXYGEN_MASKS_DEPLOYED', SimVarValueType.Bool, true);
      SimVar.SetSimVarValue('L:A32NX_OXYGEN_PASSENGER_LIGHT_ON', SimVarValueType.Bool, true);
    }
  }
}
