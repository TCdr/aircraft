// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { clickNavigatorFiles, fakeCompanyComAnsu } from '../../../OitSpecSupport';
import { pageDirectoryHas } from '../../../OitPageDirectoryLookup';
import { REPORT_FORM_URLS } from '../../../System/CompanyComReportForms';
import { OitAvncsCompanyComMenu } from './OitAvncsCompanyComMenu';

// The EcamMessages tables and enums import each other, so the page directory cannot load the real index
vi.mock('../../../../MsfsAvionicsCommon/EcamMessages', () => ({
  EcamAbnormalProcedures: {},
  ChecklistLineStyle: {},
  EcamAbnormalSensedProcedures: {},
}));

const { files } = clickNavigatorFiles((uiService) => (
  <OitAvncsCompanyComMenu bus={new EventBus()} uiService={uiService} ansu={fakeCompanyComAnsu().ansu} />
));

describe('COMPANY COM report forms in the menu', () => {
  it('opens every report and request form from the menu, on the form page', () => {
    for (const url of REPORT_FORM_URLS) {
      expect(
        files.some((file) => file.target === url),
        url,
      ).toBe(true);
      expect(pageDirectoryHas(url), url).toBe(true);
    }
  });

  it('keeps NOTAM disabled: there is no NOTAM source', () => {
    const notams = files.filter((file) => file.name.toUpperCase() === 'NOTAM');
    expect(notams.length).toBe(2);
    for (const notam of notams) {
      expect(notam.disabled).toBe(true);
    }
    // Clicking a disabled file must open nothing
    expect(files.filter((file) => file.disabled).every((file) => file.target === null)).toBe(true);
  });
});
