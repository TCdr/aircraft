// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { KccuFailureState } from '../../../instruments/src/MsfsAvionicsCommon/Kccu';

/*
 * The CDS control alerts of the FCU EFIS control panels and of the KCCUs (A380 FCOM PRO-ABN-ECAM-10-31).
 *
 * FCU and EFIS CPs (a380_fcom.txt l.157559-157842, l.158064-158102; DSC-22-FG-90-10 FCU backup, l.19416-19447):
 * - CDS & AUTO FLT FCU SWITCHED OFF: "The FCU is switched off: The EFIS CPs and the AFS CP are electrically shutoff"
 *   (l.157565), SC and MASTER CAUT (PDF page 5375). The FCU model already takes the switch off (L:A32NX_FCU_SWITCHED_OFF,
 *   fbw_a380 Fcu.cpp); the FWS reads the same variable.
 * - CDS CAPT (F/O) EFIS CTL PNL FAULT: "The CAPT (F/O) EFIS CP is failed" (l.157762), SC and MASTER CAUT (PDF page 5382).
 *   "If CAPT (F/O) FCU BKUP is available: USE CAPT (F/O) MFD FCU BKUP" (l.157772-157773). STATUS: INOP SYS CAPT (F/O)
 *   EFIS CTL PNL (l.157794).
 * - CDS CAPT+F/O EFIS CTL PNLs FAULT: "Both EFIS CPs are failed" (l.158070), SC and MASTER CAUT (PDF page 5391), "USE MFD
 *   FCU BKUP" (l.158080). STATUS: INOP SYS CAPT EFIS CTL PNL and F/O EFIS CTL PNL (l.158101-158102).
 * - CDS CAPT (F/O) EFIS BKUP CTL FAULT: "The CAPT (F/O) EFIS CP is failed and the CAPT (F/O) EFIS page on the FCU BKUP is
 *   failed" (l.157714), SC and MASTER CAUT (PDF page 5380). STATUS: INOP SYS CAPT (F/O) EFIS CTL, INFO CAPT (F/O) BARO
 *   REF : STD ONLY (l.157724, l.157742-157745).
 * The EFIS page of the captain (first officer) FCU backup is powered by DC ESS (DC 2) (DSC-22-FG-120, l.21466-21467).
 * Design choices: the EFIS page of the FCU backup is failed when its flyPad failure is active or it has no power. A side
 * whose EFIS backup is lost raises its EFIS BKUP CTL FAULT, which replaces its EFIS CTL PNL FAULT; the CAPT+F/O alert is
 * raised when both CPs are failed and both backups are available, and replaces the two single alerts.
 *
 * KCCU (l.157621-157697, l.157800-157841):
 * - CDS CAPT (F/O) CURSOR CTL FAULT: "The CAPT (F/O) Cursor Control Device (CCD) is failed" (l.157627), no aural, no
 *   master light (PDF page 5377). INOP SYS CAPT (F/O) CCD, INFO CAPT (F/O) KEYBOARD CURSOR CTL AVAIL (l.157656-157659).
 * - CDS CAPT (F/O) CURSOR CTL+KEYBOARD FAULT: "The CAPT (F/O) Keyboard and Cursor Control Unit (KCCU) is failed"
 *   (l.157669), crew awareness (PDF page 5378). INOP SYS CAPT (F/O) CCD+KBD (l.157697).
 * - CDS CAPT (F/O) KEYBOARD FAULT: "The CAPT (F/O) Keyboard is failed" (l.157804), no aural, no master light (PDF page
 *   5383). INOP SYS CAPT (F/O) KBD, INFO CAPT (F/O) SOFT KEYBOARD AVAIL (l.157838-157841).
 * The three are level 1 cautions: "For a situation that requires the flight crew to be informed (crew awareness), but
 * does not require a flight crew action" (DSC-31, l.71433-71437). With both the CCD and the keyboard failed, only the
 * CURSOR CTL+KEYBOARD FAULT is raised.
 */

/** CDS & AUTO FLT FCU SWITCHED OFF is inhibited in phases 2 to 7 and 9 to 11 (FCOM PDF page 5375) */
export const FCU_SWITCHED_OFF_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 9, 10, 11];

/** The EFIS CTL PNL, CAPT+F/O EFIS CTL PNLs and EFIS BKUP CTL alerts are inhibited in phases 4 to 7 and 10 (FCOM PDF
 * pages 5380, 5382, 5391) */
export const EFIS_CTL_PHASE_INHIBITION = [4, 5, 6, 7, 10];

/** The CURSOR CTL, CURSOR CTL+KEYBOARD and KEYBOARD alerts are inhibited in phases 3 to 7, 9 and 10 (FCOM PDF pages
 * 5377, 5378, 5383) */
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
