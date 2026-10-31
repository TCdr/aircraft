// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import {
  FwsNavSensorAlerts,
  ILS_FAULT_INOP_SYS_APPR_LDG,
  isAdrDataDegraded,
  landingSystemAlerts,
  LS_FAULT_INOP_SYS_APPR_LDG,
  mmrFunctionAlerts,
  NavSensorAlertInputs,
  readNavSensorAlertInputs,
  SIDESLIP_PROBE_INOP_SYS,
  STATIC_PROBE_FAULT_INFO,
  staticProbeInopSys,
  staticProbeLines,
  StaticProbes,
} from './FwsNavSensorAlerts';
import {
  EcamAbnormalProcedures,
  EcamInfos,
  EcamInopSys,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws } from './FwsSpecFixture';

/** The text of a line of an EcamMessages table, without its colour code */
function tableText(table: 'EcamInopSys' | 'EcamInfos', key: string): string | undefined {
  const text = (table === 'EcamInopSys' ? EcamInopSys : EcamInfos)[key];
  // eslint-disable-next-line no-control-regex
  return text?.replace(/^\x1b<\d+m/, '');
}

/** The names of the lines of a procedure of ata34.ts, and its title without colour and system codes */
function procedure(code: number): { title: string; items: string[] } {
  const message = EcamAbnormalProcedures[code];
  expect(message).toBeDefined();
  // eslint-disable-next-line no-control-regex
  return { title: message.title.replace(/^\x1b<\d+m\x1b4m/, ''), items: message.items.map((item) => item.name) };
}

const clear: StaticProbes = { left: false, right: false };

const nominal: NavSensorAlertInputs = {
  mmrFailed: [false, false],
  ilsReceiverFailed: [false, false],
  flsFunctionFailed: [false, false],
  glsFunctionFailed: [false, false],
  staticProbes: [clear, clear, clear],
  sideslipProbeFailed: [false, false, false],
  adrComputedAirspeedKt: [0, 0, 0],
  onGround: true,
  allEnginesShutDown: true,
};

function alertsWith(inputs: Partial<NavSensorAlertInputs>): FwsNavSensorAlerts {
  const alerts = new FwsNavSensorAlerts();
  alerts.update({ ...nominal, ...inputs });
  return alerts;
}

describe('NAV FLS and GLS FAULT', () => {
  it('gives FLS (GLS) 1(2)(1+2) FAULT for the failed function of a working MMR', () => {
    expect(mmrFunctionAlerts([false, false], [true, false])).toEqual({ one: true, two: false, oneAndTwo: false });
    expect(mmrFunctionAlerts([false, false], [false, true])).toEqual({ one: false, two: true, oneAndTwo: false });
    expect(mmrFunctionAlerts([false, false], [true, true])).toEqual({ one: false, two: false, oneAndTwo: true });
  });

  it('leaves the MMR failed as a whole to NAV LS FAULT', () => {
    expect(mmrFunctionAlerts([true, false], [true, false])).toEqual({ one: false, two: false, oneAndTwo: false });
    expect(mmrFunctionAlerts([true, false], [true, true])).toEqual({ one: false, two: true, oneAndTwo: false });
  });

  it('sets the subjects from the FLS and GLS function failures', () => {
    const fls = alertsWith({ flsFunctionFailed: [false, true] });
    expect([fls.fls1Fault.get(), fls.fls2Fault.get(), fls.fls1And2Fault.get()]).toEqual([false, true, false]);
    expect([fls.gls1Fault.get(), fls.gls2Fault.get(), fls.gls1And2Fault.get()]).toEqual([false, false, false]);
    const gls = alertsWith({ glsFunctionFailed: [true, true] });
    expect([gls.gls1Fault.get(), gls.gls2Fault.get(), gls.gls1And2Fault.get()]).toEqual([false, false, true]);
  });

  it('reads the function failures of the flyPad', () => {
    const inputs = readNavSensorAlertInputs(
      () => 0,
      (failure) => failure === A380Failure.Mmr2FlsFunction || failure === A380Failure.Mmr1GlsFunction,
      true,
    );
    expect(inputs.flsFunctionFailed).toEqual([false, true]);
    expect(inputs.glsFunctionFailed).toEqual([true, false]);
  });

  it('lists FLS and GLS FAULT with their STATUS and crew awareness level', () => {
    const { core } = createFws();
    const alerts: [string, 'fls1Fault', string[], string][] = [
      ['340800075', 'fls1Fault', ['340300077'], 'FLS 1 FAULT'],
      ['340800076', 'fls2Fault', ['340300078'], 'FLS 2 FAULT'],
      ['340800077', 'fls1And2Fault', ['340300079'], 'FLS 1+2 FAULT'],
      ['340800030', 'gls1Fault', ['220300010', '340300080'], 'GLS 1 FAULT'],
      ['340800031', 'gls2Fault', ['220300010', '340300081'], 'GLS 2 FAULT'],
      ['340800032', 'gls1And2Fault', ['340300082'], 'GLS 1+2 FAULT'],
    ] as any;
    for (const [key, subject, inop, title] of alerts) {
      const entry = core.abnormalSensed.ewdAbnormalSensed[key];
      expect(entry.simVarIsActive).toBe(core.navSensorAlerts[subject]);
      expect(entry.inopSysApprLdg?.([])).toEqual(inop);
      expect(entry.failure).toBe(1);
      expect(procedure(Number(key)).title).toBe('NAV\x1bm ' + title);
    }
    for (const [key, text] of [
      ['340300077', 'FLS 1'],
      ['340300078', 'FLS 2'],
      ['340300079', 'FLS 1+2'],
      ['340300080', 'GLS 1'],
      ['340300081', 'GLS 2'],
      ['340300082', 'GLS 1+2'],
    ]) {
      expect(tableText('EcamInopSys', key)).toBe(text);
    }
  });
});

