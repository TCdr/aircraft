// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  AirDataSwitchingKnob,
  Arinc429SignStatusMatrix,
  Arinc429Word,
  AttHdgSwitchingKnob,
} from '@flybywiresim/fbw-sdk';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage, orderStatusCodes } from '../../../../shared/src/StatusMessages';
import { StatusLines } from './CondStatus';
import {
  AdirsEwdCodes,
  NavStatusCodes,
  adirsFaultAlerts,
  adrDisagreeStatus,
  adrDisagreement,
  adrDualFaultLines,
  adrDualFaultStatus,
  adrFaultLines,
  adrFaultStatus,
  adrTripleFaultLines,
  adrTripleFaultStatus,
  headingDifference,
  irDisagree,
  irDisagreeStatus,
  irDualFaultLines,
  irDualFaultStatus,
  irFaultLines,
  irFaultStatus,
  ra1And2FaultStatus,
  raFaultAlerts,
  raFaultStatus,
  radioAltitudesDisagree,
  readAdirsAlertInputs,
  remainingSourcesDisagree,
  unit3AlertInhibitedInPhase3,
} from './AdirsAlerts';

/** The E/WD texts of the shown lines, without the colour codes */
function ewd(codes: readonly string[], lines: (number | null)[]): string[] {
  return formatEwdMessages(lines.filter((line): line is number => line !== null).map((line) => codes[line])).map(
    // eslint-disable-next-line no-control-regex
    (text) => text.replace(/\x1b<\dm|\x1b4m|\x1bm/g, '').trim(),
  );
}

/** The STATUS page of a set of active alerts, as the FWC builds it (codes merged, each shown once) */
function page(...alerts: StatusLines[]) {
  const texts = formatStatusPage(
    alerts.flatMap((alert) => alert.left),
    alerts.flatMap((alert) => alert.inopSys),
  );
  const lines = (column: string) =>
    // eslint-disable-next-line no-control-regex
    column === '' ? [] : column.split('\r').map((line) => line.replace(/\x1b<\dm|\x1b4m|\x1bm/g, ''));
  return { left: lines(texts.left), right: lines(texts.right) };
}

