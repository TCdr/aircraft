// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';
const WARNING = 'a red warning with master warning and continuous chime';

/** Engines 1 and 2 are on the left wing, 3 and 4 on the right wing */
const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

const position = (engine: number): string => ENGINE_POSITIONS[engine - 1];

const ENG_EGT_OVER_LIMIT_FIRST = 701800009;
const ENG_N1_N2_OVER_LIMIT_FIRST = 701800073;
const ENG_FAIL_FIRST = 701800029;
const ENG_SHUT_DOWN_FIRST = 701800109;
const ENG_STALL_FIRST = 701800113;
const ENG_START_FAULT_FIRST = 701800117;
const ENG_LP_SHAFT_PROT_LOST_FIRST = 701800174;
const AIR_ABNORM_BLEED_CONFIG = '211800056';

const alertId = (first: number, engine: number): string => (first + engine - 1).toString();

/** ENG n SHUT DOWN: inhibited in flight phases 5 and 6, and not raised in phases 1, 2, 11 and 12 */
const SHUT_DOWN_TIMING =
  'it appears for an engine switched off in flight, on the take-off roll before V1 or on the landing roll above 80 ' +
  'kt, but not while taxiing or stopped on the ground, and a new one is not shown from V1 to 400 ft';

/** ENG n EGT OVER LIMIT: inhibited in flight phases 4, 5 and 6 */
const NOT_SHOWN_FROM_80_KT_TO_400_FT = 'a new alert is not shown from 80 kt on the take-off roll until 400 ft';

/** ENG n N1/N2 OVER LIMIT: inhibited in flight phases 5 and 6 */
const NOT_SHOWN_FROM_V1_TO_400_FT = 'a new alert is not shown from V1 on the take-off roll until 400 ft';

/** ENG n START FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** ENG n LP SHAFT PROT LOST: inhibited in flight phases 2 to 10 */
const NOT_SHOWN_PHASES_2_TO_10 =
  'a new alert shows only with the engines off on electrical power, after landing once below 80 kt, and after engine ' +
  'shutdown; a failure that appears earlier waits and shows then';

/** The STATUS lines of an engine that is out (ENG FAIL or ENG SHUT DOWN): the engine, its generator and its pumps */
const engineOutStatus = (engine: number): string =>
  `GEN ${engine}, ENG ${engine} BLEED and ${engine <= 2 ? 'G' : 'Y'} ENG ${engine} PMP A+B are listed as inoperative in ` +
  'all phases (the GEN and PMP lines not on the ground before take-off power, after landing below 80 kt or after ' +
  `engine shutdown; the PMP line is replaced by ${engine <= 2 ? 'G' : 'Y'} HYD SYS when both engines of its side are ` +
  'out)' +
  (engine === 2 || engine === 3
    ? `, and for approach and landing ENG ${engine} REVERSER is listed as inoperative.`
    : '.') +
  ' Once ENG SHUT DOWN is shown' +
  (engine === 2 || engine === 3 ? ', BTV is also inoperative for approach and landing (BTV cannot be armed) and' : '') +
  ', with the APU off CAT 3 DUAL is inoperative for approach and landing and CAT 3 SINGLE ONLY is information.';

/** The ENG n SHUT DOWN procedure lines (engines 2 and 3 add the landing distance line) */
const shutDownLines = (engine: number): string =>
  `Its lines are TCAS MODE TA ONLY (unless TCAS is inoperative), L/G LEVER UP between 400 ft and 1,500 ft, IF NO FUEL LEAK: CROSSFEED ${engine} ON ` +
  '(fuel on board 55 to 95 t), ABNORM BLEED CONFIG PROC APPLY while that alert is shown, then IF MAX THR RQRD: AIR ' +
  'FLOW LO and FWD CARGO TEMP REGUL OFF' +
  (engine === 2 || engine === 3 ? '; for this engine also LDG DIST IMPACT ON WET/CONTAM RWY ONLY.' : '.');

