// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A320 display unit (DU) reconfiguration: which picture each of the six EIS DUs shows.
 *
 * A320 FCOM (a320_fcom.txt):
 * - DSC-31-05-60 "FAILURE OF UPPER ECAM DU (OR CTL/BRIGHTNESS KNOB TURNED TO OFF)" (l.45259-45272): the E/WD
 *   automatically replaces the SD on the lower ECAM DU; the SD can then be displayed on an ND with the ECAM/ND XFR
 *   selector, or on the lower DU by pushing and holding (max 3 min) a system page pb.
 * - "FAILURE OF LOWER ECAM DU (OR CTL/BRIGHTNESS KNOB TURNED TO OFF)" (l.45276-45288): nothing automatic; the SD can be
 *   displayed on an ND with ECAM/ND XFR, or on the upper DU by pushing and holding a system page pb.
 * - "FAILURE OF BOTH ECAM DUs" (l.45290-45298): ECAM/ND XFR displays the E/WD on an ND, and pushing and holding a system
 *   page pb displays the SD there.
 * - "PFDU/NDU RECONFIGURATION" (l.45300-45325): a failed PFDU automatically transfers the PFD image to the NDU; turning
 *   the PFD brightness knob OFF does the same; the PFD/ND XFR pb cross-changes the PFDU and NDU images; with a failed
 *   NDU the PFD/ND XFR pb transfers the ND image to the PFDU.
 * - DSC-31-50 OFF/BRT knobs (l.49317-49332): PFD knob OFF: "the PFD image is automatically displayed on the NDU, but the
 *   pilot may recover the ND by means of the PFD-ND XFR pushbutton"; ND knob OFF switches the NDU off; the PFD/ND pb
 *   interchanges the PFD and the ND.
 * - DSC-31-30 SWITCHING panel, ECAM/ND XFR (l.46861-46867): transfers the system/status display to the CAPT or F/O ND,
 *   the "ECAM ON ND" message is displayed on the lower ECAM display; with both ECAM DUs failed it transfers the E/WD,
 *   without that message.
 * - DSC-31-30 MEMO DISPLAY, SWITCHING PNL (l.46928-46935).
 *
 * The DMC logic (systems host) writes the picture of each DU in an L:var. Each picture is the texture of one gauge
 * (PFD_L, ND_L, ECAM_EWD, ECAM_SD, ND_R, PFD_R), and the cockpit model routes it: every DU has one glass per picture it
 * can show (its own, the glasses of the other pictures with the material of their texture, the ECAM ON ND message, a
 * blank one), and the model behaviour shows the glass of the picture in the L:var (A320_NEO_INTERIOR.xml,
 * FBW_A32NX_DU_Picture_Glass). The brightness stays the DU's own knob. A gauge keeps drawing its picture while it is
 * shown on another DU that is available, even with its own DU lost (L:A32NX_EIS_PICTURE_{picture}_ON_OTHER_DU).
 */

/** The six EIS display units, named by position. */
export type DisplayUnitId = 'PFD_L' | 'ND_L' | 'UPPER_ECAM' | 'LOWER_ECAM' | 'ND_R' | 'PFD_R';

export const DISPLAY_UNITS: readonly DisplayUnitId[] = ['PFD_L', 'ND_L', 'UPPER_ECAM', 'LOWER_ECAM', 'ND_R', 'PFD_R'];

/** The picture shown on a DU, as written in the DU picture L:var. */
export enum DisplayPicture {
  /** The DU shows its own picture (PFD on a PFD DU, ND on an ND DU, E/WD on the upper and SD on the lower ECAM DU) */
  Own = 0,
  /** The PFD of the DU's side */
  Pfd = 1,
  /** The ND of the DU's side */
  Nd = 2,
  /** The engine/warning display (E/WD) */
  EngineWarning = 3,
  /** The system/status display (SD) */
  System = 4,
  /** The lower ECAM DU while its SD is transferred to an ND: the "ECAM ON ND" message (FCOM l.46863) */
  EcamOnNd = 5,
  /** An unavailable DU (failed, unpowered or switched off): its glass stays dark whatever its gauge draws */
  Blank = 6,
}

/** The pictures, one per gauge texture. */
export type EisPictureId = 'PFD_L' | 'ND_L' | 'EWD' | 'SD' | 'ND_R' | 'PFD_R';

export const EIS_PICTURES: readonly EisPictureId[] = ['PFD_L', 'ND_L', 'EWD', 'SD', 'ND_R', 'PFD_R'];

