// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type DashboardPhase =
  | 'atGate'
  | 'taxiOut'
  | 'takeoff'
  | 'climb'
  | 'cruise'
  | 'descent'
  | 'approach'
  | 'taxiIn'
  | 'arrived';

export interface DashboardPhaseInput {
  /** L:A32NX_FMGC_FLIGHT_PHASE: 0 preflight, 1 takeoff, 2 climb, 3 cruise, 4 descent, 5 approach, 6 go around, 7 done */
  fmgcPhase: number;
  onGround: boolean;
  stationary: boolean;
  pushbackAttached: boolean;
  anyEngineRunning: boolean;
  /** The OFP that is loaded now is the one the aircraft has already flown */
  flownOfp: boolean;
}

const PHASE_BY_FMGC_PHASE: DashboardPhase[] = [
  'climb',
  'takeoff',
  'climb',
  'cruise',
  'descent',
  'approach',
  'approach',
];

export const deriveDashboardPhase = (input: DashboardPhaseInput): DashboardPhase => {
  const { fmgcPhase, onGround, stationary, pushbackAttached, anyEngineRunning, flownOfp } = input;

  // Phase 0 or 7 in the air is a transient FMGC state; the nearest sensible page is shown
  const phaseFromFmgc = PHASE_BY_FMGC_PHASE[fmgcPhase] ?? 'approach';
  if (!onGround || (fmgcPhase >= 1 && fmgcPhase <= 4)) {
    return phaseFromFmgc;
  }

  if (pushbackAttached) {
    return 'taxiOut';
  }
  if (anyEngineRunning || !stationary) {
    // A flown OFP or an FMGC phase of approach and later means the aircraft is coming from its landing
    return flownOfp || fmgcPhase >= 5 ? 'taxiIn' : 'taxiOut';
  }
  return flownOfp ? 'arrived' : 'atGate';
};
