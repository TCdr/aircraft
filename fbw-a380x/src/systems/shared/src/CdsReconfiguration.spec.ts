// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DisplayUnitID } from './CdsDisplayUnits';
import {
  CdsDisplay,
  CdsReconfigurationState,
  computeCdsDisplays,
  DisplayUnitMap,
  DU_RECONF_SEQUENCE,
  duReconfTarget,
  encodeDisplay,
  nextDuReconfDisplay,
  normalDisplayOf,
  resolveDisplay,
} from './CdsReconfiguration';

const ALL_OPERATIVE: DisplayUnitMap<boolean> = {
  [DisplayUnitID.CaptPfd]: true,
  [DisplayUnitID.CaptNd]: true,
  [DisplayUnitID.CaptMfd]: true,
  [DisplayUnitID.FoPfd]: true,
  [DisplayUnitID.FoNd]: true,
  [DisplayUnitID.FoMfd]: true,
  [DisplayUnitID.Ewd]: true,
  [DisplayUnitID.Sd]: true,
};

/** The DU states with the given DUs not operative */
function lost(...dus: DisplayUnitID[]): DisplayUnitMap<boolean> {
  const operative = { ...ALL_OPERATIVE };
  for (const du of dus) {
    operative[du] = false;
  }
  return operative;
}

const NOT_SWAPPED = { CAPT: false, FO: false };

/** The displays that differ from normal operation */
function changes(displays: DisplayUnitMap<CdsDisplay>): Partial<DisplayUnitMap<CdsDisplay>> {
  const result: Partial<DisplayUnitMap<CdsDisplay>> = {};
  for (const du of Object.keys(displays).map(Number) as DisplayUnitID[]) {
    if (displays[du] !== normalDisplayOf(du)) {
      result[du] = displays[du];
    }
  }
  return result;
}

