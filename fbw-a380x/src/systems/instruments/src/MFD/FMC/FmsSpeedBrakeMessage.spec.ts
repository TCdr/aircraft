// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

// first: the fmgc modules it loads depend on their import order
import { createAdvisoryMessages, withStubbedSimVars } from './FmsAdvisoryMessagesSpecSupport';
import { describe, expect, it, vi } from 'vitest';

// FmsAdvisoryMessages only needs the PI leg class for an instanceof check: the real leg classes import each other in a cycle
vi.mock('@fmgc/guidance/lnav/legs/PI', () => ({ PILeg: class {} }));
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
    const simVars: Record<string, number> = {
      'L:A32NX_FMA_VERTICAL_MODE': VerticalMode.DES,
      'L:A32NX_AUTOTHRUST_MODE': AutoThrustMode.THR_IDLE,
      'L:A32NX_FLAPS_HANDLE_INDEX': 0,
      'L:A32NX_PFD_LINEAR_DEVIATION_ACTIVE': 1,
      'L:A32NX_PFD_TARGET_ALTITUDE': 10000,
      'L:A32NX_PFD_SHOW_SPEED_MARGINS': 1,
      'L:A32NX_PFD_UPPER_SPEED_MARGIN': 310,
    };
    withStubbedSimVars(simVars, () => {
      const { advisoryMessages, queued } = createAdvisoryMessages({
        flightPhase: FmgcFlightPhase.Descent,
        baroAltitudeFt: 10300,
        computedAirspeedKt: 310,
      });
      advisoryMessages.update();
      expect(queued).toEqual([NXSystemMessages.extendSpdBrk]);
    });
  });
});