describe('NAV ADR and IR fault alerts', () => {
  it('gives one alert per number of faulty ADRs (FCOM l.91937, l.92021, l.92196)', () => {
    expect(adirsFaultAlerts([false, true, false], [false, false, false])).toEqual({
      adrFault: [false, true, false],
      adrDualFault: null,
      adrTripleFault: false,
      irFault: [false, false, false],
      irDualFault: null,
    });
    expect(adirsFaultAlerts([true, false, true], [false, false, false]).adrDualFault).toEqual([1, 3]);
    expect(adirsFaultAlerts([true, false, true], [false, false, false]).adrFault).toEqual([false, false, false]);
    const triple = adirsFaultAlerts([true, true, true], [false, false, false]);
    expect(triple.adrTripleFault).toBe(true);
    expect(triple.adrDualFault).toBeNull();
  });

  it('gives one alert per number of faulty IRs and none for three (FCOM l.93316, l.93421)', () => {
    expect(adirsFaultAlerts([false, false, false], [false, false, true]).irFault).toEqual([false, false, true]);
    expect(adirsFaultAlerts([false, false, false], [false, true, true]).irDualFault).toEqual([2, 3]);
    const allIrs = adirsFaultAlerts([false, false, false], [true, true, true]);
    expect(allIrs.irFault).toEqual([false, false, false]);
    expect(allIrs.irDualFault).toBeNull();
  });

  it('shows the NAV ADR 1(2)(3) FAULT actions until they are done (FCOM l.91964-91990)', () => {
    const codes = AdirsEwdCodes.adrFault;
    expect(ewd(codes[1], adrFaultLines(1, AirDataSwitchingKnob.Norm, true))).toEqual([
      'NAV ADR 1 FAULT',
      '-AIR DATA SWTG...CAPT 3',
      '-ADR 1 P/B..........OFF',
    ]);
    expect(ewd(codes[1], adrFaultLines(1, AirDataSwitchingKnob.Capt, false))).toEqual(['NAV ADR 1 FAULT']);
    expect(ewd(codes[2], adrFaultLines(2, AirDataSwitchingKnob.Norm, true))).toEqual([
      'NAV ADR 2 FAULT',
      '-AIR DATA SWTG....F/O 3',
      '-ADR 2 P/B..........OFF',
      '-BARO REF.........CHECK',
    ]);
    // ADR 3: AIR DATA SWTG NORM only while the ADR 3 is in use
    expect(ewd(codes[3], adrFaultLines(3, AirDataSwitchingKnob.Norm, true))).toEqual([
      'NAV ADR 3 FAULT',
      '-ADR 3 P/B..........OFF',
    ]);
    expect(ewd(codes[3], adrFaultLines(3, AirDataSwitchingKnob.Fo, false))).toEqual([
      'NAV ADR 3 FAULT',
      '-AIR DATA SWTG.....NORM',
    ]);
  });

  it('shows the NAV ADR 1+2(1+3)(2+3) FAULT actions of the faulty pair (FCOM l.92049-92080)', () => {
    const codes = AdirsEwdCodes.adrDualFault;
    expect(ewd(codes, adrDualFaultLines([1, 2], AirDataSwitchingKnob.Norm, [true, true, true], true, true))).toEqual([
      'NAV ADR 1+2 FAULT',
      '-AIR DATA SWTG...CAPT 3',
      '-ADR 1 P/B..........OFF',
      '-ADR 2 P/B..........OFF',
    ]);
    expect(ewd(codes, adrDualFaultLines([1, 3], AirDataSwitchingKnob.Capt, [true, true, false], true, false))).toEqual([
      'NAV ADR 1+3 FAULT',
      '-AIR DATA SWTG.....NORM',
      '-ATC/XPDR.........SYS 2',
      '-ADR 1 P/B..........OFF',
    ]);
    expect(
      ewd(codes, adrDualFaultLines([2, 3], AirDataSwitchingKnob.Norm, [false, false, false], false, true)),
    ).toEqual(['NAV ADR 2+3 FAULT', '-ATC/XPDR.........SYS 1']);
  });

  it('shows the NAV ADR 1+2+3 FAULT procedure (FCOM l.92222-92240)', () => {
    expect(ewd(AdirsEwdCodes.adrTripleFault, adrTripleFaultLines(true, true, false, true))).toEqual([
      'NAV ADR 1+2+3 FAULT',
      '-AP+FD..............OFF',
      '-A/THR..............OFF',
      '-PROBE/WINDOW HEAT...ON',
      '-ADR 1+2+3 P/B......OFF',
      '-SPD......FLY THE GREEN',
      '-STBY INST.MAY BE UNREL',
      '-ALL ADR OFF PROC.APPLY',
    ]);
    expect(ewd(AdirsEwdCodes.adrTripleFault, adrTripleFaultLines(false, false, true, false))).toEqual([
      'NAV ADR 1+2+3 FAULT',
      '-SPD......FLY THE GREEN',
      '-STBY INST.MAY BE UNREL',
      '-ALL ADR OFF PROC.APPLY',
    ]);
  });

  it('shows the NAV IR 1(2)(3) FAULT actions, none for IR 3 (FCOM l.93343-93354)', () => {
    const codes = AdirsEwdCodes.irFault;
    expect(ewd(codes[1], irFaultLines(1, AttHdgSwitchingKnob.Norm, true))).toEqual([
      'NAV IR 1 FAULT',
      '-ATT HDG SWTG....CAPT 3',
      '-ATC/XPDR.........SYS 2',
    ]);
    expect(ewd(codes[2], irFaultLines(2, AttHdgSwitchingKnob.Fo, false))).toEqual(['NAV IR 2 FAULT']);
    expect(ewd(codes[3], irFaultLines(3, AttHdgSwitchingKnob.Capt, true))).toEqual(['NAV IR 3 FAULT']);
  });

  it('shows the NAV IR 1+2(1+3)(2+3) FAULT ATT HDG action (FCOM l.93444-93451)', () => {
    const codes = AdirsEwdCodes.irDualFault;
    expect(ewd(codes, irDualFaultLines([1, 2], AttHdgSwitchingKnob.Norm))).toEqual([
      'NAV IR 1+2 FAULT',
      '-ATT HDG SWTG....CAPT 3',
    ]);
    expect(ewd(codes, irDualFaultLines([1, 3], AttHdgSwitchingKnob.Capt))).toEqual([
      'NAV IR 1+3 FAULT',
      '-ATT HDG SWTG......NORM',
    ]);
    expect(ewd(codes, irDualFaultLines([2, 3], AttHdgSwitchingKnob.Norm))).toEqual(['NAV IR 2+3 FAULT']);
  });

  it('inhibits the alert of the unit 3 in phase 3 only while it is not in use (FCOM l.91941, l.93320)', () => {
    expect(unit3AlertInhibitedInPhase3(3, false)).toBe(true);
    expect(unit3AlertInhibitedInPhase3(3, true)).toBe(false);
    expect(unit3AlertInhibitedInPhase3(6, false)).toBe(false);
  });

  it('has every E/WD line, at most 24 characters wide', () => {
    const allCodes = [
      ...Object.values(AdirsEwdCodes.adrFault).flat(),
      ...AdirsEwdCodes.adrDualFault,
      ...AdirsEwdCodes.adrTripleFault,
      ...AdirsEwdCodes.adrDisagree,
      ...Object.values(AdirsEwdCodes.irFault).flat(),
      ...AdirsEwdCodes.irDualFault,
      ...AdirsEwdCodes.irDisagree,
      ...AdirsEwdCodes.ra1And2Fault,
      ...AdirsEwdCodes.raDegraded,
    ];
    const texts = formatEwdMessages(allCodes);
    expect(texts.length).toBe(allCodes.length);
    for (const text of texts) {
      // eslint-disable-next-line no-control-regex
      const plain = text.replace(/\x1b<\dm|\x1b4m|\x1bm/g, '');
      expect(plain.trim()).not.toBe('');
      expect(plain.length).toBeLessThanOrEqual(24);
    }
  });
});

