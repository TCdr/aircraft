// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  atmoIsaDeviation,
  atmoSat,
  atmoWindComponents,
  computeAtmoLowAltitudeCorrection,
  computeAtmoSpeedConversions,
  computeAtmoTrueAltitude,
  densityRatio,
  formatAtmoTrueAltitude,
  formatAtmoWind,
  iasFromMach,
  isaDeviationFromSat,
  isaTemperatureC,
  lowAltitudeTemperatureCorrectionFt,
  machFromIas,
  parseAtmoAltitude,
  parseAtmoWind,
  speedOfSoundKt,
  standardPressureHpa,
  totalAirTemperatureC,
  trueAltitudeFt,
} from './InFltPerfAtmo';

describe('ISA', () => {
  it('gives the standard atmosphere table values', () => {
    // [pressure altitude ft, temperature °C, pressure hPa]
    const table: [number, number, number][] = [
      [0, 15, 1013.25],
      [10_000, -4.8, 696.8],
      [20_000, -24.6, 465.6],
      [30_000, -44.4, 300.9],
      [36_089, -56.5, 226.3],
      [40_000, -56.5, 187.5],
    ];
    for (const [altitude, temperature, pressure] of table) {
      expect(isaTemperatureC(altitude)).toBeCloseTo(temperature, 1);
      expect(standardPressureHpa(altitude)).toBeCloseTo(pressure, 0);
    }
  });

  it('gives a density ratio of 1, the sea level speed of sound and IAS = TAS at ISA sea level', () => {
    expect(densityRatio(0, 15)).toBeCloseTo(1, 6);
    expect(speedOfSoundKt(15)).toBeCloseTo(661.5, 1);
    expect(iasFromMach(0.5, 0)).toBeCloseTo(0.5 * 661.48, 1);
  });

  it('converts Mach to IAS and back', () => {
    for (const altitude of [5_000, 25_000, 39_000]) {
      expect(machFromIas(iasFromMach(0.82, altitude), altitude)).toBeCloseTo(0.82, 6);
    }
  });

  it('converts a SAT at the pressure altitude into an ISA deviation', () => {
    expect(isaDeviationFromSat(-44, 35_000)).toBeCloseTo(10.3, 1);
    expect(isaDeviationFromSat(-56.5, 41_000)).toBeCloseTo(0, 6);
  });

  it('takes the TEMP entry as an ISA deviation or as a SAT at the indicated altitude', () => {
    expect(atmoIsaDeviation({ isaDeviationC: 10 }, null)).toBe(10);
    expect(atmoIsaDeviation({ satC: -44 }, 35_000)).toBeCloseTo(10.3, 1);
    expect(atmoIsaDeviation({ satC: -44 }, null)).toBeNull();
    expect(atmoIsaDeviation(null, 35_000)).toBeNull();
    expect(atmoSat({ isaDeviationC: 10 }, 35_000)).toBeCloseTo(-44.3, 1);
    expect(atmoSat({ isaDeviationC: 10 }, null)).toBeNull();
    expect(atmoSat({ satC: -44 }, null)).toBe(-44);
  });

  it('gives a TAT above the SAT, more at a higher Mach', () => {
    expect(totalAirTemperatureC(-44, 0)).toBeCloseTo(-44, 6);
    expect(totalAirTemperatureC(-44, 0.85)).toBeGreaterThan(totalAirTemperatureC(-44, 0.78));
  });
});

