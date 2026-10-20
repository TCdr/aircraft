// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { FwcAlertItem, awarenessItem, cautionItem, inopSysOnly, readBool } from './FwcAlertItem';

/*
 * The SMOKE alerts of the lavatory smoke detection and of the SDCU, from the a320_systems fire_protection.rs outputs:
 * - SMOKE LAVATORY SMOKE (L:A32NX_SMOKE_LAVATORY_DETECTED): -CKPT/CAB COM ... ESTABLISH. Phases 4, 5, 7, 8.
 * - SMOKE LAVATORY DET FAULT (L:A32NX_SMOKE_LAVATORY_DET_FAULT): crew awareness, STATUS INOP SYS LAV DET. Phases 3, 4,
 *   5, 7, 8.
 * - SMOKE DET FAULT (L:A32NX_SMOKE_DETECTION_CONTROL_UNIT_FAULT, both SDCU channels failed: no cargo or lavatory smoke
 *   is reported any more): .IF NO LIVE STOCK: -AFT ISOL VALVE OFF, -PAX SYS OFF. STATUS INOP SYS SMOKE DET. Phases
 *   3, 4, 5, 7, 8. The FWD ISOL VALVE line is not shown: the A320 here has no forward cargo ventilation. The PAX SYS
 *   pb-sw is not modelled, its line stays until the alert ends.
 */

export const LavatorySmokeAlertKeys = {
  lavatorySmoke: '2600310',
  lavatoryDetectionFault: '2600320',
  smokeDetectionFault: '2600330',
} as const;

const LAVATORY_SMOKE_PHASE_INHIBITION = [4, 5, 7, 8];

const DETECTION_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

export interface LavatorySmokeInputs {
  readonly lavatorySmoke: boolean;
  readonly lavatoryDetectionFault: boolean;
  readonly smokeDetectionControlUnitFault: boolean;
  /** L:A32NX_OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_IS_AUTO */
  readonly aftIsolValvePbAuto: boolean;
}

/** The lines of SMOKE DET FAULT: 0 title, 1 .IF NO LIVE STOCK:, 2 -AFT ISOL VALVE OFF until it is OFF, 3 -PAX SYS OFF */
function smokeDetectionFaultLines(aftIsolValvePbAuto: boolean): (number | null)[] {
  return [0, 1, aftIsolValvePbAuto ? 2 : null, 3];
}

const INOP_SYS_LAV_DET = '240300180';
const INOP_SYS_SMOKE_DET = '260300012';

export class LavatorySmokeAlerts {
  private aftIsolValvePbAuto = true;

  private readonly lavatorySmoke = Subject.create(false);

  private readonly lavatoryDetectionFault = Subject.create(false);

  private readonly smokeDetectionFault = Subject.create(false);

  update(inputs: LavatorySmokeInputs): void {
    this.aftIsolValvePbAuto = inputs.aftIsolValvePbAuto;
    this.lavatorySmoke.set(inputs.lavatorySmoke);
    this.lavatoryDetectionFault.set(inputs.lavatoryDetectionFault);
    this.smokeDetectionFault.set(inputs.smokeDetectionControlUnitFault);
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [LavatorySmokeAlertKeys.lavatorySmoke]: cautionItem(
      LavatorySmokeAlertKeys.lavatorySmoke,
      2,
      this.lavatorySmoke,
      LAVATORY_SMOKE_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.NONE,
    ),
    [LavatorySmokeAlertKeys.lavatoryDetectionFault]: awarenessItem(
      LavatorySmokeAlertKeys.lavatoryDetectionFault,
      1,
      this.lavatoryDetectionFault,
      DETECTION_FAULT_PHASE_INHIBITION,
      () => [0],
      inopSysOnly(INOP_SYS_LAV_DET),
    ),
    [LavatorySmokeAlertKeys.smokeDetectionFault]: cautionItem(
      LavatorySmokeAlertKeys.smokeDetectionFault,
      4,
      this.smokeDetectionFault,
      DETECTION_FAULT_PHASE_INHIBITION,
      () => smokeDetectionFaultLines(this.aftIsolValvePbAuto),
      EcamSysPage.NONE,
      inopSysOnly(INOP_SYS_SMOKE_DET),
    ),
  };
}

/** Reads the lavatory smoke detection and SDCU outputs of the systems */
export function readLavatorySmokeInputs(): LavatorySmokeInputs {
  return {
    lavatorySmoke: readBool('L:A32NX_SMOKE_LAVATORY_DETECTED'),
    lavatoryDetectionFault: readBool('L:A32NX_SMOKE_LAVATORY_DET_FAULT'),
    smokeDetectionControlUnitFault: readBool('L:A32NX_SMOKE_DETECTION_CONTROL_UNIT_FAULT'),
    aftIsolValvePbAuto: readBool('L:A32NX_OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_IS_AUTO'),
  };
}