describe('NAV ADR and IR STATUS', () => {
  it('knows every STATUS code', () => {
    for (const code of Object.values(NavStatusCodes)) {
      expect(orderStatusCodes([code]), code).toEqual([code]);
    }
  });

  it('gives the ADR 1 FAULT STATUS (FCOM l.91996-91999)', () => {
    expect(page(adrFaultStatus(1))).toEqual({
      left: ['CAT 3 SINGLE ONLY'],
      right: ['INOP SYS', 'CAT 3 DUAL', 'ADR 1', 'GPWS'],
    });
    expect(page(adrFaultStatus(3)).right).toEqual(['INOP SYS', 'CAT 3 DUAL', 'ADR 3']);
  });

  it('gives the ADR 1+3 FAULT STATUS (FCOM l.92131-92183)', () => {
    const status = page(adrDualFaultStatus([1, 3]));
    expect(status.left).toEqual([
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'GPWS LDG FLAP 3......ON',
      'APPR SPD.....VREF+10 KT',
      'LDG DIST PROC....APPLY',
      'L/G..........GRVTY EXTN',
      'BOTH PFD ON SAME FAC',
      'FLS LIMITED TO F-APP + RAW',
    ]);
    expect(status.right).toEqual(
      expect.arrayContaining(['ADR 1+3', 'AP 1+2', 'A/THR', 'ATC/XPDR 1', 'RUD TRV LIM 1', 'GPWS', 'CAT 2']),
    );
    expect(status.right).not.toContain('ATC/XPDR 2');
    expect(page(adrDualFaultStatus([1, 2])).left).not.toContain('BOTH PFD ON SAME FAC');
  });

  it('gives the ADR 1+2+3 FAULT STATUS (FCOM l.92272-92297)', () => {
    const status = page(adrTripleFaultStatus());
    expect(status.left).toEqual([
      'STBY INST..MAY BE UNREL',
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'L/G..........GRVTY EXTN',
    ]);
    expect(status.right).toEqual(
      expect.arrayContaining(['REAC W/S DET', 'ADR 1+2+3', 'RUD TRV LIM', 'YAW DAMPER', 'CAB PR 1+2', 'ATC/XPDR 2']),
    );
  });

  it('gives the IR 1 FAULT and IR 2+3 FAULT STATUS (FCOM l.93374-93389, l.93487-93521)', () => {
    const ir1 = page(irFaultStatus(1));
    expect(ir1.left).toEqual(['CAT 3 SINGLE ONLY', 'IR MAY BE AVAIL IN ATT']);
    expect(ir1.right).toEqual(expect.arrayContaining(['IR 1', 'CAT 3 DUAL', 'GPWS TERR', 'TCAS', 'ATC/XPDR 1']));
    const ir23 = page(irDualFaultStatus([2, 3]));
    expect(ir23.left).toEqual(expect.arrayContaining(['IR MAY BE AVAIL IN ATT', 'FLS LIMITED TO F-APP + RAW']));
    expect(ir23.right).toEqual(expect.arrayContaining(['IR 2+3', 'YAW DAMPER 2', 'TCAS', 'CAT 2', 'ATC/XPDR 2']));
    expect(ir23.right).not.toContain('GPWS TERR');
  });

  it('gives the DISAGREE STATUS without the law lines of F/CTL ALTN LAW (FCOM l.92506-92527, l.93609-93624)', () => {
    expect(page(adrDisagreeStatus()).left).toEqual([
      'APPR PROC:',
      'FOR LDG......USE FLAP 3',
      'GPWS LDG FLAP 3......ON',
      'APPR SPD.....VREF+10 KT',
      'LDG DIST PROC....APPLY',
      'IF NO SPD DISAGREE:',
      'RISK OF UNDUE STALL WARN',
    ]);
    expect(page(irDisagreeStatus()).left).not.toContain('ALTN LAW: PROT LOST');
  });

  it('gives the RA 1(2) FAULT and RA 1 AND 2 FAULT STATUS (FCOM l.93789-93840)', () => {
    expect(page(raFaultStatus(2))).toEqual({ left: ['CAT 2 ONLY'], right: ['INOP SYS', 'RA 2', 'CAT 3'] });
    const dual = page(ra1And2FaultStatus());
    expect(dual.left).toEqual(expect.arrayContaining(['WHEN L/G DN: DIRECT LAW', 'APPR SPD.....VREF+10 KT']));
    expect(dual.right).toEqual(
      expect.arrayContaining(['RA 1+2', 'A/CALL OUT', 'GPWS', 'CAT 2', 'REAC W/S DET', 'TCAS']),
    );
  });
});

