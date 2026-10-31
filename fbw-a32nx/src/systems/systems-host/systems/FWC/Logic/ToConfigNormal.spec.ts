// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isToConfigSystemStatusNormal, ToConfigSystemStatusInputs } from './ToConfigNormal';
import { installFwcSimVarMocks, normalWord, runFwc } from '../PseudoFwcTestBed';
import { startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const normal: ToConfigSystemStatusInputs = {
  gen12NotOperating: false,
  greenLowPressure: false,
  yellowLowPressure: false,
  blueLowPressure: false,
  eng1PumpPbAuto: true,
  eng2PumpPbAuto: true,
  leftTankPumps1And2LoPr: false,
  rightTankPumps1And2LoPr: false,
};

/* The TO CONFIG test triggers FUEL R(L) TK PUMP 1+2 LO PR; T.O CONFIG NORMAL only without it. */
describe('T.O CONFIG NORMAL system conditions', () => {
  it('is normal with every system normal', () => {
    expect(isToConfigSystemStatusNormal(normal)).toBe(true);
  });

  it.each(['leftTankPumps1And2LoPr', 'rightTankPumps1And2LoPr'] as const)(
    'is not normal with %s (FUEL L(R) TK PUMP 1+2 LO PR)',
    (alert) => {
      expect(isToConfigSystemStatusNormal({ ...normal, [alert]: true })).toBe(false);
    },
  );

  it('keeps the hydraulic and generator conditions', () => {
    expect(isToConfigSystemStatusNormal({ ...normal, gen12NotOperating: true })).toBe(false);
    expect(isToConfigSystemStatusNormal({ ...normal, blueLowPressure: true })).toBe(false);
    expect(isToConfigSystemStatusNormal({ ...normal, eng2PumpPbAuto: false })).toBe(false);
  });
  describe('in the real FWC', () => {
    const TO_CONFIG_BUTTON_BIT = 1 << 17;
    const TAKEOFF_PREPARATION_PHASE = 2;
    let simvars: Map<string, number>;
    let writes: Map<string, unknown>;

    beforeEach(() => {
      ({ simvars, writes } = installFwcSimVarMocks());
    });

    it.each([
      ['left', [2, 5]],
      ['right', [3, 6]],
    ])('the %s wing tank pumps 1+2 LO PR take T.O CONFIG NORMAL away', (_side, pumps) => {
      const { fwc, bus } = startCruiseFwc(simvars, () => {
        simvars.set('L:A32NX_FWC_FLIGHT_PHASE', TAKEOFF_PREPARATION_PHASE);
        simvars.set('L:A32NX_OVHD_HYD_ENG_1_PUMP_PB_IS_AUTO', 1);
        simvars.set('L:A32NX_OVHD_HYD_ENG_2_PUMP_PB_IS_AUTO', 1);
      });
      bus.getPublisher<any>().pub('a32nx_ecp_warning_switch_word', normalWord(TO_CONFIG_BUTTON_BIT), false, true);
      runFwc(fwc, 1);
      expect(writes.get('L:A32NX_TO_CONFIG_NORMAL')).toBe(true);

      for (const pump of pumps) {
        simvars.set(`L:A32NX_FUEL_PUMP_${pump}_LO_PR`, 1);
      }
      runFwc(fwc, 3);
      expect(writes.get('L:A32NX_TO_CONFIG_NORMAL')).toBe(false);
    });
  });
});
