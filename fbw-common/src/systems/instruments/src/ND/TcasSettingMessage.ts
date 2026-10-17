// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** TCAS advisory state, as written to L:A32NX_TCAS_STATE by the TCAS computer of both aircraft. */
export enum TcasAdvisoryState {
  None = 0,
  Ta = 1,
  Ra = 2,
}

/** A TCAS ND setting message: it asks the crew to change the ND mode or range to see the TA or RA intruder. */
export interface TcasSettingMessage {
  text: 'TCAS: CHANGE MODE' | 'TCAS: REDUCE RANGE' | 'TCAS: INCREASE RANGE';
  /** Red for an RA, amber for a TA. */
  isRa: boolean;
}

/** ND range value of the ZOOM position of the A380X range selector. */
export const ND_ZOOM_RANGE = -1;

/** Highest ND range, in NM, at which the TCAS intruders are displayed. */
export const MAX_TRAFFIC_RANGE_NM = 40;

/**
 * Whether the ND displays the TCAS traffic at the selected range. The A320 ND displays the traffic in ROSE and ARC
 * modes at 10, 20 or 40 NM, and asks for a lower range (TCAS: REDUCE RANGE) above 40 NM in any mode: no traffic above
 * 40 NM in ARC or ROSE.
 * @param rangeNm selected ND range in NM
 * @param maxRangeNm highest range with traffic, undefined for an aircraft that displays it at every range (A380X)
 * @returns true when the traffic is displayed
 */
export function isTrafficShownAtRange(rangeNm: number, maxRangeNm: number | undefined): boolean {
  return maxRangeNm === undefined || rangeNm <= maxRangeNm;
}

/**
 * The TCAS ND setting message, shown while the TCAS has a TA or an RA that the ND cannot display.
 * - A320: TCAS: REDUCE RANGE when a TA or RA is detected and the ND range is above 40 NM; TCAS: CHANGE MODE when a TA
 *   or RA is detected and the ND mode is PLAN; red or amber depending on the advisory level (RA or TA).
 * - A380: the same two messages, plus TCAS: INCREASE RANGE in ROSE-VOR or ROSE-LS mode with the range selector on ZOOM,
 * not on ground; with ZOOM the ND does not display TCAS: CHANGE MODE on ground.
 * @param advisory TCAS advisory state
 * @param isPlanMode the ND is in PLAN mode
 * @param isRoseVorOrLsMode the ND is in ROSE-VOR or ROSE-LS mode
 * @param rangeNm selected ND range in NM, ND_ZOOM_RANGE for ZOOM
 * @param onGround the aircraft is on ground
 * @returns the message, or undefined when there is none
 */
export function tcasSettingMessage(
  advisory: TcasAdvisoryState,
  isPlanMode: boolean,
  isRoseVorOrLsMode: boolean,
  rangeNm: number,
  onGround: boolean,
): TcasSettingMessage | undefined {
  if (advisory !== TcasAdvisoryState.Ta && advisory !== TcasAdvisoryState.Ra) {
    return undefined;
  }
  const isRa = advisory === TcasAdvisoryState.Ra;
  const isZoom = rangeNm === ND_ZOOM_RANGE;

  if (isPlanMode) {
    return isZoom && onGround ? undefined : { text: 'TCAS: CHANGE MODE', isRa };
  }
  if (isZoom) {
    return isRoseVorOrLsMode && !onGround ? { text: 'TCAS: INCREASE RANGE', isRa } : undefined;
  }
  if (rangeNm > MAX_TRAFFIC_RANGE_NM) {
    return { text: 'TCAS: REDUCE RANGE', isRa };
  }
  return undefined;
}
