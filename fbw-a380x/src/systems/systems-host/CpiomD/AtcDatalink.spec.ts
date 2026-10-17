// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { AtcDatalink } from './AtcDatalink';
import { ATC_FUNCTION_AVAILABLE_VAR, isAtcFunctionAvailable } from '@shared/AtcFunctionAvailability';

/** The power calls the ATC function of the sim received, in order */
const { atcPowerCalls } = vi.hoisted(() => ({ atcPowerCalls: [] as string[] }));

vi.mock('@datalink/atc', () => ({
  Atc: class {
    powerUp() {
      atcPowerCalls.push('up');
    }

    powerDown() {
      atcPowerCalls.push('down');
    }

    initialize() {}
  },
}));

/*
 * ATC reset: the crew pulls the ATC RESET pb, then pushes it after 1 s. All the CPDLC and ADS connections and the
 * mailbox messages are lost.
 */
describe('ATC RESET pb', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    atcPowerCalls.length = 0;
  });

  it('the ATC runs with CPIOM D1 and the ATC RESET pb pushed in', () => {
    expect(isAtcFunctionAvailable(true, false)).toBe(true);
    expect(isAtcFunctionAvailable(true, true)).toBe(false);
    expect(isAtcFunctionAvailable(false, false)).toBe(false);
  });

  it('pulling then pushing the ATC RESET pb power-cycles the ATC and publishes its availability', () => {
    const written: [string, unknown][] = [];
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: unknown) => {
      written.push([name, value]);
      return Promise.resolve();
    });
    const bus = new EventBus();
    const datalink = new AtcDatalink(bus);
    expect(datalink).toBeDefined();
    const publisher = bus.getPublisher<{ cpiom_d_available_1: boolean; a380x_reset_panel_atc: boolean }>();
    publisher.pub('cpiom_d_available_1', true);
    expect(atcPowerCalls[atcPowerCalls.length - 1]).toBe('up');

    atcPowerCalls.length = 0;
    publisher.pub('a380x_reset_panel_atc', true);
    expect(atcPowerCalls).toEqual(['down']);
    expect(written[written.length - 1]).toEqual([ATC_FUNCTION_AVAILABLE_VAR, false]);

    publisher.pub('a380x_reset_panel_atc', false);
    expect(atcPowerCalls).toEqual(['down', 'up']);
    expect(written[written.length - 1]).toEqual([ATC_FUNCTION_AVAILABLE_VAR, true]);
  });
});
