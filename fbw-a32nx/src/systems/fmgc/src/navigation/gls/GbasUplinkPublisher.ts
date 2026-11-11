// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SimVarString } from '@flybywiresim/fbw-sdk';
import { GlsApproachData } from '@fmgc/navigation/gls/GlsApproachData';

/** Longest reference path identifier: the 4 characters fit one packed number */
const RPI_LENGTH = 4;

/**
 * Sends the GLS procedure of the tuned MMRs to the receiver, as L:vars written on a change only. Both MMRs get the same
 * approach path data, as one ground station serves the runway, so a channel mismatch shows from the channel of each MMR.
 */
export class GbasUplinkPublisher {
  private readonly lastChannels: (number | null)[] = [null, null];

  /** undefined before the first publish, so that the first call always writes */
  private lastUplinked: GlsApproachData | null | undefined = undefined;

  /**
   * @param mmr1 the GLS MMR 1 is set to, undefined when it is in ILS mode
   * @param mmr2 the GLS MMR 2 is set to, undefined when it is in ILS mode
   */
  publish(mmr1: GlsApproachData | undefined, mmr2: GlsApproachData | undefined): void {
    this.publishChannel(0, mmr1);
    this.publishChannel(1, mmr2);

    let uplinked: GlsApproachData | null = null;
    if (mmr1?.definition) {
      uplinked = mmr1;
    } else if (mmr2?.definition) {
      uplinked = mmr2;
    }
    if (uplinked === this.lastUplinked) {
      return;
    }
    this.lastUplinked = uplinked;

    if (!uplinked?.definition) {
      SimVar.SetSimVarValue('L:A32NX_GBAS_VALID', 'bool', false);
      return;
    }
    const definition = uplinked.definition;
    // The values below reach the receiver one by one: invalid meanwhile, it never computes a path from a mix of two
    // procedures
    SimVar.SetSimVarValue('L:A32NX_GBAS_VALID', 'bool', false);
    // The flight-control modules read these raw: with a unit the sim would store radians and metres
    SimVar.SetSimVarValue('L:A32NX_GBAS_CHANNEL', 'number', definition.channel);
    SimVar.SetSimVarValue('L:A32NX_GBAS_LTP_LAT', 'number', definition.thresholdLocation.lat);
    SimVar.SetSimVarValue('L:A32NX_GBAS_LTP_LON', 'number', definition.thresholdLocation.long);
    SimVar.SetSimVarValue('L:A32NX_GBAS_LTP_ALT', 'number', definition.thresholdElevation);
    SimVar.SetSimVarValue('L:A32NX_GBAS_LENGTH', 'number', definition.runwayLength);
    SimVar.SetSimVarValue('L:A32NX_GBAS_COURSE', 'number', definition.courseTrue);
    SimVar.SetSimVarValue('L:A32NX_GBAS_GPA', 'number', definition.gpa);
    SimVar.SetSimVarValue('L:A32NX_GBAS_TCH', 'number', definition.tch);
    SimVar.SetSimVarValue('L:A32NX_GBAS_IDENT', 'number', SimVarString.pack(definition.rpi, RPI_LENGTH)[0]);
    SimVar.SetSimVarValue('L:A32NX_GBAS_VALID', 'bool', true);
  }

  private publishChannel(index: 0 | 1, gls: GlsApproachData | undefined): void {
    // 0 is ILS mode
    const channel = gls?.channel ?? 0;
    if (channel !== this.lastChannels[index]) {
      this.lastChannels[index] = channel;
      SimVar.SetSimVarValue(`L:A32NX_MMR_${index + 1}_GLS_CHANNEL`, 'number', channel);
    }
  }
}
