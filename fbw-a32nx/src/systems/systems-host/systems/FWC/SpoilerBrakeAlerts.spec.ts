// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { formatEwdMessages } from '../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../shared/src/StatusMessages';
import {
  FwcRig,
  discreteWordWithBits,
  probedFailure,
  shownLineCodes,
  startCruiseFwc,
  triggeredAmong,
} from './FwcControlsAlertProbe';
import { isAlertTriggered } from './FwcAlertProbe';
import { noComputedDataWord } from './PseudoFwcTestBed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const FCDC_1_WORD_5 = 'L:A32NX_FCDC_1_DISCRETE_WORD_5';

/** FCDC discrete word 5: the lost ground spoiler function of SEC 1, 2, 3 are bits 14, 15, 16 */
const GROUND_SPOILER_BITS = { sec1: 14, sec2: 15, sec3: 16 };
/** FCDC discrete word 5: the speed brake lever transducer faults of SEC 1, 2, 3 are bits 11, 12, 13 */
const SPEED_BRAKE_LEVER_BITS = { sec1: 11, sec2: 12, sec3: 13 };

const GND_SPLR_5 = '2701250';
const GND_SPLR_12 = '2701260';
const GND_SPLR_34 = '2701270';
const GND_SPLR_FAULT = '2701280';
const SPD_BRK_2 = '2701290';
const SPD_BRK_34 = '2701300';
const SPD_BRK_FAULT = '2701310';
const GROUND_SPOILER_ALERTS = [GND_SPLR_5, GND_SPLR_12, GND_SPLR_34, GND_SPLR_FAULT];
const SPEED_BRAKE_ALERTS = [SPD_BRK_2, SPD_BRK_34, SPD_BRK_FAULT];

/** Sets the SEC faults the FCDC reports and lets the FWC process them */
function setFcdcFaults(rig: FwcRig, ...bits: number[]): void {
  rig.simvars.set(FCDC_1_WORD_5, discreteWordWithBits(...bits));
  rig.run(1);
}

describe('GND SPLR FAULT alerts', () => {
  it('one lost SEC gives its own alert: SEC 2 GND SPLR 5, SEC 3 GND SPLR 1+2, SEC 1 GND SPLR 3+4', () => {
    const rig = startCruiseFwc();
    expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([]);

    setFcdcFaults(rig, GROUND_SPOILER_BITS.sec2);
    expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([GND_SPLR_5]);
    setFcdcFaults(rig, GROUND_SPOILER_BITS.sec3);
    expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([GND_SPLR_12]);
    setFcdcFaults(rig, GROUND_SPOILER_BITS.sec1);
    expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([GND_SPLR_34]);
  });

  it('two or three lost SECs give GND SPLR FAULT alone, no loss gives nothing', () => {
    const rig = startCruiseFwc();
    const { sec1, sec2, sec3 } = GROUND_SPOILER_BITS;
    for (const lost of [
      [sec1, sec2],
      [sec1, sec3],
      [sec2, sec3],
      [sec1, sec2, sec3],
    ]) {
      setFcdcFaults(rig, ...lost);
      expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([GND_SPLR_FAULT]);
    }
    setFcdcFaults(rig);
    expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([]);
  });

  it('either FCDC reports the lost SEC', () => {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_FCDC_2_DISCRETE_WORD_5', discreteWordWithBits(GROUND_SPOILER_BITS.sec2));
    rig.run(1);
    expect(triggeredAmong(rig.fwc, GROUND_SPOILER_ALERTS)).toEqual([GND_SPLR_5]);
  });

  it('are crew awareness alerts (level 1) with LDG DIST PROC APPLY and the lost spoilers as INOP SYS', () => {
    const rig = startCruiseFwc();
    for (const [key, codes, inopSys] of [
      [GND_SPLR_5, '270125001', '270300042'],
      [GND_SPLR_12, '270126001', '270300040'],
      [GND_SPLR_34, '270127001', '270300041'],
    ]) {
      const alert = probedFailure(rig.fwc, key);
      expect(alert.flightPhaseInhib).toEqual([3, 4, 5]);
      expect(alert.codesToReturn).toEqual([codes]);
      expect(alert.failure).toBe(1);
      expect(alert.inopSys?.()).toEqual([inopSys]);
      expect(alert.statusInfo?.()).toEqual(['270400011']);
    }
    expect(formatStatusPage(['270400011'], ['270300042']).left).toContain('LDG DIST PROC');
    expect(formatStatusPage([], ['270300042']).right).toContain('GND SPLR 5');
  });

  it('GND SPLR FAULT lists the INOP SYS of every lost SEC', () => {
    const rig = startCruiseFwc();
    const alert = probedFailure(rig.fwc, GND_SPLR_FAULT);
    const { sec1, sec2, sec3 } = GROUND_SPOILER_BITS;
    setFcdcFaults(rig, sec1, sec3);
    expect(alert.inopSys?.()).toEqual(['270300040', '270300041']);
    setFcdcFaults(rig, sec1, sec2, sec3);
    expect(alert.inopSys?.()).toEqual(['270300040', '270300041', '270300042']);
    expect(isAlertTriggered(rig.fwc, GND_SPLR_FAULT)).toBe(true);
  });
});