describe('NAV RA alerts', () => {
  it('replaces the two RA 1(2) FAULT alerts with RA 1 AND 2 FAULT (FCOM l.93763, l.93829)', () => {
    expect(raFaultAlerts(true, false)).toEqual({ ra1Fault: true, ra2Fault: false, ra1And2Fault: false });
    expect(raFaultAlerts(true, true)).toEqual({ ra1Fault: false, ra2Fault: false, ra1And2Fault: true });
  });

  it('finds the RA heights significantly different (FCOM l.93862)', () => {
    // An RA with direct coupling reads about 0 ft (systems ala52b.rs)
    expect(radioAltitudesDisagree(1500, -6)).toBe(true);
    expect(radioAltitudesDisagree(1500, 1420)).toBe(false);
    expect(radioAltitudesDisagree(100, 80)).toBe(true);
    expect(radioAltitudesDisagree(100, 90)).toBe(false);
    expect(radioAltitudesDisagree(1500, null)).toBe(false);
  });
});

describe('NAV ADR DISAGREE and IR DISAGREE monitoring', () => {
  const adr = (cas: number | null, aoa: number | null) => ({ cas, aoa });

  it('compares the remaining sources after an outlier is rejected', () => {
    expect(remainingSourcesDisagree([250, 210, null], 16)).toBe(true);
    expect(remainingSourcesDisagree([250, 245, null], 16)).toBe(false);
    // three sources with one outlier: the ELACs reject it, the two others agree
    expect(remainingSourcesDisagree([250, 210, 250], 16)).toBe(false);
    // three sources that all differ
    expect(remainingSourcesDisagree([250, 210, 170], 16)).toBe(true);
    expect(remainingSourcesDisagree([250, null, null], 16)).toBe(false);
  });

  it('triggers ADR DISAGREE when an ADR is faulty and the two others differ (FCOM l.92448-92450)', () => {
    // ADR 3 faulty, ADR 1 airspeed erroneous (40 kt low, systems adirs.rs)
    expect(adrDisagreement([adr(210, 4), adr(250, 4), adr(null, null)], false)).toEqual({
      speed: true,
      angleOfAttack: false,
    });
    expect(adrDisagreement([adr(250, 14), adr(250, 4), adr(null, null)], false)).toEqual({
      speed: false,
      angleOfAttack: true,
    });
    // on the ground the AOA threshold is 8 deg
    expect(adrDisagreement([adr(100, 9), adr(100, 3), adr(null, null)], true).angleOfAttack).toBe(false);
    // three valid ADRs with one erroneous: rejected, no alert
    expect(adrDisagreement([adr(210, 4), adr(250, 4), adr(250, 4)], false)).toEqual({
      speed: false,
      angleOfAttack: false,
    });
  });

  it('triggers IR DISAGREE when an IR is failed and the two others differ (FCOM l.93543-93544)', () => {
    const ir = (failed: boolean, heading: number | null) => ({ failed, pitch: 2, roll: 0, heading });
    // IR 3 failed, IR 1 heading erroneous (10 deg, systems adirs.rs)
    expect(irDisagree([ir(false, 110), ir(false, 100), ir(true, null)])).toBe(true);
    expect(irDisagree([ir(false, 100), ir(false, 100), ir(true, null)])).toBe(false);
    // no IR failed: the ELACs reject the erroneous one
    expect(irDisagree([ir(false, 110), ir(false, 100), ir(false, 100)])).toBe(false);
    // across north
    expect(irDisagree([ir(false, 358), ir(false, 2), ir(true, null)])).toBe(false);
    expect(headingDifference(355, 5)).toBe(10);
  });
});

