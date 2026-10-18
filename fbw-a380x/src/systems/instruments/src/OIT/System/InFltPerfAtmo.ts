// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ATMO module of the IN-FLT PERF application, in the International Standard Atmosphere (ISA):
 * - SPEED: speed conversions (IAS, MACH, TAS, GS, true altitude) and the ISA information
 * - ALT (STD), TRUE ALT (STD): true altitude for high altitude use and the ISA information
 * - ALT (STD), LO ALT TEMP CORR: the correction to add to a minimum promulgated height in a cold airport temperature
 * The IAS is the airspeed of a perfect instrument (calibrated airspeed): the module has no position error data.
 */

const FEET_TO_METRES = 0.3048;
const KNOTS_TO_METRES_PER_SECOND = 1852 / 3600;
const CELSIUS_TO_KELVIN = 273.15;

const SEA_LEVEL_TEMPERATURE_K = 288.15;
const SEA_LEVEL_PRESSURE_HPA = 1013.25;
const GRAVITY = 9.80665;
const AIR_GAS_CONSTANT = 287.05287;
const AIR_HEAT_CAPACITY_RATIO = 1.4;

const LAPSE_RATE_K_PER_METRE = 0.0065;
const LAPSE_RATE_K_PER_FOOT = LAPSE_RATE_K_PER_METRE * FEET_TO_METRES;
const TROPOPAUSE_FT = 11_000 / FEET_TO_METRES;
const TROPOPAUSE_TEMPERATURE_K = SEA_LEVEL_TEMPERATURE_K - LAPSE_RATE_K_PER_METRE * 11_000;
const PRESSURE_EXPONENT = GRAVITY / (AIR_GAS_CONSTANT * LAPSE_RATE_K_PER_METRE);
const TROPOPAUSE_PRESSURE_HPA =
  SEA_LEVEL_PRESSURE_HPA * Math.pow(TROPOPAUSE_TEMPERATURE_K / SEA_LEVEL_TEMPERATURE_K, PRESSURE_EXPONENT);

const SPEED_OF_SOUND_KT_PER_ROOT_KELVIN =
  Math.sqrt(AIR_HEAT_CAPACITY_RATIO * AIR_GAS_CONSTANT) / KNOTS_TO_METRES_PER_SECOND;
const SEA_LEVEL_SPEED_OF_SOUND_KT = SPEED_OF_SOUND_KT_PER_ROOT_KELVIN * Math.sqrt(SEA_LEVEL_TEMPERATURE_K);

/** Entry limits of the ATMO fields. Design choice: wide enough for any A380 use, narrow enough to catch typos. */
export const AtmoLimits = {
  minAltitudeFt: -1_000,
  maxAltitudeFt: 45_000,
  maxIsaDeviationC: 60,
  minSatC: -99,
  maxSatC: 60,
  maxWindKt: 250,
  minMach: 0.1,
  maxMach: 0.99,
  minIasKt: 60,
  maxIasKt: 400,
  minElevationFt: -1_000,
  maxElevationFt: 15_000,
  maxHeightAalFt: 10_000,
  minAirportTempC: -70,
  maxAirportTempC: 60,
};

/**
 * The FBW A380X empty weight and structural MTOW in kg, the limits of the gross weight entry (as the takeoff
 * performance calculator uses them; not imported from it, which would bring its charts into the OIT).
 */
export const ATMO_MIN_GROSS_WEIGHT_KG = 300_006;
export const ATMO_MAX_GROSS_WEIGHT_KG = 510_000;

/**
 * @param pressureAltitudeFt the pressure altitude in ft
 * @returns the ISA temperature in kelvin at a pressure altitude
 */
function isaTemperatureK(pressureAltitudeFt: number): number {
  return pressureAltitudeFt <= TROPOPAUSE_FT
    ? SEA_LEVEL_TEMPERATURE_K - LAPSE_RATE_K_PER_FOOT * pressureAltitudeFt
    : TROPOPAUSE_TEMPERATURE_K;
}

/**
 * @param pressureAltitudeFt the pressure altitude in ft
 * @returns the ISA temperature in °C at a pressure altitude
 */
