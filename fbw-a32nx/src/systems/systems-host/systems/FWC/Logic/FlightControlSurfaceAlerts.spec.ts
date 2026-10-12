// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import {
  FcdcBits,
  FcdcWords,
  FlightControlSurfaceMonitor,
  FlightControlSurfacePhaseInhibition,
  HYDRAULIC_RECOVERY_CONFIRM_SECONDS,
  HydraulicSystem,
  NO_SURFACE_FAULT,
  computeSurfaceState,
  elac12FaultLines,
  elacFaultAlerts,
  elevatorFaultLines,
  aileronFaultLines,
  spoilerFaultLines,
} from './FlightControlSurfaceAlerts';

const W1 = FcdcBits.word1;
const W3 = FcdcBits.word3;

/** An FCDC discrete word as the C++ writes it: the bits as the float data, with an SSM */
function word(bits: number[], ssm = Arinc429SignStatusMatrix.NormalOperation): Arinc429Word {
  const data = bits.reduce((sum, bit) => sum + 2 ** (bit - 1), 0);
  return new Arinc429Word(Arinc429Word.getRawWord(data, ssm));
}

const ALL_SERVOJACKS_AVAILABLE = [11, 12, 13, 14, 15, 16, 17, 18];

interface FcdcSetup {
  /** bits set in word 1 (computer faults) */
  word1?: number[];
  /** "available" bits of word 3 that are cleared */
  lost?: number[];
  /** bits set in word 5 */
  word5?: number[];
  ssm?: Arinc429SignStatusMatrix;
}

/** Both FCDCs with the same words */
function fcdc(setup: FcdcSetup = {}): FcdcWords {
  const ssm = setup.ssm ?? Arinc429SignStatusMatrix.NormalOperation;
  return {
    word1: word(setup.word1 ?? [], ssm),
    word3: word(
      ALL_SERVOJACKS_AVAILABLE.filter((bit) => !(setup.lost ?? []).includes(bit)),
      ssm,
    ),
    word5: word(setup.word5 ?? [], ssm),
  };
}

/** The state with the given hydraulic systems at low pressure (the others confirmed pressurised) */
function state(setup: FcdcSetup, lowPressure: HydraulicSystem[] = []) {
  const words = fcdc(setup);
  return computeSurfaceState(words, words, (system) => !lowPressure.includes(system));
}

const ACTIVE_KEYS = (s: ReturnType<typeof state>) =>
  Object.entries(s)
    .filter(([key, value]) => key !== 'spoilerFaults' && value === true)
    .map(([key]) => key);

