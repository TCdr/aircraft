// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import {
  FwsSurvSystemAlerts,
  isReactiveWindshearDetectionLost,
  readSurvSystemAlertInputs,
  SURV_INOP_SYS,
  SurvSystemAlertInputs,
} from './FwsSurvSystemAlerts';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, withoutEcamCodes } from './FwsSpecFixture';

const { core } = createFws();
const alert = (code: number) => core.abnormalSensed.ewdAbnormalSensed[String(code)];

/** Text of an EcamInopSys line, without its ECAM colour code */
function inopSysText(key: string): string | undefined {
  const line = EcamInopSys[key];
  return line === undefined ? undefined : withoutEcamCodes(line);
}

const nominal: SurvSystemAlertInputs = {
  systemLost: [false, false],
  powered: [true, true],
  wxDisplayFailed: [false, false],
  turbulenceFailed: [false, false],
  predictiveWindshearFailed: [false, false],
  linkFailed: false,
  reactiveWindshearDetectionFailed: false,
  primHealthy: [true, true, true],
  adrFaulty: [false, false, false],
  irFaulty: [false, false, false],
};

function alertsWith(inputs: Partial<SurvSystemAlertInputs>): FwsSurvSystemAlerts {
  const alerts = new FwsSurvSystemAlerts();
  alerts.update({ ...nominal, ...inputs });
  return alerts;
}

describe('SURV SYS 1(2)(1+2) FAULT', () => {
  it('follows the lost systems, with their busbar powered', () => {
    const one = alertsWith({ systemLost: [true, false], wxDisplayFailed: [true, false] });
    expect([one.survSys1Fault.get(), one.survSys2Fault.get(), one.survSys1And2Fault.get()]).toEqual([
      true,
      false,
      false,
    ]);
    // the WXR of the lost system gives no WXR 1 FAULT
    expect(one.wxr1Fault.get()).toBe(false);
    const both = alertsWith({ systemLost: [true, true] });
    expect(both.survSys1And2Fault.get()).toBe(true);
    expect(both.survSys1Fault.get()).toBe(false);
    // unpowered: an ELEC alert, not SURV SYS FAULT
    expect(alertsWith({ systemLost: [true, false], powered: [false, true] }).survSys1Fault.get()).toBe(false);
  });

  it('reads the SURV SYS failures and the AESU resets', () => {
    const read = (name: string) => (name === 'L:A32NX_RESET_PANEL_AESU2' ? 1 : 0);
    const inputs = readSurvSystemAlertInputs(
      read,
      (failure) => failure === A380Failure.SurvSystem1,
      [true, true],
      [false, false, false],
      [false, false, false],
    );
    expect(inputs.systemLost).toEqual([true, true]);
  });
});

describe('SURV WXR, TURB and PRED W/S FAULT', () => {
  it('splits each function fault into its 1, 2 and 1+2 alerts', () => {
    const turb2 = alertsWith({ turbulenceFailed: [false, true] });
    expect([turb2.turb1Fault.get(), turb2.turb2Fault.get(), turb2.turb1And2Fault.get()]).toEqual([false, true, false]);
    const pws = alertsWith({ predictiveWindshearFailed: [true, true] });
    expect(pws.predWs1And2Fault.get()).toBe(true);
    const wxr1 = alertsWith({ wxDisplayFailed: [true, false] });
    expect([wxr1.wxr1Fault.get(), wxr1.wxr2Fault.get()]).toEqual([true, false]);
  });

  it('shows WXR & TAWS SYS 2 while SYS 2 has all its WXR functions, else STATUS & SWTG CHECK when needed', () => {
    const turb1 = alertsWith({ turbulenceFailed: [true, false] });
    expect(turb1.turbFaultItemsToShow(0)).toEqual([true, false, false]);
    // TURB 1 failed and PRED W/S 2 failed: select the SYS as required
    const turb1Pws2 = alertsWith({ turbulenceFailed: [true, false], predictiveWindshearFailed: [false, true] });
    expect(turb1Pws2.turbFaultItemsToShow(0)).toEqual([false, true, true]);
    // PRED W/S 2 failed and TURB 1 failed
    expect(turb1Pws2.predWsFaultItemsToShow(1)).toEqual([false, true, true]);
  });

  it('shows the WXR 1+2 lines while a TURB or PRED W/S function still works', () => {
    expect(alertsWith({ wxDisplayFailed: [true, true] }).wxr1And2FaultItemsToShow()).toEqual([true, true]);
    expect(
      alertsWith({
        wxDisplayFailed: [true, true],
        turbulenceFailed: [true, true],
        predictiveWindshearFailed: [true, true],
      }).wxr1And2FaultItemsToShow(),
    ).toEqual([false, false]);
  });
});

