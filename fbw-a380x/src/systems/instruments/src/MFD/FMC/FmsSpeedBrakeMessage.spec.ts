// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { AutoThrustMode, VerticalMode } from '@shared/autopilot';
import { FmgcFlightPhase } from '@shared/flightphase';

import { NXSystemMessages } from '../shared/NXSystemMessages';
import { FmsSpeedBrakeData, fmsSpeedBrakeMessage } from './FmsSpeedBrakeMessage';

/** DES at idle, 300 ft above the path, the speed at the upper limit of the managed range */
const aboveThePathAtIdle: FmsSpeedBrakeData = {
  verticalMode: VerticalMode.DES,
  autoThrustMode: AutoThrustMode.THR_IDLE,
  flightPhase: FmgcFlightPhase.Descent,
  flapHandleIndex: 0,
  speedBrakesExtended: false,
  linearDeviationFt: 300,
  showSpeedMargins: true,
  upperSpeedMarginKt: 310,
  casKt: 310,
};

describe('EXTEND SPD BRK / RETRACT SPD BRK on the MFD', () => {
  it('EXTEND SPD BRK: DES at idle, above the path, with no speed left to trade', () => {
    expect(fmsSpeedBrakeMessage(aboveThePathAtIdle)).toBe(NXSystemMessages.extendSpdBrk);
  });

  it('no EXTEND SPD BRK off DES, off idle, in CONF 3, on the path, or below the upper speed limit', () => {
    expect(fmsSpeedBrakeMessage({ ...aboveThePathAtIdle, verticalMode: VerticalMode.OP_DES })).toBe(null);
    expect(fmsSpeedBrakeMessage({ ...aboveThePathAtIdle, autoThrustMode: AutoThrustMode.SPEED })).toBe(null);
    expect(fmsSpeedBrakeMessage({ ...aboveThePathAtIdle, flapHandleIndex: 3 })).toBe(null);
    expect(fmsSpeedBrakeMessage({ ...aboveThePathAtIdle, linearDeviationFt: 20 })).toBe(null);
    expect(fmsSpeedBrakeMessage({ ...aboveThePathAtIdle, linearDeviationFt: null })).toBe(null);
    expect(fmsSpeedBrakeMessage({ ...aboveThePathAtIdle, casKt: 290 })).toBe(null);
  });

  it('RETRACT SPD BRK: speed brakes out at the level off after DES, below the path, or in CONF 3', () => {
    const extended = { ...aboveThePathAtIdle, speedBrakesExtended: true };
    expect(fmsSpeedBrakeMessage(extended)).toBe(null);
    expect(fmsSpeedBrakeMessage({ ...extended, verticalMode: VerticalMode.ALT_CST_CPT })).toBe(
      NXSystemMessages.retractSpdBrk,
    );
    expect(fmsSpeedBrakeMessage({ ...extended, linearDeviationFt: -200 })).toBe(NXSystemMessages.retractSpdBrk);
    expect(fmsSpeedBrakeMessage({ ...extended, flapHandleIndex: 4 })).toBe(NXSystemMessages.retractSpdBrk);
    expect(
      fmsSpeedBrakeMessage({ ...extended, verticalMode: VerticalMode.ALT, flightPhase: FmgcFlightPhase.Cruise }),
    ).toBe(null);
  });

  it('are white type II messages, as on the PFD', () => {
    for (const message of [NXSystemMessages.extendSpdBrk, NXSystemMessages.retractSpdBrk]) {
      expect(message.isTypeTwo).toBe(true);
      expect(message.isAmber).toBe(false);
    }
    expect(NXSystemMessages.extendSpdBrk.text).toBe('EXTEND SPD BRK');
    expect(NXSystemMessages.retractSpdBrk.text).toBe('RETRACT SPD BRK');
  });

  it('are checked by the FMS advisory messages each cycle', () => {
    const advisory = readFileSync(resolve(__dirname, 'FmsAdvisoryMessages.ts'), 'utf-8');
    expect(advisory).toMatch(/this\.speedBrakeLatch,\s*fmsSpeedBrakeMessage\(readFmsSpeedBrakeData\(/);
  });
});
