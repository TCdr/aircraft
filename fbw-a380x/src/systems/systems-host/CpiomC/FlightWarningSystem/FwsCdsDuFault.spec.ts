// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { ALL_DISPLAY_UNITS, DisplayUnitID } from '@shared/CdsDisplayUnits';
import { FwsInopSys } from './FwsInopSys';
import { FwsCore } from './FwsCore';

/*
 * CDS CAPT PFD(CAPT ND)(CAPT MFD)(EWD)(SD)(F/O PFD)(F/O ND)(F/O MFD) DU FAULT (A380 FCOM PRO-ABN-ECAM-10-31,
 * a380_fcom.txt:157885-157978).
 *
 * The EcamMessages tables and FwsAbnormalSensed are read from the source text: importing EcamMessages/index.ts in a test
 * fails (circular import, see FwsElecAlertsStatus.spec.ts), and FwsAbnormalSensed imports it.
 */
const messagesDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ecamMessages = readFileSync(resolve(messagesDir, 'index.ts'), 'utf-8');
const ata31Procedures = readFileSync(resolve(messagesDir, 'AbnormalSensed/ata31-32-33.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');

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

/** The INOP SYS id, text and DU of each line of the STATUS (l.157972-157978, in the FCOM order; none for the SD DU) */
const INOP_SYS: [string, string, DisplayUnitID][] = [
  ['310300005', 'EWD DU', DisplayUnitID.Ewd],
  ['310300006', 'CAPT PFD DU', DisplayUnitID.CaptPfd],
  ['310300007', 'F/O PFD DU', DisplayUnitID.FoPfd],
  ['310300008', 'CAPT ND DU', DisplayUnitID.CaptNd],
  ['310300009', 'F/O ND DU', DisplayUnitID.FoNd],
  ['310300010', 'CAPT MFD DU', DisplayUnitID.CaptMfd],
  ['310300011', 'F/O MFD DU', DisplayUnitID.FoMfd],
];

/** The source text of one entry of an object literal, from its key to the closing brace at the same indentation */
function entry(source: string, key: string, indent: string): string {
  const start = source.indexOf(`\n${indent}${key}: {`);
  if (start < 0) {
    return '';
  }
  return source.slice(start, source.indexOf(`\n${indent}},`, start));
}

/** An FwsCore stand-in: displayUnitFault is a record of Subjects, every other property a boolean Subject */
function fakeFws(): { fws: FwsCore; displayUnitFault: Record<DisplayUnitID, Subject<boolean>> } {
  const displayUnitFault = {} as Record<DisplayUnitID, Subject<boolean>>;
  for (const du of ALL_DISPLAY_UNITS) {
    displayUnitFault[du] = Subject.create(false);
  }
  const subjects: Record<string, Subject<boolean>> = {};
  const fws = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === 'displayUnitFault') {
          return displayUnitFault;
        }
        if (!(name in subjects)) {
          subjects[name] = Subject.create(false);
        }
        return subjects[name];
      },
    },
  ) as unknown as FwsCore;
  return { fws, displayUnitFault };
}

describe('CDS ... DU FAULT (A380 FCOM PRO-ABN-ECAM-10-31)', () => {
  it('has one ECAM procedure per DU: OFF 5 S THEN ON, IF NOT SUCCESSFUL OFF, DU RECONF P/B AVAIL (l.157930-157950)', () => {
    for (const [id, name] of ALERTS) {
      const procedure = entry(ata31Procedures, id, '  ');
      expect(procedure, id).toContain(`CDS\\x1bm ${name} DU FAULT'`);
      const names = [...procedure.matchAll(/name: '([^']*)'/g)].map((m) => m[1]);
      const expected = [`${name} DU`, 'NOT SUCCESSFUL', `${name} DU`, 'DU RECONF P/B AVAIL'];
      if (name === 'SD') {
        expected.push('IF SD DU OFF : F/O DU RECONF P/B FOR ATC MAILBOX'); // l.157950
      }
      expect(names, id).toEqual(expected);
    }
  });

  it('raises each alert from its DU fault, as a caution (SC, MASTER CAUT) inhibited in phases 3-7, 9, 10 (PDF p. 5386)', () => {
    for (const [id, , du] of ALERTS) {
      const alert = entry(abnormalSensed, id, '    ');
      expect(alert, id).toContain(`simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.${DisplayUnitID[du]}],`);
      expect(alert, id).toContain('flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],');
      expect(alert, id).toContain('failure: 2,');
    }
  });

  it('has the INOP SYS lines of the STATUS (l.157972-157978)', () => {
    for (const [id, text] of INOP_SYS) {
      expect(ecamMessages, id).toContain(`  ${id}: '\\x1b<4m${text}',`);
    }
  });

  it('shows the INOP SYS line of a DU only while its DU FAULT is active', () => {
    const { fws, displayUnitFault } = fakeFws();
    const inopSys = new FwsInopSys(fws).inopSys;
    const activeLines = () => INOP_SYS.filter(([id]) => inopSys[id]?.simVarIsActive.get()).map(([, text]) => text);

    expect(activeLines()).toEqual([]);
    displayUnitFault[DisplayUnitID.CaptPfd].set(true);
    expect(activeLines()).toEqual(['CAPT PFD DU']);
    displayUnitFault[DisplayUnitID.Sd].set(true); // no INOP SYS line for the SD DU in the FCOM
    expect(activeLines()).toEqual(['CAPT PFD DU']);
    for (const du of ALL_DISPLAY_UNITS) {
      displayUnitFault[du].set(true);
    }
    expect(activeLines()).toEqual(INOP_SYS.map(([, text]) => text));
  });
});
