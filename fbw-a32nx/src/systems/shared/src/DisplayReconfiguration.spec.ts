// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  computeDisplayPictures,
  DisplayPicture,
  DisplayReconfigurationInputs,
  DisplayUnitId,
  EcamNdXfrKnob,
  encodeDisplayUnitPicture,
  isDisplayUnitAvailable,
  isEcamPagePbHoldActive,
  isEcamPagePbHoldConfirmed,
  isSwitchingPanelMemoShown,
  nextEcamPagePbHeldSeconds,
  nextPfdNdXfr,
  picturesShownOnOtherDu,
} from './DisplayReconfiguration';

const ALL_AVAILABLE: Record<DisplayUnitId, boolean> = {
  PFD_L: true,
  ND_L: true,
  UPPER_ECAM: true,
  LOWER_ECAM: true,
  ND_R: true,
  PFD_R: true,
};

function inputs(overrides: Partial<DisplayReconfigurationInputs> = {}, unavailable: DisplayUnitId[] = []) {
  const available = { ...ALL_AVAILABLE };
  for (const du of unavailable) {
    available[du] = false;
  }
  return {
    available,
    ecamNdXfrKnob: EcamNdXfrKnob.Norm,
    pfdNdXfrL: false,
    pfdNdXfrR: false,
    ecamPagePbHeld: false,
    ...overrides,
  };
}

const NORMAL = {
  PFD_L: DisplayPicture.Pfd,
  ND_L: DisplayPicture.Nd,
  UPPER_ECAM: DisplayPicture.EngineWarning,
  LOWER_ECAM: DisplayPicture.System,
  ND_R: DisplayPicture.Nd,
  PFD_R: DisplayPicture.Pfd,
};

describe('A320 DU reconfiguration (FCOM DSC-31-05-60)', () => {
  it('keeps every DU on its own picture in the normal configuration', () => {
    expect(computeDisplayPictures(inputs())).toEqual(NORMAL);
  });

  it('puts the E/WD on the lower ECAM DU when the upper ECAM DU is lost (automatic)', () => {
    expect(computeDisplayPictures(inputs({}, ['UPPER_ECAM']))).toEqual({
      ...NORMAL,
      LOWER_ECAM: DisplayPicture.EngineWarning,
    });
  });

  it('then shows the SD on the lower DU while a system page pb is held, or on an ND with ECAM/ND XFR', () => {
    expect(computeDisplayPictures(inputs({ ecamPagePbHeld: true }, ['UPPER_ECAM'])).LOWER_ECAM).toBe(
      DisplayPicture.System,
    );
    const xfrCapt = computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Capt }, ['UPPER_ECAM']));
    expect(xfrCapt.ND_L).toBe(DisplayPicture.System);
    expect(xfrCapt.LOWER_ECAM).toBe(DisplayPicture.EngineWarning);
    expect(xfrCapt.ND_R).toBe(DisplayPicture.Nd);
  });

  it('does nothing automatic when the lower ECAM DU is lost; a held page pb shows the SD on the upper DU', () => {
    expect(computeDisplayPictures(inputs({}, ['LOWER_ECAM']))).toEqual(NORMAL);
    expect(computeDisplayPictures(inputs({ ecamPagePbHeld: true }, ['LOWER_ECAM'])).UPPER_ECAM).toBe(
      DisplayPicture.System,
    );
    expect(computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Fo }, ['LOWER_ECAM'])).ND_R).toBe(
      DisplayPicture.System,
    );
  });

  it('a held page pb changes nothing while both ECAM DUs work', () => {
    expect(computeDisplayPictures(inputs({ ecamPagePbHeld: true }))).toEqual(NORMAL);
  });

  it('ECAM/ND XFR moves the SD to the selected ND and shows ECAM ON ND on the lower DU', () => {
    expect(computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Capt }))).toEqual({
      ...NORMAL,
      ND_L: DisplayPicture.System,
      LOWER_ECAM: DisplayPicture.EcamOnNd,
    });
    expect(computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Fo }))).toEqual({
      ...NORMAL,
      ND_R: DisplayPicture.System,
      LOWER_ECAM: DisplayPicture.EcamOnNd,
    });
  });

  it('with both ECAM DUs lost, ECAM/ND XFR moves the E/WD to the ND, the SD while a page pb is held', () => {
    const lost: DisplayUnitId[] = ['UPPER_ECAM', 'LOWER_ECAM'];
    const noXfr = computeDisplayPictures(inputs({}, lost));
    expect([noXfr.ND_L, noXfr.ND_R]).toEqual([DisplayPicture.Nd, DisplayPicture.Nd]);
    expect(computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Capt }, lost)).ND_L).toBe(
      DisplayPicture.EngineWarning,
    );
    expect(computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Capt, ecamPagePbHeld: true }, lost)).ND_L).toBe(
      DisplayPicture.System,
    );
  });

  it('puts the PFD on the ND DU of its side when the PFD DU is lost (automatic)', () => {
    expect(computeDisplayPictures(inputs({}, ['PFD_L']))).toEqual({
      ...NORMAL,
      PFD_L: DisplayPicture.Nd,
      ND_L: DisplayPicture.Pfd,
    });
    expect(computeDisplayPictures(inputs({}, ['PFD_R']))).toEqual({
      ...NORMAL,
      PFD_R: DisplayPicture.Nd,
      ND_R: DisplayPicture.Pfd,
    });
  });

  it('brings the ND back on the ND DU with the PFD/ND XFR pb after the automatic PFD transfer', () => {
    expect(computeDisplayPictures(inputs({ pfdNdXfrL: true }, ['PFD_L']))).toEqual(NORMAL);
  });

  it('does nothing automatic when an ND DU is lost; PFD/ND XFR puts the ND on the PFD DU', () => {
    expect(computeDisplayPictures(inputs({}, ['ND_L']))).toEqual(NORMAL);
    expect(computeDisplayPictures(inputs({ pfdNdXfrL: true }, ['ND_L']))).toEqual({
      ...NORMAL,
      PFD_L: DisplayPicture.Nd,
      ND_L: DisplayPicture.Pfd,
    });
  });

  it('PFD/ND XFR interchanges the PFD and the ND with both DUs working, on its own side only', () => {
    expect(computeDisplayPictures(inputs({ pfdNdXfrR: true }))).toEqual({
      ...NORMAL,
      PFD_R: DisplayPicture.Nd,
      ND_R: DisplayPicture.Pfd,
    });
  });

  it('a PFD transferred to the ND DU replaces an ECAM picture selected on that side (design choice)', () => {
    const pictures = computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Capt }, ['PFD_L']));
    expect(pictures.ND_L).toBe(DisplayPicture.Pfd);
    expect(pictures.PFD_L).toBe(DisplayPicture.Nd);
  });
});

