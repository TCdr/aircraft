// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EFIS_CTL_PHASE_INHIBITION,
  efisControlAlerts,
  EfisControlInputs,
  FCU_SWITCHED_OFF_PHASE_INHIBITION,
  KCCU_PHASE_INHIBITION,
  kccuAlerts,
} from './FwsCdsControlAlerts';

/*
 * CDS & AUTO FLT FCU SWITCHED OFF, EFIS CP and KCCU alerts. The EcamMessages tables and FwsAbnormalSensed are read
 * from the source text (importing them in a test fails, see FwsCdsDuFault.spec.ts).
 */
const messagesDir = resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages');
const ata31Procedures = readFileSync(resolve(messagesDir, 'AbnormalSensed/ata31-32-33.ts'), 'utf-8');
const ecamMessages = readFileSync(resolve(messagesDir, 'index.ts'), 'utf-8');
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const inopSys = readFileSync(resolve(__dirname, 'FwsInopSys.ts'), 'utf-8');
const information = readFileSync(resolve(__dirname, 'FwsInformation.ts'), 'utf-8');

/** The source of one entry (`<indent><id>: {` ... `<indent>},`) of an FWS dictionary (indent 4) or ECAM table (2) */
function entry(source: string, id: string, indent = '    '): string {
  const match = source.match(new RegExp(`\\n${indent}${id}: \\{([\\s\\S]*?)\\n${indent}\\},`));
  if (!match) {
    throw new Error(`no entry ${id}`);
  }
  return match[1];
}

const NONE_FAILED: EfisControlInputs = {
  controlPanelFailed: [false, false],
  backupPageFailed: [false, false],
  backupPowered: [true, true],
};

describe('EFIS CP alerts', () => {
  it('raises nothing without a failure', () => {
    const alerts = efisControlAlerts(NONE_FAILED);
    expect(alerts.controlPanelFault).toEqual([false, false]);
    expect(alerts.bothControlPanelsFault).toBe(false);
    expect(alerts.backupControlFault).toEqual([false, false]);
  });

  it('raises CAPT EFIS CTL PNL FAULT with its INOP SYS for a failed captain EFIS CP, the backup being available', () => {
    const alerts = efisControlAlerts({ ...NONE_FAILED, controlPanelFailed: [true, false] });
    expect(alerts.controlPanelFault).toEqual([true, false]);
    expect(alerts.inopControlPanel).toEqual([true, false]);
    expect(alerts.backupControlFault).toEqual([false, false]);
  });

  it('raises CAPT+F/O EFIS CTL PNLs FAULT instead of the two single alerts when both EFIS CPs fail', () => {
    const alerts = efisControlAlerts({ ...NONE_FAILED, controlPanelFailed: [true, true] });
    expect(alerts.bothControlPanelsFault).toBe(true);
    expect(alerts.controlPanelFault).toEqual([false, false]);
    expect(alerts.inopControlPanel).toEqual([true, true]);
  });

  it('raises EFIS BKUP CTL FAULT when the EFIS CP and its FCU backup EFIS page are failed', () => {
    const alerts = efisControlAlerts({
      ...NONE_FAILED,
      controlPanelFailed: [false, true],
      backupPageFailed: [false, true],
    });
    expect(alerts.backupControlFault).toEqual([false, true]);
    expect(alerts.inopEfisControl).toEqual([false, true]);
    expect(alerts.controlPanelFault).toEqual([false, false]);
    expect(alerts.inopControlPanel).toEqual([false, false]);
  });

  it('takes an unpowered FCU backup (DC ESS for the captain) as failed', () => {
    const alerts = efisControlAlerts({
      ...NONE_FAILED,
      controlPanelFailed: [true, false],
      backupPowered: [false, true],
    });
    expect(alerts.backupControlFault).toEqual([true, false]);
  });

  it('keeps the other side single alert when one of two failed EFIS CPs lost its backup', () => {
    const alerts = efisControlAlerts({
      ...NONE_FAILED,
      controlPanelFailed: [true, true],
      backupPageFailed: [true, false],
    });
    expect(alerts.backupControlFault).toEqual([true, false]);
    expect(alerts.bothControlPanelsFault).toBe(false);
    expect(alerts.controlPanelFault).toEqual([false, true]);
  });

  it('does not raise EFIS BKUP CTL FAULT for a failed backup page alone', () => {
    const alerts = efisControlAlerts({ ...NONE_FAILED, backupPageFailed: [true, true] });
    expect(alerts.backupControlFault).toEqual([false, false]);
  });
});

