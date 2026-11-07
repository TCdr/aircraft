// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The autobrake RTO steps of the A380X aircraft presets (aircraft_preset_procedures.xml), run with RpnTestInterpreter
// against a model of the RTO push button, the braking system that reads it and the PRIMs the braking system needs:
// the pb is momentary (the cockpit writes IS_PRESSED 1 on mouse press, 0 on release), the braking system toggles the
// armed state on the press edge only and arms only while its arming conditions (A-SKID, two healthy PRIMs, an aligned
// ADIRU) hold, and the PRIM healthy flag is briefly set in the gaps of the power-up self-test light sequence.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  decodeXmlCode,
  runRpn,
  RpnVariables,
  RpnWrite,
} from '../../../../../fbw-a32nx/src/behavior/RpnTestInterpreter';

const PRESET_FILE = join(
  __dirname,
  '..',
  '..',
  '..',
  'base',
  'flybywire-aircraft-a380-842',
  'config',
  'a380x',
  'a380-842',
  'aircraft_preset_procedures.xml',
);

const PRIM_SOURCE_DIR = join(__dirname, '..', '..', '..', 'wasm', 'fbw_a380', 'src', 'prim');

const PRESSED_VAR = 'L:A32NX_OVHD_AUTOBRK_RTO_ARM_IS_PRESSED';
const ARMED_VAR = 'L:A32NX_AUTOBRAKES_RTO_ARMED';
const BRAKING_MODE_VAR = 'L:A32NX_BRAKES_PEDAL_BRAKING_MODE';
const PRIM_HEALTHY_VARS = ['L:A32NX_PRIM_1_HEALTHY', 'L:A32NX_PRIM_2_HEALTHY', 'L:A32NX_PRIM_3_HEALTHY'];
const PRIM_LAW_STATUS_WORD_VARS = [
  'L:A32NX_PRIM_1_FCTL_LAW_STATUS_WORD',
  'L:A32NX_PRIM_2_FCTL_LAW_STATUS_WORD',
  'L:A32NX_PRIM_3_FCTL_LAW_STATUS_WORD',
];
const ADIRU_STATE_VARS = ['L:A32NX_ADIRS_ADIRU_1_STATE', 'L:A32NX_ADIRS_ADIRU_2_STATE', 'L:A32NX_ADIRS_ADIRU_3_STATE'];

const BRAKING_MODE_NONE = 0;
const BRAKING_MODE_NORMAL = 1;
const BRAKING_MODE_ALTERNATE = 2;
const BRAKING_MODE_EMERGENCY = 3;
const ADIRU_ALIGNING = 1;
const ADIRU_ALIGNED = 2;

/** An ARINC 429 word in a simulator variable carries its data in the low 32 bits and the SSM above them */
const ARINC_SSM_WEIGHT = 2 ** 32;
const SSM_NORMAL_OPERATION = 3;
const SSM_FAILURE_WARNING = 0;
const LAW_STATUS_DATA = 1236369408;

/** The RTO armed state each procedure has to leave behind when the braking system can arm */
const TARGET_BY_PROCEDURE: Record<string, number> = {
  TAXI_CONFIG_ON: 1,
  TAXI_CONFIG_OFF: 0,
};

type PresetMode = 'expedited' | 'normal';

interface PresetStep {
  procedure: string;
  name: string;
  type: string;
  condition: string;
  action: string | undefined;
}

/** The autobrake steps of every procedure: the RTO pb steps and the arming-conditions wait in front of them */
function autobrakeSteps(xml: string): PresetStep[] {
  const steps: PresetStep[] = [];
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  const procedures = withoutComments.matchAll(/<Procedure Name="([^"]+)">([\s\S]*?)<\/Procedure>/g);
  for (const [, procedure, body] of procedures) {
    const stepBlocks = body.matchAll(
      /<Step Name="((?:Autobrake RTO|Await AUTO BRK)[^"]*)" Type="(\w+)"[^>]*>\s*<Condition>([\s\S]*?)<\/Condition>\s*(?:<Action>([\s\S]*?)<\/Action>)?/g,
    );
    for (const [, name, type, condition, action] of stepBlocks) {
      steps.push({
        procedure,
        name,
        type,
        condition: decodeXmlCode(condition),
        action: action === undefined ? undefined : decodeXmlCode(action),
      });
    }
  }
  return steps;
}

function sourceMatch(source: string, pattern: RegExp, what: string): string {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`${what} not found in the PRIM source`);
  }
  return match[1];
}

