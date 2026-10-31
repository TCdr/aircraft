// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Boarding is a service of a parked aircraft. Anywhere else (engines running, or not on the ground) nobody can board
 * it, so the imported OFP load goes into the aircraft at once.
 */
export const loadsPayloadAtOnce = (onGround: boolean, anyEngineRunning: boolean): boolean =>
  !onGround || anyEngineRunning;

/** Values of the L:A32NX_BOARDING_RATE enum the payload system reads. */
export enum BoardingRateValue {
  Instant = 0,
  Fast = 1,
  Real = 2,
}

/** The Settings page stores 1 or 0; a setting nobody touched reads as 0, so the sync is off. */
export const GSX_PAYLOAD_SYNC_DEFAULT = 0;

export const isGsxPayloadSyncOn = (settingValue: number): boolean => settingValue > 0;

/**
 * An instant load needs GSX sync off (the payload system would only follow GSX) and the instant boarding rate. Both
 * are local vars of the running session, so the persistent settings of the user stay untouched.
 */
export const INSTANT_LOAD_START_VALUES = { gsxPayloadSync: 0, boardingRate: BoardingRateValue.Instant };

/**
 * The local var values for the end of an instant load, taken from the persistent settings at that moment, so a
 * setting changed during the load wins and a second import cannot hand back the values of the first one. Same mapping
 * as the settings sync in Settings/sync.ts, which cannot be imported here without the whole SDK.
 */
export const instantLoadRestoreValues = (gsxPayloadSyncSetting: string, boardingRateSetting: string) => {
  let boardingRate = BoardingRateValue.Real;
  if (boardingRateSetting === 'FAST') {
    boardingRate = BoardingRateValue.Fast;
  } else if (boardingRateSetting === 'INSTANT') {
    boardingRate = BoardingRateValue.Instant;
  }
  return { gsxPayloadSync: isGsxPayloadSyncOn(Number(gsxPayloadSyncSetting)) ? 1 : 0, boardingRate };
};

export interface ImportGuardState {
  gsxSyncOn: boolean;
  boardingStarted: boolean;
  gsxBoardingState: number;
  gsxDeBoardingState: number;
  refuelStarted: boolean;
  /** The flyPad has switched sync and rate for an instant load and not handed them back yet. */
  instantLoadInProgress: boolean;
}

/** With GSX sync the GSX states say whether a boarding runs, otherwise the boarding started in the flyPad does. */
export const importBlockedByBoarding = (state: ImportGuardState): boolean => {
  const gsxInProgress =
    (state.gsxDeBoardingState >= 4 && state.gsxDeBoardingState < 6) ||
    (state.gsxBoardingState >= 4 && state.gsxBoardingState < 6);
  const boardingInProgress = state.gsxSyncOn ? gsxInProgress : state.boardingStarted;
  return boardingInProgress || state.refuelStarted || state.instantLoadInProgress;
};