describe('F/CTL surface cautions (FCOM PRO-ABN-F_CTL)', () => {
  it('no caution with all servojacks available', () => {
    expect(state({})).toEqual(NO_SURFACE_FAULT);
  });

  it('no caution when both FCDCs send nothing (FCDC 1+2 FAULT)', () => {
    expect(state({ ssm: Arinc429SignStatusMatrix.FailureWarning, lost: ALL_SERVOJACKS_AVAILABLE })).toEqual(
      NO_SURFACE_FAULT,
    );
  });

  describe('ailerons (AIL SERVO FAULT l.82488-82505, L(R) AIL FAULT l.83448-83480)', () => {
    it('one servojack lost by a servo fault: AIL SERVO FAULT only', () => {
      expect(ACTIVE_KEYS(state({ lost: [W3.leftAileronElac1Available] }))).toEqual(['ailServoFault']);
    });

    it('both servojacks of the left aileron lost by servo faults: L AIL FAULT, not AIL SERVO FAULT', () => {
      expect(ACTIVE_KEYS(state({ lost: [W3.leftAileronElac1Available, W3.leftAileronElac2Available] }))).toEqual([
        'leftAileronFault',
      ]);
    });

    it('a servojack lost by its hydraulic system (blue): no F/CTL caution, the HYD alert covers it', () => {
      expect(ACTIVE_KEYS(state({ lost: [W3.leftAileronElac1Available] }, ['blue']))).toEqual([]);
    });

    it('G+B low pressure: both ailerons lost by the hydraulics, no L(R) AIL FAULT', () => {
      expect(ACTIVE_KEYS(state({ lost: [11, 12, 13, 14] }, ['blue', 'green']))).toEqual([]);
    });

    it('ELAC 1 failed: its servojacks lost by the computer, no aileron caution', () => {
      expect(ACTIVE_KEYS(state({ word1: [W1.elac1Invalid], lost: [11, 13] }))).toEqual([]);
    });

    it('both ELACs failed: no L(R) AIL FAULT, ELAC 1+2 FAULT covers it (INOP SYS L+R AIL)', () => {
      expect(ACTIVE_KEYS(state({ word1: [W1.elac1Invalid, W1.elac2Invalid], lost: [11, 12, 13, 14] }))).toEqual([]);
    });

    it('ELAC 1 failed and green low pressure: the left aileron is lost by two causes, L AIL FAULT', () => {
      // left: ELAC 1 (computer) + ELAC 2 green (hydraulic); right: ELAC 1 green (both) + ELAC 2 blue available
      expect(ACTIVE_KEYS(state({ word1: [W1.elac1Invalid], lost: [11, 12, 13] }, ['green']))).toEqual([
        'leftAileronFault',
      ]);
    });
  });

  describe('elevators (ELEV SERVO FAULT l.82950-82986, L(R) ELEV FAULT l.83515-83599)', () => {
    it('one servojack lost by a servo fault: ELEV SERVO FAULT only', () => {
      expect(ACTIVE_KEYS(state({ lost: [W3.rightElevator2Available] }))).toEqual(['elevServoFault']);
    });

    it('both servojacks of the left elevator lost by servo faults: L ELEV FAULT and the ALTN LAW SPD BRK flag', () => {
      expect(ACTIVE_KEYS(state({ lost: [W3.leftElevator1Available, W3.leftElevator2Available] }))).toEqual([
        'leftElevatorFault',
        'leftOrRightElevatorLost',
      ]);
    });

    it('ELAC 1 + SEC 1 failed and green low pressure: L ELEV FAULT (the right elevator keeps its yellow servojack)', () => {
      const s = state({ word1: [W1.elac1Invalid, W1.sec1Invalid], lost: [15, 16, 17] }, ['green']);
      expect(ACTIVE_KEYS(s)).toEqual(['leftElevatorFault', 'leftOrRightElevatorLost']);
    });

    it('ELAC 1 failed alone: the SEC 1 keeps the blue servojacks, no caution', () => {
      expect(ACTIVE_KEYS(state({ word1: [W1.elac1Invalid] }))).toEqual([]);
    });

    it('B+G low pressure: the left elevator is lost by the hydraulics, no L ELEV FAULT, still SPD BRK DO NOT USE', () => {
      const s = state({ lost: [15, 16, 17] }, ['blue', 'green']);
      expect(s.leftElevatorFault).toBe(false);
      expect(s.elevServoFault).toBe(false);
      expect(s.leftOrRightElevatorLost).toBe(true);
    });

    it('both elevators lost: L+R ELEV FAULT (existing alert), not L or R ELEV FAULT', () => {
      const s = state({ lost: [15, 16, 17, 18] });
      expect(s.leftElevatorFault).toBe(false);
      expect(s.rightElevatorFault).toBe(false);
      expect(s.leftOrRightElevatorLost).toBe(true);
    });
  });

  describe('ELAC 1(2) PITCH FAULT (l.82916-82949)', () => {
    it('pitch channel lost, roll channel working, blue pressurised: ELAC 1 PITCH FAULT', () => {
      expect(ACTIVE_KEYS(state({ word1: [W1.elac1PitchFault] }))).toEqual(['elac1PitchFault']);
    });

    it('not with blue low pressure (the HYD alert), nor with the roll channel lost too (ELAC 1 FAULT)', () => {
      expect(state({ word1: [W1.elac1PitchFault] }, ['blue']).elac1PitchFault).toBe(false);
      expect(state({ word1: [W1.elac1PitchFault, W1.elac1RollFault] }).elac1PitchFault).toBe(false);
    });

    it('not for a failed ELAC (its pitch bit is set by the FCDC when the ELAC sends nothing)', () => {
      expect(state({ word1: [W1.elac1Invalid, W1.elac1PitchFault, W1.elac1RollFault] }).elac1PitchFault).toBe(false);
    });

    it('ELAC 2: its pitch works on green + yellow, or on one of them without blue (ElacComputer canEngageInPitch)', () => {
      expect(state({ word1: [W1.elac2PitchFault] }).elac2PitchFault).toBe(true);
      expect(state({ word1: [W1.elac2PitchFault] }, ['green']).elac2PitchFault).toBe(false);
      expect(state({ word1: [W1.elac2PitchFault] }, ['blue', 'green']).elac2PitchFault).toBe(true);
    });
  });

  describe('SPLR FAULT (l.84525-84648)', () => {
    it('a spoiler servo fault: SPLR FAULT; SPD BRK DO NOT USE only for spoilers 3 or 4', () => {
      const spoiler1 = state({ word5: [FcdcBits.word5.spoilerFault[0]] });
      expect(spoiler1.spoilerFault).toBe(true);
      expect(spoiler1.spoilerFaults).toEqual([true, false, false, false, false]);
      expect(spoilerFaultLines(spoiler1.spoilerFaults)).toEqual([0, null]);
      const spoiler4 = state({ word5: [FcdcBits.word5.spoilerFault[3]] });
      expect(spoilerFaultLines(spoiler4.spoilerFaults)).toEqual([0, 1]);
    });
  });

  describe('hydraulic recovery', () => {
    it(`a servojack still unavailable just after its pressure returns is not a servo fault for ${HYDRAULIC_RECOVERY_CONFIRM_SECONDS} s`, () => {
      const monitor = new FlightControlSurfaceMonitor();
      const words = fcdc({ lost: [W3.leftAileronElac1Available] });
      const inputs = (blue: boolean) => ({
        fcdc1: words,
        fcdc2: words,
        bluePressurised: blue,
        greenPressurised: true,
        yellowPressurised: true,
      });
      // all systems pressurised for a long time, then blue lost and back
      monitor.update(inputs(true), 60);
      expect(monitor.update(inputs(false), 1).ailServoFault).toBe(false);
      expect(monitor.update(inputs(true), 1).ailServoFault).toBe(false);
      expect(monitor.update(inputs(true), 1).ailServoFault).toBe(false);
      expect(monitor.update(inputs(true), 1.5).ailServoFault).toBe(true);
    });
  });
});

