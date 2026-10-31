// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WING_ANTI_ICE_CONFIRM_SECONDS,
  WING_ANTI_ICE_PHASE_INHIBITION,
  WingAntiIceAlertKeys,
  WingAntiIceAlerts,
  WingAntiIceInputs,
  WingAntiIceSideInputs,
} from './WingAntiIceAlerts';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownText, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const openWing: WingAntiIceSideInputs = {
  valveClosed: false,
  lowPressure: false,
  highPressure: false,
  engineBleedValveOpen: true,
};

const on: WingAntiIceInputs = {
  pbOn: true,
  valvesCommandedOpen: true,
  sides: [openWing, openWing],
  crossBleedFullyOpen: false,
};

/** Runs the alerts for some seconds in 1 s steps */
function run(inputs: WingAntiIceInputs, seconds: number, alerts = new WingAntiIceAlerts()): WingAntiIceAlerts {
  for (let i = 0; i < seconds; i++) {
    alerts.update(inputs, 1);
  }
  return alerts;
}

const active = (alerts: WingAntiIceAlerts, key: string) => alerts.ewdFailures[key].simVarIsActive.get();

/* WING A.ICE SYS FAULT: the WING ANTI ICE pb-sw is ON and one wing anti ice valve remains closed. The FAULT light and
   the ECAM caution also come on with a low pressure. */
describe('WING A.ICE SYS FAULT', () => {
  const leftClosed: WingAntiIceInputs = { ...on, sides: [{ ...openWing, valveClosed: true }, openWing] };

  it('triggers when a wing valve stays closed with the pb-sw ON, after the confirmation time', () => {
    expect(active(run(leftClosed, WING_ANTI_ICE_CONFIRM_SECONDS - 1), WingAntiIceAlertKeys.sysFault)).toBe(false);
    expect(active(run(leftClosed, WING_ANTI_ICE_CONFIRM_SECONDS), WingAntiIceAlertKeys.sysFault)).toBe(true);
  });

  it('triggers with a low duct pressure', () => {
    const lowPressure = { ...on, sides: [openWing, { ...openWing, lowPressure: true }] } as WingAntiIceInputs;
    expect(active(run(lowPressure, 10), WingAntiIceAlertKeys.sysFault)).toBe(true);
  });

  it('does not trigger when the valves are not commanded open (pb-sw OFF, or after the 30 s ground test)', () => {
    expect(active(run({ ...leftClosed, pbOn: false }, 20), WingAntiIceAlertKeys.sysFault)).toBe(false);
    expect(active(run({ ...leftClosed, valvesCommandedOpen: false }, 20), WingAntiIceAlertKeys.sysFault)).toBe(false);
  });

  it('asks THRUST INCREASE, then WING ANTI ICE OFF', () => {
    const item = run(leftClosed, 10).ewdFailures[WingAntiIceAlertKeys.sysFault];
    expect(ewdLines(item)).toEqual([
      'WING A.ICE SYS FAULT',
      ' -THRUST........INCREASE',
      '   .IF UNSUCCESSFUL:',
      ' -WING ANTI ICE......OFF',
      ' AVOID ICING CONDITIONS',
    ]);
    expect(WING_ANTI_ICE_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8]);
  });

  it('STATUS: AVOID ICING CONDITIONS, the severe ice lines; INOP SYS WING A. ICE', () => {
    const item = run(leftClosed, 10).ewdFailures[WingAntiIceAlertKeys.sysFault];
    const page = statusLines({ left: item.statusInfo(), inopSys: item.inopSys() });
    expect(page.left).toEqual([
      'AVOID ICING CONDITIONS',
      'IF SEVERE ICE ACCRETION:',
      'MIN SPD....VLS+10/G DOT',
      'MANEUVER WITH CARE',
      'LDG DIST PROC....APPLY',
    ]);
    expect(page.right).toEqual(['INOP SYS', 'WING A. ICE']);
  });

  /* WING A.ICE SYS FAULT with the wing anti ice turned on after one engine shutdown or the loss of one bleed: X BLEED
     OPEN. */
  it('without the bleed of the closed wing: the X BLEED OPEN variant instead', () => {
    const noBleed: WingAntiIceInputs = {
      ...on,
      sides: [{ ...openWing, valveClosed: true, engineBleedValveOpen: false }, openWing],
    };
    const alerts = run(noBleed, 10);
    expect(active(alerts, WingAntiIceAlertKeys.sysFault)).toBe(false);
    const item = alerts.ewdFailures[WingAntiIceAlertKeys.sysFaultCrossBleed];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual(['WING A.ICE SYS FAULT', ' -X BLEED...........OPEN']);
    alerts.update({ ...noBleed, crossBleedFullyOpen: true }, 1);
    expect(ewdLines(item)).toEqual(['WING A.ICE SYS FAULT']);
  });
});

