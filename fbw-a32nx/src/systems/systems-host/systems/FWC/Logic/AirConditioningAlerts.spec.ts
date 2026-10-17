// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import {
  CabinPressureAlerts,
  LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS,
  LDG_ELEV_FAULT_KEY,
  LDG_ELEV_FAULT_PHASE_INHIBITION,
  LandingElevationFaultInputs,
  RAM_AIR_ON_MEMO_CODE,
  cpc1And2FaultStatus,
  cpcFaultStatus,
  excessCabinAltitudeStatus,
  isFmgcLandingElevationWordReceived,
  isLandingElevationFault,
  isRamAirOnMemoShown,
  safetyValveOpenLines,
  safetyValveOpenStatus,
} from './AirConditioningAlerts';
import { ewdLines, ewdTexts, pseudoFwcItem, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';

describe('RAM AIR ON memo', () => {
  it('is shown with the RAM AIR pb-sw ON only', () => {
    expect(isRamAirOnMemoShown(true)).toBe(true);
    expect(isRamAirOnMemoShown(false)).toBe(false);
  });

  it('is a green memo', () => {
    expect(ewdTexts([RAM_AIR_ON_MEMO_CODE])).toEqual(['\x1b<3mRAM AIR ON']);
  });

  it('is in the PseudoFWC memos, on the RAM AIR pb-sw', () => {
    const memo = pseudoFwcItem('0000240');
    expect(memo).toContain('isRamAirOnMemoShown');
    expect(memo).toContain(`'${RAM_AIR_ON_MEMO_CODE}'`);
  });
});

/* The alert triggers when the LDG ELEV selector is at AUTO and the landing field elevation of the FMGS is not
   available. Design choice: not available = no FMGC sends the word at all, not "no destination yet" (SSM NCD). */
describe('CAB PR LDG ELEV FAULT', () => {
  // The raw L:A32NX_FM1(2)_LANDING_ELEVATION values recorded in the sim
  const FMGC_NOT_STARTED = 0; // SSM failure warning, the first ~6 s after power-up
  const NO_DESTINATION = 4294967296; // SSM no computed data
  const DESTINATION_ENTERED = 13975420928; // SSM normal operation
  const FAILURE_WARNING_WITH_VALUE = Arinc429Word.getRawWord(1200, Arinc429SignStatusMatrix.FailureWarning);

  /** Both FMGCs as the FWC reads them: healthy unless said otherwise */
  const received = (fm1RawWord: number, fm2RawWord: number, fm1Healthy = true, fm2Healthy = true) =>
    isFmgcLandingElevationWordReceived(
      { rawWord: fm1RawWord, healthy: fm1Healthy },
      { rawWord: fm2RawWord, healthy: fm2Healthy },
    );

  const inputs: LandingElevationFaultInputs = {
    ldgElevSelectorAuto: true,
    cpcOperative: true,
    fmLandingElevationWordReceived: false,
  };

  /** Runs the alert for some seconds at the FwsManager rate (60 ms), returns whether it is active */
  function run(alerts: CabinPressureAlerts, runInputs: LandingElevationFaultInputs, seconds: number): boolean {
    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 60) {
      alerts.update(runInputs, 0.06);
    }
    return alerts.ewdFailures[LDG_ELEV_FAULT_KEY].simVarIsActive.get();
  }

  it('reads the recorded words: NCD and normal operation are an FMGC that works, failure warning is none', () => {
    expect(received(NO_DESTINATION, NO_DESTINATION)).toBe(true);
    expect(received(DESTINATION_ENTERED, DESTINATION_ENTERED)).toBe(true);
    expect(received(FMGC_NOT_STARTED, FMGC_NOT_STARTED)).toBe(false);
    expect(received(FAILURE_WARNING_WITH_VALUE, FMGC_NOT_STARTED)).toBe(false);
    // One FMGC is enough
    expect(received(FMGC_NOT_STARTED, DESTINATION_ENTERED)).toBe(true);
    expect(received(NO_DESTINATION, FMGC_NOT_STARTED)).toBe(true);
  });

  it('counts an unhealthy FMGC as sending nothing, whatever its last word (FMGC lost in flight)', () => {
    expect(received(DESTINATION_ENTERED, DESTINATION_ENTERED, false, false)).toBe(false);
    expect(received(NO_DESTINATION, NO_DESTINATION, false, false)).toBe(false);
    // One healthy FMGC is enough
    expect(received(DESTINATION_ENTERED, DESTINATION_ENTERED, true, false)).toBe(true);
    expect(received(DESTINATION_ENTERED, DESTINATION_ENTERED, false, true)).toBe(true);
    // A healthy FMGC with a failed word still sends nothing
    expect(received(FMGC_NOT_STARTED, DESTINATION_ENTERED, true, false)).toBe(false);
  });

  it('does not trigger before a destination is entered (FMGC words NCD)', () => {
    const fmLandingElevationWordReceived = received(NO_DESTINATION, NO_DESTINATION);
    expect(run(new CabinPressureAlerts(), { ...inputs, fmLandingElevationWordReceived }, 120)).toBe(false);
  });

  it('does not trigger with one FMGC in normal operation and the other failed', () => {
    const fmLandingElevationWordReceived = received(DESTINATION_ENTERED, FMGC_NOT_STARTED);
    expect(run(new CabinPressureAlerts(), { ...inputs, fmLandingElevationWordReceived }, 120)).toBe(false);
  });

  it(`triggers with both FMGCs unhealthy and a stale normal word, after ${LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS} s`, () => {
    const alerts = new CabinPressureAlerts();
    const fmLandingElevationWordReceived = received(DESTINATION_ENTERED, DESTINATION_ENTERED, false, false);
    expect(run(alerts, { ...inputs, fmLandingElevationWordReceived }, LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS - 1)).toBe(
      false,
    );
    expect(run(alerts, { ...inputs, fmLandingElevationWordReceived }, 1)).toBe(true);
  });

  it('does not trigger with one FMGC healthy (stale normal words)', () => {
    const fmLandingElevationWordReceived = received(DESTINATION_ENTERED, DESTINATION_ENTERED, true, false);
    expect(run(new CabinPressureAlerts(), { ...inputs, fmLandingElevationWordReceived }, 120)).toBe(false);
  });

  it(`triggers with both FMGC words in failure warning for ${LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS} s, ends at once`, () => {
    const alerts = new CabinPressureAlerts();
    expect(LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS).toBe(15);
    expect(run(alerts, inputs, LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS - 1)).toBe(false);
    expect(run(alerts, inputs, 1)).toBe(true);
    // An FMGC back (NCD): the alert goes with the next update
    expect(run(alerts, { ...inputs, fmLandingElevationWordReceived: true }, 0.06)).toBe(false);
  });

  it('rides through the FMGC start at power-up (6 s of failure warning, then NCD)', () => {
    const alerts = new CabinPressureAlerts();
    expect(run(alerts, inputs, 6)).toBe(false);
    expect(run(alerts, { ...inputs, fmLandingElevationWordReceived: true }, 120)).toBe(false);
  });

  it('does not trigger with a manual landing elevation, and gives way to CAB PR SYS 1+2 FAULT', () => {
    expect(isLandingElevationFault(inputs, true)).toBe(true);
    expect(isLandingElevationFault(inputs, false)).toBe(false);
    expect(isLandingElevationFault({ ...inputs, ldgElevSelectorAuto: false }, true)).toBe(false);
    expect(isLandingElevationFault({ ...inputs, cpcOperative: false }, true)).toBe(false);
  });

  it('shows LDG ELEV ADJUST, is a caution on the PRESS page, shown in phases 1, 2 and 6 only', () => {
    const alerts = new CabinPressureAlerts();
    alerts.update(inputs, LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS);
    const item = alerts.ewdFailures[LDG_ELEV_FAULT_KEY];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual(['CAB PR LDG ELEV FAULT', ' -LDG ELEV........ADJUST']);
    expect(item.failure).toBe(2);
    expect(LDG_ELEV_FAULT_PHASE_INHIBITION).toEqual([3, 4, 5, 7, 8, 9, 10]);
  });

  it('is in the PseudoFWC alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.cabinPressureAlerts.ewdFailures');
    expect(fwc).toContain('this.cabinPressureAlerts.update(');
  });
});