describe('SURV SYS DEGRADED', () => {
  it('follows the link failure while both systems work', () => {
    expect(alertsWith({ linkFailed: true }).survSysDegraded.get()).toBe(true);
    expect(alertsWith({ linkFailed: true, systemLost: [true, false] }).survSysDegraded.get()).toBe(false);
    expect(alertsWith({}).survSysDegraded.get()).toBe(false);
  });
});

describe('SURV REACTIVE W/S DET FAULT', () => {
  it('is lost with its failure, the three PRIMs, the three ADRs or the three IRs', () => {
    expect(isReactiveWindshearDetectionLost(nominal)).toBe(false);
    expect(isReactiveWindshearDetectionLost({ ...nominal, reactiveWindshearDetectionFailed: true })).toBe(true);
    expect(isReactiveWindshearDetectionLost({ ...nominal, primHealthy: [false, false, false] })).toBe(true);
    expect(isReactiveWindshearDetectionLost({ ...nominal, primHealthy: [false, false, true] })).toBe(false);
    expect(isReactiveWindshearDetectionLost({ ...nominal, adrFaulty: [true, true, true] })).toBe(true);
    expect(isReactiveWindshearDetectionLost({ ...nominal, irFaulty: [true, true, false] })).toBe(false);
    expect(alertsWith({ irFaulty: [true, true, true] }).reactiveWsDetFault.get()).toBe(true);
  });
});

describe('the SURV system alert texts and wiring', () => {
  const alertSignals: [number, () => unknown][] = [
    [341800029, () => core.survSystemAlerts.survSys1Fault],
    [341800030, () => core.survSystemAlerts.survSys2Fault],
    [341800031, () => core.survSystemAlerts.survSys1And2Fault],
    [341800032, () => core.survSystemAlerts.survSysDegraded],
    [341800033, () => core.survSystemAlerts.wxr1Fault],
    [341800034, () => core.survSystemAlerts.wxr2Fault],
    [341800035, () => core.survSystemAlerts.wxr1And2Fault],
    [341800036, () => core.survSystemAlerts.turb1Fault],
    [341800038, () => core.survSystemAlerts.turb2Fault],
    [341800039, () => core.survSystemAlerts.turb1And2Fault],
    [341800040, () => core.survSystemAlerts.predWs1Fault],
    [341800041, () => core.survSystemAlerts.predWs2Fault],
    [341800042, () => core.survSystemAlerts.predWs1And2Fault],
    [341800043, () => core.survSystemAlerts.reactiveWsDetFault],
  ];

  it.each(alertSignals)('%i has a procedure and is driven by its FwsSurvSystemAlerts signal', (code, signal) => {
    expect(EcamAbnormalProcedures[String(code)]).toBeDefined();
    expect(alert(code).simVarIsActive).toBe(signal());
  });

  it('has the STATUS lines', () => {
    const all = [
      ...SURV_INOP_SYS.wxr,
      ...SURV_INOP_SYS.xpdr,
      ...SURV_INOP_SYS.tcas,
      ...SURV_INOP_SYS.taws,
      ...SURV_INOP_SYS.turb,
      ...SURV_INOP_SYS.predWs,
      SURV_INOP_SYS.apFdTcasMode,
      SURV_INOP_SYS.survSysDegraded,
      SURV_INOP_SYS.reactiveWsDet,
    ];
    expect(all.filter((code) => inopSysText(code) === undefined)).toEqual([]);
    expect(SURV_INOP_SYS.turb.map(inopSysText)).toEqual(['TURB 1', 'TURB 2', 'TURB 1+2']);
    expect(SURV_INOP_SYS.taws.map(inopSysText)).toEqual(['TAWS 1', 'TAWS 2', 'TAWS 1+2']);
  });

  it('lets SURV SYS 1 FAULT replace the other SURV alerts of SYS 1', () => {
    // TCAS 1, XPDR 1, TERR SYS 1, TAWS 1, GPWS 1 FAULT
    for (const code of [341800016, 341800061, 341800020, 341800023, 341800026]) {
      expect(alert(code).notActiveWhenItemActive).toEqual(expect.arrayContaining(['341800029', '341800031']));
    }
  });

  it('gives no aural and no master light for REACTIVE W/S DET FAULT', () => {
    expect(alert(341800043).failure).toBe(1);
  });
});
