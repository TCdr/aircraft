// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The display unit reconfiguration of the A380 Control and Display System (CDS): which display each DU shows.
 *
 * Source: A380 FCOM DSC-31-15-20 "CDS - Abnormal operations" (KAL fleet; a380_fcom.txt:63131-63217, the capability
 * table read from the PDF p. 2136) and DSC-31-20-50 "EFIS - Controls and indicators" (PFD/ND pb, a380_fcom.txt:70312-70315).
 * This module is pure (no SimVar): the systems host (Misc/CdsReconfiguration.ts) feeds it and writes the result.
 */

import { DisplayUnitID } from './CdsDisplayUnits';

/** A display of the CDS. As an L:var value, 0 (Own) is the normal display of the DU. */
export enum CdsDisplay {
  Own = 0,
  Pfd = 1,
  Nd = 2,
  Mfd = 3,
  Ewd = 4,
  Sd = 5,
}

export type CdsSide = 'CAPT' | 'FO';

/** The on-side DUs of each crew member */
const SIDE_DISPLAY_UNITS: Readonly<Record<CdsSide, { pfd: DisplayUnitID; nd: DisplayUnitID; mfd: DisplayUnitID }>> = {
  CAPT: { pfd: DisplayUnitID.CaptPfd, nd: DisplayUnitID.CaptNd, mfd: DisplayUnitID.CaptMfd },
  FO: { pfd: DisplayUnitID.FoPfd, nd: DisplayUnitID.FoNd, mfd: DisplayUnitID.FoMfd },
};

/** The normal display of each DU ("Normal" access mode of the FCOM capability table) */
const NORMAL_DISPLAY: Readonly<Record<DisplayUnitID, CdsDisplay>> = {
  [DisplayUnitID.CaptPfd]: CdsDisplay.Pfd,
  [DisplayUnitID.CaptNd]: CdsDisplay.Nd,
  [DisplayUnitID.CaptMfd]: CdsDisplay.Mfd,
  [DisplayUnitID.FoPfd]: CdsDisplay.Pfd,
  [DisplayUnitID.FoNd]: CdsDisplay.Nd,
  [DisplayUnitID.FoMfd]: CdsDisplay.Mfd,
  [DisplayUnitID.Ewd]: CdsDisplay.Ewd,
  [DisplayUnitID.Sd]: CdsDisplay.Sd,
};

/**
 * The display sequence of the DU RECONF pb on each DU: the normal display, then the "Manual" displays in the order of
 * the FCOM capability table (DSC-31-15-20 P 2, "the display sequence when using the DU RECONF pb"). The "Automatic"
 * displays (PFD on the ND DU, EWD on the SD DU) are not in the sequence.
 */
export const DU_RECONF_SEQUENCE: Readonly<Record<DisplayUnitID, readonly CdsDisplay[]>> = {
  [DisplayUnitID.CaptPfd]: [CdsDisplay.Pfd, CdsDisplay.Nd, CdsDisplay.Mfd],
  [DisplayUnitID.CaptNd]: [CdsDisplay.Nd, CdsDisplay.Mfd, CdsDisplay.Ewd, CdsDisplay.Sd],
  [DisplayUnitID.CaptMfd]: [CdsDisplay.Mfd, CdsDisplay.Ewd, CdsDisplay.Sd, CdsDisplay.Pfd, CdsDisplay.Nd],
  [DisplayUnitID.FoPfd]: [CdsDisplay.Pfd, CdsDisplay.Nd, CdsDisplay.Mfd],
  [DisplayUnitID.FoNd]: [CdsDisplay.Nd, CdsDisplay.Mfd, CdsDisplay.Ewd, CdsDisplay.Sd],
  [DisplayUnitID.FoMfd]: [CdsDisplay.Mfd, CdsDisplay.Ewd, CdsDisplay.Sd, CdsDisplay.Pfd, CdsDisplay.Nd],
  [DisplayUnitID.Ewd]: [CdsDisplay.Ewd],
  [DisplayUnitID.Sd]: [CdsDisplay.Sd],
};

