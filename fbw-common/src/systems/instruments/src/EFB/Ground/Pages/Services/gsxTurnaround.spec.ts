// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it } from 'vitest';
import { GsxService, gsxRequestable, gsxTurnaroundAction } from './GsxRemote';
import { GsxBaggageId, GsxTurnaroundInput, GsxTurnaroundMemory, gsxBaggageService } from './gsxTurnaround';

const input = (states: Record<string, number>, i: Partial<GsxTurnaroundInput> = {}): GsxTurnaroundInput => ({
  states,
  departureState: 1,
  enginesRunning: false,
  ...i,
});

/** A GSX service as the Remote API reports it once GSX reset it: available, callable again */
const available = (id: string): GsxService => ({ id, displayName: id, state: 'available', canTrigger: true });

describe('GSX turnaround memory', () => {
  let memory: GsxTurnaroundMemory;
  beforeEach(() => {
    memory = new GsxTurnaroundMemory();
  });

  it('keeps the boarding done after GSX resets it to available (the 2026-10-06 recording: 5 -> 6 -> 1)', () => {
    memory.update(input({ Boarding: 5 }));
    memory.update(input({ Boarding: 6 }));
    memory.update(input({ Boarding: 1 }));

    const [boarding] = memory.apply([available('Boarding')]);

    expect(boarding.state).toBe('completed');
    expect(boarding.canTrigger).toBe(false);
    expect(gsxTurnaroundAction(boarding)).toBeNull();
    expect(gsxRequestable(boarding)).toBe(false);
  });

  it('remembers a completion seen on the Remote API too', () => {
    memory.observeServices([{ ...available('Catering'), state: 'completed', canTrigger: false }]);
    memory.observeServices([available('Catering')]);

    expect(memory.apply([available('Catering')])[0].state).toBe('completed');
  });

  it('keeps catering and refuelling done for the ground equipment rows', () => {
    memory.update(input({ Catering: 6, Refueling: 6 }));
    memory.update(input({ Catering: 1, Refueling: 1 }));

    const services = memory.apply([available('Catering'), available('Refueling'), available('GPU')]);

    expect(services.map((s) => gsxRequestable(s))).toEqual([false, false, true]);
  });

  it('forgets a service requested again, and the boarding once a deboarding starts', () => {
    memory.update(input({ Boarding: 6, Catering: 6 }));
    memory.update(input({ Boarding: 1, Catering: 4 }));
    expect(memory.isDone('Catering')).toBe(false);
    expect(memory.isDone('Boarding')).toBe(true);

    memory.update(input({ Boarding: 1, Deboarding: 4 }));
    expect(memory.isDone('Boarding')).toBe(false);
  });

  it('forgets everything at the end of the turnaround: pushback or an engine running', () => {
    memory.update(input({ Boarding: 6, Catering: 6 }));
    memory.update(input({ Boarding: 1, Catering: 1 }, { departureState: 4 }));
    expect(memory.apply([available('Boarding')])[0].state).toBe('available');

    memory.update(input({ Boarding: 6 }));
    memory.update(input({ Boarding: 1 }, { enginesRunning: true }));
    expect(memory.isDone('Boarding')).toBe(false);
  });

  it('leaves a running service and the services it does not remember as GSX reports them', () => {
    memory.update(input({ Boarding: 6 }));
    const performing: GsxService = { ...available('Boarding'), state: 'performing', canTrigger: false };

    expect(memory.apply([performing])[0]).toBe(performing);
    expect(memory.apply([available('Departure')])[0].state).toBe('available');
  });
});

/** L:FSDT_GSX_BOARDING_CARGO (active) and L:FSDT_GSX_BOARDING_CARGO_PERCENT as the tracker reads them */
const loading = (active: boolean, percent: number): GsxTurnaroundInput['baggage'] => ({
  [GsxBaggageId.Loading]: { active, percent },
});

