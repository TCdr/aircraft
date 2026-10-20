// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Publisher, Subject, VNode } from '@microsoft/msfs-sdk';
import {
  FCTL_ACTUATOR_SURFACES,
  isActuatorOperative,
  isEbhaOperative,
  isSurfaceControlled,
  surfaceVariableName,
} from './ActuatorStatus';
import { fctlActuatorFailureSimvars, SDSimvars } from '../../../SDSimvarPublisher';
import { Aileron, AileronPosition, AileronSide } from './Aileron';
import { Elevator, ElevatorPosition, ElevatorSide } from './Elevator';
import { Rudder, RudderPosition } from './Rudder';
import { PitchTrim } from './PitchTrim';

const RUST_ACTUATOR_FAILURES = resolve(
  __dirname,
  '../../../../../../../wasm/systems/a380_systems/src/hydraulic/flight_control_actuator_failures.rs',
);

describe('SD F/CTL actuator status', () => {
  it('an actuator is operative with its power supply and not failed (SimVar Bool reads give 1)', () => {
    expect(isActuatorOperative(true, false)).toBe(true);
    expect(isActuatorOperative(1 as unknown as boolean, 0 as unknown as boolean)).toBe(true);
    expect(isActuatorOperative(true, true)).toBe(false);
    expect(isActuatorOperative(false, false)).toBe(false);
  });

  it('an EBHA works on its hydraulic system, else on its electrical part', () => {
    expect(isEbhaOperative(true, false, false, true)).toBe(true);
    expect(isEbhaOperative(false, true, false, false)).toBe(true);
    expect(isEbhaOperative(false, true, false, true)).toBe(false);
    expect(isEbhaOperative(true, true, true, false)).toBe(false);
  });

  it('a surface is controlled while one actuator is operative', () => {
    expect(isSurfaceControlled(false, true)).toBe(true);
    expect(isSurfaceControlled(false, false)).toBe(false);
  });
});

describe('SD F/CTL actuator failure variables', () => {
  const rust = readFileSync(RUST_ACTUATOR_FAILURES, 'utf8');

  it('names every surface as the hydraulic system does', () => {
    const rustNames = [...rust.matchAll(/=> "([A-Z_]+)",/g)].map((match) => match[1]);
    expect(FCTL_ACTUATOR_SURFACES.map(surfaceVariableName)).toEqual(rustNames);
  });

  it('reads the variables the hydraulic system writes', () => {
    expect(rust).toContain('"FCTL_{surface}_ACTUATOR_{actuator}{part}_FAILED"');
    expect(rust).toContain('"_ELEC_PART"');
    expect(rust).toContain('"FCTL_STABILIZER_JAMMED"');

    const names = fctlActuatorFailureSimvars().map(([, entry]) => entry.name);
    expect(names).toContain('L:A32NX_FCTL_LEFT_MIDDLE_AILERON_ACTUATOR_2_FAILED');
    expect(names).toContain('L:A32NX_FCTL_UPPER_RUDDER_ACTUATOR_1_ELEC_PART_FAILED');
    expect(names).toContain('L:A32NX_FCTL_STABILIZER_JAMMED');
    // 13 surfaces x 2 actuators, 2 rudders x 2 EBHA electrical parts, the stabilizer jam
    expect(new Set(names).size).toBe(13 * 2 + 2 * 2 + 1);
  });
});

/**
 * Everything powered, as on the ground with engines running
 * @param publisher the publisher of the SD events
 */
function powerAll(publisher: Publisher<SDSimvars>): void {
  for (const topic of [
    'greenPressureSwitch',
    'yellowPressureSwitch',
    'acEssPowered',
    'ac1Powered',
    'acEhaPowered',
  ] as const) {
    publisher.pub(topic, true);
  }
}

/**
 * @param bus the event bus of the SD
 * @param element the F/CTL page element
 * @returns the container the element is drawn in
 */
function draw(bus: EventBus, element: VNode): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  FSComponent.render(element, container);
  powerAll(bus.getPublisher<SDSimvars>());
  return container;
}

/**
 * @param container the drawn element
 * @returns the colour of the surface position index
 */
function indexColour(container: HTMLElement): string {
  const index = [...container.querySelectorAll('path')].find(
    (path) => path.classList.contains('Fill') && !path.classList.contains('Grey'),
  );
  return index?.classList.contains('Amber') ? 'amber' : 'green';
}

/**
 * @param container the drawn element
 * @returns the number of amber actuator frames (full frames and EBHA half frames) shown
 */