export function isaTemperatureC(pressureAltitudeFt: number): number {
  return isaTemperatureK(pressureAltitudeFt) - CELSIUS_TO_KELVIN;
}

/**
 * @param pressureAltitudeFt the pressure altitude in ft
 * @returns the standard pressure in hPa at a pressure altitude
 */
export function standardPressureHpa(pressureAltitudeFt: number): number {
  if (pressureAltitudeFt <= TROPOPAUSE_FT) {
    return (
      SEA_LEVEL_PRESSURE_HPA *
      Math.pow(isaTemperatureK(pressureAltitudeFt) / SEA_LEVEL_TEMPERATURE_K, PRESSURE_EXPONENT)
    );
  }
  const metresAboveTropopause = (pressureAltitudeFt - TROPOPAUSE_FT) * FEET_TO_METRES;
  return (
    TROPOPAUSE_PRESSURE_HPA *
    Math.exp((-GRAVITY * metresAboveTropopause) / (AIR_GAS_CONSTANT * TROPOPAUSE_TEMPERATURE_K))
  );
}

/**
 * @param satC the static air temperature in °C
 * @returns the speed of sound in kt at a static air temperature
 */
export function speedOfSoundKt(satC: number): number {
  return SPEED_OF_SOUND_KT_PER_ROOT_KELVIN * Math.sqrt(satC + CELSIUS_TO_KELVIN);
}

/**
 * @param pressureAltitudeFt the pressure altitude in ft
 * @param satC the static air temperature in °C
 * @returns the density ratio (density / ISA sea level density) at a pressure altitude and static air temperature
 */
export function densityRatio(pressureAltitudeFt: number, satC: number): number {
  return (
    standardPressureHpa(pressureAltitudeFt) /
    SEA_LEVEL_PRESSURE_HPA /
    ((satC + CELSIUS_TO_KELVIN) / SEA_LEVEL_TEMPERATURE_K)
  );
}

/**
 * @param mach the Mach number
 * @param pressureAltitudeFt the pressure altitude in ft
 * @returns the IAS in kt of a Mach number at a pressure altitude (subsonic)
 */
export function iasFromMach(mach: number, pressureAltitudeFt: number): number {
  const impactPressureHpa = standardPressureHpa(pressureAltitudeFt) * (Math.pow(1 + 0.2 * mach * mach, 3.5) - 1);
  return (
    SEA_LEVEL_SPEED_OF_SOUND_KT * Math.sqrt(5 * (Math.pow(impactPressureHpa / SEA_LEVEL_PRESSURE_HPA + 1, 2 / 7) - 1))
  );
}

/**
 * @param iasKt the IAS in kt
 * @param pressureAltitudeFt the pressure altitude in ft
 * @returns the Mach number of an IAS in kt at a pressure altitude (subsonic)
 */
export function machFromIas(iasKt: number, pressureAltitudeFt: number): number {
  const iasRatio = iasKt / SEA_LEVEL_SPEED_OF_SOUND_KT;
  const impactPressureHpa = SEA_LEVEL_PRESSURE_HPA * (Math.pow(1 + 0.2 * iasRatio * iasRatio, 3.5) - 1);
  return Math.sqrt(5 * (Math.pow(impactPressureHpa / standardPressureHpa(pressureAltitudeFt) + 1, 2 / 7) - 1));
}

/**
 * @param satC the static air temperature in °C
 * @param mach the Mach number
 * @returns the total air temperature in °C (full recovery) at a static air temperature and Mach number
 */
export function totalAirTemperatureC(satC: number, mach: number): number {
  return (satC + CELSIUS_TO_KELVIN) * (1 + 0.2 * mach * mach) - CELSIUS_TO_KELVIN;
}

/**
 * @param fromFt the lower pressure altitude in ft
 * @param toFt the upper pressure altitude in ft
 * @returns the integral of dh / T_ISA(h) between two pressure altitudes, in ft per kelvin
 */
