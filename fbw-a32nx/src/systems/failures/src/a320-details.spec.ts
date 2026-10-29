// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { allAlertIds, failuresWithoutDetail, resolveFailureDetail } from '@flybywiresim/fbw-sdk';
import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { EwdMessageCodeOrder } from '@shared/EwdMessages';
import { A320FailureDefinitions } from './a320';
import { A320_DETAIL_CHAPTERS_DONE, A320FailureDetails } from './a320-details';

const DOCUMENT_REFERENCE = /FCOM|DSC-|QRH|\.ts\b|line \d/i;

function textFields(detail: FailureDetail): string[] {
  return [
    detail.whatItIs,
    ...detail.impact,
    ...detail.effects.map((effect) => `${effect.where} ${effect.text}`),
    detail.logbook.reason,
    detail.clearing,
    ...(detail.notSimulated ?? []),
  ];
}

function allDetails(): FailureDetail[] {
  const details: FailureDetail[] = Object.values(A320FailureDetails.entries);
  for (const family of A320FailureDetails.families) {
    family.ids.forEach((_, index) => details.push(family.detail(index + 1)));
  }
  return details;
}

describe('A320 failure details', () => {
  it('has a detail for every failure of the finished chapters', () => {
    const missing = failuresWithoutDetail(A320FailureDetails, A320FailureDefinitions, A320_DETAIL_CHAPTERS_DONE);
    expect(missing, `failures without a detail: ${missing.join(', ')}`).toEqual([]);
  });

  it('only names alerts the EWD knows', () => {
    const unknown = allAlertIds(A320FailureDetails, A320FailureDefinitions).filter(
      (alertId) => !EwdMessageCodeOrder.has(`${alertId}01`),
    );
    expect(unknown, `alerts not in the EWD: ${unknown.join(', ')}`).toEqual([]);
  });

  it('contains no document references in any text', () => {
    const offending = allDetails()
      .flatMap(textFields)
      .filter((text) => DOCUMENT_REFERENCE.test(text));
    expect(offending).toEqual([]);
  });

  it('fills every part of every detail', () => {
    for (const detail of allDetails()) {
      expect(detail.whatItIs.trim()).not.toBe('');
      expect(detail.impact.length).toBeGreaterThan(0);
      detail.impact.forEach((line) => expect(line.trim()).not.toBe(''));
      detail.effects.forEach((effect) => {
        expect(effect.where.trim()).not.toBe('');
        expect(effect.text.trim()).not.toBe('');
      });
      expect(detail.logbook.reason.trim()).not.toBe('');
    }
  });

  it('only describes failures that exist', () => {
    const known = new Set(A320FailureDefinitions.map(([, id]) => id));
    const ids = [
      ...Object.keys(A320FailureDetails.entries).map(Number),
      ...A320FailureDetails.families.flatMap((family) => family.ids),
    ];
    const unknown = ids.filter((id) => !known.has(id));
    expect(unknown, `ids not in the failure list: ${unknown.join(', ')}`).toEqual([]);
  });

  it('resolves every id of a family', () => {
    for (const family of A320FailureDetails.families) {
      for (const id of family.ids) {
        expect(resolveFailureDetail(A320FailureDetails, id)).toBeDefined();
      }
    }
  });
});
