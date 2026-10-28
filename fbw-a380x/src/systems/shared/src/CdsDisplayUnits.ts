// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The display units (DUs) of the A380 Control and Display System (CDS) and their failures.
 */

import { A380Failure } from '@failures';
import { DcElectricalBus } from './electrical';

/**
 * The 8 DUs of the CDS. The values are the duID of panel.cfg.
 */
export enum DisplayUnitID {
  CaptPfd,
  CaptNd,
  CaptMfd,
  FoPfd,
  FoNd,
  FoMfd,
  Ewd,
  Sd,
}

/** Every DU: captain side, then the centre DUs, then the F/O side */
export const ALL_DISPLAY_UNITS: readonly DisplayUnitID[] = [
  DisplayUnitID.CaptPfd,
  DisplayUnitID.CaptNd,
  DisplayUnitID.CaptMfd,
  DisplayUnitID.Ewd,
  DisplayUnitID.Sd,
  DisplayUnitID.FoMfd,
  DisplayUnitID.FoNd,
  DisplayUnitID.FoPfd,
];

/** The flyPad failure of each DU (ATA 31) */
export const DisplayUnitFailure: Readonly<Record<DisplayUnitID, number>> = {
  [DisplayUnitID.CaptPfd]: A380Failure.CaptPfdDisplayUnit,
  [DisplayUnitID.CaptNd]: A380Failure.CaptNdDisplayUnit,
  [DisplayUnitID.CaptMfd]: A380Failure.CaptMfdDisplayUnit,
  [DisplayUnitID.FoPfd]: A380Failure.FoPfdDisplayUnit,
  [DisplayUnitID.FoNd]: A380Failure.FoNdDisplayUnit,
  [DisplayUnitID.FoMfd]: A380Failure.FoMfdDisplayUnit,
  [DisplayUnitID.Ewd]: A380Failure.EwdDisplayUnit,
  [DisplayUnitID.Sd]: A380Failure.SdDisplayUnit,
};

/**
 * The DC busbars that supply each DU; the DU is on while either is powered. A DU with a single supply lists it twice.
 */
export const DisplayUnitToDCBus: Readonly<Record<DisplayUnitID, readonly [DcElectricalBus, DcElectricalBus]>> = {
  [DisplayUnitID.CaptPfd]: [DcElectricalBus.DcEssInFlight, DcElectricalBus.DcEssInFlight], // powered by 409PP
  [DisplayUnitID.CaptNd]: [DcElectricalBus.DcEssInFlight, DcElectricalBus.Dc1], // powered by 415PP or 105PP
  [DisplayUnitID.CaptMfd]: [DcElectricalBus.DcEss, DcElectricalBus.Dc1], // powered by 423PP or 111PP
  [DisplayUnitID.FoPfd]: [DcElectricalBus.Dc2, DcElectricalBus.Dc2],
  [DisplayUnitID.FoNd]: [DcElectricalBus.Dc1, DcElectricalBus.Dc2],
  [DisplayUnitID.FoMfd]: [DcElectricalBus.Dc1, DcElectricalBus.Dc2],
  [DisplayUnitID.Ewd]: [DcElectricalBus.DcEss, DcElectricalBus.DcEss], // powered by 423PP
  [DisplayUnitID.Sd]: [DcElectricalBus.Dc2, DcElectricalBus.Dc2],
};

/** The name of each DU in an L:var */
const DisplayUnitVarName: Readonly<Record<DisplayUnitID, string>> = {
  [DisplayUnitID.CaptPfd]: 'CAPT_PFD',
  [DisplayUnitID.CaptNd]: 'CAPT_ND',
  [DisplayUnitID.CaptMfd]: 'CAPT_MFD',
  [DisplayUnitID.FoPfd]: 'FO_PFD',
  [DisplayUnitID.FoNd]: 'FO_ND',
  [DisplayUnitID.FoMfd]: 'FO_MFD',
  [DisplayUnitID.Ewd]: 'EWD',
  [DisplayUnitID.Sd]: 'SD',
};