describe('SPD BRK FAULT alerts', () => {
  it('SEC 3 lever transducers failed gives SPD BRK 2, SEC 1 gives SPD BRK 3+4, both give SPD BRK FAULT', () => {
    const rig = startCruiseFwc();
    setFcdcFaults(rig, SPEED_BRAKE_LEVER_BITS.sec3);
    expect(triggeredAmong(rig.fwc, SPEED_BRAKE_ALERTS)).toEqual([SPD_BRK_2]);
    setFcdcFaults(rig, SPEED_BRAKE_LEVER_BITS.sec1);
    expect(triggeredAmong(rig.fwc, SPEED_BRAKE_ALERTS)).toEqual([SPD_BRK_34]);
    setFcdcFaults(rig, SPEED_BRAKE_LEVER_BITS.sec1, SPEED_BRAKE_LEVER_BITS.sec3);
    expect(triggeredAmong(rig.fwc, SPEED_BRAKE_ALERTS)).toEqual([SPD_BRK_FAULT]);
    setFcdcFaults(rig, SPEED_BRAKE_LEVER_BITS.sec2);
    expect(triggeredAmong(rig.fwc, SPEED_BRAKE_ALERTS)).toEqual([]);
  });

  it('the SPD BRK 3+4 and SPD BRK alerts say SPD BRK DO NOT USE, the SPD BRK 2 alert does not', () => {
    const rig = startCruiseFwc();
    expect(probedFailure(rig.fwc, SPD_BRK_2).codesToReturn).toEqual(['270129001']);
    expect(probedFailure(rig.fwc, SPD_BRK_2).statusInfo).toBeUndefined();
    expect(probedFailure(rig.fwc, SPD_BRK_34).codesToReturn).toEqual(['270130001', '270130002']);
    expect(probedFailure(rig.fwc, SPD_BRK_34).statusInfo?.()).toEqual(['270400004']);
    expect(probedFailure(rig.fwc, SPD_BRK_FAULT).statusInfo?.()).toEqual(['270400004']);
    expect(formatEwdMessages(['270130001', '270130002']).join(' | ')).toBe(
      '\x1b<4m\x1b4mF/CTL\x1bm SPD BRK 3+4 FAULT | \x1b<5m -SPD BRK.......DO NOT USE',
    );
    expect(formatStatusPage(['270400004'], []).left).toContain('DO NOT USE');
  });
});