function inverseIsaTemperatureIntegral(fromFt: number, toFt: number): number {
  if (toFt < fromFt) {
    return -inverseIsaTemperatureIntegral(toFt, fromFt);
  }
  const belowTropopauseTo = Math.min(toFt, TROPOPAUSE_FT);
  let integral = 0;
  if (fromFt < belowTropopauseTo) {
    integral += Math.log(isaTemperatureK(fromFt) / isaTemperatureK(belowTropopauseTo)) / LAPSE_RATE_K_PER_FOOT;
  }
  const aboveTropopauseFrom = Math.max(fromFt, TROPOPAUSE_FT);
  if (toFt > aboveTropopauseFrom) {
    integral += (toFt - aboveTropopauseFrom) / TROPOPAUSE_TEMPERATURE_K;
  }
  return integral;
}

/**
 * The true altitude: the air column between the airport and the aircraft is ISA + deviation, so each pressure layer
 * dh is dh * T / T_ISA thick. A positive deviation raises the true altitude; a higher airport lowers it (the column is
 * shorter), and the reverse for a negative deviation.
 * @param indicatedAltitudeFt the pressure altitude
 * @param isaDeviationC the ISA deviation of the air column
 * @param airportElevationFt the elevation of the intended airport (0 for high altitude use)
 * @returns the true altitude in ft
 */
export function trueAltitudeFt(indicatedAltitudeFt: number, isaDeviationC: number, airportElevationFt: number): number {
  return indicatedAltitudeFt + isaDeviationC * inverseIsaTemperatureIntegral(airportElevationFt, indicatedAltitudeFt);
}

/**
 * The altitude correction to add to a minimum promulgated height in a low airport temperature: the ICAO cold
 * temperature correction, whose sea level values are the published Airbus low altitude table. Only a temperature
 * below ISA needs a correction; a warmer airport gives none.
 * @param heightAalFt the minimum promulgated height above the airport (the altimeter setting source)
 * @param airportElevationFt the airport elevation
 * @param airportTemperatureC the outside air temperature at the airport
 * @returns the correction in ft, rounded up to the next 10 ft like the published table
 */
export function lowAltitudeTemperatureCorrectionFt(
  heightAalFt: number,
  airportElevationFt: number,
  airportTemperatureC: number,
): number {
  const heightM = heightAalFt * FEET_TO_METRES;
  const elevationM = airportElevationFt * FEET_TO_METRES;
  const seaLevelTemperatureC = airportTemperatureC + LAPSE_RATE_K_PER_METRE * elevationM;
  const correctionM =
    (heightM * (15 - seaLevelTemperatureC)) /
    (273 + seaLevelTemperatureC - 0.5 * LAPSE_RATE_K_PER_METRE * (heightM + elevationM));
  if (correctionM <= 0) {
    return 0;
  }
  // The small epsilon keeps a value that is exactly a multiple of 10 ft from going up a step by rounding noise.
  return Math.ceil(correctionM / FEET_TO_METRES / 10 - 1e-9) * 10;
}

/**
 * @param satC the static air temperature in °C
 * @param pressureAltitudeFt the pressure altitude in ft
 * @returns the ISA deviation of a static air temperature at a pressure altitude
 */
export function isaDeviationFromSat(satC: number, pressureAltitudeFt: number): number {
  return satC - isaTemperatureC(pressureAltitudeFt);
}

/** The TEMP entry: an ISA deviation, or a SAT at the pressure altitude */
export type AtmoTemperature = { readonly isaDeviationC: number } | { readonly satC: number };

/**
 * @param temperature the TEMP entry
 * @param pressureAltitudeFt the INDICATED ALT entry, which converts a SAT into an ISA deviation
 * @returns the ISA deviation, null without an entry or for a SAT without the altitude
 */
export function atmoIsaDeviation(
  temperature: AtmoTemperature | null,
  pressureAltitudeFt: number | null,
): number | null {
  if (temperature === null) {
    return null;
  }
  if ('isaDeviationC' in temperature) {
    return temperature.isaDeviationC;
  }
  return pressureAltitudeFt === null ? null : isaDeviationFromSat(temperature.satC, pressureAltitudeFt);
}

