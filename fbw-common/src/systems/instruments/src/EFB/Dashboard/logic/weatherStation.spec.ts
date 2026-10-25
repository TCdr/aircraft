// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DashboardPhase } from './dashboardPhase';
import { leadWeatherRole } from './weatherStation';

describe('leadWeatherRole', () => {
  it('is the departure from the gate until takeoff', () => {
    expect(leadWeatherRole('atGate')).toBe('dep');
    expect(leadWeatherRole('taxiOut')).toBe('dep');
    expect(leadWeatherRole('takeoff')).toBe('dep');
  });

  it('is the destination from the climb to the arrival', () => {
    const arrivalPhases: DashboardPhase[] = ['climb', 'cruise', 'descent', 'approach', 'taxiIn', 'arrived'];
    arrivalPhases.forEach((phase) => {
      expect(leadWeatherRole(phase)).toBe('dest');
    });
  });
});
