// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, KeyEventManager } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { describe, expect, it, vi } from 'vitest';
import { FuelApuFeed } from './CpiomF/FuelApuFeed';
import { FuelCollectorCells } from './CpiomF/FuelCollectorCells';
import { FuelOverflow } from './CpiomF/FuelOverflow';
import { FuelRefuelFaults } from './CpiomF/FuelRefuelFaults';
import { FuelTemperatures } from './CpiomF/FuelTankTemperatures';
import { FuelTransferFaults } from './CpiomF/FuelTransferFaults';
import { WeightBalanceBackup } from './CpiomF/WeightBalanceBackup';
import { createHostedSystems } from './HostedSystems';
import { CabinOxygenMasks } from './Misc/CabinOxygenMasks';
import { CabinSigns } from './Misc/CabinSigns';
import { Tpis } from './Misc/Tpis';

describe('the systems the A380X systems host runs', () => {
  // the fuel jettison asks for the key event manager, which waits for the sim's game state
  vi.spyOn(KeyEventManager, 'getManager').mockResolvedValue({} as KeyEventManager);
  const failuresConsumer = new FailuresConsumer();
  const host = { deltaTime: 0 } as BaseInstrument;
  const systems = createHostedSystems(host, new EventBus(), failuresConsumer, new FuelTransferFaults(failuresConsumer));
  const systemNamed = (name: string) => systems.find(([systemName]) => systemName === name)?.[1];

  it('runs the cabin oxygen masks', () => {
    expect(systemNamed('CabinOxygenMasks')).toBeInstanceOf(CabinOxygenMasks);
  });

  it('runs the cabin signs', () => {
    expect(systemNamed('CabinSigns')).toBeInstanceOf(CabinSigns);
  });

  it('runs the TPIS', () => {
    expect(systemNamed('Tpis')).toBeInstanceOf(Tpis);
  });

  it.each([
    ['FuelCollectorCells', FuelCollectorCells],
    ['FuelTemperatures', FuelTemperatures],
    ['WeightBalanceBackup', WeightBalanceBackup],
    ['FuelApuFeed', FuelApuFeed],
    ['FuelOverflow', FuelOverflow],
    ['FuelRefuelFaults', FuelRefuelFaults],
  ])('runs %s, a source of the FUEL alerts', (name, system) => {
    expect(systemNamed(name)).toBeInstanceOf(system);
  });

  it('gives each system its own backplane name and instance', () => {
    expect(new Set(systems.map(([name]) => name)).size).toBe(systems.length);
    expect(new Set(systems.map(([, instrument]) => instrument)).size).toBe(systems.length);
  });
});