/**
 * @param temperature the TEMP entry
 * @param pressureAltitudeFt the INDICATED ALT entry
 * @returns the SAT, null without an entry or for an ISA deviation without the altitude
 */
export function atmoSat(temperature: AtmoTemperature | null, pressureAltitudeFt: number | null): number | null {
  if (temperature === null) {
    return null;
  }
  if ('satC' in temperature) {
    return temperature.satC;
  }
  return pressureAltitudeFt === null ? null : isaTemperatureC(pressureAltitudeFt) + temperature.isaDeviationC;
}

/** A wind entry: a longitudinal component, or a direction/speed projected on the course */
export type AtmoWind = { headwindKt: number } | { directionDeg: number; speedKt: number };

/**
 * Wind entries: a longitudinal component with H or HD for a headwind and T or TL for a tailwind (before or after the
 * speed, e.g. 20HD, T15), or a direction/speed (e.g. 180/10).
 * @param input the text entered
 * @returns the wind, or null for a format or range error
 */
export function parseAtmoWind(input: string): AtmoWind | null {
  const text = input.trim().toUpperCase();
  const component = text.match(/^(\d{1,3})(HD|TL|H|T)$/) ?? text.match(/^(HD|TL|H|T)(\d{1,3})$/);
  if (component) {
    const speedFirst = /\d/.test(component[1]);
    const speed = Number(speedFirst ? component[1] : component[2]);
    const code = speedFirst ? component[2] : component[1];
    if (speed > AtmoLimits.maxWindKt) {
      return null;
    }
    return { headwindKt: code.charAt(0) === 'H' ? speed : -speed };
  }
  const vector = text.match(/^(\d{1,3})\/(\d{1,3})$/);
  if (vector) {
    const directionDeg = Number(vector[1]);
    const speedKt = Number(vector[2]);
    if (directionDeg > 360 || speedKt > AtmoLimits.maxWindKt) {
      return null;
    }
    return { directionDeg: directionDeg % 360, speedKt };
  }
  return null;
}

/**
 * @param wind the WIND entry
 * @returns whether the wind is a direction/speed, which needs the course (the CRS field)
 */
export function isDirectionSpeedWind(wind: AtmoWind | null): wind is { directionDeg: number; speedKt: number } {
  return wind !== null && 'directionDeg' in wind;
}

/**
 * @param wind the wind
 * @param courseDeg the course the direction/speed is projected on
 * @returns the headwind (negative: tailwind) and the crosswind (positive: from the right) in kt
 */
export function atmoWindComponents(wind: AtmoWind, courseDeg: number): { headwindKt: number; crosswindKt: number } {
  if (!isDirectionSpeedWind(wind)) {
    return { headwindKt: wind.headwindKt, crosswindKt: 0 };
  }
  const angle = ((wind.directionDeg - courseDeg) * Math.PI) / 180;
  return { headwindKt: wind.speedKt * Math.cos(angle), crosswindKt: wind.speedKt * Math.sin(angle) };
}

/**
 * The WIND field: HD (headwind) or TL (tailwind) and the component, with the direction/speed entry in brackets and the
 * crosswind R (from the right) or L (from the left) when the entry was a direction/speed.
 * @param wind the wind
 * @param courseDeg the course, null when not entered
 * @returns the field text
 */
export function formatAtmoWind(wind: AtmoWind, courseDeg: number | null): string {
  const longitudinal = (headwindKt: number) =>
    `${Math.round(headwindKt) < 0 ? 'TL' : 'HD'}${Math.abs(Math.round(headwindKt)).toFixed(0)}`;
  if (!isDirectionSpeedWind(wind)) {
    return longitudinal(wind.headwindKt);
  }
  const entry = `(${wind.directionDeg.toFixed(0).padStart(3, '0')}/${wind.speedKt.toFixed(0)})`;
  if (courseDeg === null) {
    return entry;
  }
  const { headwindKt, crosswindKt } = atmoWindComponents(wind, courseDeg);
  const crosswind = Math.round(crosswindKt);
  const crosswindText = crosswind === 0 ? '' : ` ${crosswind > 0 ? 'R' : 'L'}${Math.abs(crosswind).toFixed(0)}`;
  return `${entry} ${longitudinal(headwindKt)}${crosswindText}`;
}

