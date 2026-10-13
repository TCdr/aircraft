// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { VdPlotArea } from './VdWxrElevnTiltLine';

/**
 * The amber radio altitude zone of the Vertical Display, under the aircraft symbol.
 *
 * A380 FCOM DSC-31-20-40-10 (a380_fcom.txt l.69544-69548) and DSC-34-20-20-20 (l.89106-89108): "Indicates the real
 * location of the terrain. The zone elevation in amber is based on the measured radio-altimeter information. Appears
 * when the aircraft radio-altimeter altitude is below 5 000 ft."
 * The figure (FCOM PDF p. 2381, DSC-31-20-40-10 P 17/18) shows a narrow amber block centred on the dashed 0 NM line,
 * below the aircraft symbol, from the ground under the aircraft down to the bottom of the VD.
 *
 * Design choices (not in the FCOM): the ground elevation is the aircraft altitude of the VD scale minus the radio
 * height; the block is 18 px wide (about two thirds of the aircraft symbol, as in the figure); a ground below the
 * vertical scale shows nothing, a ground above it fills the plot height.
 */

/** "Appears when the aircraft radio-altimeter altitude is below 5 000 ft" (a380_fcom.txt l.69548) */
export const VD_RADIO_ALTITUDE_ZONE_MAX_HEIGHT_FEET = 5000;

/** Width of the amber block, in VD pixels */
export const VD_RADIO_ALTITUDE_ZONE_WIDTH = 18;

export interface VdRadioAltitudeZoneInputs {
  /** The aircraft altitude of the VD scale (the baro corrected altitude), feet; null when not valid */
  aircraftAltitudeFeet: number | null;
  /** The radio height (voted RA), feet; null when not valid */
  radioHeightFeet: number | null;
  /** The VD vertical scale [lower, upper], feet */
  verticalRange: [number, number];
  /** The VD plot area; its left edge is the aircraft position (0 NM) */
  plot: VdPlotArea;
}

export interface VdRadioAltitudeZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * @param inputs the aircraft altitude, the radio height and the VD scale
 * @returns the amber block in VD pixels, or null when it is not shown
 */
export function vdRadioAltitudeZone(inputs: VdRadioAltitudeZoneInputs): VdRadioAltitudeZoneRect | null {
  const { aircraftAltitudeFeet, radioHeightFeet, verticalRange, plot } = inputs;
  if (
    aircraftAltitudeFeet === null ||
    radioHeightFeet === null ||
    radioHeightFeet >= VD_RADIO_ALTITUDE_ZONE_MAX_HEIGHT_FEET ||
    verticalRange[1] <= verticalRange[0]
  ) {
    return null;
  }

  const groundElevationFeet = aircraftAltitudeFeet - Math.max(0, radioHeightFeet);
  const feetPerPixel = (verticalRange[1] - verticalRange[0]) / plot.height;
  const plotBottom = plot.top + plot.height;
  const groundY = plot.top + (verticalRange[1] - groundElevationFeet) / feetPerPixel;
  const top = Math.max(plot.top, groundY);
  if (top >= plotBottom) {
    return null;
  }

  return {
    x: plot.left - VD_RADIO_ALTITUDE_ZONE_WIDTH / 2,
    y: top,
    width: VD_RADIO_ALTITUDE_ZONE_WIDTH,
    height: plotBottom - top,
  };
}
