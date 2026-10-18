// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const flows = readFileSync(resolve(__dirname, 'LogbookFlows.ts'), 'utf-8');
const directory = readFileSync(resolve(__dirname, '../../../OitPageDirectory.tsx'), 'utf-8');
const menu = readFileSync(resolve(__dirname, '../OitAvncsMenu.tsx'), 'utf-8');
const footer = readFileSync(resolve(__dirname, '../OitAvncsFooter.tsx'), 'utf-8');
const container = readFileSync(resolve(__dirname, '../../../OitAvncsContainer.tsx'), 'utf-8');

/** The URIs of the logbook pages (LOGBOOK_URI) */
const pageUris = (flows.match(/'nss-avncs\/logbook\/[a-z/-]+'/g) ?? []).map((uri) => uri.slice(1, -1));

describe('technical logbook pages', () => {
  it('has a page for every logbook URI', () => {
    expect(pageUris.length).toBeGreaterThanOrEqual(17);
    for (const uri of pageUris) {
      expect(directory).toContain(`case '${uri}':`);
    }
  });

  it('opens from the NSS AVNCS menu (tree and centre button) and the task bar', () => {
    expect(directory).toContain("case 'nss-avncs/logbook':");
    expect(menu).toContain('navigationTarget="nss-avncs/logbook"');
    expect(menu).toContain("navigateTo('nss-avncs/logbook')");
    expect(footer).toContain("navigateTo('nss-avncs/logbook')");
  });

  it('lists LOGBOOK first in the NSS AVNCS menu, before COMPANY COM and REFUEL', () => {
    const logbook = menu.indexOf("name={'LOGBOOK'}");
    const companyCom = menu.indexOf("name={'COMPANY COM'}");
    const refuel = menu.indexOf("name={'REFUEL'}");
    expect(logbook).toBeGreaterThan(-1);
    expect(logbook).toBeLessThan(companyCom);
    expect(companyCom).toBeLessThan(refuel);
  });

  it('keeps the logbook application page while its own pages change', () => {
    expect(container).toMatch(/nss-avncs\\\/logbook\\\/\\S\*/);
  });
});
