// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import {
  TimeMarkerPrediction,
  TimeMarkerSource,
  secondsAheadOfUtc,
} from '@fmgc/guidance/lnav/TimeMarkerPseudoWaypoints';
import { SECONDS_PER_DAY } from '@fmgc/guidance/vnav/rta/TimeConstraint';
import { NXSystemMessages, TypeIIMessage, TypeIMessage } from '../shared/NXSystemMessages';

/** Up to 4 time markers (LL XING - TIME MKR page) */
export const MAX_TIME_MARKERS = 4;

/** A marker whose remaining time was below this at the last cycle and wrapped to the next day was reached */
const REACHED_WINDOW_SECONDS = 10;

/** What the time markers use of the FMS */
export interface A380xTimeMarkersHost {
  /** the clock of the FMS, seconds of the UTC day */
  utcSeconds(): number;
  /** the UTC the vertical predictions count from: the clock, or the ETT in preflight */
  predictionReferenceUtcSeconds(): number;
  addMessageToQueue(message: TypeIMessage | TypeIIMessage): void;
}

/** The marker values, kept in L:vars so that the FMCs of both MFDs show the same markers */
export interface TimeMarkerStorage {
  read(index: number): { utcSeconds: number | null; aural: boolean };
  write(index: number, utcSeconds: number | null, aural: boolean): void;
}

export const simVarTimeMarkerStorage: TimeMarkerStorage = {
  read: (index) => ({
    utcSeconds:
      SimVar.GetSimVarValue(`L:A32NX_FM_TIME_MARKER_${index + 1}_DEFINED`, 'bool') > 0
        ? SimVar.GetSimVarValue(`L:A32NX_FM_TIME_MARKER_${index + 1}_UTC`, 'seconds')
        : null,
    aural: SimVar.GetSimVarValue(`L:A32NX_FM_TIME_MARKER_${index + 1}_AURAL`, 'bool') > 0,
  }),
  write: (index, utcSeconds, aural) => {
    SimVar.SetSimVarValue(`L:A32NX_FM_TIME_MARKER_${index + 1}_DEFINED`, 'bool', utcSeconds !== null);
    SimVar.SetSimVarValue(`L:A32NX_FM_TIME_MARKER_${index + 1}_UTC`, 'seconds', utcSeconds ?? 0);
    SimVar.SetSimVarValue(`L:A32NX_FM_TIME_MARKER_${index + 1}_AURAL`, 'bool', aural);
  },
};

/**
 * The time markers of the FMS: the crew defines up to 4 UTC times, the FMS puts a pseudo waypoint where the aircraft
 * is predicted to be at that time, and posts TIME MARKER REACHED when it is reached.
 */
export class A380xTimeMarkers implements TimeMarkerSource {
  public readonly utc = Array.from({ length: MAX_TIME_MARKERS }, () => Subject.create<number | null>(null));

  public readonly aural = Array.from({ length: MAX_TIME_MARKERS }, () => Subject.create(false));

  private readonly lastRemainingSeconds: (number | null)[] = this.utc.map(() => null);

  constructor(
    private readonly host: A380xTimeMarkersHost,
    private readonly storage: TimeMarkerStorage = simVarTimeMarkerStorage,
  ) {}

  /** Sets, or deletes with null, a marker; the other FMC picks it up from the storage */
  setUtc(index: number, utcSeconds: number | null): void {
    this.utc[index].set(utcSeconds);
    if (utcSeconds === null) {
      this.aural[index].set(false);
    }
    this.storage.write(index, utcSeconds, this.aural[index].get());
  }

  setAural(index: number, aural: boolean): void {
    this.aural[index].set(aural);
    this.storage.write(index, this.utc[index].get(), aural);
  }

  predictions(): TimeMarkerPrediction[] {
    const reference = this.host.predictionReferenceUtcSeconds();
    const predictions: TimeMarkerPrediction[] = [];
    for (const utc of this.utc) {
      const utcSeconds = utc.get();
      if (utcSeconds !== null) {
        predictions.push({ utcSeconds, secondsFromPresent: secondsAheadOfUtc(utcSeconds, reference) });
      }
    }

    return predictions;
  }

  update(): void {
    const now = this.host.utcSeconds();

    for (let index = 0; index < MAX_TIME_MARKERS; index++) {
      const stored = this.storage.read(index);
      this.utc[index].set(stored.utcSeconds);
      this.aural[index].set(stored.aural);

      const remaining = stored.utcSeconds === null ? null : secondsAheadOfUtc(stored.utcSeconds, now);
      const last = this.lastRemainingSeconds[index];
      this.lastRemainingSeconds[index] = remaining;

      // The remaining time of a reached marker wraps to the next day (or the other FMC already deleted it)
      const reached =
        last !== null && last <= REACHED_WINDOW_SECONDS && (remaining === null || remaining > SECONDS_PER_DAY / 2);
      if (reached) {
        this.host.addMessageToQueue(NXSystemMessages.timeMarkerReached);
        if (remaining !== null) {
          this.setUtc(index, null);
        }
      }
    }
  }
}
