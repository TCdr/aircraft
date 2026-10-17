// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  CargoDoorState,
  cargoDoorCanToggle,
  cargoDoorOpening,
  cargoDoorStatusKey,
  cargoDoorTone,
  combineCargoDoors,
} from './cargoDoor';

const door = (state: Partial<CargoDoorState>): CargoDoorState => ({
  positionPercent: 0,
  locked: true,
  operationInhibited: false,
  requestedOpen: false,
  ...state,
});

describe('A380 cargo door row of the Services page (follows the hydraulic door, not the request)', () => {
  it('is closed only while the door is locked', () => {
    expect(cargoDoorOpening(door({}))).toBe(0);
    expect(cargoDoorStatusKey(door({}))).toBe('Ground.Services.Closed');
  });

  it('is not closed while unlocked without hydraulic power, even if it has barely moved (seen in the sim)', () => {
    const unlocked = door({ positionPercent: 0.24, locked: false, operationInhibited: true, requestedOpen: false });
    expect(cargoDoorOpening(unlocked)).toBeGreaterThan(0);
    expect(cargoDoorStatusKey(unlocked)).toBe('Ground.Services.CargoDoorStoppedNoHyd');
    expect(cargoDoorTone(unlocked)).toBe('warn');
  });

  it('shows how far a door stopped without hydraulic power is open', () => {
    const stopped = door({ positionPercent: 40, locked: false, operationInhibited: true, requestedOpen: true });
    expect(cargoDoorOpening(stopped)).toBeCloseTo(0.4);
    expect(cargoDoorStatusKey(stopped)).toBe('Ground.Services.CargoDoorStoppedNoHyd');
  });

  it('is open from the up-lock position of the hydraulic controller', () => {
    const open = door({ positionPercent: 92, locked: false, requestedOpen: true });
    expect(cargoDoorOpening(open)).toBe(1);
    expect(cargoDoorStatusKey(open)).toBe('Ground.Services.Open');
    expect(cargoDoorTone(open)).toBe('active');
  });

  it('is moving while the hydraulics drive it', () => {
    const opening = door({ positionPercent: 40, locked: false, requestedOpen: true });
    expect(cargoDoorStatusKey(opening)).toBe('Ground.Services.Moving');
    expect(cargoDoorTone(opening)).toBe('busy');
    const closing = door({ positionPercent: 92, locked: false, requestedOpen: false });
    expect(cargoDoorStatusKey(closing)).toBe('Ground.Services.Moving');
  });

  it('cannot be opened while the cargo door actuation is inhibited (an engine running)', () => {
    const closed = door({ operationInhibited: true });
    expect(cargoDoorCanToggle(closed)).toBe(false);
    expect(cargoDoorStatusKey(closed)).toBe('Ground.Services.CargoDoorClosedNoHyd');
  });

  it('keeps an open request pending until the actuation is available, and lets it be cancelled', () => {
    const pending = door({ operationInhibited: true, requestedOpen: true });
    expect(cargoDoorCanToggle(pending)).toBe(true);
    expect(cargoDoorStatusKey(pending)).toBe('Ground.Services.CargoDoorOpenPendingNoHyd');
  });

  it('lets a close be requested for an unlocked door without hydraulic power (it closes once the engines stop)', () => {
    expect(cargoDoorCanToggle(door({ positionPercent: 50, locked: false, operationInhibited: true }))).toBe(true);
  });

  it('combines the forward and aft doors moved by the same request: closed only when both are locked', () => {
    const closed = door({});
    const opening = door({ positionPercent: 30, locked: false, requestedOpen: true });
    expect(combineCargoDoors(closed, opening)).toEqual({ ...opening, positionPercent: 0 });
    expect(cargoDoorStatusKey(combineCargoDoors(closed, opening))).toBe('Ground.Services.Moving');
  });

  it('combines the forward and aft doors: open only when both are open, closing until both are locked', () => {
    const open = door({ positionPercent: 100, locked: false, requestedOpen: true });
    const halfOpen = door({ positionPercent: 50, locked: false, requestedOpen: true });
    expect(cargoDoorStatusKey(combineCargoDoors(open, halfOpen))).toBe('Ground.Services.Moving');
    expect(cargoDoorStatusKey(combineCargoDoors(open, open))).toBe('Ground.Services.Open');

    const closingOpen = door({ positionPercent: 100, locked: false });
    const closedNow = door({});
    expect(combineCargoDoors(closingOpen, closedNow).positionPercent).toBe(100);
    expect(cargoDoorStatusKey(combineCargoDoors(closingOpen, closedNow))).toBe('Ground.Services.Moving');
  });

  it('can always be toggled when the actuation is available', () => {
    expect(cargoDoorCanToggle(door({}))).toBe(true);
    expect(cargoDoorCanToggle(door({ positionPercent: 100, locked: false, requestedOpen: true }))).toBe(true);
  });
});