/**
 * Altitude entries: feet (35000, -500) or a flight level (FL350).
 * @param input the text entered
 * @returns the altitude in ft, or null for a format error (the range is checked by the caller)
 */
export function parseAtmoAltitude(input: string): number | null {
  const text = input.trim().toUpperCase();
  const flightLevel = text.match(/^FL(\d{1,3})$/);
  if (flightLevel) {
    return Number(flightLevel[1]) * 100;
  }
  return /^[+-]?\d{1,5}$/.test(text) ? Number(text) : null;
}

/**
 * True altitudes are shown as flight levels in steps of 5 (500 ft). Design choice: the published example (FL350 at
 * ISA+10, 36 390 ft) shows FL365, which the nearest 500 ft gives.
 * @param altitudeFt the true altitude
 * @returns e.g. FL365
 */
export function formatAtmoTrueAltitude(altitudeFt: number): string {
  return `FL${(Math.round(altitudeFt / 500) * 5).toFixed(0).padStart(3, '0')}`;
}

export type AtmoSpeedType = 'MACH' | 'IAS';

export interface AtmoSpeedInputs {
  readonly wind: AtmoWind | null;
  readonly courseDeg: number | null;
  readonly isaDeviationC: number | null;
  readonly speedType: AtmoSpeedType;
  /** The Mach number or the IAS in kt, as per the speed type */
  readonly speed: number | null;
  readonly indicatedAltitudeFt: number | null;
  readonly airportElevationFt: number | null;
}

export interface AtmoIsaInformation {
  readonly trueAltitudeFt: number;
  readonly pressureHpa: number;
  readonly densityRatio: number;
  readonly speedOfSoundKt: number;
  readonly satC: number;
}

export interface AtmoSpeedResults extends AtmoIsaInformation {
  readonly iasKt: number;
  readonly mach: number;
  readonly tasKt: number;
  readonly gsKt: number;
  readonly tatC: number;
}

export interface AtmoLowAltitudeResults {
  readonly correctionFt: number;
  readonly correctedHeightAalFt: number;
}

/** A computation: the results, or the names of the missing or wrong parameters */
export type AtmoComputation<T> =
  | { readonly results: T; readonly errors: [] }
  | { readonly results: null; readonly errors: string[] };

/**
 * @param errors the missing or wrong parameters
 * @returns a failed computation
 */
function failed<T>(errors: string[]): AtmoComputation<T> {
  return { results: null, errors };
}

/**
 * @param name the field name, as labelled
 * @returns the RESULTS panel line of a missing entry
 */
function missing(name: string): string {
  return `Missing parameter ${name}`;
}

/**
 * @param indicatedAltitudeFt the pressure altitude in ft
 * @param isaDeviationC the ISA deviation of the air column in °C
 * @param airportElevationFt the elevation of the intended airport in ft
 * @returns the ISA INFORMATION of the RESULTS panel
 */
function isaInformation(
  indicatedAltitudeFt: number,
  isaDeviationC: number,
  airportElevationFt: number,
): AtmoIsaInformation {
  const satC = isaTemperatureC(indicatedAltitudeFt) + isaDeviationC;
  return {
    trueAltitudeFt: trueAltitudeFt(indicatedAltitudeFt, isaDeviationC, airportElevationFt),
    pressureHpa: standardPressureHpa(indicatedAltitudeFt),
    densityRatio: densityRatio(indicatedAltitudeFt, satC),
    speedOfSoundKt: speedOfSoundKt(satC),
    satC,
  };
}

/**
 * COMPUTATION TYPE SPEED: the speed conversions and the ISA information.
 * @param inputs the CONDITIONS and SPECIFIC DATA entries
 * @returns the results, or the missing parameters
 */