const primCpp = readFileSync(join(PRIM_SOURCE_DIR, 'Prim.cpp'), 'utf8');
const primHeader = readFileSync(join(PRIM_SOURCE_DIR, 'Prim.h'), 'utf8');

/** The power-up self-test as the PRIM runs it: its length and the times (from power-up) the FAULT light is on */
const SELF_TEST_DURATION_S = Number(
  sourceMatch(primHeader, /longSelfTestDuration = ([\d.]+);/, 'the self-test duration'),
);
const TEST_LIGHT_ON_TIMES: [number, number][] = [
  ...sourceMatch(primCpp, /testLightOnTimes\[\]\[2\] = \{(.*)\};/, 'the test light sequence').matchAll(
    /\{([\d.]+), ([\d.]+)\}/g,
  ),
].map(([, from, to]) => [Number(from), Number(to)]);

/** The line of Prim.cpp the healthy flag of the PRIM model follows */
const PRIM_HEALTHY_FORMULA =
  'output.prim_healthy = (selfTestComplete && monitoringHealthy) || (!selfTestComplete && !selfTestFaultLightVisible);';

/** What the fly-by-wire module writes for one PRIM: the healthy flag the braking system reads and the law status word */
interface PrimOutputs {
  healthy: number;
  lawStatusWord: number;
}

/**
 * A PRIM some seconds after power-up. During the self-test the healthy flag is the inverse of the FAULT light, so it
 * is set in the gaps of the light sequence, while the bus outputs stay zero until the test is complete and the
 * monitoring is healthy.
 */
function primAfterPowerUp(secondsSincePowerUp: number): PrimOutputs {
  const selfTestComplete = secondsSincePowerUp >= SELF_TEST_DURATION_S;
  const monitoringHealthy = selfTestComplete;
  const selfTestFaultLightVisible =
    !selfTestComplete &&
    TEST_LIGHT_ON_TIMES.some(([from, to]) => secondsSincePowerUp >= from && secondsSincePowerUp <= to);
  const healthy = (selfTestComplete && monitoringHealthy) || (!selfTestComplete && !selfTestFaultLightVisible);
  return {
    healthy: healthy ? 1 : 0,
    lawStatusWord: monitoringHealthy ? SSM_NORMAL_OPERATION * ARINC_SSM_WEIGHT + LAW_STATUS_DATA : 0,
  };
}

const PRIM_OPERATIVE = primAfterPowerUp(SELF_TEST_DURATION_S);
const PRIM_OFF: PrimOutputs = { healthy: 0, lawStatusWord: 0 };
/** Halfway through the first gap of the light sequence: healthy flag set, no bus output */
const PRIM_IN_TEST_GAP = primAfterPowerUp((TEST_LIGHT_ON_TIMES[0][1] + TEST_LIGHT_ON_TIMES[1][0]) / 2);
/** A PRIM sending its word with a failure warning: the data alone does not make it operative */
const PRIM_WORD_FAILURE_WARNING: PrimOutputs = {
  healthy: 1,
  lawStatusWord: SSM_FAILURE_WARNING * ARINC_SSM_WEIGHT + LAW_STATUS_DATA,
};

/** The braking system inputs behind the arming conditions, as the preset reads them */
interface ArmingInputs {
  brakingMode: number;
  prims: PrimOutputs[];
  adiruStates: number[];
}

const ARMING_POSSIBLE_INPUTS: ArmingInputs = {
  brakingMode: BRAKING_MODE_NORMAL,
  prims: [PRIM_OPERATIVE, PRIM_OPERATIVE, PRIM_OPERATIVE],
  adiruStates: [ADIRU_ALIGNED, ADIRU_ALIGNING, ADIRU_ALIGNING],
};

/** Right after an expedited engine start: no brake pressure yet, PRIMs not up, ADIRUs still aligning */
const ARMING_IMPOSSIBLE_INPUTS: ArmingInputs = {
  brakingMode: BRAKING_MODE_NONE,
  prims: [PRIM_OFF, PRIM_OFF, PRIM_OFF],
  adiruStates: [ADIRU_ALIGNING, ADIRU_ALIGNING, ADIRU_ALIGNING],
};

/** A cold aircraft at power-up with the brakes and an ADIRU ready: only the PRIM self-test keeps RTO from arming */
const POWER_UP_INPUTS: ArmingInputs = {
  brakingMode: BRAKING_MODE_NORMAL,
  prims: [PRIM_OFF, PRIM_OFF, PRIM_OFF],
  adiruStates: [ADIRU_ALIGNED, ADIRU_ALIGNING, ADIRU_ALIGNING],
};

