// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure, A380FailureDefinitions } from '@failures';
import { ALL_DISPLAY_UNITS, DisplayUnitFailure, DisplayUnitID, DisplayUnitToDCBus } from '@shared/CdsDisplayUnits';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/*
 * CDS CAPT PFD(CAPT ND)(EWD)(F/O PFD)(F/O ND) DU NOT MONITORED and CDS CAPT (F/O) MAILBOX ACCESS FAULT.
 */

/** The alert id, ECAM name and DU of each DU NOT MONITORED alert (the MFDs and the SD have none) */
const NOT_MONITORED: [string, string, DisplayUnitID][] = [
  ['311800007', 'CAPT PFD', DisplayUnitID.CaptPfd],
  ['311800008', 'CAPT ND', DisplayUnitID.CaptNd],
  ['311800009', 'EWD', DisplayUnitID.Ewd],
  ['311800010', 'F/O PFD', DisplayUnitID.FoPfd],
  ['311800011', 'F/O ND', DisplayUnitID.FoNd],
];

/** A cycle with every DU powered, except the ones of unpoweredDus, and the flyPad failures of failedDus active */
function coreWithDus(failedDus: DisplayUnitID[], unpoweredDus: DisplayUnitID[] = []) {
  const { core, simVars } = createFws(new Set(failedDus.map((du) => DisplayUnitFailure[du])));
  for (const du of ALL_DISPLAY_UNITS) {
    for (const bus of DisplayUnitToDCBus[du]) {
      simVars.set(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 1);
    }
  }
  // A DU is unpowered when both its buses are
  for (const du of unpoweredDus) {
    for (const bus of DisplayUnitToDCBus[du]) {
      simVars.set(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 0);
    }
  }
  runFwsCycle(core);
  return core;
}

describe('CDS ... DU NOT MONITORED', () => {
  it('raises each alert from the monitoring state of its DU, as a crew awareness caution (SC, MASTER CAUT)', () => {
    const { core } = createFws();
    for (const [id, name, du] of NOT_MONITORED) {
      expect(EcamAbnormalProcedures[id].title, id).toContain(`CDS\x1bm ${name} DU NOT MONITORED`);
      const alert = core.abnormalSensed.ewdAbnormalSensed[id];
      expect(alert.simVarIsActive, id).toBe(core.displayUnitNotMonitored[du]);
      expect(alert.flightPhaseInhib, id).toEqual([3, 4, 5, 6, 7, 9, 10]);
      expect(alert.failure, id).toBe(1);
    }
  });

  it('keeps every DU monitored while all DUs work', () => {
    const core = coreWithDus([]);
    for (const du of ALL_DISPLAY_UNITS) {
      expect(core.displayUnitNotMonitored[du].get(), String(du)).toBe(false);
    }
  });

  it('leaves the last working DU of a loop not monitored once the other DUs of the loop failed', () => {
    const core = coreWithDus([DisplayUnitID.CaptNd, DisplayUnitID.CaptMfd, DisplayUnitID.Ewd]);
    expect(core.displayUnitNotMonitored[DisplayUnitID.CaptPfd].get()).toBe(true);
    expect(core.displayUnitNotMonitored[DisplayUnitID.FoPfd].get()).toBe(false);
  });

  it('counts a DU without power as not working, as a failed one', () => {
    // The EWD and the DUs of the captain loop on DC ESS: only the CAPT ND stays powered through DC 1
    const core = coreWithDus([DisplayUnitID.CaptMfd], [DisplayUnitID.CaptPfd, DisplayUnitID.Ewd]);
    expect(core.displayUnitNotMonitored[DisplayUnitID.CaptNd].get()).toBe(true);
  });
});

describe('CDS CAPT (F/O) MAILBOX ACCESS FAULT', () => {
  const ALERTS: [string, string, number, string, number][] = [
    ['313800007', 'CAPT', 0, '310300025', A380Failure.CaptMailboxAccess],
    ['313800008', 'F/O', 1, '310300026', A380Failure.FoMailboxAccess],
  ];

  it('raises each side from its flyPad failure, with the INOP SYS line of the STATUS', () => {
    for (const [id, side, index, inopId, failure] of ALERTS) {
      expect(EcamAbnormalProcedures[id].title, id).toContain(`CDS\x1bm ${side} MAILBOX ACCESS FAULT`);
      const { core } = createFws(new Set([failure]));
      const alert = core.abnormalSensed.ewdAbnormalSensed[id];
      expect(alert.simVarIsActive, id).toBe(core.mailboxAccessFault[index]);
      expect(alert.failure, id).toBe(1);
      expect(EcamInopSys[inopId], inopId).toBe(`\x1b<4m${side} MAILBOX ACCESS`);

      runFwsCycle(core);
      expect(core.mailboxAccessFault[index].get(), id).toBe(true);
      expect(core.mailboxAccessFault[1 - index].get(), id).toBe(false);
    }
  });

  it('has a flyPad failure per side in ATA 31', () => {
    const ids = A380FailureDefinitions.filter(([ata, , name]) => ata === 31 && /ATC mailbox/.test(name));
    expect(ids.map(([, id]) => id)).toEqual([31410, 31411]);
  });

  it('shows the INOP SYS line of a side only while its alert is active', () => {
    const { core } = createFws();
    const inopSys = core.inopSys.inopSys;

    expect(inopSys['310300025'].simVarIsActive.get()).toBe(false);
    expect(inopSys['310300026'].simVarIsActive.get()).toBe(false);
    core.mailboxAccessFault[1].set(true);
    expect(inopSys['310300025'].simVarIsActive.get()).toBe(false);
    expect(inopSys['310300026'].simVarIsActive.get()).toBe(true);
  });
});
