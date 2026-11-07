// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { canEnterLsCourse } from '@fmgc/navigation/LandingSystemTuning';
import {
  adfBfoAction,
  adfBfoCell,
  classifyLsEntry,
  lsCourseCell,
  lsCourseTitle,
  lsFieldCell,
  LsTuning,
  showsLsSlope,
} from './NavRadioFields';

const noAdf = { frequency: null, bfo: false };
const adf = { frequency: 350, bfo: false };
const adfInBfo = { frequency: 350, bfo: true };

describe('MCDU RADIO NAV page ADF/BFO prompts', () => {
  it('shows no prompt without a tuned ADF', () => {
    expect(adfBfoCell(1, noAdf)).toBe('');
    expect(adfBfoCell(2, noAdf)).toBe('');
  });

  it('shows the ADF1/BFO and BFO/ADF2 prompts with their arrow for a tuned ADF', () => {
    expect(adfBfoCell(1, adf)).toBe('{ADF1/BFO[color]cyan');
    expect(adfBfoCell(2, adf)).toBe('BFO/ADF2}[color]cyan');
  });

  it('erases the arrow in BFO mode', () => {
    expect(adfBfoCell(1, adfInBfo)).toBe('ADF1/BFO[color]cyan');
    expect(adfBfoCell(2, adfInBfo)).toBe('BFO/ADF2[color]cyan');
  });

  it('activates the BFO with a key press, a clear action cancels it', () => {
    expect(adfBfoAction('', false, adf)).toBe('activate');
    expect(adfBfoAction('CLR', true, adfInBfo)).toBe('cancel');
  });

  it('refuses the key without a tuned ADF, with an entry, or a clear without BFO', () => {
    expect(adfBfoAction('', false, noAdf)).toBe('notAllowed');
    expect(adfBfoAction('350', false, adf)).toBe('notAllowed');
    expect(adfBfoAction('CLR', true, adf)).toBe('notAllowed');
  });
});

const ilsAuto: LsTuning = {
  manual: false,
  ident: 'IFRA',
  frequency: 110.3,
  facility: {} as LsTuning['facility'],
  course: 249,
  courseManual: false,
  backcourse: false,
  slope: -3,
  gls: undefined,
  glsEntry: undefined,
};

const glsAuto: LsTuning = {
  ...ilsAuto,
  ident: 'G25P',
  frequency: null,
  facility: undefined,
  gls: { channel: 31434, rpi: 'G25P', course: 249, slope: -3, definition: null },
};

const nothingTuned: LsTuning = {
  ...ilsAuto,
  ident: null,
  frequency: null,
  facility: undefined,
  course: null,
  slope: null,
};

describe('MCDU RADIO NAV page LS entry', () => {
  it('reads a 3 digit number with up to 2 decimals as a frequency', () => {
    expect(['108.10', '110.3', '111'].map(classifyLsEntry)).toEqual(['frequency', 'frequency', 'frequency']);
  });

  it('reads 5 digits as a GLS channel', () => {
    expect(['20001', '31434', '39999'].map(classifyLsEntry)).toEqual(['channel', 'channel', 'channel']);
  });

  it('reads 1 to 4 characters as an ident, a reference path identifier included', () => {
    expect(['IFRA', 'G25P', 'I'].map(classifyLsEntry)).toEqual(['ident', 'ident', 'ident']);
  });

  it('rejects the rest', () => {
    expect(['', '12345678', '10.8.1', 'ABCDE'].map(classifyLsEntry)).toEqual([
      'invalid',
      'invalid',
      'invalid',
      'invalid',
    ]);
  });
});

