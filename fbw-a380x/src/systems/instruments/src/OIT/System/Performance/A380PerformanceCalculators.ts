// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380842TakeoffPerformanceCalculator } from '@shared/performance/a380x_takeoff';
import { A380842LandingPerformanceCalculator } from '@shared/performance/a380x_landing';
import { CertifiedWeights } from './FltOpsPerformanceSession';

/** The performance databases of the FLT OPS laptops: the A380-842 calculators the flyPad uses too */
export const A380_TAKEOFF_CALCULATOR = new A380842TakeoffPerformanceCalculator();

export const A380_LANDING_CALCULATOR = new A380842LandingPerformanceCalculator();

/** The maximum structural takeoff and landing weights, the defaults of T.O PERF, LDG PERF and LOADSHEET */
export const A380_CERTIFIED_WEIGHTS: CertifiedWeights = {
  mtow: A380_TAKEOFF_CALCULATOR.structuralMtow,
  mlw: A380_LANDING_CALCULATOR.mlw,
};