/** The DU that normally shows a picture. */
const HOME_DISPLAY_UNIT: Readonly<Record<EisPictureId, DisplayUnitId>> = {
  PFD_L: 'PFD_L',
  ND_L: 'ND_L',
  EWD: 'UPPER_ECAM',
  SD: 'LOWER_ECAM',
  ND_R: 'ND_R',
  PFD_R: 'PFD_R',
};

/** The picture a DU shows in the normal configuration. */
export function ownPictureOf(du: DisplayUnitId): DisplayPicture {
  switch (du) {
    case 'PFD_L':
    case 'PFD_R':
      return DisplayPicture.Pfd;
    case 'ND_L':
    case 'ND_R':
      return DisplayPicture.Nd;
    case 'UPPER_ECAM':
      return DisplayPicture.EngineWarning;
    default:
      return DisplayPicture.System;
  }
}

/** The L:var with the picture shown on a DU (a DisplayPicture, 0 = its own picture), written by the DMC logic. */
export function displayUnitPictureVar(du: DisplayUnitId): string {
  return `L:A32NX_EIS_DU_${du}_PICTURE`;
}

/**
 * The L:var that tells the gauge of a picture that the picture is shown on another DU that is available, written by the
 * DMC logic: the gauge then draws it even with its own DU lost (e.g. the PFD on the ND DU with the PFD DU failed).
 */
export function pictureOnOtherDuVar(picture: EisPictureId): string {
  return `L:A32NX_EIS_PICTURE_${picture}_ON_OTHER_DU`;
}

/**
 * The picture a DU shows, as one of the gauge pictures, or null (the ECAM ON ND message, a blank DU).
 * @param du the DU
 * @param picture its picture (an explicit picture, never DisplayPicture.Own)
 */
export function eisPictureOn(du: DisplayUnitId, picture: DisplayPicture): EisPictureId | null {
  const side = du.endsWith('_R') ? 'R' : 'L';
  switch (picture) {
    case DisplayPicture.Pfd:
      return `PFD_${side}`;
    case DisplayPicture.Nd:
      return `ND_${side}`;
    case DisplayPicture.EngineWarning:
      return 'EWD';
    case DisplayPicture.System:
      return 'SD';
    default:
      return null;
  }
}

/**
 * Whether each picture is shown on a DU other than its own one, and that DU is available.
 * @param pictures the picture of each DU (computeDisplayPictures)
 * @param available whether each DU can show a picture
 */
export function picturesShownOnOtherDu(
  pictures: DisplayPictures,
  available: Readonly<Record<DisplayUnitId, boolean>>,
): Record<EisPictureId, boolean> {
  const shown = { PFD_L: false, ND_L: false, EWD: false, SD: false, ND_R: false, PFD_R: false };
  for (const du of DISPLAY_UNITS) {
    const picture = eisPictureOn(du, pictures[du]);
    if (picture !== null && available[du] && HOME_DISPLAY_UNIT[picture] !== du) {
      shown[picture] = true;
    }
  }
  return shown;
}

export type EfisSideLetter = 'L' | 'R';

/** The L:var that tells that the PFD/ND XFR pb of a side has cross-changed the PFD and ND images, written by the DMC. */
export function pfdNdXfrVar(side: EfisSideLetter): string {
  return `L:A32NX_EFIS_${side}_PFD_ND_XFR`;
}

/** The H event sent by the PFD/ND XFR pb of a side (cockpit behaviour). */
export function pfdNdXfrPushedEvent(side: EfisSideLetter): string {
  return `A32NX_EFIS_${side}_PFD_ND_XFR_PUSHED`;
}

/** The ECAM/ND XFR selector of the SWITCHING panel (cockpit behaviour, L:A32NX_ECAM_ND_XFR_SWITCHING_KNOB). */
export enum EcamNdXfrKnob {
  Capt = 0,
  Norm = 1,
  Fo = 2,
}

export const ECAM_ND_XFR_KNOB_VAR = 'L:A32NX_ECAM_ND_XFR_SWITCHING_KNOB';

/** A system page pb displays the SD instead of the E/WD for at most 3 min while pushed and held (FCOM l.45270). */
export const ECAM_PAGE_PB_HOLD_MAX_SECONDS = 180;

/**
 * How long a system page pb must be held before the SD is displayed (design choice: the FCOM says "push and hold"; a
 * click that only selects or deselects a page does not flash the SD, and the SD has its new page drawn before it is
 * shown).
 */
export const ECAM_PAGE_PB_HOLD_CONFIRM_SECONDS = 0.5;

/**
 * Whether a DU can show a picture. A failed DU, a DU switched off with its brightness knob (FCOM l.45259, l.45320,
 * l.49322) and, as a design choice, an unpowered DU count as unavailable for the automatic transfers.
 */
