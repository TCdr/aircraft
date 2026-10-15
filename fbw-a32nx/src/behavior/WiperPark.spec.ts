// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The windshield wiper blade animation of A32NX_Exterior.xml (template FBW_Airbus_Wiper, used by the WipersLeft and
// WipersRight components of A320_NEO.xml), evaluated frame by frame with a small RPN interpreter for the operators the
// template uses. Kept outside src/ because build.js copies every file of src/.
//
// A320 FCOM DSC-30-60-20 (rain removal, WIPER rotary selector): "When turned off, the wiper stops out of view."
// The Capt wiper is lost with ELEC DC BUS 1 FAULT and the F/O wiper with ELEC DC BUS 2 FAULT (PRO-ABN-ELEC, INOP SYS).

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const EXTERIOR_BEHAVIOR_XML = join(__dirname, 'src', 'A32NX_Exterior.xml');
const EXTERIOR_MODEL_XML = join(
  __dirname,
  '..',
  'base',
  'flybywire-aircraft-a320-neo',
  'SimObjects',
  'AirPlanes',
  'FlyByWire_A320_NEO',
  'model',
  'A320_NEO.xml',
);

/** One simulator frame at 30 FPS */
const FRAME_SECONDS = 1 / 30;

/** The wiper animation position that is the parked blade (out of view) */
const PARKED = 0;

type Side = 'left' | 'right';

function decodeXml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/** The direct child elements <NAME>value</NAME> of an XML fragment, as a name -> text map */
function childParameters(fragment: string): Map<string, { value: string; attributes: string }> {
  const parameters = new Map<string, { value: string; attributes: string }>();
  for (const match of fragment.matchAll(/<(\w+)(\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    parameters.set(match[1], { value: decodeXml(match[3]).trim(), attributes: match[2] ?? '' });
  }
  return parameters;
}

function section(text: string, pattern: RegExp, what: string): string {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`${what} not found`);
  }
  return match[1];
}

