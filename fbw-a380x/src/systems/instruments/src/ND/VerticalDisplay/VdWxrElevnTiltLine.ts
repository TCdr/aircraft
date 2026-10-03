// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The white line of the weather radar's manual ELEVN and TILT modes on the Vertical Display.
 *
 * A380 FCOM DSC-34-20-30-20 (ELEVN knob): "The VD displays a white line indicating the elevation or tilt value."
 * ELEVN/TILT option list: ELEVN is "associated with the ELEVN message and the selected value on the ND" and "with the
 * white line indicating the selected altitude on the VD"; TILT is "associated with the TILT message and the selected
 * value on the ND" and "with the white line indicating the selected tilt value on the VD".
 * VD, ELEVN AND TILT INDICATIONS (figures, PDF p. 3196-3197): a horizontal white line at the selected altitude ahead of
 * the aircraft symbol (ELEVN), a straight white line from the aircraft symbol's nose along the tilt angle (TILT).
 * DSC-34-20-30-10: "Zero tilt value indicates the horizon as seen by the ADIRS."
 *
 * Design choices (not in the FCOM):
 * - the line runs from the aircraft (0 NM) to the end of the VD range, cut to the plot; a selected altitude off the
 *   vertical scale shows no line (the FCOM gives no off-scale indication).
 * - the TILT line is straight, as in the figure: the earth's curvature and the beam refraction are not applied.
 */

/** ELEVN/TILT option list of the MFD SURV/CONTROLS page (L:A380X_WXR_ELEVN_TILT_MODE) */
export enum VdWxrElevnTiltMode {
  Auto = 0,
  Elevn = 1,
  Tilt = 2,
}

/** Value of L:A380X_WXR_ELEVN / _TILT while nothing is entered (WXR_NO_ENTRY of the MFD's WxrManualSettings) */
export const WXR_SETTING_NO_ENTRY = -9999;

const FEET_PER_NAUTICAL_MILE = 6076.12;

/** A rectangle of the VD, in display pixels */
export interface VdPlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The VD's plot in the ND's SVG: x 150 (0 NM) .. 690 (VD range), y 800 (upper altitude) .. 1000 (lower altitude) */
export const VD_PLOT_AREA: VdPlotArea = { left: 150, top: 800, width: 540, height: 200 };

export interface VdWxrElevnTiltLineInputs {
  /**
   * The ND shows the WX display function (and so the ELEVN / TILT message): the WX pb selected, the WXR on and
   * working, not the MAP mode (A32NX_WXR_ND_{L,R}_MODE = 1 on the A380X)
   */
  wxrModeShownOnNd: boolean;
  /** L:A380X_WXR_ELEVN_TILT_MODE */
  mode: number;
  /** Selected elevation in feet (FL x 100 with the STD baro reference), the VD scale's reference */
  elevnFeet: number;
  /** Selected tilt in degrees, positive up */
  tiltDegrees: number;
  /** The VD's aircraft altitude (ADR baro-corrected altitude) in feet, null when not valid */
  aircraftAltitudeFeet: number | null;
  /** VD range (horizontal extent of the plot) in NM */
  vdRangeNm: number;
  /** Lower and upper altitude of the VD's vertical scale, in feet */
  verticalRange: [number, number];
  plot: VdPlotArea;
}

export interface VdLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The ends of the white line in display pixels, or null when no line is shown */
export function vdWxrElevnTiltLine(i: VdWxrElevnTiltLineInputs): VdLine | null {
  const [lower, upper] = i.verticalRange;
  if (!i.wxrModeShownOnNd || !(upper > lower) || !(i.vdRangeNm > 0)) {
    return null;
  }
  const altToY = (alt: number) => i.plot.top + ((upper - alt) / (upper - lower)) * i.plot.height;
  const right = i.plot.left + i.plot.width;

  if (i.mode === VdWxrElevnTiltMode.Elevn) {
    if (i.elevnFeet === WXR_SETTING_NO_ENTRY || !Number.isFinite(i.elevnFeet)) {
      return null;
    }
    if (i.elevnFeet < lower || i.elevnFeet > upper) {
      return null;
    }
    const y = altToY(i.elevnFeet);
    return { x1: i.plot.left, y1: y, x2: right, y2: y };
  }

  if (i.mode === VdWxrElevnTiltMode.Tilt) {
    if (
      i.tiltDegrees === WXR_SETTING_NO_ENTRY ||
      !Number.isFinite(i.tiltDegrees) ||
      i.aircraftAltitudeFeet === null ||
      !Number.isFinite(i.aircraftAltitudeFeet)
    ) {
      return null;
    }
    // The altitude the tilt line reaches at the end of the VD range
    const endAltitude =
      i.aircraftAltitudeFeet + i.vdRangeNm * FEET_PER_NAUTICAL_MILE * Math.tan((i.tiltDegrees * Math.PI) / 180);
    return clipToPlot(
      { x1: i.plot.left, y1: altToY(i.aircraftAltitudeFeet), x2: right, y2: altToY(endAltitude) },
      i.plot,
    );
  }

  return null;
}

/** Liang-Barsky: the part of the segment inside the plot, or null when it is all outside */
function clipToPlot(line: VdLine, plot: VdPlotArea): VdLine | null {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  let tEnter = 0;
  let tExit = 1;
  // Each edge as p * t <= q
  const edges: [number, number][] = [
    [-dx, line.x1 - plot.left],
    [dx, plot.left + plot.width - line.x1],
    [-dy, line.y1 - plot.top],
    [dy, plot.top + plot.height - line.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
    } else {
      const t = q / p;
      if (p < 0) {
        tEnter = Math.max(tEnter, t);
      } else {
        tExit = Math.min(tExit, t);
      }
    }
  }
  if (tEnter > tExit) {
    return null;
  }
  return {
    x1: line.x1 + tEnter * dx,
    y1: line.y1 + tEnter * dy,
    x2: line.x1 + tExit * dx,
    y2: line.y1 + tExit * dy,
  };
}