function armingVariables(inputs: ArmingInputs): RpnVariables {
  const variables: RpnVariables = { [BRAKING_MODE_VAR]: inputs.brakingMode };
  inputs.prims.forEach((prim, index) => {
    variables[PRIM_HEALTHY_VARS[index]] = prim.healthy;
    variables[PRIM_LAW_STATUS_WORD_VARS[index]] = prim.lawStatusWord;
  });
  ADIRU_STATE_VARS.forEach((name, index) => {
    variables[name] = inputs.adiruStates[index];
  });
  return variables;
}

/** The braking system's own arming conditions (allow_autobrake_arming), which count the PRIM healthy flags */
function brakingSystemCanArm(inputs: ArmingInputs): boolean {
  const aSkidAvailable = inputs.brakingMode === BRAKING_MODE_NORMAL || inputs.brakingMode === BRAKING_MODE_ALTERNATE;
  const healthyPrims = inputs.prims.filter((prim) => prim.healthy !== 0).length;
  return aSkidAvailable && healthyPrims >= 2 && inputs.adiruStates.includes(ADIRU_ALIGNED);
}

/**
 * The RTO pb as the braking system sees it (PressSingleSignalButton): a press is the rising edge of IS_PRESSED, a
 * held button is one press, and each press toggles the armed state (determine_mode arms RTO or deselects it), where
 * arming needs the braking system's arming conditions and disarming does not.
 */
class RtoPushButtonModel {
  presses = 0;

  /** The braking system disarms RTO as soon as arming is no longer allowed, so RTO is never armed without it */
  rtoArmed: number;

  /** A pb already held when the preset starts was pressed before it ran, so that press is no new edge */
  private lastPressed: number;

  constructor(
    rtoArmed: number,
    public pressed: number,
    public armingInputs: ArmingInputs,
  ) {
    this.rtoArmed = brakingSystemCanArm(armingInputs) ? rtoArmed : 0;
    this.lastPressed = pressed;
  }

  variables(): RpnVariables {
    return { ...armingVariables(this.armingInputs), [PRESSED_VAR]: this.pressed, [ARMED_VAR]: this.rtoArmed };
  }

  apply(writes: RpnWrite[]): void {
    for (const { target, value } of writes) {
      if (target !== PRESSED_VAR) {
        throw new Error(`the RTO push button model does not know ${target}`);
      }
      this.pressed = value;
    }
  }

  /** One braking system update */
  tick(): void {
    const canArm = brakingSystemCanArm(this.armingInputs);
    if (!canArm) {
      this.rtoArmed = 0;
    }
    const edge = this.pressed !== 0 && this.lastPressed === 0;
    this.lastPressed = this.pressed;
    if (!edge) {
      return;
    }
    this.presses++;
    if (this.rtoArmed) {
      this.rtoArmed = 0;
    } else if (canArm) {
      this.rtoArmed = 1;
    }
  }
}

function conditionHolds(step: PresetStep, model: RtoPushButtonModel): boolean {
  return runRpn(step.condition, model.variables()).value !== 0;
}

/** A condition-only step is run in expedited mode only (ECON), normal mode only (NCON) or both (COND) */
function stepRunsIn(step: PresetStep, mode: PresetMode): boolean {
  if (step.type === 'ECON') {
    return mode === 'expedited';
  }
  if (step.type === 'NCON') {
    return mode === 'normal';
  }
  return true;
}

/**
 * The preset runner: an action step runs its action only while the expected state is missing, then the runner waits
 * for it; a condition-only step waits for the aircraft, which for these steps means the braking system becoming able
 * to arm.
 */
function runStep(step: PresetStep, model: RtoPushButtonModel): void {
  if (step.action === undefined) {
    if (!conditionHolds(step, model)) {
      model.armingInputs = ARMING_POSSIBLE_INPUTS;
    }
  } else if (!conditionHolds(step, model)) {
    model.apply(runRpn(step.action, model.variables()).writes);
    model.tick();
  }
  expect(conditionHolds(step, model), `${step.name}: the expected state holds right after the step`).toBe(true);
}

function runProcedure(steps: PresetStep[], model: RtoPushButtonModel, mode: PresetMode): void {
  for (const step of steps) {
    if (stepRunsIn(step, mode)) {
      runStep(step, model);
    }
  }
}

