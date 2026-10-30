// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register, RegisteredSimVar } from '@flybywiresim/fbw-sdk';

/**
 * The automatic release of the cabin oxygen masks by the oxygen system control unit (OSCU): above 13 800 ft cabin
 * altitude the containers open and release the masks, as the MASK MAN ON pb does, the PAX SYS ON light comes on and
 * oxygen flows to the passenger masks. The automatic release is supplied by DC ESS.
 */

const CABIN_MASKS_RELEASE_ALTITUDE_FT = 13800;

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
 */
export class CabinAltitudeReader {
  private readonly words = [1, 2, 3, 4].map((cpcs) =>
    RegisteredSimVar.create(`L:A32NX_PRESS_CABIN_ALTITUDE_B${cpcs}`, SimVarValueType.Number),
  );

  private readonly register = Arinc429Register.empty();

  /** @returns the cabin altitude in feet, null without a valid value */
  public read(): number | null {
    for (const word of this.words) {
      this.register.set(word.get());
      if (this.register.isNormalOperation()) {
        return this.register.value;
      }
    }
    return null;
  }
}

/** Sets L:A32NX_OXYGEN_MASKS_DEPLOYED and the PAX SYS ON light when the masks drop automatically. */
export class CabinOxygenMasks implements Instrument {
  private readonly autoRelease = new CabinMaskAutoRelease();

  private readonly cabinAltitude = new CabinAltitudeReader();

  private readonly dcEssPowered = RegisteredSimVar.createBoolean('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED');

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    if (this.autoRelease.update(this.cabinAltitude.read(), this.dcEssPowered.get())) {
      SimVar.SetSimVarValue('L:A32NX_OXYGEN_MASKS_DEPLOYED', SimVarValueType.Bool, true);
      SimVar.SetSimVarValue('L:A32NX_OXYGEN_PASSENGER_LIGHT_ON', SimVarValueType.Bool, true);
    }
  }
}