describe('KCCU alerts', () => {
  it('raises CURSOR CTL FAULT for a failed cursor control device', () => {
    expect(kccuAlerts({ cursorControlDeviceFailed: true, keyboardFailed: false })).toEqual({
      cursorControlFault: true,
      cursorControlAndKeyboardFault: false,
      keyboardFault: false,
    });
  });

  it('raises KEYBOARD FAULT for a failed keyboard', () => {
    expect(kccuAlerts({ cursorControlDeviceFailed: false, keyboardFailed: true })).toEqual({
      cursorControlFault: false,
      cursorControlAndKeyboardFault: false,
      keyboardFault: true,
    });
  });

  it('raises only CURSOR CTL+KEYBOARD FAULT when both are failed', () => {
    expect(kccuAlerts({ cursorControlDeviceFailed: true, keyboardFailed: true })).toEqual({
      cursorControlFault: false,
      cursorControlAndKeyboardFault: true,
      keyboardFault: false,
    });
  });
});

describe('Flight phase inhibitions of the aircraft', () => {
  it('inhibits FCU SWITCHED OFF in phases 2 to 7 and 9 to 11', () => {
    expect(FCU_SWITCHED_OFF_PHASE_INHIBITION).toEqual([2, 3, 4, 5, 6, 7, 9, 10, 11]);
  });

  it('inhibits the EFIS CP alerts in phases 4 to 7 and 10', () => {
    expect(EFIS_CTL_PHASE_INHIBITION).toEqual([4, 5, 6, 7, 10]);
  });

  it('inhibits the KCCU alerts in phases 3 to 7, 9 and 10', () => {
    expect(KCCU_PHASE_INHIBITION).toEqual([3, 4, 5, 6, 7, 9, 10]);
  });
});