const TICK_S = 0.1;

/**
 * The same runner over time, from the power-up of the three PRIMs: every tick the PRIMs advance in their self-test
 * and the braking system updates before the runner looks at its current step, which it leaves once the condition
 * holds and otherwise acts on. Returns the times of the pb presses the braking system saw.
 */
function runProcedureFromPowerUp(
  steps: PresetStep[],
  model: RtoPushButtonModel,
  mode: PresetMode,
  durationS: number,
): number[] {
  const pending = steps.filter((step) => stepRunsIn(step, mode));
  const pressTimes: number[] = [];
  for (let tick = 0; tick * TICK_S <= durationS; tick++) {
    const time = tick * TICK_S;
    model.armingInputs = { ...model.armingInputs, prims: model.armingInputs.prims.map(() => primAfterPowerUp(time)) };
    const pressesBefore = model.presses;
    model.tick();
    if (model.presses > pressesBefore) {
      pressTimes.push(time);
    }
    const step = pending[0];
    if (step === undefined) {
      continue;
    }
    if (conditionHolds(step, model)) {
      pending.shift();
    } else if (step.action !== undefined) {
      model.apply(runRpn(step.action, model.variables()).writes);
    }
  }
  expect(pending, 'every step completed in time').toEqual([]);
  return pressTimes;
}

