// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * @param file a page file, from the NSS AVNCS pages folder
 * @returns its source
 */
const page = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8');

describe('COMPANY COM and REFUEL entries', () => {
  // The task bar draws the page again at each return: an entry held by the page itself would be lost
  it.each([
    ['CompanyCom/OitAvncsCompanyComReportForm.tsx', ['station', 'entry']],
    ['CompanyCom/OitAvncsCompanyComFreeText.tsx', ['station', 'lines']],
    ['CompanyCom/OitAvncsCompanyComWeatherRequest.tsx', ['reportType', 'airports']],
    ['Refuel/OitAvncsRefuel.tsx', ['preselectedFuelEntry', 'zfwEntry', 'zfcgEntry']],
  ])('%s keeps what the crew typed in the page drafts', (file, entries) => {
    const source = page(file);
    expect(source).toContain('this.props.container.ansu.pageDrafts');
    for (const entry of entries) {
      const declaration = entry === 'entry' ? 'entry = this.drafts.field' : `${entry} = `;
      const start = source.indexOf(declaration);
      expect(start, entry).toBeGreaterThanOrEqual(0);
      expect(source.substring(start, start + 160), entry).toContain('this.drafts.field');
    }
  });

  it('pre-fills a report form only at its first opening', () => {
    expect(page('CompanyCom/OitAvncsCompanyComReportForm.tsx')).toContain('if (this.form && !this.restored)');
  });
});
