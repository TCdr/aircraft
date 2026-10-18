// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { NXSystemMessages } from './NXSystemMessages';

describe('company wind messages (aircraft wording)', () => {
  it('received, waiting for insertion in the active flight plan', () => {
    expect(NXSystemMessages.comWindRecievedPendingInsertionActive.text).toBe(
      'COMPANY WIND DATA RECEIVED\nWAITING FOR INSERTION IN ACTIVE',
    );
  });

  it('received, waiting for insertion in a secondary flight plan, with its number', () => {
    expect(NXSystemMessages.comWindRecievedPendingInsertionInSecondary.getModifiedMessage('2').text).toBe(
      'COMPANY WIND DATA RECEIVED\nWAITING FOR INSERTION IN SEC 2',
    );
  });

  it('uplink pending', () => {
    expect(NXSystemMessages.comWindUplinkPending.text).toBe('COMPANY WIND UPLINK PENDING');
  });

  it('not valid', () => {
    expect(NXSystemMessages.receivedCpnyWindNotValid.text).toBe('RECEIVED COMPANY WIND DATA NOT VALID');
  });

  it('draft wind inserted', () => {
    expect(NXSystemMessages.draftWindsInserted.text).toBe('DRAFT WIND INSERTED');
  });
});
