// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const menu = readFileSync(resolve(__dirname, 'OitAvncsCompanyComMenu.tsx'), 'utf-8');
const directory = readFileSync(resolve(__dirname, '../../../OitPageDirectory.tsx'), 'utf-8');

/** The navigation targets of the COMPANY COM menu files */
const targets = (menu.match(/navigationTarget="[^"]+"/g) ?? []).map((match) =>
  match.substring('navigationTarget="'.length, match.length - 1),
);

describe('COMPANY COM menu (A380 FCOM DSC-46-40, a380_fcom.txt l.107840-107846)', () => {
  it('opens the weather request in pre-flight and in-flight, and the free text in the three phases', () => {
    expect(targets).toEqual(
      expect.arrayContaining([
        'nss-avncs/company-com/pre-flight/weather',
        'nss-avncs/company-com/in-flight/weather',
        'nss-avncs/company-com/pre-flight/free-text',
        'nss-avncs/company-com/in-flight/free-text',
        'nss-avncs/company-com/post-flight/free-text',
      ]),
    );
  });

  it('has a page for every file it opens', () => {
    for (const target of targets) {
      expect(directory).toContain(`case '${target}':`);
    }
  });
});
