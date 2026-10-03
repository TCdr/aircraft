// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatStatusPage } from '@shared/StatusMessages';
import {
  CondStatusCodes as C,
  StatusLines,
  cabFansFaultStatus,
  condCtlLaneFaultStatus,
  ductOvhtStatus,
  hotAirFaultStatus,
  lavGalleyFanFaultStatus,
  pack1And2FaultStatus,
  packFaultStatus,
  packOffStatus,
} from './CondStatus';

/** The FWC text control codes: colours (ESC<n m), underline on (ESC 4m) and off (ESC m) */
const CONTROL_CODES = new RegExp(`${String.fromCharCode(27)}(?:<\\d|4)?m`, 'g');

/** The page as the crew reads it, without the colour codes */
const page = (lines: StatusLines) => {
  const texts = formatStatusPage(lines.left, lines.inopSys);
  const plain = (s: string) => s.replace(CONTROL_CODES, '');
  return { left: plain(texts.left).split('\r'), right: plain(texts.right).split('\r') };
};

describe('A320 air conditioning STATUS lines (FCOM PRO-ABN-AIR, PRO-ABN-COND)', () => {
  it('PACK 1(2) FAULT: the pack, plus its zones at fixed temperature and its controller when the ACSC is lost', () => {
    expect(page(packFaultStatus(1, false))).toEqual({ left: [''], right: ['INOP SYS', 'PACK 1'] });
    expect(page(packFaultStatus(1, true))).toEqual({
      left: ['CKPT AT FIXED TEMP'],
      right: ['INOP SYS', 'PACK 1', 'COND CTL 1'],
    });
    expect(page(packFaultStatus(2, true))).toEqual({
      left: ['CAB AT FIXED TEMP'],
      right: ['INOP SYS', 'PACK 2', 'COND CTL 2'],
    });
  });

  it('PACK 1+2 FAULT: MAX FL 100/MEA-MORA first (limitation), then the fixed temperatures', () => {
    expect(page(pack1And2FaultStatus())).toEqual({
      left: ['MAX FL.....100/MEA-MORA', 'CKPT AT FIXED TEMP', 'CAB AT FIXED TEMP'],
      right: ['INOP SYS', 'PACK 1+2', 'COND CTL 1', 'COND CTL 2'],
    });
  });

  it('shows the MAX FL limitation in blue and the information in green', () => {
    const texts = formatStatusPage(pack1And2FaultStatus().left, []);
    expect(texts.left.split('\r')[0]).toBe('\x1b<5mMAX FL.....100/MEA-MORA');
    expect(texts.left.split('\r')[1]).toBe('\x1b<3mCKPT AT FIXED TEMP');
  });

  it('PACK OFF, COND CTL lane, L+R CAB FAN: the system inoperative', () => {
    expect(page(packOffStatus(2)).right).toEqual(['INOP SYS', 'PACK 2']);
    expect(page(condCtlLaneFaultStatus(2, 'B')).right).toEqual(['INOP SYS', 'COND CTL 2-B']);
    expect(page(cabFansFaultStatus()).right).toEqual(['INOP SYS', 'L+R CAB FAN']);
  });

  it('DUCT OVHT not recovered: regulation by the packs only, HOT AIR inoperative', () => {
    expect(page(ductOvhtStatus())).toEqual({ left: ['CAB TEMP BY PACK ONLY'], right: ['INOP SYS', 'HOT AIR'] });
  });

  it('LAV + GALLEY FAN FAULT depends on ACSC 2', () => {
    expect(page(lavGalleyFanFaultStatus(false))).toEqual({
      left: ['CAB TEMP CKPT CTL ONLY'],
      right: ['INOP SYS', 'GALLEY FAN'],
    });
    expect(page(lavGalleyFanFaultStatus(true))).toEqual({
      left: ['CAB AT FIXED TEMP'],
      right: ['INOP SYS', 'PACK 2', 'COND CTL 2', 'GALLEY FAN'],
    });
  });

  it('HOT AIR FAULT: packs-only regulation while only the hot air is closed, PACK 1+2 once the packs are off', () => {
    expect(page(hotAirFaultStatus(true, false))).toEqual({
      left: ['CAB TEMP BY PACK ONLY'],
      right: ['INOP SYS', 'HOT AIR'],
    });
    expect(page(hotAirFaultStatus(false, true))).toEqual({ left: [''], right: ['INOP SYS', 'PACK 1+2', 'HOT AIR'] });
  });

  it('merges the lines of several alerts without duplicates', () => {
    const lines = [ductOvhtStatus(), hotAirFaultStatus(true, false)];
    expect(page({ left: lines.flatMap((l) => l.left), inopSys: lines.flatMap((l) => l.inopSys) })).toEqual({
      left: ['CAB TEMP BY PACK ONLY'],
      right: ['INOP SYS', 'HOT AIR'],
    });
    expect(C.hotAir).toBe('210300010');
  });
});