describe('BRAKES RELEASED alerts', () => {
  const BRAKES_RELEASED = '3200540';
  const ALTN_L_RELEASED = '3200550';
  const ALTN_R_RELEASED = '3200560';
  const RELEASED_ALERTS = [BRAKES_RELEASED, ALTN_L_RELEASED, ALTN_R_RELEASED];
  /** LGCIU discrete word 1: bits 23, 24, 25 are the LH, RH and nose gear downlocked */
  const GEAR_DOWNLOCKED = discreteWordWithBits(23, 24, 25);

  /** The gear downlocked on both LGCIUs, an engine running */
  function startWithGearDown(): FwcRig {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_1', GEAR_DOWNLOCKED);
    rig.simvars.set('L:A32NX_LGCIU_2_DISCRETE_WORD_1', GEAR_DOWNLOCKED);
    return rig;
  }

  it('need the gear downlocked and an engine running', () => {
    const rig = startWithGearDown();
    rig.simvars.set('L:A32NX_BRAKES_WHEEL_RELEASED', 1);
    rig.run(1);
    expect(triggeredAmong(rig.fwc, RELEASED_ALERTS)).toEqual([BRAKES_RELEASED]);

    // gear not downlocked
    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_1', discreteWordWithBits());
    rig.simvars.set('L:A32NX_LGCIU_2_DISCRETE_WORD_1', discreteWordWithBits());
    rig.run(1);
    expect(triggeredAmong(rig.fwc, RELEASED_ALERTS)).toEqual([]);

    // no engine running
    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_1', GEAR_DOWNLOCKED);
    rig.simvars.set('L:A32NX_LGCIU_2_DISCRETE_WORD_1', GEAR_DOWNLOCKED);
    rig.simvars.set('L:A32NX_ENGINE_N2:1', 0);
    rig.simvars.set('L:A32NX_ENGINE_N2:2', 0);
    rig.run(1);
    expect(triggeredAmong(rig.fwc, RELEASED_ALERTS)).toEqual([]);
  });

  it('ALTN L and ALTN R are told apart', () => {
    const rig = startWithGearDown();
    rig.simvars.set('L:A32NX_BRAKES_ALTN_L_RELEASED', 1);
    rig.run(1);
    expect(triggeredAmong(rig.fwc, RELEASED_ALERTS)).toEqual([ALTN_L_RELEASED]);
    rig.simvars.set('L:A32NX_BRAKES_ALTN_L_RELEASED', 0);
    rig.simvars.set('L:A32NX_BRAKES_ALTN_R_RELEASED', 1);
    rig.run(1);
    expect(triggeredAmong(rig.fwc, RELEASED_ALERTS)).toEqual([ALTN_R_RELEASED]);
  });

  it('BRAKES RELEASED: level 1, LDG DIST PROC APPLY, CAT 2 ONLY, INOP SYS CAT 3 and AUTO BRK', () => {
    const alert = probedFailure(startCruiseFwc().fwc, BRAKES_RELEASED);
    expect(alert.codesToReturn).toEqual(['320054001']);
    expect(alert.failure).toBe(1);
    expect(alert.sysPage).toBe(EcamSysPage.NONE);
    expect(alert.inopSys?.()).toEqual(['240300128', '290300033']);
    expect(alert.statusInfo?.()).toEqual(['290400017', '240200102']);
    expect(formatStatusPage(['290400017', '240200102'], ['240300128', '290300033']).left).toContain('CAT 2 ONLY');
    expect(formatEwdMessages(['320054001']).join('')).toBe('\x1b<4m\x1b4mBRAKES\x1bm RELEASED');
  });

  it('ALTN L(R) RELEASED: level 2 on the WHEEL page, ASYM BRK PROC, LDG DIST PROC, INOP SYS ALTN L(R) BRK', () => {
    const { fwc } = startCruiseFwc();
    for (const [key, side, titleCode, inopSys] of [
      [ALTN_L_RELEASED, 'L', '320055001', '320300002'],
      [ALTN_R_RELEASED, 'R', '320056001', '320300003'],
    ]) {
      const alert = probedFailure(fwc, key);
      expect(alert.codesToReturn).toEqual([titleCode, `${titleCode.slice(0, -1)}2`]);
      expect(alert.failure).toBe(2);
      expect(alert.sysPage).toBe(EcamSysPage.WHEEL);
      expect(alert.inopSys?.()).toEqual([inopSys]);
      expect(formatEwdMessages([titleCode, `${titleCode.slice(0, -1)}2`]).join(' | ')).toBe(
        `\x1b<4m\x1b4mBRAKES\x1bm ALTN ${side} RELEASED | \x1b<5m -ASYM BRK PROC.....APPLY`,
      );
      expect(formatStatusPage([], [inopSys]).right).toContain(`ALTN ${side} BRK`);
    }
  });
});

