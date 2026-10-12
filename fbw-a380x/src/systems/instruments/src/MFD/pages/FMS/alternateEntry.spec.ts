// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FmsErrorType } from '@fmgc/FmsError';
import { alternateEntryTarget } from './alternateEntry';

const database = async (ident: string) => (ident === 'EGKK' ? { ident } : undefined);

describe('INIT ALTN entry', () => {
  it('sets the alternate to an airport of the database', async () => {
    await expect(alternateEntryTarget('EGKK', database)).resolves.toBe('EGKK');
  });

  it('deletes the alternate with NONE or CLR', async () => {
    await expect(alternateEntryTarget('NONE', database)).resolves.toBeUndefined();
    await expect(alternateEntryTarget(null, database)).resolves.toBeUndefined();
  });

  it('refuses an ident not in the database (NOT IN DATABASE), before anything changes', async () => {
    await expect(alternateEntryTarget('XXXX', database)).rejects.toMatchObject({ type: FmsErrorType.NotInDatabase });
  });
});