describe('ELAC 1+2 FAULT (FCOM l.82799-82853, BOTH COMPUTERS FAILED)', () => {
  it('replaces ELAC 1 FAULT and ELAC 2 FAULT when both are active', () => {
    expect(elacFaultAlerts(true, true)).toEqual({ elac1Fault: false, elac2Fault: false, elac12Fault: true });
    expect(elacFaultAlerts(true, false)).toEqual({ elac1Fault: true, elac2Fault: false, elac12Fault: false });
    expect(elacFaultAlerts(false, true)).toEqual({ elac1Fault: false, elac2Fault: true, elac12Fault: false });
    expect(elacFaultAlerts(false, false)).toEqual({ elac1Fault: false, elac2Fault: false, elac12Fault: false });
  });

  it('shows the FCOM procedure for both computers', () => {
    const lines = elac12FaultLines(true, true).filter((line): line is number => line !== null);
    const text = formatEwdMessages(lines.map((line) => `2701010${(line + 1).toString().padStart(2, '0')}`)).join('|');
    expect(text).toContain('ELAC 1+2 FAULT');
    expect(text).toContain('-ELAC 1.....OFF THEN ON');
    expect(text).toContain('-ELAC 2.....OFF THEN ON');
    expect(text).toContain('.IF BOTH ELAC FAULT');
    expect(text).toContain('-ELAC 1.............OFF');
    expect(text).toContain('-ELAC 2.............OFF');
    expect(text).toContain('FUEL CONSUMPT INCRSD');
    expect(text).toContain('FMS PRED UNRELIABLE');
  });

  it('drops the action lines of an ELAC once it is OFF', () => {
    expect(elac12FaultLines(false, true)).toEqual([0, null, 2, 3, null, 5, 6, 7]);
    expect(elac12FaultLines(false, false)).toEqual([0, null, null, null, null, null, 6, 7]);
  });
});

/** The visible width of an E/WD line (without the colour and underline codes) */
// eslint-disable-next-line no-control-regex
const visibleWidth = (line: string) => line.replace(/\x1b<\dm|\x1b4m|\x1bm/g, '').length;