describe('BRAKES-N/WS MINOR FAULT', () => {
  const NWS_MINOR_FAULT = '3200570';

  it('shows with the BSCU minor fault, not with the WHEEL N/W STRG FAULT that already tells the steering loss', () => {
    const rig = startCruiseFwc();
    rig.simvars.set('L:A32NX_BRAKES_NW_STRG_MINOR_FAULT', 1);
    rig.run(1);
    expect(isAlertTriggered(rig.fwc, NWS_MINOR_FAULT)).toBe(true);

    rig.simvars.set('L:A32NX_BRAKES_NW_STRG_FAULT', 1);
    rig.run(1);
    expect(isAlertTriggered(rig.fwc, '3200470')).toBe(true);
    expect(isAlertTriggered(rig.fwc, NWS_MINOR_FAULT)).toBe(false);

    rig.simvars.set('L:A32NX_BRAKES_NW_STRG_FAULT', 0);
    rig.simvars.set('L:A32NX_BRAKES_NW_STRG_MINOR_FAULT', 0);
    rig.run(1);
    expect(isAlertTriggered(rig.fwc, NWS_MINOR_FAULT)).toBe(false);
  });

  it('is a level 1 alert without STATUS', () => {
    const alert = probedFailure(startCruiseFwc().fwc, NWS_MINOR_FAULT);
    expect(alert.flightPhaseInhib).toEqual([3, 4, 5, 7, 8]);
    expect(alert.codesToReturn).toEqual(['320057001']);
    expect(alert.failure).toBe(1);
    expect(alert.statusInfo).toBeUndefined();
    expect(alert.inopSys).toBeUndefined();
    expect(formatEwdMessages(['320057001']).join('')).toBe('\x1b<4m\x1b4mBRAKES\x1bm N/WS MINOR FAULT');
  });
});

