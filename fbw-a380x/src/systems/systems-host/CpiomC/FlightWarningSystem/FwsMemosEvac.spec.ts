// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import type { FwsCore } from './FwsCore';
import { FwsMemos } from './FwsMemos';

const fwsCoreSource = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');

type FakeFws = FwsCore & { evacCommand: Subject<boolean> };

/**
 * An FwsCore stand-in: every signal FwsMemos reads is a Subject (false, or 0 for the counters), except
 * evacCommandOn, derived from the raw evacCommand toggle as FwsCore derives it (checked against the source below)
 */
function fakeFws(): FakeFws {
  const evacCommandToggle = Subject.create(false);
  const subjects = new Map<string | symbol, any>([
    ['evacCommand', evacCommandToggle],
    ['evacCommandOn', evacCommandToggle.map((evacCommandToggleValue) => !evacCommandToggleValue)],
  ]);
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (!subjects.has(name)) {
          subjects.set(name, Subject.create<any>(typeof name === 'string' && /Count$/.test(name) ? 0 : false));
        }
        return subjects.get(name);
      },
    },
  ) as unknown as FakeFws;
}

/*
 * A380 FCOM DSC-23-20 EVAC panel, COMMAND pb-sw (a380_fcom.txt l.49145-49149): "The Flight Crew orders an evacuation,
 * regardless of the CAPT and PURS sw position (CAPT or CAPT & PURS). When pressed: - The ON light and the EVAC light
 * flashes - Message EVAC ACTIVE is displayed on the ECAM".
 */
describe('A380X EVAC ACTIVE memo', () => {
  it('is an ECAM memo text', () => {
    // read from the source: importing EcamMessages/index.ts in a test fails (circular import, FwsCdsDuFault.spec.ts)
    const ecamMessages = readFileSync(
      resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/index.ts'),
      'utf-8',
    );
    expect(ecamMessages).toMatch(/'230000016': '.*EVAC ACTIVE',/);
  });

  it('reads the EVAC COMMAND pb-sw state, not the inverted cockpit L:var', () => {
    // A380_Cockpit_Behavior.xml EVAC component: ON light = (L:A32NX_EVAC_COMMAND_TOGGLE, Bool) !, so 1 = OFF
    expect(fwsCoreSource).toMatch(
      /this\.evacCommand\.set\(SimVar\.GetSimVarValue\('L:A32NX_EVAC_COMMAND_TOGGLE', 'bool'\)\)/,
    );
    expect(fwsCoreSource).toMatch(/evacCommandOn = this\.evacCommand\.map\(\((\w+)\) => !\1\)/);
  });

  it('is shown while the EVAC COMMAND pb-sw is ON (L:var 0), in every flight phase', () => {
    const fws = fakeFws();
    const memo = new FwsMemos(fws).ewdMemos['230000016'];
    expect(memo).toBeDefined();
    expect(memo.flightPhaseInhib).toEqual([]);
    expect(memo.codesToReturn).toEqual(['230000016']);

    // L:A32NX_EVAC_COMMAND_TOGGLE = 1: pb-sw OFF (the normal state, recorded for a whole flight in the sim)
    fws.evacCommand.set(true);
    expect(memo.simVarIsActive.get()).toBe(false);
    // L:A32NX_EVAC_COMMAND_TOGGLE = 0: pb-sw ON
    fws.evacCommand.set(false);
    expect(memo.simVarIsActive.get()).toBe(true);
    fws.evacCommand.set(true);
    expect(memo.simVarIsActive.get()).toBe(false);
  });
});
