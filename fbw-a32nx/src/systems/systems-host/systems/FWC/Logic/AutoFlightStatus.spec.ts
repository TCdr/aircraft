// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { autoPilotOffInvoluntaryStatus, autoThrustOffInvoluntaryStatus } from './AutoFlightStatus';
import { ewdTexts, pseudoFwcItem, statusLines } from './FwcAlertSpecHelpers';

/* A320 FCOM DSC-22_30-90 l.32901: after a non standard A/THR disconnection, "ECAM STATUS MESSAGE: YES"; PRO-ABN-AUTO_FLT
   A/THR OFF STATUS (l.71350-71355): CAT 2 ONLY; INOP SYS A/THR, CAT 3. */
describe('AUTO FLT A/THR OFF (involuntary) STATUS', () => {
  it('CAT 2 ONLY; INOP SYS A/THR and CAT 3', () => {
    expect(statusLines(autoThrustOffInvoluntaryStatus())).toEqual({
      left: ['CAT 2 ONLY'],
      right: ['INOP SYS', 'CAT 3', 'A/THR'],
    });
  });

  it('is the STATUS of the PseudoFWC involuntary A/THR OFF', () => {
    expect(pseudoFwcItem('2200022')).toContain('...alertStatus(autoThrustOffInvoluntaryStatus)');
  });
});

/* A320 FCOM PRO-ABN-AUTO_FLT AUTO FLT FAC 1 + 2 FAULT (l.71494-71498): "RUD WITH CARE ABV 160 KT", "use the rudder with
   care, when the speed is above 160 kt". */
describe('AUTO FLT FAC 1+2 FAULT', () => {
  it('says RUD WITH CARE ABV 160 KT', () => {
    expect(ewdTexts(['220020502'])).toEqual(['\x1b<5mRUD WITH CARE ABV 160 KT']);
  });
});

/* A320 FCOM DSC-22_30-30 AP DISENGAGEMENT (l.28683-28720): "ECAM STATUS MESSAGE" YES for an AP disengagement by other
   means than the takeover pb; PRO-ABN-AUTO_FLT AUTO FLT AP OFF STATUS (l.71389-71400): INOP SYS AP (Affected), CAT 2 (If
   both AP lost). */
describe('AUTO FLT AP OFF (involuntary) STATUS', () => {
  it('INOP SYS AP 1, or AP 2, for the lost AP', () => {
    expect(statusLines(autoPilotOffInvoluntaryStatus(true, false))).toEqual({ left: [], right: ['INOP SYS', 'AP 1'] });
    expect(statusLines(autoPilotOffInvoluntaryStatus(false, true))).toEqual({ left: [], right: ['INOP SYS', 'AP 2'] });
  });

  it('INOP SYS AP 1+2 and CAT 2 when both APs are lost', () => {
    expect(statusLines(autoPilotOffInvoluntaryStatus(true, true))).toEqual({
      left: [],
      right: ['INOP SYS', 'AP 1+2', 'CAT 2'],
    });
  });

  it('no STATUS line when no AP is lost', () => {
    expect(autoPilotOffInvoluntaryStatus(false, false)).toEqual({ left: [], inopSys: [] });
  });

  it('is the STATUS of the PseudoFWC involuntary AP OFF, from the FMGC AP Inop bits', () => {
    const item = pseudoFwcItem('2200005');
    expect(item).toContain('autoPilotOffInvoluntaryStatus(');
    expect(item).toContain('this.fmgc1DiscreteWord4.get().bitValueOr(19, true)');
    expect(item).toContain('this.fmgc2DiscreteWord4.get().bitValueOr(19, true)');
  });
});
