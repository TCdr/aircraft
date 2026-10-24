// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AirframeType, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '@flybywiresim/flypad';
import { a32nxFuelOnBoardKg } from './logic/fuelOnBoard';

export interface LiveFigures {
  fobKg: number;
  fuelFlowKgPerHour: number;
  zfwKg: number;
  grossWeightKg: number;
  zfwCgPercentMac: number;
  altitudeFt: number;
  mach: number;
  groundSpeedKt: number;
  localSecondsOfDay: number;
  latitudeDeg: number;
  longitudeDeg: number;
}

/** Fuel on board and gross weight only: the flight log latch runs on every page and needs no more */
export const useFobAndGrossWeight = (): { fobKg: number; grossWeightKg: number } => {
  // The latches run from the flyPad start, before the aircraft config has loaded
  const isA380 = useAppSelector((state) => state.config.airframeInfo?.variant) === AirframeType.A380_842;
  // As the Fuel pages read them: the A380X systems publish the total in kilograms, the A32NX uses the sim tanks
  const [a380FobKg] = useSimVar('L:A32NX_TOTAL_FUEL_QUANTITY', 'Number', 2_000);
  const [center] = useSimVar('FUEL TANK CENTER QUANTITY', 'Gallons', 2_000);
  const [leftMain] = useSimVar('FUEL TANK LEFT MAIN QUANTITY', 'Gallons', 2_000);
  const [leftAux] = useSimVar('FUEL TANK LEFT AUX QUANTITY', 'Gallons', 2_000);
  const [rightMain] = useSimVar('FUEL TANK RIGHT MAIN QUANTITY', 'Gallons', 2_000);
  const [rightAux] = useSimVar('FUEL TANK RIGHT AUX QUANTITY', 'Gallons', 2_000);
  const [kilogramsPerGallon] = useSimVar('FUEL WEIGHT PER GALLON', 'kilograms', 2_000);
  const [grossWeightKg] = useSimVar('L:A32NX_AIRFRAME_GW', 'number', 2_000);
  const fobKg = isA380
    ? a380FobKg
    : a32nxFuelOnBoardKg([center, leftMain, leftAux, rightMain, rightAux], kilogramsPerGallon);
  return { fobKg, grossWeightKg };
};

/** The live values of the aircraft the dashboard shows in every state */
export const useLiveFigures = (): LiveFigures => {
  const { fobKg, grossWeightKg } = useFobAndGrossWeight();
  const [ff1] = useSimVar('L:A32NX_ENGINE_FF:1', 'number', 2_000);
  const [ff2] = useSimVar('L:A32NX_ENGINE_FF:2', 'number', 2_000);
  const [ff3] = useSimVar('L:A32NX_ENGINE_FF:3', 'number', 2_000);
  const [ff4] = useSimVar('L:A32NX_ENGINE_FF:4', 'number', 2_000);
  const [zfwKg] = useSimVar('L:A32NX_AIRFRAME_ZFW', 'number', 2_000);
  const [zfwCg] = useSimVar('L:A32NX_AIRFRAME_ZFW_CG_PERCENT_MAC', 'number', 2_000);
  const [altitudeFt] = useSimVar('INDICATED ALTITUDE', 'feet', 1_000);
  const [mach] = useSimVar('AIRSPEED MACH', 'mach', 1_000);
  const [groundSpeedKt] = useSimVar('GROUND VELOCITY', 'knots', 1_000);
  const [localSecondsOfDay] = useSimVar('E:LOCAL TIME', 'seconds', 5_000);
  const [latitudeDeg] = useSimVar('PLANE LATITUDE', 'degree latitude', 10_000);
  const [longitudeDeg] = useSimVar('PLANE LONGITUDE', 'degree longitude', 10_000);

  return {
    fobKg,
    // The A32NX has no engines 3 and 4: their flows read 0
    fuelFlowKgPerHour: ff1 + ff2 + ff3 + ff4,
    zfwKg,
    grossWeightKg,
    zfwCgPercentMac: zfwCg,
    altitudeFt,
    mach,
    groundSpeedKt,
    localSecondsOfDay,
    latitudeDeg,
    longitudeDeg,
  };
};