describe('DU availability', () => {
  it('counts a failed DU, a DU switched off with its brightness knob and an unpowered DU as unavailable', () => {
    expect(isDisplayUnitAvailable(false, true, 0.8)).toBe(true);
    expect(isDisplayUnitAvailable(true, true, 0.8)).toBe(false);
    expect(isDisplayUnitAvailable(false, true, 0)).toBe(false);
    expect(isDisplayUnitAvailable(false, false, 0.8)).toBe(false);
  });
});

describe('PFD/ND XFR pb state', () => {
  it('toggles at each push', () => {
    expect(nextPfdNdXfr(false, true, true, true)).toBe(true);
    expect(nextPfdNdXfr(true, true, true, true)).toBe(false);
    expect(nextPfdNdXfr(true, false, true, true)).toBe(true);
  });

  it('starts again from the automatic configuration when the PFD DU availability changes', () => {
    // swapped, then the PFD DU (showing the ND) fails: the PFD stays on the ND DU through the automatic transfer
    expect(nextPfdNdXfr(true, false, true, false)).toBe(false);
    // ND brought back after the automatic transfer, then the PFD DU recovers: normal configuration
    expect(nextPfdNdXfr(true, false, false, true)).toBe(false);
  });
});

describe('system page pb held', () => {
  it('displays the SD for at most 3 min', () => {
    let seconds = 0;
    seconds = nextEcamPagePbHeldSeconds(seconds, true, 100);
    expect(isEcamPagePbHoldActive(true, seconds)).toBe(true);
    seconds = nextEcamPagePbHeldSeconds(seconds, true, 100);
    expect(isEcamPagePbHoldActive(true, seconds)).toBe(false);
    seconds = nextEcamPagePbHeldSeconds(seconds, false, 0.02);
    expect(seconds).toBe(0);
    expect(isEcamPagePbHoldActive(false, seconds)).toBe(false);
  });

  it('displays it only once held for 0.5 s, so a click that selects or deselects a page does not', () => {
    expect(isEcamPagePbHoldConfirmed(true, 0.02)).toBe(false);
    expect(isEcamPagePbHoldConfirmed(true, 0.49)).toBe(false);
    expect(isEcamPagePbHoldConfirmed(true, 0.5)).toBe(true);
    expect(isEcamPagePbHoldConfirmed(true, 181)).toBe(false);
    expect(isEcamPagePbHoldConfirmed(false, 1)).toBe(false);
  });
});