describe('CAB PR STATUS', () => {
  it('EXCESS CAB ALT: MAX FL 100/MEA-MORA', () => {
    expect(statusLines(excessCabinAltitudeStatus()).left).toEqual(['MAX FL.....100/MEA-MORA']);
  });

  it('SYS 1(2) FAULT: INOP SYS CAB PR 1(2)', () => {
    expect(statusLines(cpcFaultStatus(1)).right).toEqual(['INOP SYS', 'CAB PR 1']);
    expect(statusLines(cpcFaultStatus(2)).right).toEqual(['INOP SYS', 'CAB PR 2']);
  });

  const schedule = [
    'MAN CAB PR CTL',
    'TGT V/S: CLIMB 500 FT/MN',
    'TGT V/S: DESC 300 FT/MN',
    'A/C FL     CAB ALT TGT',
    ' 390           8000',
    ' 350           7000',
    ' 300           5500',
    ' 250           3000',
    '<200              0',
    'DURING FINAL APPR:',
  ];

  it('SYS 1+2 FAULT: MAN CAB PR CTL, the target V/S and cabin altitudes, V/S CTL FULL UP; INOP SYS CAB PR 1+2', () => {
    const page = statusLines(cpc1And2FaultStatus());
    expect(page.left).toEqual([...schedule, 'V/S CTL.........FULL UP']);
    expect(page.right).toEqual(['INOP SYS', 'CAB PR 1+2']);
  });

  it('SAFETY VALVE OPEN: the same with MAN V/S CTL FULL UP, no INOP SYS', () => {
    const page = statusLines(safetyValveOpenStatus());
    expect(page.left).toEqual([...schedule, 'MAN V/S CTL.....FULL UP']);
    expect(page.right).toEqual([]);
  });

  it('MAN CAB PR CTL is an amber underlined title, the targets blue', () => {
    const status = cpc1And2FaultStatus();
    const left = formatStatusPage(status.left, status.inopSys).left.split('\r');
    expect(left[0]).toBe('\x1b<4m\x1b4mMAN CAB PR CTL\x1bm');
    expect(left[1]).toBe('\x1b<5mTGT V/S: CLIMB 500 FT/MN');
  });

  it.each([
    ['2131221', 'excessCabinAltitudeStatus()'],
    ['2131222', 'cpcFaultStatus(1)'],
    ['2131223', 'cpcFaultStatus(2)'],
    ['2131224', 'cpc1And2FaultStatus()'],
    ['2131233', 'safetyValveOpenStatus()'],
  ])('PseudoFWC gives %s its STATUS', (key, status) => {
    expect(pseudoFwcItem(key)).toContain(`...alertStatus(() => ${status})`);
  });
});

