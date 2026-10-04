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
  duReconfCycle,
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
    // PFD and MFD DUs failed: CAPT rule 2; F/O rule 2 ends on the failed MFD DU, so the remaining ND DU
    expect(duReconfTarget('CAPT', lost(DisplayUnitID.CaptPfd, DisplayUnitID.CaptMfd))).toBe(DisplayUnitID.CaptNd);
    expect(duReconfTarget('FO', lost(DisplayUnitID.FoPfd, DisplayUnitID.FoMfd))).toBe(DisplayUnitID.FoNd);
  });

  it('puts the automatic PFD at the head of the ND DU cycle, with the EWD and the SD (the MFD is not drawn)', () => {
    expect(duReconfCycle(DisplayUnitID.CaptNd, CdsDisplay.Pfd)).toEqual([
      CdsDisplay.Pfd,
      CdsDisplay.Ewd,
      CdsDisplay.Sd,
    ]);
    expect(duReconfCycle(DisplayUnitID.FoNd, CdsDisplay.Pfd)).toEqual([CdsDisplay.Pfd, CdsDisplay.Ewd, CdsDisplay.Sd]);
    expect(duReconfCycle(DisplayUnitID.CaptNd, CdsDisplay.Nd)).toEqual([CdsDisplay.Nd, CdsDisplay.Ewd, CdsDisplay.Sd]);
    expect(duReconfCycle(DisplayUnitID.CaptPfd, CdsDisplay.Pfd)).toEqual([CdsDisplay.Pfd, CdsDisplay.Nd]);
    expect(duReconfCycle(DisplayUnitID.CaptMfd, CdsDisplay.Mfd)).toEqual([CdsDisplay.Mfd]);
  });

  it('takes the automatic PFD away from the ND DU with the DU RECONF pb, and gives it back after the SD', () => {
    const displays = computeCdsDisplays({
      operative: lost(DisplayUnitID.CaptPfd, DisplayUnitID.CaptMfd),
      pfdNdSwapped: NOT_SWAPPED,
      manual: {},
    });
    expect(nextDuReconfDisplay(DisplayUnitID.CaptNd, CdsDisplay.Pfd, CdsDisplay.Pfd, displays)).toBe(CdsDisplay.Ewd);
    expect(nextDuReconfDisplay(DisplayUnitID.CaptNd, CdsDisplay.Ewd, CdsDisplay.Pfd, displays)).toBe(CdsDisplay.Sd);
    expect(nextDuReconfDisplay(DisplayUnitID.CaptNd, CdsDisplay.Sd, CdsDisplay.Pfd, displays)).toBe(CdsDisplay.Pfd);
  });

  it('ignores a manual display the DU cannot draw', () => {
    expect(
      changes(
        computeCdsDisplays({
          operative: lost(DisplayUnitID.Sd),
          pfdNdSwapped: NOT_SWAPPED,
          manual: { [DisplayUnitID.CaptMfd]: CdsDisplay.Sd },
        }),
      ),
    ).toEqual({});
  });

  it('draws the SD on the ND DU when it is selected there', () => {
    expect(
      changes(
        computeCdsDisplays({
          operative: lost(DisplayUnitID.Sd),
          pfdNdSwapped: NOT_SWAPPED,
          manual: { [DisplayUnitID.FoNd]: CdsDisplay.Sd },
        }),
      ),
    ).toEqual({ [DisplayUnitID.FoNd]: CdsDisplay.Sd });
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

    for (const [side, pfd, nd, mfd] of [
      ['CAPT', DisplayUnitID.CaptPfd, DisplayUnitID.CaptNd, DisplayUnitID.CaptMfd],
      ['FO', DisplayUnitID.FoPfd, DisplayUnitID.FoNd, DisplayUnitID.FoMfd],
    ] as const) {
      it(`cycles the ${side} ND DU through PFD, EWD, SD and back to the PFD when the PFD and MFD DUs are failed`, () => {
        const operative = lost(pfd, mfd);
        const state = new CdsReconfigurationState(operative);
        expect(changes(state.update(operative))).toEqual({ [nd]: CdsDisplay.Pfd });
        state.pressDuReconf(side);
        expect(changes(state.update(operative))).toEqual({ [nd]: CdsDisplay.Ewd });
        state.pressDuReconf(side);
        expect(changes(state.update(operative))).toEqual({ [nd]: CdsDisplay.Sd });
        state.pressDuReconf(side);
        expect(changes(state.update(operative))).toEqual({ [nd]: CdsDisplay.Pfd });
      });
    }

    it('never shows the EWD (SD) on both sides at the same time', () => {
      const operative = lost(DisplayUnitID.CaptPfd, DisplayUnitID.CaptMfd, DisplayUnitID.FoPfd, DisplayUnitID.FoMfd);
      const state = new CdsReconfigurationState(operative);
      state.pressDuReconf('CAPT');
      expect(state.update(operative)[DisplayUnitID.CaptNd]).toBe(CdsDisplay.Ewd);
      // the F/O pb skips the EWD shown on the CAPT side
      state.pressDuReconf('FO');
      expect(state.update(operative)[DisplayUnitID.FoNd]).toBe(CdsDisplay.Sd);
      // the CAPT pb skips the SD shown on the F/O side: back to the PFD
      state.pressDuReconf('CAPT');
      expect(changes(state.update(operative))).toEqual({
        [DisplayUnitID.CaptNd]: CdsDisplay.Pfd,
        [DisplayUnitID.FoNd]: CdsDisplay.Sd,
      });
    });

    it('cycles the CAPT ND DU through ND, EWD and SD when only the MFD DU is failed', () => {
      const operative = lost(DisplayUnitID.CaptMfd);
      const state = new CdsReconfigurationState(operative);
      state.pressDuReconf('CAPT');
      expect(changes(state.update(operative))).toEqual({ [DisplayUnitID.CaptNd]: CdsDisplay.Ewd });
      state.pressDuReconf('CAPT');
      expect(changes(state.update(operative))).toEqual({ [DisplayUnitID.CaptNd]: CdsDisplay.Sd });
      state.pressDuReconf('CAPT');
      expect(changes(state.update(operative))).toEqual({});
    });

    it('shows the SD on the F/O ND DU with the F/O DU RECONF pb when the SD DU is off (ATC mailbox procedure)', () => {
      const operative = lost(DisplayUnitID.Sd);
      const state = new CdsReconfigurationState(operative);
      state.pressDuReconf('FO');
      state.pressDuReconf('FO');
      expect(changes(state.update(operative))).toEqual({ [DisplayUnitID.FoNd]: CdsDisplay.Sd });
    });

    it('gives the PFD back to the ND DU when the PFD DU fails after a DU RECONF selection there', () => {
      const mfdLost = lost(DisplayUnitID.CaptMfd);
      const state = new CdsReconfigurationState(mfdLost);
      state.pressDuReconf('CAPT');
      expect(changes(state.update(mfdLost))).toEqual({ [DisplayUnitID.CaptNd]: CdsDisplay.Ewd });
      const pfdAndMfdLost = lost(DisplayUnitID.CaptPfd, DisplayUnitID.CaptMfd);
      expect(changes(state.update(pfdAndMfdLost))).toEqual({ [DisplayUnitID.CaptNd]: CdsDisplay.Pfd });
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
