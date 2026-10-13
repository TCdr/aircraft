// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GPWS_PHASE_INHIBITION, GpwsAlertKeys, GpwsAlerts, GpwsInputs, gpwsFaultMemory } from './GpwsAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

const normal: GpwsInputs = { sysFault: false, sysOff: false, terrainFault: false, terrainOff: false };

const active = (alerts: GpwsAlerts, key: string) => alerts.ewdFailures[key].simVarIsActive.get();

/* A320 FCOM PRO-ABN-NAV NAV GPWS FAULT (l.93134-93149): "This alerts triggers when the GPWS fails."; "GPWS ... OFF",
   "This line remains displayed, even after the GPWS pb-sw has been switched OFF."; STATUS INOP SYS GPWS. */
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

/* l.93171-93190: NAV GPWS TERR DET FAULT, "the enhanced TCF and TAD modes of the EGPWS ... are inoperative"; "GPWS TERR
   ... OFF"; STATUS INOP SYS GPWS TERR. */
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

  it('both are cautions shown in phases 2, 6, 7 and 9 (FCOM PDF pages 5650, 5651), wired in the PseudoFWC', () => {
    expect(new GpwsAlerts().ewdFailures[GpwsAlertKeys.gpwsFault].failure).toBe(2);
    expect(GPWS_PHASE_INHIBITION).toEqual([1, 3, 4, 5, 8, 10]);
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('...this.gpwsAlerts.ewdFailures');
    expect(fwc).toContain('this.gpwsAlerts.update(readGpwsInputs())');
  });
});