export function computeAtmoSpeedConversions(inputs: AtmoSpeedInputs): AtmoComputation<AtmoSpeedResults> {
  const errors: string[] = [];
  if (inputs.wind === null) {
    errors.push(missing('WIND'));
  } else if (isDirectionSpeedWind(inputs.wind) && inputs.courseDeg === null) {
    errors.push(missing('CRS'));
  }
  if (inputs.isaDeviationC === null) {
    errors.push(missing('TEMP'));
  }
  if (inputs.speed === null) {
    errors.push(missing(inputs.speedType));
  }
  if (inputs.indicatedAltitudeFt === null) {
    errors.push(missing('INDICATED ALT'));
  }
  if (inputs.airportElevationFt === null) {
    errors.push(missing('ARPT ELEVN'));
  }
  if (
    inputs.wind === null ||
    inputs.isaDeviationC === null ||
    inputs.speed === null ||
    inputs.indicatedAltitudeFt === null ||
    inputs.airportElevationFt === null ||
    errors.length > 0
  ) {
    return failed(errors);
  }

  const altitudeFt = inputs.indicatedAltitudeFt;
  const mach = inputs.speedType === 'MACH' ? inputs.speed : machFromIas(inputs.speed, altitudeFt);
  if (mach >= 1) {
    return failed([`${inputs.speedType} out of range: supersonic at this altitude`]);
  }
  const iasKt = inputs.speedType === 'IAS' ? inputs.speed : iasFromMach(mach, altitudeFt);
  const isa = isaInformation(altitudeFt, inputs.isaDeviationC, inputs.airportElevationFt);
  const tasKt = mach * isa.speedOfSoundKt;
  const { headwindKt } = atmoWindComponents(inputs.wind, inputs.courseDeg ?? 0);

  return {
    results: { ...isa, iasKt, mach, tasKt, gsKt: tasKt - headwindKt, tatC: totalAirTemperatureC(isa.satC, mach) },
    errors: [],
  };
}

/**
 * COMPUTATION TYPE ALT (STD), TRUE ALT (STD): the true altitude for high altitude use and the ISA information.
 * @param isaDeviationC the TEMP entry
 * @param indicatedAltitudeFt the INDICATED ALT entry
 * @param airportElevationFt the ARPT ELEVN entry
 * @returns the results, or the missing parameters
 */
export function computeAtmoTrueAltitude(
  isaDeviationC: number | null,
  indicatedAltitudeFt: number | null,
  airportElevationFt: number | null,
): AtmoComputation<AtmoIsaInformation> {
  const errors: string[] = [];
  if (isaDeviationC === null) {
    errors.push(missing('TEMP'));
  }
  if (indicatedAltitudeFt === null) {
    errors.push(missing('INDICATED ALT'));
  }
  if (airportElevationFt === null) {
    errors.push(missing('ARPT ELEVN'));
  }
  if (isaDeviationC === null || indicatedAltitudeFt === null || airportElevationFt === null) {
    return failed(errors);
  }
  return { results: isaInformation(indicatedAltitudeFt, isaDeviationC, airportElevationFt), errors: [] };
}

/**
 * COMPUTATION TYPE ALT (STD), LO ALT TEMP CORR: no outside conditions, only the airport data.
 * @param heightAalFt the HGT AAL entry
 * @param airportElevationFt the ARPT ELEVN entry
 * @param airportTemperatureC the ARPT TEMP entry
 * @returns the results, or the missing parameters
 */
export function computeAtmoLowAltitudeCorrection(
  heightAalFt: number | null,
  airportElevationFt: number | null,
  airportTemperatureC: number | null,
): AtmoComputation<AtmoLowAltitudeResults> {
  const errors: string[] = [];
  if (heightAalFt === null) {
    errors.push(missing('HGT AAL'));
  }
  if (airportElevationFt === null) {
    errors.push(missing('ARPT ELEVN'));
  }
  if (airportTemperatureC === null) {
    errors.push(missing('ARPT TEMP'));
  }
  if (heightAalFt === null || airportElevationFt === null || airportTemperatureC === null) {
    return failed(errors);
  }
  const correctionFt = lowAltitudeTemperatureCorrectionFt(heightAalFt, airportElevationFt, airportTemperatureC);
  return { results: { correctionFt, correctedHeightAalFt: heightAalFt + correctionFt }, errors: [] };
}
