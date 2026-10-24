// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A clockwise part of a gauge scale: the values from minValue to maxValue are drawn from startAngle to endAngle. */
export interface GaugeScaleSegment {
  minValue: number;
  maxValue: number;
  startAngle: number;
  endAngle: number;
}

export interface ApuEgtRedArc {
  visible: boolean;
  startAngle: number;
}

/**
 * The red arc of the SD APU EGT gauge, from the EGT red limit to the end of the scale.
 *
 * The ECB raises the red limit during a start (above the scale top during an in-flight start), so a limit above the
 * scale leaves no red arc instead of an arc swept the wrong way round the dial. The arc starts where the needle points
 * at the limit, so the needle reaches the arc when the EGT reaches the limit.
 * @param redLimit the EGT red limit in degrees Celsius
 * @param scale the scale segment that holds the red limit, its endAngle being the end of the gauge
 * @returns whether the arc is shown, and its start angle
 */
export function apuEgtRedArc(redLimit: number, scale: GaugeScaleSegment): ApuEgtRedArc {
  const clampedLimit = Math.min(Math.max(redLimit, scale.minValue), scale.maxValue);
  const sweep = (scale.endAngle - scale.startAngle + 360) % 360;
  const startAngle =
    (scale.startAngle + ((clampedLimit - scale.minValue) / (scale.maxValue - scale.minValue)) * sweep) % 360;

  return { visible: redLimit < scale.maxValue, startAngle };
}
