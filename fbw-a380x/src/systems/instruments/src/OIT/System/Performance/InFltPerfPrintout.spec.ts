// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  computeAtmoLowAltitudeCorrection,
  computeAtmoSpeedConversions,
  computeAtmoTrueAltitude,
} from '../InFltPerfAtmo';
import { InFltPerfAtmoSession } from '../InFltPerfAtmoSession';
import { inFltPerfPrintout } from './InFltPerfPrintout';

/** @returns a session with the SPEED entries of a cruise computed */
function speedSession(): InFltPerfAtmoSession {
  const session = new InFltPerfAtmoSession();
  session.wind.set({ directionDeg: 180, speedKt: 40 });
  session.course.set(90);
  session.temperature.set({ isaDeviationC: 10 });
  session.grossWeight.set(400);
  session.mach.set(0.85);
  session.indicatedAltitude.set(35_000);
  session.airportElevation.set(500);
  const computation = computeAtmoSpeedConversions({
    wind: session.wind.get(),
    courseDeg: 90,
    isaDeviationC: 10,
    speedType: 'MACH',
    speed: 0.85,
    indicatedAltitudeFt: 35_000,
    airportElevationFt: 500,
  });
  session.results.set({ kind: 'speed', results: computation.results! });
  return session;
}

describe('IN-FLT PERF printout', () => {
  it('has nothing to print before a computation or after errors', () => {
    const session = new InFltPerfAtmoSession();
    expect(inFltPerfPrintout(session, 'T')).toBeNull();
    session.results.set({ kind: 'errors', lines: ['MACH'] });
    expect(inFltPerfPrintout(session, 'T')).toBeNull();
  });

  it('prints the entries of a speed conversion, then its results, under the application name', () => {
    const printout = inFltPerfPrintout(speedSession(), 'T')!;
    expect(printout.title).toBe('IN-FLT PERF');
    const lines = printout.text.split('\n');
    expect(lines[0]).toBe('ATMO');
    expect(lines).toContain('CONDITIONS');
    expect(lines.find((line) => line.startsWith('WIND'))).toMatch(/^WIND {12}\(180\/40\)/);
    expect(lines).toContain('CRS             90 DEG');
    expect(lines).toContain('TEMP            ISA +10 C   SAT -44 C');
    expect(lines).toContain('GROSS WGHT      400.0 T');
    expect(lines).toContain('COMPUTATION     SPEED');
    expect(lines).toContain('SPD TYPE        MACH');
    expect(lines).toContain('MACH            0.85');
    expect(lines).toContain('INDICATED ALT   35000 FT');
    expect(lines).toContain('ARPT ELEVN      500 FT');
    expect(lines).toContain('RESULTS');
    expect(lines).toContain('CONVERSIONS');
    expect(lines.filter((line) => line.startsWith('TAS '))).toHaveLength(1);
    expect(lines).toContain('ISA INFORMATION');
    expect(lines[lines.length - 1]).toBe('END');
  });

  it('prints the IAS of an IAS conversion and the unit of the gross weight', () => {
    const session = speedSession();
    session.speedType.set(1);
    session.ias.set(280);
    session.wind.set({ headwindKt: 20 });
    const lines = inFltPerfPrintout(session, 'klbs')!.text.split('\n');
    expect(lines).toContain('SPD TYPE        IAS');
    expect(lines).toContain('IAS             280 KT');
    expect(lines).toContain('GROSS WGHT      400.0 klbs');
    expect(lines).toContain('WIND            HD20');
    expect(lines.some((line) => line.startsWith('CRS'))).toBe(false);
    // only the MACH of the results, not the MACH entry
    expect(lines.filter((line) => line.startsWith('MACH '))).toHaveLength(1);
  });

  it('prints the fields of the true altitude computation only', () => {
    const session = new InFltPerfAtmoSession();
    session.computationType.set(1);
    session.temperature.set({ isaDeviationC: 10 });
    session.indicatedAltitude.set(35_000);
    session.airportElevation.set(0);
    session.results.set({ kind: 'true alt', results: computeAtmoTrueAltitude(10, 35_000, 0).results! });
    const lines = inFltPerfPrintout(session, 'T')!.text.split('\n');
    expect(lines).toContain('COMPUTATION     ALT (STD)');
    expect(lines).toContain('ALT TYPE        TRUE ALT (STD)');
    expect(lines.find((line) => line.startsWith('TRUE ALT '))).toMatch(/^TRUE ALT {8}FL\d{3}$/);
    expect(lines.some((line) => line.startsWith('WIND') || line.startsWith('GROSS WGHT'))).toBe(false);
  });

  it('prints the low altitude correction with its own entries and no conditions', () => {
    const session = new InFltPerfAtmoSession();
    session.computationType.set(1);
    session.altType.set(1);
    session.heightAal.set(2000);
    session.airportElevation.set(1000);
    session.airportTemperature.set(-20);
    session.results.set({
      kind: 'lo alt',
      results: computeAtmoLowAltitudeCorrection(2000, 1000, -20).results!,
    });
    const text = inFltPerfPrintout(session, 'T')!.text;
    const lines = text.split('\n');
    expect(lines).not.toContain('CONDITIONS');
    expect(lines).toContain('ALT TYPE        LO ALT TEMP CORR');
    expect(lines).toContain('HGT AAL         2000 FT');
    expect(lines).toContain('ARPT TEMP       -20 C');
    expect(text).toContain('LOW ALTITUDE TEMPERATURE CORRECTIONS');
    expect(lines.find((line) => line.startsWith('CORR HGT AAL'))).toMatch(/^CORR HGT AAL {4}\d+ FT$/);
  });

  it('marks an entry the page lacks', () => {
    const session = speedSession();
    session.grossWeight.set(null);
    expect(inFltPerfPrintout(session, 'T')!.text).toContain('GROSS WGHT      ---');
  });
});
