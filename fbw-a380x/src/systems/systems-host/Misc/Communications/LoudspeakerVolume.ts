// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The loudspeaker volume control knobs of the glareshield (CAPT and F/O):
 * - fully anticlockwise: the two onside loudspeakers are off.
 * - else: the two onside loudspeakers are on, the knob sets their volume.
 * - The knobs set the volume of voice communications only, never of the FWS and SURV audio messages.
 * The sim has a single audio output and no headset: the onside knob of the active AMU (CAPT, or F/O when the user sits
 * on the right or AMU 1 fails) scales the COM receive volumes set by the RMP. The FWS and SURV sounds do not use the COM
 * volumes and are not affected. Design choice: the knobs start fully clockwise (100 %) at each flight load, so that the
 * radios keep the RMP volume until the crew turns the knob.
 */

/** The L:var of the loudspeaker volume knob (percent, 0 = OFF) of a side: 1 CAPT, 2 F/O */
export function loudspeakerVolumeVar(side: number): string {
  return `L:A380X_LOUDSPEAKER_${side}_VOLUME`;
}

/** The knob position at each flight load (percent) */
export const LOUDSPEAKER_INITIAL_VOLUME_PERCENT = 100;

/**
 * @param rmpVolume the COM volume selected on the RMP (0-100)
 * @param loudspeakerVolumePercent the onside loudspeaker volume knob (0 = OFF, 100 = fully clockwise)
 * @returns the COM receive volume of the sim (0-100)
 */
export function loudspeakerComVolume(rmpVolume: number, loudspeakerVolumePercent: number): number {
  const knob = Math.min(Math.max(loudspeakerVolumePercent, 0), 100);
  return (rmpVolume * knob) / 100;
}
