// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import {
  BC3Messages,
  computeBC3Message,
  D1D2Messages,
  getD1D2Lines,
  isCheckEoSpeedSetting,
  isSpeedAtUpperMargin,
  manualTakeoffThrustLabel,
  SpeedBrakeMessage,
  speedBrakeMessage,
  SpeedBrakeMessageInputs,
} from './FMADefinitions';

function word(bits: number[] = []): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

function bc3(
  checkSpeedMode: boolean,
  checkEoSpeedSetting: boolean,
  tdReached = false,
  spdBrk = SpeedBrakeMessage.NONE,
  checkApprSel = false,
): BC3Messages {
  return computeBC3Message(
    false,
    false,
    word(),
    8,
    tdReached,
    false,
    false,
    word(),
    word(),
    checkSpeedMode,
    checkEoSpeedSetting,
    spdBrk,
    checkApprSel,
  );
}

/* A380 FCOM DSC-22-FG-80-80 FMS MESSAGES (LINE 3), a380_fcom.txt l.19236-19247 */
describe('A380X FMA line 3 FMS messages', () => {
  it('shows CHECK SPD MODE when the FMS sets it', () => {
    expect(bc3(false, false)).toBe(BC3Messages.NONE);
    expect(bc3(true, false)).toBe(BC3Messages.CHECK_SPD_MODE);
  });

  it('shows CHECK EO SPD SETTING, before T/D REACHED', () => {
    expect(bc3(false, true)).toBe(BC3Messages.CHECK_EO_SPD_SETTING);
    expect(bc3(false, true, true)).toBe(BC3Messages.CHECK_EO_SPD_SETTING);
  });
});

describe('A380X FMA line 3 speed brake and approach selection messages', () => {
  it('shows EXTEND SPD BRK and RETRACT SPD BRK from the speed brake message, after T/D REACHED', () => {
    expect(bc3(false, false, false, SpeedBrakeMessage.EXTEND)).toBe(BC3Messages.EXTEND_SPD_BRK);
    expect(bc3(false, false, false, SpeedBrakeMessage.RETRACT)).toBe(BC3Messages.RETRACT_SPD_BRK);
    expect(bc3(false, false, true, SpeedBrakeMessage.EXTEND)).toBe(BC3Messages.TD_REACHED);
  });

  it('shows CHECK APPR SEL when the FMS sets it, after CHECK SPD MODE', () => {
    expect(bc3(false, false, false, SpeedBrakeMessage.NONE, true)).toBe(BC3Messages.CHECK_APPR_SEL);
    expect(bc3(true, false, false, SpeedBrakeMessage.NONE, true)).toBe(BC3Messages.CHECK_SPD_MODE);
  });

  it('the FMA passes the speed brake message and CHECK APPR SEL to the line 3 message', () => {
    const fma = readFileSync(resolve(__dirname, 'FMA.tsx'), 'utf-8');
    expect(fma).toMatch(/checkEoSpeedSetting,\s*spdBrkMessage,\s*checkApprSel,\s*\);/);
    expect(fma).toContain("ConsumerSubject.create(this.sub.on('checkApprSel'), false)");
    expect(fma).toContain('speedBrakesExtended: fcdcWord4.bitValueOr(28, false)');
  });
});

