// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, cautionItem, readBool } from './FwcAlertItem';

/*
 * The GPWS cautions, from the EGPWC discretes the Rust EGPWS writes (fbw-common surveillance/egpws:
 * L:A32NX_GPWS_SYS_FAULT = gpws_inop, L:A32NX_GPWS_TERR_FAULT = terrain_inop; both set by the EGPWC failure 34030, the
 * loss of power and the self test):
 * - NAV GPWS FAULT: the GPWS fails; asks GPWS OFF, a line that stays after the pb-sw is OFF; STATUS INOP SYS GPWS.
 * - NAV GPWS TERR DET FAULT: the enhanced TCF and TAD modes are inoperative; asks GPWS TERR OFF; STATUS INOP SYS GPWS
 *   TERR (the ROW/ROP line is left out, the FBW A32NX has no ROW/ROP).
 * The EGPWC also reports gpws_inop when the GPWS SYS pb-sw is OFF (its inhibit discrete): the alert triggers on a fault
 * with the pb-sw ON, and then stays as long as the EGPWC reports the fault, pb-sw OFF included. The TERR pb-sw OFF gives
 * the TERR OFF memo of this aircraft, not the caution: the caution needs a terrain fault.
 * Flight phase inhibition: shown in phases 2, 6, 7 and 9.
 */

export const GpwsAlertKeys = {
  gpwsFault: '3400680',
  terrainDetectionFault: '3400685',
} as const;

export const GPWS_PHASE_INHIBITION = [1, 3, 4, 5, 8, 10];

export interface GpwsInputs {
  /** L:A32NX_GPWS_SYS_FAULT: the EGPWC reports the basic GPWS modes inoperative */
  readonly sysFault: boolean;
  /** L:A32NX_GPWS_SYS_OFF: the GPWS SYS pb-sw is OFF */
  readonly sysOff: boolean;
  /** L:A32NX_GPWS_TERR_FAULT: the EGPWC reports the terrain modes (TAD, TCF) inoperative */
  readonly terrainFault: boolean;
  /** L:A32NX_GPWS_TERR_OFF: the GPWS TERR pb-sw is OFF */
  readonly terrainOff: boolean;
}

/**
 * A fault memory: set by a fault seen with the pb-sw ON, kept while the EGPWC reports the fault (with the pb-sw OFF too)
 * @param previous the memory of the last update
 * @param fault the EGPWC reports the fault
 * @param pbOff the pb-sw of the function is OFF
 */
export function gpwsFaultMemory(previous: boolean, fault: boolean, pbOff: boolean): boolean {
  return fault && (previous || !pbOff);
}

/** The lines of NAV GPWS FAULT: 0 title, 1 -GPWS OFF, always shown */
function gpwsFaultLines(): number[] {
  return [0, 1];
}

/** The lines of NAV GPWS TERR DET FAULT: 0 title, 1 -GPWS TERR OFF, hidden once done */
function terrainDetectionFaultLines(terrainOff: boolean): (number | null)[] {
  return [0, terrainOff ? null : 1];
}

/** NAV GPWS FAULT STATUS: INOP SYS GPWS */
function gpwsFaultStatus(): StatusLines {
  return { left: [], inopSys: ['240300152'] };
}

/** NAV GPWS TERR DET FAULT STATUS: INOP SYS GPWS TERR */
function terrainDetectionFaultStatus(): StatusLines {
  return { left: [], inopSys: ['240300153'] };
}

export class GpwsAlerts {
  private terrainOff = false;

  private readonly gpwsFault = Subject.create(false);

  private readonly terrainDetectionFault = Subject.create(false);

  update(inputs: GpwsInputs): void {
    this.terrainOff = inputs.terrainOff;
    this.gpwsFault.set(gpwsFaultMemory(this.gpwsFault.get(), inputs.sysFault, inputs.sysOff));
    this.terrainDetectionFault.set(
      gpwsFaultMemory(this.terrainDetectionFault.get(), inputs.terrainFault, inputs.terrainOff),
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [GpwsAlertKeys.gpwsFault]: cautionItem(
      GpwsAlertKeys.gpwsFault,
      2,
      this.gpwsFault,
      GPWS_PHASE_INHIBITION,
      gpwsFaultLines,
      EcamSysPage.NONE,
      gpwsFaultStatus,
    ),
    [GpwsAlertKeys.terrainDetectionFault]: cautionItem(
      GpwsAlertKeys.terrainDetectionFault,
      2,
      this.terrainDetectionFault,
      GPWS_PHASE_INHIBITION,
      () => terrainDetectionFaultLines(this.terrainOff),
      EcamSysPage.NONE,
      terrainDetectionFaultStatus,
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

/** Reads the GPWS inputs from the simvars */
export function readGpwsInputs(): GpwsInputs {
  return {
    sysFault: readBool('L:A32NX_GPWS_SYS_FAULT'),
    sysOff: readBool('L:A32NX_GPWS_SYS_OFF'),
    terrainFault: readBool('L:A32NX_GPWS_TERR_FAULT'),
    terrainOff: readBool('L:A32NX_GPWS_TERR_OFF'),
  };
}
