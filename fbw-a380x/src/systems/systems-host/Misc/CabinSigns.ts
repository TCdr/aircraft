// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429WordData } from '@flybywiresim/fbw-sdk';
import { readCabinAltitudeFt } from './CabinOxygenMasks';

/*
 * The cabin FASTEN SEAT BELT and NO SMOKING signs. The SEAT BELTS sw drives the FASTEN SEAT BELT and RETURN TO SEAT
 * signs, the NO SMOKING sw the NO SMOKING and EXIT signs; both switches work alike:
 * - ON: the signs come on.
 * - AUTO: the signs come on while the slats or the main landing gear are extended.
 * - OFF: the signs go off.
 * An excessive cabin altitude (above the higher of 9 550 ft and the landing field elevation + 1 000 ft) turns all these
 * signs on, whatever the switch positions.
 * The FASTEN SEAT BELT signs are the sim's A:CABIN SEATBELTS ALERT SWITCH (read by the FWS SIGNS memos).
 * The NO SMOKING signs: L:A32NX_NO_SMOKING_MEMO (the signs are on, read by the T.O and LDG memos of the FWS and by
 * the cabin chime of sound.xml).
 * The signs are a CIDS function; the CIDS is not modelled, so this module stands in for it.
 */

/** The SEAT BELTS and NO SMOKING sw positions (L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position, ..._NOSMOKING_Position) */
export enum CabinSignsSwitchPosition {
  On = 0,
  Auto = 1,
  Off = 2,
}

/** L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position */
export { CabinSignsSwitchPosition as NoSmokingSwitchPosition };

/** The cabin altitude is excessive above the higher of 9 550 ft and the landing field elevation + 1 000 ft */
const EXCESSIVE_CABIN_ALTITUDE_MIN_FT = 9550;
const EXCESSIVE_CABIN_ALTITUDE_ABOVE_LANDING_FIELD_FT = 1000;

/**
 * @param cabinAltitudeFt the cabin altitude, null without a valid value
 * @param landingFieldElevationFt the landing field elevation, null without a valid value (then 9 550 ft applies)
 * @returns the cabin altitude is excessive
 */
export function isCabinAltitudeExcessive(
  cabinAltitudeFt: number | null,
  landingFieldElevationFt: number | null,
): boolean {
  if (cabinAltitudeFt === null) {
    return false;
  }
  const limit = Math.max(
    EXCESSIVE_CABIN_ALTITUDE_MIN_FT,
    (landingFieldElevationFt ?? -Infinity) + EXCESSIVE_CABIN_ALTITUDE_ABOVE_LANDING_FIELD_FT,
  );
  return cabinAltitudeFt > limit;
}

export interface CabinSignsInputs {
  switchPosition: CabinSignsSwitchPosition;
  slatsExtended: boolean;
  mainGearExtended: boolean;
  cabinAltitudeExcessive: boolean;
}

export type NoSmokingSignsInputs = CabinSignsInputs;
export type SeatBeltsSignsInputs = CabinSignsInputs;

/**
 * The SEAT BELTS and NO SMOKING sw work alike: ON, AUTO on slats or main gear extended, OFF; an excessive cabin altitude
 * turns both signs on regardless of the switch.
 * @returns the signs of the switch are on
 */
function areCabinSignsOn(inputs: CabinSignsInputs): boolean {
  switch (inputs.switchPosition) {
    case CabinSignsSwitchPosition.On:
      return true;
    case CabinSignsSwitchPosition.Auto:
      return inputs.slatsExtended || inputs.mainGearExtended || inputs.cabinAltitudeExcessive;
    default:
      return inputs.cabinAltitudeExcessive;
  }
}

/** @returns the cabin NO SMOKING signs are on */
export function areNoSmokingSignsOn(inputs: NoSmokingSignsInputs): boolean {
  return areCabinSignsOn(inputs);
}

/** @returns the cabin FASTEN SEAT BELT signs are on (no engine term: the AUTO position only looks at slats and gear) */
export function areSeatBeltsSignsOn(inputs: SeatBeltsSignsInputs): boolean {
  return areCabinSignsOn(inputs);
}

/** The sim only has a toggle event for its seat belt signs: wait this long for a toggle to show before another one */
const SEAT_BELTS_TOGGLE_SETTLE_TIME_MS = 1000;

