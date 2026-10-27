// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { aheadMessageText, flashRestartsOn, terrainSettingMessage } from './TerrainAlertMessage';
import { TerrainAheadAlert } from './types/GenericTawsEvents';

// The ND messages of the A320 look-ahead terrain alerts: TERR AHEAD, and TERR: CHANGE MODE / TERR: REDUCE RANGE when the
// terrain cannot be seen on this ND
describe('terrain ND setting message', () => {
  it('none without an alert', () => {
    expect(terrainSettingMessage(TerrainAheadAlert.None, true, 320)).toBeUndefined();
  });

  it('none when the terrain can be seen', () => {
    expect(terrainSettingMessage(TerrainAheadAlert.Warning, false, 40)).toBeUndefined();
    expect(terrainSettingMessage(TerrainAheadAlert.Caution, false, 80)).toBeUndefined();
  });

  it('TERR: CHANGE MODE in PLAN mode, red for a warning, amber for a caution', () => {
    expect(terrainSettingMessage(TerrainAheadAlert.Warning, true, 10)).toEqual({
      text: 'TERR: CHANGE MODE',
      isWarning: true,
    });
    expect(terrainSettingMessage(TerrainAheadAlert.Caution, true, 10)).toEqual({
      text: 'TERR: CHANGE MODE',
      isWarning: false,
    });
  });

  it('TERR: REDUCE RANGE at 160 and 320 NM', () => {
    expect(terrainSettingMessage(TerrainAheadAlert.Caution, false, 160)).toEqual({
      text: 'TERR: REDUCE RANGE',
      isWarning: false,
    });
    expect(terrainSettingMessage(TerrainAheadAlert.Warning, false, 320)?.text).toBe('TERR: REDUCE RANGE');
  });

  it('TERR: CHANGE MODE wins over the range in PLAN mode', () => {
    expect(terrainSettingMessage(TerrainAheadAlert.Warning, true, 320)?.text).toBe('TERR: CHANGE MODE');
  });
});

// TERR AHEAD flashes for 9 s each time it is triggered: when it appears, and again when a caution becomes a warning
describe('TERR AHEAD flashing', () => {
  it('starts when the message appears', () => {
    expect(flashRestartsOn(TerrainAheadAlert.None, TerrainAheadAlert.Caution)).toBe(true);
    expect(flashRestartsOn(TerrainAheadAlert.None, TerrainAheadAlert.Warning)).toBe(true);
  });

  it('starts again when the caution becomes a warning', () => {
    expect(flashRestartsOn(TerrainAheadAlert.Caution, TerrainAheadAlert.Warning)).toBe(true);
  });

  it('does not start when the warning goes back to a caution or the alert ends', () => {
    expect(flashRestartsOn(TerrainAheadAlert.Warning, TerrainAheadAlert.Caution)).toBe(false);
    expect(flashRestartsOn(TerrainAheadAlert.Warning, TerrainAheadAlert.None)).toBe(false);
  });

  it('starts again when the message changes between terrain and obstacle', () => {
    expect(flashRestartsOn(TerrainAheadAlert.Caution, TerrainAheadAlert.Caution, false, true)).toBe(true);
    expect(flashRestartsOn(TerrainAheadAlert.Warning, TerrainAheadAlert.Warning, true, false)).toBe(true);
  });

  it('does not start again while the same obstacle alert goes on', () => {
    expect(flashRestartsOn(TerrainAheadAlert.Caution, TerrainAheadAlert.Caution, true, true)).toBe(false);
  });

  it('does not start when the alert ends, whatever it was about', () => {
    expect(flashRestartsOn(TerrainAheadAlert.Caution, TerrainAheadAlert.None, true, false)).toBe(false);
  });
});

// OBST AHEAD takes the place of TERR AHEAD when the alert is about an obstacle
describe('terrain or obstacle ahead message', () => {
  it('TERR AHEAD for terrain', () => {
    expect(aheadMessageText(false)).toBe('TERR AHEAD');
  });

  it('OBST AHEAD for an obstacle', () => {
    expect(aheadMessageText(true)).toBe('OBST AHEAD');
  });
});