describe('ATMO SPEED computation', () => {
  it('gives the published example: M.85 at FL350, ISA+10, wind 180/10 on course 180', () => {
    const computation = computeAtmoSpeedConversions({
      wind: parseAtmoWind('180/10'),
      courseDeg: 180,
      isaDeviationC: 10,
      speedType: 'MACH',
      speed: 0.85,
      indicatedAltitudeFt: 35_000,
      airportElevationFt: 0,
    });
    const results = computation.results!;
    expect(Math.round(results.iasKt)).toBe(291);
    expect(results.mach).toBe(0.85);
    expect(Math.round(results.tasKt)).toBe(501);
    expect(Math.round(results.gsKt)).toBe(491);
    expect(formatAtmoTrueAltitude(results.trueAltitudeFt)).toBe('FL365');
    expect(Math.round(results.pressureHpa)).toBe(238);
    expect(results.densityRatio.toFixed(4)).toBe('0.2963');
    // 589.4 kt here: the published 590 kt is within its rounding (its TAS of 501 kt is M.85 x 589.4 kt)
    expect(Math.abs(results.speedOfSoundKt - 590)).toBeLessThan(1);
    expect(Math.round(results.satC)).toBe(-44);
    expect(Math.round(results.tatC)).toBe(-11);
  });

  it('starts from an IAS as well', () => {
    const results = computeAtmoSpeedConversions({
      wind: { headwindKt: -20 },
      courseDeg: null,
      isaDeviationC: 10,
      speedType: 'IAS',
      speed: 291,
      indicatedAltitudeFt: 35_000,
      airportElevationFt: 0,
    }).results!;
    expect(results.mach).toBeCloseTo(0.85, 2);
    expect(Math.round(results.gsKt)).toBe(Math.round(results.tasKt) + 20);
  });

  it('lists the missing parameters, the course only for a direction/speed wind', () => {
    const empty = {
      wind: null,
      courseDeg: null,
      isaDeviationC: null,
      speedType: 'MACH' as const,
      speed: null,
      indicatedAltitudeFt: null,
      airportElevationFt: null,
    };
    expect(computeAtmoSpeedConversions(empty).errors).toEqual([
      'Missing parameter WIND',
      'Missing parameter TEMP',
      'Missing parameter MACH',
      'Missing parameter INDICATED ALT',
      'Missing parameter ARPT ELEVN',
    ]);
    const noCourse = computeAtmoSpeedConversions({
      ...empty,
      wind: parseAtmoWind('250/30'),
      isaDeviationC: 0,
      speed: 0.8,
      indicatedAltitudeFt: 30_000,
      airportElevationFt: 0,
    });
    expect(noCourse.results).toBeNull();
    expect(noCourse.errors).toEqual(['Missing parameter CRS']);
  });

  it('refuses an IAS that is supersonic at the altitude', () => {
    const computation = computeAtmoSpeedConversions({
      wind: { headwindKt: 0 },
      courseDeg: null,
      isaDeviationC: 0,
      speedType: 'IAS',
      speed: 400,
      indicatedAltitudeFt: 45_000,
      airportElevationFt: 0,
    });
    expect(computation.results).toBeNull();
  });
});

describe('ATMO true altitude for high altitude use', () => {
  it('equals the indicated altitude in ISA', () => {
    expect(trueAltitudeFt(35_000, 0, 0)).toBeCloseTo(35_000, 6);
  });

  it('is higher in a warm air column, lower in a cold one, also above the tropopause', () => {
    expect(trueAltitudeFt(35_000, 10, 0)).toBeCloseTo(36_390, -1);
    expect(trueAltitudeFt(41_000, -10, 0)).toBeLessThan(41_000 - 1_500);
  });

  it('is lower for a higher airport with a positive ISA, higher with a negative ISA', () => {
    expect(trueAltitudeFt(35_000, 10, 5_000)).toBeLessThan(trueAltitudeFt(35_000, 10, 0));
    expect(trueAltitudeFt(35_000, -10, 5_000)).toBeGreaterThan(trueAltitudeFt(35_000, -10, 0));
  });

  it('gives the ISA information with the true altitude', () => {
    const results = computeAtmoTrueAltitude(10, 35_000, 0).results!;
    expect(formatAtmoTrueAltitude(results.trueAltitudeFt)).toBe('FL365');
    expect(Math.round(results.pressureHpa)).toBe(238);
    expect(Math.round(results.satC)).toBe(-44);
    expect(computeAtmoTrueAltitude(null, null, 0).errors).toEqual([
      'Missing parameter TEMP',
      'Missing parameter INDICATED ALT',
    ]);
  });
});