describe('NAV LS and ILS FAULT', () => {
  it('gives LS 1(2)(1+2) FAULT for the failed MMRs', () => {
    expect(landingSystemAlerts([true, false], [false, false]).ls).toEqual({ one: true, two: false, oneAndTwo: false });
    expect(landingSystemAlerts([false, true], [false, false]).ls).toEqual({ one: false, two: true, oneAndTwo: false });
    expect(landingSystemAlerts([true, true], [false, false]).ls).toEqual({ one: false, two: false, oneAndTwo: true });
  });

  it('gives ILS FAULT for a failed ILS receiver of a working MMR only', () => {
    expect(landingSystemAlerts([false, false], [true, false]).ils).toEqual({ one: true, two: false, oneAndTwo: false });
    expect(landingSystemAlerts([false, false], [true, true]).ils).toEqual({ one: false, two: false, oneAndTwo: true });
    // MMR 1 failed (LS 1 FAULT) with its ILS receiver: no ILS 1 FAULT
    expect(landingSystemAlerts([true, false], [true, false]).ils).toEqual({ one: false, two: false, oneAndTwo: false });
    // MMR 1 failed and the ILS receiver of MMR 2: LS 1 FAULT and ILS 2 FAULT
    const mixed = landingSystemAlerts([true, false], [false, true]);
    expect(mixed.ls.one).toBe(true);
    expect(mixed.ils).toEqual({ one: false, two: true, oneAndTwo: false });
  });

  it('reads the MMR and ILS receiver failures', () => {
    const inputs = readNavSensorAlertInputs(
      () => 0,
      (failure) => failure === A380Failure.Mmr2 || failure === A380Failure.Ils1Receiver,
      true,
    );
    expect(inputs.mmrFailed).toEqual([false, true]);
    expect(inputs.ilsReceiverFailed).toEqual([true, false]);
    const alerts = alertsWith(inputs);
    expect(alerts.ls2Fault.get()).toBe(true);
    expect(alerts.ils1Fault.get()).toBe(true);
  });
});

