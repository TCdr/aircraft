// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SdPages } from '../../../shared/src/SdPages';
import { SdAdvisoryAction, sdAdvisoryAction, SdAdvisoryModeInputs } from './SdAdvisoryMode';

function inputs(overrides: Partial<SdAdvisoryModeInputs>): SdAdvisoryModeInputs {
  return {
    advisoryPage: SdPages.NONE,
    previousAdvisoryPage: SdPages.NONE,
    inAdvisoryMode: false,
    inWarningMode: false,
    singleDisplay: false,
    ...overrides,
  };
}

describe('SD advisory mode', () => {
  it('a new advisory calls its page, over the flight phase or a manually called page', () => {
    expect(sdAdvisoryAction(inputs({ advisoryPage: SdPages.ENG }))).toBe(SdAdvisoryAction.ShowAdvisoryPage);
  });

  it('an advisory already called does not call its page again', () => {
    expect(sdAdvisoryAction(inputs({ advisoryPage: SdPages.ENG, previousAdvisoryPage: SdPages.ENG }))).toBe(
      SdAdvisoryAction.None,
    );
  });

  it('an advisory on another page calls that page', () => {
    expect(
      sdAdvisoryAction(inputs({ advisoryPage: SdPages.ELEC, previousAdvisoryPage: SdPages.ENG, inAdvisoryMode: true })),
    ).toBe(SdAdvisoryAction.ShowAdvisoryPage);
  });

  it('the advisory mode ends when the parameter is back in its normal range', () => {
    expect(sdAdvisoryAction(inputs({ previousAdvisoryPage: SdPages.ENG, inAdvisoryMode: true }))).toBe(
      SdAdvisoryAction.EndAdvisory,
    );
  });

  it('a failure page is not replaced by an advisory', () => {
    expect(sdAdvisoryAction(inputs({ advisoryPage: SdPages.ENG, inWarningMode: true }))).toBe(SdAdvisoryAction.None);
  });

  it('with one ECAM display the advisory page is not called', () => {
    expect(sdAdvisoryAction(inputs({ advisoryPage: SdPages.ENG, singleDisplay: true }))).toBe(SdAdvisoryAction.None);
    expect(
      sdAdvisoryAction(
        inputs({
          advisoryPage: SdPages.ENG,
          previousAdvisoryPage: SdPages.ENG,
          inAdvisoryMode: true,
          singleDisplay: true,
        }),
      ),
    ).toBe(SdAdvisoryAction.EndAdvisory);
  });
});