/** Replaces every #NAME# by its parameter value, until no known parameter is left */
function substitute(code: string, parameters: Map<string, string>): string {
  let result = code;
  for (let pass = 0; pass < 10; pass++) {
    const next = result.replace(/#(\w+)#/g, (whole, name: string) => parameters.get(name) ?? whole);
    if (next === result) {
      break;
    }
    result = next;
  }
  const unresolved = /#(\w+)#/.exec(result);
  if (unresolved) {
    throw new Error(`Template parameter ${unresolved[1]} has no value`);
  }
  return result;
}

interface WiperCode {
  /** The Update Once code of the template, run at flight load */
  init: string;
  /** The full animation code as ASOBO_GT_Anim_Code_Failure_Test assembles it from ANIM_CODE, FAILURE and FAILURE_CODE */
  animation: string;
}

/**
 * Builds the wiper code the way the MSFS template engine does: template defaults, then the A320_NEO.xml use-site
 * parameters of the component, then the template's OverrideTemplateParameters. The ASOBO_GT_Anim_Code wrapper
 * (ASOBO_GT_Anim_Code_Failure_Test of the MSFS SDK) runs
 *   FAILURE if{ ANIM_CODE (>O:AnimCode) (O:AnimCode) } els{ FAILURE_CODE }
 */
function wiperCode(side: Side): WiperCode {
  const behavior = stripXmlComments(readFileSync(EXTERIOR_BEHAVIOR_XML, 'utf8'));
  const template = section(behavior, /<Template Name="FBW_Airbus_Wiper">([\s\S]*?)<\/Template>/, 'FBW_Airbus_Wiper');
  const model = stripXmlComments(readFileSync(EXTERIOR_MODEL_XML, 'utf8'));
  const componentId = side === 'left' ? 'WipersLeft' : 'WipersRight';
  const useSite = section(
    model,
    new RegExp(`<Component ID="${componentId}">\\s*<UseTemplate Name="FBW_Airbus_Wiper">([\\s\\S]*?)</UseTemplate>`),
    `${componentId} use of FBW_Airbus_Wiper`,
  );

  const parameters = new Map<string, string>();
  const defaults = section(template, /<DefaultTemplateParameters>([\s\S]*?)<\/DefaultTemplateParameters>/, 'defaults');
  for (const [name, { value }] of childParameters(defaults)) {
    parameters.set(name, value);
  }
  for (const [name, { value }] of childParameters(useSite)) {
    parameters.set(name, value);
  }
  const overrides = section(
    template,
    /<OverrideTemplateParameters>([\s\S]*?)<\/OverrideTemplateParameters>/,
    'overrides',
  );
  // The parameters of one Override block are resolved against the scope before that block: one of them cannot use
  // another of the same block (an unresolved #NAME# throws here)
  const beforeOverrides = new Map(parameters);
  for (const [name, { value, attributes }] of childParameters(overrides)) {
    const resolved = substitute(value, beforeOverrides);
    // Process="Float" parameters are computed once by the template engine
    parameters.set(name, /Process="Float"/.test(attributes) ? String(evaluate(resolved, newState()).result) : resolved);
  }

  const animTemplate = section(
    template,
    /<UseTemplate Name="ASOBO_GT_Anim_Code">([\s\S]*?)<\/UseTemplate>/,
    'ASOBO_GT_Anim_Code use',
  );
  const anim = childParameters(animTemplate);
  const animCode = anim.get('ANIM_CODE')?.value;
  const failure = anim.get('FAILURE')?.value;
  if (animCode === undefined || failure === undefined) {
    throw new Error('ANIM_CODE or FAILURE missing');
  }
  const failureCode = parameters.get('FAILURE_CODE') ?? '(O:AnimCode)';
  const init = decodeXml(section(template, /<Update Once="True">([\s\S]*?)<\/Update>/, 'Update Once'));

  return {
    init: substitute(init, parameters),
    animation: substitute(`${failure} if{ ${animCode} (>O:AnimCode) (O:AnimCode) } els{ ${failureCode} }`, parameters),
  };
}

interface SimState {
  /** A: variables by name (with index, without unit), e.g. "CIRCUIT SWITCH ON:77" */
  a: Map<string, number>;
  /** L: variables by name */
  l: Map<string, number>;
  /** O: (component) variables by name */
  o: Map<string, number>;
}

function newState(): SimState {
  return { a: new Map(), l: new Map(), o: new Map() };
}

/** Index of the "}" closing the block opened at tokens[open] */
function closingBrace(tokens: string[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].endsWith('{')) {
      depth++;
    } else if (tokens[i] === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error('Unbalanced RPN block');
}

/**
 * Evaluates the RPN subset the wiper template uses: numbers, (A:/L:/O: name, unit) reads, (>O:/>L: name) writes,
 * + - * / % abs ! and or > < >= <= ==, if{ } els{ }. Returns the value left on the stack (the animation position).
 */
function evaluate(code: string, state: SimState): { result: number } {
  const tokens = code.match(/\([^)]*\)|\S+/g) ?? [];
  const stack: number[] = [];
  const pop = (): number => {
    const value = stack.pop();
    if (value === undefined) {
      throw new Error(`RPN stack underflow in: ${code}`);
    }
    return value;
  };
  const binary: Record<string, (a: number, b: number) => number> = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => a / b,
    '%': (a, b) => a % b,
    and: (a, b) => (a && b ? 1 : 0),
    or: (a, b) => (a || b ? 1 : 0),
    '>': (a, b) => (a > b ? 1 : 0),
    '<': (a, b) => (a < b ? 1 : 0),
    '>=': (a, b) => (a >= b ? 1 : 0),
    '<=': (a, b) => (a <= b ? 1 : 0),
    '==': (a, b) => (a === b ? 1 : 0),
  };

  const run = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const token = tokens[i];
      const variable = /^\((>?)([ALO]):([^,)]+)/.exec(token);
      if (variable) {
        const [, write, kind, rawName] = variable;
        const store = kind === 'A' ? state.a : kind === 'L' ? state.l : state.o;
        const name = rawName.trim();
        if (write) {
          store.set(name, pop());
        } else {
          stack.push(store.get(name) ?? 0);
        }
      } else if (token === 'if{') {
        const condition = pop();
        const ifEnd = closingBrace(tokens, i);
        let elseEnd = -1;
        if (tokens[ifEnd + 1] === 'els{') {
          elseEnd = closingBrace(tokens, ifEnd + 1);
        }
        if (condition) {
          run(i + 1, ifEnd);
        } else if (elseEnd >= 0) {
          run(ifEnd + 2, elseEnd);
        }
        i = elseEnd >= 0 ? elseEnd : ifEnd;
      } else if (token in binary) {
        const b = pop();
        const a = pop();
        stack.push(binary[token](a, b));
      } else if (token === '!') {
        stack.push(pop() ? 0 : 1);
      } else if (token === 'abs') {
        stack.push(Math.abs(pop()));
      } else if (/^-?\d+(\.\d+)?$/.test(token)) {
        stack.push(Number(token));
      } else {
        throw new Error(`Unsupported RPN token ${token}`);
      }
    }
  };
  run(0, tokens.length);
  if (stack.length !== 1) {
    throw new Error(`RPN stack holds ${stack.length} values after: ${code}`);
  }
  return { result: stack[0] };
}

