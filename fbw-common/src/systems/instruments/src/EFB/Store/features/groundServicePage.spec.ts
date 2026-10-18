// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';

// ServiceButtonState of the Services pages: DISABLED = 1, INACTIVE = 2, CALLED = 3, ACTIVE = 4
const DISABLED = 1;
const CALLED = 3;
const ACTIVE = 4;

describe('flyPad Services page button states', () => {
  it('the second service door (A380X MAIN 4R) has its own state, apart from the catering door', async () => {
    // imported here: the slice reads its initial state from the SimVar mock, which the test setup fills per test
    const {
      default: reducer,
      setServiceDoorButtonState,
      setServiceDoor2ButtonState,
    } = await import('./groundServicePage');
    let state = reducer(undefined, setServiceDoorButtonState(DISABLED));
    state = reducer(state, setServiceDoor2ButtonState(CALLED));
    expect(state.serviceDoor2ButtonState).toBe(CALLED);
    // the catering truck disables the MAIN 5R switch only: MAIN 4R stays usable
    expect(state.serviceDoorButtonState).toBe(DISABLED);

    state = reducer(state, setServiceDoorButtonState(ACTIVE));
    expect(state.serviceDoor2ButtonState).toBe(CALLED);
  });

  it('the aft left doors (A380X MAIN 4L and 5L) have their own states', async () => {
    const {
      default: reducer,
      setBoarding1DoorButtonState,
      setBoarding4DoorButtonState,
      setBoarding5DoorButtonState,
    } = await import('./groundServicePage');
    let state = reducer(undefined, setBoarding4DoorButtonState(CALLED));
    state = reducer(state, setBoarding5DoorButtonState(ACTIVE));
    // the jet bridge and the stairs disable the MAIN 1L switch only
    state = reducer(state, setBoarding1DoorButtonState(DISABLED));
    expect([state.boarding4DoorButtonState, state.boarding5DoorButtonState]).toEqual([CALLED, ACTIVE]);
  });
});
