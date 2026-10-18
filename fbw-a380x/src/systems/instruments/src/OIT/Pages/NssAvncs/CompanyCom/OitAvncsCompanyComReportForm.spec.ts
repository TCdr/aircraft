// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { REPORT_FORM_URLS } from '../../../System/CompanyComReportForms';

const menu = readFileSync(resolve(__dirname, 'OitAvncsCompanyComMenu.tsx'), 'utf-8');
const directory = readFileSync(resolve(__dirname, '../../../OitPageDirectory.tsx'), 'utf-8');

describe('COMPANY COM report forms in the menu', () => {
  it('opens every report and request form from the menu, on the form page', () => {
    for (const url of REPORT_FORM_URLS) {
      expect(menu).toContain(`navigationTarget="${url}"`);
      expect(directory).toContain(`case '${url}':`);
    }
  });

  it('keeps NOTAM disabled: there is no NOTAM source', () => {
    expect(menu).toMatch(/name=\{'NOTAM'\}[^>]*disabled=\{true\}/);
    expect(menu).toMatch(/name=\{'Notam'\}[^>]*disabled=\{true\}/);
    expect(menu).not.toMatch(/disabled=\{true\}[^>]*navigationTarget/);
  });
});