describe('E/WD texts of the new F/CTL alerts', () => {
  const alerts: [string, number][] = [
    ['2701010', 8],
    ['2701020', 1],
    ['2701030', 1],
    ['2701040', 1],
    ['2701050', 3],
    ['2701060', 3],
    ['2701070', 1],
    ['2701080', 3],
    ['2701090', 3],
    ['2701100', 2],
  ];

  it.each(alerts)('%s: every line exists and fits the 24 E/WD columns', (prefix, count) => {
    const codes = Array.from({ length: count }, (_, i) => `${prefix}${(i + 1).toString().padStart(2, '0')}`);
    const texts = formatEwdMessages(codes);
    expect(texts).toHaveLength(count);
    texts.forEach((text) => {
      expect(text.trim().length).toBeGreaterThan(0);
      // the title line carries the group title "F/CTL"
      expect(visibleWidth(text)).toBeLessThanOrEqual(24);
    });
  });

  it('titles and lines as in the FCOM', () => {
    const text = (codes: string[]) => formatEwdMessages(codes).join('|');
    expect(text(['270105001', '270105002', '270105003'])).toMatch(/L ELEV FAULT.*MANEUVER WITH CARE.*MAX PITCH 15 DEG/);
    expect(text(['270108001', '270108002', '270108003'])).toMatch(/L AIL FAULT.*FUEL CONSUMPT INCRSD.*FMS PRED/);
    expect(text(['270110001', '270110002'])).toMatch(/SPLR FAULT.*SPD BRK......DO NOT USE/);
    expect(text(['270102001'])).toContain('ELAC 1 PITCH FAULT');
    expect(text(['270104001'])).toContain('ELEV SERVO FAULT');
    expect(text(['270107001'])).toContain('AIL SERVO FAULT');
    expect(elevatorFaultLines()).toEqual([0, 1, 2]);
    expect(aileronFaultLines()).toEqual([0, 1, 2]);
  });
});