/**
 * The L:var a DU writes while it is failed (1) or not (0). The ND weather radar / terrain gauge (ndwxr), which draws over
 * the ND DU in its own gauge, reads the ND ones to go blank with the DU.
 * @param du the DU
 * @returns the L:var name, with the `L:` prefix
 */
export function displayUnitFailedVar(du: DisplayUnitID): string {
  return `L:A380X_CDS_${DisplayUnitVarName[du]}_DU_FAILED`;
}

/**
 * The L:var that tells which display a DU shows after the CDS reconfiguration (written by the systems host,
 * CdsReconfiguration.ts): 0 its own display, else a CdsDisplay value. The gauges of the DU read it to show or hide.
 * @param du the DU
 * @returns the L:var name, with the `L:` prefix
 */
export function displayUnitDisplayVar(du: DisplayUnitID): string {
  return `L:A380X_CDS_${DisplayUnitVarName[du]}_DU_DISPLAY`;
}

/**
 * The L:var with the DU that shows the ATC mailbox (the bottom section of the SD) and the mailbox client that is active
 * (written by the systems host, CdsReconfiguration.ts, value from encodeMailboxDisplayUnit in CdsReconfiguration.ts).
 * Each gauge that draws the SD reads it: only the mailbox on that DU answers the flight crew and publishes to the ATC
 * function.
 */
export const MAILBOX_DISPLAY_UNIT_VAR = 'L:A380X_CDS_MAILBOX_DU';

/**
 * Whether a DU is powered: either of its DC busbars is.
 * @param du the DU
 * @param isBusPowered whether a DC busbar is powered
 * @returns true while the DU has power
 */
export function isDisplayUnitPowered(du: DisplayUnitID, isBusPowered: (bus: DcElectricalBus) => boolean): boolean {
  const [bus1, bus2] = DisplayUnitToDCBus[du];
  return isBusPowered(bus1) || isBusPowered(bus2);
}

/**
 * The triggering condition of the CDS CAPT PFD(CAPT ND)(CAPT MFD)(EWD)(SD)(F/O PFD)(F/O ND)(F/O MFD) DU FAULT alert:
 * the DU is failed. The aircraft's second condition (a DU that declared two other DUs faulty in turn) is not simulated:
 * it needs a DU that reports false monitoring results.
 * Design choice: only while the DU is powered. An unpowered DU is blank too, but the lost busbar has its own ELEC alert.
 * @param failed the DU failure is active
 * @param powered the DU is powered (isDisplayUnitPowered)
 * @returns true while the alert is triggered
 */
export function isDisplayUnitFaultTriggered(failed: boolean, powered: boolean): boolean {
  return failed && powered;
}

/**
 * The two independent monitoring loops of the DUs, four DUs each (a DU monitors the next one of its loop).
 * Design choice: the captain side and the EWD in one loop, the first officer side and the SD in the other. The real
 * members are not published, only that the F/O ND monitors the F/O MFD, which monitors the F/O PFD.
 */
const DISPLAY_UNIT_MONITORING_LOOPS: readonly (readonly DisplayUnitID[])[] = [
  [DisplayUnitID.CaptPfd, DisplayUnitID.CaptNd, DisplayUnitID.CaptMfd, DisplayUnitID.Ewd],
  [DisplayUnitID.FoPfd, DisplayUnitID.FoNd, DisplayUnitID.FoMfd, DisplayUnitID.Sd],
];

/**
 * The triggering condition of the CDS CAPT PFD(CAPT ND)(EWD)(F/O PFD)(F/O ND) DU NOT MONITORED alert: the DU is no
 * longer monitored. The loops reconfigure when a DU fails, so a DU stays monitored while one other DU of its loop works;
 * the last working DU of a loop has no one left to monitor it. The MFDs and the SD have no alert.
 * @param du the DU
 * @param isOperative whether a DU shows a picture (powered and not failed)
 * @returns true while the DU works but no other DU of its loop does
 */
export function isDisplayUnitNotMonitored(du: DisplayUnitID, isOperative: (du: DisplayUnitID) => boolean): boolean {
  const loop = DISPLAY_UNIT_MONITORING_LOOPS.find((members) => members.includes(du)) ?? [];
  return isOperative(du) && !loop.some((member) => member !== du && isOperative(member));
}
