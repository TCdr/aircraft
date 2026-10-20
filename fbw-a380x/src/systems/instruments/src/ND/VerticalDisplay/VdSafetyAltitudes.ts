// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { VdSafetyAltitudeSegment } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { VdPlotArea } from './VdWxrElevnTiltLine';

/**
 * The safety altitudes on the VD (magenta), from the FMS segments along the cut:
 * - With QNH, as a dashed profile of segments over the VD range (none across a flight plan discontinuity), with the
 *   MORA or MSA label above the plot, over the start of the profile (above the aircraft mock-up) and where the type
 *   changes.
 * - With STD, or when the highest safety altitude is not within the vertical scale: the type and value of the highest
 *   safety altitude along the VD range (thousands of feet, then the hundreds in small digits, QNH reference), in the upper
 *   part of the VD when the aircraft is below it, in the lower part otherwise.
 * SAFETY ALTS PARTLY DISPLAYED when a part of the VD range has no safety altitude value.
 */

export interface VdSafetyAltitudeInputs {
  segments: readonly VdSafetyAltitudeSegment[];
  vdRangeNm: number;
  /** [lower, upper] altitude of the vertical scale, ft */
  verticalRange: [number, number];
  /** STD barometric reference on this side */
  baroStd: boolean;
  aircraftAltitudeFt: number | null;
  plot: VdPlotArea;
}

export interface VdSafetyAltitudeLabel {
  x: number;
  /** 'end' for the label of the start of the plot, which stands left of the range origin */
  anchor: 'start' | 'end';
  text: string;
}

export interface VdHighestSafetyAltitude {
  /** Left edge of the indication */
  x: number;
  /** In the upper part of the VD (aircraft below the safety altitude), else in the lower part */
  upper: boolean;
  thousands: string;
  hundreds: string;
  type: string;
}

export interface VdSafetyAltitudeDrawing {
  /** SVG path of the profile ('' when not shown) */
  profilePath: string;
  typeLabels: VdSafetyAltitudeLabel[];
  highest: VdHighestSafetyAltitude | null;
  partlyDisplayed: boolean;
}

/** Design choice: the highest safety altitude indication stays this far inside the plot */
const HIGHEST_MARGIN_LEFT = 6;
const HIGHEST_WIDTH = 50;

const NO_DRAWING: VdSafetyAltitudeDrawing = { profilePath: '', typeLabels: [], highest: null, partlyDisplayed: false };

/**
 * @param inputs the segments and the VD scales
 * @returns what the VD draws
 */
export function drawVdSafetyAltitudes(inputs: VdSafetyAltitudeInputs): VdSafetyAltitudeDrawing {
  const { vdRangeNm, verticalRange, plot } = inputs;
  const [lower, upper] = verticalRange;
  if (vdRangeNm <= 0 || upper <= lower) {
    return NO_DRAWING;
  }
  const inRange = inputs.segments
    .filter((s) => s.startNm < vdRangeNm && s.endNm > 0)
    .map((s) => ({ ...s, startNm: Math.max(0, s.startNm), endNm: Math.min(vdRangeNm, s.endNm) }));
  const partlyDisplayed = inRange.some((s) => s.altitudeFt === null);
  const valid = inRange.filter((s) => s.altitudeFt !== null) as (VdSafetyAltitudeSegment & { altitudeFt: number })[];
  if (valid.length === 0) {
    return { ...NO_DRAWING, partlyDisplayed };
  }

  const x = (nm: number) => plot.left + (nm / vdRangeNm) * plot.width;
  const y = (ft: number) => plot.top + ((upper - ft) / (upper - lower)) * plot.height;
  const isWithinScale = (ft: number) => ft >= lower && ft <= upper;
  const highestSegment = valid.reduce((a, b) => (b.altitudeFt > a.altitudeFt ? b : a));
  const showProfile = !inputs.baroStd && valid.some((s) => isWithinScale(s.altitudeFt));

  const highest: VdHighestSafetyAltitude | null =
    showProfile && isWithinScale(highestSegment.altitudeFt)
      ? null
      : {
          x: Math.min(
            Math.max(x(highestSegment.startNm), plot.left + HIGHEST_MARGIN_LEFT),
            plot.left + plot.width - HIGHEST_WIDTH,
          ),
          upper: inputs.aircraftAltitudeFt !== null && inputs.aircraftAltitudeFt < highestSegment.altitudeFt,
          thousands: Math.floor(highestSegment.altitudeFt / 1000).toFixed(0),
          hundreds: Math.floor((highestSegment.altitudeFt % 1000) / 100).toFixed(0),
          type: highestSegment.type,
        };

  if (!showProfile) {
    return { profilePath: '', typeLabels: [], highest, partlyDisplayed };
  }

  let path = '';
  const typeLabels: VdSafetyAltitudeLabel[] = [];
  let previous: (typeof valid)[number] | null = null;
  for (const segment of valid) {
    const segmentY = y(segment.altitudeFt);
    if (previous !== null && previous.endNm === segment.startNm) {
      path += ` V ${segmentY.toFixed(1)}`;
    } else {
      path += `${path ? ' ' : ''}M ${x(segment.startNm).toFixed(1)} ${segmentY.toFixed(1)}`;
    }
    path += ` H ${x(segment.endNm).toFixed(1)}`;

    if (previous === null || previous.type !== segment.type) {
      typeLabels.push({ x: x(segment.startNm), anchor: segment.startNm === 0 ? 'end' : 'start', text: segment.type });
    }
    previous = segment;
  }

  return { profilePath: path, typeLabels, highest, partlyDisplayed };
}
