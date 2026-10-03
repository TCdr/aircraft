// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export const CanvasConst = Object.freeze({
  yScale: 200,
  cgAngle: Math.PI / 224,
  diamondWidth: 10,
  diamondHeight: 10,
  cgAxis: {
    xOffset: 0.02,
    xSpacing: 0.18,
    y: -0.08,
  },
  // the weight labels are centred on their weight lines, the unit under the lowest label (ChartWidget)
  weightAxis: {
    x: -0.09,
    units: {
      x: -0.17,
    },
  },
});

export interface PerformanceEnvelope {
  mlw: number[][];
  mzfw: number[][];
  mtow: number[][];
  flight: number[][];
}

export interface ChartLimitsWeight {
  min: number;
  max: number;
  lines: number;
  scale: number;
  values: number[];
}

export interface ChartLimitsCg {
  angleRad: number;
  min: number;
  max: number;
  lines: number;
  scale: number;
  values: number[];
  overlap: number;
  highlight: number;
}

export interface ChartLabels {
  mtow: EnvelopeLabel;
  mlw: EnvelopeLabel;
  mzfw: EnvelopeLabel;
}

export interface EnvelopeLabel {
  x1: number;
  x2: number;
  y: number;
}
export interface ChartLimits {
  weight: ChartLimitsWeight;
  cg: ChartLimitsCg;
  labels: ChartLabels;
}
