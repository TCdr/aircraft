// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { equipmentRow } from './ServicesLayout';

vi.mock('../../../Localization/translation', () => ({ t: (key: string) => key.split('.').pop() }));

const row = (look: 'inactive' | 'active' | 'called', requestable?: boolean) =>
  equipmentRow('catering', 'Catering Truck', <span />, look, () => {}, { gsxStatus: 'Done', requestable });

describe('Ground equipment rows of the Services page linked to GSX', () => {
  it('offers no Request on a GSX service GSX does not let be triggered (e.g. completed catering)', () => {
    expect(row('inactive', false).trailing).toBeNull();
    expect(row('inactive', false).status).toBe('Done');
  });

  it('keeps the Request chip when GSX allows it, and on rows that are not GSX-driven', () => {
    expect(row('inactive', true).trailing).not.toBeNull();
    expect(row('inactive').trailing).not.toBeNull();
  });

  it('keeps the Release and Called chips of a running service', () => {
    expect(row('active', false).trailing).not.toBeNull();
    expect(row('called', false).trailing).not.toBeNull();
  });

  it('names the release chip of a connected row as asked (Retry after GSX ignored a release)', () => {
    const chipLabel = (releaseAction?: string) =>
      (
        equipmentRow('jetBridge', 'Jet Bridge', <span />, 'active', () => {}, { releaseAction })
          .trailing as ReactElement
      ).props.children;

    expect(chipLabel('Retry')).toBe('Retry');
    expect(chipLabel()).toBe('Release');
  });
});
