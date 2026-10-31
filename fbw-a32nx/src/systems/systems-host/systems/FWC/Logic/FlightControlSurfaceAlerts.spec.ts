// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { FwcRig, probedFailure, shownLineText, startCruiseFwc, triggeredAmong } from '../FwcControlsAlertProbe';
import { isAlertTriggered } from '../FwcAlertProbe';
import { altnLawStatus } from './FlightControlStatus';
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

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

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

describe('F/CTL surface cautions', () => {
  it('no caution with all servojacks available', () => {
    expect(state({})).toEqual(NO_SURFACE_FAULT);
  });

  it('no caution when both FCDCs send nothing (FCDC 1+2 FAULT)', () => {
    expect(state({ ssm: Arinc429SignStatusMatrix.FailureWarning, lost: ALL_SERVOJACKS_AVAILABLE })).toEqual(
      NO_SURFACE_FAULT,
    );
  });

  describe('ailerons', () => {
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

  describe('elevators', () => {
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

  describe('ELAC 1(2) PITCH FAULT', () => {
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

  describe('SPLR FAULT', () => {
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

describe('ELAC 1+2 FAULT', () => {
  it('replaces ELAC 1 FAULT and ELAC 2 FAULT when both are active', () => {
    expect(elacFaultAlerts(true, true)).toEqual({ elac1Fault: false, elac2Fault: false, elac12Fault: true });
    expect(elacFaultAlerts(true, false)).toEqual({ elac1Fault: true, elac2Fault: false, elac12Fault: false });
    expect(elacFaultAlerts(false, true)).toEqual({ elac1Fault: false, elac2Fault: true, elac12Fault: false });
    expect(elacFaultAlerts(false, false)).toEqual({ elac1Fault: false, elac2Fault: false, elac12Fault: false });
  });

  it('shows the procedure for both computers', () => {
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

  it('titles and lines as on the aircraft', () => {
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

/* The whole PseudoFWC, driven by the words of both FCDCs: a wrong variable or a forgotten alert would show nothing. */
describe('PseudoFWC with the FCDC words', () => {
  const ELAC_1_FAULT = '2700110';
  const ELAC_2_FAULT = '2700120';
  const ELAC_12_FAULT = '2701010';
  const ALTN_LAW_2 = '2700375';
  const ALTN_LAW_1 = '2700390';
  const L_ELEV_FAULT = '2701050';
  const SPOILER_FAULT = '2701100';
  const SPEED_BRAKE_DO_NOT_USE_BIT = 27;

  /** Sets the words of both FCDCs (or only of the given ones) and lets the hydraulic recovery time pass */
  function setFcdcWords(rig: FwcRig, setup: FcdcSetup, fcdcs: (1 | 2)[] = [1, 2]): void {
    const words = fcdc(setup);
    for (const fcdcNumber of fcdcs) {
      rig.simvars.set(`L:A32NX_FCDC_${fcdcNumber}_DISCRETE_WORD_1`, (words.word1 as Arinc429Word).rawWord);
      rig.simvars.set(`L:A32NX_FCDC_${fcdcNumber}_DISCRETE_WORD_3`, (words.word3 as Arinc429Word).rawWord);
      rig.simvars.set(`L:A32NX_FCDC_${fcdcNumber}_DISCRETE_WORD_5`, (words.word5 as Arinc429Word).rawWord);
    }
    rig.run(HYDRAULIC_RECOVERY_CONFIRM_SECONDS + 3);
  }

  const elacAlertsTriggered = (rig: FwcRig) => triggeredAmong(rig.fwc, [ELAC_1_FAULT, ELAC_2_FAULT, ELAC_12_FAULT]);

  it('ALTN LAW keys SPD BRK DO NOT USE on the elevator loss, not on the FCDC SPD BRK 3+4 bit', () => {
    const rig = startCruiseFwc();
    const shownSpeedBrakeLine = (key: string) =>
      shownLineText(probedFailure(rig.fwc, key)).some((line) => line.includes('SPD BRK'));

    setFcdcWords(rig, { word5: [SPEED_BRAKE_DO_NOT_USE_BIT] });
    expect(shownSpeedBrakeLine(ALTN_LAW_1)).toBe(false);
    expect(shownSpeedBrakeLine(ALTN_LAW_2)).toBe(false);

    setFcdcWords(rig, { lost: [W3.leftElevator1Available, W3.leftElevator2Available] });
    expect(shownSpeedBrakeLine(ALTN_LAW_1)).toBe(true);
    expect(shownSpeedBrakeLine(ALTN_LAW_2)).toBe(true);
  });

  it('ELAC 1 FAULT and ELAC 2 FAULT give way to ELAC 1+2 FAULT', () => {
    const rig = startCruiseFwc();
    setFcdcWords(rig, {});
    expect(elacAlertsTriggered(rig)).toEqual([]);

    setFcdcWords(rig, { word1: [W1.elac1Invalid] });
    expect(elacAlertsTriggered(rig)).toEqual([ELAC_1_FAULT]);
    setFcdcWords(rig, { word1: [W1.elac2Invalid] });
    expect(elacAlertsTriggered(rig)).toEqual([ELAC_2_FAULT]);
    setFcdcWords(rig, { word1: [W1.elac1Invalid, W1.elac2Invalid] });
    expect(elacAlertsTriggered(rig)).toEqual([ELAC_12_FAULT]);
  });

  it('the new alerts use the aircraft phase inhibitions and levels', () => {
    const { fwc } = startCruiseFwc();
    const expected: [string, number[], number][] = [
      ['2701010', FlightControlSurfacePhaseInhibition.elacFault, 2],
      ['2701020', FlightControlSurfacePhaseInhibition.elacPitchFault, 1],
      ['2701030', FlightControlSurfacePhaseInhibition.elacPitchFault, 1],
      ['2701040', FlightControlSurfacePhaseInhibition.elevServoFault, 1],
      ['2701050', FlightControlSurfacePhaseInhibition.elevatorFault, 2],
      ['2701060', FlightControlSurfacePhaseInhibition.elevatorFault, 2],
      ['2701070', FlightControlSurfacePhaseInhibition.ailServoFault, 1],
      ['2701080', FlightControlSurfacePhaseInhibition.aileronFault, 2],
      ['2701090', FlightControlSurfacePhaseInhibition.aileronFault, 2],
      ['2701100', FlightControlSurfacePhaseInhibition.spoilerFault, 2],
      ['2700360', FlightControlSurfacePhaseInhibition.fcdc12Fault, 2],
    ];
    for (const [key, phases, level] of expected) {
      const alert = probedFailure(fwc, key);
      expect(alert.flightPhaseInhib).toEqual(phases);
      expect(alert.failure).toBe(level);
    }
    expect(FlightControlSurfacePhaseInhibition.fcdc12Fault).toEqual([4, 5, 7]);
  });

  it('reads the words of FCDC 1 and of FCDC 2', () => {
    for (const fcdcNumber of [1, 2] as const) {
      const elacRig = startCruiseFwc();
      setFcdcWords(elacRig, { word1: [W1.elac1Invalid] }, [fcdcNumber]);
      expect(elacAlertsTriggered(elacRig)).toEqual([ELAC_1_FAULT]);

      const elevatorRig = startCruiseFwc();
      setFcdcWords(elevatorRig, {});
      expect(isAlertTriggered(elevatorRig.fwc, L_ELEV_FAULT)).toBe(false);
      setFcdcWords(elevatorRig, { lost: [W3.leftElevator1Available, W3.leftElevator2Available] }, [fcdcNumber]);
      expect(isAlertTriggered(elevatorRig.fwc, L_ELEV_FAULT)).toBe(true);

      const spoilerRig = startCruiseFwc();
      setFcdcWords(spoilerRig, { word5: [FcdcBits.word5.spoilerFault[4]] }, [fcdcNumber]);
      expect(isAlertTriggered(spoilerRig.fwc, SPOILER_FAULT)).toBe(true);
    }
  });

  it('the ALTN LAW STATUS follows the autopilot engagement of either FMGC', () => {
    const apOff = altnLawStatus(false, false, false);
    const apOn = altnLawStatus(false, false, true);
    expect(apOn.left).not.toEqual(apOff.left);
    for (const fmgc of [1, 2]) {
      const rig = startCruiseFwc();
      const alert = probedFailure(rig.fwc, ALTN_LAW_1);
      expect(alert.statusInfo?.()).toEqual(apOff.left);
      rig.simvars.set(`L:A32NX_FMGC_${fmgc}_AP_ENGAGED`, 1);
      rig.run(1);
      expect(alert.statusInfo?.()).toEqual(apOn.left);
    }
  });
});

/* The FCDC words and the servo failures come from the C++ flight controls, which vitest cannot run: their source is read. */
describe('the C++ flight controls', () => {
  const repoRoot = resolve(__dirname, '../../../../../../..');
  const flyByWireInterface = readFileSync(
    resolve(repoRoot, 'fbw-a32nx/src/wasm/fbw_a320/src/FlyByWireInterface.cpp'),
    'utf8',
  );
  const fcdcCpp = readFileSync(resolve(repoRoot, 'fbw-a32nx/src/wasm/fbw_a320/src/fcdc/Fcdc.cpp'), 'utf8');

  it('write the FCDC words the FWC reads', () => {
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
    expect(flyByWireInterface).toMatch(/"A32NX_FMGC_" \+ idString \+ "_AP_ENGAGED"|A32NX_FMGC_1_AP_ENGAGED/);
  });
});
