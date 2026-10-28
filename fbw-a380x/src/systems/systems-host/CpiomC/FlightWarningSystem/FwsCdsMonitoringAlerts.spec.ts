// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { A380FailureDefinitions } from '@failures';
import { FwsInopSys } from './FwsInopSys';
import { FwsCore } from './FwsCore';

/*
 * CDS CAPT PFD(CAPT ND)(EWD)(F/O PFD)(F/O ND) DU NOT MONITORED and CDS CAPT (F/O) MAILBOX ACCESS FAULT.
 *
 * The EcamMessages tables, FwsAbnormalSensed and FwsCore are read from the source text, as FwsCdsDuFault.spec.ts does:
 * importing EcamMessages/index.ts in a test fails (circular import) and FwsAbnormalSensed imports it.
 */
const messagesDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ecamMessages = readFileSync(resolve(messagesDir, 'index.ts'), 'utf-8');
const ata31Procedures = readFileSync(resolve(messagesDir, 'AbnormalSensed/ata31-32-33.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

/** The source text of one entry of an object literal, from its key to the closing brace at the same indentation */
function entry(source: string, key: string, indent: string): string {
  const start = source.indexOf(`\n${indent}${key}: {`);
  if (start < 0) {
    return '';
  }
  return source.slice(start, source.indexOf(`\n${indent}},`, start));
}

/** The alert id, ECAM name and DU of each DU NOT MONITORED alert (the MFDs and the SD have none) */
const NOT_MONITORED: [string, string, string][] = [
  ['311800007', 'CAPT PFD', 'CaptPfd'],
  ['311800008', 'CAPT ND', 'CaptNd'],
  ['311800009', 'EWD', 'Ewd'],
  ['311800010', 'F/O PFD', 'FoPfd'],
  ['311800011', 'F/O ND', 'FoNd'],
];

describe('CDS ... DU NOT MONITORED', () => {
  it('raises each alert from the monitoring state of its DU, as a crew awareness caution (SC, MASTER CAUT)', () => {
    for (const [id, name, du] of NOT_MONITORED) {
      expect(entry(ata31Procedures, id, '  '), id).toContain(`CDS\\x1bm ${name} DU NOT MONITORED'`);
      const alert = entry(abnormalSensed, id, '    ');
      expect(alert, id).toContain(`simVarIsActive: this.fws.displayUnitNotMonitored[DisplayUnitID.${du}],`);
      expect(alert, id).toContain('flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],');
      expect(alert, id).toContain('failure: 1,');
    }
  });

  it('computes the monitoring state of every DU from its power and its flyPad failure', () => {
    expect(fwsCore).toContain(
      'isDisplayUnitPowered(du, isDcBusPowered) && !this.failuresConsumer.isActive(DisplayUnitFailure[du])',
    );
    expect(fwsCore).toContain(
      'this.displayUnitNotMonitored[du].set(isDisplayUnitNotMonitored(du, isDisplayUnitOperative))',
    );
  });
});

describe('CDS CAPT (F/O) MAILBOX ACCESS FAULT', () => {
  const ALERTS: [string, string, number, string, string][] = [
    ['313800007', 'CAPT', 0, '310300025', 'CaptMailboxAccess'],
    ['313800008', 'F/O', 1, '310300026', 'FoMailboxAccess'],
  ];

  it('raises each side from its flyPad failure, with the INOP SYS line of the STATUS', () => {
    for (const [id, side, index, inopId, failure] of ALERTS) {
      expect(entry(ata31Procedures, id, '  '), id).toContain(`CDS\\x1bm ${side} MAILBOX ACCESS FAULT'`);
      const alert = entry(abnormalSensed, id, '    ');
      expect(alert, id).toContain(`simVarIsActive: this.fws.mailboxAccessFault[${index}],`);
      expect(alert, id).toContain('failure: 1,');
      expect(ecamMessages, inopId).toContain(`  ${inopId}: '\\x1b<4m${side} MAILBOX ACCESS',`);
      expect(fwsCore).toContain(`this.mailboxAccessFault[${index}].set(failureActive(A380Failure.${failure}));`);
    }
  });

  it('has a flyPad failure per side in ATA 31', () => {
    const ids = A380FailureDefinitions.filter(([ata, , name]) => ata === 31 && /ATC mailbox/.test(name));
    expect(ids.map(([, id]) => id)).toEqual([31410, 31411]);
  });

  it('shows the INOP SYS line of a side only while its alert is active', () => {
    const mailboxAccessFault = [Subject.create(false), Subject.create(false)];
    const subjects: Record<string, Subject<boolean>> = {};
    const fws = new Proxy(
      {},
      {
        get: (_target, name: string) => {
          if (name === 'mailboxAccessFault') {
            return mailboxAccessFault;
          }
          if (!(name in subjects)) {
            subjects[name] = Subject.create(false);
          }
          return subjects[name];
        },
      },
    ) as unknown as FwsCore;
    const inopSys = new FwsInopSys(fws).inopSys;

    expect(inopSys['310300025'].simVarIsActive.get()).toBe(false);
    expect(inopSys['310300026'].simVarIsActive.get()).toBe(false);
    mailboxAccessFault[1].set(true);
    expect(inopSys['310300025'].simVarIsActive.get()).toBe(false);
    expect(inopSys['310300026'].simVarIsActive.get()).toBe(true);
  });
});
