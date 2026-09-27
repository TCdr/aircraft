// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Runway } from '../../Performance/Data/Runways';
import {
  LandingAntiIce,
  LandingApproachType,
  LandingBrakingMode,
  LandingComputationType,
  LandingConf,
  LandingGoAroundConf,
  LandingPerformanceResult,
  LandingRunwayCondition,
} from '../../../../../shared/src/performance/landing';
import {
  LineupAngle,
  RunwayCondition,
  TakeoffAntiIceSetting,
  TakeoffPerformanceResult,
} from '../../../../../shared/src/performance/takeoff';

interface TPerformanceLanding {
  icao: string;
  availableRunways: Runway[];
  selectedRunwayIndex: number;
  runwayHeading?: number;
  /** Landing distance available in metres */
  runwayLength?: number;
  elevation?: number;
  slope?: number;
  /** A380: the go-around altitude in feet, when entered */
  goAroundAltitude?: number;

  computationType: LandingComputationType;
  runwayCondition: LandingRunwayCondition;
  windDirection?: number;
  windMagnitude?: number;
  windEntry?: string;
  temperature?: number;
  pressure?: number;
  antiIce: LandingAntiIce;
  airConditioning: boolean;

  weight?: number;
  conf: LandingConf;
  goAroundConf?: LandingGoAroundConf;
  approachType: LandingApproachType;
  /** The go-around gradient in %, the minimum when undefined */
  goAroundGradient?: number;
  /** VLS+ in knots, the wind increment when undefined */
  speedIncrement?: number;
  autoland: boolean;
  glideSlope: number;
  brakingMode: LandingBrakingMode;
  reverseThrust: boolean;
  overweightProcedure: boolean;

  result?: LandingPerformanceResult;
}

export enum TakeoffCoGPositions {
  Standard,
  Forward,
}

interface TPerformanceTakeoff {
  icao?: string;
  availableRunways: Runway[];
  selectedRunwayIndex: number;
  runwayBearing?: number;
  runwayLength?: number;
  elevation?: number;
  runwaySlope?: number;
  lineupAngle?: LineupAngle;

  runwayCondition: RunwayCondition;
  windDirection?: number;
  windMagnitude?: number;
  windEntry?: string;
  oat?: number;
  qnh?: number;

  weight?: number;
  takeoffCg?: TakeoffCoGPositions;
  config?: number;
  antiIce?: TakeoffAntiIceSetting;
  packs?: boolean;
  forceToga?: boolean;
  cg?: number;

  /** A380: thrust reduction, acceleration and engine-out acceleration altitudes in feet, when entered */
  thrustReductionAltitude?: number;
  accelerationAltitude?: number;
  engineOutAccelerationAltitude?: number;
  /** A380: the noise procedure parameters (altitude in feet, speed in knots, N1 in %) */
  noiseEnabled?: boolean;
  noiseEndAltitude?: number;
  noiseSpeed?: number;
  noiseN1?: number;
  /** A380: the thrust of the takeoff run: a FLEX temperature, null for TOGA, undefined for the maximum FLEX */
  selectedFlex?: number | null;
  /** A32NX: the TOGA result of the calculation, with its own speeds */
  togaResult?: TakeoffPerformanceResult;

  result?: TakeoffPerformanceResult;
}

interface TPerformanceState {
  landing: TPerformanceLanding;
  takeoff: TPerformanceTakeoff;
}

export const initialState: TPerformanceState = {
  landing: {
    icao: '',
    availableRunways: [],
    selectedRunwayIndex: -1,
    computationType: LandingComputationType.InFlight,
    runwayCondition: LandingRunwayCondition.Dry,
    antiIce: LandingAntiIce.Off,
    airConditioning: true,
    conf: LandingConf.Full,
    approachType: LandingApproachType.Normal,
    autoland: false,
    glideSlope: 3,
    brakingMode: LandingBrakingMode.Manual,
    reverseThrust: false,
    overweightProcedure: false,
  },
  takeoff: {
    availableRunways: [],
    selectedRunwayIndex: -1,
    antiIce: TakeoffAntiIceSetting.Off,
    packs: true,
    takeoffCg: TakeoffCoGPositions.Standard,
    forceToga: false,
    config: 1,
    lineupAngle: 90,
    runwayCondition: RunwayCondition.Dry,
  },
};

const performanceSlice = createSlice({
  name: 'performance',
  initialState,
  reducers: {
    setLandingValues: (state, action: PayloadAction<Partial<TPerformanceLanding>>) => {
      Object.keys(action.payload).forEach((key) => {
        state.landing[key] = action.payload[key];
      });
    },
    clearLandingValues: (state) => {
      state.landing = initialState.landing;
    },
    setTakeoffValues: (state, action: PayloadAction<Partial<TPerformanceTakeoff>>) => {
      Object.keys(action.payload).forEach((key) => {
        state.takeoff[key] = action.payload[key];
      });
    },
    clearTakeoffValues: (state) => {
      state.takeoff = initialState.takeoff;
    },
  },
});

export const { setLandingValues, clearLandingValues, setTakeoffValues, clearTakeoffValues } = performanceSlice.actions;

export default performanceSlice.reducer;
