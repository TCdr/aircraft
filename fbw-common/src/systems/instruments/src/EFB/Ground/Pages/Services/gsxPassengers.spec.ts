// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GsxPaxAnnounceInput, GsxPaxCounts, gsxIsArrival, gsxPaxProgress, gsxPaxToAnnounce } from './gsxPassengers';

const counts = (c: Partial<GsxPaxCounts>): GsxPaxCounts => ({
  onBoard: 0,
  planned: 0,
  gsxBoarded: 0,
  gsxDeboarded: 0,
  ...c,
});

describe('GSX boarding counter of the Services page', () => {
  it('counts the boarded passengers against the planned ones, not GSX own number', () => {
    // seen in the sim: GSX showed 0/19 (its own number) with 120 planned on the Payload page
    expect(gsxPaxProgress('Boarding', 'performing', counts({ onBoard: 0, planned: 120 }))).toEqual({
      current: 0,
      total: 120,
    });
  });

  it('increases while GSX boards: the seats follow GSX running total with the payload sync', () => {
    expect(gsxPaxProgress('Boarding', 'performing', counts({ onBoard: 40, planned: 120, gsxBoarded: 40 }))).toEqual({
      current: 40,
      total: 120,
    });
    // payload sync turned off: the seats stay, GSX running total still counts
    expect(gsxPaxProgress('Boarding', 'performing', counts({ onBoard: 0, planned: 120, gsxBoarded: 55 }))).toEqual({
      current: 55,
      total: 120,
    });
  });

  it('shows boarded / scheduled, not the same number twice', () => {
    // seen in the sim: 26/26 at the start of the boarding
    const progress = gsxPaxProgress('Boarding', 'performing', counts({ onBoard: 3, planned: 26, gsxBoarded: 3 }));
    expect(progress).toEqual({ current: 3, total: 26 });
  });

  it('never shows more boarded than planned, and the seats once done', () => {
    expect(gsxPaxProgress('Boarding', 'performing', counts({ onBoard: 10, planned: 120, gsxBoarded: 180 }))).toEqual({
      current: 120,
      total: 120,
    });
    expect(gsxPaxProgress('Boarding', 'completed', counts({ onBoard: 118, planned: 120, gsxBoarded: 180 }))).toEqual({
      current: 118,
      total: 120,
    });
  });

  it('counts the deboarded passengers against the ones that were on board', () => {
    expect(gsxPaxProgress('Deboarding', 'performing', counts({ onBoard: 80, gsxDeboarded: 40 }))).toEqual({
      current: 40,
      total: 120,
    });
  });

  it('leaves the other services, an idle service and an empty plan to GSX own progress', () => {
    expect(gsxPaxProgress('Refueling', 'performing', counts({ onBoard: 3, planned: 26 }))).toBeNull();
    expect(gsxPaxProgress('Boarding', 'available', counts({ planned: 26 }))).toBeNull();
    expect(gsxPaxProgress('Boarding', 'requested', counts({ planned: 26 }))).toBeNull();
    expect(gsxPaxProgress('Boarding', undefined, counts({ planned: 26 }))).toBeNull();
    expect(gsxPaxProgress('Boarding', 'performing', counts({ planned: 0, gsxBoarded: 5 }))).toBeNull();
    expect(gsxPaxProgress('Deboarding', 'performing', counts({}))).toBeNull();
  });

  it('ignores unread simvars (NaN)', () => {
    expect(
      gsxPaxProgress('Boarding', 'performing', counts({ onBoard: Number.NaN, planned: 120, gsxBoarded: Number.NaN })),
    ).toEqual({ current: 0, total: 120 });
  });
});