export function isDisplayUnitAvailable(failed: boolean, powered: boolean, brightness: number): boolean {
  return !failed && powered && brightness > 0;
}

export interface DisplayReconfigurationInputs {
  /** Whether each DU can show a picture (isDisplayUnitAvailable) */
  readonly available: Readonly<Record<DisplayUnitId, boolean>>;
  /** The ECAM/ND XFR selector position (an EcamNdXfrKnob value) */
  readonly ecamNdXfrKnob: number;
  /** Whether the CAPT PFD/ND XFR pb has cross-changed the images (nextPfdNdXfr) */
  readonly pfdNdXfrL: boolean;
  /** Whether the F/O PFD/ND XFR pb has cross-changed the images (nextPfdNdXfr) */
  readonly pfdNdXfrR: boolean;
  /** Whether a system page pb of the ECAM control panel is pushed and held, for less than 3 min */
  readonly ecamPagePbHeld: boolean;
}

export type DisplayPictures = Record<DisplayUnitId, DisplayPicture>;

/**
 * The picture of each DU (an explicit picture, never DisplayPicture.Own). The picture of an unavailable DU is computed as
 * well: the DU itself stays blank.
 */
export function computeDisplayPictures(inputs: DisplayReconfigurationInputs): DisplayPictures {
  const upperEcam = inputs.available.UPPER_ECAM;
  const lowerEcam = inputs.available.LOWER_ECAM;
  const held = inputs.ecamPagePbHeld;

  // ECAM/ND XFR: the SD goes to the selected ND; with both ECAM DUs lost, the E/WD (or the SD while a system page pb
  // is held) goes there (FCOM l.46861-46866, l.45290-45298)
  let ecamOnNd: DisplayPicture | null = null;
  if (inputs.ecamNdXfrKnob !== EcamNdXfrKnob.Norm) {
    ecamOnNd = !upperEcam && !lowerEcam && !held ? DisplayPicture.EngineWarning : DisplayPicture.System;
  }
  let ecamSide: EfisSideLetter | null = null;
  if (inputs.ecamNdXfrKnob === EcamNdXfrKnob.Capt) {
    ecamSide = 'L';
  } else if (inputs.ecamNdXfrKnob === EcamNdXfrKnob.Fo) {
    ecamSide = 'R';
  }

  // Upper ECAM DU: the E/WD, or the SD while a system page pb is held with the lower DU lost (FCOM l.45284)
  const upperPicture = !lowerEcam && held ? DisplayPicture.System : DisplayPicture.EngineWarning;

  // Lower ECAM DU: the E/WD when the upper DU is lost (automatic, FCOM l.45264) unless a system page pb is held
  // (l.45270); otherwise the SD, or the "ECAM ON ND" message while the SD is on an ND (l.46863)
  let lowerPicture: DisplayPicture;
  if (!upperEcam) {
    lowerPicture = held ? DisplayPicture.System : DisplayPicture.EngineWarning;
  } else if (ecamOnNd === DisplayPicture.System) {
    lowerPicture = DisplayPicture.EcamOnNd;
  } else {
    lowerPicture = DisplayPicture.System;
  }

  const [pfdL, ndL] = sidePictures(
    inputs.available.PFD_L,
    inputs.pfdNdXfrL,
    ecamSide === 'L' && ecamOnNd !== null ? ecamOnNd : DisplayPicture.Nd,
  );
  const [pfdR, ndR] = sidePictures(
    inputs.available.PFD_R,
    inputs.pfdNdXfrR,
    ecamSide === 'R' && ecamOnNd !== null ? ecamOnNd : DisplayPicture.Nd,
  );

  return {
    PFD_L: pfdL,
    ND_L: ndL,
    UPPER_ECAM: upperPicture,
    LOWER_ECAM: lowerPicture,
    ND_R: ndR,
    PFD_R: pfdR,
  };
}

/**
 * The pictures of the PFD DU and ND DU of one side.
 * The PFD goes to the ND DU when the PFD DU is unavailable (automatic, FCOM l.45304, l.49322); the PFD/ND XFR pb
 * cross-changes the two images (l.45321, l.49332), so after an automatic transfer it brings the ND back (l.49323).
 * Design choice: the ND DU picture that goes to the PFD DU is always the ND (an ECAM picture transferred to that ND DU
 * is not moved to the PFD DU, it is replaced by the PFD).
 * @param pfdAvailable whether the PFD DU can show a picture
 * @param pfdNdXfr whether the PFD/ND XFR pb has cross-changed the images
 * @param ndDuPicture what the ND DU shows when the PFD stays on the PFD DU: the ND, or an ECAM picture (ECAM/ND XFR)
 * @returns [PFD DU picture, ND DU picture]
 */
