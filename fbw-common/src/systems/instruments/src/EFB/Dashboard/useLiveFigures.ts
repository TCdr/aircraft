// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AirframeType, Units } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '@flybywiresim/flypad';
import { weightAsShownKg } from './logic/dashboardFormat';
import { numberReader } from './registeredReads';
import { FuelQuantities, fuelOnBoardKg, readFuelQuantities } from './readFuelQuantities';
import { useSimClock } from './useMinutesToTod';
import { usePolledReading } from './usePolledReading';

export interface LiveFigures {
  fobKg: number;
  /** The fuel vars the figure comes from, for the refuel status to read the same poll */
  fuel: FuelQuantities;
  fuelFlowKgPerHour: number;
  zfwKg: number;
  grossWeightKg: number;
  zfwCgPercentMac: number;
  altitudeFt: number;
  mach: number;
  groundSpeedKt: number;
  localSecondsOfDay: number;
  zuluSecondsOfDay: number;
  nowUnixSeconds: number;
  latitudeDeg: number;
  longitudeDeg: number;
}

const readGrossWeightKg = numberReader('L:A32NX_AIRFRAME_GW', 'number');
const readEngineFlows = [1, 2, 3, 4].map((engine) => numberReader(`L:A32NX_ENGINE_FF:${engine}`, 'number'));
const readZeroFuelWeightKg = numberReader('L:A32NX_AIRFRAME_ZFW', 'number');
const readZeroFuelWeightCg = numberReader('L:A32NX_AIRFRAME_ZFW_CG_PERCENT_MAC', 'number');
const readAltitudeFt = numberReader('INDICATED ALTITUDE', 'feet');
const readMach = numberReader('AIRSPEED MACH', 'mach');
const readGroundSpeedKt = numberReader('GROUND VELOCITY', 'knots');
const readLatitudeDeg = numberReader('PLANE LATITUDE', 'degree latitude');
const readLongitudeDeg = numberReader('PLANE LONGITUDE', 'degree longitude');

/** Fuel on board and gross weight only: the flight log latch runs on every page and needs no more */
export const useFobAndGrossWeight = (): { fobKg: number; grossWeightKg: number } => {
  // The latches run from the flyPad start, before the aircraft config has loaded
  const isA380 = useAppSelector((state) => state.config.airframeInfo?.variant) === AirframeType.A380_842;
  const { fuel, grossWeightKg } = usePolledReading(
    () => ({ fuel: readFuelQuantities(), grossWeightKg: readGrossWeightKg() }),
    2_000,
  );
  return { fobKg: fuelOnBoardKg(isA380, fuel), grossWeightKg };
};

// Design choice: a figure the page shows through one function is rounded by that function, so the rounded value shows
// the same text as the raw one. Figures that reach the page through several formats or feed a derived figure (fuel,
// weights, times) are not rounded, only read together.
const wholeNumber = (value: number): number => Math.round(value) + 0; // + 0 turns -0 into 0
/** The strip shows Mach as hundredths */
const hundredths = (value: number): number => Math.round(value * 100) / 100;
/** The ZFW CG field shows one decimal */
const oneDecimal = (value: number): number => Number(value.toFixed(1));

/** The figures that change while taxiing, read together and rounded to what the dashboard shows */
const readFlightFigures = (metric: boolean) => {
  // The A32NX has no engines 3 and 4: their flows read 0
  const flowKgPerHour = readEngineFlows.reduce((sum, readFlow) => sum + readFlow(), 0);
  return {
    fuel: readFuelQuantities(),
    grossWeightKg: readGrossWeightKg(),
    zfwKg: readZeroFuelWeightKg(),
    zfwCgPercentMac: oneDecimal(readZeroFuelWeightCg()),
    // The fuel flow field shows whole tens of the user's weight unit
    fuelFlowKgPerHour: weightAsShownKg(flowKgPerHour, metric),
    altitudeFt: wholeNumber(readAltitudeFt()),
    mach: hundredths(readMach()),
    groundSpeedKt: wholeNumber(readGroundSpeedKt()),
  };
};

/** The live values of the aircraft the dashboard shows in every state */
export const useLiveFigures = (): LiveFigures => {
  const isA380 = useAppSelector((state) => state.config.airframeInfo?.variant) === AirframeType.A380_842;
  // One poll at the fastest period of the values (the fuel and speed figures), the slower ones simply read more often
  // The fuel flow is rounded in the user's unit, so a change of unit reads again at once
  const metric = Units.usingMetric;
  const flight = usePolledReading(() => readFlightFigures(metric), 1_000, [metric]);
  const clock = useSimClock();
  const position = usePolledReading(
    () => ({
      latitudeDeg: readLatitudeDeg(),
      longitudeDeg: readLongitudeDeg(),
    }),
    10_000,
  );

  return {
    ...flight,
    fobKg: fuelOnBoardKg(isA380, flight.fuel),
    localSecondsOfDay: clock.localSecondsOfDay,
    zuluSecondsOfDay: clock.zuluSecondsOfDay,
    nowUnixSeconds: clock.nowUnixSeconds,
    ...position,
  };
};
