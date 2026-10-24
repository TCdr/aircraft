// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Magnus formula coefficients over water */
const MAGNUS_B = 17.625;
const MAGNUS_C_DEG = 243.04;

const saturationFactor = (celsius: number): number => Math.exp((MAGNUS_B * celsius) / (MAGNUS_C_DEG + celsius));

/** Relative humidity in whole percent from temperature and dew point */
export const relativeHumidityPercent = (temperatureC: number, dewPointC: number): number =>
  Math.round((100 * saturationFactor(dewPointC)) / saturationFactor(temperatureC));
