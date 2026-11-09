// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates } from 'msfs-geo';
import { GlsApproachData } from './GlsApproachData';
import type { MmrRadioTuningStatus } from '../NavaidTuner';
import { applyRmpGls, leaveGlsMode } from '../LandingSystemTuning';
import { ManualGlsTuningContext, tuneManualGls } from './ManualGlsTuning';

/** How often an unresolved channel is looked up again, as the position and the database may have become available */
const RESOLVE_RETRY_INTERVAL_MS = 10_000;

export type RmpGlsLoaders = Pick<ManualGlsTuningContext, 'loadTableAirports' | 'loadRunways'>;

export interface RmpGlsTuningContext extends RmpGlsLoaders {
  /** null while the position is not known */
  presentPosition: Coordinates | null;
}

/**
 * Resolves the channel that an RMP tuned to the GLS procedure the receiver would hear.
 *
 * Design choice: the destination of the flight plan is not used, because the RMPs only tune when the FMS has failed or
 * is not trusted. The nearest station on that channel within range is what the receiver hears.
 *
 * Design choice: a channel that found no station, or could not be looked up, is looked up again every few seconds:
 * the crew may tune the destination channel long before it is in range, or before the position is known.
 */
export class RmpGlsTuning {
  private requestedChannel = 0;

  private resolved: GlsApproachData | null = null;

  private lookupRunning = false;

  private msSinceLookup = 0;

  /** Tells apart the lookups of a replaced channel, which must not store their result */
  private channelChanges = 0;

  /**
   * Starts a resolution when the channel changed (or the last one found nothing) and returns the GLS of the channel
   * once it is known.
   * @param channel the channel the RMP tuned, 0 for none
   * @param getContext where the channel is resolved from, only called when a lookup starts
   * @param deltaTime milliseconds since the last update
   * @returns null for no channel and until the channel is resolved
   */
  update(channel: number, getContext: () => RmpGlsTuningContext, deltaTime: number): GlsApproachData | null {
    if (channel !== this.requestedChannel) {
      this.clear();
      this.requestedChannel = channel;
      if (channel > 0) {
        this.resolve(channel, getContext());
      }
      return null;
    }

    const nothingReceived = this.resolved === null || this.resolved.definition === null;
    if (channel > 0 && nothingReceived && !this.lookupRunning) {
      this.msSinceLookup += deltaTime;
      if (this.msSinceLookup >= RESOLVE_RETRY_INTERVAL_MS) {
        this.resolve(channel, getContext());
      }
    }
    return this.resolved;
  }

  /** Forgets the channel, so that tuning the same channel again resolves it again */
  clear(): void {
    this.channelChanges++;
    this.requestedChannel = 0;
    this.resolved = null;
    this.lookupRunning = false;
    this.msSinceLookup = 0;
  }

  private resolve(channel: number, context: RmpGlsTuningContext): void {
    const channelChange = this.channelChanges;
    this.lookupRunning = true;
    this.msSinceLookup = 0;
    const isCurrent = () => this.channelChanges === channelChange;

    tuneManualGls(channel, 'channel', {
      destinationIdent: null,
      originIdent: null,
      presentPosition: context.presentPosition,
      loadTableAirports: context.loadTableAirports,
      loadRunways: context.loadRunways,
      isTuningLocked: () => false,
      setManualGls: (gls) => {
        // A later channel may have replaced this one while its runways loaded
        if (isCurrent()) {
          this.resolved = gls;
        }
      },
    })
      .catch(() => {
        // The database could not answer: the receiver stays as it is until the next lookup
      })
      .then(() => {
        if (isCurrent()) {
          this.lookupRunning = false;
        }
      });
  }
}

export interface RmpGlsReceiverInputs {
  /** whether an RMP is in the NAV backup mode */
  rmpTuningActive: boolean;
  /** null where the aircraft has no GLS tuning on the RMP (A380X) */
  loaders: RmpGlsLoaders | null;
  /** the channel the RMPs tuned, 0 for none; only read when loaders are present and an RMP tunes */
  readChannel: () => number;
  presentPosition: () => Coordinates | null;
}

/**
 * The MMRs follow the GLS channel that the RMPs tuned. Without a channel they leave the GLS mode, so that a GLS does
 * not stay on the bus over the ILS tuned there.
 * @param tuning the resolution of the channel
 * @param mmrs the receivers the RMP tunes
 * @param inputs where the RMP tuning stands
 * @param deltaTime milliseconds since the last update
 */
export function updateRmpGlsReceivers(
  tuning: RmpGlsTuning,
  mmrs: MmrRadioTuningStatus[],
  inputs: RmpGlsReceiverInputs,
  deltaTime: number,
): void {
  const { loaders } = inputs;
  const channel = inputs.rmpTuningActive && loaders ? inputs.readChannel() : 0;
  if (!loaders || channel <= 0) {
    tuning.clear();
    mmrs.forEach((mmr) => leaveGlsMode(mmr));
    return;
  }

  const gls = tuning.update(channel, () => ({ presentPosition: inputs.presentPosition(), ...loaders }), deltaTime);
  // The receivers keep the previous channel while the new one is being resolved
  if (gls) {
    mmrs.forEach((mmr) => {
      if (mmr.gls !== gls) {
        applyRmpGls(mmr, gls);
      }
    });
  }
}