describe('DU picture L:var', () => {
  it('writes 0 for the own picture of each available DU, so the normal configuration keeps every L:var at 0', () => {
    for (const [du, picture] of Object.entries(NORMAL)) {
      expect(encodeDisplayUnitPicture(du as DisplayUnitId, picture, true)).toBe(DisplayPicture.Own);
    }
    expect(encodeDisplayUnitPicture('ND_L', DisplayPicture.Pfd, true)).toBe(DisplayPicture.Pfd);
    expect(encodeDisplayUnitPicture('LOWER_ECAM', DisplayPicture.EcamOnNd, true)).toBe(DisplayPicture.EcamOnNd);
  });

  it('writes the blank glass for an unavailable DU, whatever picture it would show', () => {
    expect(encodeDisplayUnitPicture('PFD_L', DisplayPicture.Pfd, false)).toBe(DisplayPicture.Blank);
    expect(encodeDisplayUnitPicture('PFD_L', DisplayPicture.Nd, false)).toBe(DisplayPicture.Blank);
  });
});

describe('pictures shown on another DU (their gauge keeps drawing)', () => {
  it('none in the normal configuration', () => {
    expect(Object.values(picturesShownOnOtherDu(NORMAL, ALL_AVAILABLE)).some((shown) => shown)).toBe(false);
  });

  it('the PFD on the ND DU with the PFD DU lost: its gauge draws for the ND DU', () => {
    const available = { ...ALL_AVAILABLE, PFD_L: false };
    const pictures = computeDisplayPictures(inputs({ available }));
    const shown = picturesShownOnOtherDu(pictures, available);
    expect(shown.PFD_L).toBe(true);
    // the ND is now on the lost PFD DU: not shown
    expect(shown.ND_L).toBe(false);
  });

  it('both pictures of a side swapped by PFD/ND XFR', () => {
    const shown = picturesShownOnOtherDu(computeDisplayPictures(inputs({ pfdNdXfrR: true })), ALL_AVAILABLE);
    expect([shown.PFD_R, shown.ND_R, shown.PFD_L, shown.ND_L]).toEqual([true, true, false, false]);
  });

  it('the E/WD on the lower DU with the upper DU lost, the SD on the upper DU with a page pb held', () => {
    const upperLost = { ...ALL_AVAILABLE, UPPER_ECAM: false };
    expect(picturesShownOnOtherDu(computeDisplayPictures(inputs({ available: upperLost })), upperLost).EWD).toBe(true);
    const lowerLost = { ...ALL_AVAILABLE, LOWER_ECAM: false };
    const held = computeDisplayPictures(inputs({ available: lowerLost, ecamPagePbHeld: true }));
    expect(picturesShownOnOtherDu(held, lowerLost).SD).toBe(true);
  });

  it('the SD on an ND with ECAM/ND XFR, unless that ND DU is lost', () => {
    const pictures = computeDisplayPictures(inputs({ ecamNdXfrKnob: EcamNdXfrKnob.Fo }));
    expect(picturesShownOnOtherDu(pictures, ALL_AVAILABLE).SD).toBe(true);
    expect(picturesShownOnOtherDu(pictures, { ...ALL_AVAILABLE, ND_R: false }).SD).toBe(false);
  });
});

describe('SWITCHING PNL memo (FCOM DSC-31-30)', () => {
  it('needs a PFD/ND XFR pb together with ECAM/ND XFR, or the EIS DMC selector', () => {
    expect(isSwitchingPanelMemoShown(EcamNdXfrKnob.Norm, 1, false, false)).toBe(false);
    expect(isSwitchingPanelMemoShown(EcamNdXfrKnob.Capt, 1, false, false)).toBe(false);
    expect(isSwitchingPanelMemoShown(EcamNdXfrKnob.Norm, 1, true, false)).toBe(false);
    expect(isSwitchingPanelMemoShown(EcamNdXfrKnob.Fo, 1, true, false)).toBe(true);
    expect(isSwitchingPanelMemoShown(EcamNdXfrKnob.Norm, 0, false, false)).toBe(true);
  });
});