describe('GSX passenger number (L:FSDT_GSX_NUMPASSENGERS)', () => {
  const input = (i: Partial<GsxPaxAnnounceInput>): GsxPaxAnnounceInput => ({
    ready: true,
    boardingState: 1,
    deboardingState: 1,
    arrival: false,
    counts: counts({ onBoard: 0, planned: 120 }),
    announced: 0,
    ...i,
  });

  it('gives GSX the planned passengers before a departure', () => {
    expect(gsxPaxToAnnounce(input({}))).toBe(120);
  });

  it('gives it again after a GSX restart reset it to 0, and only when it changed', () => {
    expect(gsxPaxToAnnounce(input({ announced: 0 }))).toBe(120);
    expect(gsxPaxToAnnounce(input({ announced: 120 }))).toBeNull();
  });

  it('gives GSX the passengers on board after landing', () => {
    expect(gsxPaxToAnnounce(input({ arrival: true, counts: counts({ onBoard: 118, planned: 0 }) }))).toBe(118);
  });

  it('gives GSX the passengers on board, not 0, once GSX deboarding is requested', () => {
    // the Payload page sets its target to 0 then (planned 0): GSX must still deboard the passengers on board
    expect(gsxPaxToAnnounce(input({ deboardingState: 4, counts: counts({ onBoard: 118, planned: 0 }) }))).toBe(118);
    expect(
      gsxPaxToAnnounce(input({ deboardingState: 4, announced: 118, counts: counts({ onBoard: 118, planned: 0 }) })),
    ).toBeNull();
  });

  it('still gives the planned passengers while the boarding is requested (GSX takes them when it starts)', () => {
    expect(gsxPaxToAnnounce(input({ boardingState: 4 }))).toBe(120);
  });

  it('leaves it while GSX boards or deboards, unlinked, and with nobody to give', () => {
    expect(gsxPaxToAnnounce(input({ boardingState: 5 }))).toBeNull();
    expect(gsxPaxToAnnounce(input({ deboardingState: 5, counts: counts({ onBoard: 60 }) }))).toBeNull();
    expect(gsxPaxToAnnounce(input({ ready: false }))).toBeNull();
    expect(gsxPaxToAnnounce(input({ counts: counts({ planned: 0 }) }))).toBeNull();
  });

  it('may give it again once the boarding is done (a changed plan for the next flight)', () => {
    expect(gsxPaxToAnnounce(input({ boardingState: 6, announced: 100 }))).toBe(120);
  });
});

describe('arrival or departure for the passenger number (the A32NX DONE phase never ends on its own)', () => {
  const arrivalInput = {
    flightPhaseDone: true,
    onBoard: 118,
    deboardingActive: false,
    boardingStarted: false,
  };

  it('is an arrival after landing while the passengers are on board', () => {
    expect(gsxIsArrival(arrivalInput)).toBe(true);
  });

  it('is a departure in any other flight phase', () => {
    expect(gsxIsArrival({ ...arrivalInput, flightPhaseDone: false })).toBe(false);
  });

  it('stays an arrival while GSX deboards and the last passengers are still on board', () => {
    expect(gsxIsArrival({ ...arrivalInput, onBoard: 3 })).toBe(true);
  });

  it('stays an arrival while a deboarding runs although nobody is counted on board for a moment', () => {
    expect(gsxIsArrival({ ...arrivalInput, onBoard: 0, deboardingActive: true })).toBe(true);
  });

  it('is a departure when nobody is on board and no deboarding runs (deboarded on the Payload page, or flyPad reloaded)', () => {
    expect(gsxIsArrival({ ...arrivalInput, onBoard: 0 })).toBe(false);
  });

  it('is a departure from the moment the boarding starts, when the passengers come on board', () => {
    expect(gsxIsArrival({ ...arrivalInput, onBoard: 40, boardingStarted: true })).toBe(false);
  });

  it('announces the planned passengers once nobody is on board, not the previous flight number', () => {
    const arrival = gsxIsArrival({ ...arrivalInput, onBoard: 0 });
    const announced = gsxPaxToAnnounce({
      ready: true,
      boardingState: 1,
      deboardingState: 1,
      arrival,
      counts: counts({ onBoard: 0, planned: 150 }),
      announced: 118,
    });

    expect(announced).toBe(150);
  });
});
