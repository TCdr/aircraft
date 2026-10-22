// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it } from 'vitest';
import { EventBus, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { SDSimvars } from '../../../SDSimvarPublisher';
import { Aileron, AileronPosition, AileronSide } from './Aileron';
import { Elevator, ElevatorPosition, ElevatorSide } from './Elevator';

type PowerTopic = 'greenPressureSwitch' | 'yellowPressureSwitch' | 'acEssPowered' | 'ac1Powered' | 'acEhaPowered';

/**
 * @param element the F/CTL page element
 * @param unpowered the power supply left unpowered, all others powered
 * @returns the colour of the EHA symbol of the element
 */
function ehaColour(element: (bus: EventBus) => VNode, unpowered: PowerTopic): string {
  const bus = new EventBus();
  const container = document.createElement('div');
  document.body.appendChild(container);
  FSComponent.render(element(bus), container);
  const publisher = bus.getPublisher<SDSimvars>();
  for (const topic of [
    'greenPressureSwitch',
    'yellowPressureSwitch',
    'acEssPowered',
    'ac1Powered',
    'acEhaPowered',
  ] as const) {
    publisher.pub(topic, topic !== unpowered);
  }
  const eha = [...container.querySelectorAll('path')].find((path) => path.getAttribute('d')?.startsWith('m17,6'));
  return eha?.classList.contains('Amber') ? 'amber' : 'green';
}

// The EHAs the aircraft supplies from the AC 3 busbar are on the AC EHA busbar (247XP) in the simulation
describe('SD F/CTL EHA power supplies', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const inboardAileron = (bus: EventBus) => (
    <Aileron
      x={0}
      y={0}
      side={AileronSide.Left}
      position={AileronPosition.Inboard}
      onGround={Subject.create(true)}
      bus={bus}
    />
  );

  const leftOuterElevator = (bus: EventBus) => (
    <Elevator
      x={0}
      y={0}
      side={ElevatorSide.Left}
      position={ElevatorPosition.Outboard}
      onGround={Subject.create(true)}
      bus={bus}
    />
  );

  const rightInnerElevator = (bus: EventBus) => (
    <Elevator
      x={0}
      y={0}
      side={ElevatorSide.Right}
      position={ElevatorPosition.Inboard}
      onGround={Subject.create(true)}
      bus={bus}
    />
  );

  it('the inboard aileron EHA is on the AC EHA busbar, not on AC 1', () => {
    expect(ehaColour(inboardAileron, 'acEhaPowered')).toBe('amber');
    expect(ehaColour(inboardAileron, 'ac1Powered')).toBe('green');
  });

  it('the left outer and right inner elevator EHAs are on the AC EHA busbar, not on AC 1', () => {
    expect(ehaColour(leftOuterElevator, 'acEhaPowered')).toBe('amber');
    expect(ehaColour(leftOuterElevator, 'ac1Powered')).toBe('green');
    expect(ehaColour(rightInnerElevator, 'acEhaPowered')).toBe('amber');
    expect(ehaColour(rightInnerElevator, 'ac1Powered')).toBe('green');
  });
});
