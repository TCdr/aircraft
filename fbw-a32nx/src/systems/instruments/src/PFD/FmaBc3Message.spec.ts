// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word, ArincEventBus } from '@flybywiresim/fbw-sdk';
import { getBC3Message } from './FMA';
import { PFDSimvarPublisher, PFDSimvars } from './shared/PFDSimvarPublisher';

const normalWord = new Arinc429Word(Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.NormalOperation));

/** The messages that can be shown on line 3, middle and right columns */
interface Bc3Inputs {
  tdReached: boolean;
  checkSpeedMode: boolean;
  setHoldSpeed: boolean;
  moreDrag: boolean;
}

const noMessage: Bc3Inputs = { tdReached: false, checkSpeedMode: false, setHoldSpeed: false, moreDrag: false };

/** Flight phase 1 has no pitch trim warning */
const FLIGHT_PHASE = 1;

const bc3Message = (inputs: Partial<Bc3Inputs>) => {
  const { tdReached, checkSpeedMode, setHoldSpeed, moreDrag } = { ...noMessage, ...inputs };
  return getBC3Message(
    false,
    normalWord,
    setHoldSpeed,
    normalWord,
    FLIGHT_PHASE,
    tdReached,
    checkSpeedMode,
    false,
    false,
    false,
    false,
    moreDrag,
  );
};

const bc3Text = (inputs: Partial<Bc3Inputs>) => bc3Message(inputs)[0];

describe('FMA MORE DRAG', () => {
  it('is shown on line 3 when the FMGC asks for it', () => {
    expect(bc3Text({ moreDrag: true })).toBe('MORE DRAG');
  });

  it('is not shown otherwise', () => {
    expect(bc3Text({})).toBe(null);
  });

  it('is shown in white', () => {
    expect(bc3Message({ moreDrag: true })[1]).toBe('FontMediumSmaller White Fill');
  });

  it('gives way to T/D REACHED and takes precedence over CHECK SPEED MODE and SET HOLD SPEED', () => {
    expect(bc3Text({ moreDrag: true, tdReached: true })).toBe('T/D REACHED');
    expect(bc3Text({ moreDrag: true, checkSpeedMode: true })).toBe('MORE DRAG');
    expect(bc3Text({ moreDrag: true, setHoldSpeed: true })).toBe('MORE DRAG');
  });
});

describe('PFD MORE DRAG event', () => {
  const values = new Map<string, number>();
  const registeredNames: string[] = [];
  const originalGetRegisteredId = SimVar.GetRegisteredId;

  beforeEach(() => {
    values.clear();
    registeredNames.length = 0;
    // the publisher reads registered simvars by id
    SimVar.GetRegisteredId = (name: string) => {
      const known = registeredNames.indexOf(name);
      return known >= 0 ? known : registeredNames.push(name) - 1;
    };
    vi.stubGlobal('simvar', { getValueReg: (id: number) => values.get(registeredNames[id]) ?? 0 });
  });

  afterEach(() => {
    SimVar.GetRegisteredId = originalGetRegisteredId;
    vi.unstubAllGlobals();
  });

  it('follows L:A32NX_PFD_MSG_MORE_DRAG', () => {
    const bus = new ArincEventBus();
    const publisher = new PFDSimvarPublisher(bus);
    const received: boolean[] = [];
    bus
      .getSubscriber<PFDSimvars>()
      .on('moreDrag')
      .handle((active) => received.push(active));
    publisher.startPublish();
    received.length = 0;

    values.set('L:A32NX_PFD_MSG_MORE_DRAG', 1);
    publisher.onUpdate();
    values.set('L:A32NX_PFD_MSG_MORE_DRAG', 0);
    publisher.onUpdate();

    expect(received).toEqual([true, false]);
  });
});
