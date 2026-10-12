// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isTcasInoperative, SurvSystem } from '../../Misc/Communications/TransponderSystem';
import {
  gpwsFaultItemsToShow,
  isApFdTcasModeInop,
  splitSurvFaults,
  tawsFunctionFaults,
  tcasFaultCondition,
  xpdrFaultCondition,
  XpdrTcasSwitchLine,
} from './FwsSurvAlerts';

interface SurvInputs {
  selected: SurvSystem;
  acEss: boolean;
  ac4: boolean;
  /** L:A32NX_XPDR_n_FAILED: failed (34003/34004) or unpowered */
  xpdr1Failed: boolean;
  xpdr2Failed: boolean;
  /** L:A32NX_TCAS_FAULT of the single sim TCAS computer (the TCAS of the selected system) */
  simTcasFault: boolean;
}

const nominal: SurvInputs = {
  selected: 1,
  acEss: true,
  ac4: true,
  xpdr1Failed: false,
  xpdr2Failed: false,
  simTcasFault: false,
};

/** The FwsCore chain, with the ADR/IR inhibit confirm nodes settled (no ADR/IR fault) and valid radio altimeters */
function survAlerts(i: SurvInputs) {
  const tcas1Inop = isTcasInoperative(1, i.selected, i.xpdr1Failed, i.simTcasFault);
  const tcas2Inop = isTcasInoperative(2, i.selected, i.xpdr2Failed, i.simTcasFault);
  const tcas = splitSurvFaults(
    tcasFaultCondition(1, tcas1Inop, false, i.acEss, i.ac4),
    tcasFaultCondition(2, tcas2Inop, false, i.acEss, i.ac4),
  );
  const xpdr = splitSurvFaults(
    xpdrFaultCondition(1, i.xpdr1Failed, i.acEss, i.ac4),
    xpdrFaultCondition(2, i.xpdr2Failed, i.acEss, i.ac4),
  );
  return {
    tcas1Inop,
    tcas2Inop,
    tcas,
    xpdr,
    // notActiveWhenItemActive of the TCAS FAULT alerts (FwsAbnormalSensed 341800016/17/18)
    tcas1AlertShown: tcas.sys1 && !xpdr.sys1,
    tcas2AlertShown: tcas.sys2 && !xpdr.sys2,
    tcas1And2AlertShown: tcas.sys1And2 && !xpdr.sys1And2,
  };
}

describe('SURV TCAS per system', () => {
  it('raises no TCAS alert in normal operation', () => {
    const a = survAlerts(nominal);
    expect(a.tcas).toEqual({ sys1: false, sys2: false, sys1And2: false });
    expect(a.xpdr).toEqual({ sys1: false, sys2: false, sys1And2: false });
  });

  it('AC ESS lost with SYS 1 selected: no TCAS 2 FAULT, TCAS 1 FAULT gated (ELEC AC ESS BUS FAULT lists TCAS 1)', () => {
    // Transponder.ts: XPDR 1 unpowered; LegacyTcasComputer: the selected TCAS is unpowered -> TCAS fault
    const a = survAlerts({ ...nominal, acEss: false, xpdr1Failed: true, simTcasFault: true });
    expect(a.tcas1Inop).toBe(true);
    expect(a.tcas2Inop).toBe(false);
    expect(a.tcas).toEqual({ sys1: false, sys2: false, sys1And2: false });
    expect(a.xpdr).toEqual({ sys1: false, sys2: false, sys1And2: false });
  });

  it('AC 4 lost with SYS 1 selected: TCAS 2 FAULT gated, TCAS 1 fine', () => {
    const a = survAlerts({ ...nominal, ac4: false, xpdr2Failed: true });
    expect(a.tcas2Inop).toBe(true);
    expect(a.tcas1Inop).toBe(false);
    expect(a.tcas).toEqual({ sys1: false, sys2: false, sys1And2: false });
    expect(a.xpdr.sys2).toBe(false);
  });

  it('takes the TCAS 2 bus from AC 4, not AC 2', () => {
    expect(tcasFaultCondition(2, true, false, false, true)).toBe(true);
    expect(tcasFaultCondition(2, true, false, true, false)).toBe(false);
    expect(tcasFaultCondition(1, true, false, true, false)).toBe(true);
    expect(tcasFaultCondition(1, true, false, false, true)).toBe(false);
  });

  it('gives the sim TCAS fault to the selected system only', () => {
    expect(survAlerts({ ...nominal, selected: 1, simTcasFault: true }).tcas).toEqual({
      sys1: true,
      sys2: false,
      sys1And2: false,
    });
    expect(survAlerts({ ...nominal, selected: 2, simTcasFault: true }).tcas).toEqual({
      sys1: false,
      sys2: true,
      sys1And2: false,
    });
  });

  it('needs a valid radio altimeter', () => {
    expect(tcasFaultCondition(1, true, true, true, true)).toBe(false);
  });
});