describe('NAV STATIC PROBE FAULT and NAV ADR 1+2+3 DATA DEGRADED', () => {
  it('names the obstructed probes of each ADR in the lines and the STATUS', () => {
    const probes = [{ left: true, right: false }, clear, { left: true, right: true }];
    expect(staticProbeLines(probes)).toEqual([true, false, false, false, false, false, false, false, true]);
    expect(staticProbeInopSys(probes)).toEqual(['340300068', '340300076']);
    const alerts = alertsWith({ staticProbes: [probes[0], probes[1], probes[2]] });
    expect(alerts.staticProbeFault.get()).toBe(true);
    expect(alerts.adrDataDegraded.get()).toBe(false);
  });

  it('gives DATA DEGRADED instead with the three left or the three right probes', () => {
    const left = { left: true, right: false };
    expect(isAdrDataDegraded([left, left, left])).toBe(true);
    expect(isAdrDataDegraded([left, left, { left: false, right: true }])).toBe(false);
    const alerts = alertsWith({ staticProbes: [left, left, left] });
    expect(alerts.adrDataDegraded.get()).toBe(true);
    expect(alerts.staticProbeFault.get()).toBe(false);
  });

  it('reads each probe failure of each ADR', () => {
    const inputs = readNavSensorAlertInputs(
      () => 0,
      (failure) => failure === A380Failure.Adr2RightStaticProbe,
      true,
    );
    expect(inputs.staticProbes).toEqual([clear, { left: false, right: true }, clear]);
  });
});

describe('NAV SIDESLIP PROBE FAULT', () => {
  it('follows each probe failure', () => {
    const inputs = readNavSensorAlertInputs(
      () => 0,
      (failure) => failure === A380Failure.SideslipProbe3,
      true,
    );
    const alerts = alertsWith(inputs);
    expect(alerts.sideslipProbeFault.map((s) => s.get())).toEqual([false, false, true]);
  });
});

describe('NAV RESIDUAL AIR SPEED ON ADR', () => {
  it('needs the aircraft on ground with all engines shut down and more than 80 kt', () => {
    expect(alertsWith({ adrComputedAirspeedKt: [85, 79, null] }).residualAirSpeed.map((s) => s.get())).toEqual([
      true,
      false,
      false,
    ]);
    expect(alertsWith({ adrComputedAirspeedKt: [85, 0, 0], allEnginesShutDown: false }).residualAirSpeed[0].get()).toBe(
      false,
    );
    expect(alertsWith({ adrComputedAirspeedKt: [85, 0, 0], onGround: false }).residualAirSpeed[0].get()).toBe(false);
  });

  it('reads the ADR airspeed words and the engine states', () => {
    const word85kt = Arinc429Word.getRawWord(85, Arinc429SignStatusMatrix.NormalOperation);
    const read = (name: string) => {
      if (name === 'L:A32NX_ADIRS_ADR_2_COMPUTED_AIRSPEED') {
        return word85kt;
      }
      return name === 'L:A32NX_ENGINE_STATE:3' ? 1 : 0;
    };
    const inputs = readNavSensorAlertInputs(read, () => false, true);
    expect(inputs.adrComputedAirspeedKt).toEqual([null, 85, null]);
    expect(inputs.allEnginesShutDown).toBe(false);
  });
});

describe('the NAV landing system and probe alert texts', () => {
  it('has the procedures and the STATUS lines', () => {
    expect(procedure(340800063).title).toContain('RESIDUAL AIR SPEED ON ADR 1');
    expect(procedure(340800073).title).toContain('RESIDUAL AIR SPEED ON ADR 2');
    expect(procedure(340800074).title).toContain('RESIDUAL AIR SPEED ON ADR 3');
    // 9 probe lines and IAS/ALT MAYBE NOT RELIABLE
    const staticProbe = procedure(340800067);
    expect(staticProbe.items).toHaveLength(10);
    expect(staticProbe.items).toContain('L+R ADR 3 STAT PROBE');
    const inopSys = [
      ...LS_FAULT_INOP_SYS_APPR_LDG.ls1,
      ...LS_FAULT_INOP_SYS_APPR_LDG.ls2,
      ...LS_FAULT_INOP_SYS_APPR_LDG.ls1And2,
      ...ILS_FAULT_INOP_SYS_APPR_LDG.ils1,
      ...ILS_FAULT_INOP_SYS_APPR_LDG.ils2,
      ...ILS_FAULT_INOP_SYS_APPR_LDG.ils1And2,
      ...SIDESLIP_PROBE_INOP_SYS,
      ...staticProbeInopSys([
        { left: true, right: true },
        { left: true, right: false },
        { left: false, right: true },
      ]),
    ];
    expect(inopSys.filter((code) => tableText('EcamInopSys', code) === undefined)).toEqual([]);
    expect(tableText('EcamInopSys', '340300076')).toBe('L+R ADR 3 STAT PROBE');
    expect(tableText('EcamInfos', STATIC_PROBE_FAULT_INFO)).toBe('IAS/ALT MAYBE NOT RELIABLE');
  });
});
