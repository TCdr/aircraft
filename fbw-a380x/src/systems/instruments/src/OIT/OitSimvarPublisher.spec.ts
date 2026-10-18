// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { SimVarPublisherEntry } from '@microsoft/msfs-sdk';
import { OitSimvarPublisher } from './OitSimvarPublisher';

const definitions = (OitSimvarPublisher as unknown as { simvars: Map<string, SimVarPublisherEntry<any>> }).simvars;

describe('OitSimvarPublisher', () => {
  it('publishes the NSS DATA TO AVNCS pb-sw as OFF only when the switch is pressed in', () => {
    const definition = definitions.get('nssDataToAvncsOff')!;
    const published = (lvarValue: number) => (definition.map ? definition.map(lvarValue) : lvarValue);

    // The cockpit switch L:var is 1 in its normal (released) position and 0 when OFF
    expect(published(1)).toBe(false);
    expect(published(0)).toBe(true);
  });
});
