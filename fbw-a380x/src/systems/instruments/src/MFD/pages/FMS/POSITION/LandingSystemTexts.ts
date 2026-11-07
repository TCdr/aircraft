// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { MmrRadioTuningStatus } from '@fmgc/navigation/NavaidTuner';

type LandingSystemTuning = Pick<MmrRadioTuningStatus, 'ident' | 'frequency' | 'slope' | 'gls'>;

/** The CLASS field of the LS block: empty while nothing is tuned */
export function lsClassText(mmr: LandingSystemTuning): string {
  if (mmr.gls) {
    return 'GLS';
  }
  return mmr.ident ? 'ILS/DME' : '';
}

/** The FREQ/CHAN field: the channel of a GLS, the frequency of an ILS */
export function lsFrequencyOrChannel(mmr: LandingSystemTuning): number | null {
  return mmr.gls ? mmr.gls.channel : mmr.frequency ?? null;
}

/** The SLOPE field: the glide path angle of the ILS or of the GLS procedure */
export function lsSlopeText(mmr: LandingSystemTuning): string {
  return mmr.slope ? mmr.slope.toFixed(1) : '---';
}

type LandingSystemEntry = Pick<MmrRadioTuningStatus, 'manual' | 'facility' | 'gls' | 'glsEntry'>;

/**
 * The IDENT field is a crew entry (big font) when the crew typed an ILS ident or a GLS reference path identifier. What the
 * FMS selected, or derived from the channel the crew typed, is small.
 */
export function lsIdentEnteredByPilot(mmr: LandingSystemEntry): boolean {
  if (mmr.gls) {
    return mmr.manual && mmr.glsEntry === 'ident';
  }
  return mmr.manual && mmr.facility !== undefined;
}

/** The FREQ/CHAN field is a crew entry (big font) when the crew typed a frequency or a GLS channel */
export function lsFrequencyEnteredByPilot(mmr: LandingSystemEntry): boolean {
  if (mmr.gls) {
    return mmr.manual && mmr.glsEntry === 'channel';
  }
  return mmr.manual && mmr.facility === undefined;
}
