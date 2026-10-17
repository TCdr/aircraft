// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The slat and flap positions the FWS uses for its CONFIG logic (F/CTL FLAPS (SLATS) NOT IN T.O CONFIG, flaps/slats
 * position signals of the T.O and LDG logic). Any slat or flap control unit can give the position of all the slats and
 * flaps, so the FWS takes SFCC 2 when SFCC 1 cannot give the position.
 */

/** The part of an ARINC 429 word the selection needs */
export interface SfccPositionWord {
  isNormalOperation(): boolean;
}

/**
 * Selects the slat (or flap) actual position word of SFCC 1, or of SFCC 2 when SFCC 1 cannot give it.
 * Design choice: SFCC 1 cannot give the position when its word is not in normal operation, or when its slat (flap)
 * channel reports a fault in its system status word (bit 11 slat fault, bit 12 flap fault: the channel lost the control
 * of its motor). With both SFCCs unable, SFCC 1 stays the source (the FWS then sees what SFCC 1 sends).
 * @param sfcc1Word the position word of SFCC 1
 * @param sfcc1ChannelFault the slat (flap) channel of SFCC 1 reports a fault
 * @param sfcc2Word the position word of SFCC 2
 * @param sfcc2ChannelFault the slat (flap) channel of SFCC 2 reports a fault
 * @returns the word to use
 */
export function selectSfccPositionWord<T extends SfccPositionWord>(
  sfcc1Word: T,
  sfcc1ChannelFault: boolean,
  sfcc2Word: T,
  sfcc2ChannelFault: boolean,
): T {
  const sfcc1Usable = sfcc1Word.isNormalOperation() && !sfcc1ChannelFault;
  const sfcc2Usable = sfcc2Word.isNormalOperation() && !sfcc2ChannelFault;
  return !sfcc1Usable && sfcc2Usable ? sfcc2Word : sfcc1Word;
}
