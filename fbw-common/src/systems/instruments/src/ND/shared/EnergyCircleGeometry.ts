// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EfisNdMode, MathUtils } from '@flybywiresim/fbw-sdk';

/** Design choice: the arc spans this much on each side of the track line, as drawn on the real ND */
const ARC_HALF_ANGLE_DEGREES = 40;

export const ENERGY_CIRCLE_MAP_CENTRE = 384;

export interface EnergyCircleGeometry {
  centreY: number;
  radiusPx: number;
}

/**
 * Where the energy circle is drawn, or null when it is not: in the ARC and ROSE NAV modes only, and within the range of
 * the map.
 * @param ndMode the ND mode
 * @param distanceNm the energy circle radius from the FMS, NM, 0 without an energy circle
 * @param mapPixelRadius the pixel radius of the map
 * @param mapRangeRadius the range of that pixel radius, NM
 * @param mapCentreYBias the offset of the aircraft below the centre of the display, px
 */
export function energyCircleGeometry(
  ndMode: EfisNdMode,
  distanceNm: number,
  mapPixelRadius: number,
  mapRangeRadius: number,
  mapCentreYBias: number,
): EnergyCircleGeometry | null {
  if (ndMode !== EfisNdMode.ARC && ndMode !== EfisNdMode.ROSE_NAV) {
    return null;
  }
  if (!(distanceNm > 0) || !(mapRangeRadius > 0) || !(mapPixelRadius > 0) || distanceNm > mapRangeRadius) {
    return null;
  }
  return {
    centreY: ENERGY_CIRCLE_MAP_CENTRE + mapCentreYBias,
    radiusPx: (distanceNm * mapPixelRadius) / mapRangeRadius,
  };
}

/** The SVG path of the arc, centred on the track line pointing up */
export function energyCircleArcPath({ centreY, radiusPx }: EnergyCircleGeometry): string {
  const halfAngle = ARC_HALF_ANGLE_DEGREES * MathUtils.DEGREES_TO_RADIANS;
  const dx = radiusPx * Math.sin(halfAngle);
  const y = centreY - radiusPx * Math.cos(halfAngle);
  return `M${ENERGY_CIRCLE_MAP_CENTRE - dx},${y} A${radiusPx},${radiusPx} 0 0 1 ${ENERGY_CIRCLE_MAP_CENTRE + dx},${y}`;
}
