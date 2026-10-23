// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

const DISTANCE_STEPS = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** More labels than this do not fit side by side under the profile chart */
const MAX_DISTANCE_INTERVALS = 8;

/**
 * The spacing of the distance labels under the descent profile, in NM: the finest round step that keeps the labels
 * apart, whatever the span (a far DESCENT CHECK distance can stretch the axis to thousands of NM).
 */
export const distanceTickStep = (span: number): number =>
  DISTANCE_STEPS.find((step) => span / step <= MAX_DISTANCE_INTERVALS) ?? DISTANCE_STEPS[DISTANCE_STEPS.length - 1];
