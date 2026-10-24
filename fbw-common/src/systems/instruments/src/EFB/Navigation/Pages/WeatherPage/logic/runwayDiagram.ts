// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Runway } from '../../../../Performance/Data/Runways';

/** The smallest full scale of the component bars, so a light wind does not fill them */
const MIN_SCALE_KT = 20;

/** The runway end facing most into the wind; the first one for a calm or variable wind; null without runways */
export const favouredRunwayEnd = (runways: Runway[], windDirDeg: number | null): Runway | null => {
  if (runways.length === 0) {
    return null;
  }
  if (windDirDeg === null) {
    return runways[0];
  }
  const headwindShare = (runway: Runway) => Math.cos(((windDirDeg - runway.bearing) * Math.PI) / 180);
  return runways.reduce((best, runway) => (headwindShare(runway) > headwindShare(best) ? runway : best));
};

/** Full scale of the component bars: the gust (or the wind) with some room, in steps of 10 kt */
export const componentScaleKt = (speedKt: number, gustKt: number | null): number =>
  Math.max(MIN_SCALE_KT, Math.ceil(((gustKt ?? speedKt) * 1.2) / 10) * 10);

/** The highest runway end: the field elevation as the facility data gives it; null without runways */
export const fieldElevationFt = (runways: Runway[]): number | null =>
  runways.length > 0 ? Math.round(runways.reduce((max, runway) => Math.max(max, runway.elevation), -Infinity)) : null;