function shownFailureFrames(container: HTMLElement): number {
  return [...container.querySelectorAll('path.SW3.NoFill.Amber')].filter(
    (path) => path.getAttribute('visibility') !== 'hidden',
  ).length;
}

describe('SD F/CTL page with failed actuators', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('frames the failed actuator of an aileron in amber; the surface stays green with its other actuator', () => {
    const bus = new EventBus();
    const container = draw(
      bus,
      <Aileron
        x={0}
        y={0}
        side={AileronSide.Left}
        position={AileronPosition.Inboard}
        onGround={Subject.create(true)}
        bus={bus}
      />,
    );
    expect(indexColour(container)).toBe('green');
    expect(shownFailureFrames(container)).toBe(0);

    bus.getPublisher<SDSimvars>().pub('leftInnerAileronActuator1Failed', true);
    expect(shownFailureFrames(container)).toBe(1);
    expect(indexColour(container)).toBe('green');
  });

  it('shows an aileron with both actuators failed in amber', () => {
    const bus = new EventBus();
    const container = draw(
      bus,
      <Aileron
        x={0}
        y={0}
        side={AileronSide.Left}
        position={AileronPosition.Inboard}
        onGround={Subject.create(true)}
        bus={bus}
      />,
    );
    const publisher = bus.getPublisher<SDSimvars>();
    publisher.pub('leftInnerAileronActuator1Failed', true);
    publisher.pub('leftInnerAileronActuator2Failed', true);

    expect(indexColour(container)).toBe('amber');
    expect(shownFailureFrames(container)).toBe(2);
  });

  it('shows an elevator with both actuators failed in amber', () => {
    const bus = new EventBus();
    const container = draw(
      bus,
      <Elevator
        x={0}
        y={0}
        side={ElevatorSide.Right}
        position={ElevatorPosition.Outboard}
        onGround={Subject.create(true)}
        bus={bus}
      />,
    );
    const publisher = bus.getPublisher<SDSimvars>();
    publisher.pub('rightOuterElevatorActuator2Failed', true);
    expect(indexColour(container)).toBe('green');
    publisher.pub('rightOuterElevatorActuator1Failed', true);

    expect(indexColour(container)).toBe('amber');
    expect(shownFailureFrames(container)).toBe(2);
  });

  it('frames a failed EBHA in full and a failed EBHA electrical part on its side; both EBHAs failed: amber rudder', () => {
    const bus = new EventBus();
    const container = draw(
      bus,
      <Rudder x={0} y={0} position={RudderPosition.Upper} onGround={Subject.create(true)} bus={bus} />,
    );
    const publisher = bus.getPublisher<SDSimvars>();
    publisher.pub('upperRudderActuator2ElecPartFailed', true);
    expect(shownFailureFrames(container)).toBe(1);
    expect(indexColour(container)).toBe('green');

    publisher.pub('upperRudderActuator1Failed', true);
    expect(shownFailureFrames(container)).toBe(3);
    expect(indexColour(container)).toBe('green');

    publisher.pub('upperRudderActuator2Failed', true);
    expect(indexColour(container)).toBe('amber');
  });

  it('shows a jammed stabilizer by an amber PITCH TRIM title only, and both motors failed all amber', () => {
    const bus = new EventBus();
    const container = draw(bus, <PitchTrim x={0} y={0} onGround={Subject.create(true)} bus={bus} />);
    const title = () => [...container.querySelectorAll('text')].find((text) => text.textContent?.trim() === 'PITCH');
    const symbol = () =>
      [...container.querySelectorAll('path')].find(
        (path) => path.classList.contains('NoFill') && path.classList.contains('SW2'),
      );
    const publisher = bus.getPublisher<SDSimvars>();
    expect(title()?.getAttribute('class')).toContain('White');

    publisher.pub('stabilizerJammed', true);
    expect(title()?.getAttribute('class')).toContain('Amber');
    expect(symbol()?.classList.contains('Green')).toBe(true);
    expect(shownFailureFrames(container)).toBe(0);

    publisher.pub('stabilizerJammed', false);
    publisher.pub('stabilizerActuator1Failed', true);
    expect(shownFailureFrames(container)).toBe(1);
    expect(symbol()?.classList.contains('Green')).toBe(true);
    publisher.pub('stabilizerActuator2Failed', true);
    expect(symbol()?.classList.contains('Amber')).toBe(true);
    expect(title()?.getAttribute('class')).toContain('Amber');
  });
});
