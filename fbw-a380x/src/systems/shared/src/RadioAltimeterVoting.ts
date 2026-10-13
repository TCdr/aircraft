// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word, Arinc429WordData } from '@flybywiresim/fbw-sdk';

/** A radio altitude word is usable for the vote when it is neither failed nor without computed data */
function isUsableRadioAltitude(word: Arinc429WordData): boolean {
  return !word.isFailureWarning() && !word.isNoComputedData();
}

/** The word as an Arinc429Word (consumer subjects hold Arinc429Registers) */
function toWord(word: Arinc429WordData): Arinc429Word {
  return word instanceof Arinc429Word ? word : new Arinc429Word(Arinc429Word.getRawWord(word.value, word.ssm));
}

/**
 * The radio height the A380 shows on both PFDs and uses for the automatic callouts, voted from the three radio
 * altimeters (a380_fcom.txt l.86462-86466, DSC-34-10-30):
 * "Both PFD display the same height",
 * "When all three RA are available the displayed height is the median value.
 *  If only two RA are available, the displayed height is the average value.
 *  If only one RA is available the displayed height is the remaining value."
 *
 * With no usable RA, a no-computed-data word is kept in preference to a failed one, so the PFD shows the
 * RA flag only when no radio altimeter is merely out of range.
 * @param radioAltitudes the RA 1, RA 2 and RA 3 words, in that order
 * @returns the voted radio altitude word
 */
export function voteRadioAltitude(radioAltitudes: readonly Arinc429WordData[]): Arinc429Word {
  const usable = radioAltitudes.filter(isUsableRadioAltitude);

  if (usable.length >= 3) {
    const sortedHeights = usable.slice(0, 3).sort((a, b) => a.value - b.value);
    return toWord(sortedHeights[1]);
  }

  if (usable.length === 2) {
    const averageHeight = (usable[0].value + usable[1].value) / 2;
    return new Arinc429Word(Arinc429Word.getRawWord(averageHeight, usable[0].ssm));
  }

  if (usable.length === 1) {
    return toWord(usable[0]);
  }

  const notFailed = radioAltitudes.find((word) => !word.isFailureWarning());
  return toWord(notFailed ?? radioAltitudes[0]);
}