describe('SURV XPDR 1(2) FAULT (FCOM a380_fcom.txt:167281-167322)', () => {
  it('XPDR 1 failed: TCAS 1 inop, XPDR 1 FAULT active, TCAS 1 FAULT suppressed', () => {
    // SYS 2 selected: the sim TCAS is fine, TCAS 1 is still lost with XPDR 1
    const a = survAlerts({ ...nominal, selected: 2, xpdr1Failed: true });
    expect(a.tcas1Inop).toBe(true);
    expect(a.tcas2Inop).toBe(false);
    expect(a.xpdr).toEqual({ sys1: true, sys2: false, sys1And2: false });
    expect(a.tcas.sys1).toBe(true);
    expect(a.tcas1AlertShown).toBe(false);
  });

  it('XPDR 1 failed with SYS 1 selected: XPDR 1 FAULT, no TCAS alert shown', () => {
    // LegacyTcasComputer reports a fault when the selected XPDR is failed
    const a = survAlerts({ ...nominal, selected: 1, xpdr1Failed: true, simTcasFault: true });
    expect(a.xpdr.sys1).toBe(true);
    expect(a.tcas1AlertShown).toBe(false);
    expect(a.tcas2AlertShown).toBe(false);
    expect(a.tcas1And2AlertShown).toBe(false);
  });

  it('XPDR 2 failed: XPDR 2 FAULT, TCAS 2 FAULT suppressed', () => {
    const a = survAlerts({ ...nominal, selected: 1, xpdr2Failed: true });
    expect(a.tcas2Inop).toBe(true);
    expect(a.xpdr).toEqual({ sys1: false, sys2: true, sys1And2: false });
    expect(a.tcas2AlertShown).toBe(false);
  });

  it('XPDR 1+2 failed: only XPDR 1+2 FAULT', () => {
    const a = survAlerts({ ...nominal, xpdr1Failed: true, xpdr2Failed: true, simTcasFault: true });
    expect(a.xpdr).toEqual({ sys1: false, sys2: false, sys1And2: true });
    expect(a.tcas.sys1And2).toBe(true);
    expect(a.tcas1AlertShown).toBe(false);
    expect(a.tcas2AlertShown).toBe(false);
    expect(a.tcas1And2AlertShown).toBe(false);
  });

  it('is not raised when the XPDR is only lost with its busbar', () => {
    expect(xpdrFaultCondition(1, true, false, true)).toBe(false);
    expect(xpdrFaultCondition(2, true, true, false)).toBe(false);
    expect(xpdrFaultCondition(1, true, true, false)).toBe(true);
    expect(xpdrFaultCondition(2, true, false, true)).toBe(true);
  });

  it('lists AP/FD TCAS MODE only when the XPDR/TCAS is selected on the failed system', () => {
    expect(isApFdTcasModeInop(1, 1)).toBe(true);
    expect(isApFdTcasModeInop(1, 2)).toBe(false);
    expect(isApFdTcasModeInop(2, 2)).toBe(true);
  });
});

