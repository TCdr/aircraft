// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

/**
 * The autopilot disconnection on overspeed, shared by the A32NX FMGC and the A380X PRIM flight guidance models.
 *
 * The autopilot disengages when the speed reaches 15 kt above VMO or the Mach number 0.04 above MMO. The limits themselves
 * are those of the aircraft: they are passed in, not shared.
 */
namespace AutopilotOverspeed {

constexpr double SPEED_MARGIN_KNOTS = 15.0;
constexpr double MACH_MARGIN        = 0.04;

inline bool isExceeded(double speedKnots, double mach, double maximumOperatingSpeedKnots, double maximumOperatingMach) {
  return speedKnots >= maximumOperatingSpeedKnots + SPEED_MARGIN_KNOTS || mach >= maximumOperatingMach + MACH_MARGIN;
}

}  // namespace AutopilotOverspeed
