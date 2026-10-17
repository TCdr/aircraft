// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { coordinateToString } from '@flybywiresim/fbw-sdk';
import { Coordinates, distanceTo } from 'msfs-geo';

export const NO_POSITION_TEXT = '--°--.--/---°--.--';

/** What the POSITION MONITOR page shows, read once (the POSITION FROZEN page keeps a copy) */
export interface PositionMonitorReading {
  /** The FM positions of FMGC 1 and 2, null without an inertial position */
  fm1: Coordinates | null;
  fm2: Coordinates | null;
  /** The navigation mode text of the FM positions ("3 IRS/GPS"...), empty without one */
  modeText: string;
  /** The GPIRS position the onside FMGC selects, null when none is valid or the GPS is deselected */
  gpirs: Coordinates | null;
  /** The radio position of the onside FMGC, null outside the radio navigation modes */
  radio: Coordinates | null;
  /** The MIX IRS position of the onside FMGC (or the single IRS position it uses) */
  mixIrs: Coordinates | null;
  /** The positions of IRS 1, 2 and 3, null when not valid */
  irPositions: readonly (Coordinates | null)[];
  /** The modes of IRS 1, 2 and 3: NAV, ALIGN, ATT or INVAL */
  irModes: readonly string[];
  /** The onside FMGC: 1 on the CAPT MCDU, 2 on the F/O MCDU */
  onSide: 1 | 2;
}

/**
 * The IRS mode shown on the POSITION MONITOR page: INVAL, ALIGN, NAV or ATT.
 * @param stateMessage the IRS state of the IRS MONITOR page (CDUIRSMonitor.getAdiruStateMessage)
 */
export function irsModeText(stateMessage: string): string {
  if (stateMessage.startsWith('ALIGN')) {
    return 'ALIGN';
  }
  if (stateMessage === 'NAV' || stateMessage === 'ATT') {
    return stateMessage;
  }
  return 'INVAL';
}

function positionCell(position: Coordinates | null): string {
  return position !== null ? `${coordinateToString(position, false)}[color]green` : `${NO_POSITION_TEXT}[color]white`;
}

/**
 * The lines 1 to 10 (after the title line) of the POSITION MONITOR and POSITION FROZEN pages:
 * - Line 1 FMGC 1 and Line 2 FMGC 2: the position in green and the navigation method of that FMGC in white
 *   (e.g. 3 IRS/DME/DME)
 * - Line 3 RADIO, GPS or GPIRS: the position the onside FMGC computes from the selected navaids or the GPIRS
 * - Line 4 MIX IRS: the weighted mean IRS position the onside FMGC computes
 * - Line 5 IRS 1,2,3: the deviation in NM of each IRS position from the onside FMGC position, and the IRS mode
 *   (INVAL, ALIGN, NAV or ATT)
 * @param reading the data
 * @returns the template lines 1 to 10
 */
export function positionMonitorLines(reading: PositionMonitorReading): string[][] {
  const onsideFm = reading.onSide === 1 ? reading.fm1 : reading.fm2;
  const irsCell = (index: number): string => {
    const mode = reading.irModes[index];
    const position = reading.irPositions[index];
    const deviation =
      mode === 'NAV' && position !== null && onsideFm !== null ? ` ${distanceTo(position, onsideFm).toFixed(1)}` : '';
    return `{small}${mode}${deviation}{end}[color]green`;
  };
  const sensorLabel = reading.gpirs !== null ? 'GPIRS' : 'RADIO';
  const sensor = reading.gpirs ?? reading.radio;
  const modeLine = (fm: Coordinates | null) => [fm !== null ? `\xa0\xa0\xa0\xa0\xa0\xa0${reading.modeText}` : ''];
  return [
    [''],
    ['{small}FMS1{end}', positionCell(reading.fm1)],
    modeLine(reading.fm1),
    ['{small}FMS2{end}', positionCell(reading.fm2)],
    modeLine(reading.fm2),
    [`{small}${sensorLabel}{end}`, positionCell(sensor)],
    [''],
    ['{small}MIX IRS{end}', positionCell(reading.mixIrs)],
    ['\xa0\xa0IRS1', 'IRS3\xa0', '\xa0IRS2'],
    [irsCell(0), irsCell(2), irsCell(1)],
  ];
}

/** A position entered in the PROG page POSITION UPDATE AT field, waiting for the confirmation */
export interface PendingPositionUpdate {
  /** The ident of the entered place, ENTRY for a latitude/longitude or place/bearing entry */
  ident: string;
  location: Coordinates;
}

/**
 * The POSITION UPDATE AT lines (label and data) of the PROG page [3L]: the entry field, then CONFIRM UPDATE AT with the
 * latitude/longitude and IDENT of the entered position and an asterisk, the update being confirmed with the right key.
 * The field is hidden in GPS PRIMARY. Design choice: the confirm prompt in amber, as the other MCDU confirm prompts.
 * @param gpsPrimary whether GPS PRIMARY is active
 * @param pending the entered position, null when none is entered
 * @returns the label line and the data line
 */
export function positionUpdateAtLines(
  gpsPrimary: boolean,
  pending: PendingPositionUpdate | null,
): [string[], string[]] {
  if (gpsPrimary) {
    return [[''], ['']];
  }
  if (pending === null) {
    return [['\xa0POSITION UPDATE AT'], ['{small}*{end}[\xa0\xa0\xa0\xa0][color]cyan']];
  }
  return [
    ['\xa0CONFIRM UPDATE AT[color]amber'],
    [`{amber}${coordinateToString(pending.location, false)}{end}`, `{amber}${pending.ident}*{end}`],
  ];
}