/**
 * The displays the simulation can draw on each DU: every display is a gauge of its own, so a DU can only show a display
 * that has a gauge on its texture (panel.cfg). Design choice, not FCOM: the PFD and the ND on both DUs of a side and the
 * EWD on the SD DU. The MFD (one gauge over both MFD screens, which also runs the FMS) and the SD (two gauges, one of
 * them a legacy React instrument) are not drawn on another DU, so the DU RECONF pb skips them.
 */
export const DRAWN_DISPLAYS: Readonly<Record<DisplayUnitID, readonly CdsDisplay[]>> = {
  [DisplayUnitID.CaptPfd]: [CdsDisplay.Pfd, CdsDisplay.Nd],
  [DisplayUnitID.CaptNd]: [CdsDisplay.Nd, CdsDisplay.Pfd],
  [DisplayUnitID.CaptMfd]: [CdsDisplay.Mfd],
  [DisplayUnitID.FoPfd]: [CdsDisplay.Pfd, CdsDisplay.Nd],
  [DisplayUnitID.FoNd]: [CdsDisplay.Nd, CdsDisplay.Pfd],
  [DisplayUnitID.FoMfd]: [CdsDisplay.Mfd],
  [DisplayUnitID.Ewd]: [CdsDisplay.Ewd],
  [DisplayUnitID.Sd]: [CdsDisplay.Sd, CdsDisplay.Ewd],
};

/** The DUs in their duID order */
const DISPLAY_UNITS: readonly DisplayUnitID[] = [
  DisplayUnitID.CaptPfd,
  DisplayUnitID.CaptNd,
  DisplayUnitID.CaptMfd,
  DisplayUnitID.FoPfd,
  DisplayUnitID.FoNd,
  DisplayUnitID.FoMfd,
  DisplayUnitID.Ewd,
  DisplayUnitID.Sd,
];

export type DisplayUnitMap<T> = Record<DisplayUnitID, T>;

/**
 * The normal display of a DU
 * @param du the DU
 * @returns its display in normal operation
 */
export function normalDisplayOf(du: DisplayUnitID): CdsDisplay {
  return NORMAL_DISPLAY[du];
}

/**
 * The display a DU shows, from the value of its L:A380X_CDS_..._DU_DISPLAY variable
 * @param du the DU
 * @param value the L:var value (0 or an unknown value: the normal display)
 * @returns the display
 */
export function resolveDisplay(du: DisplayUnitID, value: number): CdsDisplay {
  switch (value) {
    case CdsDisplay.Pfd:
    case CdsDisplay.Nd:
    case CdsDisplay.Mfd:
    case CdsDisplay.Ewd:
    case CdsDisplay.Sd:
      return value;
    default:
      return NORMAL_DISPLAY[du];
  }
}

/**
 * The L:var value for a display shown on a DU: 0 for its normal display, so the variable stays 0 in normal operation
 * (and before the systems host first writes it)
 * @param du the DU
 * @param display the display it shows
 * @returns the value
 */
export function encodeDisplay(du: DisplayUnitID, display: CdsDisplay): number {
  return display === NORMAL_DISPLAY[du] ? CdsDisplay.Own : display;
}

/**
 * The crew side of a DU
 * @param du the DU
 * @returns CAPT, FO, or null for the EWD and SD DUs (centre, "reconfigured from both sides")
 */
function sideOf(du: DisplayUnitID): CdsSide | null {
  for (const side of ['CAPT', 'FO'] as const) {
    const { pfd, nd, mfd } = SIDE_DISPLAY_UNITS[side];
    if (du === pfd || du === nd || du === mfd) {
      return side;
    }
  }
  return null;
}

export interface CdsReconfigurationInputs {
  /** The DU can show a picture: powered, not failed and not switched off with its brightness knob */
  operative: Readonly<DisplayUnitMap<boolean>>;
  /** The PFD/ND pb of the side has exchanged the PFD and the ND */
  pfdNdSwapped: Readonly<Record<CdsSide, boolean>>;
  /** The displays selected with the DU RECONF pb, per DU */
  manual: Readonly<Partial<DisplayUnitMap<CdsDisplay>>>;
}

/**
 * Whether a display is shown on a DU of the other side
 * @param displays the displays so far
 * @param side the side
 * @param display the display
 * @returns true if a DU of the other side shows it
 */
