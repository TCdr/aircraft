// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { GsxService } from './GsxRemote';

/**
 * The completed GSX services of the current turnaround, remembered by the flyPad.
 *
 * GSX gives one completion signal: the service state 6, "service has been completed" (GSX manual, DEVELOPERS -
 * Reading the current status of GSX operations; Remote API developer guide, Appendix A: "6 completed done"; §1:
 * "watch that service's state go requested -> performing -> completed"). Neither document says how long it stays:
 * in the sim (A32NX, 2026-10-06 recording) GSX set L:FSDT_GSX_BOARDING_STATE 5 -> 6 at the end of the boarding and back
 * to 1 (available, callable again) 14 s later, while L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL stayed at 170. So the
 * flyPad remembers the completion itself, outside the pages (it survives page switches), from the state variables
 * read all the time (startGsxTurnaroundTracker) and from the Remote API services.
 *
 * Design choices:
 * - Remembered: boarding, deboarding, catering and refuelling (the services GSX resets after one turnaround step), and
 *   the baggage loading and unloading (GsxBaggageId, from their own L:vars). The jet bridge, stairs and GPU follow the
 *   sim (connected or not), the pushback ends the turnaround.
 * - Forgotten: a service requested or running again; the boarding and its baggage when a deboarding starts and the
 *   deboarding and its baggage when a boarding starts; everything at the end of the turnaround, i.e. an engine running
 *   or the pushback requested or running. A new flight loads a new flyPad, with nothing remembered.
 * - Not used: the boarding total equal to the planned passengers. The total stays after the boarding (170 above) until
 *   the next boarding starts, so it would mark the next turnaround's boarding done.
 */

/** The remembered services (Remote API ids) and their GSX state variables (GSX manual, DEVELOPERS) */
export const GSX_REMEMBERED_SERVICES: Record<string, string> = {
  Boarding: 'L:FSDT_GSX_BOARDING_STATE',
  Deboarding: 'L:FSDT_GSX_DEBOARDING_STATE',
  Catering: 'L:FSDT_GSX_CATERING_STATE',
  Refueling: 'L:FSDT_GSX_REFUELING_STATE',
};

const DEPARTURE_STATE_VAR = 'L:FSDT_GSX_DEPARTURE_STATE';

/**
 * The baggage (cargo) loading and unloading. GSX has no baggage service of its own (Remote API developer guide,
 * Appendix B: no such id, so nothing to request): it loads the baggage during the boarding and unloads it during the
 * deboarding, and reports it through L:vars (GSX manual, DEVELOPERS - Interfacing with the Cargo loading process):
 * - L:FSDT_GSX_BOARDING_CARGO / L:FSDT_GSX_DEBOARDING_CARGO: "1 if GSX is loading / unloading Luggage/Cargo";
 * - L:FSDT_GSX_BOARDING_CARGO_PERCENT / L:FSDT_GSX_DEBOARDING_CARGO_PERCENT: the progress 0-100, the average of the
 *   loaders; "when the loading/unloading process ends, the relevant variable will read 100".
 * Design choices: done = 100 % reached after the process was seen running in this turnaround (the manual does not say
 * when the percentage goes back to 0: a 100 % left from an earlier loading must not mark the next one done). Remembered
 * and forgotten like the boarding (loading) and the deboarding (unloading).
 */
export enum GsxBaggageId {
  /** The baggage loaded with the boarding */
  Loading = 'BaggageLoading',
  /** The baggage unloaded with the deboarding */
  Unloading = 'BaggageUnloading',
}

export const GSX_BAGGAGE_IDS: GsxBaggageId[] = [GsxBaggageId.Loading, GsxBaggageId.Unloading];

/** The GSX L:vars of the baggage loading and unloading */
export const GSX_BAGGAGE_VARS: Record<GsxBaggageId, { active: string; percent: string }> = {
  [GsxBaggageId.Loading]: { active: 'L:FSDT_GSX_BOARDING_CARGO', percent: 'L:FSDT_GSX_BOARDING_CARGO_PERCENT' },
  [GsxBaggageId.Unloading]: { active: 'L:FSDT_GSX_DEBOARDING_CARGO', percent: 'L:FSDT_GSX_DEBOARDING_CARGO_PERCENT' },
};

