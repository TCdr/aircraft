// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { MagVar } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlsBeamGeometry } from '@fmgc/navigation/fls/FlsBeam';

/** The FLS is used in these flight phases only */
const FLS_FLIGHT_PHASES: readonly FmgcFlightPhase[] = [FmgcFlightPhase.Descent, FmgcFlightPhase.Approach];

/** Sends the FLS beam to the MMR deviation computation and the flight guidance, as L:vars written on a change */
export class FlsBeamPublisher {
  private lastWritten: string | null = null;

  /** degrees magnetic, null without a beam whose F-LOC replaces the localizer */
  private lateralCourse: number | null = null;

  publish(beam: FlsBeamGeometry | null, flightPhase: FmgcFlightPhase): void {
    const published = beam && FLS_FLIGHT_PHASES.includes(flightPhase) ? beam : null;
    const key = published
      ? `${published.anchorLocation.lat.toFixed(6)}|${published.anchorLocation.long.toFixed(6)}|${published.anchorAltitude.toFixed(1)}|${published.course.toFixed(2)}|${published.slope.toFixed(3)}|${published.lateral}`
      : 'none';
    if (key === this.lastWritten) {
      return;
    }
    this.lastWritten = key;

    if (!published) {
      this.lateralCourse = null;
      SimVar.SetSimVarValue('L:A32NX_FM_FLS_BEAM_VALID', 'bool', false);
      SimVar.SetSimVarValue('L:A32NX_FM_FLS_LATERAL', 'bool', false);
      return;
    }
    const { lat, long } = published.anchorLocation;
    this.lateralCourse = published.lateral ? MagVar.trueToMagnetic(published.course, MagVar.get(lat, long) ?? 0) : null;
    // The flight-control modules read these raw: with a unit the sim would store radians and metres
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_ANCHOR_LAT', 'number', lat);
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_ANCHOR_LON', 'number', long);
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_ANCHOR_ALT', 'number', published.anchorAltitude);
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_COURSE', 'number', published.course);
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_SLOPE', 'number', published.slope);
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_LATERAL', 'bool', published.lateral);
    SimVar.SetSimVarValue('L:A32NX_FM_FLS_BEAM_VALID', 'bool', true);
  }

  /**
   * The course of L:A32NX_FM_LS_COURSE: the FLS course when its F-LOC replaces the localizer, else the ILS course
   * @param ilsCourse degrees magnetic, -1 without one
   */
  lsCourse(ilsCourse: number): number {
    return this.lateralCourse ?? ilsCourse;
  }
}