/* IF DIFF PR ABV 8 PSI: MODE SEL MAN, MAN V/S CTL AS RQRD, IF UNSUCCESSFUL: A/C FL REDUCE.
   IF DIFF PR BELOW 0 PSI: EXPECT HI CAB RATE, A/C V/S REDUCE. */
describe('CAB PR SAFETY VALVE OPEN lines', () => {
  const shown = (deltaPressure: number, excessPressure = false, auto = true) =>
    safetyValveOpenLines(deltaPressure, excessPressure, auto).filter((line) => line !== null);

  it('only the title between 0 and 8 PSI', () => {
    expect(shown(0.5)).toEqual([0]);
    expect(shown(5)).toEqual([0]);
    expect(shown(8)).toEqual([0]);
    expect(shown(0)).toEqual([0]);
  });

  it('the BELOW 0 PSI branch under 0 PSI', () => {
    expect(shown(-0.2)).toEqual([0, 1, 2, 3]);
    expect(shown(-0.2, true)).toEqual([0, 1, 2]);
  });

  it('the ABV 8 PSI branch above 8 PSI, MODE SEL MAN until MAN is selected', () => {
    expect(shown(8.2)).toEqual([0, 4, 5, 6, 7, 8]);
    expect(shown(8.2, false, false)).toEqual([0, 4, 6, 7, 8]);
  });

  it('the branch titles say 0 and 8 PSI', () => {
    expect(ewdTexts(['213123302', '213123305'])).toEqual([
      '\x1b<7m .IF DIFF PR BELOW 0 PSI:',
      '\x1b<7m .IF DIFF PR ABV 8 PSI:',
    ]);
  });

  it('is the PseudoFWC SAFETY VALVE OPEN lines', () => {
    expect(pseudoFwcItem('2131233')).toContain('safetyValveOpenLines(');
  });
});
