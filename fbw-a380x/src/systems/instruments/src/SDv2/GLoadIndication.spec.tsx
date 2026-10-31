// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it } from 'vitest';
import { Arinc429Register, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { ClockEvents, EventBus, FSComponent } from '@microsoft/msfs-sdk';
import { GLoadIndication } from './GLoadIndication';
import { SDSimvars } from './SDSimvarPublisher';
import { PermanentData } from './StatusArea';

/**
 * Runs the indication for a duration in 100 ms steps.
 * @param indication the indication under test
 * @param ms the duration, in ms
 * @param phase the FWS flight phase
 * @param gLoad the normal acceleration in g, null when invalid
 * @returns the last state of the indication
 */
const run = (indication: GLoadIndication, ms: number, phase: number, gLoad: number | null) => {
  let shown = false;
  for (let t = 0; t < ms; t += 100) {
    shown = indication.update(100, phase, gLoad);
  }
  return shown;
};

/*
 * G LOAD data: airborne, G LOAD < 0.7 g or > 1.4 g for longer than 2 s; it remains visible
 * 5 s after the G load returns to normal.
 */
describe('SD G LOAD indication', () => {
  it('is not shown on the ground', () => {
    expect(run(new GLoadIndication(), 5_000, 2, 1.6)).toBe(false);
  });

  it('is shown in flight only after more than 2 s', () => {
    const indication = new GLoadIndication();
    expect(run(indication, 1_500, 8, 1.6)).toBe(false);
    expect(run(indication, 1_000, 8, 1.6)).toBe(true);
  });

  it('a short excursion does not show it', () => {
    const indication = new GLoadIndication();
    run(indication, 1_500, 8, 0.5);
    run(indication, 100, 8, 1.0);
    expect(run(indication, 1_500, 8, 0.5)).toBe(false);
  });

  it('stays 5 s after the G load returns to normal', () => {
    const indication = new GLoadIndication();
    run(indication, 3_000, 7, 1.6);
    expect(run(indication, 4_500, 7, 1.0)).toBe(true);
    expect(run(indication, 600, 7, 1.0)).toBe(false);
  });

  describe('the SD status area', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    /**
     * Renders the status area, then publishes the G load and the flight phase on every simulated 100 ms for `ms`.
     * @param gLoad the normal acceleration in g
     * @param ms how long the G load is published, in simulated milliseconds
     * @returns the visibility of the G LOAD group
     */
    function gLoadVisibility(gLoad: number, ms: number): string | null | undefined {
      const bus = new EventBus();
      const container = document.createElement('div');
      document.body.appendChild(container);
      FSComponent.render(<PermanentData bus={bus} />, container);
      const publisher = bus.getPublisher<SDSimvars & ClockEvents>();
      const word = Arinc429Register.empty();
      word.setSsm(Arinc429SignStatusMatrix.NormalOperation);
      word.setValue(gLoad);
      publisher.pub('normalAccRaw', word.rawWord);
      publisher.pub('fwcFlightPhase', 8);
      for (let simTime = 0; simTime <= ms; simTime += 100) {
        publisher.pub('simTime', simTime);
      }
      const legend = Array.from(container.querySelectorAll('text')).find((text) => text.textContent === 'G LOAD');
      return legend?.parentElement?.getAttribute('visibility');
    }

    it('uses the logic, not the raw 0.7-1.4 g test', () => {
      // 1.6 g is outside 0.7-1.4 g, but it is shown only after 2 s
      expect(gLoadVisibility(1.6, 1_000)).toBe('hidden');
      expect(gLoadVisibility(1.6, 2_500)).toBe('inherit');
      // inside the range: never
      expect(gLoadVisibility(1.0, 10_000)).toBe('hidden');
    });
  });
});
