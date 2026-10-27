// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { TerrainAheadAlert } from './types/GenericTawsEvents';

export interface TerrainSettingMessage {
  text: 'TERR: CHANGE MODE' | 'TERR: REDUCE RANGE';
  isWarning: boolean;
}

/** The two largest ND ranges, 160 and 320 NM, are too large to show the threat of an alert */
const REDUCE_RANGE_FROM_NM = 160;

/**
 * The message in the ND centre that asks the crew for a setting where the terrain of an alert can be seen: TERR: CHANGE
 * MODE in PLAN mode, which has no terrain picture, TERR: REDUCE RANGE at 160 and 320 NM.
 */
export function terrainSettingMessage(
  alert: TerrainAheadAlert,
  isPlanMode: boolean,
  rangeNm: number,
): TerrainSettingMessage | undefined {
  if (alert === TerrainAheadAlert.None) {
    return undefined;
  }
  const isWarning = alert === TerrainAheadAlert.Warning;
  if (isPlanMode) {
    return { text: 'TERR: CHANGE MODE', isWarning };
  }
  if (rangeNm >= REDUCE_RANGE_FROM_NM) {
    return { text: 'TERR: REDUCE RANGE', isWarning };
  }
  return undefined;
}

/**
 * TERR AHEAD / OBST AHEAD flashes each time it is triggered: a warning that follows a caution is a new trigger, and so is
 * the other message taking over while the alert goes on.
 */
export function flashRestartsOn(
  previous: TerrainAheadAlert,
  current: TerrainAheadAlert,
  previousIsObstacle = false,
  currentIsObstacle = false,
): boolean {
  const messageChanged = previous !== TerrainAheadAlert.None && previousIsObstacle !== currentIsObstacle;
  return current > previous || (current !== TerrainAheadAlert.None && messageChanged);
}

export function aheadMessageText(isObstacle: boolean): 'TERR AHEAD' | 'OBST AHEAD' {
  return isObstacle ? 'OBST AHEAD' : 'TERR AHEAD';
}