describe('XPDR & TCAS ..... SYS 2(1) line', () => {
  it('is shown when selected on the failed system and the other system is operative, ticked once switched', () => {
    const line = new XpdrTcasSwitchLine(1);
    line.update(true, 1, true);
    expect(line.isShown()).toBe(true);
    expect(line.isChecked(1)).toBe(false);
    // the crew selects SYS 2: the line stays, done
    line.update(true, 2, true);
    expect(line.isShown()).toBe(true);
    expect(line.isChecked(2)).toBe(true);
  });

  it('is not shown when the other system is already selected', () => {
    const line = new XpdrTcasSwitchLine(1);
    line.update(true, 2, true);
    expect(line.isShown()).toBe(false);
  });

  it('is not shown when the other system is not operative', () => {
    const line = new XpdrTcasSwitchLine(2);
    line.update(true, 2, false);
    expect(line.isShown()).toBe(false);
  });

  it('is reset when the alert goes away', () => {
    const line = new XpdrTcasSwitchLine(1);
    line.update(true, 1, true);
    line.update(true, 2, true);
    line.update(false, 2, true);
    line.update(true, 2, true);
    expect(line.isShown()).toBe(false);
  });
});

describe('SURV TAWS 1(2) and GPWS 1(2) FAULT (A380 FCOM l.166421-166498, l.166800-166880)', () => {
  const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
  const core = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
  /** The source of one alert entry of FwsAbnormalSensed, from its id to the end of its object */
  const alertBlock = (id: string) => {
    const start = abnormalSensed.indexOf(`    ${id}: {`);
    expect(start).toBeGreaterThan(0);
    return abnormalSensed.slice(start, abnormalSensed.indexOf('\n    },', start));
  };

  it('GPWS and TERR SYS both failed is the TAWS fault, which replaces the GPWS and TERR SYS faults', () => {
    expect(tawsFunctionFaults(true, true, true)).toEqual({ taws: true, gpws: false, terr: false });
    expect(tawsFunctionFaults(true, false, true)).toEqual({ taws: false, gpws: true, terr: false });
    expect(tawsFunctionFaults(false, true, true)).toEqual({ taws: false, gpws: false, terr: true });
    expect(tawsFunctionFaults(true, true, false)).toEqual({ taws: false, gpws: false, terr: false });
  });

  it('GPWS 1 FAULT lines: SYS 2 if selected on SYS 1 and SYS 2 operative, else CHECK and AS RQRD', () => {
    expect(gpwsFaultItemsToShow(1, 1, false, false)).toEqual([true, false, false]);
    expect(gpwsFaultItemsToShow(1, 2, false, false)).toEqual([false, false, false]);
    expect(gpwsFaultItemsToShow(1, 1, true, false)).toEqual([false, true, true]);
    expect(gpwsFaultItemsToShow(2, 1, false, true)).toEqual([false, true, true]);
  });

  it('the TAWS faults are derived from the GPWS and TERR SYS failures, not from never-written L:vars', () => {
    expect(core).not.toContain('L:A32NX_TAWS_1_FAILED');
    expect(core).not.toContain('L:A32NX_TAWS_2_FAILED');
    expect(core).toContain('tawsFunctionFaults(this.gpws1Failed.get(), this.terrSys1Failed.get(), taws1Powered)');
  });

  it.each([
    ['341800026', 'this.fws.gpws1FaultCond'],
    ['341800027', 'this.fws.gpws2FaultCond'],
  ])('GPWS FAULT %s is wired to %s, phases 3-7, 10, 11 inhibited (PDF p.5623)', (id, condition) => {
    const block = alertBlock(id);
    expect(block).toContain(`simVarIsActive: ${condition},`);
    expect(block).toContain('flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],');
  });

  it('GPWS 1+2 FAULT: [MFD SURV] GPWS ... OFF (l.166493)', () => {
    expect(alertBlock('341800028')).toContain('whichItemsChecked: () => [this.fws.tawsGpwsOff.get()],');
  });
});
