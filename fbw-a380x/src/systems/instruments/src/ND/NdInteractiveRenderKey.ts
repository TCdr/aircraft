// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NdInteractiveState } from '@shared/NdInteractive';
import { formatUtc } from '../MFD/FMC/DirectToEta';

/**
 * The FMS republishes the state twice a second with a raw distance and ETA. Rebuilding the DOM for each one
 * loses clicks that straddle a rebuild, so the pages are only rebuilt when this key of the displayed values changes.
 */
export function ndInteractivePageKey(state: NdInteractiveState): string {
  const distance =
    state.directTo && state.directToDistance !== null ? String(Math.round(state.directToDistance)) : '---';
  const utc = formatUtc(state.directTo ? state.directToUtc : null);
  const course = state.directToCourse
    ? `${state.directToCourse.course.toFixed(0)}${state.directToCourse.isTrue ? 'T' : ''}`
    : '';
  const waypoints = state.waypoints.map((w) => `${w.databaseId}:${w.ident}`).join(',');
  return [state.tmpy, state.directTo, distance, utc, course, waypoints].join('|');
}

/** The INSERT/ERASE buttons only show the temporary flight plan kind */
export function ndInteractiveButtonsKey(state: NdInteractiveState): string {
  return `${state.tmpy}|${state.directTo}`;
}
