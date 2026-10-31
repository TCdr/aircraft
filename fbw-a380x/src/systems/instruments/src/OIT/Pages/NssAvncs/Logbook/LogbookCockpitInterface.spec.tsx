// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OitPageDrafts } from '../../../System/OitPageDrafts';
import { logbookPageProps } from './LogbookSpecSupport';
import { OitAvncsLogbookCockpitInterface } from './OitAvncsLogbookCockpitInterface';

describe('logbook cockpit interface page', () => {
  beforeEach(() => {
    vi.stubGlobal('Utils', { generateGUID: () => 'guid' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the PILOT COMMENT beside its NAVIGATION column, as wide as ITEM SELECTION', () => {
    const root = document.createElement('div');
    FSComponent.render(<OitAvncsLogbookCockpitInterface {...(logbookPageProps(new OitPageDrafts()) as any)} />, root);

    const selectionList = root.querySelector<HTMLElement>('.oit-logbook-list');
    expect(selectionList?.style.width).toBe('640px');

    const commentLabel = Array.from(root.querySelectorAll('.oit-logbook-label')).find(
      (label) => label.textContent?.trim() === 'PILOT COMMENT',
    );
    const commentField = commentLabel?.parentElement?.querySelector<HTMLElement>(
      '[style*="width"]:not(.oit-logbook-label)',
    );
    expect(commentField?.style.width).toBe(selectionList?.style.width);
  });
});
