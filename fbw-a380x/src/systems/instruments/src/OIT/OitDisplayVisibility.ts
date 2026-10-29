// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export enum DisplayUnitState {
  On,
  Off,
  Bootup,
  Selftest,
  Standby,
  Failed,
}

export interface OitDisplayVisibility {
  readonly selfTestVisible: boolean;
  readonly contentVisible: boolean;
}

/**
 * Which of the two divs of the display unit are shown in a state: the self-test screen or the OIT pages.
 * @param state the state of the display unit.
 * @returns the visibility of the self-test div and of the OIT content div.
 */
export function getOitDisplayVisibility(state: DisplayUnitState): OitDisplayVisibility {
  return {
    selfTestVisible: state === DisplayUnitState.Selftest || state === DisplayUnitState.Bootup,
    contentVisible: state === DisplayUnitState.On,
  };
}

/**
 * Decides whether a style write is needed, because Coherent re-renders the gauge on a write even if the value is the
 * same.
 * @param previous the visibility written last, null until the first write.
 * @param next the visibility to apply.
 * @returns true when `next` differs from what was written.
 */
export function oitDisplayVisibilityChanged(
  previous: OitDisplayVisibility | null,
  next: OitDisplayVisibility,
): boolean {
  return (
    previous === null ||
    previous.selfTestVisible !== next.selfTestVisible ||
    previous.contentVisible !== next.contentVisible
  );
}

/**
 * Whole percent, so float noise on the potentiometer does not count as a change. A knob that is not at OFF never
 * rounds down to 0, because 0 switches the display off.
 * @param brightness the potentiometer position in percent.
 * @returns the position in whole percent.
 */
export function roundBrightnessPercent(brightness: number): number {
  if (brightness === 0) {
    return 0;
  }
  return Math.max(1, Math.round(brightness));
}