/** The GSX service (Remote API id) that carries each baggage process: the row is shown while GSX offers it */
export const GSX_BAGGAGE_CARRIER: Record<GsxBaggageId, string> = {
  [GsxBaggageId.Loading]: 'Boarding',
  [GsxBaggageId.Unloading]: 'Deboarding',
};

/** The baggage L:vars as read */
export interface GsxBaggageReading {
  /** L:FSDT_GSX_(DE)BOARDING_CARGO is 1 */
  active: boolean;
  /** L:FSDT_GSX_(DE)BOARDING_CARGO_PERCENT, 0 to 100 */
  percent: number;
}

const BAGGAGE_FULL_PERCENT = 100;

/** GSX is loading or unloading the baggage now */
function isBaggageRunning(reading: GsxBaggageReading): boolean {
  return reading.active && reading.percent < BAGGAGE_FULL_PERCENT;
}

/**
 * The baggage step of the turnaround list, as a GSX service so that it looks like the other steps: performing with its
 * percentage while GSX loads or unloads, completed once remembered done, idle otherwise. Never callable (no Request
 * chip): GSX starts it with the boarding or deboarding.
 * @param id loading or unloading
 * @param displayName the name of the row
 * @param reading the L:vars now
 * @param done the memory says it completed in this turnaround
 */
export function gsxBaggageService(
  id: GsxBaggageId,
  displayName: string,
  reading: GsxBaggageReading,
  done: boolean,
): GsxService {
  if (isBaggageRunning(reading)) {
    const percent = Math.max(0, Math.round(reading.percent));
    return {
      id,
      displayName,
      state: 'performing',
      canTrigger: false,
      progress: { current: percent, total: BAGGAGE_FULL_PERCENT, unit: '%' },
      progressText: `${percent} %`,
    };
  }
  return { id, displayName, state: done ? 'completed' : 'available', canTrigger: false };
}

/** GSX state variable values (GSX manual: 4 requested, 5 being performed, 6 completed) */
const REQUESTED = 4;
const PERFORMING = 5;
const COMPLETED = 6;

/** The Remote API service states as the state variable values */
const REMOTE_STATES: Record<string, number> = { requested: REQUESTED, performing: PERFORMING, completed: COMPLETED };

/** What the tracker reads */
export interface GsxTurnaroundInput {
  /** The state variable of each remembered service, by Remote API id (missing: not read) */
  states: Record<string, number>;
  /** L:FSDT_GSX_DEPARTURE_STATE (the pushback) */
  departureState: number;
  /** An engine is running */
  enginesRunning: boolean;
  /** The baggage L:vars of each process (missing: not read) */
  baggage?: Partial<Record<GsxBaggageId, GsxBaggageReading>>;
}

export class GsxTurnaroundMemory {
  private readonly done = new Set<string>();

  /** The baggage processes seen running in this turnaround: only those can complete */
  private readonly baggageSeen = new Set<string>();

  private readonly listeners = new Set<() => void>();

  /** Follows the changes of the remembered completions; returns the function that stops following them */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether the service completed in this turnaround */
  public isDone(id: string): boolean {
    return this.done.has(id);
  }

  /** Forgets every completion (end of the turnaround, or a test) */
  public clear(): void {
    this.baggageSeen.clear();
    if (this.done.size > 0) {
      this.done.clear();
      this.notify();
    }
  }

