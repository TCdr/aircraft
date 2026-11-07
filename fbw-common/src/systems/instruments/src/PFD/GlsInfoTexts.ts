// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarString } from '@flybywiresim/fbw-sdk';

export interface GlsInfoInputs {
  /** the LOC or G/S deviation of this display's receiver is valid */
  received: boolean;
  /** SimVarString.pack(rpi, 4)[0] */
  identWord: number;
  /** the channel this display's receiver is set to, 0 in ILS mode */
  channel: number;
  /** nautical miles to the runway threshold */
  thresholdDistance: number;
}

export interface GlsInfoTexts {
  /** empty until the ground station is received */
  ident: string;
  /** the tuned channel, shown whether or not the station is received like the frequency of an ILS */
  channel: string;
  /** the distance to the threshold; null until the ground station is received */
  distance: number | null;
}

/** What the LS information block of the PFD shows for a GLS, in the places of the ILS ident, frequency and DME */
export function glsInfoTexts(inputs: GlsInfoInputs): GlsInfoTexts {
  return {
    ident: inputs.received ? SimVarString.unpack([inputs.identWord]) : '',
    channel: inputs.channel > 0 ? inputs.channel.toFixed(0) : '',
    distance: inputs.received ? inputs.thresholdDistance : null,
  };
}