/* A380 FCOM DSC-22-FMS-20-110 EXTEND SPD BRK (a380_fcom.txt l.45402-45403), RETRACT SPD BRK (l.46006-46009) */
describe('EXTEND SPD BRK / RETRACT SPD BRK conditions', () => {
  /** In DES at idle, flaps up, speed brakes retracted, 1 000 ft above the path at the upper speed margin */
  const extendCase: SpeedBrakeMessageInputs = {
    desActive: true,
    altOrAltStarActive: false,
    descentOrApproachPhase: true,
    thrustIdle: true,
    flapsConf3OrFull: false,
    speedBrakesExtended: false,
    linearDeviationFt: 1000,
    speedAtUpperMargin: true,
  };

  it('EXTEND SPD BRK above the path in DES at idle with the speed at the upper margin', () => {
    expect(speedBrakeMessage(extendCase)).toBe(SpeedBrakeMessage.EXTEND);
  });

  it('no EXTEND SPD BRK while the speed can still increase, on the path, below it, or without the path', () => {
    expect(speedBrakeMessage({ ...extendCase, speedAtUpperMargin: false })).toBe(SpeedBrakeMessage.NONE);
    // "on the vertical profile when the VERT DEV is less than 50 ft" (l.122395-122397)
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: 50 })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: 51 })).toBe(SpeedBrakeMessage.EXTEND);
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: -800 })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: null })).toBe(SpeedBrakeMessage.NONE);
  });

  it('no EXTEND SPD BRK out of DES, without idle thrust, or at flaps 3 / FULL', () => {
    expect(speedBrakeMessage({ ...extendCase, desActive: false })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, thrustIdle: false })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, flapsConf3OrFull: true })).toBe(SpeedBrakeMessage.NONE);
  });

  it('no message with the speed brakes extended above the path', () => {
    expect(speedBrakeMessage({ ...extendCase, speedBrakesExtended: true })).toBe(SpeedBrakeMessage.NONE);
  });

  it('RETRACT SPD BRK below the path in DES with the speed brakes extended', () => {
    const below = { ...extendCase, speedBrakesExtended: true, linearDeviationFt: -300, speedAtUpperMargin: false };
    expect(speedBrakeMessage(below)).toBe(SpeedBrakeMessage.RETRACT);
    expect(speedBrakeMessage({ ...below, linearDeviationFt: -50 })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...below, speedBrakesExtended: false })).toBe(SpeedBrakeMessage.NONE);
  });

  it('RETRACT SPD BRK at the ALT* / ALT level off in descent, or at flaps 3 / FULL in DES', () => {
    const extended = { ...extendCase, speedBrakesExtended: true, linearDeviationFt: 0 };
    expect(speedBrakeMessage({ ...extended, desActive: false, altOrAltStarActive: true })).toBe(
      SpeedBrakeMessage.RETRACT,
    );
    // ALT in cruise is not a level off after DES
    expect(
      speedBrakeMessage({ ...extended, desActive: false, altOrAltStarActive: true, descentOrApproachPhase: false }),
    ).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extended, flapsConf3OrFull: true })).toBe(SpeedBrakeMessage.RETRACT);
    expect(speedBrakeMessage(extended)).toBe(SpeedBrakeMessage.NONE);
  });

  it('the speed is at the upper margin within 2 kt, only with the margins shown', () => {
    expect(isSpeedAtUpperMargin(true, 300, 298)).toBe(true);
    expect(isSpeedAtUpperMargin(true, 300, 297)).toBe(false);
    expect(isSpeedAtUpperMargin(false, 300, 305)).toBe(false);
    expect(isSpeedAtUpperMargin(true, 300, null)).toBe(false);
  });
});

/* A380 FCOM DSC-22-FMS-20-110 CHECK EO SPD SETTING (a380_fcom.txt l.45016-45025) */
describe('CHECK EO SPD SETTING condition', () => {
  const GD = 220;

  it('applies in CLIMB and CRUISE with the selected speed 10 kt or more away from green dot', () => {
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Climb, false, true, 230, GD)).toBe(true);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, 210, GD)).toBe(true);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, 229, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, 211, GD)).toBe(false);
  });

  it('does not apply in ALT* / ALT, in other phases, in managed speed or with all engines', () => {
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, true, true, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Descent, false, true, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, false, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(false, FmgcFlightPhase.Cruise, false, true, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, null, GD)).toBe(false);
  });
});

/* A380 FCOM DSC-22-FG FMA APPROACH CAPABILITY (COLUMN 4), a380_fcom.txt l.19153-19184: the FCOM words */
describe('A380X FMA approach capability wording', () => {
  it('CAT1, CAT2, CAT3 SINGLE and CAT3 DUAL instead of APPR1, LAND2 and LAND3', () => {
    expect(getD1D2Lines(D1D2Messages.APPR_1)).toEqual(['CAT1', '']);
    expect(getD1D2Lines(D1D2Messages.LAND_2)).toEqual(['CAT2', '']);
    expect(getD1D2Lines(D1D2Messages.LAND_3_SINGLE)).toEqual(['CAT3', 'SINGLE']);
    expect(getD1D2Lines(D1D2Messages.LAND_3_DUAL)).toEqual(['CAT3', 'DUAL']);
  });

  it('F-APP, F-APP +RAW and RAW ONLY unchanged, nothing without a capability', () => {
    expect(getD1D2Lines(D1D2Messages.F_APP)).toEqual(['F-APP', '']);
    expect(getD1D2Lines(D1D2Messages.F_APP_RAW)).toEqual(['F-APP', '+RAW']);
    expect(getD1D2Lines(D1D2Messages.RAW_ONLY)).toEqual(['RAW', 'ONLY']);
    expect(getD1D2Lines(D1D2Messages.NONE)).toEqual(['', '']);
  });
});

describe('A380X FMA manual takeoff thrust label', () => {
  it('MAN DTO with a derated takeoff selected, MAN FLX without', () => {
    expect(manualTakeoffThrustLabel(12)).toBe('DTO');
    expect(manualTakeoffThrustLabel(4)).toBe('DTO');
    expect(manualTakeoffThrustLabel(0)).toBe('FLX');
  });

  it('the FMA reads the selected derate for the MAN FLX message', () => {
    const fma = readFileSync(resolve(__dirname, 'FMA.tsx'), 'utf-8');
    const publisher = readFileSync(resolve(__dirname, 'shared/PFDSimvarPublisher.tsx'), 'utf-8');
    expect(publisher).toContain("takeoffDerate = 'L:A32NX_AIRLINER_TO_DERATE'");
    expect(fma).toContain('manualTakeoffThrustLabel(this.takeoffDerate.get())');
  });
});
