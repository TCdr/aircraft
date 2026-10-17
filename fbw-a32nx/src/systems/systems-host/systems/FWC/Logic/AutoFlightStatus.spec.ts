// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { autoPilotOffInvoluntaryStatus, autoThrustOffInvoluntaryStatus } from './AutoFlightStatus';
import { ewdTexts, pseudoFwcItem, statusLines } from './FwcAlertSpecHelpers';

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

/* FAC 1+2 FAULT: use the rudder with care above 160 kt. */
describe('AUTO FLT FAC 1+2 FAULT', () => {
  it('says RUD WITH CARE ABV 160 KT', () => {
    expect(ewdTexts(['220020502'])).toEqual(['\x1b<5mRUD WITH CARE ABV 160 KT']);
  });
});

/* An AP disengagement by other means than the takeover pb has a STATUS: INOP SYS the affected AP, and CAT 2 if
   both APs are lost. */
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
