// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DashboardPhaseInput, deriveDashboardPhase } from './dashboardPhase';

const parkedAtGate: DashboardPhaseInput = {
  fmgcPhase: 0,
  onGround: true,
  stationary: true,
  pushbackAttached: false,
  anyEngineRunning: false,
  flownOfp: false,
};

const phase = (changes: Partial<DashboardPhaseInput>) => deriveDashboardPhase({ ...parkedAtGate, ...changes });

describe('deriveDashboardPhase before the flight', () => {
  it('is atGate when parked with no engine, no pushback and an OFP that has not been flown', () => {
    expect(phase({})).toBe('atGate');
  });

  it('is taxiOut with an engine running, the tug attached or the aircraft moving', () => {
    expect(phase({ anyEngineRunning: true })).toBe('taxiOut');
    expect(phase({ pushbackAttached: true })).toBe('taxiOut');
    expect(phase({ stationary: false })).toBe('taxiOut');
  });

  it('is atGate for a different OFP than the one flown', () => {
    expect(phase({ flownOfp: false })).toBe('atGate');
  });

  it('keeps taxiOut during a second departure on the same OFP with the tug attached', () => {
    expect(phase({ flownOfp: true, pushbackAttached: true })).toBe('taxiOut');
  });
});

describe('deriveDashboardPhase in flight', () => {
  it('maps the FMGC phases to takeoff, climb, cruise and descent', () => {
    expect(phase({ fmgcPhase: 1, onGround: false })).toBe('takeoff');
    expect(phase({ fmgcPhase: 2, onGround: false })).toBe('climb');
    expect(phase({ fmgcPhase: 3, onGround: false })).toBe('cruise');
    expect(phase({ fmgcPhase: 4, onGround: false })).toBe('descent');
  });

  it('treats approach and go around as approach', () => {
    expect(phase({ fmgcPhase: 5, onGround: false })).toBe('approach');
    expect(phase({ fmgcPhase: 6, onGround: false })).toBe('approach');
  });

  it('is takeoff during the takeoff roll on the runway', () => {
    expect(phase({ fmgcPhase: 1, stationary: false, anyEngineRunning: true })).toBe('takeoff');
  });

  it('shows climb for a preflight FMGC phase in the air and approach for a done FMGC phase in the air', () => {
    expect(phase({ fmgcPhase: 0, onGround: false })).toBe('climb');
    expect(phase({ fmgcPhase: 7, onGround: false })).toBe('approach');
  });

  it('follows the FMGC phase when airborne even if the OFP was flown before', () => {
    expect(phase({ fmgcPhase: 3, onGround: false, flownOfp: true })).toBe('cruise');
  });
});

describe('deriveDashboardPhase after landing', () => {
  it('is taxiIn while moving or with an engine running', () => {
    expect(phase({ fmgcPhase: 7, stationary: false, anyEngineRunning: true })).toBe('taxiIn');
    expect(phase({ fmgcPhase: 7, stationary: true, anyEngineRunning: true })).toBe('taxiIn');
    expect(phase({ fmgcPhase: 7, stationary: false })).toBe('taxiIn');
  });

  it('is taxiIn during the rollout before the FMGC is done', () => {
    expect(phase({ fmgcPhase: 5, stationary: false, anyEngineRunning: true })).toBe('taxiIn');
  });

  it('is taxiIn once the flown OFP is recorded and the aircraft rolls with phase back at preflight', () => {
    expect(phase({ flownOfp: true, stationary: false, anyEngineRunning: true })).toBe('taxiIn');
  });

  it('is taxiIn after a go around that ended on the ground, and arrived or atGate once parked', () => {
    expect(phase({ fmgcPhase: 6, stationary: false, anyEngineRunning: true })).toBe('taxiIn');
    expect(phase({ fmgcPhase: 6, flownOfp: true })).toBe('arrived');
    expect(phase({ fmgcPhase: 6 })).toBe('atGate');
  });

  it('is arrived when stationary with every engine off', () => {
    expect(phase({ fmgcPhase: 7, flownOfp: true })).toBe('arrived');
    expect(phase({ flownOfp: true })).toBe('arrived');
  });

  it('moves from arrived to atGate for a different OFP only', () => {
    expect(phase({ fmgcPhase: 7, flownOfp: true })).toBe('arrived');
    expect(phase({ fmgcPhase: 7, flownOfp: false })).toBe('atGate');
    expect(phase({ fmgcPhase: 0, flownOfp: false })).toBe('atGate');
  });
});