/* WING A.ICE L(R) HI PR: pb-sw ON and a high duct pressure; THRUST LIM PENALTY; STATUS THRUST LIM PENALTY,
   INOP SYS WAI REGUL. */
describe('WING A.ICE L(R) HI PR', () => {
  const rightHigh: WingAntiIceInputs = { ...on, sides: [openWing, { ...openWing, highPressure: true }] };

  it('triggers on the side with the high pressure', () => {
    const alerts = run(rightHigh, 10);
    expect(active(alerts, WingAntiIceAlertKeys.rightHighPressure)).toBe(true);
    expect(active(alerts, WingAntiIceAlertKeys.leftHighPressure)).toBe(false);
    const item = alerts.ewdFailures[WingAntiIceAlertKeys.rightHighPressure];
    expect(ewdLines(item)).toEqual(['WING A.ICE R HI PR', ' THRUST LIM PENALTY']);
    const page = statusLines({ left: item.statusInfo(), inopSys: item.inopSys() });
    expect(page.left).toEqual(['THRUST LIM PENALTY']);
    expect(page.right).toEqual(['INOP SYS', 'WAI REGUL']);
  });

  describe('in the real FWC', () => {
    let simvars: Map<string, number>;

    beforeEach(() => {
      ({ simvars } = installFwcSimVarMocks());
    });

    const startWithWingAntiIceOn = () =>
      startCruiseFwc(simvars, () => {
        simvars.set('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED', 1);
        simvars.set('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON', 1);
        simvars.set('L:A32NX_PNEU_ENG_1_PR_VALVE_OPEN', 1);
        simvars.set('L:A32NX_PNEU_ENG_2_PR_VALVE_OPEN', 1);
      });

    it('raises WING A.ICE R HI PR from the duct pressure of the right wing only, with its STATUS', () => {
      const { fwc } = startWithWingAntiIceOn();
      const key = WingAntiIceAlertKeys.rightHighPressure;
      expect(failureItem(fwc, key).flightPhaseInhib).toEqual(WING_ANTI_ICE_PHASE_INHIBITION);
      expect(isAlertTriggered(fwc, key)).toBe(false);

      simvars.set('L:A32NX_PNEU_WING_ANTI_ICE_2_HIGH_PRESSURE', 1);
      runFwc(fwc, WING_ANTI_ICE_CONFIRM_SECONDS + 1);
      expect(isAlertTriggered(fwc, key)).toBe(true);
      expect(isAlertTriggered(fwc, WingAntiIceAlertKeys.leftHighPressure)).toBe(false);
      expect(shownText(fwc, key)).toEqual(['WING A.ICE R HI PR', 'THRUST LIM PENALTY']);
      const item = failureItem(fwc, key);
      const page = statusLines({ left: item.statusInfo?.() ?? [], inopSys: item.inopSys?.() ?? [] });
      expect(page.left).toEqual(['THRUST LIM PENALTY']);
      expect(page.right).toEqual(['INOP SYS', 'WAI REGUL']);
    });

    it('raises WING A.ICE SYS FAULT while a wing anti ice valve of the commanded system stays closed', () => {
      const { fwc } = startWithWingAntiIceOn();
      expect(isAlertTriggered(fwc, WingAntiIceAlertKeys.sysFault)).toBe(false);

      simvars.set('L:A32NX_PNEU_WING_ANTI_ICE_1_VALVE_CLOSED', 1);
      runFwc(fwc, WING_ANTI_ICE_CONFIRM_SECONDS + 1);
      expect(isAlertTriggered(fwc, WingAntiIceAlertKeys.sysFault)).toBe(true);
    });
  });
});
