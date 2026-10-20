// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { formatHhmmss, TimeConstraint, TimeConstraintType } from '@fmgc/guidance/vnav/rta/TimeConstraint';

/** A time of the day on the RTA page: HH:MM:SS */
export function formatTimeOfDay(utcSeconds: number): string {
  return formatHhmmss(utcSeconds).replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3');
}

/** The RTA as displayed: "-" AT OR BEFORE, "+" AT OR AFTER, no sign for AT, then HH:MM:SS */
export function formatRta(rta: TimeConstraint): string {
  const sign = rta.type === TimeConstraintType.AtOrBefore ? '-' : rta.type === TimeConstraintType.AtOrAfter ? '+' : '';
  return sign + formatTimeOfDay(rta.utcSeconds);
}

/** Design choice: the RTA ERROR is shown as the signed time error ETA - RTA, in minutes and seconds */
export function formatRtaError(timeError: number): string {
  const magnitude = Math.min(99 * 60 + 59, Math.round(Math.abs(timeError)));
  const minutes = Math.floor(magnitude / 60);
  const seconds = magnitude % 60;
  return `${timeError >= 0 ? '+' : '-'}${minutes.toFixed(0).padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;
}