describe('NAV ADR and IR alert inputs', () => {
  it('reads the faults, the switches and the data of the ADIRUs', () => {
    const normal = (value: number) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);
    const failureWarning = Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.FailureWarning);
    const vars = new Map<string, number>([
      ['L:A32NX_ADIRS_ADR_3_FAULT_WARN_DISCRETE', 1],
      ['L:A32NX_ADIRS_IR_2_FAULT_WARN_DISCRETE', 1],
      ['L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON', 1],
      ['L:A32NX_FMGC_2_FD_ENGAGED', 1],
      ['L:A32NX_ADIRS_ADR_1_COMPUTED_AIRSPEED', normal(210)],
      ['L:A32NX_ADIRS_ADR_1_ANGLE_OF_ATTACK', normal(4)],
      ['L:A32NX_ADIRS_ADR_2_COMPUTED_AIRSPEED', normal(250)],
      ['L:A32NX_ADIRS_ADR_3_COMPUTED_AIRSPEED', normal(250)],
      ['L:A32NX_ADIRS_IR_1_PITCH', normal(2)],
      ['L:A32NX_ADIRS_IR_1_HEADING', normal(110)],
      ['L:A32NX_ADIRS_IR_3_PITCH', failureWarning],
    ]);
    const inputs = readAdirsAlertInputs((name) => vars.get(name) ?? 0);

    expect(inputs.adrFaulty).toEqual([false, false, true]);
    expect(inputs.irFaulty).toEqual([false, true, false]);
    expect(inputs.adrPbOn).toEqual([true, false, false]);
    expect(inputs.apOrFdEngaged).toBe(true);
    expect(inputs.probeWindowHeatOn).toBe(false);
    // no data from the faulty ADR 3; a raw 0 word is failure warning
    expect(inputs.adrData).toEqual([
      { cas: 210, aoa: 4 },
      { cas: 250, aoa: null },
      { cas: null, aoa: null },
    ]);
    expect(inputs.irData[0]).toEqual({ failed: false, pitch: 2, roll: null, heading: 110 });
    expect(inputs.irData[1].failed).toBe(true);
    expect(inputs.irData[2].failed).toBe(true);
  });
});