/** Every button state a preset can start from: idle or held, with RTO armed or not */
const START_STATES: [rtoArmed: number, pressed: number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

const MODES: PresetMode[] = ['expedited', 'normal'];

const allSteps = autobrakeSteps(readFileSync(PRESET_FILE, 'utf8'));

describe('A380X aircraft preset autobrake RTO steps', () => {
  it('wait for the arming conditions before takeoff, then release, press and release the pb once per procedure', () => {
    expect(allSteps.map((step) => `${step.procedure}: ${step.name} (${step.type})`)).toEqual([
      'TAXI_CONFIG_ON: Await AUTO BRK Arming Conditions (ECON)',
      'TAXI_CONFIG_ON: Autobrake RTO Not Held (STEP)',
      'TAXI_CONFIG_ON: Autobrake RTO (STEP)',
      'TAXI_CONFIG_ON: Autobrake RTO Release (STEP)',
      'TAXI_CONFIG_OFF: Autobrake RTO Off Not Held (STEP)',
      'TAXI_CONFIG_OFF: Autobrake RTO Off (STEP)',
      'TAXI_CONFIG_OFF: Autobrake RTO Off Release (STEP)',
    ]);
  });

  describe('the PRIM model', () => {
    it('follows the healthy formula and the self-test timing of the PRIM source', () => {
      expect(primCpp).toContain(PRIM_HEALTHY_FORMULA);
      expect(TEST_LIGHT_ON_TIMES.length).toBeGreaterThanOrEqual(2);
      expect(SELF_TEST_DURATION_S).toBeGreaterThan(TEST_LIGHT_ON_TIMES[TEST_LIGHT_ON_TIMES.length - 1][1]);
    });

    it('sets the healthy flag in a gap of the light sequence without sending the law status word', () => {
      expect(primAfterPowerUp(TEST_LIGHT_ON_TIMES[0][0])).toEqual(PRIM_OFF);
      expect(PRIM_IN_TEST_GAP).toEqual({ healthy: 1, lawStatusWord: 0 });
      expect(PRIM_OPERATIVE.healthy).toBe(1);
      expect(Math.floor(PRIM_OPERATIVE.lawStatusWord / ARINC_SSM_WEIGHT)).toBe(SSM_NORMAL_OPERATION);
    });
  });

  describe('the arming conditions the preset waits for', () => {
    const waitStep = allSteps.find((step) => step.name === 'Await AUTO BRK Arming Conditions')!;
    const armingPossible = (inputs: ArmingInputs) => runRpn(waitStep.condition, armingVariables(inputs)).value !== 0;

    it('hold with A-SKID available, two operative PRIMs and one aligned ADIRU', () => {
      expect(armingPossible(ARMING_POSSIBLE_INPUTS)).toBe(true);
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, brakingMode: BRAKING_MODE_ALTERNATE })).toBe(true);
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, prims: [PRIM_OFF, PRIM_OPERATIVE, PRIM_OPERATIVE] })).toBe(
        true,
      );
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, prims: [PRIM_OPERATIVE, PRIM_OFF, PRIM_OPERATIVE] })).toBe(
        true,
      );
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, prims: [PRIM_OPERATIVE, PRIM_OPERATIVE, PRIM_OFF] })).toBe(
        true,
      );
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, adiruStates: [ADIRU_ALIGNING, ADIRU_ALIGNED, 0] })).toBe(true);
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, adiruStates: [0, ADIRU_ALIGNING, ADIRU_ALIGNED] })).toBe(true);
    });

    it('fail when any single condition is missing', () => {
      expect(armingPossible(ARMING_IMPOSSIBLE_INPUTS)).toBe(false);
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, brakingMode: BRAKING_MODE_NONE })).toBe(false);
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, brakingMode: BRAKING_MODE_EMERGENCY })).toBe(false);
      expect(armingPossible({ ...ARMING_POSSIBLE_INPUTS, prims: [PRIM_OPERATIVE, PRIM_OFF, PRIM_OFF] })).toBe(false);
      expect(
        armingPossible({ ...ARMING_POSSIBLE_INPUTS, adiruStates: [ADIRU_ALIGNING, ADIRU_ALIGNING, ADIRU_ALIGNING] }),
      ).toBe(false);
    });

    it('do not count a PRIM whose healthy flag is set in a gap of its self-test or whose word is not valid', () => {
      expect(
        armingPossible({ ...ARMING_POSSIBLE_INPUTS, prims: [PRIM_OPERATIVE, PRIM_IN_TEST_GAP, PRIM_IN_TEST_GAP] }),
      ).toBe(false);
      expect(
        armingPossible({ ...ARMING_POSSIBLE_INPUTS, prims: [PRIM_OPERATIVE, PRIM_WORD_FAILURE_WARNING, PRIM_OFF] }),
      ).toBe(false);
    });
  });

  describe('TAXI_CONFIG_ON from a cold power-up, expedited', () => {
    const steps = allSteps.filter((step) => step.procedure === 'TAXI_CONFIG_ON');

    it('presses the pb once after the PRIM self-test and leaves RTO armed', () => {
      const model = new RtoPushButtonModel(0, 0, POWER_UP_INPUTS);
      const pressTimes = runProcedureFromPowerUp(steps, model, 'expedited', 60);
      expect(pressTimes.length).toBe(1);
      expect(pressTimes[0]).toBeGreaterThanOrEqual(SELF_TEST_DURATION_S);
      expect(pressTimes[0]).toBeLessThan(SELF_TEST_DURATION_S + 2);
      expect(model.rtoArmed).toBe(1);
      expect(model.pressed).toBe(0);
    });
  });

  describe.each(Object.keys(TARGET_BY_PROCEDURE))('%s', (procedure) => {
    const steps = allSteps.filter((step) => step.procedure === procedure);
    const target = TARGET_BY_PROCEDURE[procedure];

    describe.each(MODES)('%s mode', (mode) => {
      describe.each([true, false])('arming possible %s', (armingPossible) => {
        const armingInputs = armingPossible ? ARMING_POSSIBLE_INPUTS : ARMING_IMPOSSIBLE_INPUTS;
        /** Normal mode does not wait for the braking system, so without its arming conditions RTO stays unarmed */
        const expectedArmed = target === 1 && mode === 'normal' && !armingPossible ? 0 : target;

        it.each(START_STATES)(
          'from RTO armed %i, pb %i: RTO ends at the target and the pb is released',
          (rtoArmed, pressed) => {
            const model = new RtoPushButtonModel(rtoArmed, pressed, armingInputs);
            runProcedure(steps, model, mode);
            expect(model.rtoArmed).toBe(expectedArmed);
            expect(model.pressed).toBe(0);
          },
        );

        it.each(START_STATES)(
          'from RTO armed %i, pb %i: a second run does not toggle RTO back',
          (rtoArmed, pressed) => {
            const model = new RtoPushButtonModel(rtoArmed, pressed, armingInputs);
            runProcedure(steps, model, mode);
            runProcedure(steps, model, mode);
            expect(model.rtoArmed).toBe(expectedArmed);
            expect(model.pressed).toBe(0);
          },
        );

        it.each(START_STATES)(
          'from RTO armed %i, pb %i: the pb is pressed at most once, never while at the target',
          (rtoArmed, pressed) => {
            const model = new RtoPushButtonModel(rtoArmed, pressed, armingInputs);
            const initiallyArmed = model.rtoArmed;
            runProcedure(steps, model, mode);
            expect(model.presses).toBe(initiallyArmed === expectedArmed ? 0 : 1);
          },
        );
      });
    });
  });
});
