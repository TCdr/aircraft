// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, KeyEventManager } from '@microsoft/msfs-sdk';
import { LegacyFuel } from './LegacyFuel';

const simVars = new Map<string, number | boolean>();

const set = (name: string, value: number | boolean) => simVars.set(name, value);

let triggerKey: ReturnType<typeof vi.fn>;

const createLegacyFuel = async () => {
  const legacyFuel = new LegacyFuel(new EventBus(), { deltaTime: 1000 } as unknown as BaseInstrument);
  // the key event manager promise
  await new Promise((resolve) => setTimeout(resolve, 0));
  // the game state wait of init() needs the sim
  (legacyFuel as unknown as { hasInit: boolean }).hasInit = true;
  return legacyFuel;
};

const keysOf = (name: string) => triggerKey.mock.calls.filter((call) => call[0] === name).map((call) => call.slice(2));

beforeEach(() => {
  simVars.clear();
  vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
  triggerKey = vi.fn();
  vi.spyOn(KeyEventManager, 'getManager').mockResolvedValue({ triggerKey } as unknown as KeyEventManager);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LegacyFuel', () => {
  describe('jettison start', () => {
    it('closes the feed tank transfer valves, as the End triggers are not evaluated', async () => {
      const legacyFuel = await createLegacyFuel();
      set('L:A380X_FUEL_JETTISON_IN_PROGRESS', true);

      legacyFuel.onUpdate();

      const closedValves = keysOf('FUELSYSTEM_VALVE_SET')
        .filter(([, state]) => state === 0)
        .map(([valve]) => valve);
      for (const valve of [5, 10, 16, 23, 30]) {
        expect(closedValves).toContain(valve);
      }
      // the engine valves 1-4, the crossfeed valves 46-49, the jettison nozzle valves 57/58 and the trim inlet 59 stay
      for (const valve of [1, 2, 3, 4, 46, 47, 48, 49, 57, 58, 59]) {
        expect(closedValves).not.toContain(valve);
      }
      expect(keysOf('FUELSYSTEM_VALVE_SET').filter(([, state]) => state === 1)).toEqual([]);
      // the pumps keep running
      expect(keysOf('FUELSYSTEM_PUMP_OFF')).toEqual([]);
    });

    it('does it once, not on every update of the jettison', async () => {
      const legacyFuel = await createLegacyFuel();
      set('L:A380X_FUEL_JETTISON_IN_PROGRESS', true);
      legacyFuel.onUpdate();
      const callsAtStart = triggerKey.mock.calls.length;
      legacyFuel.onUpdate();
      legacyFuel.onUpdate();
      expect(triggerKey.mock.calls.length).toBe(callsAtStart);
    });
  });
});
