// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { plainEcamText } from '@flybywiresim/fbw-sdk';
import { alertCodes, alertExists, alertProcedures, lineCodes } from './a32nxEwdMirror';

describe('A32NX EWD mirror', () => {
  it('lists every code of an alert, title first', () => {
    expect(alertCodes('2161202')).toEqual(['216120201', '216120202']);
  });

  it('knows which alerts exist', () => {
    expect(alertExists('2161202')).toBe(true);
    expect(alertExists('2169999')).toBe(false);
  });

  it('turns line values into codes and keeps empty lines empty', () => {
    expect(lineCodes([216120201, 0])).toEqual(['216120201', '']);
  });

  it('keeps the lines of the asked alert and names its title', () => {
    const procedures = alertProcedures(['2161202'], ['216120201', '216120202', '213122201'], false);
    expect(procedures).toHaveLength(1);
    const [procedure] = procedures;
    expect(procedure.ewdOrder).toBe(0);
    expect(procedure.lines).toHaveLength(1);
    expect(procedure.lines[0].state).toBe('pending');
    expect(plainEcamText(procedure.title.map((segment) => segment.text).join(''))).toContain('PACK 1 FAULT');
  });

  it('drops a line the warning system no longer shows', () => {
    const [procedure] = alertProcedures(['2161202'], ['216120201'], false);
    expect(procedure.lines).toHaveLength(0);
  });

  it('gives an alert that is not shown as a full reference', () => {
    const [procedure] = alertProcedures(['2161211'], ['216120201'], false);
    expect(procedure.ewdOrder).toBeUndefined();
    expect(procedure.lines.length).toBe(alertCodes('2161211').length - 1);
    expect(procedure.lines.every((line) => line.state === 'reference')).toBe(true);
  });

  it('flags an alert that continues past the last EWD line', () => {
    const [procedure] = alertProcedures(['2131221'], ['213122101', '213122107'], true);
    expect(procedure.continuesOnEwd).toBe(true);
    const [other] = alertProcedures(['2131221'], ['213122101', '213122107'], false);
    expect(other.continuesOnEwd).toBe(false);
  });

  it('says an absent alert may be below the EWD when the EWD overflows', () => {
    const [full] = alertProcedures(['2161211'], ['216120201'], true);
    expect(full.ewdOrder).toBeUndefined();
    expect(full.mayBeBelowEwd).toBe(true);
    const [notFull] = alertProcedures(['2161211'], ['216120201'], false);
    expect(notFull.mayBeBelowEwd).toBeFalsy();
  });

  it('skips an alert whose title code does not exist', () => {
    expect(alertProcedures(['2169999'], [], false)).toEqual([]);
  });
});