describe('ATMO low altitude temperature corrections', () => {
  it('gives the published Airbus low altitude table (sea level airport)', () => {
    const heights = [200, 300, 400, 500, 1_000, 2_000, 3_000, 4_000, 5_000];
    // airport temperature °C -> the values to add to the minimum promulgated heights above
    const table: [number, number[]][] = [
      [0, [20, 20, 30, 30, 60, 120, 170, 230, 280]],
      [-10, [20, 30, 40, 50, 100, 200, 290, 390, 490]],
      [-20, [30, 50, 60, 70, 140, 280, 420, 570, 710]],
      [-30, [40, 60, 80, 100, 190, 380, 570, 760, 950]],
      [-40, [50, 80, 100, 120, 240, 480, 720, 970, 1_210]],
      [-50, [60, 90, 120, 150, 300, 590, 890, 1_190, 1_500]],
    ];
    for (const [temperature, corrections] of table) {
      expect(heights.map((height) => lowAltitudeTemperatureCorrectionFt(height, 0, temperature))).toEqual(corrections);
    }
  });

  it('is slightly lower for a higher airport, higher for a colder airport or a higher height', () => {
    const seaLevel = lowAltitudeTemperatureCorrectionFt(3_000, 0, -30);
    const elevated = lowAltitudeTemperatureCorrectionFt(3_000, 2_000, -30);
    expect(elevated).toBeLessThan(seaLevel);
    expect(elevated).toBeGreaterThan(seaLevel * 0.8);
    expect(lowAltitudeTemperatureCorrectionFt(3_000, 0, -40)).toBeGreaterThan(seaLevel);
    expect(lowAltitudeTemperatureCorrectionFt(4_000, 0, -30)).toBeGreaterThan(seaLevel);
  });

  it('gives no correction for an airport at or above ISA', () => {
    expect(lowAltitudeTemperatureCorrectionFt(1_000, 0, 15)).toBe(0);
    expect(lowAltitudeTemperatureCorrectionFt(1_000, 0, 30)).toBe(0);
  });

  it('gives the correction and the corrected height', () => {
    expect(computeAtmoLowAltitudeCorrection(1_000, 0, -30).results).toEqual({
      correctionFt: 190,
      correctedHeightAalFt: 1_190,
    });
    expect(computeAtmoLowAltitudeCorrection(null, 0, null).errors).toEqual([
      'Missing parameter HGT AAL',
      'Missing parameter ARPT TEMP',
    ]);
  });
});

describe('ATMO entries', () => {
  it('reads a longitudinal wind with H/HD/T/TL before or after the speed', () => {
    expect(parseAtmoWind('20HD')).toEqual({ headwindKt: 20 });
    expect(parseAtmoWind('h15')).toEqual({ headwindKt: 15 });
    expect(parseAtmoWind('TL30')).toEqual({ headwindKt: -30 });
    expect(parseAtmoWind('5T')).toEqual({ headwindKt: -5 });
  });

  it('reads a direction/speed wind and refuses anything else', () => {
    expect(parseAtmoWind('180/10')).toEqual({ directionDeg: 180, speedKt: 10 });
    expect(parseAtmoWind('360/25')).toEqual({ directionDeg: 0, speedKt: 25 });
    for (const wrong of ['', 'ABC', '20X', '361/10', '180/300', '300HD', '18010']) {
      expect(parseAtmoWind(wrong)).toBeNull();
    }
  });

  it('projects a direction/speed on the course: crosswind R from the right, L from the left', () => {
    const fromRight = atmoWindComponents({ directionDeg: 90, speedKt: 20 }, 360);
    expect(fromRight.headwindKt).toBeCloseTo(0, 6);
    expect(fromRight.crosswindKt).toBeCloseTo(20, 6);
    expect(formatAtmoWind({ directionDeg: 90, speedKt: 20 }, 360)).toBe('(090/20) HD0 R20');
    expect(formatAtmoWind({ directionDeg: 300, speedKt: 20 }, 180)).toBe('(300/20) TL10 R17');
    expect(formatAtmoWind({ directionDeg: 60, speedKt: 20 }, 180)).toBe('(060/20) TL10 L17');
    expect(formatAtmoWind({ directionDeg: 180, speedKt: 10 }, 180)).toBe('(180/10) HD10');
    expect(formatAtmoWind({ directionDeg: 180, speedKt: 10 }, null)).toBe('(180/10)');
    expect(formatAtmoWind({ headwindKt: -12 }, null)).toBe('TL12');
  });

  it('reads an altitude in feet or as a flight level', () => {
    expect(parseAtmoAltitude('35000')).toBe(35_000);
    expect(parseAtmoAltitude('FL350')).toBe(35_000);
    expect(parseAtmoAltitude('-500')).toBe(-500);
    expect(parseAtmoAltitude('FL')).toBeNull();
    expect(parseAtmoAltitude('35.000')).toBeNull();
  });

  it('shows a true altitude as a flight level in steps of 5', () => {
    expect(formatAtmoTrueAltitude(36_390)).toBe('FL365');
    expect(formatAtmoTrueAltitude(36_200)).toBe('FL360');
    expect(formatAtmoTrueAltitude(9_800)).toBe('FL100');
  });
});
