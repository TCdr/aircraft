// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '../../../shared/src/SdPages';
import { isShownPageDeselectedByItsPb, isStatusPageClearedByClr } from './StatusPageSelection';

describe('SD STATUS page selection with an overflowing STATUS page (FCOM DSC-31-20 l.46196-46199, DSC-31-30)', () => {
  it('CLR removes the STATUS page selected with STS, on its last page only', () => {
    expect(isStatusPageClearedByClr(true, true, false, false)).toBe(true);
    // a next page: the push scrolls the page (FWC), the SD keeps the STATUS page
    expect(isStatusPageClearedByClr(true, true, false, true)).toBe(false);
    // the push is for the E/WD alert
    expect(isStatusPageClearedByClr(true, true, true, false)).toBe(false);
    expect(isStatusPageClearedByClr(true, false, false, false)).toBe(false);
    expect(isStatusPageClearedByClr(false, true, false, false)).toBe(false);
  });

  it('the STS pb pushed again removes the STATUS page, except with one ECAM display (next page)', () => {
    expect(isShownPageDeselectedByItsPb(SdPages.STS, false)).toBe(true);
    expect(isShownPageDeselectedByItsPb(SdPages.STS, true)).toBe(false);
    expect(isShownPageDeselectedByItsPb(SdPages.ENG, true)).toBe(true);
  });
});
