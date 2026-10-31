// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent } from '@microsoft/msfs-sdk';
import { describe, expect, it, vi } from 'vitest';
import { clickNavigatorFiles } from '../../OitSpecSupport';
import { pageDirectoryHas } from '../../OitPageDirectoryLookup';
import { OitAvncsMenu } from './OitAvncsMenu';

// The EcamMessages tables and enums import each other, so the page directory cannot load the real index
vi.mock('../../../MsfsAvionicsCommon/EcamMessages', () => ({
  EcamAbnormalProcedures: {},
  ChecklistLineStyle: {},
  EcamAbnormalSensedProcedures: {},
}));

describe('NSS AVNCS menu tree', () => {
  it('has a page for every file it opens', () => {
    const { targets } = clickNavigatorFiles((uiService) => (
      <OitAvncsMenu bus={{} as any} uiService={uiService} container={{} as any} />
    ));
    expect(targets).toContain('nss-avncs/refuel');
    for (const target of targets) {
      expect(pageDirectoryHas(target), target).toBe(true);
    }
  });
});