function shownOnOtherSide(displays: DisplayUnitMap<CdsDisplay>, side: CdsSide, display: CdsDisplay): boolean {
  const other = SIDE_DISPLAY_UNITS[side === 'CAPT' ? 'FO' : 'CAPT'];
  return displays[other.pfd] === display || displays[other.nd] === display || displays[other.mfd] === display;
}

/**
 * The display of every DU.
 *
 * - PFD/ND pb: "exchanges the onside PFD and the ND, regardless of their default position" (a380_fcom.txt:70312-70315).
 * - Automatic reconfiguration: "If the CAPT (F/O) PFD DU fails, the PFD is automatically displayed on the CAPT (F/O) ND
 *   DU. If the EWD DU fails, the EWD is automatically displayed on the SD DU" (a380_fcom.txt:63143-63147; the ECAM
 *   procedure says the same for a DU turned OFF, a380_fcom.txt:157938-157946). With the PFD/ND pb pressed the PFD is on
 *   the ND DU, and comes back to the PFD DU if the ND DU fails (the same priority to the PFD).
 * - Manual reconfiguration (DU RECONF pb): the selected display, on an operative DU that can draw it. "The EWD (SD)
 *   cannot be displayed on both sides at the same time" (a380_fcom.txt:63186-63187).
 *
 * A DU that is not operative keeps its normal display (it is blank anyway): no other gauge wakes up on it.
 * @param inputs the DU states and the crew selections
 * @returns the display of each DU
 */
export function computeCdsDisplays(inputs: CdsReconfigurationInputs): DisplayUnitMap<CdsDisplay> {
  const { operative } = inputs;
  const displays = { ...NORMAL_DISPLAY };

  for (const side of ['CAPT', 'FO'] as const) {
    const { pfd, nd } = SIDE_DISPLAY_UNITS[side];
    const pfdHome = inputs.pfdNdSwapped[side] ? nd : pfd;
    const ndHome = pfdHome === pfd ? nd : pfd;
    if (operative[pfdHome]) {
      displays[pfdHome] = CdsDisplay.Pfd;
      if (operative[ndHome]) {
        displays[ndHome] = CdsDisplay.Nd;
      }
    } else if (operative[ndHome]) {
      // automatic reconfiguration: the PFD takes the other DU, the ND is lost
      displays[ndHome] = CdsDisplay.Pfd;
    }
  }

  if (!operative[DisplayUnitID.Ewd] && operative[DisplayUnitID.Sd]) {
    displays[DisplayUnitID.Sd] = CdsDisplay.Ewd;
  }

  for (const du of DISPLAY_UNITS) {
    const selected = inputs.manual[du];
    const side = sideOf(du);
    if (
      selected === undefined ||
      side === null ||
      !operative[du] ||
      !DU_RECONF_SEQUENCE[du].includes(selected) ||
      !DRAWN_DISPLAYS[du].includes(selected)
    ) {
      continue;
    }
    if ((selected === CdsDisplay.Ewd || selected === CdsDisplay.Sd) && shownOnOtherSide(displays, side, selected)) {
      continue;
    }
    displays[du] = selected;
  }

  return displays;
}

/**
 * The DU the DU RECONF pb of a side acts on (a380_fcom.txt:63160-63175): "active only if there is a failed on-side
 * display unit. The EWD DU and SD DU can be reconfigured from both sides."
 * CAPT: the MFD DU; the ND DU if the MFD DU is failed; the PFD DU if both the ND DU and MFD DU are failed.
 * F/O: the ND DU if the PFD DU and ND DU are both operative; the MFD DU if either is failed; the PFD DU if both the ND
 * DU and MFD DU are failed ("to favor the display of the PFD on either the PFD or ND DU").
 * Design choice: a DU that is not operative (failed, unpowered or switched off) counts as failed; when the F/O's PFD or
 * ND DU and the MFD DU are failed, the remaining one of the PFD and ND DUs.
 * @param side the side of the pb
 * @param operative the DU states
 * @returns the DU, or null while the pb is not active (or no DU is left)
 */
