// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject } from '@microsoft/msfs-sdk';
import { isSpoilerPowered, SPOILER_NUMBERS, SpoilerNumber, spoilerHydraulicSystem } from './SpoilerStatus';
import { fctlSpoilerFailureSimvars, SDSimvars } from '../../../SDSimvarPublisher';
import { Spoiler, SpoilerSide } from './Spoiler';

const FBW_SOURCES = resolve(__dirname, '../../../../../../../wasm/fbw_a380/src');

describe('SD F/CTL spoiler status', () => {
  it('spoilers 1, 3, 5 and 7 are yellow, spoilers 2, 4, 6 and 8 green', () => {
    expect(SPOILER_NUMBERS.map(spoilerHydraulicSystem)).toEqual([
      'yellow',
      'green',
      'yellow',
      'green',
      'yellow',
      'green',
      'yellow',
      'green',
    ]);
  });

  it('only the spoiler 6 EBHA works on the AC ESS busbar without hydraulic pressure, in flight', () => {
    expect(isSpoilerPowered(6, false, true, false)).toBe(true);
    expect(isSpoilerPowered(6, false, true, true)).toBe(false);
    expect(isSpoilerPowered(5, false, true, false)).toBe(false);
    expect(isSpoilerPowered(3, false, true, false)).toBe(false);
    expect(isSpoilerPowered(3, 1 as unknown as boolean, false, true)).toBe(true);
  });
});

describe('SD F/CTL spoiler failure variables', () => {
  const fbwInterface = readFileSync(resolve(FBW_SOURCES, 'FlyByWireInterface.cpp'), 'utf8');
  const indication = readFileSync(resolve(FBW_SOURCES, 'SpoilerFailureIndication.h'), 'utf8');

  it('reads the variables the fbw module writes', () => {
    expect(fbwInterface).toContain('"A32NX_FCTL_LEFT_SPOILER_" + idString + "_FAILED"');
    expect(fbwInterface).toContain('"A32NX_FCTL_RIGHT_SPOILER_" + idString + "_FAILED"');

    const names = fctlSpoilerFailureSimvars().map(([, entry]) => entry.name);
    expect(names).toContain('L:A32NX_FCTL_LEFT_SPOILER_1_FAILED');
    expect(names).toContain('L:A32NX_FCTL_RIGHT_SPOILER_8_FAILED');
    expect(new Set(names).size).toBe(16);
  });

  it('reports each spoiler failed with the computer its orders come from', () => {
    const orders = fbwInterface.match(/const double leftSpoilerOrders\[8\] = \{([^}]+)\}/);
    const orderComputers = [...(orders?.[1] ?? '').matchAll(/-(prims|secs)AnalogOutputs\[(\d)\]/g)].map(
      ([, computer, index]) => `${computer === 'prims'}:${index}`,
    );
    const table = indication.match(/SPOILER_COMPUTERS = \{\{([\s\S]+?)\}\};/);
    const indicationComputers = [...(table?.[1] ?? '').matchAll(/\{(true|false), (\d)\}/g)].map(
      ([, isPrim, index]) => `${isPrim}:${index}`,
    );

    expect(orderComputers).toHaveLength(8);
    expect(indicationComputers).toEqual(orderComputers);
  });
});

/**
 * @param container the drawn spoiler
 * @returns the colour of the spoiler and whether its amber failure lines are shown
 */
function spoilerLook(container: HTMLElement): { colour: string; failureLines: boolean } {
  const paths = [...container.querySelectorAll('path')];
  const deflection = paths.find((path) => path.classList.contains('Fill') && !path.classList.contains('Grey'));
  const lines = paths.find((path) => path.classList.contains('SW4'));
  return {
    colour: deflection?.classList.contains('Amber') ? 'amber' : 'green',
    failureLines: lines?.getAttribute('visibility') !== 'hidden',
  };
}

describe('SD F/CTL page spoilers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * @param side the wing
   * @param position the spoiler
   * @param onGround the aircraft is on the ground
   * @returns the bus and the container of the drawn spoiler, with both hydraulic systems and the AC ESS busbar powered
   */
  function drawSpoiler(side: SpoilerSide, position: SpoilerNumber, onGround: boolean) {
    const bus = new EventBus();
    const container = document.createElement('div');
    document.body.appendChild(container);
    FSComponent.render(
      <Spoiler x={0} y={0} side={side} position={position} onGround={Subject.create(onGround)} bus={bus} />,
      container,
    );
    const publisher = bus.getPublisher<SDSimvars>();
    publisher.pub('greenPressureSwitch', true);
    publisher.pub('yellowPressureSwitch', true);
    publisher.pub('acEssPowered', true);
    return { publisher, container };
  }

  it('shows a spoiler reported failed in amber, with its failure lines', () => {
    const { publisher, container } = drawSpoiler(SpoilerSide.Left, 3, true);
    expect(spoilerLook(container)).toEqual({ colour: 'green', failureLines: false });

    publisher.pub('leftSpoiler3Failed', true);
    expect(spoilerLook(container)).toEqual({ colour: 'amber', failureLines: true });
  });

  it('shows the spoilers of the lost hydraulic system in amber', () => {
    const yellowSpoiler = drawSpoiler(SpoilerSide.Right, 7, false);
    const greenSpoiler = drawSpoiler(SpoilerSide.Right, 8, false);
    yellowSpoiler.publisher.pub('yellowPressureSwitch', false);
    greenSpoiler.publisher.pub('yellowPressureSwitch', false);

    expect(spoilerLook(yellowSpoiler.container).colour).toBe('amber');
    expect(spoilerLook(greenSpoiler.container).colour).toBe('green');
  });

  it('keeps spoiler 6 green in flight without green hydraulic pressure (EBHA on AC ESS)', () => {
    const { publisher, container } = drawSpoiler(SpoilerSide.Left, 6, false);
    publisher.pub('greenPressureSwitch', false);
    expect(spoilerLook(container).colour).toBe('green');

    publisher.pub('acEssPowered', false);
    expect(spoilerLook(container).colour).toBe('amber');
  });
});
