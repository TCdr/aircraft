// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AtsuMessageNetwork } from '@datalink/common';
import {
  REPORT_FORM_URLS,
  ReportField,
  ReportFieldKind,
  ReportPrefillData,
  checkReport,
  durationBetween,
  entryBoxWidth,
  hhmmOf,
  prefilledEntries,
  reportFieldValue,
  reportFormForUrl,
  weightEntryOf,
} from './CompanyComReportForms';

const NO_DATA: ReportPrefillData = {
  flightNumber: null,
  origin: null,
  destination: null,
  outTime: null,
  offTime: null,
  onTime: null,
  inTime: null,
  fuelOnBoard: null,
  outFuel: null,
  inFuel: null,
  airspeed: null,
};

/**
 * @param url the page URL
 * @returns the form of the page, failing the test without one
 */
function formAt(url: string) {
  const form = reportFormForUrl(url);
  if (!form) {
    throw new Error(`no form at ${url}`);
  }
  return form;
}

/**
 * @param kind the field kind
 * @param length the maximum characters
 * @returns a field of that kind
 */
function field(kind: ReportFieldKind, length = 24): ReportField {
  return { id: 'f', label: 'F', kind, length };
}

describe('COMPANY COM report forms: pages', () => {
  it('has a form for each report and request of the menu, NOTAM excluded', () => {
    expect(REPORT_FORM_URLS).toEqual([
      'nss-avncs/company-com/pre-flight/init-data',
      'nss-avncs/company-com/pre-flight/fuel-figures',
      'nss-avncs/company-com/pre-flight/refuelling',
      'nss-avncs/company-com/pre-flight/loadsheet-acceptance',
      'nss-avncs/company-com/pre-flight/departure-delay',
      'nss-avncs/company-com/pre-flight/take-off-delay',
      'nss-avncs/company-com/pre-flight/delay-code',
      'nss-avncs/company-com/pre-flight/asr-notification',
      'nss-avncs/company-com/in-flight/ramp-service',
      'nss-avncs/company-com/in-flight/diversion',
      'nss-avncs/company-com/in-flight/eta',
      'nss-avncs/company-com/in-flight/flight-delay',
      'nss-avncs/company-com/in-flight/flight-parameters',
      'nss-avncs/company-com/post-flight/asr-notification',
      'nss-avncs/company-com/post-flight/flight-summary',
      'nss-avncs/company-com/post-flight/gate-delay',
    ]);
    expect(reportFormForUrl('nss-avncs/company-com/pre-flight/notam')).toBeNull();
    expect(reportFormForUrl('nss-avncs/company-com/pre-flight/free-text')).toBeNull();
  });

  it('starts every form with the flight number, and gives unique field ids', () => {
    for (const url of REPORT_FORM_URLS) {
      const form = formAt(url);
      expect(form.fields[0].label).toBe('FLT NBR');
      const ids = form.fields.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('COMPANY COM report forms: entries', () => {
  it('takes HHMM UTC times only', () => {
    expect(reportFieldValue(field(ReportFieldKind.Time, 4), '0930', 'KG')).toBe('0930');
    expect(reportFieldValue(field(ReportFieldKind.Time, 4), '2359', 'KG')).toBe('2359');
    expect(reportFieldValue(field(ReportFieldKind.Time, 4), '2400', 'KG')).toBeUndefined();
    expect(reportFieldValue(field(ReportFieldKind.Time, 4), '1260', 'KG')).toBeUndefined();
    expect(reportFieldValue(field(ReportFieldKind.Time, 4), '930', 'KG')).toBeUndefined();
  });

  it('gives weights in the unit of the aircraft, whole numbers only', () => {
    expect(reportFieldValue(field(ReportFieldKind.Weight, 7), '0123400', 'KG')).toBe('123400 KG');
    expect(reportFieldValue(field(ReportFieldKind.Weight, 7), '272000', 'LB')).toBe('272000 LB');
    expect(reportFieldValue(field(ReportFieldKind.Weight, 7), '12.5', 'KG')).toBeUndefined();
    expect(reportFieldValue(field(ReportFieldKind.Weight, 7), '-5', 'KG')).toBeUndefined();
  });

  it('takes four-letter airports, two-digit delay codes, minutes and counts', () => {
    expect(reportFieldValue(field(ReportFieldKind.Airport, 4), 'lfpg', 'KG')).toBe('LFPG');
    expect(reportFieldValue(field(ReportFieldKind.Airport, 4), 'LF1G', 'KG')).toBeUndefined();
    expect(reportFieldValue(field(ReportFieldKind.DelayCode, 2), '93', 'KG')).toBe('93');
    expect(reportFieldValue(field(ReportFieldKind.DelayCode, 2), '9', 'KG')).toBeUndefined();
    expect(reportFieldValue(field(ReportFieldKind.Minutes, 3), '045', 'KG')).toBe('45 MIN');
    expect(reportFieldValue(field(ReportFieldKind.Count, 2), '03', 'KG')).toBe('3');
    expect(reportFieldValue(field(ReportFieldKind.Count, 2), 'AB', 'KG')).toBeUndefined();
  });

  it('upper-cases texts, refuses too long entries and treats blanks as empty', () => {
    expect(reportFieldValue(field(ReportFieldKind.Text, 8), ' gate b12 ', 'KG')).toBe('GATE B12');
    expect(reportFieldValue(field(ReportFieldKind.Text, 4), 'TOO LONG', 'KG')).toBeUndefined();
    expect(reportFieldValue(field(ReportFieldKind.Text, 4), '  ', 'KG')).toBeNull();
    expect(reportFieldValue(field(ReportFieldKind.Text, 4), null, 'KG')).toBeNull();
  });

  it('works out durations, past midnight too', () => {
    expect(durationBetween('0930', '1215')).toBe('2:45');
    expect(durationBetween('2340', '0105')).toBe('1:25');
    expect(durationBetween('1000', '1000')).toBe('0:00');
  });
});

describe('COMPANY COM report forms: pre-fill', () => {
  const data: ReportPrefillData = {
    flightNumber: 'AFR006',
    origin: 'LFPG',
    destination: 'KJFK',
    outTime: Date.UTC(2026, 9, 17, 9, 5),
    offTime: Date.UTC(2026, 9, 17, 9, 25),
    onTime: Date.UTC(2026, 9, 17, 17, 40),
    inTime: Date.UTC(2026, 9, 17, 17, 52),
    fuelOnBoard: 123_456.4,
    outFuel: 150_000,
    inFuel: 20_000,
    airspeed: 279.6,
  };

  it('formats the times HHMM UTC and the weights in the unit of the aircraft', () => {
    expect(hhmmOf(Date.UTC(2026, 0, 1, 7, 3))).toBe('0703');
    expect(hhmmOf(null)).toBeNull();
    expect(weightEntryOf(1000, 'KG')).toBe('1000');
    expect(weightEntryOf(1000, 'LB')).toBe('2205');
    expect(weightEntryOf(null, 'KG')).toBeNull();
  });

  it('fills the flight summary from the flight log and the FMS', () => {
    const entries = prefilledEntries(formAt('nss-avncs/company-com/post-flight/flight-summary'), data, 'KG');
    expect(entries).toEqual({
      flightNumber: 'AFR006',
      origin: 'LFPG',
      destination: 'KJFK',
      out: '0905',
      off: '0925',
      on: '1740',
      in: '1752',
      fuelOut: '150000',
      fuelIn: '20000',
      remarks: null,
    });
  });

  it('fills the fuel figures with the fuel on board, and leaves the fields without data empty', () => {
    const entries = prefilledEntries(formAt('nss-avncs/company-com/pre-flight/fuel-figures'), data, 'KG');
    expect(entries.blockFuel).toBe('123456');
    expect(entries.tripFuel).toBeNull();
    expect(prefilledEntries(formAt('nss-avncs/company-com/pre-flight/fuel-figures'), NO_DATA, 'KG')).toEqual({
      flightNumber: null,
      origin: null,
      destination: null,
      blockFuel: null,
      tripFuel: null,
      taxiFuel: null,
      remarks: null,
    });
  });

  it('leaves out a flight number too long for the field', () => {
    const entries = prefilledEntries(
      formAt('nss-avncs/company-com/pre-flight/init-data'),
      { ...data, flightNumber: 'ABCDEFGHIJ' },
      'KG',
    );
    expect(entries.flightNumber).toBeNull();
  });
});

describe('COMPANY COM report forms: messages', () => {
  it('builds the INIT DATA request as a Hoppie free text to the station', () => {
    const check = checkReport(
      formAt('nss-avncs/company-com/pre-flight/init-data'),
      'afrops',
      { flightNumber: 'AFR006', origin: 'LFPG', destination: 'KJFK' },
      'KG',
    );
    expect(check.message?.Station).toBe('AFROPS');
    expect(check.message?.Network).toBe(AtsuMessageNetwork.Hoppie);
    expect(check.message?.Message).toBe('INIT DATA REQUEST\nFLT NBR AFR006\nFROM LFPG\nDEST KJFK');
  });

  it('leaves out the empty optional fields', () => {
    const check = checkReport(
      formAt('nss-avncs/company-com/in-flight/eta'),
      'AFROPS',
      { flightNumber: 'AFR006', destination: 'KJFK', eta: '1745' },
      'KG',
    );
    expect(check.message?.Message).toBe('ETA\nFLT NBR AFR006\nDEST KJFK\nETA 1745');
  });

  it('works out the flight delay from the scheduled and the new arrival time', () => {
    const check = checkReport(
      formAt('nss-avncs/company-com/in-flight/flight-delay'),
      'AFROPS',
      { flightNumber: 'AFR006', scheduledArrival: '1745', newEta: '1830', delayCode: '81' },
      'KG',
    );
    expect(check.message?.Message).toBe(
      'FLIGHT DELAY\nFLT NBR AFR006\nSTA 1745\nNEW ETA 1830\nDELAY CODE 81\nDELAY 0:45',
    );
    expect(
      checkReport(formAt('nss-avncs/company-com/in-flight/flight-delay'), 'AFROPS', { flightNumber: 'AFR006' }, 'KG')
        .invalidLabels,
    ).toEqual(['NEW ETA', 'DELAY CODE']);
  });

  it('pre-fills the flight parameters with the fuel and the airspeed, and needs the flight level', () => {
    const form = formAt('nss-avncs/company-com/in-flight/flight-parameters');
    const entries = prefilledEntries(
      form,
      { ...NO_DATA, flightNumber: 'AFR006', fuelOnBoard: 100_000, airspeed: 279.6 },
      'KG',
    );
    expect(entries.fuelOnBoard).toBe('100000');
    expect(entries.airspeed).toBe('280');
    const check = checkReport(form, 'AFROPS', { ...entries, flightLevel: '380', mach: '.85' }, 'KG');
    expect(check.message?.Message).toBe(
      'FLIGHT PARAMETERS\nFLT NBR AFR006\nFL 380\nMACH .85\nCAS KT 280\nFOB 100000 KG',
    );
    expect(checkReport(form, 'AFROPS', entries, 'KG').invalidLabels).toEqual(['FL']);
  });

  it('names the invalid and the empty required fields, and sends nothing then', () => {
    const check = checkReport(
      formAt('nss-avncs/company-com/in-flight/diversion'),
      'AFROPS',
      { flightNumber: 'AFR006', eta: '2575' },
      'KG',
    );
    expect(check.message).toBeNull();
    expect(check.invalidLabels).toEqual(['DIVERT TO', 'ETA', 'REASON']);
    expect(check.missingStation).toBe(false);
  });

  it('needs a station', () => {
    const check = checkReport(
      formAt('nss-avncs/company-com/pre-flight/init-data'),
      ' ',
      { flightNumber: 'AFR006' },
      'KG',
    );
    expect(check.message).toBeNull();
    expect(check.missingStation).toBe(true);
    expect(check.invalidLabels).toEqual([]);
  });

  it('adds the block time, flight time and fuel used to the flight summary', () => {
    const check = checkReport(
      formAt('nss-avncs/company-com/post-flight/flight-summary'),
      'AFROPS',
      {
        flightNumber: 'AFR006',
        out: '0905',
        off: '0925',
        on: '1740',
        in: '1752',
        fuelOut: '150000',
        fuelIn: '20000',
      },
      'KG',
    );
    expect(check.message?.Message.split('\n')).toEqual([
      'FLIGHT SUMMARY',
      'FLT NBR AFR006',
      'OUT 0905',
      'OFF 0925',
      'ON 1740',
      'IN 1752',
      'FOB OUT 150000 KG',
      'FOB IN 20000 KG',
      'BLOCK TIME 8:47',
      'FLIGHT TIME 8:15',
      'FUEL USED 130000 KG',
    ]);
  });

  it('adds the uplift to the refuelling report and the delay to the departure delay', () => {
    const refuelling = checkReport(
      formAt('nss-avncs/company-com/pre-flight/refuelling'),
      'AFROPS',
      { flightNumber: 'AFR006', fuelBefore: '20000', fuelAfter: '150000' },
      'LB',
    );
    expect(refuelling.message?.Message.split('\n').slice(-1)).toEqual(['UPLIFT 130000 LB']);

    const delay = checkReport(
      formAt('nss-avncs/company-com/pre-flight/departure-delay'),
      'AFROPS',
      { flightNumber: 'AFR006', scheduled: '0900', newDeparture: '0945', delayCode: '93' },
      'KG',
    );
    expect(delay.message?.Message.split('\n')).toEqual([
      'DEPARTURE DELAY',
      'FLT NBR AFR006',
      'STD 0900',
      'NEW ETD 0945',
      'DELAY CODE 93',
      'DELAY 0:45',
    ]);
  });
});

describe('COMPANY COM report forms: boxes', () => {
  it('makes a mandatory box wide enough for its empty-box placeholders', () => {
    // The empty-box glyph is 26 px wide in the laptop font: eight of them need more than the 200 px of a short box
    expect(entryBoxWidth(8, true, 200)).toBeGreaterThanOrEqual(8 * 26 + 20);
    expect(entryBoxWidth(8, true, 220)).toBeGreaterThanOrEqual(8 * 26 + 20);
  });

  it('keeps the usual width where the entry fits', () => {
    expect(entryBoxWidth(2, true, 200)).toBe(200);
    expect(entryBoxWidth(10, false, 200)).toBe(200);
  });
});
