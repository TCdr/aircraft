// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The display units (DUs) of the A380 Control and Display System (CDS) and their failures.
 *
 * Source: A380 FCOM DSC-31-15 "CDS" and PRO-ABN-ECAM-10-31 "CDS ... DU FAULT" (KAL fleet). Line numbers refer to the
 * text copy references/manuals/a380_fcom.txt; the audio, master light and flight phase inhibition of the alert are
 * figures, read from the PDF (airbus-a380-fcom_compress.pdf p. 5386).
 */

import { A380Failure } from '@failures';
import { DcElectricalBus } from './electrical';

/**
 * The 8 DUs of the CDS: "The 8 DUs are: the CAPT PFD, the CAPT ND, the CAPT MFD, the E/WD, the SD, the F/O MFD, the
 * F/O ND, the F/O PFD" (FCOM DSC-31-15-10, a380_fcom.txt:62972-62980). The values are the duID of panel.cfg.
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

/** Every DU, in the order of the FCOM list */
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
 * The DC busbars that supply each DU; the DU is on while either is powered (FCOM DSC-31-15-95, a380_fcom.txt:63286-63297:
 * CAPT PFD DC ESS, CAPT ND and CAPT MFD DC ESS / DC 1, F/O PFD DC 2, F/O ND and F/O MFD DC 1 / DC 2, EWD DC ESS, SD DC 2).
 * A DU with a single supply lists it twice.
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
 * "The DU is failed" (FCOM PRO-ABN-ECAM-10-31, a380_fcom.txt:157885-157893). The second condition of the FCOM (a DU that
 * declared two other DUs faulty in turn) needs the DU monitoring loops, which are not simulated.
 * Design choice: only while the DU is powered. An unpowered DU is blank too, but the lost busbar has its own ELEC alert.
 * @param failed the DU failure is active
 * @param powered the DU is powered (isDisplayUnitPowered)
 * @returns true while the alert is triggered
 */
export function isDisplayUnitFaultTriggered(failed: boolean, powered: boolean): boolean {
  return failed && powered;
}