const CIRCUIT: Record<Side, number> = { left: 77, right: 80 };
const DC_BUS_LVAR: Record<Side, string> = {
  left: 'A32NX_ELEC_DC_1_BUS_IS_POWERED',
  right: 'A32NX_ELEC_DC_2_BUS_IS_POWERED',
};

interface Conditions {
  /** WIPER rotary selector out of OFF (the knob template switches the circuit on) */
  selectorOn: boolean;
  /** Knob speed: 0.75 SLOW, 1 FAST (the knob keeps the last speed when turned OFF) */
  speed?: number;
  /** FBW DC bus of this wiper (Capt: DC 1, F/O: DC 2) powered */
  busPowered: boolean;
  /** FBW DC bus of the other wiper powered (defaults to busPowered) */
  otherBusPowered?: boolean;
  /**
   * MSFS bus of this wiper's circuit powered (defaults to busPowered). FBW keeps it in step with its own bus through
   * connection toggles, so the two can disagree.
   */
  msfsBusPowered?: boolean;
}

/** One wiper blade, its component O: variables kept from frame to frame like the simulator does */
class WiperBlade {
  private readonly code: WiperCode;

  private readonly state = newState();

  public position: number;

  constructor(private readonly side: Side) {
    this.code = wiperCode(side);
    evaluate(`${this.code.init} 0`, this.state);
    this.position = this.state.o.get('AnimCode') ?? 0;
  }

  public frame(conditions: Conditions): number {
    const circuit = CIRCUIT[this.side];
    const other: Side = this.side === 'left' ? 'right' : 'left';
    const switchedOn = conditions.selectorOn ? 1 : 0;
    const busPowered = conditions.busPowered ? 1 : 0;
    this.state.a.set(`CIRCUIT SWITCH ON:${circuit}`, switchedOn);
    // The MSFS circuit is live when switched on and its MSFS bus is powered
    this.state.a.set(
      `CIRCUIT ON:${circuit}`,
      switchedOn && (conditions.msfsBusPowered ?? conditions.busPowered) ? 1 : 0,
    );
    this.state.a.set(`CIRCUIT POWER SETTING:${circuit}`, conditions.speed ?? 1);
    this.state.a.set('ANIMATION DELTA TIME', FRAME_SECONDS);
    this.state.l.set(DC_BUS_LVAR[this.side], busPowered);
    this.state.l.set(DC_BUS_LVAR[other], conditions.otherBusPowered ?? conditions.busPowered ? 1 : 0);
    this.position = evaluate(this.code.animation, this.state).result;
    return this.position;
  }

  public run(seconds: number, conditions: Conditions): number[] {
    const positions: number[] = [];
    for (let t = 0; t < seconds; t += FRAME_SECONDS) {
      positions.push(this.frame(conditions));
    }
    return positions;
  }

  /** Sweeps until the blade is well out of the park position (mid-windshield) */
  public sweepToMidWindshield(speed = 1): void {
    this.run(0.15, { selectorOn: true, speed, busPowered: true });
    for (let i = 0; i < 100 && (this.position < 50 || this.position > 90); i++) {
      this.frame({ selectorOn: true, speed, busPowered: true });
    }
    expect(this.position).toBeGreaterThan(40);
  }
}

