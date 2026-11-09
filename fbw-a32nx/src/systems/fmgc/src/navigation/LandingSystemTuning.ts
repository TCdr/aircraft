// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { IlsNavaid } from '@flybywiresim/fbw-sdk';
import type { MmrRadioTuningStatus } from '@fmgc/navigation/NavaidTuner';
import { GlsApproachData } from '@fmgc/navigation/gls/GlsApproachData';

/** The landing system the FMS selected for the approach (or the takeoff runway) */
export interface SelectedLandingSystem {
  facility: IlsNavaid | undefined;
  course: number | null;
  backcourse: boolean;
  slope: number | null;
  /** null when the selection is an ILS or nothing */
  gls: GlsApproachData | null;
}

/**
 * Sets an MMR to the landing system that the FMS selected, unless the crew tuned the MMR manually.
 * A GLS leaves the frequency empty: that detunes the ILS receiver, so that no ILS is on the bus or the PFD.
 * @param tuningLocked the MMR tuning is locked on final approach: a switch to or from a GLS (or to another GLS) would
 * change the channel and the uplink, which the receiver must not do there. ILS to ILS keeps following the selection.
 */
export function applySelectedLandingSystem(
  mmr: MmrRadioTuningStatus,
  selected: SelectedLandingSystem,
  tuningLocked = false,
): void {
  if (mmr.manual || (tuningLocked && (mmr.gls || selected.gls))) {
    return;
  }

  if (selected.gls) {
    if (mmr.gls !== selected.gls) {
      setGls(mmr, selected.gls);
      mmr.databaseCourse = selected.gls.course;
    }
    return;
  }

  if (
    (mmr.gls !== undefined ||
      mmr.facility?.databaseId !== selected.facility?.databaseId ||
      mmr.course !== selected.course ||
      mmr.backcourse !== selected.backcourse) &&
    (selected.course !== null || selected.facility === undefined)
  ) {
    mmr.gls = undefined;
    mmr.databaseCourse = selected.course;
    mmr.databaseBackcourse = selected.backcourse;
    mmr.course = selected.course;
    mmr.courseManual = false;
    mmr.frequency = selected.facility?.frequency ?? null;
    mmr.facility = selected.facility;
    mmr.ident = selected.facility?.ident ?? null;
    mmr.backcourse = selected.backcourse;
    mmr.slope = selected.slope;
  }
}

/** The field the crew typed a GLS into: the reference path identifier (IDENT) or the channel (FREQ/CHAN) */
export type GlsManualEntryField = 'ident' | 'channel';

/**
 * Sets an MMR to a GLS the crew entered, or clears the manual selection.
 * @param gls null to clear
 * @param tuningLocked the MMR tuning is locked on final approach, so the GLS mode stays as it is
 * @param entry the field the crew used, which decides the field that is shown as a crew entry
 */
export function applyManualGls(
  mmr: MmrRadioTuningStatus,
  gls: GlsApproachData | null,
  tuningLocked = false,
  entry: GlsManualEntryField = 'channel',
): void {
  if (tuningLocked && (gls || mmr.gls)) {
    return;
  }
  if (gls === null) {
    mmr.manual = false;
    mmr.gls = undefined;
    mmr.glsEntry = undefined;
    mmr.facility = undefined;
    mmr.frequency = null;
    mmr.ident = null;
    mmr.course = null;
    mmr.slope = null;
    mmr.databaseBackcourse = false;
    mmr.courseManual = false;
    mmr.backcourse = false;
  } else {
    setGls(mmr, gls);
    mmr.manual = true;
    mmr.glsEntry = entry;
  }
  // A manual selection has no database course to fall back to; the null case clears it as well
  mmr.databaseCourse = null;
}

/**
 * Sets an MMR to the GLS that an RMP tuned. The RMP owns the inhibit of its tuning (the ILS and the GLS freeze on final
 * approach there), so the FMS tuning lock does not apply.
 */
export function applyRmpGls(mmr: MmrRadioTuningStatus, gls: GlsApproachData): void {
  setGls(mmr, gls);
  mmr.manual = true;
  mmr.glsEntry = 'channel';
  mmr.databaseCourse = null;
}

/** The crew cannot enter the course of a GLS: the receiver takes it from the uplink */
export function canEnterLsCourse(mmr: Pick<MmrRadioTuningStatus, 'gls'>): boolean {
  return !mmr.gls;
}

/**
 * Takes an MMR out of GLS mode, e.g. when the RMPs tune the radios: the channel and the uplink then go away with it, so
 * that a GLS does not stay on the bus over an ILS tuned on the RMP.
 */
export function leaveGlsMode(mmr: MmrRadioTuningStatus): void {
  if (mmr.gls) {
    applyManualGls(mmr, null);
  }
}

function setGls(mmr: MmrRadioTuningStatus, gls: GlsApproachData): void {
  mmr.gls = gls;
  mmr.glsEntry = undefined;
  mmr.facility = undefined;
  mmr.frequency = null;
  mmr.ident = gls.rpi;
  mmr.course = gls.course;
  mmr.courseManual = false;
  mmr.backcourse = false;
  mmr.databaseBackcourse = false;
  mmr.slope = gls.slope;
}
