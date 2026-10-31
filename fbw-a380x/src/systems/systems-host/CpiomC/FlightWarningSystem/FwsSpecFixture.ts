// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Test support only: builds the real FwsCore (and with it FwsAbnormalSensed, FwsMemos, FwsInopSys, FwsLimitations...)
// on mocked SimVars, so that specs assert on the live alert tables instead of reading the source text.

import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { vi } from 'vitest';
import { mockSimVars, MockedSimVarValues } from '../../../../../../fbw-common/src/jest/MockedSimVars';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { FwsCore } from './FwsCore';

export interface FwsFixture {
  core: FwsCore;
  /** The simvars the FWS reads, by name (a missing one reads 0); set them, then call runFwsCycle(core) */
  simVars: MockedSimVarValues;
}

/**
 * The real FwsCore of FWS 1 with every simvar at 0. It replaces the SimVar functions with the mocks of its simVars,
 * so a second call re-points them away from the simVars of the first fixture.
 * @param activeFailures the flyPad failures (A380Failure) that read as active. Without it every failure query is
 * answered with a truthy object, so every failure reads as active: pass a set (possibly empty) when running cycles.
 */
export function createFws(activeFailures?: Set<number>): FwsFixture {
  const simVars: MockedSimVarValues = new Map();
  mockSimVars(simVars);
  // The sim globals FwsCore.update() reads besides the simvars
  vi.stubGlobal('Aircraft', { A320_NEO: 0 });
  vi.stubGlobal('Simplane', {
    getPressureSelectedMode: () => 'STD',
    getIsGrounded: () => true,
    getAltitude: () => 0,
    getAutoPilotAltitudeManaged: () => false,
  });
  vi.stubGlobal('GameState', { ingame: 3 });
  const failuresConsumer = new Proxy(
    {},
    {
      get: (_target, name) =>
        name === 'isActive' && activeFailures
          ? (failure: number) => activeFailures.has(failure)
          : () => ({ get: () => false, sub: () => ({ destroy: () => {} }) }),
    },
  ) as unknown as ConstructorParameters<typeof FwsCore>[2];
  const core = new FwsCore(1, new EventBus(), failuresConsumer, Subject.create(false), Subject.create(false));
  return { core, simVars };
}

/**
 * One FWS cycle of the given length in ms. The FWS does nothing before its startup is completed, and only runs when
 * 125 ms have passed since its last cycle: the default length is long enough for every cycle to run.
 */
export function runFwsCycle(core: FwsCore, milliseconds = 1000) {
  core.startupCompleted.set(true);
  core.update(milliseconds);
}

/** The text of an ECAM message without its colour and style codes (ESC, then <n m, 4 m or m) */
export function withoutEcamCodes(text: string): string {
  return text
    .split('\x1b')
    .map((part, index) => (index === 0 ? part : part.replace(/^(<\d)?4?m/, '')))
    .join('');
}

/** The item names of an ECAM abnormal procedure, in the order of the procedure */
export function procedureItemNames(id: string | number): string[] {
  return EcamAbnormalProcedures[id].items.map((item) => item.name);
}