/* Source-level checks of the PseudoFWC wiring: a wrong variable or a forgotten alert would silently show nothing. */
describe('PseudoFWC wiring', () => {
  const repoRoot = resolve(__dirname, '../../../../../../..');
  const pseudoFwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf8');
  const flyByWireInterface = readFileSync(
    resolve(repoRoot, 'fbw-a32nx/src/wasm/fbw_a320/src/FlyByWireInterface.cpp'),
    'utf8',
  );
  const fcdcCpp = readFileSync(resolve(repoRoot, 'fbw-a32nx/src/wasm/fbw_a320/src/fcdc/Fcdc.cpp'), 'utf8');

  /** The text of one alert entry of the PseudoFWC table */
  const entry = (key: string) => {
    const start = pseudoFwc.indexOf(`    ${key}: {`);
    expect(start).toBeGreaterThan(0);
    return pseudoFwc.slice(start, pseudoFwc.indexOf('\n    },', start));
  };

  it('ALTN LAW keys SPD BRK DO NOT USE on the elevator loss, not on the FCDC SPD BRK 3+4 bit (FCOM l.82547)', () => {
    for (const key of ['2700375', '2700390']) {
      expect(entry(key)).toContain('this.fctlSurfaces.leftOrRightElevatorLost');
      expect(entry(key)).not.toContain('speedBrakeDoNotUse');
    }
  });

  it('ELAC 1 FAULT and ELAC 2 FAULT give way to ELAC 1+2 FAULT', () => {
    expect(entry('2700110')).toContain('simVarIsActive: this.elac1FaultAlert');
    expect(entry('2700120')).toContain('simVarIsActive: this.elac2FaultAlert');
    expect(entry('2701010')).toContain('simVarIsActive: this.elac12FaultAlert');
  });

  it('the new alerts use the FCOM phase inhibitions and levels', () => {
    const expected: [string, string, number][] = [
      ['2701010', 'FctlPhases.elacFault', 2],
      ['2701020', 'FctlPhases.elacPitchFault', 1],
      ['2701030', 'FctlPhases.elacPitchFault', 1],
      ['2701040', 'FctlPhases.elevServoFault', 1],
      ['2701050', 'FctlPhases.elevatorFault', 2],
      ['2701060', 'FctlPhases.elevatorFault', 2],
      ['2701070', 'FctlPhases.ailServoFault', 1],
      ['2701080', 'FctlPhases.aileronFault', 2],
      ['2701090', 'FctlPhases.aileronFault', 2],
      ['2701100', 'FctlPhases.spoilerFault', 2],
      ['2700360', 'FctlPhases.fcdc12Fault', 2],
    ];
    for (const [key, phases, level] of expected) {
      expect(entry(key)).toContain(`flightPhaseInhib: ${phases},`);
      expect(entry(key)).toContain(`failure: ${level},`);
    }
    expect(FlightControlSurfacePhaseInhibition.fcdc12Fault).toEqual([4, 5, 7]);
  });

  it('reads the FCDC words the C++ writes', () => {
    for (const n of [1, 2]) {
      for (const w of [1, 3, 5]) {
        expect(pseudoFwc).toContain(`'L:A32NX_FCDC_${n}_DISCRETE_WORD_${w}'`);
      }
    }
    expect(flyByWireInterface).toContain('"A32NX_FCDC_" + idString + "_DISCRETE_WORD_');
    expect(flyByWireInterface).toMatch(/idFcdcDiscreteWord3\[fcdcIndex\]->set\(.*efcs_status_word_3/);
    expect(flyByWireInterface).toMatch(/idFcdcDiscreteWord5\[fcdcIndex\]->set\(.*efcs_status_word_5/);
  });

  it('uses the FCDC bits as Fcdc.cpp writes them', () => {
    // word 1: ELAC pitch/roll faults and computer validity
    expect(fcdcCpp).toContain(
      `efcsStatus1.setBit(${W1.elac1PitchFault}, bitFromValueOr(busInputs.elac1.discrete_status_word_1, 21, true))`,
    );
    expect(fcdcCpp).toContain(
      `efcsStatus1.setBit(${W1.elac2RollFault}, bitFromValueOr(busInputs.elac2.discrete_status_word_1, 22, true))`,
    );
    expect(fcdcCpp).toContain(`efcsStatus1.setBit(${W1.elac1Invalid}, !discreteInputs.elac1Valid)`);
    expect(fcdcCpp).toContain(`efcsStatus1.setBit(${W1.sec2Invalid}, !discreteInputs.sec2Valid)`);
    // word 3: aileron servojacks by ELAC (ELAC discrete word 1 bits 15/16), elevators by ELAC or SEC (bits 17/18)
    expect(fcdcCpp).toContain(
      `efcsStatus3.setBit(${W3.leftAileronElac2Available}, bitFromValueOr(busInputs.elac2.discrete_status_word_1, 15, false))`,
    );
    expect(fcdcCpp).toContain(
      `efcsStatus3.setBit(${W3.rightAileronElac1Available}, bitFromValueOr(busInputs.elac1.discrete_status_word_1, 16, false))`,
    );
    expect(fcdcCpp).toContain(
      `efcsStatus3.setBit(${W3.rightElevator2Available}, bitFromValueOr(busInputs.elac2.discrete_status_word_1, 18, false)`,
    );
    // word 5: spoiler faults
    expect(fcdcCpp).toContain('efcsStatus5.setBit(23, spoiler3Fault)');
    expect(fcdcCpp).toContain(
      'efcsStatus5.setBit(25, bitFromValueOr(busInputs.sec2.discrete_status_word_1, 11, false))',
    );
  });

  it('the servo fault inputs exist in the C++ (no flyPad failure sets them yet)', () => {
    expect(flyByWireInterface).toContain('"A32NX_LEFT_AIL_SERVO_" + idString + "_FAILED"');
    expect(flyByWireInterface).toContain('"A32NX_LEFT_ELEV_SERVO_" + idString + "_FAILED"');
    expect(flyByWireInterface).toContain('"A32NX_LEFT_SPLR_" + idString + "_SERVO_FAILED"');
  });

  it('the autopilot L:vars of the ALTN LAW STATUS are written by the C++', () => {
    expect(pseudoFwc).toContain("'L:A32NX_FMGC_1_AP_ENGAGED'");
    expect(flyByWireInterface).toMatch(/"A32NX_FMGC_" \+ idString \+ "_AP_ENGAGED"|A32NX_FMGC_1_AP_ENGAGED/);
  });
});
