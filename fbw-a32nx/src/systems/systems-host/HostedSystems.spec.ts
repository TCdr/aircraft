// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { createHostedSystems } from './HostedSystems';
import { DoorFailures } from './systems/Doors/DoorFailures';
import { PaxOxygenMasks } from './systems/Oxygen/PaxOxygenMasks';

describe('the systems the A32NX systems host runs', () => {
  const systems = createHostedSystems(new EventBus());
  const systemNamed = (name: string) => systems.find(([systemName]) => systemName === name)?.[1];

  it('runs the passenger oxygen masks', () => {
    expect(systemNamed('PaxOxygenMasks')).toBeInstanceOf(PaxOxygenMasks);
  });

  it('runs the door proximity sensor and cockpit door failures', () => {
    expect(systemNamed('DoorFailures')).toBeInstanceOf(DoorFailures);
  });

  it('gives each system its own backplane name and instance', () => {
    expect(new Set(systems.map(([name]) => name)).size).toBe(systems.length);
    expect(new Set(systems.map(([, instrument]) => instrument)).size).toBe(systems.length);
  });
});
