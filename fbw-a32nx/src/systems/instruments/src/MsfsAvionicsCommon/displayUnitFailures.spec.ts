// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A320FailureDefinitions } from '@failures';
import {
  LOWER_ECAM_DISPLAY_UNIT_FAILURE,
  ndDisplayUnitFailure,
  ndDisplayUnitShowingVar,
  pfdDisplayUnitFailure,
  UPPER_ECAM_DISPLAY_UNIT_FAILURE,
} from './displayUnitFailures';

/** The flyPad label of a failure id, or undefined when the flyPad does not list it */
const flyPadLabel = (identifier: number): string | undefined =>
  A320FailureDefinitions.find(([, id]) => id === identifier)?.[2];

describe('A32NX display unit failures', () => {
  it('fails the CAPT ND from display index 1 and the F/O ND from index 2', () => {
    expect(ndDisplayUnitFailure(1)).toBe(31002);
    expect(ndDisplayUnitFailure(2)).toBe(31003);
  });

  it('keeps the CAPT and F/O PFD failures on their ids', () => {
    expect(pfdDisplayUnitFailure(1)).toBe(31000);
    expect(pfdDisplayUnitFailure(2)).toBe(31001);
  });

  it('fails the upper (E/WD) and lower (SD) ECAM display units', () => {
    expect(UPPER_ECAM_DISPLAY_UNIT_FAILURE).toBe(31004);
    expect(LOWER_ECAM_DISPLAY_UNIT_FAILURE).toBe(31005);
  });

  it('lists the ND and ECAM display unit failures in the flyPad (ATA 31), named like the PFD ones', () => {
    expect(flyPadLabel(31000)).toBe('Captain PFD display');
    expect(flyPadLabel(31001)).toBe('F/O PFD display');
    expect(flyPadLabel(31002)).toBe('Captain ND display');
    expect(flyPadLabel(31003)).toBe('F/O ND display');
    expect(flyPadLabel(31004)).toBe('Upper ECAM display');
    expect(flyPadLabel(31005)).toBe('Lower ECAM display');
    for (const id of [31002, 31003, 31004, 31005]) {
      expect(A320FailureDefinitions.find(([, failureId]) => failureId === id)?.[0]).toBe(31);
    }
  });

  it('names the ND picture L:var per side, the one ndwxr reads', () => {
    expect(ndDisplayUnitShowingVar(1)).toBe('L:A32NX_ND_L_DU_SHOWING_PICTURE');
    expect(ndDisplayUnitShowingVar(2)).toBe('L:A32NX_ND_R_DU_SHOWING_PICTURE');
  });
});
