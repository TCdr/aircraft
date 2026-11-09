// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ilsReceiverInfo, ownSideIlsHealthTopics } from './IlsReceiverHealth';

const TUNED = { ident: 'IMLR', frequency: 110.3, hasDme: true };

describe('ILS information of the PFD when the receiver of its side is dead', () => {
  it('shows what the receiver gives while the MMR is powered and its ILS receiver works', () => {
    expect(ilsReceiverInfo({ mmrPowered: true, ilsReceiverFailed: false, ...TUNED })).toEqual(TUNED);
  });

  it('blanks the ident, the frequency and the DME of an unpowered MMR', () => {
    expect(ilsReceiverInfo({ mmrPowered: false, ilsReceiverFailed: false, ...TUNED })).toEqual({
      ident: '',
      frequency: 0,
      hasDme: false,
    });
  });

  it('blanks them for a failed ILS receiver or MMR (both set the same failure)', () => {
    expect(ilsReceiverInfo({ mmrPowered: true, ilsReceiverFailed: true, ...TUNED })).toEqual({
      ident: '',
      frequency: 0,
      hasDme: false,
    });
  });
});

describe('the health topics a PFD reads', () => {
  it('are those of the MMR of its own side', () => {
    expect(ownSideIlsHealthTopics(1)).toEqual({ mmrPowered: 'mmr1Powered', ilsFailed: 'ils1Failed' });
    expect(ownSideIlsHealthTopics(2)).toEqual({ mmrPowered: 'mmr2Powered', ilsFailed: 'ils2Failed' });
  });

  it('are those of MMR 1 while the side is unknown', () => {
    expect(ownSideIlsHealthTopics(0).mmrPowered).toBe('mmr1Powered');
  });
});