/** AIR ABNORM BLEED CONFIG comes with every ENG SHUT DOWN (the lost bleed); same phase hold-back as ENG SHUT DOWN */
const abnormBleedConfigText = (engine: number): string =>
  `With ENG ${engine} SHUT DOWN, AIR ABNORM BLEED CONFIG also appears, an amber caution with master caution and no ` +
  'chime of its own; a new alert is not shown from V1 to 400 ft. Its lines are XBLEED OPEN while the crossbleed has ' +
  'not opened by itself and, with the crossbleed open and only this bleed lost, IF MAX THR RQRD: AIR FLOW LO and FWD ' +
  'CARGO TEMP REGUL OFF' +
  (engine === 1 || engine === 4
    ? '; with the crossbleed still closed also WING A-ICE OFF, ENGs A-ICE AS RQRD and AVOID ICING CONDs. The ' +
      'limitation AVOID ICING CONDs, also on the PFD, shows while the WING A-ICE is off.'
    : '.') +
  ' With a second bleed lost PACK 1 OFF or PACK 2 OFF is asked instead.';

const BLEED_PAGE_TEXT = 'The page comes up with AIR ABNORM BLEED CONFIG when no other page is selected.';

const ENGINE_DESCRIPTION =
  'Each of the four engines is a three-spool turbofan: the fan (N1), the intermediate pressure spool (N2) and the ' +
  'high pressure core (N3) turn on separate shafts. N1 is shown on the E/WD, N2 and N3 on the SD ENG page, and the ' +
  'FADEC of the engine controls the fuel to the combustion chamber.';

const RELIGHT_ENVELOPE =
  'A relight needs the ENG START selector at IGN START and the aircraft inside the relight envelope: a windmilling ' +
  'start at 260 to 340 kt up to 30,000 ft (250 kt and 28,000 ft with two or more engines not running), or a starter ' +
  'assisted start with starter air at 150 to 260 kt up to 20,000 ft (185 to 260 kt up to 25,000 ft). The engine ' +
  'must light up within 30 s of the ENG MASTER ON; if not, ENG START FAULT with NO LIGHT UP appears and the crew ' +
  'sets ENG MASTER OFF and tries again. ENG ' +
  'MASTER OFF for less than 30 s then ON, with N3 above 45 %, is a quick relight at 220 to 260 kt up to ' +
  '20,000 ft or 260 to 340 kt up to 30,000 ft, at any selector position.';

/** The ENG n FAIL bullet of an engine whose fuel is cut by the failure (no FADEC reason line, no auto relight) */
const engineFailText = (engine: number): string =>
  `ENG ${engine} FAIL appears, ${CAUTION}, once the engine runs down below 50 % N3 with its ENG MASTER still ON; ` +
  'it is never held back by the flight phase. L/G UP comes first when the gear lever is down between lift-off and ' +
  `1,500 ft. In flight its lines are THR LEVER ${engine} IDLE, NO ENG RELIGHT AFTER 30S, ENG ${engine} MASTER OFF, ` +
  `then either the damaged branch (ENG ${engine} FIRE P/B PUSH, ` +
  (engine === 1 ? 'APU BLEED OFF, APU BLEED : DO NOT USE, ' : '') +
  'AGENT 1 DISCH after 10 s, EMER OUTR TK XFR ON) or the not damaged branch (ENG ' +
  `${engine} RELIGHT PROC CONSIDER, APPLY when more than two engines are out). On the ground the lines are the same ` +
  'without NO ENG RELIGHT AFTER 30S, with AGENT 1 DISCH at once and only RELIGHT PROC CONSIDER. The AUTO RELIGHT IN ' +
  'PROGRESS line never shows: the FADEC makes no automatic relight on an engine whose fuel the failure cuts. If all ' +
  'four engines are out in flight, ALL ENG FLAME OUT replaces ENG FAIL and ENG SHUT DOWN.';