function sidePictures(
  pfdAvailable: boolean,
  pfdNdXfr: boolean,
  ndDuPicture: DisplayPicture,
): [DisplayPicture, DisplayPicture] {
  const pfdOnNdDu = pfdNdXfr !== !pfdAvailable;
  return pfdOnNdDu ? [DisplayPicture.Nd, DisplayPicture.Pfd] : [DisplayPicture.Pfd, ndDuPicture];
}

/**
 * The value written in the DU picture L:var: DisplayPicture.Blank for an unavailable DU, else 0 (DisplayPicture.Own)
 * for the DU's own picture, so that the normal configuration keeps every L:var at 0.
 * @param du the DU
 * @param picture its picture (computeDisplayPictures)
 * @param available whether the DU can show a picture
 */
export function encodeDisplayUnitPicture(
  du: DisplayUnitId,
  picture: DisplayPicture,
  available: boolean,
): DisplayPicture {
  if (!available) {
    return DisplayPicture.Blank;
  }
  return picture === ownPictureOf(du) ? DisplayPicture.Own : picture;
}

/**
 * The PFD/ND XFR state of a side after one DMC update. The pb cross-changes the images at each push. A change of the
 * PFD DU availability (failure, brightness knob OFF or back ON) starts again from the automatic configuration, so that
 * the PFD image always follows an available DU first (design choice: the FCOM describes the transfers from the normal
 * configuration only).
 * @param xfr the state before the update
 * @param pushed whether the pb was pushed since the last update
 * @param pfdWasAvailable whether the PFD DU was available at the last update
 * @param pfdAvailable whether the PFD DU is available now
 */
export function nextPfdNdXfr(xfr: boolean, pushed: boolean, pfdWasAvailable: boolean, pfdAvailable: boolean): boolean {
  let next = pfdWasAvailable !== pfdAvailable ? false : xfr;
  if (pushed) {
    next = !next;
  }
  return next;
}

/**
 * How long a system page pb has been held, after one DMC update of dt seconds.
 * @param heldSeconds the time before the update
 * @param held whether a system page pb is pushed now
 * @param dtSeconds the update period
 */
export function nextEcamPagePbHeldSeconds(heldSeconds: number, held: boolean, dtSeconds: number): number {
  return held ? heldSeconds + dtSeconds : 0;
}

/** Whether a held system page pb still displays the SD instead of the E/WD (3 min at most, FCOM l.45270). */
export function isEcamPagePbHoldActive(held: boolean, heldSeconds: number): boolean {
  return held && heldSeconds <= ECAM_PAGE_PB_HOLD_MAX_SECONDS;
}

/**
 * Whether a held system page pb displays the SD now: held for ECAM_PAGE_PB_HOLD_CONFIRM_SECONDS, 3 min at most.
 * While a pb is pushed but not yet confirmed, the SD gauge is already told to draw (picturesShownOnOtherDu of the
 * pictures with an active hold), so its page is up to date when its picture appears.
 */
export function isEcamPagePbHoldConfirmed(held: boolean, heldSeconds: number): boolean {
  return isEcamPagePbHoldActive(held, heldSeconds) && heldSeconds >= ECAM_PAGE_PB_HOLD_CONFIRM_SECONDS;
}

/**
 * The SWITCHING PNL memo (FCOM DSC-31-30 MEMO DISPLAY, l.46928-46935): a PFD/ND XFR pb pressed together with the
 * ECAM/ND XFR selector at CAPT or F/O, or the EIS DMC selector at CAPT or F/O. The ATT HDG and AIR DATA selectors give
 * the ADIRS SWTG memo in this aircraft.
 * @param ecamNdXfrKnob the ECAM/ND XFR selector (an EcamNdXfrKnob value)
 * @param eisDmcKnob the EIS DMC selector (1 = NORM)
 * @param pfdNdXfrL whether the CAPT PFD/ND XFR pb has cross-changed the images
 * @param pfdNdXfrR whether the F/O PFD/ND XFR pb has cross-changed the images
 */
export function isSwitchingPanelMemoShown(
  ecamNdXfrKnob: number,
  eisDmcKnob: number,
  pfdNdXfrL: boolean,
  pfdNdXfrR: boolean,
): boolean {
  return (ecamNdXfrKnob !== EcamNdXfrKnob.Norm && (pfdNdXfrL || pfdNdXfrR)) || eisDmcKnob !== 1;
}
