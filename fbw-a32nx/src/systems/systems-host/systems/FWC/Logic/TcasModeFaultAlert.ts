// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, cautionItem } from './FwcAlertItem';

/*
 * AUTO FLT TCAS MODE FAULT of the A320 FWC (A320 FCOM PRO-ABN-AUTO_FLT, a320_fcom.txt l.71942-71970; the title colour
 * and the flight phase inhibition figure are images, read on the FCOM PDF "A320 Neo FCOM_1.pdf" p.4431-4432):
 * - "This alert triggers when the TCAS flight guidance mode is inoperative" (l.71952).
 * - Procedure (l.71958-71960): FOR TCAS ALERT: AP+FD OFF, FLY MANUALLY TCAS ORDER.
 * - STATUS (l.71964-71968): INOP SYS AP/FD TCAS.
 * - DSC-22_30-70-85 (l.30499-30503): "The TCAS mode is not available, when: ... The TCAS mode is failed (AUTO FLT TCAS
 *   MODE FAULT)".
 *
 * The flyPad failure of the FG TCAS mode (A320Failure.TcasModeFailure, 22012) makes the TCAS mode of both FMGCs
 * unavailable (the C++ fbw module blanks the TCAS bus they read, fmgc/FmgcTcasBusInput.h).
 *
 * Design choices:
 * - The FWC shows the alert while the flight guidance can report it: at least one FMGC sends its discrete word 1.
 * - An amber caution with a procedure: level 2 (FCOM DSC-31 l.45527-45545), no SD page. The procedure lines are not
 *   sensed (they apply to a coming TCAS alert).
 */

/** AUTO FLT TCAS MODE FAULT flight phase inhibition (FCOM PDF page 4431) */
export const TCAS_MODE_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** The alert key, the first digits of its EwdMessages codes */
export const TCAS_MODE_FAULT_KEY = '2200300';

/** STATUS INOP SYS AP/FD TCAS (StatusMessages) */
export const INOP_SYS_AP_FD_TCAS = '220300011';

/** AUTO FLT TCAS MODE FAULT: the FG TCAS mode is failed and a flight guidance is there to report it */
export function tcasModeFaultAlert(tcasModeFailed: boolean, fmgcAvailable: boolean): boolean {
  return tcasModeFailed && fmgcAvailable;
}

/** The STATUS: INOP SYS AP/FD TCAS */
export function tcasModeFaultStatus(): StatusLines {
  return { left: [], inopSys: [INOP_SYS_AP_FD_TCAS] };
}

/** The part of the failures consumer the alert uses */
export type TcasModeFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** AUTO FLT TCAS MODE FAULT: reads the failure, gives the item the PseudoFWC adds */
export class TcasModeFaultAlert {
  private readonly active = Subject.create(false);

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: TcasModeFailuresSource = new FailuresConsumer()) {}

  /** Registers the failure, called once by the PseudoFWC init */
  init(): void {
    this.failuresConsumer.register(A320Failure.TcasModeFailure);
  }

  /**
   * @param fmgcAvailable FMGC 1 or 2 sends its discrete word 1 (normal operation)
   */
  update(fmgcAvailable: boolean): void {
    this.failuresConsumer.update();
    this.active.set(tcasModeFaultAlert(this.failuresConsumer.isActive(A320Failure.TcasModeFailure), fmgcAvailable));
  }

  /** The alert item, by key, for the PseudoFWC ewdMessageFailures: 0 title, 1 .FOR TCAS ALERT, 2 -AP+FD OFF, 3 FLY
   * MANUALLY TCAS ORDER */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [TCAS_MODE_FAULT_KEY]: cautionItem(
      TCAS_MODE_FAULT_KEY,
      4,
      this.active,
      TCAS_MODE_FAULT_PHASE_INHIBITION,
      () => [0, 1, 2, 3],
      EcamSysPage.NONE,
      tcasModeFaultStatus,
    ),
  };
}
