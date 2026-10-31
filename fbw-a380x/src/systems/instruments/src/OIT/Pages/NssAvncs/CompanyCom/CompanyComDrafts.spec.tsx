// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeUiService, withStandIns } from '../../../OitSpecSupport';
import { OitPageDrafts } from '../../../System/OitPageDrafts';
import { REPORT_FORM_URLS, reportFormForUrl } from '../../../System/CompanyComReportForms';
import { OitAvncsCompanyComFreeText } from './OitAvncsCompanyComFreeText';
import { OitAvncsCompanyComReportForm } from './OitAvncsCompanyComReportForm';
import { OitAvncsCompanyComWeatherRequest } from './OitAvncsCompanyComWeatherRequest';
import { OitAvncsRefuel } from '../Refuel/OitAvncsRefuel';

/**
 * @param pageDrafts the drafts of the OIT
 * @returns the props of a page, as the container gives them
 */
function pageProps(pageDrafts: OitPageDrafts) {
  const ansu = withStandIns({
    pageDrafts,
    companyComReports: withStandIns({ lastStation: Subject.create('KLMOPS') }),
    sci: withStandIns({
      fltNumber: Subject.create('ABC123'),
      fltOrigin: Subject.create('EGLL'),
      fltDestination: Subject.create('KJFK'),
      fqmsFuelQuantity: Subject.create({ valueOr: () => null }),
      airspeed: Subject.create({ valueOr: () => null }),
    }),
    outBlockTime: Subject.create(null),
    offBlockTime: Subject.create(null),
    onBlockTime: Subject.create(null),
    inBlockTime: Subject.create(null),
    outBlockFob: Subject.create(null),
    inBlockFob: Subject.create(null),
  });
  return {
    bus: new EventBus(),
    uiService: fakeUiService().uiService,
    container: withStandIns({ ansu }),
  };
}

/**
 * @param page a page
 * @param name the name of one of its entries
 * @returns the entry, or the entries when the page has a row of them
 */
function entriesOf(page: unknown, name: string): Subject<unknown>[] {
  const entry = (page as Record<string, Subject<unknown> | Subject<unknown>[]>)[name];
  expect(entry, name).toBeDefined();
  return Array.isArray(entry) ? entry : [entry];
}

describe('COMPANY COM and REFUEL entries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The task bar draws the page again at each return: an entry held by the page itself would be lost
  it.each([
    [
      'Report form',
      (props: ReturnType<typeof pageProps>) => new OitAvncsCompanyComReportForm({ ...props, url: REPORT_FORM_URLS[0] }),
      ['station'],
    ],
    ['Free text', (props: ReturnType<typeof pageProps>) => new OitAvncsCompanyComFreeText(props), ['station', 'lines']],
    [
      'Weather request',
      (props: ReturnType<typeof pageProps>) => new OitAvncsCompanyComWeatherRequest(props),
      ['reportType', 'airports'],
    ],
    [
      'Refuel',
      (props: ReturnType<typeof pageProps>) => new OitAvncsRefuel(props),
      ['preselectedFuelEntry', 'zfwEntry', 'zfcgEntry'],
    ],
  ])('%s keeps what the crew typed in the page drafts', (_name, newPage, entryNames) => {
    const drafts = new OitPageDrafts();
    const firstDrawing = newPage(pageProps(drafts));
    const typed = 'TYPED';
    for (const name of entryNames) {
      entriesOf(firstDrawing, name).forEach((entry) => entry.set(typed));
    }

    const nextDrawing = newPage(pageProps(drafts));
    for (const name of entryNames) {
      for (const entry of entriesOf(nextDrawing, name)) {
        expect(entry.get(), name).toBe(typed);
      }
    }
  });

  it('pre-fills a report form only at its first opening', () => {
    // The input fields name themselves with a sim utility
    vi.stubGlobal('Utils', { generateGUID: () => 'test-guid' });
    const url = REPORT_FORM_URLS.find((candidate) =>
      reportFormForUrl(candidate)?.fields.some((field) => field.prefill !== undefined),
    ) as string;
    const drafts = new OitPageDrafts();
    const draw = () =>
      FSComponent.render(
        <OitAvncsCompanyComReportForm {...pageProps(drafts)} url={url} />,
        document.createElement('div'),
      );

    draw();
    const form = reportFormForUrl(url)!;
    const prefilled = form.fields.filter((field) => drafts.field<string | null>(url, `field ${field.id}`, null).get());
    expect(prefilled.length, 'a field was pre-filled at the first opening').toBeGreaterThan(0);

    const edited = drafts.field<string | null>(url, `field ${prefilled[0].id}`, null);
    edited.set('EDITED');
    draw();
    expect(edited.get()).toBe('EDITED');
  });
});
