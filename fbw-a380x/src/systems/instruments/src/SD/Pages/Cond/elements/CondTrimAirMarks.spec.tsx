// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { withRenderedSdElement } from '../../../SdSpecSupport';
import CabinTemperatures from './CabinTemperatures';
import CargoTemperatures from './CargoTemperatures';

// The COND SD page OVHT and trim air valve marks read L:vars written per zone by the temperature controller (Rust).
// The names are built from strings on both sides, so this checks they stay the same.
const tadd = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../wasm/systems/a380_systems/src/air_conditioning/local_controllers/trim_air_drive_device.rs',
  ),
  'utf-8',
);

/** @returns the zone mark groups (trim air valve H, OVHT) of the cabin zone that are shown */
function shownZoneMarks(simVars: Record<string, number>): string[] {
  return withRenderedSdElement(<CabinTemperatures x={0} y={0} />, simVars, (container) => {
    const marks: string[] = [];
    container.querySelectorAll('g[id^="CabinZoneWarning-"]').forEach((zone) => {
      const zoneName = zone.id.replace('CabinZoneWarning-', '');
      if (zone.querySelector(`g#TrimAirFailure-${zoneName}`)?.classList.contains('Show')) {
        marks.push(`${zoneName} trim air valve`);
      }
      const overheat = Array.from(zone.querySelectorAll(':scope > text')).find((text) => text.textContent === 'OVHT');
      if (overheat?.classList.contains('Show')) {
        marks.push(`${zoneName} OVHT`);
      }
    });
    return marks;
  });
}

describe('COND SD page OVHT and trim air valve marks', () => {
  it('are written per zone by the temperature controller', () => {
    expect(tadd).toContain('format!("COND_{}_DUCT_OVHT", zone)');
    expect(tadd).toContain('format!("COND_{}_TRIM_AIR_VALVE_FAULT", zone)');
  });

  it('are shown for the cockpit and every cabin zone from that zone own L:vars', () => {
    expect(shownZoneMarks({})).toEqual([]);
    expect(shownZoneMarks({ 'L:A32NX_COND_CKPT_DUCT_OVHT': 1 })).toEqual(['CKPT OVHT']);
    expect(shownZoneMarks({ 'L:A32NX_COND_UPPER_DECK_3_TRIM_AIR_VALVE_FAULT': 1 })).toEqual([
      'UPPER_DECK_3 trim air valve',
    ]);
    expect(
      shownZoneMarks({ 'L:A32NX_COND_MAIN_DECK_8_DUCT_OVHT': 1, 'L:A32NX_COND_MAIN_DECK_1_TRIM_AIR_VALVE_FAULT': 1 }),
    ).toEqual(['MAIN_DECK_1 trim air valve', 'MAIN_DECK_8 OVHT']);
  });

  it('are shown for the forward cargo from its own L:vars', () => {
    const cargoMarks = (simVars: Record<string, number>) =>
      withRenderedSdElement(<CargoTemperatures x={0} y={0} />, simVars, (container) => ({
        overheat: Array.from(container.querySelectorAll('text'))
          .find((text) => text.textContent === 'OVHT')
          ?.classList.contains('Show'),
        trimAirValve: container.querySelector('g#TrimAirFailure-CARGO_FWD')?.classList.contains('Show'),
      }));
    expect(cargoMarks({})).toEqual({ overheat: false, trimAirValve: false });
    expect(cargoMarks({ 'L:A32NX_COND_CARGO_FWD_DUCT_OVHT': 1 })).toEqual({ overheat: true, trimAirValve: false });
    expect(cargoMarks({ 'L:A32NX_COND_CARGO_FWD_TRIM_AIR_VALVE_FAULT': 1 })).toEqual({
      overheat: false,
      trimAirValve: true,
    });
  });
});
