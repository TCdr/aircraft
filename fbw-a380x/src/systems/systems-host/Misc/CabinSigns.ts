// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429WordData } from '@flybywiresim/fbw-sdk';
import { readCabinAltitudeFt } from './CabinOxygenMasks';

/*
 * The cabin NO SMOKING signs (L:A32NX_NO_SMOKING_MEMO: the signs are on, read by the T.O and LDG memos of the FWS and by
 * the cabin chime of sound.xml). A380 FCOM DSC-33-50-10 SIGNS, NO SMOKING sw (a380_fcom.txt l.84079-84098):
 * - ON: "The NO SMOKING signs and the EXIT signs come on in the cabin."
 * - AUTO: "The NO SMOKING signs and the EXIT signs come on automatically in the cabin, when: The slats are extended, or
 *   The main landing gear is extended." (l.84083-84087)
 * - OFF: "The NO SMOKING signs and the EXIT signs go off in the cabin."
 * - Note (l.84095-84098): "In the case of excessive cabin altitude (i.e. if the cabin altitude exceeds the maximum of:
 *   9 550 ft and the landing field elevation + 1 000 ft), then the NO SMOKING signs, the FASTEN SEAT BELT signs, and the
 *   EXIT signs come on in the cabin, regardless of the position of the SEAT BELT sw and of the NO SMOKING sw."
 * The signs are a CIDS function; the CIDS is not modelled, so this module stands in for it. The SEAT BELTS sw keeps its
 * cockpit behavior code (A380_Cockpit_Behavior.xml, MSFS CABIN SEATBELTS ALERT SWITCH).
 */

/** L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position */
export enum NoSmokingSwitchPosition {
  On = 0,
  Auto = 1,
  Off = 2,
}

/** "the maximum of: 9 550 ft and the landing field elevation + 1 000 ft" (l.84095-84096) */
const EXCESSIVE_CABIN_ALTITUDE_MIN_FT = 9550;
const EXCESSIVE_CABIN_ALTITUDE_ABOVE_LANDING_FIELD_FT = 1000;

/**
 * @param cabinAltitudeFt the cabin altitude, null without a valid value
 * @param landingFieldElevationFt the landing field elevation, null without a valid value (then 9 550 ft applies)
 * @returns the cabin altitude is excessive (l.84095-84096)
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

export interface NoSmokingSignsInputs {
  switchPosition: NoSmokingSwitchPosition;
  slatsExtended: boolean;
  mainGearExtended: boolean;
  cabinAltitudeExcessive: boolean;
}

/** @returns the cabin NO SMOKING signs are on */
export function areNoSmokingSignsOn(inputs: NoSmokingSignsInputs): boolean {
  switch (inputs.switchPosition) {
    case NoSmokingSwitchPosition.On:
      return true;
    case NoSmokingSwitchPosition.Auto:
      return inputs.slatsExtended || inputs.mainGearExtended || inputs.cabinAltitudeExcessive;
    default:
      return inputs.cabinAltitudeExcessive;
  }
}

/**
 * The slats are extended: no SFCC with a valid slat/flap actual position word reports them retracted (bit 12, the bit the
 * FWS reads for "slats retracted").
 * @param sfccWords the slat/flap actual position words of SFCC 1 and 2
 */
export function areSlatsExtended(sfccWords: readonly Arinc429WordData[]): boolean {
  const validWords = sfccWords.filter((word) => word.isNormalOperation());
  return validWords.length > 0 && validWords.every((word) => !word.bitValueOr(12, false));
}

/** Writes L:A32NX_NO_SMOKING_MEMO (the cabin NO SMOKING signs are on). */
export class CabinSigns implements Instrument {
  private readonly cabinAltitudeWord = Arinc429Register.empty();

  private readonly landingElevationWord = Arinc429Register.empty();

  private readonly sfcc1Word = Arinc429Register.empty();

  private readonly sfcc2Word = Arinc429Register.empty();

  private signsOn: boolean | null = null;

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

    const signsOn = areNoSmokingSignsOn({
      switchPosition: SimVar.GetSimVarValue('L:XMLVAR_SWITCH_OVHD_INTLT_NOSMOKING_Position', SimVarValueType.Number),
      slatsExtended: areSlatsExtended([this.sfcc1Word, this.sfcc2Word]),
      mainGearExtended,
      cabinAltitudeExcessive: isCabinAltitudeExcessive(cabinAltitudeFt, landingElevationFt),
    });
    // written on a change only: sound.xml chimes in the cabin on every change of the variable
    if (signsOn !== this.signsOn) {
      this.signsOn = signsOn;
      SimVar.SetSimVarValue('L:A32NX_NO_SMOKING_MEMO', SimVarValueType.Bool, signsOn);
    }
  }
}
