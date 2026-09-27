// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  AtsuMessageDirection,
  CpdlcMessage,
  CpdlcMessagesDownlink,
  CpdlcMessagesUplink,
  PositionReportData,
} from '@datalink/common';

import {
  emptyPositionReport,
  isPositionReportComplete,
  latLongText,
  positionReportElements,
  positionReportFromFms,
} from './PositionReport';
import { applyModification, modifyLines } from './ModifyMessage';
import { addRequestFrame, createRequestFrame, requestElements } from './RequestFrames';
import { msgRecordText } from './MsgRecord';

const fmsData: PositionReportData = {
  flightState: {
    lat: 45.5,
    lon: -73.75,
    altitude: 32004,
    heading: 135.2,
    track: 132,
    indicatedAirspeed: 310,
    groundSpeed: 320,
    verticalSpeed: 20,
  },
  autopilot: { apActive: true, speed: 310, machMode: false, altitude: 36000 },
  environment: { windDirection: 270, windSpeed: 45, temperature: -40 },
  lastWaypoint: { ident: 'MIPAK', altitude: 32000, utc: 9 * 3600 + 46 * 60 },
  activeWaypoint: { ident: 'PUT', altitude: 32000, utc: 10 * 3600 + 22 * 60 },
  nextWaypoint: { ident: 'DALAN', altitude: 32000, utc: 10 * 3600 + 40 * 60 },
  destination: { ident: 'KJFK', altitude: 0, utc: 11 * 3600 + 33 * 60 },
};

describe('REPORT/AUTO & MANUAL POSITION', () => {
  it('completes the report with the FMS data, except ICING, TURBULENCE and ENDURANCE', () => {
    const current = {
      ...emptyPositionReport(),
      icing: 'TRACE',
      endurance: '4H30',
      freetext: ['HELLO', null] as [string | null, string | null],
    };
    const report = positionReportFromFms(fmsData, 10 * 3600 + 5 * 60, current);
    expect(report.ovhd).toBe('MIPAK');
    expect(report.ovhdUtc).toBe('0946Z');
    expect(report.ppos).toBe('4530.0N/07345.0W');
    expect(report.pposUtc).toBe('1005Z');
    expect(report.pposAlt).toBe('32000FT');
    expect(report.toUtc).toBe('1022Z');
    expect(report.heading).toBe('135T');
    expect(report.wind).toBe('270/45KT');
    expect(report.sat).toBe('-40C');
    expect(report.etaDest).toBe('1133Z');
    expect(report.climbing).toBe(true);
    expect(report.climbingValue).toBe('36000FT');
    expect(report.icing).toBe('');
    expect(report.endurance).toBeNull();
    expect(report.freetext).toEqual(['HELLO', null]);
    expect(isPositionReportComplete(report)).toBe(true);
    expect(isPositionReportComplete({ ...report, deviating: true })).toBe(false);

    const message = new CpdlcMessage();
    message.Content.push(...positionReportElements(report));
    expect(msgRecordText(message)).toContain('POSITION REPORT OVHD: MIPAK AT 0946Z/32000FT PPOS: 4530.0N/07345.0W');
    expect(msgRecordText(message)).toContain('CLIMBING TO: 36000FT');
    expect(msgRecordText(message)).toContain('HELLO');
  });

  it('writes the positions as DDMM.MB/EEEMM.MC', () => {
    expect(latLongText(-33.99, 151.2)).toBe('3359.4S/15112.0E');
  });
});

describe('REPORT/OTHER REPORTS', () => {
  it('composes a report of frames', () => {
    let result = addRequestFrame([], createRequestFrame('REACHING_BLOCK', { lower: 'FL340', upper: 'FL360' }));
    result = addRequestFrame(result.frames!, createRequestFrame('BACK_ON_ROUTE'));
    const message = new CpdlcMessage();
    message.Content.push(...requestElements(result.frames!));
    expect(msgRecordText(message)).toBe('REACHING BLOCK FL340 TO FL360 BACK ON ROUTE');
  });
});

describe('REPORT/MODIFY', () => {
  it('modifies the response prepared by the FMS', () => {
    const confirm = new CpdlcMessage();
    confirm.Direction = AtsuMessageDirection.Uplink;
    confirm.Content.push(CpdlcMessagesUplink.UM133[1].deepCopy());
    confirm.Response = new CpdlcMessage();
    const response = CpdlcMessagesDownlink.DM32[1].deepCopy();
    response.Content[0].Value = 'FL350';
    confirm.Response.Content.push(response);

    const lines = modifyLines(confirm);
    expect(lines).toEqual([['PRESENT ALTITUDE', { element: 0, content: 0, kind: 'altitude', value: 'FL350' }]]);

    const modified = applyModification(confirm, new Map([['0/0', 'FL340']]), 'CLIMBING');
    expect(modified.Response.Content[0].Content[0].Value).toBe('FL340');
    expect(modified.Response.Content[1].Content[0].Value).toBe('CLIMBING');
    expect(confirm.Response.Content[0].Content[0].Value).toBe('FL350');
  });
});
