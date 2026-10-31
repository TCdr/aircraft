// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { withRenderedEngineColumn } from './EngineColumnSpecSupport';
import { fuelFilterCloggedShown } from './FuelFilterIndication';

describe('A380X SD ENGINE fuel filter CLOGGED', () => {
  it('shows CLOGGED with a clogged filter on a running engine', () => {
    expect(fuelFilterCloggedShown(true, 1)).toBe(true);
  });

  it('does not show CLOGGED on an engine that is not running, nor without the failure', () => {
    expect(fuelFilterCloggedShown(true, 0)).toBe(false);
    expect(fuelFilterCloggedShown(true, 2)).toBe(false);
    expect(fuelFilterCloggedShown(false, 1)).toBe(false);
  });

  it('draws CLOGGED in amber below the fuel flow, from the fuel filter failure', () => {
    const fuelFilterClogged = (clogged: number, engineState: number) =>
      withRenderedEngineColumn(
        { 'L:A32NX_ENGINE_1_FUEL_FILTER_CLOGGED': clogged, 'L:A32NX_ENGINE_STATE:1': engineState },
        (container) => {
          const texts = Array.from(container.querySelectorAll('text'));
          const clog = texts.find((text) => text.textContent === 'CLOGGED');
          const fuelFlow = texts.find((text) => text.getAttribute('class')?.startsWith('Green EndAlign F29'));
          return clog
            ? {
                colour: clog.getAttribute('class'),
                belowFuelFlow: Number(clog.getAttribute('y')) > Number(fuelFlow?.getAttribute('y')),
              }
            : null;
        },
      );
    expect(fuelFilterClogged(1, 1)).toEqual({ colour: 'Amber MiddleAlign F22', belowFuelFlow: true });
    expect(fuelFilterClogged(1, 0)).toBeNull();
    expect(fuelFilterClogged(0, 1)).toBeNull();
  });
});