const shutDownText = (engine: number): string =>
  `Once ENG MASTER ${engine} is set OFF, ENG ${engine} SHUT DOWN also appears, ${CAUTION}; ${SHUT_DOWN_TIMING}. ` +
  `${shutDownLines(engine)} ENG ${engine} FAIL, if shown, stays with its lines done until the engine runs again.`;

const ENGINE_OUT_SUPPLY_LOSS =
  'Everything the engine supplied (its generator, bleed air and hydraulic pumps) stops, as with any engine shutdown.';

// ---------------------------------------------------------------------------------------------------------------------
// Flameout
// ---------------------------------------------------------------------------------------------------------------------

const flameoutDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. The flame in the combustion chamber ` +
    'can go out in flight, for example in heavy rain, ice or after a surge; the crew then relights the engine ' +
    'with the FADEC igniters and the airflow or starter air.',
  impact: [
    `The flame of engine ${engine} goes out and its fuel is cut: the engine runs down and gives no thrust. In flight ` +
      'the rotors keep windmilling at a speed that grows with the airspeed.',
    `The flameout is latched. The crew relights the engine with ENG MASTER ${engine} OFF then ON inside the relight ` +
      'envelope; the engine then runs normally while the failure stays listed. On the ground the engine is started ' +
      'again with a normal start.',
    ENGINE_OUT_SUPPLY_LOSS,
    'An engine that is not running shows nothing until it is started; a start on the ground then runs normally.',
  ],
  alertIds: [
    alertId(ENG_FAIL_FIRST, engine),
    alertId(ENG_SHUT_DOWN_FIRST, engine),
    AIR_ABNORM_BLEED_CONFIG,
    alertId(ENG_START_FAULT_FIRST, engine),
  ],
  effects: [
    { where: 'E/WD', text: engineFailText(engine) },
    {
      where: 'SD ENG',
      text:
        'The page comes up with ENG FAIL when no other page is selected. N3 runs down to the windmilling speed in ' +
        'flight and the fuel flow reads zero.',
    },
    { where: 'E/WD', text: shutDownText(engine) },
    { where: 'E/WD', text: abnormBleedConfigText(engine) },
    { where: 'SD BLEED', text: BLEED_PAGE_TEXT },
    { where: 'SD STATUS', text: `Once the engine is out: ${engineOutStatus(engine)}` },
    {
      where: 'E/WD',
      text:
        `If a crew relight (ENG MASTER ${engine} OFF then ON) has not lit the engine 30 s after the ENG MASTER ON, ` +
        `ENG ${engine} START FAULT with NO LIGHT UP appears, ${ADVISORY}, with the line ENG ${engine} MASTER OFF in ` +
        `flight; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
    },
    {
      where: 'E/WD',
      text: 'The N1 and the EGT run down; in flight the N1 settles at the windmilling value of the airspeed.',
    },
  ],
  notSimulated: [
    'On the real aircraft the FADEC makes an automatic relight attempt after a flameout; here the failure cuts the fuel and only the crew relight works.',
  ],
  logbook: { required: true, reason: `ENG ${engine} FAIL caution, engine out` },
  clearing:
    `${MAINTENANCE_ONLY} Restore alone does not relight the engine: in flight relight it with ENG MASTER ${engine} ` +
    `OFF then ON inside the envelope (${RELIGHT_ENVELOPE}); on the ground set ENG MASTER ${engine} OFF and start ` +
    'it normally.',
});

const FlameoutFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Flameout, A380Failure.Eng2Flameout, A380Failure.Eng3Flameout, A380Failure.Eng4Flameout],
  detail: flameoutDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Seizure
// ---------------------------------------------------------------------------------------------------------------------

const seizureDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. A seizure is a mechanical lock of the ` +
    'high pressure core, usually after internal damage or loss of oil: the core stops turning and the engine cannot ' +
    'be restarted.',
  impact: [
    `The core of engine ${engine} stops within a few seconds and its fuel is cut: the engine gives no thrust. In ` +
      'flight the fan still windmills with the airspeed, the core does not.',
    `No relight lights up while the failure is active, and a relight attempt (ENG MASTER ${engine} OFF then ON) does not light the engine. Once ` +
      'the failure is restored the engine can be relit, in flight inside the relight envelope or with a normal start ' +
      'on the ground.',
    ENGINE_OUT_SUPPLY_LOSS,
  ],
  alertIds: [alertId(ENG_FAIL_FIRST, engine), alertId(ENG_SHUT_DOWN_FIRST, engine), AIR_ABNORM_BLEED_CONFIG],
  effects: [
    { where: 'E/WD', text: engineFailText(engine) },
    {
      where: 'SD ENG',
      text: 'The page comes up with ENG FAIL when no other page is selected. N3 falls to zero and the fuel flow reads zero.',
    },
    { where: 'E/WD', text: shutDownText(engine) },
    { where: 'E/WD', text: abnormBleedConfigText(engine) },
    { where: 'SD BLEED', text: BLEED_PAGE_TEXT },
    { where: 'SD STATUS', text: `Once the engine is out: ${engineOutStatus(engine)}` },
    {
      where: 'E/WD',
      text: 'The EGT runs down and the N1 falls to the windmilling value of the airspeed in flight.',
    },
  ],
  notSimulated: [
    'The damage that goes with a real seizure (vibration, oil loss, debris, fire) is not simulated; only the stopped core is.',
  ],
  logbook: { required: true, reason: `ENG ${engine} FAIL caution, engine out` },
  clearing:
    `${MAINTENANCE_ONLY} Restore frees the core but does not relight it: relight in flight with ENG MASTER ${engine} ` +
    `OFF then ON inside the envelope (${RELIGHT_ENVELOPE}); on the ground set ENG MASTER ${engine} OFF and start ` +
    'it normally.',
});

const SeizureFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Seizure, A380Failure.Eng2Seizure, A380Failure.Eng3Seizure, A380Failure.Eng4Seizure],
  detail: seizureDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// N1 rotor jammed
// ---------------------------------------------------------------------------------------------------------------------

const n1RotorJammedDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. During a start the FADEC checks that ` +
    'the fan (the N1 rotor) turns as the core accelerates; a fan that does not turn means a jammed N1 rotor.',
  impact: [
    `The fan of engine ${engine} stays at 0 % N1 during a start on the ground while the starter turns the core. The FADEC finds the missing N1 about 3 s after the core passes 30 % N3 with the start valve open.`,
    'An automatic start is aborted at once, without a further attempt: fuel metering valve and start valve closed, igniters off. A manual start is not aborted by the code, but gives the same alert.',
    'A running engine is not affected, and in flight the fan windmills: the failure acts at the next start on the ground (and the N1 reads 0 at once at a shutdown on the ground).',
  ],
  alertIds: [alertId(ENG_START_FAULT_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} START FAULT with LOW N1 appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are ` +
        `THR LEVER ${engine} IDLE, CRANK IN PROGRESS and ENG ${engine} MASTER OFF; during a manual start also ENG ` +
        `START SEL CRANK, then after 30 s ENG START SEL NORM and ENG ${engine} MAN START OFF. It stays until ENG ` +
        `MASTER ${engine} is set OFF.`,
    },
    {
      where: 'E/WD',
      text: 'The N1 stays at 0 while the core accelerates in the start.',
    },
    {
      where: 'Pedestal ENG MASTER panel',
      text: `After an automatic start is aborted, the FAULT light of ENG MASTER ${engine} comes on and stays on until the lever is set OFF.`,
    },
  ],
  notSimulated: [
    'The real N1 rotor jam is a mechanical jam of the fan shaft; here only the missing N1 during a ground start is modelled, and the fan turns again when the engine runs or windmills.',
  ],
  logbook: { required: true, reason: `ENG ${engine} START FAULT LOW N1 and ENG MASTER FAULT light` },
  clearing: `${MAINTENANCE_ONLY} The alert goes out when ENG MASTER ${engine} is set OFF; the engine can then be started normally.`,
});

const N1RotorJammedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1N1RotorJammed,
    A380Failure.Eng2N1RotorJammed,
    A380Failure.Eng3N1RotorJammed,
    A380Failure.Eng4N1RotorJammed,
  ],
  detail: n1RotorJammedDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Compressor stall
// ---------------------------------------------------------------------------------------------------------------------

const compressorStallDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. A compressor stall is a disturbance of ` +
    'the airflow through the compressor: the crew sees fluctuating engine parameters, a high EGT and a sluggish ' +
    'thrust lever response, and may hear noise or see flame at the exhaust. The FADEC detects it.',
  impact: [
    `Engine ${engine} stalls only while it runs with a commanded N1 of 60 % or more (take-off, climb or cruise thrust, not idle or a low descent thrust). The stall builds up in about 1 s.`,
    'The stalled engine loses up to 15 % N1 of thrust (the thrust control aims lower), the EGT rises by up to 150 °C, the N1 swings by up to 3 % and the N3 by up to 1.5 %, and the N1 vibration rises by up to 2 units.',
    'The stall ends in about 3 s once the commanded N1 is below 57 % (thrust lever at idle or a low setting) and returns when the thrust is advanced to 60 % again. The engine keeps running.',
  ],
  alertIds: [alertId(ENG_STALL_FIRST, engine), alertId(ENG_SHUT_DOWN_FIRST, engine), AIR_ABNORM_BLEED_CONFIG],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} STALL appears, ${CAUTION}, as soon as the stall starts and goes out as soon as the commanded N1 drops below 57 % (the ` +
        'parameters settle over about 3 s). From V1 to 400 ft it is not shown, and one already shown goes out, unless ' +
        'two or more engines stall. Its lines are THR LEVER ' +
        `${engine} IDLE, ENG ${engine} PARAMETERS CHECK, then IF ABNORMAL: ENG ${engine} MASTER OFF and ENG ${engine} ` +
        'RELIGHT PROC CONSIDER.',
    },
    {
      where: 'SD ENG',
      text: 'The page comes up with ENG STALL when no other page is selected. The N3 swings and the N1 vibration rises.',
    },
    {
      where: 'E/WD',
      text: 'The N1 swings and runs below the commanded value, and the EGT is higher, while the stall lasts.',
    },
    {
      where: 'E/WD',
      text: `Flying the procedure (ENG MASTER ${engine} OFF) also gives ENG ${engine} SHUT DOWN, ${CAUTION}; ${SHUT_DOWN_TIMING}. ${shutDownLines(engine)}`,
    },
    { where: 'E/WD', text: abnormBleedConfigText(engine) },
    { where: 'SD BLEED', text: BLEED_PAGE_TEXT },
    { where: 'SD STATUS', text: `Once ENG MASTER is set OFF: ${engineOutStatus(engine)}` },
  ],
  notSimulated: [
    'Engine noise, flame at the exhaust or inlet and the sluggish thrust lever response of a real stall are not simulated.',
    'The variable stator vanes and inlet guide vanes that recover a real stall are not modelled; the stall ends by itself when the thrust is reduced.',
  ],
  logbook: { required: true, reason: `ENG ${engine} STALL caution, engine stalls must be reported` },
  clearing: `${MAINTENANCE_ONLY} The crew action is to reduce the thrust lever to idle: the stall ends below 57 % commanded N1.`,
});

const CompressorStallFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1CompressorStall,
    A380Failure.Eng2CompressorStall,
    A380Failure.Eng3CompressorStall,
    A380Failure.Eng4CompressorStall,
  ],
  detail: compressorStallDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// EGT overtemperature
// ---------------------------------------------------------------------------------------------------------------------

const egtOvertemperatureDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. The exhaust gas temperature (EGT) is ` +
    'measured behind the turbines and shown on the E/WD. It has an amber limit (970 °C) and a red line (1,002 °C); ' +
    'at take-off the red indication needs 1,022 °C, or 1,002 °C for more than 20 s.',
  impact: [
    `The EGT of engine ${engine} reads higher than it should, by about 3.5 °C for each percent of N1 (about 270 °C in climb, about 300 °C at take-off thrust), building up and going away in about 5 s.`,
    'Reducing the thrust lowers the EGT again. The thrust and the other parameters do not change, and the engine keeps running.',
    'The offset applies only while the engine runs.',
  ],
  alertIds: [alertId(ENG_EGT_OVER_LIMIT_FIRST, engine), alertId(ENG_SHUT_DOWN_FIRST, engine), AIR_ABNORM_BLEED_CONFIG],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} EGT OVER LIMIT appears, ${CAUTION}, when the EGT is above 970 °C at or below MCT thrust. At ` +
        'take-off thrust (FLEX or TOGA) it needs the red EGT of 1,022 °C, or 1,002 °C for more than 20 s, and with the ' +
        `reversers selected or in alpha floor the 1,002 °C red line. ${NOT_SHOWN_FROM_80_KT_TO_400_FT}. It is not ` +
        `raised while ENG ${engine} FADEC FAULT is active. Its lines are THR LEVER ${engine} REDUCE BELOW EGT LIMIT and, ` +
        `IF OVER LIMIT PERSISTS, ENG ${engine} MASTER OFF. It calls up no SD page.`,
    },
    {
      where: 'E/WD',
      text: 'The EGT reading turns amber above the limit and red above the red line, and the amber attention box comes up with it, also while the alert is held back.',
    },
    {
      where: 'E/WD',
      text: `Flying the procedure (ENG MASTER ${engine} OFF) also gives ENG ${engine} SHUT DOWN, ${CAUTION}; ${SHUT_DOWN_TIMING}. ${shutDownLines(engine)}`,
    },
    { where: 'E/WD', text: abnormBleedConfigText(engine) },
    { where: 'SD BLEED', text: BLEED_PAGE_TEXT },
    { where: 'SD STATUS', text: `Once ENG MASTER is set OFF: ${engineOutStatus(engine)}` },
  ],
  notSimulated: ['The hot parts of the engine are not damaged by the high EGT, and the engine does not lose any life.'],
  logbook: { required: true, reason: `ENG ${engine} EGT OVER LIMIT caution` },
  clearing: `${MAINTENANCE_ONLY} The crew action is to reduce the thrust below the EGT limit.`,
});

const EgtOvertemperatureFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1EgtOvertemperature,
    A380Failure.Eng2EgtOvertemperature,
    A380Failure.Eng3EgtOvertemperature,
    A380Failure.Eng4EgtOvertemperature,
  ],
  detail: egtOvertemperatureDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Overspeed (HMU shutdown)
// ---------------------------------------------------------------------------------------------------------------------

const overspeedDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. The hydromechanical metering unit (HMU) ` +
    'meters the fuel on the FADEC command. It also protects the engine against overspeed by closing the high ' +
    'pressure shutoff valve, independently of the FADEC control loops.',
  impact: [
    `The rotors of engine ${engine} run away: the N1 indication climbs towards 150 % of its value and the N3 indication towards 130 %, with a lag of about 5 s. The thrust itself does not change.`,
    'The HMU closes the shutoff valve 5 s after the engine has been running with the failure, on the ground at idle as in flight: the engine shuts down. An engine that is not running trips 5 s after it runs.',
    'The shutdown is latched: the fuel stays cut and the engine cannot be started again while the failure is active. After a Restore it stays down until the crew sets the ENG MASTER OFF.',
    ENGINE_OUT_SUPPLY_LOSS,
  ],
  alertIds: [
    alertId(ENG_N1_N2_OVER_LIMIT_FIRST, engine),
    alertId(ENG_FAIL_FIRST, engine),
    alertId(ENG_SHUT_DOWN_FIRST, engine),
    AIR_ABNORM_BLEED_CONFIG,
  ],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} N1/N2 OVER LIMIT appears, ${WARNING}, only if the N1 indication passes 111 % (or the N3 ` +
        `indication 118.7 %) before the trip, which happens at high thrust: from about 85 % N1, so at take-off thrust. ` +
        `${NOT_SHOWN_FROM_V1_TO_400_FT}. Its lines are THR LEVER ${engine} REDUCE BELOW N1 LIMIT and, IF OVER LIMIT ` +
        `PERSISTS, ENG ${engine} MASTER OFF. It calls up no SD page and goes out when the engine stops.`,
    },
    {
      where: 'E/WD',
      text:
        `After the trip ENG ${engine} FAIL appears, ${CAUTION}, once the engine runs down below 50 % N3 with its ENG ` +
        `MASTER still ON; it is never held back by the flight phase. Its lines are THR LEVER ${engine} IDLE and ENG ` +
        `${engine} MASTER OFF, with L/G UP first when the gear lever is down between lift-off and 1,500 ft. It shows ` +
        'no reason line and none of the relight, damage or fire lines. If all four engines are out in flight, ALL ENG ' +
        'FLAME OUT replaces ENG FAIL and ENG SHUT DOWN.',
    },
    {
      where: 'SD ENG',
      text: 'The page comes up with ENG FAIL when no other page is selected. The N3 runs down and the fuel flow reads zero.',
    },
    { where: 'E/WD', text: shutDownText(engine) },
    { where: 'E/WD', text: abnormBleedConfigText(engine) },
    { where: 'SD BLEED', text: BLEED_PAGE_TEXT },
    { where: 'SD STATUS', text: `Once the engine is out: ${engineOutStatus(engine)}` },
    {
      where: 'E/WD',
      text: 'The N1 indication turns red above 111 % and keeps its red exceedance mark; the amber attention box comes up with it.',
    },
  ],
  notSimulated: [
    'The real overspeed runs the rotors up; the sim engine cannot be pushed past its speed, so the runaway is shown on the N1 and N3 indications only.',
  ],
  logbook: { required: true, reason: `ENG ${engine} FAIL caution, engine shut down by the HMU` },
  clearing:
    `${MAINTENANCE_ONLY} The shutdown stays until the ENG MASTER is set OFF; the engine can then be started normally ` +
    'once the failure is restored.',
});

const OverspeedFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Overspeed, A380Failure.Eng2Overspeed, A380Failure.Eng3Overspeed, A380Failure.Eng4Overspeed],
  detail: overspeedDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// LP shaft protection
// ---------------------------------------------------------------------------------------------------------------------

const lpShaftProtectionDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Engine ${engine} is the ${position(engine)} engine. The LP shaft joins the fan to the ` +
    'low pressure turbine. The FADEC has a protection for this shaft and warns the crew ' +
    'when it is lost.',
  impact: [
    `The FADEC of engine ${engine} reports that its LP shaft protection is lost. This is crew awareness only.`,
    'The engine, its thrust and its parameters are not changed.',
  ],
  alertIds: [alertId(ENG_LP_SHAFT_PROT_LOST_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} LP SHAFT PROT LOST appears, ${ADVISORY}, as long as the failure is set. It has no lines and ` +
        `calls up no SD page; ${NOT_SHOWN_PHASES_2_TO_10}.`,
    },
  ],
  notSimulated: [
    'What the lost protection would allow on the real engine is not simulated: the engine behaves normally.',
  ],
  logbook: { required: true, reason: `ENG ${engine} LP SHAFT PROT LOST advisory` },
  clearing: MAINTENANCE_ONLY,
});

const LpShaftProtectionFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1LpShaftProtection,
    A380Failure.Eng2LpShaftProtection,
    A380Failure.Eng3LpShaftProtection,
    A380Failure.Eng4LpShaftProtection,
  ],
  detail: lpShaftProtectionDetail,
};

export const Ata72EngineFamilies: FailureDetailFamily[] = [
  FlameoutFamily,
  SeizureFamily,
  N1RotorJammedFamily,
  CompressorStallFamily,
  EgtOvertemperatureFamily,
  OverspeedFamily,
  LpShaftProtectionFamily,
];