describe('GSX turnaround memory of the baggage', () => {
  let memory: GsxTurnaroundMemory;
  beforeEach(() => {
    memory = new GsxTurnaroundMemory();
  });

  it('keeps the baggage loaded once GSX reached 100 % and stopped loading', () => {
    memory.update(input({ Boarding: 5 }, { baggage: loading(true, 37.5) }));
    memory.update(input({ Boarding: 5 }, { baggage: loading(true, 100) }));
    memory.update(input({ Boarding: 5 }, { baggage: loading(false, 100) }));
    // the boarding goes on and ends after the baggage: the baggage stays done
    memory.update(input({ Boarding: 6 }, { baggage: loading(false, 100) }));
    memory.update(input({ Boarding: 1 }, { baggage: loading(false, 0) }));

    expect(memory.isDone(GsxBaggageId.Loading)).toBe(true);
  });

  it('does not take a 100 % left from an earlier loading as done', () => {
    memory.update(input({ Boarding: 1 }, { baggage: loading(false, 100) }));

    expect(memory.isDone(GsxBaggageId.Loading)).toBe(false);
  });

  it('forgets the baggage loading when a deboarding starts and at the end of the turnaround', () => {
    memory.update(input({ Boarding: 5 }, { baggage: loading(true, 50) }));
    memory.update(input({ Boarding: 5 }, { baggage: loading(false, 100) }));
    memory.update(input({ Deboarding: 4 }, { baggage: loading(false, 100) }));
    expect(memory.isDone(GsxBaggageId.Loading)).toBe(false);
    // the stale 100 % does not bring it back
    memory.update(input({ Deboarding: 1 }, { baggage: loading(false, 100) }));
    expect(memory.isDone(GsxBaggageId.Loading)).toBe(false);

    memory.update(input({ Boarding: 5 }, { baggage: loading(true, 50) }));
    memory.update(input({ Boarding: 6 }, { baggage: loading(false, 100) }));
    memory.update(input({ Boarding: 1 }, { baggage: loading(false, 100), departureState: 4 }));
    expect(memory.isDone(GsxBaggageId.Loading)).toBe(false);
    memory.update(input({ Boarding: 1 }, { baggage: loading(false, 100) }));
    expect(memory.isDone(GsxBaggageId.Loading)).toBe(false);
  });

  it('keeps the baggage unloaded after the deboarding until a boarding starts', () => {
    const unloading = (active: boolean, percent: number) => ({ [GsxBaggageId.Unloading]: { active, percent } });
    memory.update(input({ Deboarding: 5 }, { baggage: unloading(true, 20) }));
    memory.update(input({ Deboarding: 6 }, { baggage: unloading(false, 100) }));
    memory.update(input({ Deboarding: 1 }, { baggage: unloading(false, 100) }));
    expect(memory.isDone(GsxBaggageId.Unloading)).toBe(true);

    memory.update(input({ Boarding: 4 }, { baggage: unloading(false, 100) }));
    expect(memory.isDone(GsxBaggageId.Unloading)).toBe(false);
  });
});

describe('GSX baggage step of the turnaround list', () => {
  it('shows the loading in progress with its percentage, never callable', () => {
    const step = gsxBaggageService(GsxBaggageId.Loading, 'Baggage', { active: true, percent: 37.5 }, false);

    expect(step.state).toBe('performing');
    expect(step.progress).toEqual({ current: 38, total: 100, unit: '%' });
    expect(step.progressText).toBe('38 %');
    expect(gsxTurnaroundAction(step)).toBeNull();
  });

  it('shows the remembered loading done, and idle before it without a Request chip', () => {
    const done = gsxBaggageService(GsxBaggageId.Loading, 'Baggage', { active: false, percent: 0 }, true);
    const idle = gsxBaggageService(GsxBaggageId.Loading, 'Baggage', { active: false, percent: 100 }, false);

    expect(done.state).toBe('completed');
    expect(idle.state).toBe('available');
    expect(gsxTurnaroundAction(idle)).toBeNull();
  });
});
