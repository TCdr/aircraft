// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type CrosswindLimitKind = 'demonstrated' | 'recommended' | 'certified';

/** Dry-runway value flown in certification; it is not an operating limit */
const A32NX_DEMONSTRATED_CROSSWIND_KT = 38;
const A32NX_WET_CROSSWIND_KT = 29;
const A32NX_SNOW_CROSSWIND_KT = 25;
/** A METAR gives no contamination depth, so freezing precipitation takes the worst row of the table */
const A32NX_FREEZING_CROSSWIND_KT = 15;
/** The only A380 figure available is the certified maximum, gusts included */
const A380X_CERTIFIED_CROSSWIND_KT = 30;

const FREEZING_OR_ICE = /FZRA|FZDZ|PL|IC/;
const SNOW = /SN|SG/;
const WET = /RA|DZ/;

export const crosswindKt = (
  windDirDeg: number | null,
  windKt: number,
  gustKt: number | null,
  runwayHeadingDeg: number | null,
): number | null => {
  if (windDirDeg === null || runwayHeadingDeg === null || windKt <= 0) {
    return null;
  }
  const strongestKt = Math.max(windKt, gustKt ?? 0);
  const angleRad = ((windDirDeg - runwayHeadingDeg) * Math.PI) / 180;
  return Math.round(Math.abs(strongestKt * Math.sin(angleRad)));
};

export const crosswindLimit = (
  aircraft: 'a32nx' | 'a380x',
  presentWeather: string[],
): { limitKt: number; kind: CrosswindLimitKind } => {
  if (aircraft === 'a380x') {
    return { limitKt: A380X_CERTIFIED_CROSSWIND_KT, kind: 'certified' };
  }
  if (presentWeather.some((group) => FREEZING_OR_ICE.test(group))) {
    return { limitKt: A32NX_FREEZING_CROSSWIND_KT, kind: 'recommended' };
  }
  if (presentWeather.some((group) => SNOW.test(group))) {
    return { limitKt: A32NX_SNOW_CROSSWIND_KT, kind: 'recommended' };
  }
  if (presentWeather.some((group) => WET.test(group))) {
    return { limitKt: A32NX_WET_CROSSWIND_KT, kind: 'recommended' };
  }
  return { limitKt: A32NX_DEMONSTRATED_CROSSWIND_KT, kind: 'demonstrated' };
};

/** The side the wind blows from, seen along the runway; null for a variable wind or one straight along it */
export const crosswindSide = (windDirDeg: number | null, runwayHeadingDeg: number): 'left' | 'right' | null => {
  if (windDirDeg === null) {
    return null;
  }
  const across = Math.sin(((windDirDeg - runwayHeadingDeg) * Math.PI) / 180);
  if (Math.abs(across) < 1e-9) {
    return null;
  }
  return across > 0 ? 'right' : 'left';
};
