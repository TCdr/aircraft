// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The STROBE switch steps of the aircraft presets of both aircraft (aircraft_preset_procedures.xml), run with
// RpnTestInterpreter against a model of the Asobo three-position light switch the two cockpits use
// (ASOBO_LIGHTING_Switch_Light_Strobe_Template, TYPE Auto).

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { decodeXmlCode, runRpn, RpnVariables, RpnWrite } from './RpnTestInterpreter';

const PRESET_FILES: Record<string, string> = {
  A32NX: join(
    __dirname,
    '..',
    'base',
    'flybywire-aircraft-a320-neo',
    'config',
    'a32nx',
    'a320-251n',
    'aircraft_preset_procedures.xml',
  ),
  A380X: join(
    __dirname,
    '..',
    '..',
    '..',
    'fbw-a380x',
    'src',
    'base',
    'flybywire-aircraft-a380-842',
    'config',
    'a380x',
    'a380-842',
    'aircraft_preset_procedures.xml',
  ),
};

const POSITION_VAR = 'L:LIGHTING_STROBE_0';
const AUTO_VAR = 'L:STROBE_0_AUTO';
const LIGHT_VAR = 'A:LIGHT STROBE';

enum StrobePosition {
  On = 0,
  Auto = 1,
  Off = 2,
}

const TARGET_BY_STEP_NAME: Record<string, StrobePosition> = {
  'Strobe On': StrobePosition.On,
  'Strobe Auto': StrobePosition.Auto,
  'Strobe Off': StrobePosition.Off,
};

interface PresetStep {
  procedure: string;
  name: string;
  condition: string;
  action: string;
}

function strobeSteps(xml: string): PresetStep[] {
  const steps: PresetStep[] = [];
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  const procedures = withoutComments.matchAll(/<Procedure Name="([^"]+)">([\s\S]*?)<\/Procedure>/g);
  for (const [, procedure, body] of procedures) {
    const stepBlocks = body.matchAll(
      /<Step Name="(Strobe [^"]+)"[^>]*>\s*<Condition>([\s\S]*?)<\/Condition>\s*<Action>([\s\S]*?)<\/Action>/g,
    );
    for (const [, name, condition, action] of stepBlocks) {
      steps.push({ procedure, name, condition: decodeXmlCode(condition), action: decodeXmlCode(action) });
    }
  }
  return steps;
}

/**
 * The Asobo three-position strobe switch (0 ON, 1 AUTO, 2 OFF): its input event sets the position variable, the
 * AUTO flag and the sim light in one go.
 */
class StrobeSwitchModel {
  constructor(
    public position: number,
    public auto: number,
    public light: number,
  ) {}

  variables(): RpnVariables {
    return { [POSITION_VAR]: this.position, [AUTO_VAR]: this.auto, [LIGHT_VAR]: this.light };
  }

  apply(writes: RpnWrite[]): void {
    for (const { target, value } of writes) {
      if (target !== 'B:LIGHTING_STROBE_0_Set') {
        throw new Error(`the strobe switch model does not know ${target}`);
      }
      this.position = value;
      this.auto = value === StrobePosition.Auto ? 1 : 0;
      this.light = value === StrobePosition.Off ? 0 : 1;
    }
  }
}

const ENGINES_RUNNING: RpnVariables = { 'L:A32NX_ENGINE_STATE:1': 1, 'L:A32NX_ENGINE_STATE:2': 1 };

function conditionHolds(step: PresetStep, model: StrobeSwitchModel, extra: RpnVariables = ENGINES_RUNNING): boolean {
  return runRpn(step.condition, { ...extra, ...model.variables() }).value !== 0;
}

/** Every switch state a preset can start from: the three consistent ones and the nine a direct position write left behind */
const START_STATES: [position: number, auto: number, light: number][] = [];
for (const position of [StrobePosition.On, StrobePosition.Auto, StrobePosition.Off]) {
  for (const auto of [0, 1]) {
    for (const light of [0, 1]) {
      START_STATES.push([position, auto, light]);
    }
  }
}

describe.each(Object.keys(PRESET_FILES))('%s aircraft preset strobe steps', (aircraft) => {
  const steps = strobeSteps(readFileSync(PRESET_FILES[aircraft], 'utf8'));

  it('has one strobe step per procedure that touches the switch', () => {
    expect(steps.map((step) => `${step.procedure}: ${step.name}`)).toEqual([
      'POWERUP_CONFIG_ON: Strobe Auto',
      'POWERUP_CONFIG_OFF: Strobe Off',
      'TAKEOFF_CONFIG_ON: Strobe On',
      'TAKEOFF_CONFIG_OFF: Strobe Auto',
    ]);
  });

  it('sets the switch through its input event, never the position or the AUTO flag directly', () => {
    for (const step of steps) {
      expect(step.action, step.name).not.toContain(`>${POSITION_VAR}`);
      expect(step.action, step.name).not.toContain(`>${AUTO_VAR}`);
      expect(step.action, step.name).not.toContain('K:STROBES');
    }
  });

  describe.each(steps)('$procedure', (step) => {
    const target = TARGET_BY_STEP_NAME[step.name];

    it.each(START_STATES)(
      `${step.name} from position %i, auto %i, light %i: switch and light agree, no wait`,
      (position, auto, light) => {
        const model = new StrobeSwitchModel(position, auto, light);
        if (!conditionHolds(step, model)) {
          model.apply(runRpn(step.action, { ...ENGINES_RUNNING, ...model.variables() }).writes);
        }
        expect(model.position).toBe(target);
        expect(model.auto).toBe(target === StrobePosition.Auto ? 1 : 0);
        expect(model.light).toBe(target === StrobePosition.Off ? 0 : 1);
        expect(conditionHolds(step, model), 'the expected state holds right after the action').toBe(true);
      },
    );

    it(`${step.name}: the bug state (switch shows the target, light does not follow) is repaired`, () => {
      const model = new StrobeSwitchModel(target, 0, target === StrobePosition.Off ? 1 : 0);
      expect(conditionHolds(step, model)).toBe(false);
      model.apply(runRpn(step.action, { ...ENGINES_RUNNING, ...model.variables() }).writes);
      expect(model.light).toBe(target === StrobePosition.Off ? 0 : 1);
      expect(conditionHolds(step, model)).toBe(true);
    });
  });
});

describe('A32NX strobes to AUTO after landing', () => {
  const step = strobeSteps(readFileSync(PRESET_FILES.A32NX, 'utf8')).find(
    (candidate) => candidate.procedure === 'TAKEOFF_CONFIG_OFF',
  );
  if (!step) {
    throw new Error('TAKEOFF_CONFIG_OFF has no strobe step');
  }

  it('is skipped once both engines are shut down, whatever the switch shows', () => {
    const enginesOff: RpnVariables = { 'L:A32NX_ENGINE_STATE:1': 0, 'L:A32NX_ENGINE_STATE:2': 0 };
    for (const state of START_STATES) {
      expect(conditionHolds(step, new StrobeSwitchModel(...state), enginesOff)).toBe(true);
    }
  });
});
