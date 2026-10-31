// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoPilotOffInvoluntaryStatus, autoThrustOffInvoluntaryStatus } from './AutoFlightStatus';
import { ewdTexts, statusLines } from './FwcAlertSpecHelpers';
import { startCruiseFwc } from '../FwcAlertProbe';
import { createFwc, installFwcSimVarMocks, normalWord, runFwc, setHealthyCruise } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

describe('AUTO FLT A/THR OFF (involuntary) STATUS', () => {
  it('CAT 2 ONLY; INOP SYS A/THR and CAT 3', () => {
    expect(statusLines(autoThrustOffInvoluntaryStatus())).toEqual({
      left: ['CAT 2 ONLY'],
      right: ['INOP SYS', 'CAT 3', 'A/THR'],
    });
  });

  it('is the STATUS of the real PseudoFWC involuntary A/THR OFF', () => {
    const item = startCruiseFwc(simvars, undefined, 1).fwc.ewdMessageFailures['2200022'];
    expect(statusLines({ left: item.statusInfo!(), inopSys: item.inopSys!() })).toEqual(
      statusLines(autoThrustOffInvoluntaryStatus()),
    );
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

  it('is the STATUS of the real PseudoFWC involuntary AP OFF, from the FMGC AP Inop bits', () => {
    const { fwc, bus } = createFwc();
    setHealthyCruise(bus, simvars);
    const item = fwc.ewdMessageFailures['2200005'];
    const status = () => statusLines({ left: item.statusInfo!(), inopSys: item.inopSys!() });
    const AP_INOP_BIT = 19;
    const apInopWord = normalWord(1 << (AP_INOP_BIT - 1));
    const publisher = bus.getPublisher<any>();

    // an FMGC that sends no word counts as a lost AP
    runFwc(fwc, 1);
    expect(status()).toEqual(statusLines(autoPilotOffInvoluntaryStatus(true, true)));

    publisher.pub('fmgc1DiscreteWord4', normalWord(), false, true);
    publisher.pub('fmgc2DiscreteWord4', apInopWord, false, true);
    runFwc(fwc, 1);
    expect(status()).toEqual(statusLines(autoPilotOffInvoluntaryStatus(false, true)));

    publisher.pub('fmgc1DiscreteWord4', apInopWord, false, true);
    publisher.pub('fmgc2DiscreteWord4', normalWord(), false, true);
    runFwc(fwc, 1);
    expect(status()).toEqual(statusLines(autoPilotOffInvoluntaryStatus(true, false)));
  });
});
