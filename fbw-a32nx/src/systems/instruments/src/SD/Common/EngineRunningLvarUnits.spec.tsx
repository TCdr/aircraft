// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The React instrument framework finds its root element (which receives the `update` events) when its module loads:
// create it before the pages are imported (vi.hoisted runs before the imports).
vi.hoisted(() => {
  const root = document.createElement('div');
  const mount = document.createElement('div');
  mount.id = 'MSFS_REACT_MOUNT';
  root.appendChild(mount);
  document.body.appendChild(root);
});

import EngineBleed from '../Pages/Bleed/elements/EngineBleed';
import { HydPage } from '../Pages/Hyd/Hyd';

/**
 * The FADEC N1/N2 L:vars as the FADEC writes them: plain percent numbers with the unit "number"
 * (fadec_a32nx FadecSimData_A32NX.hpp). The values are an engine at idle, 0.1 % under the idle N1/N2.
 */
const FADEC_N_LVARS: Record<string, number> = {
  'L:A32NX_ENGINE_N1:1': 18.5,
  'L:A32NX_ENGINE_N1:2': 18.5,
  'L:A32NX_ENGINE_IDLE_N1': 18.6,
  'L:A32NX_ENGINE_N2:1': 68.1,
  'L:A32NX_ENGINE_N2:2': 68.1,
  'L:A32NX_ENGINE_IDLE_N2': 68.2,
};

/**
 * MSFS 2024 reads such an L:var in 'percent' as a ratio, 100 times too big (sim check: L:A32NX_ENGINE_N2:2 = 68.2 as
 * number, 6816.8 as percent). The other variables of the pages read as stored, with the FADEC powered.
 */
const msfs2024GetSimVarValue = (name: string, unit: string): number => {
  if (name in FADEC_N_LVARS) {
    const percentRead = unit.toLowerCase() === 'percent';
    return FADEC_N_LVARS[name] * (percentRead ? 100 : 1);
  }
  return name.startsWith('L:A32NX_FADEC_POWERED_ENG') ? 1 : 0;
};

describe('SD engine numbers with the engine at idle (FADEC N1/N2 L:var units)', () => {
  let originalGetSimVarValue: typeof SimVar.GetSimVarValue;
  let container: HTMLDivElement;

  beforeEach(() => {
    // (the SDK imports replace the setup's SimVar mock, so the reader is stubbed here)
    originalGetSimVarValue = SimVar.GetSimVarValue;
    SimVar.GetSimVarValue = msfs2024GetSimVarValue as unknown as typeof SimVar.GetSimVarValue;
    container = document.createElement('div');
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    SimVar.GetSimVarValue = originalGetSimVarValue;
  });

  it('keeps the BLEED page engine number white and the IP/HP lines green', () => {
    act(() => {
      ReactDOM.render(
        <svg>
          <EngineBleed
            x={170}
            y={0}
            engine={2}
            sdacDatum
            enginePRValveOpen
            packFlowValveOpen
            onGround
            wingAntiIceOn={false}
            wingAntiIceTimer={0}
          />
        </svg>,
        container,
      );
    });

    const engineNumber = container.querySelector('text.Huge');
    expect(engineNumber?.textContent).toBe('2');
    expect(engineNumber?.classList.contains('White')).toBe(true);
    // N1 0.1 % under idle is not "below idle" (2 % margin): no amber IP/HP duct
    expect(container.querySelectorAll('path.AmberLine').length).toBe(0);
  });

  it('keeps the HYD page engine 1 and 2 legends white', () => {
    act(() => {
      ReactDOM.render(<HydPage />, container);
    });

    const engineLegends = Array.from(container.querySelectorAll('text.Title')).filter((text) =>
      ['1', '2'].includes(text.textContent ?? ''),
    );
    expect(engineLegends.length).toBe(2);
    for (const legend of engineLegends) {
      expect(legend.classList.contains('Amber')).toBe(false);
    }
  });
});