  /** Applies the GSX state variables and the turnaround boundaries */
  public update(input: GsxTurnaroundInput): void {
    const busy = (state: number | undefined) => state === REQUESTED || state === PERFORMING;
    if (input.enginesRunning || busy(input.departureState)) {
      this.clear();
      return;
    }
    let changed = false;
    const forget = (id: string) => {
      this.baggageSeen.delete(id);
      changed = this.done.delete(id) || changed;
    };
    for (const id of Object.keys(input.states)) {
      const state = input.states[id];
      if (state === COMPLETED && !this.done.has(id)) {
        this.done.add(id);
        changed = true;
      } else if (busy(state)) {
        forget(id);
      }
    }
    for (const id of GSX_BAGGAGE_IDS) {
      const reading = input.baggage?.[id];
      if (reading === undefined) {
        continue;
      }
      if (isBaggageRunning(reading)) {
        // running (again): not done until it reaches 100 %
        forget(id);
        this.baggageSeen.add(id);
      } else if (reading.percent >= BAGGAGE_FULL_PERCENT && this.baggageSeen.has(id) && !this.done.has(id)) {
        this.done.add(id);
        changed = true;
      }
    }
    // a deboarding starts the next turnaround step: the boarding and its baggage are over, and the other way round
    if (busy(input.states.Deboarding)) {
      forget('Boarding');
      forget(GsxBaggageId.Loading);
    }
    if (busy(input.states.Boarding)) {
      forget('Deboarding');
      forget(GsxBaggageId.Unloading);
    }
    if (changed) {
      this.notify();
    }
  }

  /** Applies the states of the Remote API services (the same signal, while the Services page follows GSX) */
  public observeServices(services: GsxService[]): void {
    const states: Record<string, number> = {};
    for (const service of services) {
      if (GSX_REMEMBERED_SERVICES[service.id] !== undefined && REMOTE_STATES[service.state] !== undefined) {
        states[service.id] = REMOTE_STATES[service.state];
      }
    }
    // the boundaries come from the state variables only
    this.update({ states, departureState: 0, enginesRunning: false });
  }

  /**
   * The services as the page shows them: a remembered service that GSX shows idle again (available) is shown completed
   * and not callable, so its step stays "Done" without a Request chip
   */
  public apply(services: GsxService[]): GsxService[] {
    if (this.done.size === 0) {
      return services;
    }
    return services.map((service) =>
      this.done.has(service.id) && !['requested', 'performing', 'completing', 'completed'].includes(service.state)
        ? { ...service, state: 'completed', canTrigger: false }
        : service,
    );
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/** The memory of this flyPad */
export const gsxTurnaround = new GsxTurnaroundMemory();

/** How often the tracker reads the GSX state variables (GSX kept the completed state 14 s) */
const TRACK_MS = 1_000;

let trackerUsers = 0;
let trackerTimer: ReturnType<typeof setInterval> | null = null;

function readTurnaroundInput(): GsxTurnaroundInput {
  const states: Record<string, number> = {};
  for (const id of Object.keys(GSX_REMEMBERED_SERVICES)) {
    states[id] = SimVar.GetSimVarValue(GSX_REMEMBERED_SERVICES[id], 'number');
  }
  let enginesRunning = false;
  for (let engine = 1; engine <= 4; engine++) {
    enginesRunning = enginesRunning || SimVar.GetSimVarValue(`ENG COMBUSTION:${engine}`, 'bool') > 0;
  }
  const baggage: Partial<Record<GsxBaggageId, GsxBaggageReading>> = {};
  for (const id of GSX_BAGGAGE_IDS) {
    baggage[id] = readGsxBaggage(id);
  }
  return { states, departureState: SimVar.GetSimVarValue(DEPARTURE_STATE_VAR, 'number'), enginesRunning, baggage };
}

/** Reads the baggage L:vars of a process */
export function readGsxBaggage(id: GsxBaggageId): GsxBaggageReading {
  return {
    active: SimVar.GetSimVarValue(GSX_BAGGAGE_VARS[id].active, 'number') > 0,
    percent: SimVar.GetSimVarValue(GSX_BAGGAGE_VARS[id].percent, 'number'),
  };
}

/**
 * Reads the GSX state variables into the memory every second, from the flyPad start (Efb) so that a completion is
 * seen whatever page is open
 * @returns the function that stops it (it runs while anyone started it)
 */
export function startGsxTurnaroundTracker(): () => void {
  trackerUsers++;
  if (trackerTimer === null) {
    trackerTimer = setInterval(() => gsxTurnaround.update(readTurnaroundInput()), TRACK_MS);
  }
  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    trackerUsers--;
    if (trackerUsers === 0 && trackerTimer !== null) {
      clearInterval(trackerTimer);
      trackerTimer = null;
    }
  };
}
