// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { RegisteredSimVar } from '@flybywiresim/fbw-sdk';

/**
 * Reads a boolean var every frame. A read by name makes garbage on each call and all instruments share one heap, so the
 * var is read through a registered id, which is made on the first read: not when the file loads.
 */
export class BooleanSimVarReader {
  private simVar: RegisteredSimVar<boolean> | undefined;

  /** @param simVarName the name of the var, with the L: prefix for a local var */
  constructor(private readonly simVarName: string) {}

  /** @returns whether the var is above 0 */
  public get(): boolean {
    if (!this.simVar) {
      this.simVar = RegisteredSimVar.createBoolean(this.simVarName);
    }
    return this.simVar.get();
  }
}