describe('L/G SHOCK ABSORBER FAULT', () => {
  const EXTENDED_ON_GROUND = '3200520';
  const COMPRESSED_IN_FLIGHT = '3200530';
  /** LGCIU discrete word 2: bits 12 nose, 13 left main, 14 right main shock absorber compressed */
  const ALL_COMPRESSED = [12, 13, 14];
  const FWC_FLIGHT_PHASE = 'L:A32NX_FWC_FLIGHT_PHASE';

  /**
   * The shock absorber alerts triggered after the confirmation time.
   * @param phase the FWC flight phase
   * @param words the compressed bits of each LGCIU, null for an LGCIU that sends no valid word
   */
  function shockAbsorberAlerts(phase: number, words: (number[] | null)[]): string[] {
    const rig = startCruiseFwc();
    rig.simvars.set(FWC_FLIGHT_PHASE, phase);
    words.forEach((compressed, index) =>
      rig.simvars.set(
        `L:A32NX_LGCIU_${index + 1}_DISCRETE_WORD_2`,
        compressed === null ? noComputedDataWord() : discreteWordWithBits(...compressed),
      ),
    );
    rig.run(5);
    return triggeredAmong(rig.fwc, [EXTENDED_ON_GROUND, COMPRESSED_IN_FLIGHT]);
  }

  it('after landing (phases 9 and 10) a shock absorber one valid LGCIU reads extended triggers the ground variant', () => {
    for (const phase of [9, 10]) {
      expect(shockAbsorberAlerts(phase, [ALL_COMPRESSED, ALL_COMPRESSED])).toEqual([]);
      expect(
        shockAbsorberAlerts(phase, [
          [12, 14],
          [12, 14],
        ]),
      ).toEqual([EXTENDED_ON_GROUND]);
      expect(
        shockAbsorberAlerts(phase, [
          [12, 13],
          [12, 13],
        ]),
      ).toEqual([EXTENDED_ON_GROUND]);
      expect(
        shockAbsorberAlerts(phase, [
          [13, 14],
          [13, 14],
        ]),
      ).toEqual([EXTENDED_ON_GROUND]);
    }
    expect(
      shockAbsorberAlerts(8, [
        [12, 14],
        [12, 14],
      ]),
    ).toEqual([]);
    expect(
      shockAbsorberAlerts(2, [
        [12, 14],
        [12, 14],
      ]),
    ).toEqual([]);
  });

  it('the second LGCIU alone is enough, an invalid LGCIU is ignored', () => {
    expect(shockAbsorberAlerts(9, [ALL_COMPRESSED, [12, 13]])).toEqual([EXTENDED_ON_GROUND]);
    expect(shockAbsorberAlerts(9, [null, [12, 13]])).toEqual([EXTENDED_ON_GROUND]);
    expect(shockAbsorberAlerts(9, [null, ALL_COMPRESSED])).toEqual([]);
  });

  it('after liftoff (phases 5 to 7) a compressed shock absorber triggers the airborne variant', () => {
    for (const phase of [5, 6, 7]) {
      expect(shockAbsorberAlerts(phase, [[], []])).toEqual([]);
      for (const compressedBit of ALL_COMPRESSED) {
        expect(shockAbsorberAlerts(phase, [[compressedBit], [compressedBit]])).toEqual([COMPRESSED_IN_FLIGHT]);
      }
    }
    for (const phase of [4, 8, 9]) {
      expect(shockAbsorberAlerts(phase, [ALL_COMPRESSED, ALL_COMPRESSED])).not.toContain(COMPRESSED_IN_FLIGHT);
    }
  });

  it('the ground variant is a level 1 alert, shown after landing only', () => {
    const alert = probedFailure(startCruiseFwc().fwc, EXTENDED_ON_GROUND);
    expect(alert.flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(alert.codesToReturn).toEqual(['320052001']);
    expect(alert.failure).toBe(1);
    expect(alert.statusInfo).toBeUndefined();
  });

  it('the airborne variant gives the gear procedure only with the gear not uplocked', () => {
    const rig = startCruiseFwc();
    const alert = probedFailure(rig.fwc, COMPRESSED_IN_FLIGHT);
    expect(alert.flightPhaseInhib).toEqual([1, 2, 3, 4, 8, 9, 10]);
    expect(alert.failure).toBe(2);
    expect(alert.sysPage).toBe(EcamSysPage.WHEEL);
    const lineNumbers = () => shownLineCodes(alert).map((code) => code.slice(-2));

    expect(lineNumbers()).toEqual(['01']);
    expect(alert.inopSys?.()).toEqual([]);
    expect(alert.statusInfo?.()).toEqual([]);

    // LGCIU discrete word 3: bit 11 LH gear not locked up, bit 14 lever up
    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', discreteWordWithBits(11));
    rig.run(1);
    expect(lineNumbers()).toEqual(['01', '02', '03', '05', '06']);
    expect(alert.inopSys?.()).toEqual(['290300036']);
    expect(alert.statusInfo?.()).toEqual(['320400001', '320400091', '290400018', '290400019']);

    rig.simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', discreteWordWithBits(11, 14));
    rig.run(1);
    expect(lineNumbers()).toEqual(['01', '02', '04', '05', '06']);

    expect(formatEwdMessages(['320053001', '320053002', '320053003', '320053004', '320053005', '320053006'])).toEqual([
      '\x1b<4m\x1b4mL/G\x1bm SHOCK ABSORBER FAULT',
      '\x1b<5m MAX SPEED.......280/.67',
      '\x1b<5m -L/G..........KEEP DOWN',
      '\x1b<5m -L/G..............DOWN',
      '\x1b<5m FUEL CONSUMPT INCRSD',
      '\x1b<5m FMS PRED UNRELIABLE',
    ]);
  });
});

/*
 * The FCDC and SEC outputs below are written by the C++ flight controls, which vitest cannot run: these two tests
 * read the C++ source files.
 */
describe('the SEC and FCDC outputs of the C++ flight controls', () => {
  const wasmSource = (relativePath: string) =>
    readFileSync(resolve(__dirname, '../../../../wasm/fbw_a320/src', relativePath), 'utf-8').replace(/\s+/g, '');
  const expectCpp = (source: string, snippet: string) => expect(source).toContain(snippet.replace(/\s+/g, ''));

  it('the FCDC writes the SEC 1 speed brake lever fault bit that the FWC reads', () => {
    expectCpp(
      wasmSource('fcdc/Fcdc.cpp'),
      'output.efcsStatus5.setBit(11, !isNo(busInputs.sec1.speed_brake_lever_command_deg) && discreteInputs.sec1Valid);',
    );
  });

  it('the C++ flight controls pass the failures to the SECs', () => {
    const interfaceSource = wasmSource('FlyByWireInterface.cpp');
    expectCpp(
      interfaceSource,
      `secs[secIndex].speedBrakeLeverTransducersFailed =
        (secIndex == 0 && failuresConsumer.isActive(Failures::SpeedBrakeLeverSec1)) ||
        (secIndex == 2 && failuresConsumer.isActive(Failures::SpeedBrakeLeverSec3));`,
    );
    expectCpp(interfaceSource, 'secs[secIndex].groundSpoilerFunctionFailed = failuresConsumer.isActive(');
    const sec = wasmSource('sec/Sec.cpp');
    expectCpp(sec, 'Arinc429Utils::setBit(output.discrete_status_word_1, 24, true);');
    expectCpp(sec, 'output.speed_brake_lever_command_deg.SSM = Arinc429SignStatus::FailureWarning;');
  });
});
