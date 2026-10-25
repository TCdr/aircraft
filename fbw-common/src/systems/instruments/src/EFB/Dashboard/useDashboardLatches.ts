// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useFmgcPhase, useTouchdownLatch } from './useDashboardPhase';
import { useTakeoffLatch } from './useMinutesToTod';
import { useFlightLogLatch } from './useFlightLog';
import { useServiceRunLatch } from './useServiceStatus';
import { useJetBridgeMovedLatch } from './useJetBridgeMoved';
import { useNewFlightReset } from './useNewFlightReset';

/**
 * Records the flight events the dashboard shows into persistent properties the dashboard reads. Run by the flyPad
 * whatever its page and power state: the tablet is often off for takeoff and landing.
 */
export const useDashboardLatches = (): void => {
  const fmgcPhase = useFmgcPhase();
  useTouchdownLatch(fmgcPhase);
  useTakeoffLatch(fmgcPhase);
  useFlightLogLatch(fmgcPhase);
  useNewFlightReset();
  useServiceRunLatch();
  useJetBridgeMovedLatch();
};
