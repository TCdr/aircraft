// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The display unit reconfiguration of the A380 Control and Display System (CDS): which display each DU shows.
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

/** The normal display of each DU */
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
 * The display sequence of the DU RECONF pb on each DU: the normal display, then the displays the crew can select
 * manually, in the aircraft's order. The automatic ones (PFD on the ND DU, EWD on the SD DU) are not in the sequence.
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
 * that has a gauge on its texture (panel.cfg). Design choice, not the aircraft's: the PFD and the ND on both DUs of a
 * side, the EWD and the SD also on the ND DUs, and the EWD on the SD DU. The MFD (one gauge over both MFD screens,
 * which also runs the FMS) is not drawn on another DU, and nothing is drawn on the MFD DUs (one texture over both MFD
 * screens), so the DU RECONF pb skips them.
 */
export const DRAWN_DISPLAYS: Readonly<Record<DisplayUnitID, readonly CdsDisplay[]>> = {
  [DisplayUnitID.CaptPfd]: [CdsDisplay.Pfd, CdsDisplay.Nd],
  [DisplayUnitID.CaptNd]: [CdsDisplay.Nd, CdsDisplay.Pfd, CdsDisplay.Ewd, CdsDisplay.Sd],
  [DisplayUnitID.CaptMfd]: [CdsDisplay.Mfd],
  [DisplayUnitID.FoPfd]: [CdsDisplay.Pfd, CdsDisplay.Nd],
  [DisplayUnitID.FoNd]: [CdsDisplay.Nd, CdsDisplay.Pfd, CdsDisplay.Ewd, CdsDisplay.Sd],
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
 * @returns CAPT, FO, or null for the EWD and SD DUs (centre, reconfigured from both sides)
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

interface CdsReconfigurationInputs {
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
 * - PFD/ND pb: exchanges the on-side PFD and ND, whatever their current position.
 * - Automatic reconfiguration: a failed (or switched off) PFD DU puts the PFD on the on-side ND DU, a failed EWD DU
 *   puts the EWD on the SD DU. With the PFD/ND pb pressed the PFD is on the ND DU, and comes back to the PFD DU if the
 *   ND DU fails (the same priority to the PFD).
 * - Manual reconfiguration (DU RECONF pb): the selected display, on an operative DU that can draw it. The EWD (SD)
 *   cannot be shown on both sides at the same time.
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
 * The DU that shows the ATC mailbox, the bottom section of the SD ("The lower section of the SD permanently displays the
 * mailbox", a380_fcom.txt:95677; "The bottom section displays the mailbox", a380_fcom.txt:72777): the operative DU that
 * shows the SD. "If the SD DU is turned OFF, use the F/O DU RECONF P/B for ATC mailbox" (PRO-ABN-ECAM-10-31,
 * a380_fcom.txt:157950 and 158167): the SD on the F/O ND DU (or on the CAPT ND DU) brings the mailbox with it.
 *
 * Only one mailbox client may answer the flight crew and publish to the ATC function (displayed and read messages):
 * - the SD DU, while it is operative and shows the SD (normal operation);
 * - else the DU that shows the SD after the DU RECONF pb ("The EWD (SD) cannot be displayed on both sides at the same
 *   time", a380_fcom.txt:63186-63187: one ND DU at most).
 * - else none: the SD is shown nowhere, so no mailbox marks a new message as displayed / read (design choice: the ATC
 *   ring and the ATC MSG lights go on until a DU shows the mailbox again).
 * Design choice: the SD DU wins when it shows the SD too (an ND DU may also show the SD while the SD DU works, after a
 * DU RECONF selection because of another failed DU): the mailbox on the ND DU then mirrors the SD DU's one.
 * @param displays the display of each DU
 * @param operative the DU states (powered, not failed, not switched off)
 * @returns the DU, or null when no operative DU shows the SD
 */
export function mailboxDisplayUnit(
  displays: Readonly<DisplayUnitMap<CdsDisplay>>,
  operative: Readonly<DisplayUnitMap<boolean>>,
): DisplayUnitID | null {
  if (operative[DisplayUnitID.Sd] && displays[DisplayUnitID.Sd] === CdsDisplay.Sd) {
    return DisplayUnitID.Sd;
  }
  return DISPLAY_UNITS.find((du) => du !== DisplayUnitID.Sd && operative[du] && displays[du] === CdsDisplay.Sd) ?? null;
}

/** The value of L:A380X_CDS_MAILBOX_DU when no DU shows the mailbox */
export const NO_MAILBOX_DISPLAY_UNIT = -1;

/**
 * The L:A380X_CDS_MAILBOX_DU value for the DU that shows the mailbox: 0 for the SD DU, so the variable stays 0 in normal
 * operation and before the systems host first writes it (the SD DU's mailbox is the active one then, as before the CDS
 * reconfiguration); else the duID of that DU (never 0: the CAPT PFD DU cannot draw the SD), or -1 for none.
 * @param du the DU, or null
 * @returns the value
 */
export function encodeMailboxDisplayUnit(du: DisplayUnitID | null): number {
  if (du === null) {
    return NO_MAILBOX_DISPLAY_UNIT;
  }
  return du === DisplayUnitID.Sd ? 0 : du;
}

/**
 * The DU that shows the mailbox, from the value of L:A380X_CDS_MAILBOX_DU (see encodeMailboxDisplayUnit)
 * @param value the L:var value
 * @returns the DU, or null for none (-1 or an unknown value)
 */
export function decodeMailboxDisplayUnit(value: number): DisplayUnitID | null {
  if (value === 0) {
    return DisplayUnitID.Sd;
  }
  return DISPLAY_UNITS.includes(value) && value !== DisplayUnitID.Sd ? value : null;
}

/**
 * The DU the DU RECONF pb of a side acts on. The pb is active only with a failed on-side DU (the EWD and SD DUs count
 * for both sides).
 * CAPT: the MFD DU; the ND DU if the MFD DU is failed; the PFD DU if both the ND DU and MFD DU are failed.
 * F/O: the ND DU if the PFD DU and ND DU are both operative; the MFD DU if either is failed; the PFD DU if both the ND
 * DU and MFD DU are failed (to keep the PFD on the PFD or ND DU).
 * Design choice: a DU that is not operative (failed, unpowered or switched off) counts as failed; when the F/O's PFD or
 * ND DU and the MFD DU are failed, the F/O order ends on the failed MFD DU (rule 2; rule 3 needs the ND DU failed), so
 * the pb acts on the remaining one of the PFD and ND DUs, as the CAPT pb does with the same failures (CAPT rule 2: the
 * ND DU, which then shows the PFD).
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
 * The DU RECONF cycle of a DU: its base display (what it shows without a DU RECONF selection), then the manual
 * displays of its sequence (DU_RECONF_SEQUENCE) that it can draw, in that order.
 *
 * The base display is the normal display, or the display the automatic reconfiguration or the PFD/ND pb put there.
 * With the CAPT (F/O) PFD and MFD DUs failed, the pb acts on the ND DU, which shows the PFD automatically, and the
 * manual displays of the ND DU are MFD, EWD and SD. Design choice: the automatic PFD takes the place of the normal
 * display (the ND, lost) at the head of the cycle, so the cycle is PFD, (MFD, not drawn,) EWD, SD and back to the PFD;
 * while the EWD or the SD is selected, that side has no PFD (its PFD and MFD DUs are failed: no other DU to show it
 * on).
 * @param du the DU
 * @param base its base display
 * @returns the cycle, the base display first
 */
export function duReconfCycle(du: DisplayUnitID, base: CdsDisplay): CdsDisplay[] {
  const manualDisplays = DU_RECONF_SEQUENCE[du].slice(1).filter((display) => display !== base);
  return [base, ...manualDisplays.filter((display) => DRAWN_DISPLAYS[du].includes(display))];
}

/**
 * The display after one press of the DU RECONF pb on a DU: the next one of its cycle (duReconfCycle), skipping an EWD
 * or SD shown on the other side (it cannot be shown on both sides at once); after the last one, the base display.
 * @param du the DU
 * @param current the display it shows
 * @param base the display it shows without a DU RECONF selection (normal, automatic or PFD/ND pb)
 * @param displays the displays of all DUs
 * @returns the next display (the current one if there is nothing else to show)
 */
export function nextDuReconfDisplay(
  du: DisplayUnitID,
  current: CdsDisplay,
  base: CdsDisplay,
  displays: Readonly<DisplayUnitMap<CdsDisplay>>,
): CdsDisplay {
  const sequence = duReconfCycle(du, base);
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

  /** The base display of each DU with a DU RECONF selection, when the selection was made */
  private readonly manualBase: Partial<DisplayUnitMap<CdsDisplay>> = {};

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
    this.dropEndedSelections();
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
    const base = this.baseDisplays()[target];
    const next = nextDuReconfDisplay(target, displays[target], base, displays);
    if (next === base) {
      delete this.manual[target];
      delete this.manualBase[target];
    } else {
      this.manual[target] = next;
      this.manualBase[target] = base;
    }
  }

  /**
   * New DU states. The DU RECONF selections of a side end when its pb is no longer active (no failed DU left), and the
   * selection of a DU that is no longer operative is dropped (design choice). Design choice: a selection also ends when
   * the base display of its DU changes (e.g. the PFD moves onto the ND DU because the PFD DU fails afterwards): the
   * automatic reconfiguration of the PFD (with the EWD, the display that matters most to continue the flight) wins
   * over an earlier selection.
   * @param operative the DU states
   * @returns the display of each DU
   */
  public update(operative: Readonly<DisplayUnitMap<boolean>>): DisplayUnitMap<CdsDisplay> {
    this.operative = { ...operative };
    this.dropEndedSelections();
    return this.displays();
  }

  /** Drops the DU RECONF selections that ended (see update) */
  private dropEndedSelections(): void {
    const bases = this.baseDisplays();
    for (const du of DISPLAY_UNITS) {
      if (this.manual[du] === undefined) {
        continue;
      }
      const side = sideOf(du);
      if (
        !this.operative[du] ||
        side === null ||
        duReconfTarget(side, this.operative) === null ||
        this.manualBase[du] !== bases[du]
      ) {
        delete this.manual[du];
        delete this.manualBase[du];
      }
    }
  }

  /**
   * The display of each DU without the DU RECONF selections (normal, automatic reconfiguration and PFD/ND pb)
   * @returns the displays
   */
  private baseDisplays(): DisplayUnitMap<CdsDisplay> {
    return computeCdsDisplays({ operative: this.operative, pfdNdSwapped: this.pfdNdSwapped, manual: {} });
  }

  /**
   * The display of each DU for the current state
   * @returns the displays
   */
  public displays(): DisplayUnitMap<CdsDisplay> {
    return computeCdsDisplays({ operative: this.operative, pfdNdSwapped: this.pfdNdSwapped, manual: this.manual });
  }
}
