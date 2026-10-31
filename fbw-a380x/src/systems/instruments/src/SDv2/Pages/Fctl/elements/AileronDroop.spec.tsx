// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { SDSimvars } from '../../../SDSimvarPublisher';
import { Aileron, AileronPosition, AileronSide } from './Aileron';
import { isAileronDroopSymbolShown } from './AileronDroop';

/* The aileron droop (white round symbol) applies in CONF 1+F, 2, 3 and FULL. */
describe('SD F/CTL aileron droop symbol', () => {
  it.each([
    [0, 'CONF 0'],
    [1, 'CONF 1'],
  ])('is hidden in %s (%s)', (index) => {
    expect(isAileronDroopSymbolShown(index)).toBe(false);
  });

  it.each([
    [2, 'CONF 1+F'],
    [3, 'CONF 2'],
    [4, 'CONF 2S'],
    [5, 'CONF 3'],
    [6, 'CONF FULL'],
  ])('is shown in %s (%s)', (index) => {
    expect(isAileronDroopSymbolShown(index)).toBe(true);
  });

  describe('the aileron element', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    /**
     * @param flapsConfIndex the published flap configuration index, null before any is published
     * @returns whether the white droop circle of the inboard left aileron is visible at the flap configuration
     */
    function droopSymbolVisible(flapsConfIndex: number | null): boolean {
      const bus = new EventBus();
      const container = document.createElement('div');
      document.body.appendChild(container);
      FSComponent.render(
        <Aileron
          x={0}
          y={0}
          side={AileronSide.Left}
          position={AileronPosition.Inboard}
          onGround={Subject.create(true)}
          bus={bus}
        />,
        container,
      );
      if (flapsConfIndex !== null) {
        bus.getPublisher<SDSimvars>().pub('flapsConfIndex', flapsConfIndex);
      }
      const droop = container.querySelector('circle.White');
      return droop?.getAttribute('visibility') === 'inherit';
    }

    it('shows the droop circle from the published flap configuration', () => {
      // before any flap configuration is published the symbol is off
      expect(droopSymbolVisible(null)).toBe(false);
      expect(droopSymbolVisible(1)).toBe(false);
      expect(droopSymbolVisible(2)).toBe(true);
      expect(droopSymbolVisible(6)).toBe(true);
    });
  });
});
