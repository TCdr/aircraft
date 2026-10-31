// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ALL_DISPLAY_UNITS, DisplayUnitFailure, DisplayUnitID, DisplayUnitToDCBus } from '@shared/CdsDisplayUnits';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

/*
 * CDS CAPT PFD(CAPT ND)(CAPT MFD)(EWD)(SD)(F/O PFD)(F/O ND)(F/O MFD) DU FAULT.
 */

/** The alert id, ECAM name and DU of each DU FAULT alert */
const ALERTS: [string, string, DisplayUnitID][] = [
  ['311800013', 'CAPT PFD', DisplayUnitID.CaptPfd],
  ['311800014', 'CAPT ND', DisplayUnitID.CaptNd],
  ['311800015', 'CAPT MFD', DisplayUnitID.CaptMfd],
  ['311800016', 'EWD', DisplayUnitID.Ewd],
  ['311800017', 'SD', DisplayUnitID.Sd],
  ['311800018', 'F/O PFD', DisplayUnitID.FoPfd],
  ['311800019', 'F/O ND', DisplayUnitID.FoNd],
  ['311800020', 'F/O MFD', DisplayUnitID.FoMfd],
];

/** The INOP SYS id, text and DU of each line of the STATUS (in the aircraft order; none for the SD DU) */
const INOP_SYS: [string, string, DisplayUnitID][] = [
  ['310300005', 'EWD DU', DisplayUnitID.Ewd],
  ['310300006', 'CAPT PFD DU', DisplayUnitID.CaptPfd],
  ['310300007', 'F/O PFD DU', DisplayUnitID.FoPfd],
  ['310300008', 'CAPT ND DU', DisplayUnitID.CaptNd],
  ['310300009', 'F/O ND DU', DisplayUnitID.FoNd],
  ['310300010', 'CAPT MFD DU', DisplayUnitID.CaptMfd],
  ['310300011', 'F/O MFD DU', DisplayUnitID.FoMfd],
];

describe('CDS ... DU FAULT', () => {
  it('has one ECAM procedure per DU: OFF 5 S THEN ON, IF NOT SUCCESSFUL OFF, DU RECONF P/B AVAIL', () => {
    for (const [id, name] of ALERTS) {
      const procedure = EcamAbnormalProcedures[id];
      expect(procedure.title, id).toContain(`CDS\x1bm ${name} DU FAULT`);
      const expected = [`${name} DU`, 'NOT SUCCESSFUL', `${name} DU`, 'DU RECONF P/B AVAIL'];
      if (name === 'SD') {
        expected.push('IF SD DU OFF : F/O RECONF FOR MAILBOX');
      }
      expect(
        procedure.items.map((item) => item.name),
        id,
      ).toEqual(expected);
    }
  });

  it('raises each alert from its DU fault, as a caution (SC, MASTER CAUT) inhibited in phases 3-7, 9, 10', () => {
    const { core } = createFws();
    for (const [id, , du] of ALERTS) {
      const alert = core.abnormalSensed.ewdAbnormalSensed[id];
      expect(alert.simVarIsActive, id).toBe(core.displayUnitFault[du]);
      expect(alert.flightPhaseInhib, id).toEqual([3, 4, 5, 6, 7, 9, 10]);
      expect(alert.failure, id).toBe(2);
    }
  });

  it('computes the DU fault of each DU from its flyPad failure while it is powered', () => {
    for (const du of ALL_DISPLAY_UNITS) {
      const { core, simVars } = createFws(new Set([DisplayUnitFailure[du]]));
      for (const bus of DisplayUnitToDCBus[du]) {
        simVars.set(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 1);
      }
      runFwsCycle(core);
      for (const other of ALL_DISPLAY_UNITS) {
        expect(core.displayUnitFault[other].get(), `${du} failed, ${other}`).toBe(other === du);
      }
    }
  });

  it('raises no DU fault for a failed DU that has no power', () => {
    const { core } = createFws(new Set([DisplayUnitFailure[DisplayUnitID.Ewd]]));
    runFwsCycle(core);
    expect(core.displayUnitFault[DisplayUnitID.Ewd].get()).toBe(false);
  });

  it('has the INOP SYS lines of the STATUS', () => {
    for (const [id, text] of INOP_SYS) {
      expect(EcamInopSys[id], id).toBe(`\x1b<4m${text}`);
    }
  });

  it('shows the INOP SYS line of a DU only while its DU FAULT is active', () => {
    const { core } = createFws();
    const inopSys = core.inopSys.inopSys;
    const activeLines = () => INOP_SYS.filter(([id]) => inopSys[id]?.simVarIsActive.get()).map(([, text]) => text);

    expect(activeLines()).toEqual([]);
    core.displayUnitFault[DisplayUnitID.CaptPfd].set(true);
    expect(activeLines()).toEqual(['CAPT PFD DU']);
    core.displayUnitFault[DisplayUnitID.Sd].set(true); // the SD DU has no INOP SYS line
    expect(activeLines()).toEqual(['CAPT PFD DU']);
    for (const du of ALL_DISPLAY_UNITS) {
      core.displayUnitFault[du].set(true);
    }
    expect(activeLines()).toEqual(INOP_SYS.map(([, text]) => text));
  });
});
