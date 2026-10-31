// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { EwdSimvars } from '../shared/EwdSimvarPublisher';
import { ExceedanceMemory, N1_RED_LIMIT_PERCENT, n1Colour } from './EgtLimits';
import { N1 } from './N1';

describe('A380X EWD N1 red limit and red cross', () => {
  it('shows the N1 value in red above the 111 % red limit', () => {
    expect(n1Colour(111)).toBe('Green');
    expect(n1Colour(111.1)).toBe('Red');
  });

  it('keeps the red cross after the exceedance until the next engine start on the ground', () => {
    const cross = new ExceedanceMemory(N1_RED_LIMIT_PERCENT);
    cross.update(113.8, false, true);
    cross.update(90, false, true);
    expect(cross.exceeded).toBe(true);
    cross.update(15, true, true);
    expect(cross.exceeded).toBe(false);
  });

  // a parameter that is not available shows XX instead of its value
  it('latches no red cross on an N1 the FADEC does not send (XX) or that is not a finite number', () => {
    const cross = new ExceedanceMemory(N1_RED_LIMIT_PERCENT);
    cross.update(120, false, false);
    expect(cross.exceeded).toBe(false);
    cross.update(Infinity, false, true);
    expect(cross.exceeded).toBe(false);
    cross.update(95, false, true);
    expect(cross.exceeded).toBe(false);
  });

  describe('the N1 gauge', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    function drawN1Gauge(n1Degraded = false) {
      const bus = new EventBus();
      const container = document.createElement('div');
      document.body.appendChild(container);
      FSComponent.render(
        <N1 bus={bus} x={0} y={0} engine={1} active={Subject.create(true)} n1Degraded={Subject.create(n1Degraded)} />,
        container,
      );
      const gauge = container.querySelector('g#N1-indicator-1');
      return {
        publisher: bus.getPublisher<EwdSimvars>(),
        /** The red crosses of the groups that are visible */
        visibleRedCrosses: () =>
          Array.from(gauge?.querySelectorAll('text.Red') ?? []).filter(
            (cross) =>
              cross.textContent === '+' &&
              cross.getAttribute('visibility') === 'inherit' &&
              cross.parentElement?.getAttribute('visibility') === 'visible',
          ).length,
        /** The classes of every N1 value text (large and small digits of both displays) */
        valueClasses: () =>
          Array.from(gauge?.querySelectorAll('text') ?? [])
            .filter((text) => /^F(26|20) End \w+$/.test(text.getAttribute('class') ?? ''))
            .map((text) => text.getAttribute('class')),
      };
    }

    it('latches the N1 exceedance with the engine start on ground', () => {
      const gauge = drawN1Gauge();
      gauge.publisher.pub('n1_1', 113.8);
      gauge.publisher.pub('n1_1', 90);
      expect(gauge.visibleRedCrosses()).toBe(1);
      // an engine start in flight keeps it, a start on the ground takes it away
      gauge.publisher.pub('engine_state_1', 2);
      expect(gauge.visibleRedCrosses()).toBe(1);
      gauge.publisher.pub('nose_gear_compressed_1', true);
      gauge.publisher.pub('engine_state_1', 3);
      gauge.publisher.pub('n1_1', 15);
      expect(gauge.visibleRedCrosses()).toBe(0);
    });

    it('draws a red cross after the N1 value of the normal and the degraded N1 display', () => {
      for (const degraded of [false, true]) {
        const gauge = drawN1Gauge(degraded);
        gauge.publisher.pub('n1_1', 112);
        expect(gauge.visibleRedCrosses()).toBe(1);
      }
    });

    it('colours every N1 value with the red limit', () => {
      const gauge = drawN1Gauge();
      gauge.publisher.pub('n1_1', 100);
      // the large digits and the small digit of the normal and of the degraded display
      expect(gauge.valueClasses()).toHaveLength(6);
      expect(gauge.valueClasses().every((valueClass) => valueClass?.endsWith('Green'))).toBe(true);
      gauge.publisher.pub('n1_1', 112);
      expect(gauge.valueClasses().every((valueClass) => valueClass?.endsWith('Red'))).toBe(true);
    });
  });
});
