// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { currentSectionIndex, ofpSections, OFP_SECTION_ATTRIBUTE, withSectionAnchors } from './ofpSections';

const PAGE_BREAK = '<h2 style="page-break-after: always;"> </h2>';

/** A SimBrief LIDO-layout plan_html, outer div already removed by the parser, cut to a few lines per section. */
const LIDO_OFP = [
  '<pre><!--BKMK///OFP///0--><!--BKMK///Summary and Fuel///1--><b>[ OFP ]',
  '--------------------------------------------------------------------</b>',
  'AFR1234   24OCT2026    LFPG-EGLL   A20N FHEPD   RELEASE 1601 24OCT26',
  '         PLANNED FUEL',
  'TRIP            LHR   2731   0055',
  `TEL: +33 1 00 00 00 00              PIC SIGNATURE: ...............${PAGE_BREAK}<!--BKMK///Routing and Impacts///1-->`,
  'DEP  LFPG/09L  ARR EGLL/27R',
  `--------------------------------------------------------------------${PAGE_BREAK}<!--BKMK///Times and Weights///1-->--------------------------------------------------------------------`,
  ' ZFW  58944',
  `--------------------------------------------------------------------${PAGE_BREAK}<!--BKMK///Flight Log///1-->                             FLIGHT LOG`,
  'LFPG  09L  ..... ',
  `${PAGE_BREAK}<!--BKMK///Wind Information///1-->--------------------------------------------------------------------`,
  ` OPALE  FL370 270/045 -52${PAGE_BREAK}<!--BKMK///ATC Flight Plan///0--><b>[ ATC Flight Plan ]`,
  '</b>(FPL-AFR1234-IS',
  ` PER/C RMK/TCAS)${PAGE_BREAK}<!--BKMK///Additional Info///0--><b>[ Additional Info ]</b>`,
  `${PAGE_BREAK}<!--BKMK///Airport WX List///0--><b>[ Airport WX List ]</b>`,
  'LFPG 241330Z 24012KT 9999 FEW030 14/08 Q1018 NOSIG=',
  `  AIRPORTLIST ENDED${PAGE_BREAK}<!--BKMK///NOTAM///0--><b>[ NOTAM ]</b>`,
  'A1234/26 RWY 09R/27L CLSD',
  `${PAGE_BREAK}<!--BKMK///Crew Alert &amp; Bulletin///0--><b>[ Crew Alert ]</b>`,
  `${PAGE_BREAK}<!--BKMK///Company NOTAM///0--><b>[ Company NOTAM ]</b>`,
  '<a class="ofpmaplink" href="https://www.simbrief.com/ofp/uads/X.gif"><img src="https://www.simbrief.com/ofp/uads/X.gif" width="600px"></a></pre>',
].join('\n');

/** The older SimBrief layout: other sub-section names, weather as one section. */
const OLD_LAYOUT_OFP = [
  '<pre><!--BKMK///OFP///0--><!--BKMK///Summary///1--><!--BKMK///Fuel and Weights///1--><b>OFP 1</b>',
  `TRIP 2731${PAGE_BREAK}<!--BKMK///Weather///0-->LFPG 241330Z 24012KT`,
  `${PAGE_BREAK}<!--BKMK///Notam///0-->A1234/26</pre>`,
].join('\n');

describe('ofpSections', () => {
  it('lists the bookmarked sections of a LIDO OFP in order, with their level', () => {
    expect(ofpSections(LIDO_OFP).map((s) => `${s.level} ${s.title}`)).toEqual([
      '0 OFP',
      '1 Summary and Fuel',
      '1 Routing and Impacts',
      '1 Times and Weights',
      '1 Flight Log',
      '1 Wind Information',
      '0 ATC Flight Plan',
      '0 Additional Info',
      '0 Airport WX List',
      '0 NOTAM',
      '0 Crew Alert & Bulletin',
      '0 Company NOTAM',
    ]);
  });

  it('gives every section a distinct id', () => {
    const ids = ofpSections(LIDO_OFP).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads the older layout too', () => {
    expect(ofpSections(OLD_LAYOUT_OFP).map((s) => s.title)).toEqual([
      'OFP',
      'Summary',
      'Fuel and Weights',
      'Weather',
      'Notam',
    ]);
  });

  it('finds nothing in an OFP without bookmarks, or no OFP', () => {
    expect(ofpSections('<pre><b>[ OFP ]</b>\nTRIP 2731</pre>')).toEqual([]);
    expect(ofpSections('')).toEqual([]);
    expect(ofpSections(undefined as unknown as string)).toEqual([]);
  });

  it('skips a bookmark with an empty title', () => {
    expect(ofpSections('<pre><!--BKMK/// ///0-->x<!--BKMK///NOTAM///0-->y</pre>').map((s) => s.title)).toEqual([
      'NOTAM',
    ]);
  });
});

describe('withSectionAnchors', () => {
  it('puts one anchor per section where its bookmark was, with the section id', () => {
    const html = withSectionAnchors(LIDO_OFP);
    const anchorIds: string[] = [];
    const anchor = new RegExp(`${OFP_SECTION_ATTRIBUTE}="([^"]+)"`, 'g');
    let match = anchor.exec(html);
    while (match !== null) {
      anchorIds.push(match[1]);
      match = anchor.exec(html);
    }

    expect(anchorIds).toEqual(ofpSections(LIDO_OFP).map((s) => s.id));
    expect(html).not.toContain('BKMK');
    expect(html.indexOf('ofp-section-6')).toBeLessThan(html.indexOf('[ ATC Flight Plan ]'));
    expect(html.indexOf('[ ATC Flight Plan ]')).toBeLessThan(html.indexOf('ofp-section-7'));
  });

  it('keeps the rest of the OFP untouched', () => {
    const html = withSectionAnchors(LIDO_OFP);
    expect(html.replace(/<span data-ofp-section="[^"]+"[^>]*><\/span>/g, '')).toBe(
      LIDO_OFP.replace(/<!--BKMK\/\/\/.*?\/\/\/\d+-->/g, ''),
    );
  });

  it('leaves an OFP without bookmarks as it is', () => {
    expect(withSectionAnchors('<pre>TRIP 2731</pre>')).toBe('<pre>TRIP 2731</pre>');
  });
});

describe('currentSectionIndex', () => {
  const tops = [0, 0, 400, 900, 1500];

  it('is the last section starting at or above the top of the view', () => {
    expect(currentSectionIndex(tops, 0)).toBe(1);
    expect(currentSectionIndex(tops, 395)).toBe(1);
    expect(currentSectionIndex(tops, 400)).toBe(2);
    expect(currentSectionIndex(tops, 1200)).toBe(3);
    expect(currentSectionIndex(tops, 5000)).toBe(4);
  });

  it('counts a section a few pixels below the top as reached', () => {
    expect(currentSectionIndex(tops, 397)).toBe(2);
  });

  it('is the first section before any anchor, and none without sections', () => {
    expect(currentSectionIndex([120, 400], 0)).toBe(0);
    expect(currentSectionIndex([], 0)).toBe(-1);
  });
});
