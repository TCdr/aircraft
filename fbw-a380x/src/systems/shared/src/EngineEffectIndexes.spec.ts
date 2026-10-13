// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * The engine-specific effect.N lines of the [EFFECTS] section of the A380X aircraft.cfg (engine heat haze) must read the
 * engine whose exhaust node they hang on. The engine numbers: 1 = left outer, 2 = left inner, 3 = right inner,
 * 4 = right outer (A380 FCOM "AIR L(R) INR WING LEAK/ENG 2(3) BLEED LEAK": engines 2 and 3 are the inner ones; the
 * engines.cfg positions Engine.0..3 at -84, -47.5, +47.5, +84 ft lateral). The exhaust nodes of A380_WINGS.gltf
 * (aircraft-large-files) are at x = +25.9 m (FX_EXHAUST_LEFT1), +15.0 m (RIGHT2, under the left inner engine bone; LEFT2 is LOD00 only), -14.9 m (RIGHT3) and -25.6 m (RIGHT4):
 * the digit of the node name is its engine number.
 */
const AIRCRAFT_CFG = resolve(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/common/config/aircraft.cfg',
);

/** The engine of each exhaust node */
const ENGINE_OF_EXHAUST_NODE: Record<string, number> = {
  FX_EXHAUST_LEFT1: 1,
  FX_EXHAUST_RIGHT2: 2,
  FX_EXHAUST_RIGHT3: 3,
  FX_EXHAUST_RIGHT4: 4,
};

/** An "effect.N = NODE#CODE#EFFECT" line of the [EFFECTS] section */
interface ConditionalEffect {
  index: number;
  node: string;
  code: string;
  effect: string;
}

/** The effect.N lines of the [EFFECTS] section, comments stripped, in file order */
function cfgConditionalEffects(): ConditionalEffect[] {
  const cfg = readFileSync(AIRCRAFT_CFG, 'utf8');
  const section = /^\[EFFECTS\]\s*$([\s\S]*?)(?=^\[)/m.exec(cfg);
  if (!section) {
    throw new Error('[EFFECTS] section not found in aircraft.cfg');
  }
  const effects: ConditionalEffect[] = [];
  for (const rawLine of section[1].split(/\r?\n/)) {
    const line = rawLine.replace(/;.*$/, '').trim();
    const match = /^effect\.(\d+)\s*=\s*([^#]+)#([^#]+)#(.+)$/i.exec(line);
    if (match) {
      effects.push({ index: Number(match[1]), node: match[2].trim(), code: match[3].trim(), effect: match[4].trim() });
    }
  }
  return effects;
}

/** The engine indexes read by an RPN code, e.g. 2 for (A:GENERAL ENG COMBUSTION:2, boolean) */
function engineIndexesRead(code: string): number[] {
  return [...code.matchAll(/\(A:[^,):]*ENG[^,):]*:(\d+)\s*,/gi)].map((match) => Number(match[1]));
}

describe('A380X aircraft.cfg engine effect lines', () => {
  const engineEffects = cfgConditionalEffects().filter((effect) => effect.node in ENGINE_OF_EXHAUST_NODE);

  it('has an engine heat haze on each of the 4 engine exhaust nodes', () => {
    const heatHazeNodes = engineEffects.filter((effect) => effect.effect === 'FX_ASOBO_HEAT_BIG').map((e) => e.node);
    expect([...heatHazeNodes].sort()).toEqual(Object.keys(ENGINE_OF_EXHAUST_NODE).sort());
  });

  it('makes each engine effect line read the engine of its own exhaust node, and that engine only', () => {
    for (const effect of engineEffects) {
      expect(engineIndexesRead(effect.code), `effect.${effect.index} on ${effect.node}: ${effect.code}`).toEqual([
        ENGINE_OF_EXHAUST_NODE[effect.node],
      ]);
    }
  });

  it('reads no engine from the effect lines of the other nodes (APU)', () => {
    for (const effect of cfgConditionalEffects().filter((e) => !(e.node in ENGINE_OF_EXHAUST_NODE))) {
      expect(engineIndexesRead(effect.code), `effect.${effect.index} on ${effect.node}`).toEqual([]);
    }
  });
});
