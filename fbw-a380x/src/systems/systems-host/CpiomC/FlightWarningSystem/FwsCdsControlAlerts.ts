// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { KccuFailureState } from '../../../instruments/src/MsfsAvionicsCommon/Kccu';

/*
 * The CDS control alerts of the FCU EFIS control panels and of the KCCUs.
 *
 * FCU and EFIS CPs:
 * - CDS & AUTO FLT FCU SWITCHED OFF: the FCU is switched off, so the EFIS CPs and the AFS CP have no power. SC and
 *   MASTER CAUT. The FCU model already takes the switch off (L:A32NX_FCU_SWITCHED_OFF, fbw_a380 Fcu.cpp); the FWS
 *   reads the same variable.
 * - CDS CAPT (F/O) EFIS CTL PNL FAULT: that EFIS CP is failed. SC and MASTER CAUT. USE CAPT (F/O) MFD FCU BKUP when
 *   that FCU backup is available. STATUS: INOP SYS CAPT (F/O) EFIS CTL PNL.
 * - CDS CAPT+F/O EFIS CTL PNLs FAULT: both EFIS CPs are failed. SC and MASTER CAUT, USE MFD FCU BKUP. STATUS: INOP
 *   SYS CAPT EFIS CTL PNL and F/O EFIS CTL PNL.
 * - CDS CAPT (F/O) EFIS BKUP CTL FAULT: that EFIS CP and the EFIS page of that FCU backup are failed. SC and MASTER
 *   CAUT. STATUS: INOP SYS CAPT (F/O) EFIS CTL, INFO CAPT (F/O) BARO REF : STD ONLY.
 * The EFIS page of the captain (first officer) FCU backup is powered by DC ESS (DC 2).
 * Design choices: the EFIS page of the FCU backup is failed when its flyPad failure is active or it has no power. A side
 * whose EFIS backup is lost raises its EFIS BKUP CTL FAULT, which replaces its EFIS CTL PNL FAULT; the CAPT+F/O alert is
 * raised when both CPs are failed and both backups are available, and replaces the two single alerts.
 *
 * KCCU:
 * - CDS CAPT (F/O) CURSOR CTL FAULT: that cursor control device (CCD) is failed. No aural, no master light. INOP SYS
 *   CAPT (F/O) CCD, INFO CAPT (F/O) KEYBOARD CURSOR CTL AVAIL.
 * - CDS CAPT (F/O) CURSOR CTL+KEYBOARD FAULT: that keyboard and cursor control unit (KCCU) is failed. Crew awareness.
 *   INOP SYS CAPT (F/O) CCD+KBD.
 * - CDS CAPT (F/O) KEYBOARD FAULT: that keyboard is failed. No aural, no master light. INOP SYS CAPT (F/O) KBD, INFO
 *   CAPT (F/O) SOFT KEYBOARD AVAIL.
 * The three are level 1 cautions: crew awareness, no crew action required. With both the CCD and the keyboard
 * failed, only the CURSOR CTL+KEYBOARD FAULT is raised.
 */

export const FCU_SWITCHED_OFF_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 9, 10, 11];

/** The EFIS CTL PNL, CAPT+F/O EFIS CTL PNLs and EFIS BKUP CTL alerts */
export const EFIS_CTL_PHASE_INHIBITION = [4, 5, 6, 7, 10];

/** The CURSOR CTL, CURSOR CTL+KEYBOARD and KEYBOARD alerts */
export const KCCU_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** The EFIS CPs and their FCU backup pages, captain then first officer */
export interface EfisControlInputs {
  /** The flyPad failure of the EFIS CP */
  readonly controlPanelFailed: readonly [boolean, boolean];
  /** The flyPad failure of the EFIS page of the MFD FCU backup */
  readonly backupPageFailed: readonly [boolean, boolean];
  /** The power of the FCU backup: DC ESS for the captain, DC 2 for the first officer */
  readonly backupPowered: readonly [boolean, boolean];
}

/** The EFIS CP alerts and their STATUS lines, captain then first officer */
export interface EfisControlAlerts {
  /** CDS CAPT (F/O) EFIS CTL PNL FAULT */
  readonly controlPanelFault: [boolean, boolean];
  /** CDS CAPT+F/O EFIS CTL PNLs FAULT */
  readonly bothControlPanelsFault: boolean;
  /** CDS CAPT (F/O) EFIS BKUP CTL FAULT */
  readonly backupControlFault: [boolean, boolean];
  /** INOP SYS CAPT (F/O) EFIS CTL PNL */
  readonly inopControlPanel: [boolean, boolean];
  /** INOP SYS CAPT (F/O) EFIS CTL and INFO CAPT (F/O) BARO REF : STD ONLY */
  readonly inopEfisControl: [boolean, boolean];
}

/**
 * @param inputs the EFIS CP and FCU backup failures and the FCU backup power
 * @returns the EFIS CP alerts
 */
export function efisControlAlerts(inputs: EfisControlInputs): EfisControlAlerts {
  const sides = [0, 1];
  const backupAvailable = sides.map((s) => !inputs.backupPageFailed[s] && inputs.backupPowered[s]);
  const backupControlFault = sides.map((s) => inputs.controlPanelFailed[s] && !backupAvailable[s]);
  const bothControlPanelsFault =
    inputs.controlPanelFailed[0] && inputs.controlPanelFailed[1] && !backupControlFault[0] && !backupControlFault[1];
  const controlPanelFault = sides.map(
    (s) => inputs.controlPanelFailed[s] && !backupControlFault[s] && !bothControlPanelsFault,
  );
  return {
    controlPanelFault: [controlPanelFault[0], controlPanelFault[1]],
    bothControlPanelsFault,
    backupControlFault: [backupControlFault[0], backupControlFault[1]],
    inopControlPanel: [controlPanelFault[0] || bothControlPanelsFault, controlPanelFault[1] || bothControlPanelsFault],
    inopEfisControl: [backupControlFault[0], backupControlFault[1]],
  };
}

/** The KCCU alerts of one side; each also gives its INOP SYS line (and INFO line for the first and last) */
export interface KccuAlerts {
  /** CDS CAPT (F/O) CURSOR CTL FAULT, INOP SYS CCD, INFO KEYBOARD CURSOR CTL AVAIL */
  readonly cursorControlFault: boolean;
  /** CDS CAPT (F/O) CURSOR CTL+KEYBOARD FAULT, INOP SYS CCD+KBD */
  readonly cursorControlAndKeyboardFault: boolean;
  /** CDS CAPT (F/O) KEYBOARD FAULT, INOP SYS KBD, INFO SOFT KEYBOARD AVAIL */
  readonly keyboardFault: boolean;
}

/**
 * @param failures the failed parts of the KCCU of one side (Kccu.ts kccuFailureState)
 * @returns the KCCU alerts of that side
 */
export function kccuAlerts(failures: KccuFailureState): KccuAlerts {
  const both = failures.cursorControlDeviceFailed && failures.keyboardFailed;
  return {
    cursorControlFault: failures.cursorControlDeviceFailed && !both,
    cursorControlAndKeyboardFault: both,
    keyboardFault: failures.keyboardFailed && !both,
  };
}
