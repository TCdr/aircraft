// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useFailuresOrchestrator } from '../failures-orchestrator-provider';

/** Fails the failure when it is healthy, restores it when it is active */
export function useToggleFailure() {
  const { activeFailures, activate, deactivate } = useFailuresOrchestrator();
  return (identifier: number) => (activeFailures.has(identifier) ? deactivate(identifier) : activate(identifier));
}
