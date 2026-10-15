// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { BC3Messages, computeBC3Message, isCheckEoSpeedSetting } from './FMADefinitions';

function word(bits: number[] = []): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

function bc3(checkSpeedMode: boolean, checkEoSpeedSetting: boolean, tdReached = false): BC3Messages {
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
