// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EfisNdMode, MathUtils } from '@flybywiresim/fbw-sdk';
import { ArmedLateralMode, ArmedVerticalMode, isArmed, LateralMode, VerticalMode } from '@shared/autopilot';
import { FlsBeam } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { VerticalDisplayPaintUtils } from './VerticalDisplayPaintUtils';

/** The VD draws this length of the FLS beam, back from the anchor point, in NM */
const FLS_BEAM_LENGTH = 80;

/** The beam shows up to this ND range in ARC mode, and twice it in ROSE NAV, in NM */
const FLS_BEAM_MAX_ARC_RANGE = 80;

const FLS_BEAM_COLOR = '#ff94ff';

export interface FlsBeamDisplayConditions {
  /** the LS pushbutton of the EFIS CP is pressed */
  lsPressed: boolean;
  /** the APPR pushbutton of the AFS CP is pressed: an approach mode is armed or engaged */
  approachModeSelected: boolean;
  /** the vertical cut of the VD is along the flight plan (not along the track) */
  alongFlightPlan: boolean;
  ndMode: EfisNdMode;
  /** the ND range, in NM */
  ndRange: number;
}

/**
 * The VD shows the FLS beam with a non precision approach in the active flight plan (the FMS sends a beam), when the
 * flight crew pressed the LS or the APPR pushbutton, the vertical cut follows the flight plan, and the ND range is
 * 80 NM or less in ARC mode (160 NM or less in ROSE NAV mode).
 */
export function isFlsBeamShown(beam: FlsBeam | null, conditions: FlsBeamDisplayConditions): boolean {
  const rangeShown =
    (conditions.ndMode === EfisNdMode.ARC && conditions.ndRange <= FLS_BEAM_MAX_ARC_RANGE) ||
    (conditions.ndMode === EfisNdMode.ROSE_NAV && conditions.ndRange <= 2 * FLS_BEAM_MAX_ARC_RANGE);
  return (
    beam !== null &&
    (conditions.lsPressed || conditions.approachModeSelected) &&
    conditions.alongFlightPlan &&
    rangeShown
  );
}

/** An approach mode (pressed with the APPR pushbutton) is armed or engaged */
export function isApproachModeSelected(
  lateralMode: number,
  lateralArmed: number,
  verticalMode: number,
  verticalArmed: number,
): boolean {
  return (
    isArmed(lateralArmed, ArmedLateralMode.LOC) ||
    isArmed(verticalArmed, ArmedVerticalMode.GS) ||
    isArmed(verticalArmed, ArmedVerticalMode.FINAL) ||
    [LateralMode.LOC_CPT, LateralMode.LOC_TRACK, LateralMode.LAND].includes(lateralMode) ||
    [VerticalMode.GS_CPT, VerticalMode.GS_TRACK, VerticalMode.FINAL, VerticalMode.LAND].includes(verticalMode)
  );
}

/**
 * The altitude in STD of a QNH altitude: the QNH altitude plus the pressure altitude of the QNH
 * @param qnh in hPa
 */
function standardAltitude(qnhAltitude: number, qnh: number): number {
  return qnhAltitude + 145_366.45 * (1 - (qnh / 1013.25) ** 0.190284);
}

export interface VdLine {
  /** NM from the aircraft */
  startDistance: number;
  /** feet */
  startAltitude: number;
  endDistance: number;
  endAltitude: number;
}

/**
 * The FLS beam on the VD, from 80 NM before its anchor point to the anchor point, in the altitudes of the altimeter
 * setting (in STD, from the QNH of the PERF APPR panel; without one the beam stays on 1013 hPa).
 */
export function flsBeamVdLine(beam: FlsBeam, baroIsStd: boolean): VdLine {
  const anchorAltitude =
    baroIsStd && beam.approachQnh !== null
      ? standardAltitude(beam.anchorAltitude, beam.approachQnh)
      : beam.anchorAltitude;
  return {
    startDistance: beam.anchorDistance - FLS_BEAM_LENGTH,
    startAltitude:
      anchorAltitude + FLS_BEAM_LENGTH * MathUtils.FEET_TO_NAUTICAL_MILES * Math.tan((beam.slope * Math.PI) / 180),
    endDistance: beam.anchorDistance,
    endAltitude: anchorAltitude,
  };
}

/** Paints the FLS beam: a magenta dotted line, with the anchor point ident when it is not at the runway threshold */
export function paintFlsBeam(
  context: CanvasRenderingContext2D,
  beam: FlsBeam,
  baroIsStd: boolean,
  distanceToX: (distance: number) => number,
  altitudeToY: (altitude: number) => number,
): void {
  const line = flsBeamVdLine(beam, baroIsStd);
  const x0 = distanceToX(line.startDistance);
  const y0 = altitudeToY(line.startAltitude);
  const x1 = distanceToX(line.endDistance);
  const y1 = altitudeToY(line.endAltitude);

  context.save();
  context.strokeStyle = FLS_BEAM_COLOR;
  context.lineWidth = 2;
  context.setLineDash([3, 6]);
  context.beginPath();
  context.moveTo(x0, y0);
  context.lineTo(x1, y1);
  context.stroke();
  context.setLineDash([]);

  if (!beam.anchorAtThreshold) {
    context.font = '20px Ecam';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    VerticalDisplayPaintUtils.paintText(false, context, x1, y1 - 12, beam.ident, FLS_BEAM_COLOR);
    VerticalDisplayPaintUtils.paintText(true, context, x1, y1 - 12, beam.ident, FLS_BEAM_COLOR);
  }
  context.restore();
}
