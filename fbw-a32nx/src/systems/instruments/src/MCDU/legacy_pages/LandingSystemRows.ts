// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ApproachType } from '@flybywiresim/fbw-sdk';
import type { GlsApproachData } from '@fmgc/navigation/gls/GlsApproachData';

/** The approaches with a glide path, which take a radio minimum and show the slope: ILS and GLS */
export function isPrecisionApproach(approachType: ApproachType | undefined): boolean {
  return approachType === ApproachType.Ils || approachType === ApproachType.Gls;
}

/** The ident and frequency an ILS approach shows beside its runway on the ARRIVAL page */
export function ilsApproachText(ident: string, frequency: number): string {
  return `${ident.padStart(6)}/${frequency.toFixed(2)}`;
}

/** The reference path identifier and channel a GLS approach shows beside its runway on the ARRIVAL page */
export function glsApproachText(rpi: string, channel: number): string {
  return `${rpi.padStart(6)}/${channel.toFixed(0)}`;
}

export interface SelectedNavaidRow {
  label: string;
  line: string;
}

/**
 * The SELECTED NAVAIDS row of a GLS, laid out like the rows of the other navaids. The GLS is no database navaid, so it
 * has no ident link.
 * @param modeText AUTO or MAN
 * @returns null without a GLS
 */
export function glsSelectedNavaidRow(gls: GlsApproachData | undefined, modeText: string): SelectedNavaidRow | null {
  if (!gls) {
    return null;
  }
  return {
    label: `\xa0${'GLS'.padEnd(9, '\xa0')}${modeText}`,
    line: `{cyan}\xa0${(gls.rpi ?? '').padEnd(6, '\xa0')}{end}{small}{green}${gls.channel.toFixed(0)}{end}{end}`,
  };
}
