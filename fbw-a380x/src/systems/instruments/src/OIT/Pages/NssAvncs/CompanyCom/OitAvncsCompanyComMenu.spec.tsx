// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, FSComponent } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { clickNavigatorFiles, fakeCompanyComAnsu } from '../../../OitSpecSupport';
import { pageDirectoryHas } from '../../../OitPageDirectoryLookup';
import { AnsuOps } from '../../../System/AnsuOps';
import { OitAvncsCompanyComMenu } from './OitAvncsCompanyComMenu';

// The EcamMessages tables and enums import each other, so the page directory cannot load the real index
vi.mock('../../../../MsfsAvionicsCommon/EcamMessages', () => ({
  EcamAbnormalProcedures: {},
  ChecklistLineStyle: {},
  EcamAbnormalSensedProcedures: {},
}));

/**
 * @param ansu the ANSU the menu reads
 * @returns the files of the menu, as the crew can click them
 */
function menuFiles(ansu: AnsuOps) {
  return clickNavigatorFiles((uiService) => (
    <OitAvncsCompanyComMenu bus={new EventBus()} uiService={uiService} ansu={ansu} />
  ));
}

describe('COMPANY COM menu', () => {
  it('opens the weather request in pre-flight and in-flight, and the free text in the three phases', () => {
    const targets = menuFiles(fakeCompanyComAnsu().ansu).files.map((file) => file.target);
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

  it('opens the Outbox and Sent folders', () => {
    const targets = menuFiles(fakeCompanyComAnsu().ansu).files.map((file) => file.target);
    expect(targets).toEqual(expect.arrayContaining(['nss-avncs/company-com/outbox', 'nss-avncs/company-com/sent']));
  });

  it('has a page for every file it opens', () => {
    const { targets } = menuFiles(fakeCompanyComAnsu().ansu);
    expect(targets.length).toBeGreaterThan(20);
    for (const target of targets) {
      expect(pageDirectoryHas(target), target).toBe(true);
    }
    expect(pageDirectoryHas('nss-avncs/company-com/no-such-page')).toBe(false);
  });

  it('counts the Inbox and Outbox from the mailbox, not fixed numbers', () => {
    const { ansu, unreadCount, outboxMessages } = fakeCompanyComAnsu(3, ['A', 'B']);
    const { root } = menuFiles(ansu);
    const names = () => Array.from(root.querySelectorAll('.oit-avncs-navigator-file-name')).map((e) => e.textContent);
    expect(names().slice(0, 2)).toEqual(['Inbox (3)', 'Outbox (2)']);

    unreadCount.set(1);
    outboxMessages.set([]);
    expect(names().slice(0, 2)).toEqual(['Inbox (1)', 'Outbox (0)']);
  });
});