describe('CDS reconfiguration (A380 FCOM DSC-31-15-20)', () => {
  it('shows every display on its own DU in normal operation, all L:vars 0', () => {
    const displays = computeCdsDisplays({ operative: ALL_OPERATIVE, pfdNdSwapped: NOT_SWAPPED, manual: {} });
    expect(changes(displays)).toEqual({});
    for (const du of Object.keys(displays).map(Number) as DisplayUnitID[]) {
      expect(encodeDisplay(du, displays[du])).toBe(0);
    }
  });

  it('moves the PFD of a failed PFD DU to the same-side ND DU (automatic reconfiguration)', () => {
    expect(
      changes(computeCdsDisplays({ operative: lost(DisplayUnitID.CaptPfd), pfdNdSwapped: NOT_SWAPPED, manual: {} })),
    ).toEqual({ [DisplayUnitID.CaptNd]: CdsDisplay.Pfd });
    expect(
      changes(computeCdsDisplays({ operative: lost(DisplayUnitID.FoPfd), pfdNdSwapped: NOT_SWAPPED, manual: {} })),
    ).toEqual({ [DisplayUnitID.FoNd]: CdsDisplay.Pfd });
  });

  it('moves the EWD of a failed EWD DU to the SD DU (automatic reconfiguration)', () => {
    expect(
      changes(computeCdsDisplays({ operative: lost(DisplayUnitID.Ewd), pfdNdSwapped: NOT_SWAPPED, manual: {} })),
    ).toEqual({ [DisplayUnitID.Sd]: CdsDisplay.Ewd });
  });

  it('changes nothing when the ND DU fails, or when both DUs of the pair fail', () => {
    for (const operative of [
      lost(DisplayUnitID.CaptNd),
      lost(DisplayUnitID.CaptPfd, DisplayUnitID.CaptNd),
      lost(DisplayUnitID.Sd),
      lost(DisplayUnitID.Ewd, DisplayUnitID.Sd),
    ]) {
      expect(changes(computeCdsDisplays({ operative, pfdNdSwapped: NOT_SWAPPED, manual: {} }))).toEqual({});
    }
  });

  it('exchanges the on-side PFD and ND with the PFD/ND pb', () => {
    expect(
      changes(computeCdsDisplays({ operative: ALL_OPERATIVE, pfdNdSwapped: { CAPT: true, FO: false }, manual: {} })),
    ).toEqual({ [DisplayUnitID.CaptPfd]: CdsDisplay.Nd, [DisplayUnitID.CaptNd]: CdsDisplay.Pfd });
    expect(
      changes(computeCdsDisplays({ operative: ALL_OPERATIVE, pfdNdSwapped: { CAPT: false, FO: true }, manual: {} })),
    ).toEqual({ [DisplayUnitID.FoPfd]: CdsDisplay.Nd, [DisplayUnitID.FoNd]: CdsDisplay.Pfd });
  });

  it('keeps the PFD on an operative DU when the swapped PFD loses its DU', () => {
    expect(
      changes(
        computeCdsDisplays({
          operative: lost(DisplayUnitID.CaptNd),
          pfdNdSwapped: { CAPT: true, FO: false },
          manual: {},
        }),
      ),
    ).toEqual({});
  });

  it('reads and writes the display L:var (0 = own display)', () => {
    expect(resolveDisplay(DisplayUnitID.CaptNd, 0)).toBe(CdsDisplay.Nd);
    expect(resolveDisplay(DisplayUnitID.CaptNd, CdsDisplay.Pfd)).toBe(CdsDisplay.Pfd);
    expect(resolveDisplay(DisplayUnitID.Sd, 42)).toBe(CdsDisplay.Sd);
    expect(encodeDisplay(DisplayUnitID.Sd, CdsDisplay.Ewd)).toBe(CdsDisplay.Ewd);
    expect(encodeDisplay(DisplayUnitID.Sd, CdsDisplay.Sd)).toBe(0);
  });

  it('follows the FCOM capability table for the DU RECONF sequences', () => {
    expect(DU_RECONF_SEQUENCE[DisplayUnitID.CaptPfd]).toEqual([CdsDisplay.Pfd, CdsDisplay.Nd, CdsDisplay.Mfd]);
    expect(DU_RECONF_SEQUENCE[DisplayUnitID.FoNd]).toEqual([
      CdsDisplay.Nd,
      CdsDisplay.Mfd,
      CdsDisplay.Ewd,
      CdsDisplay.Sd,
    ]);
    expect(DU_RECONF_SEQUENCE[DisplayUnitID.CaptMfd]).toEqual([
      CdsDisplay.Mfd,
      CdsDisplay.Ewd,
      CdsDisplay.Sd,
      CdsDisplay.Pfd,
      CdsDisplay.Nd,
    ]);
  });

  it('selects the DU the DU RECONF pb acts on', () => {
    expect(duReconfTarget('CAPT', ALL_OPERATIVE)).toBeNull();
    expect(duReconfTarget('FO', ALL_OPERATIVE)).toBeNull();
    // EWD and SD DU: both sides
    expect(duReconfTarget('CAPT', lost(DisplayUnitID.Sd))).toBe(DisplayUnitID.CaptMfd);
    expect(duReconfTarget('FO', lost(DisplayUnitID.Sd))).toBe(DisplayUnitID.FoNd);
    // a failed DU of the other side does not activate the pb
    expect(duReconfTarget('CAPT', lost(DisplayUnitID.FoPfd))).toBeNull();
    expect(duReconfTarget('CAPT', lost(DisplayUnitID.CaptMfd))).toBe(DisplayUnitID.CaptNd);
    expect(duReconfTarget('CAPT', lost(DisplayUnitID.CaptNd, DisplayUnitID.CaptMfd))).toBe(DisplayUnitID.CaptPfd);
    expect(duReconfTarget('FO', lost(DisplayUnitID.FoMfd))).toBe(DisplayUnitID.FoNd);
    expect(duReconfTarget('FO', lost(DisplayUnitID.FoPfd))).toBe(DisplayUnitID.FoMfd);
    expect(duReconfTarget('FO', lost(DisplayUnitID.FoNd, DisplayUnitID.FoMfd))).toBe(DisplayUnitID.FoPfd);
  });

  it('never takes an automatic display away with the DU RECONF pb', () => {
    const displays = computeCdsDisplays({
      operative: lost(DisplayUnitID.CaptPfd),
      pfdNdSwapped: NOT_SWAPPED,
      manual: {},
    });
    expect(nextDuReconfDisplay(DisplayUnitID.CaptNd, CdsDisplay.Pfd, displays)).toBe(CdsDisplay.Pfd);
  });

  it('ignores a manual display the DU cannot draw', () => {
    expect(
      changes(
        computeCdsDisplays({
          operative: lost(DisplayUnitID.Sd),
          pfdNdSwapped: NOT_SWAPPED,
          manual: { [DisplayUnitID.CaptNd]: CdsDisplay.Sd },
        }),
      ),
    ).toEqual({});
  });

  describe('reconfiguration state', () => {
    it('toggles the PFD/ND exchange with each press', () => {
      const state = new CdsReconfigurationState(ALL_OPERATIVE);
      state.pressPfdNd('FO');
      expect(changes(state.update(ALL_OPERATIVE))).toEqual({
        [DisplayUnitID.FoPfd]: CdsDisplay.Nd,
        [DisplayUnitID.FoNd]: CdsDisplay.Pfd,
      });
      state.pressPfdNd('FO');
      expect(changes(state.update(ALL_OPERATIVE))).toEqual({});
    });

    it('cycles the PFD DU through PFD and ND with the DU RECONF pb when the ND and MFD DUs are failed', () => {
      const operative = lost(DisplayUnitID.CaptNd, DisplayUnitID.CaptMfd);
      const state = new CdsReconfigurationState(operative);
      state.pressDuReconf('CAPT');
      expect(changes(state.update(operative))).toEqual({ [DisplayUnitID.CaptPfd]: CdsDisplay.Nd });
      state.pressDuReconf('CAPT');
      expect(changes(state.update(operative))).toEqual({});
    });

    it('does nothing with the DU RECONF pb when no on-side DU is failed', () => {
      const state = new CdsReconfigurationState(ALL_OPERATIVE);
      state.pressDuReconf('CAPT');
      state.pressDuReconf('FO');
      expect(changes(state.update(ALL_OPERATIVE))).toEqual({});
    });

    it('ends the DU RECONF selection when the failed DUs recover', () => {
      const operative = lost(DisplayUnitID.CaptNd, DisplayUnitID.CaptMfd);
      const state = new CdsReconfigurationState(operative);
      state.pressDuReconf('CAPT');
      expect(changes(state.update(ALL_OPERATIVE))).toEqual({});
      expect(changes(state.update(operative))).toEqual({});
    });
  });
});