/**
 * The slats are extended: no SFCC with a valid slat/flap actual position word reports them retracted (bit 12, the bit
 * the FWS reads for "slats retracted").
 * @param sfccWords the slat/flap actual position words of SFCC 1 and 2
 */
export function areSlatsExtended(sfccWords: readonly Arinc429WordData[]): boolean {
  const validWords = sfccWords.filter((word) => word.isNormalOperation());
  return validWords.length > 0 && validWords.every((word) => !word.bitValueOr(12, false));
}

/**
 * Writes L:A32NX_NO_SMOKING_MEMO (the cabin NO SMOKING signs are on) and sets A:CABIN SEATBELTS ALERT SWITCH (the cabin
 * FASTEN SEAT BELT signs are on).
 */
export class CabinSigns implements Instrument {
  private readonly cabinAltitudeWord = Arinc429Register.empty();

  private readonly landingElevationWord = Arinc429Register.empty();

  private readonly sfcc1Word = Arinc429Register.empty();

  private readonly sfcc2Word = Arinc429Register.empty();

  private signsOn: boolean | null = null;

  /** Date.now() of the last K:CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE */
  private lastSeatBeltsToggleTime = 0;

  /** @inheritdoc */
  init(): void {}

  /** @inheritdoc */
  onUpdate(): void {
    const cabinAltitudeFt = readCabinAltitudeFt((name) => this.cabinAltitudeWord.setFromSimVar(name));
    this.landingElevationWord.setFromSimVar('L:A32NX_FM1_LANDING_ELEVATION');
    const landingElevationFt = this.landingElevationWord.isNormalOperation() ? this.landingElevationWord.value : null;
    this.sfcc1Word.setFromSimVar('L:A32NX_SFCC_1_SLAT_FLAP_ACTUAL_POSITION_WORD');
    this.sfcc2Word.setFromSimVar('L:A32NX_SFCC_2_SLAT_FLAP_ACTUAL_POSITION_WORD');
    const mainGearExtended = [
      'L:A32NX_LGCIU_1_LEFT_GEAR_DOWNLOCKED',
      'L:A32NX_LGCIU_2_LEFT_GEAR_DOWNLOCKED',
      'L:A32NX_LGCIU_1_RIGHT_GEAR_DOWNLOCKED',
      'L:A32NX_LGCIU_2_RIGHT_GEAR_DOWNLOCKED',
    ].some((name) => SimVar.GetSimVarValue(name, SimVarValueType.Bool) > 0);

    const slatsExtended = areSlatsExtended([this.sfcc1Word, this.sfcc2Word]);
    const cabinAltitudeExcessive = isCabinAltitudeExcessive(cabinAltitudeFt, landingElevationFt);

    const signsOn = areNoSmokingSignsOn({
      switchPosition: SimVar.GetSimVarValue('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', SimVarValueType.Number),
      slatsExtended,
      mainGearExtended,
      cabinAltitudeExcessive,
    });
    // written on a change only: sound.xml chimes in the cabin on every change of the variable
    if (signsOn !== this.signsOn) {
      this.signsOn = signsOn;
      SimVar.SetSimVarValue('L:A32NX_NO_SMOKING_MEMO', SimVarValueType.Bool, signsOn);
    }

    const seatBeltsOn = areSeatBeltsSignsOn({
      switchPosition: SimVar.GetSimVarValue('L:XMLVAR_SWITCH_OVHD_INTLT_SEATBELT_Position', SimVarValueType.Number),
      slatsExtended,
      mainGearExtended,
      cabinAltitudeExcessive,
    });
    const now = Date.now();
    if (
      seatBeltsOn !== SimVar.GetSimVarValue('A:CABIN SEATBELTS ALERT SWITCH', SimVarValueType.Bool) > 0 &&
      now - this.lastSeatBeltsToggleTime >= SEAT_BELTS_TOGGLE_SETTLE_TIME_MS
    ) {
      this.lastSeatBeltsToggleTime = now;
      SimVar.SetSimVarValue('K:CABIN_SEATBELTS_ALERT_SWITCH_TOGGLE', SimVarValueType.Number, 0);
    }
  }
}
