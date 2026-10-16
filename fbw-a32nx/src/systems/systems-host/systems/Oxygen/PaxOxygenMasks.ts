// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';

/**
 * The cabin altitude above which the passenger oxygen mask containers open by themselves: "Each container has an
 * electrical latching mechanism that opens automatically to allow the masks to drop, if the cabin pressure altitude
 * exceeds 14 000 ft (+250, -750 ft)" (A320 FCOM DSC-35-30-10, a320_fcom.txt l.56878-56880). The 16 000 ft setting for
 * operations on high altitude airfields is an option the FBW A32NX does not have.
 */
export const PAX_MASK_RELEASE_CABIN_ALTITUDE_FT = 14_000;

/**
 * Whether the masks drop now: the cabin altitude goes above the release altitude. The release happens when the cabin
 * altitude crosses it, so that the crew can still stow (reset) the masks with the TMR RESET pb in a cabin that stays
 * above it, and that a flight loaded with the cabin already above it (an airfield higher than 14 000 ft) does not drop
 * them.
 * @param previousCabinAltitudeFt the cabin altitude of the last update, null at the first update
 * @param cabinAltitudeFt the cabin altitude now
 */
export function isPaxMaskAutoRelease(previousCabinAltitudeFt: number | null, cabinAltitudeFt: number): boolean {
  return (
    previousCabinAltitudeFt !== null &&
    previousCabinAltitudeFt <= PAX_MASK_RELEASE_CABIN_ALTITUDE_FT &&
    cabinAltitudeFt > PAX_MASK_RELEASE_CABIN_ALTITUDE_FT
  );
}

/**
 * The automatic release of the passenger oxygen masks. It sets the same L:vars as the MASK MAN ON pb of the overhead
 * panel (A320_NEO_INTERIOR.xml OXYGEN component): L:A32NX_OXYGEN_MASKS_DEPLOYED and L:A32NX_OXYGEN_PASSENGER_LIGHT_ON
 * (the SYS ON light of the PASSENGER pb). The cabin altitude is the one of the cabin pressure sensor of the manual
 * partition of CPC 1 (L:A32NX_PRESS_MAN_CABIN_ALTITUDE), independent of the CPC computers as the pressure switch of the
 * containers is.
 */
export class PaxOxygenMasks implements Instrument {
  private previousCabinAltitudeFt: number | null = null;

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    const cabinAltitudeFt = SimVar.GetSimVarValue('L:A32NX_PRESS_MAN_CABIN_ALTITUDE', SimVarValueType.Feet);
    if (isPaxMaskAutoRelease(this.previousCabinAltitudeFt, cabinAltitudeFt)) {
      SimVar.SetSimVarValue('L:A32NX_OXYGEN_MASKS_DEPLOYED', SimVarValueType.Bool, true);
      SimVar.SetSimVarValue('L:A32NX_OXYGEN_PASSENGER_LIGHT_ON', SimVarValueType.Bool, true);
    }
    this.previousCabinAltitudeFt = cabinAltitudeFt;
  }
}
