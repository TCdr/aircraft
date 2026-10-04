// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export { FailuresConsumer } from './failures-consumer';
export { FailableFuelSwitchesDriver, msfsFuelPumpAccess, msfsFuelValveAccess } from './failable-fuel-switches';
export type { FailableFuelSwitch, FuelSwitchAccess, FuelSwitchFailureEffect } from './failable-fuel-switches';
export { FailuresOrchestrator, FailureDefinition } from './failures-orchestrator';
export type { Failure } from './failures-orchestrator';