describe.each<Side>(['left', 'right'])('%s windshield wiper blade (A320 FCOM DSC-30-60-20)', (side) => {
  it('stays parked at flight load with the selector OFF, powered or not', () => {
    const powered = new WiperBlade(side);
    expect(powered.position).toBe(PARKED);
    expect(powered.run(5, { selectorOn: false, busPowered: true }).every((p) => p === PARKED)).toBe(true);

    const unpowered = new WiperBlade(side);
    expect(unpowered.run(5, { selectorOn: false, busPowered: false }).every((p) => p === PARKED)).toBe(true);
  });

  it('sweeps with the selector ON and its bus powered', () => {
    const blade = new WiperBlade(side);
    const positions = blade.run(3, { selectorOn: true, speed: 1, busPowered: true });
    expect(Math.max(...positions)).toBeGreaterThan(95);
    // after the first lift out of the park position it keeps sweeping over the windshield
    expect(Math.min(...positions.slice(30))).toBeGreaterThan(20);
  });

  it('when turned OFF mid-sweep, finishes its travel at sweep speed and stops out of view', () => {
    const blade = new WiperBlade(side);
    blade.sweepToMidWindshield(0.75);
    const start = blade.position;

    const positions = blade.run(3, { selectorOn: false, speed: 0.75, busPowered: true });
    // not a jump to the park position: the first frame moves by one frame of travel at SLOW speed
    const slowFramesPerSecond = (0.75 * 0.9 + 0.1) * 313;
    expect(Math.abs(positions[0] - start)).toBeCloseTo(slowFramesPerSecond * FRAME_SECONDS, 5);
    // parked within one full sweep (up to the top and back to 0), then stays parked
    const parkedAt = positions.indexOf(PARKED);
    expect(parkedAt).toBeGreaterThan(0);
    expect(parkedAt * FRAME_SECONDS).toBeLessThan((100 + 100) / slowFramesPerSecond + FRAME_SECONDS);
    expect(positions.slice(parkedAt).every((p) => p === PARKED)).toBe(true);
  });

  it('parks when switched OFF right after flight load (selector ON for a few frames, then OFF by the knob init)', () => {
    const blade = new WiperBlade(side);
    blade.run(0.1, { selectorOn: true, busPowered: true });
    expect(blade.position).toBeGreaterThan(PARKED);
    const positions = blade.run(2, { selectorOn: false, busPowered: true });
    expect(positions[positions.length - 1]).toBe(PARKED);
  });

  it('stays where it is when its bus loses power, whatever the selector', () => {
    for (const selectorOn of [true, false]) {
      const blade = new WiperBlade(side);
      blade.sweepToMidWindshield();
      const frozenAt = blade.position;
      const positions = blade.run(3, { selectorOn, busPowered: false });
      expect(positions.every((p) => p === frozenAt)).toBe(true);
    }
  });

  it('stays where it is when switched OFF and the bus is unpowered, then parks once the bus is back', () => {
    const blade = new WiperBlade(side);
    blade.sweepToMidWindshield();
    const frozenAt = blade.position;
    expect(blade.run(2, { selectorOn: false, busPowered: false }).every((p) => p === frozenAt)).toBe(true);
    const positions = blade.run(2, { selectorOn: false, busPowered: true });
    expect(positions[positions.length - 1]).toBe(PARKED);
  });

  it('follows its own DC bus only (Capt wiper DC BUS 1, F/O wiper DC BUS 2)', () => {
    // own bus unpowered, other bus powered: frozen
    const ownBusLost = new WiperBlade(side);
    ownBusLost.sweepToMidWindshield();
    const frozenAt = ownBusLost.position;
    const frozen = ownBusLost.run(2, { selectorOn: true, busPowered: false, otherBusPowered: true });
    expect(frozen.every((p) => p === frozenAt)).toBe(true);

    // own FBW bus unpowered while the MSFS circuit still reads live: frozen too (the FBW bus is the power source)
    const msfsBusOutOfStep = new WiperBlade(side);
    msfsBusOutOfStep.sweepToMidWindshield();
    const stoppedAt = msfsBusOutOfStep.position;
    const stopped = msfsBusOutOfStep.run(2, { selectorOn: true, busPowered: false, msfsBusPowered: true });
    expect(stopped.every((p) => p === stoppedAt)).toBe(true);

    // other bus unpowered, own bus powered: keeps sweeping
    const otherBusLost = new WiperBlade(side);
    otherBusLost.sweepToMidWindshield();
    const sweeping = otherBusLost.run(2, { selectorOn: true, busPowered: true, otherBusPowered: false });
    expect(new Set(sweeping).size).toBeGreaterThan(10);
  });
});