describe('MCDU RADIO NAV page LS field', () => {
  it('shows an empty field without a landing system', () => {
    expect(lsFieldCell(nothingTuned)).toBe('{cyan}[\xa0\xa0]{small}/{end}[\xa0\xa0\xa0\xa0]{end}');
  });

  it('shows the ident and frequency of an ILS the FMS selected in small font', () => {
    expect(lsFieldCell(ilsAuto)).toBe('{cyan}{small}IFRA{end}{small}/{end}{small}110.30{end}{end}');
  });

  it('shows an ILS the crew typed by frequency in large font', () => {
    expect(lsFieldCell({ ...ilsAuto, manual: true, ident: null, facility: undefined })).toBe(
      '{cyan}{big}[\xa0\xa0]{end}{big}/{end}{big}110.30{end}{end}',
    );
  });

  it('shows the reference path identifier and the channel of a GLS', () => {
    expect(lsFieldCell(glsAuto)).toBe('{cyan}{small}G25P{end}{small}/{end}{small}31434{end}{end}');
  });

  it('shows a channel the crew typed in large font and the identifier derived from it in small font', () => {
    expect(lsFieldCell({ ...glsAuto, manual: true, glsEntry: 'channel' })).toBe(
      '{cyan}{small}G25P{end}{big}/{end}{big}31434{end}{end}',
    );
  });

  it('shows an identifier the crew typed in large font and the channel derived from it in small font', () => {
    expect(lsFieldCell({ ...glsAuto, manual: true, glsEntry: 'ident' })).toBe(
      '{cyan}{big}G25P{end}{big}/{end}{small}31434{end}{end}',
    );
  });

  it('shows brackets for the identifier of a channel no airport has', () => {
    const unknownChannel = { ...glsAuto, manual: true, glsEntry: 'channel' as const, ident: null };
    unknownChannel.gls = { channel: 39999, rpi: null, course: null, slope: null, definition: null };

    expect(lsFieldCell(unknownChannel)).toBe('{cyan}{small}[\xa0\xa0]{end}{big}/{end}{big}39999{end}{end}');
  });
});

describe('MCDU RADIO NAV page LS course and slope', () => {
  it('shows the course and the slope of an ILS approach', () => {
    expect(lsCourseCell(ilsAuto, true)).toBe('{small}{cyan}F249{end}{end}\xa0\xa0{small}{green}-3.0{end}{end}');
    expect(lsCourseTitle(ilsAuto, true)).toBe('CRS\xa0\xa0\xa0SLOPE');
  });

  it('shows the course and the slope of a GLS', () => {
    expect(lsCourseCell(glsAuto, true)).toBe('{small}{cyan}F249{end}{end}\xa0\xa0{small}{green}-3.0{end}{end}');
    expect(lsCourseTitle(glsAuto, true)).toBe('CRS\xa0\xa0\xa0SLOPE');
  });

  it('shows dashes for the slope of a channel with no airport', () => {
    const unknownChannel = {
      ...glsAuto,
      slope: null,
      course: null,
      gls: { channel: 39999, rpi: null, course: null, slope: null, definition: null },
    };

    expect(lsCourseCell(unknownChannel, true)).toBe('{white}----{end}{white}\xa0\xa0\xa0-.-{end}');
    expect(lsCourseTitle(unknownChannel, true)).toBe('CRS\xa0\xa0\xa0SLOPE');
  });

  it('keeps the amber boxes of a manual ILS frequency, where the crew can enter the course', () => {
    const frequencyOnly = { ...ilsAuto, course: null, slope: null, manual: true };

    expect(lsCourseCell(frequencyOnly, true)).toBe('{amber}____{end}{white}\xa0\xa0\xa0-.-{end}');
  });

  it('shows no slope title or value when the slope is not shown', () => {
    expect(lsCourseCell(ilsAuto, false)).toBe('{small}{cyan}F249{end}{end}');
    expect(lsCourseTitle(ilsAuto, false)).toBe('CRS');
  });

  it('shows an empty course without a landing system', () => {
    expect(lsCourseCell(nothingTuned, false)).toBe('{cyan}[\xa0\xa0]{end}');
    expect(lsCourseTitle(nothingTuned, true)).toBe('CRS');
  });

  it('shows the slope for a manual landing system or for the ILS or GLS approach after take-off', () => {
    expect(showsLsSlope({ manual: true }, true, false)).toBe(true);
    expect(showsLsSlope({ manual: false }, false, true)).toBe(true);
    expect(showsLsSlope({ manual: false }, true, true)).toBe(false);
    expect(showsLsSlope({ manual: false }, false, false)).toBe(false);
  });
});

describe('MCDU RADIO NAV page course entry', () => {
  it('is allowed on an ILS and refused on a GLS', () => {
    expect(canEnterLsCourse(ilsAuto)).toBe(true);
    expect(canEnterLsCourse(glsAuto)).toBe(false);
  });
});
