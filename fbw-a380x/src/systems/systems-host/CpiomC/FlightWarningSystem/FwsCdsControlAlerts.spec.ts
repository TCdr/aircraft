// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import {
  afsControlAlerts,
  AfsControlInputs,
  EFIS_CTL_PHASE_INHIBITION,
  efisControlAlerts,
  EfisControlInputs,
  FCU_SWITCHED_OFF_PHASE_INHIBITION,
  KCCU_PHASE_INHIBITION,
  kccuAlerts,
} from './FwsCdsControlAlerts';
import {
  EcamAbnormalProcedures,
  EcamInfos,
  EcamInopSys,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, FwsFixture, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

/** The FwsCore after one cycle with the given flyPad failures active and the DC ESS and DC 2 buses powered */
function coreWithFailures(failures: number[]) {
  const { core, simVars } = createFws(new Set(failures));
  simVars.set('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 1);
  simVars.set('L:A32NX_ELEC_DC_2_BUS_IS_POWERED', 1);
  runFwsCycle(core);
  return core;
}

const alertTitle = (id: string) => EcamAbnormalProcedures[id].title;
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

const AFS_NONE_FAILED: AfsControlInputs = {
  controlPanelFailed: false,
  backupPageFailed: [false, false],
  backupPowered: [true, true],
};

describe('AFS CP alerts', () => {
  it('raises nothing without a failure', () => {
    const alerts = afsControlAlerts(AFS_NONE_FAILED);
    expect(alerts.controlPanelFault).toBe(false);
    expect(alerts.backupControlFault).toEqual([false, false]);
  });

  it('does not raise anything for a failed backup page alone', () => {
    const alerts = afsControlAlerts({ ...AFS_NONE_FAILED, backupPageFailed: [true, true] });
    expect(alerts.controlPanelFault).toBe(false);
    expect(alerts.backupControlFault).toEqual([false, false]);
  });

  it('raises AFS CTL PNL FAULT with USE MFD FCU BKUP when the FCU backup is available on both sides', () => {
    const alerts = afsControlAlerts({ ...AFS_NONE_FAILED, controlPanelFailed: true });
    expect(alerts.controlPanelFault).toBe(true);
    expect(alerts.useBackupLines).toEqual([true, false, false]);
    expect(alerts.backupControlFault).toEqual([false, false]);
  });

  it('names the side whose FCU backup is available when the other side AFS page is failed', () => {
    const captainOnly = afsControlAlerts({
      ...AFS_NONE_FAILED,
      controlPanelFailed: true,
      backupPageFailed: [false, true],
    });
    expect(captainOnly.useBackupLines).toEqual([false, true, false]);
    expect(captainOnly.backupControlFault).toEqual([false, true]);

    const firstOfficerOnly = afsControlAlerts({
      ...AFS_NONE_FAILED,
      controlPanelFailed: true,
      backupPageFailed: [true, false],
    });
    expect(firstOfficerOnly.useBackupLines).toEqual([false, false, true]);
    expect(firstOfficerOnly.backupControlFault).toEqual([true, false]);
  });

  it('raises both BKUP CTL FAULT alerts and no backup line when no FCU backup is available', () => {
    const alerts = afsControlAlerts({
      ...AFS_NONE_FAILED,
      controlPanelFailed: true,
      backupPageFailed: [true, true],
    });
    expect(alerts.controlPanelFault).toBe(true);
    expect(alerts.useBackupLines).toEqual([false, false, false]);
    expect(alerts.backupControlFault).toEqual([true, true]);
  });

  it('takes an unpowered FCU backup (DC ESS for the captain, DC 2 for the first officer) as failed', () => {
    const alerts = afsControlAlerts({ ...AFS_NONE_FAILED, controlPanelFailed: true, backupPowered: [true, false] });
    expect(alerts.useBackupLines).toEqual([false, true, false]);
    expect(alerts.backupControlFault).toEqual([false, true]);
  });

  it('wires the alerts to the AFS CP and FCU backup AFS page failures of the flyPad', () => {
    const afsPanelOnly = coreWithFailures([A380Failure.AfsControlPanel]);
    expect(afsPanelOnly.afsCtlPnlFault.get()).toBe(true);
    expect(afsPanelOnly.afsCtlPnlUseBackupLines.map((line) => line.get())).toEqual([true, false, false]);
    expect(afsPanelOnly.afsBkupCtlFault.map((fault) => fault.get())).toEqual([false, false]);

    const captainBackupAlsoFailed = coreWithFailures([A380Failure.AfsControlPanel, A380Failure.CaptFcuBackupAfsPage]);
    expect(captainBackupAlsoFailed.afsCtlPnlUseBackupLines.map((line) => line.get())).toEqual([false, false, true]);
    expect(captainBackupAlsoFailed.afsBkupCtlFault.map((fault) => fault.get())).toEqual([true, false]);

    const firstOfficerBackupAlsoFailed = coreWithFailures([
      A380Failure.AfsControlPanel,
      A380Failure.FoFcuBackupAfsPage,
    ]);
    expect(firstOfficerBackupAlsoFailed.afsBkupCtlFault.map((fault) => fault.get())).toEqual([false, true]);
  });

  it('takes the FCU backup of the side as failed when its DC bus is not powered', () => {
    const { core, simVars } = createFws(new Set([A380Failure.AfsControlPanel]));
    simVars.set('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 0);
    simVars.set('L:A32NX_ELEC_DC_2_BUS_IS_POWERED', 1);
    runFwsCycle(core);
    expect(core.afsBkupCtlFault.map((fault) => fault.get())).toEqual([true, false]);
  });

  it('raises AFS CTL PNL FAULT (SC and MASTER CAUT) with its three lines and INOP SYS AFS CTL PNL', () => {
    const { core } = createFws();
    const alert = core.abnormalSensed.ewdAbnormalSensed['220800005'];
    expect(alert.flightPhaseInhib).toEqual([4, 5, 6, 7, 10]);
    expect(alert.simVarIsActive).toBe(core.afsCtlPnlFault);
    expect(alert.inopSysAllPhases?.([])).toEqual(['220300004']);
    expect(alert.failure).toBe(2);
    core.afsCtlPnlUseBackupLines[1].set(true);
    expect(alert.whichItemsToShow()).toEqual([false, true, false]);
    expect(procedureItemNames('220800005')).toEqual(
      expect.arrayContaining(['USE MFD FCU BKUP', 'Use CAPT MFD FCU BKUP', 'Use F/O MFD FCU BKUP']),
    );
  });

  it.each([
    ['220800016', 'CAPT', 0, '220300012'],
    ['220800017', 'F/O', 1, '220300013'],
  ])('raises %s %s AFS BKUP CTL FAULT as crew awareness with its INOP SYS', (id, side, index, inopSysId) => {
    const { core } = createFws();
    const alert = core.abnormalSensed.ewdAbnormalSensed[id];
    expect(alert.flightPhaseInhib).toEqual([4, 5, 6, 7, 10]);
    expect(alert.simVarIsActive).toBe(core.afsBkupCtlFault[index]);
    expect(alert.inopSysAllPhases?.([])).toEqual([inopSysId]);
    expect(alert.failure).toBe(1);
    expect(alertTitle(id)).toBe(`\x1b<4m\x1b4mAUTO FLT\x1bm ${side} AFS BKUP CTL FAULT`);
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
  const ALERTS: [string, number[], (core: FwsFixture['core']) => unknown, number][] = [
    ['311800001', FCU_SWITCHED_OFF_PHASE_INHIBITION, (core) => core.fcuSwitchedOff, 2],
    ['311800002', EFIS_CTL_PHASE_INHIBITION, (core) => core.efisBkupCtlFault[0], 2],
    ['311800003', EFIS_CTL_PHASE_INHIBITION, (core) => core.efisBkupCtlFault[1], 2],
    ['311800004', EFIS_CTL_PHASE_INHIBITION, (core) => core.efisCtlPnlFault[0], 2],
    ['311800005', EFIS_CTL_PHASE_INHIBITION, (core) => core.efisCtlPnlFault[1], 2],
    ['311800006', EFIS_CTL_PHASE_INHIBITION, (core) => core.efisCtlPnlsBothFault, 2],
    ['313800001', KCCU_PHASE_INHIBITION, (core) => core.kccuCursorCtlFault[0], 1],
    ['313800002', KCCU_PHASE_INHIBITION, (core) => core.kccuCursorCtlFault[1], 1],
    ['313800003', KCCU_PHASE_INHIBITION, (core) => core.kccuCursorCtlKeyboardFault[0], 1],
    ['313800004', KCCU_PHASE_INHIBITION, (core) => core.kccuCursorCtlKeyboardFault[1], 1],
    ['313800005', KCCU_PHASE_INHIBITION, (core) => core.kccuKeyboardFault[0], 1],
    ['313800006', KCCU_PHASE_INHIBITION, (core) => core.kccuKeyboardFault[1], 1],
  ];

  it.each(ALERTS)(
    'raises %s with its inhibition, condition and level (SC + MASTER CAUT: 2, none: 1)',
    (id, inhibition, condition, level) => {
      const { core } = createFws();
      const alert = core.abnormalSensed.ewdAbnormalSensed[id];
      expect(alert.flightPhaseInhib).toEqual(inhibition);
      expect(alert.simVarIsActive).toBe(condition(core));
      expect(alert.failure).toBe(level);
    },
  );

  it('raises the EFIS and KCCU alerts of a side from the flyPad failures of that side', () => {
    const efisPanelCaptain = coreWithFailures([A380Failure.CaptEfisControlPanel]);
    expect(efisPanelCaptain.efisCtlPnlFault.map((fault) => fault.get())).toEqual([true, false]);
    expect(efisPanelCaptain.efisCtlPnlInop.map((inop) => inop.get())).toEqual([true, false]);

    const bothEfisPanels = coreWithFailures([A380Failure.CaptEfisControlPanel, A380Failure.FoEfisControlPanel]);
    expect(bothEfisPanels.efisCtlPnlsBothFault.get()).toBe(true);

    const keyboardFirstOfficer = coreWithFailures([A380Failure.FoKccuKeyboard]);
    expect(keyboardFirstOfficer.kccuKeyboardFault.map((fault) => fault.get())).toEqual([false, true]);
    const wholeKccuCaptain = coreWithFailures([A380Failure.CaptKccu]);
    expect(wholeKccuCaptain.kccuCursorCtlKeyboardFault.map((fault) => fault.get())).toEqual([true, false]);
  });

  it('feeds the STATUS INOP SYS and INFO lines', () => {
    const { core } = createFws();
    const lines: [string, string, () => unknown][] = [
      ['310300012', 'CAPT EFIS CTL PNL', () => core.efisCtlPnlInop[0]],
      ['310300013', 'F/O EFIS CTL PNL', () => core.efisCtlPnlInop[1]],
      ['310300014', 'CAPT EFIS CTL', () => core.efisBkupCtlFault[0]],
      ['310300015', 'F/O EFIS CTL', () => core.efisBkupCtlFault[1]],
      ['310300016', 'CAPT CCD', () => core.kccuCursorCtlFault[0]],
      ['310300017', 'F/O CCD', () => core.kccuCursorCtlFault[1]],
      ['310300018', 'CAPT CCD+KBD', () => core.kccuCursorCtlKeyboardFault[0]],
      ['310300019', 'F/O CCD+KBD', () => core.kccuCursorCtlKeyboardFault[1]],
      ['310300020', 'CAPT KBD', () => core.kccuKeyboardFault[0]],
      ['310300021', 'F/O KBD', () => core.kccuKeyboardFault[1]],
    ];
    for (const [id, text, condition] of lines) {
      expect(EcamInopSys[id]).toBe(`\x1b<4m${text}`);
      expect(core.inopSys.inopSys[id].simVarIsActive).toBe(condition());
    }
    const infos: [string, string, () => unknown][] = [
      ['310200001', 'CAPT BARO REF : STD ONLY', () => core.efisBkupCtlFault[0]],
      ['310200002', 'F/O BARO REF : STD ONLY', () => core.efisBkupCtlFault[1]],
      ['310200003', 'CAPT KEYBOARD CURSOR CTL AVAIL', () => core.kccuCursorCtlFault[0]],
      ['310200004', 'F/O KEYBOARD CURSOR CTL AVAIL', () => core.kccuCursorCtlFault[1]],
      ['310200005', 'CAPT SOFT KEYBOARD AVAIL', () => core.kccuKeyboardFault[0]],
      ['310200006', 'F/O SOFT KEYBOARD AVAIL', () => core.kccuKeyboardFault[1]],
    ];
    for (const [id, text, condition] of infos) {
      expect(EcamInfos[id]).toBe(`\x1b<3m${text}`);
      expect(core.information.info[id].simVarIsActive).toBe(condition());
    }
  });

  it('gives the EFIS CTL PNL procedures the FCU backup line', () => {
    expect(procedureItemNames('311800004')).toContain('USE CAPT MFD FCU BKUP');
    expect(procedureItemNames('311800005')).toContain('USE F/O MFD FCU BKUP');
    expect(procedureItemNames('311800006')).toContain('USE MFD FCU BKUP');
  });
});

describe('CDS DU NOT MONITORED titles', () => {
  it('names the EWD, F/O PFD and F/O ND alerts without a CAPT prefix', () => {
    expect(alertTitle('311800009')).toBe('\x1b<4m\x1b4mCDS\x1bm EWD DU NOT MONITORED');
    expect(alertTitle('311800010')).toBe('\x1b<4m\x1b4mCDS\x1bm F/O PFD DU NOT MONITORED');
    expect(alertTitle('311800011')).toBe('\x1b<4m\x1b4mCDS\x1bm F/O ND DU NOT MONITORED');
    for (const procedure of Object.values(EcamAbnormalProcedures)) {
      expect(procedure.title).not.toContain('CAPT EWD DU');
      expect(procedure.title).not.toContain('CAPT F/O');
    }
  });
});