describe('FWS wiring of the CDS control alerts', () => {
  const ALERTS: [string, string, string, number][] = [
    ['311800001', 'FCU_SWITCHED_OFF_PHASE_INHIBITION', 'this.fws.fcuSwitchedOff', 2],
    ['311800002', 'EFIS_CTL_PHASE_INHIBITION', 'this.fws.efisBkupCtlFault[0]', 2],
    ['311800003', 'EFIS_CTL_PHASE_INHIBITION', 'this.fws.efisBkupCtlFault[1]', 2],
    ['311800004', 'EFIS_CTL_PHASE_INHIBITION', 'this.fws.efisCtlPnlFault[0]', 2],
    ['311800005', 'EFIS_CTL_PHASE_INHIBITION', 'this.fws.efisCtlPnlFault[1]', 2],
    ['311800006', 'EFIS_CTL_PHASE_INHIBITION', 'this.fws.efisCtlPnlsBothFault', 2],
    ['313800001', 'KCCU_PHASE_INHIBITION', 'this.fws.kccuCursorCtlFault[0]', 1],
    ['313800002', 'KCCU_PHASE_INHIBITION', 'this.fws.kccuCursorCtlFault[1]', 1],
    ['313800003', 'KCCU_PHASE_INHIBITION', 'this.fws.kccuCursorCtlKeyboardFault[0]', 1],
    ['313800004', 'KCCU_PHASE_INHIBITION', 'this.fws.kccuCursorCtlKeyboardFault[1]', 1],
    ['313800005', 'KCCU_PHASE_INHIBITION', 'this.fws.kccuKeyboardFault[0]', 1],
    ['313800006', 'KCCU_PHASE_INHIBITION', 'this.fws.kccuKeyboardFault[1]', 1],
  ];

  it.each(ALERTS)(
    'raises %s with its inhibition, condition and level (SC + MASTER CAUT: 2, none: 1)',
    (id, inhib, cond, level) => {
      const source = entry(abnormalSensed, id);
      expect(source).toContain(`flightPhaseInhib: ${inhib},`);
      expect(source).toContain(`simVarIsActive: ${cond},`);
      expect(source).toContain(`failure: ${level},`);
    },
  );

  it('feeds the STATUS INOP SYS and INFO lines', () => {
    const lines: [string, string, string][] = [
      ['310300012', 'CAPT EFIS CTL PNL', 'this.fws.efisCtlPnlInop[0]'],
      ['310300013', 'F/O EFIS CTL PNL', 'this.fws.efisCtlPnlInop[1]'],
      ['310300014', 'CAPT EFIS CTL', 'this.fws.efisBkupCtlFault[0]'],
      ['310300015', 'F/O EFIS CTL', 'this.fws.efisBkupCtlFault[1]'],
      ['310300016', 'CAPT CCD', 'this.fws.kccuCursorCtlFault[0]'],
      ['310300017', 'F/O CCD', 'this.fws.kccuCursorCtlFault[1]'],
      ['310300018', 'CAPT CCD+KBD', 'this.fws.kccuCursorCtlKeyboardFault[0]'],
      ['310300019', 'F/O CCD+KBD', 'this.fws.kccuCursorCtlKeyboardFault[1]'],
      ['310300020', 'CAPT KBD', 'this.fws.kccuKeyboardFault[0]'],
      ['310300021', 'F/O KBD', 'this.fws.kccuKeyboardFault[1]'],
    ];
    for (const [id, text, cond] of lines) {
      expect(ecamMessages).toContain(`${id}: '\\x1b<4m${text}',`);
      expect(entry(inopSys, id)).toContain(`simVarIsActive: ${cond},`);
    }
    const infos: [string, string, string][] = [
      ['310200001', 'CAPT BARO REF : STD ONLY', 'this.fws.efisBkupCtlFault[0]'],
      ['310200002', 'F/O BARO REF : STD ONLY', 'this.fws.efisBkupCtlFault[1]'],
      ['310200003', 'CAPT KEYBOARD CURSOR CTL AVAIL', 'this.fws.kccuCursorCtlFault[0]'],
      ['310200004', 'F/O KEYBOARD CURSOR CTL AVAIL', 'this.fws.kccuCursorCtlFault[1]'],
      ['310200005', 'CAPT SOFT KEYBOARD AVAIL', 'this.fws.kccuKeyboardFault[0]'],
      ['310200006', 'F/O SOFT KEYBOARD AVAIL', 'this.fws.kccuKeyboardFault[1]'],
    ];
    for (const [id, text, cond] of infos) {
      expect(ecamMessages).toContain(`${id}: '\\x1b<3m${text}',`);
      expect(entry(information, id)).toContain(`simVarIsActive: ${cond},`);
    }
  });

  it('gives the EFIS CTL PNL procedures the FCU backup line', () => {
    expect(entry(ata31Procedures, '311800004', '  ')).toContain("name: 'USE CAPT MFD FCU BKUP'");
    expect(entry(ata31Procedures, '311800005', '  ')).toContain("name: 'USE F/O MFD FCU BKUP'");
    expect(entry(ata31Procedures, '311800006', '  ')).toContain("name: 'USE MFD FCU BKUP'");
  });
});

describe('CDS DU NOT MONITORED titles', () => {
  it('names the EWD, F/O PFD and F/O ND alerts without a CAPT prefix', () => {
    expect(entry(ata31Procedures, '311800009', '  ')).toContain(
      "title: '\\x1b<4m\\x1b4mCDS\\x1bm EWD DU NOT MONITORED',",
    );
    expect(entry(ata31Procedures, '311800010', '  ')).toContain(
      "title: '\\x1b<4m\\x1b4mCDS\\x1bm F/O PFD DU NOT MONITORED',",
    );
    expect(entry(ata31Procedures, '311800011', '  ')).toContain(
      "title: '\\x1b<4m\\x1b4mCDS\\x1bm F/O ND DU NOT MONITORED',",
    );
    expect(ata31Procedures).not.toContain('CAPT EWD DU');
    expect(ata31Procedures).not.toContain('CAPT F/O');
  });
});
