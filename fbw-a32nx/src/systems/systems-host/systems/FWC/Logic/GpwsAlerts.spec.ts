// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import {
  GPWS_PHASE_INHIBITION,
  GpwsAlertKeys,
  GpwsAlerts,
  GpwsInputs,
  TERR_STBY_MEMO_CODE,
  gpwsFaultMemory,
  terrStbyMemo,
} from './GpwsAlerts';
import { ewdLines, statusLines } from './FwcAlertSpecHelpers';
import { isAlertTriggered, isMemoActive, startCruiseFwc } from '../FwcAlertProbe';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

/** The simvar values the real PseudoFWC reads (by name) */
let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

const normal: GpwsInputs = {
  sysFault: false,
  sysOff: false,
  terrainFault: false,
  terrainOff: false,
  terrainStandby: false,
};

const active = (alerts: GpwsAlerts, key: string) => alerts.ewdFailures[key].simVarIsActive.get();

/* NAV GPWS FAULT: the GPWS fails; the GPWS OFF line stays after the pb-sw is OFF; STATUS INOP SYS GPWS. */
describe('NAV GPWS FAULT', () => {
  it('triggers on an EGPWC fault with the pb-sw ON, not on the GPWS SYS pb-sw OFF alone', () => {
    expect(gpwsFaultMemory(false, true, false)).toBe(true);
    expect(gpwsFaultMemory(false, true, true)).toBe(false);
  });

  it('stays once the crew sets the pb-sw OFF, and goes with the fault', () => {
    const alerts = new GpwsAlerts();
    alerts.update({ ...normal, sysFault: true });
    alerts.update({ ...normal, sysFault: true, sysOff: true });
    const item = alerts.ewdFailures[GpwsAlertKeys.gpwsFault];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(ewdLines(item)).toEqual(['NAV GPWS FAULT', ' -GPWS...............OFF']);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'GPWS']);
    alerts.update(normal);
    expect(item.simVarIsActive.get()).toBe(false);
  });
});

/* NAV GPWS TERR DET FAULT: the enhanced TCF and TAD modes are inoperative; GPWS TERR OFF; STATUS INOP SYS GPWS TERR. */
describe('NAV GPWS TERR DET FAULT', () => {
  it('triggers on a terrain fault, not on the TERR pb-sw OFF (the TERR OFF memo)', () => {
    const alerts = new GpwsAlerts();
    alerts.update({ ...normal, terrainOff: true });
    expect(active(alerts, GpwsAlertKeys.terrainDetectionFault)).toBe(false);
    alerts.update({ ...normal, terrainFault: true });
    expect(active(alerts, GpwsAlertKeys.terrainDetectionFault)).toBe(true);
  });

  it('asks GPWS TERR OFF until it is done; STATUS INOP SYS GPWS TERR', () => {
    const alerts = new GpwsAlerts();
    alerts.update({ ...normal, terrainFault: true });
    const item = alerts.ewdFailures[GpwsAlertKeys.terrainDetectionFault];
    expect(ewdLines(item)).toEqual(['NAV GPWS TERR DET FAULT', ' -GPWS TERR..........OFF']);
    alerts.update({ ...normal, terrainFault: true, terrainOff: true });
    expect(ewdLines(item)).toEqual(['NAV GPWS TERR DET FAULT']);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).right).toEqual(['INOP SYS', 'GPWS TERR']);
  });

  it('both are cautions shown in phases 2, 6, 7 and 9, raised by the real PseudoFWC from the EGPWC simvars', () => {
    expect(new GpwsAlerts().ewdFailures[GpwsAlertKeys.gpwsFault].failure).toBe(2);
    expect(GPWS_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 8, 10]);
    const fwc = startCruiseFwc(simvars).fwc;
    expect(fwc.ewdMessageFailures[GpwsAlertKeys.gpwsFault].flightPhaseInhib).toEqual(GPWS_PHASE_INHIBITION);
    expect(isAlertTriggered(fwc, GpwsAlertKeys.gpwsFault)).toBe(false);
    expect(isAlertTriggered(fwc, GpwsAlertKeys.terrainDetectionFault)).toBe(false);

    simvars.set('L:A32NX_GPWS_SYS_FAULT', 1);
    simvars.set('L:A32NX_GPWS_TERR_FAULT', 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, GpwsAlertKeys.gpwsFault)).toBe(true);
    expect(isAlertTriggered(fwc, GpwsAlertKeys.terrainDetectionFault)).toBe(true);
  });
});

/* TERR STBY: a green memo shown when an input of the predictive functions is missing or invalid. */
describe('TERR STBY memo', () => {
  it('shows while the EGPWC is in terrain standby', () => {
    expect(terrStbyMemo({ ...normal, terrainStandby: true })).toBe(true);
    expect(terrStbyMemo(normal)).toBe(false);
  });

  it('not with the TERR pb-sw OFF (TERR OFF memo) or a terrain fault (GPWS TERR DET FAULT)', () => {
    expect(terrStbyMemo({ ...normal, terrainStandby: true, terrainOff: true })).toBe(false);
    expect(terrStbyMemo({ ...normal, terrainStandby: true, terrainFault: true })).toBe(false);
  });

  it('follows the inputs of each update', () => {
    const alerts = new GpwsAlerts();
    alerts.update({ ...normal, terrainStandby: true });
    expect(alerts.terrStbyMemo.get()).toBe(true);
    alerts.update(normal);
    expect(alerts.terrStbyMemo.get()).toBe(false);
  });

  it('is a green memo, read from the EGPWC and wired in the PseudoFWC memo list', () => {
    // eslint-disable-next-line no-control-regex
    expect(formatEwdMessages([TERR_STBY_MEMO_CODE])[0]).toMatch(/^\x1b<3m.*TERR STBY/);
    const fwc = startCruiseFwc(simvars).fwc;
    expect(isMemoActive(fwc, '0000546')).toBe(false);
    simvars.set('L:A32NX_EGPWC_TERR_STBY', 1);
    runFwc(fwc, 1);
    expect(isMemoActive(fwc, '0000546')).toBe(true);
    expect(fwc.ewdMessageMemos['0000546'].codesToReturn).toEqual([TERR_STBY_MEMO_CODE]);
  });
});
