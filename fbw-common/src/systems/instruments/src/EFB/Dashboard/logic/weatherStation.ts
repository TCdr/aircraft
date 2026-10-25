// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DashboardPhase } from './dashboardPhase';

/** The phases before the aircraft is airborne on its flight: the weather that matters is the departure's */
const DEPARTURE_PHASES: readonly DashboardPhase[] = ['atGate', 'taxiOut', 'takeoff'];

/** The airport whose weather the dashboard and the weather page lead with: the departure until takeoff, then the destination */
export const leadWeatherRole = (phase: DashboardPhase): 'dep' | 'dest' =>
  DEPARTURE_PHASES.indexOf(phase) >= 0 ? 'dep' : 'dest';
