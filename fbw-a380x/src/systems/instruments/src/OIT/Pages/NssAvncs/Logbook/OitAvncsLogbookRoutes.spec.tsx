// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { clickNavigatorFiles } from '../../../OitSpecSupport';
import { pageDirectoryHas } from '../../../OitPageDirectoryLookup';
import { nssAvncsApplicationName } from '../NssAvncsApplications';
import { OitAvncsMenu } from '../OitAvncsMenu';
import { LOGBOOK_URI } from './LogbookFlows';

// The EcamMessages tables and enums import each other, so the page directory cannot load the real index
vi.mock('../../../../MsfsAvionicsCommon/EcamMessages', () => ({
  EcamAbnormalProcedures: {},
  ChecklistLineStyle: {},
  EcamAbnormalSensedProcedures: {},
}));

/**
 * @returns the NSS AVNCS menu as the crew sees it, with its files clicked
 */
const menu = () =>
  clickNavigatorFiles((uiService) => <OitAvncsMenu bus={{} as any} uiService={uiService} container={{} as any} />);

describe('technical logbook pages', () => {
  it('has a page for every logbook URI', () => {
    const uris = Object.values(LOGBOOK_URI);
    expect(uris.length).toBeGreaterThanOrEqual(17);
    for (const uri of uris) {
      expect(pageDirectoryHas(uri), uri).toBe(true);
    }
  });

  it('opens from the NSS AVNCS menu (tree and centre button), named on the task bar', () => {
    const { files, root, navigateTo } = menu();
    expect(files.find((file) => file.name === 'LOGBOOK')?.target).toBe('nss-avncs/logbook');

    const centreButtons = root.querySelector('.oit-avncs-navigator-right-center-buttons') as HTMLElement;
    const logbookButton = Array.from(centreButtons.querySelectorAll<HTMLElement>('*')).find(
      (element) => element.textContent === 'LOGBOOK' && element.children.length === 0,
    );
    navigateTo.mockClear();
    logbookButton?.click();
    expect(navigateTo).toHaveBeenCalledWith('nss-avncs/logbook');
    expect(nssAvncsApplicationName('nss-avncs/logbook')).toBe('LOGBOOK');
  });

  it('lists LOGBOOK first in the NSS AVNCS menu, before COMPANY COM and REFUEL', () => {
    const names = menu().files.map((file) => file.name);
    expect(names.indexOf('LOGBOOK')).toBe(0);
    expect(names.indexOf('LOGBOOK')).toBeLessThan(names.indexOf('COMPANY COM'));
    expect(names.indexOf('COMPANY COM')).toBeLessThan(names.indexOf('REFUEL'));
  });
});
