// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { MockedSimVarValues, mockSimVars } from '../../../../jest/MockedSimVars';
import { Arinc429SignStatusMatrix, Arinc429Word } from '../arinc429';
import { isReactiveWindshearDetectionAvailable, ReactiveWindshearComputer } from './ReactiveWindshearComputer';
import { ReactiveWindshearDetection } from './ReactiveWindshearDetection';

describe('the availability of the reactive windshear detection', () => {
  it('needs one healthy computer', () => {
    expect(isReactiveWindshearDetectionAvailable([false, false, true], false)).toBe(true);
    expect(isReactiveWindshearDetectionAvailable([false, false, false], false)).toBe(false);
  });

  it('is lost when the detection function is failed, whatever the computers', () => {
    expect(isReactiveWindshearDetectionAvailable([true, true, true], true)).toBe(false);
  });
});

describe('the reactive windshear computer reads', () => {
  const FRAME_S = 0.1;
  const FRAMES = 60;
  const WARNING_VAR = 'L:A32NX_REACTIVE_WINDSHEAR_WARNING';
  const normalWord = (value: number) => Arinc429Word.getRawWord(value, Arinc429SignStatusMatrix.NormalOperation);

  let simVars: MockedSimVarValues;
  let spies: ReturnType<typeof mockSimVars>;

  beforeEach(() => {
    simVars = new Map();
    spies = mockSimVars(simVars);
    simVars.set('L:TEST_COMPUTER_HEALTHY', 1);
    simVars.set('L:A32NX_FLAPS_HANDLE_INDEX', 1);
    simVars.set('L:A32NX_RA_1_RADIO_ALTITUDE', normalWord(500));
    simVars.set('L:A32NX_ADIRS_ADR_1_TRUE_AIRSPEED', normalWord(140));
    simVars.set('L:A32NX_ADIRS_IR_1_GROUND_SPEED', normalWord(140));
    simVars.set('L:A32NX_ADIRS_IR_1_PITCH', normalWord(0));
    simVars.set('L:A32NX_ADIRS_IR_1_ROLL', normalWord(0));
    simVars.set('L:A32NX_ADIRS_ADR_1_ANGLE_OF_ATTACK', normalWord(0));
  });

  it('the registered simvars and warns in a strong downdraft as the detection does', () => {
    simVars.set('L:A32NX_ADIRS_IR_1_VERTICAL_SPEED', normalWord(-3000));
    const computer = new ReactiveWindshearComputer(['L:TEST_COMPUTER_HEALTHY'], 0);
    const reference = new ReactiveWindshearDetection(0);

    spies.getSimVarValue.mockClear();
    for (let frame = 0; frame < FRAMES; frame++) {
      simVars.set('E:SIMULATION TIME', frame * FRAME_S);
      computer.update();
      if (frame > 0) {
        reference.update({
          deltaTime: FRAME_S,
          onGround: false,
          computerAvailable: true,
          flapsLeverOutOfZero: true,
          radioAltitudeFt: 500,
          trueAirspeedKt: 140,
          groundSpeedKt: 140,
          inertialVerticalSpeedFtMin: -3000,
          pitchDeg: 0,
          rollDeg: 0,
          angleOfAttackDeg: 0,
        });
      }
    }

    expect(spies.getSimVarValue).not.toHaveBeenCalled();
    expect(reference.warning).toBe(true);
    expect(simVars.get(WARNING_VAR)).toBe(true);
  });

  it('takes the next ADIRU when the first has no valid data: its downdraft warns', () => {
    simVars.set(
      'L:A32NX_ADIRS_IR_1_VERTICAL_SPEED',
      Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData),
    );
    simVars.set('L:A32NX_ADIRS_IR_2_VERTICAL_SPEED', normalWord(-3000));
    const computer = new ReactiveWindshearComputer(['L:TEST_COMPUTER_HEALTHY'], 0);

    for (let frame = 0; frame < FRAMES; frame++) {
      simVars.set('E:SIMULATION TIME', frame * FRAME_S);
      computer.update();
    }

    expect(simVars.get(WARNING_VAR)).toBe(true);
  });

  it('does not warn without wind', () => {
    simVars.set(
      'L:A32NX_ADIRS_IR_1_VERTICAL_SPEED',
      Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NoComputedData),
    );
    simVars.set('L:A32NX_ADIRS_IR_2_VERTICAL_SPEED', normalWord(0));
    const computer = new ReactiveWindshearComputer(['L:TEST_COMPUTER_HEALTHY'], 0);

    spies.getSimVarValue.mockClear();
    for (let frame = 0; frame < FRAMES; frame++) {
      simVars.set('E:SIMULATION TIME', frame * FRAME_S);
      computer.update();
    }

    expect(spies.getSimVarValue).not.toHaveBeenCalled();
    expect(simVars.get(WARNING_VAR)).toBe(false);
  });
});