export function duReconfTarget(side: CdsSide, operative: Readonly<DisplayUnitMap<boolean>>): DisplayUnitID | null {
  const { pfd, nd, mfd } = SIDE_DISPLAY_UNITS[side];
  const failedDuOnSide =
    !operative[pfd] ||
    !operative[nd] ||
    !operative[mfd] ||
    !operative[DisplayUnitID.Ewd] ||
    !operative[DisplayUnitID.Sd];
  if (!failedDuOnSide) {
    return null;
  }

  let target: DisplayUnitID;
  if (!operative[nd] && !operative[mfd]) {
    target = pfd;
  } else if (side === 'CAPT') {
    target = operative[mfd] ? mfd : nd;
  } else if (operative[pfd] && operative[nd]) {
    target = nd;
  } else {
    target = operative[mfd] ? mfd : operative[pfd] ? pfd : nd;
  }
  return operative[target] ? target : null;
}

/**
 * The display after one press of the DU RECONF pb on a DU: the next one of its sequence that the DU can draw, skipping
 * an EWD or SD shown on the other side; after the last one, the normal display.
 * Design choice: a DU that shows an automatic display (the PFD on the ND DU, the EWD on the SD DU) keeps it, so the pb
 * never takes the PFD away from the DU it moved to.
 * @param du the DU
 * @param current the display it shows
 * @param displays the displays of all DUs
 * @returns the next display (the current one if there is nothing else to show)
 */
export function nextDuReconfDisplay(
  du: DisplayUnitID,
  current: CdsDisplay,
  displays: Readonly<DisplayUnitMap<CdsDisplay>>,
): CdsDisplay {
  const sequence = DU_RECONF_SEQUENCE[du].filter((display) => DRAWN_DISPLAYS[du].includes(display));
  const index = sequence.indexOf(current);
  const side = sideOf(du);
  if (index < 0 || side === null) {
    return current;
  }
  for (let step = 1; step <= sequence.length; step++) {
    const candidate = sequence[(index + step) % sequence.length];
    const blocked =
      (candidate === CdsDisplay.Ewd || candidate === CdsDisplay.Sd) && shownOnOtherSide(displays, side, candidate);
    if (!blocked) {
      return candidate;
    }
  }
  return current;
}

/**
 * The reconfiguration state kept by the CDS: the PFD/ND pb selection of each side and the DU RECONF pb selections.
 */
export class CdsReconfigurationState {
  private readonly pfdNdSwapped: Record<CdsSide, boolean> = { CAPT: false, FO: false };

  private readonly manual: Partial<DisplayUnitMap<CdsDisplay>> = {};

  private operative: DisplayUnitMap<boolean>;

  constructor(operative: Readonly<DisplayUnitMap<boolean>>) {
    this.operative = { ...operative };
  }

  /**
   * A press on the PFD/ND pb of a side
   * @param side the side
   */
  public pressPfdNd(side: CdsSide): void {
    this.pfdNdSwapped[side] = !this.pfdNdSwapped[side];
  }

  /**
   * A press on the DU RECONF pb of a side
   * @param side the side
   */
  public pressDuReconf(side: CdsSide): void {
    const target = duReconfTarget(side, this.operative);
    if (target === null) {
      return;
    }
    const displays = this.displays();
    const next = nextDuReconfDisplay(target, displays[target], displays);
    if (next === NORMAL_DISPLAY[target]) {
      delete this.manual[target];
    } else {
      this.manual[target] = next;
    }
  }

  /**
   * New DU states. The DU RECONF selections of a side end when its pb is no longer active (no failed DU left), and the
   * selection of a DU that is no longer operative is dropped (design choice).
   * @param operative the DU states
   * @returns the display of each DU
   */
  public update(operative: Readonly<DisplayUnitMap<boolean>>): DisplayUnitMap<CdsDisplay> {
    this.operative = { ...operative };
    for (const du of DISPLAY_UNITS) {
      if (this.manual[du] === undefined) {
        continue;
      }
      const side = sideOf(du);
      if (!operative[du] || side === null || duReconfTarget(side, operative) === null) {
        delete this.manual[du];
      }
    }
    return this.displays();
  }

  /**
   * The display of each DU for the current state
   * @returns the displays
   */
  public displays(): DisplayUnitMap<CdsDisplay> {
    return computeCdsDisplays({ operative: this.operative, pfdNdSwapped: this.pfdNdSwapped, manual: this.manual });
  }
}
