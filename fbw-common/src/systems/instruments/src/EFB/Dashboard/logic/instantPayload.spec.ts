// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  BoardingRateValue,
  GSX_PAYLOAD_SYNC_DEFAULT,
  INSTANT_LOAD_START_VALUES,
  importBlockedByBoarding,
  instantLoadRestoreValues,
  isGsxPayloadSyncOn,
  loadsPayloadAtOnce,
} from './instantPayload';

describe('loadsPayloadAtOnce', () => {
  it('boards normally on the ground with the engines off', () => {
    expect(loadsPayloadAtOnce(true, false)).toBe(false);
  });

  it('loads at once on a runway with the engines running', () => {
    expect(loadsPayloadAtOnce(true, true)).toBe(true);
  });

  it('loads at once when airborne', () => {
    expect(loadsPayloadAtOnce(false, false)).toBe(true);
    expect(loadsPayloadAtOnce(false, true)).toBe(true);
  });
});

describe('isGsxPayloadSyncOn', () => {
  it('reads an unset setting as sync off', () => {
    expect(isGsxPayloadSyncOn(0)).toBe(false);
  });

  it('reads a setting of 1 as sync on', () => {
    expect(isGsxPayloadSyncOn(1)).toBe(true);
  });
});

describe('GSX_PAYLOAD_SYNC_DEFAULT', () => {
  it('means sync off, so the hook and the Settings page agree for a user who never touched it', () => {
    expect(isGsxPayloadSyncOn(GSX_PAYLOAD_SYNC_DEFAULT)).toBe(false);
  });
});

describe('INSTANT_LOAD_START_VALUES', () => {
  it('switches GSX sync off and boards instantly for the load', () => {
    expect(INSTANT_LOAD_START_VALUES).toEqual({ gsxPayloadSync: 0, boardingRate: BoardingRateValue.Instant });
  });
});

describe('instantLoadRestoreValues', () => {
  it('restores GSX sync 1 for a setting of 1', () => {
    expect(instantLoadRestoreValues('1', 'REAL').gsxPayloadSync).toBe(1);
  });

  it('restores GSX sync 0 for a setting of 0 or an empty one', () => {
    expect(instantLoadRestoreValues('0', 'REAL').gsxPayloadSync).toBe(0);
    expect(instantLoadRestoreValues('', 'REAL').gsxPayloadSync).toBe(0);
  });

  it('maps the boarding rate settings to the enum values', () => {
    expect(instantLoadRestoreValues('0', 'REAL').boardingRate).toBe(BoardingRateValue.Real);
    expect(instantLoadRestoreValues('0', 'FAST').boardingRate).toBe(BoardingRateValue.Fast);
    expect(instantLoadRestoreValues('0', 'INSTANT').boardingRate).toBe(BoardingRateValue.Instant);
  });

  it('falls back to the real rate for an unknown or empty setting', () => {
    expect(instantLoadRestoreValues('0', 'SOMETHING').boardingRate).toBe(BoardingRateValue.Real);
    expect(instantLoadRestoreValues('0', '').boardingRate).toBe(BoardingRateValue.Real);
  });
});

describe('importBlockedByBoarding', () => {
  it('follows the boarding state when GSX sync is off, ignoring GSX states', () => {
    expect(
      importBlockedByBoarding({
        gsxSyncOn: false,
        boardingStarted: false,
        gsxBoardingState: 4,
        gsxDeBoardingState: 5,
        refuelStarted: false,
        instantLoadInProgress: false,
      }),
    ).toBe(false);
    expect(
      importBlockedByBoarding({
        gsxSyncOn: false,
        boardingStarted: true,
        gsxBoardingState: 0,
        gsxDeBoardingState: 0,
        refuelStarted: false,
        instantLoadInProgress: false,
      }),
    ).toBe(true);
  });

  it('follows the GSX states when GSX sync is on', () => {
    expect(
      importBlockedByBoarding({
        gsxSyncOn: true,
        boardingStarted: false,
        gsxBoardingState: 4,
        gsxDeBoardingState: 0,
        refuelStarted: false,
        instantLoadInProgress: false,
      }),
    ).toBe(true);
    expect(
      importBlockedByBoarding({
        gsxSyncOn: true,
        boardingStarted: true,
        gsxBoardingState: 0,
        gsxDeBoardingState: 6,
        refuelStarted: false,
        instantLoadInProgress: false,
      }),
    ).toBe(false);
  });

  it('blocks while a refuel started by the user runs', () => {
    expect(
      importBlockedByBoarding({
        gsxSyncOn: false,
        boardingStarted: false,
        gsxBoardingState: 0,
        gsxDeBoardingState: 0,
        refuelStarted: true,
        instantLoadInProgress: false,
      }),
    ).toBe(true);
  });

  it('blocks a second import while an instant load is in progress, even with GSX sync on', () => {
    expect(
      importBlockedByBoarding({
        gsxSyncOn: true,
        boardingStarted: false,
        gsxBoardingState: 0,
        gsxDeBoardingState: 0,
        refuelStarted: false,
        instantLoadInProgress: true,
      }),
    ).toBe(true);
  });
});
