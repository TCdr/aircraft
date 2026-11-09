// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SimVarString } from '@flybywiresim/fbw-sdk';
import { glsInfoTexts } from './GlsInfoTexts';

const IDENT_WORD = SimVarString.pack('G25A', 4)[0];

describe('GLS information block of the PFD', () => {
  it('shows the decoded ident, the channel and the distance once received', () => {
    expect(glsInfoTexts({ received: true, identWord: IDENT_WORD, channel: 20001, thresholdDistance: 7.4 })).toEqual({
      ident: 'G25A',
      channel: '20001',
      distance: 7.4,
    });
  });

  it('is blank for the ident and the distance while the station is not received', () => {
    expect(glsInfoTexts({ received: false, identWord: IDENT_WORD, channel: 20001, thresholdDistance: 7.4 })).toEqual({
      ident: '',
      channel: '20001',
      distance: null,
    });
  });

  it('shows no channel for a receiver in ILS mode', () => {
    expect(glsInfoTexts({ received: false, identWord: 0, channel: 0, thresholdDistance: 0 }).channel).toBe('');
  });

  it('shows no distance while the RMP tunes the GLS, the ident and channel stay', () => {
    expect(
      glsInfoTexts({ received: true, identWord: IDENT_WORD, channel: 20001, thresholdDistance: 7.4, rmpTuned: true }),
    ).toEqual({ ident: 'G25A', channel: '20001', distance: null });
  });

  it("keeps today's result when rmpTuned is false or not given", () => {
    const base = { received: true, identWord: IDENT_WORD, channel: 20001, thresholdDistance: 7.4 };
    expect(glsInfoTexts({ ...base, rmpTuned: false })).toEqual(glsInfoTexts(base));
    expect(glsInfoTexts(base).distance).toBe(7.4);
  });
});
