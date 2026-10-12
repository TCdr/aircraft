// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { globalSyncedSettings } from './sync';

describe('flyPad settings synced to local vars', () => {
  it('writes the Situation Visual Effects switch, default on, to the L:var the model fire effects read', () => {
    // Read by the FX_CODE of the engine and APU fire ASOBO_GT_FX components of both exterior models
    // (EngineFireEffects.spec.ts of each aircraft checks that side of the contract).
    const setting = globalSyncedSettings.find((s) => s.localVarName === 'L:A32NX_CONFIG_SITUATION_FX');
    expect(setting).toMatchObject({
      type: 'legacy',
      configKey: 'CONFIG_SITUATION_FX',
      localVarUnit: 'bool',
      defaultValue: '1',
    });
  });

  it('writes each local var from one setting only', () => {
    const localVars = globalSyncedSettings.map((s) => s.localVarName);
    expect(new Set(localVars).size).toBe(localVars.length);
  });
});
