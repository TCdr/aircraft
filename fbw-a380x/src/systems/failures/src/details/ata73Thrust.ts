// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

type SeenEffect = FailureDetail['effects'][number];

/** ENG n CTL SYS FAULT and ENG n THR LEVER FAULT: inhibited in flight phases 5 and 6 */
const NOT_SHOWN_PHASES_5_AND_6 = 'a new alert is not shown from V1 to 400 ft';

/** ENG n THRUST LOSS: inhibited in every flight phase except 3 */
const NOT_SHOWN_OUTSIDE_PHASE_3 =
  'it is shown only during the take-off roll below 80 kt, once the second engine is at take-off power';

/** The crew awareness alerts of the FADEC faults: inhibited in flight phases 2 to 10 */
const NOT_SHOWN_PHASES_2_TO_10 =
  'it is shown only with the engines off on electrical power, during the landing roll below 80 kt, and after engine shutdown';

/** ENG TYPE DISAGREE: inhibited in flight phases 3 to 12 */
const NOT_SHOWN_PHASES_3_TO_12 =
  'it is shown only on the ground with the engines off on electrical power or the first engine started';

/** ENG n SHUT DOWN: not raised in flight phases 1, 2, 11 and 12 (the engine shutdown precondition), inhibited in 5 and 6 */
const SHUT_DOWN_PHASES =
  'except on the ground before take-off power, during the landing roll below 80 kt and after engine shutdown; a new alert is not shown from V1 to 400 ft';

const CTL_SYS_FAULT_FIRST = 701800001;
const CTL_VLV_FAULT_FIRST = 701800005;
const ENG_FAIL_FIRST = 701800029;
const OVTHR_PROT_LOST_FIRST = 701800101;
const SENSOR_FAULT_FIRST = 701800105;
const SHUT_DOWN_FIRST = 701800109;
const THR_LEVER_FAULT_FIRST = 701800129;
const THRUST_LOSS_FIRST = 701800133;
const ENG_TYPE_DISAGREE = '701800161';

const alertId = (first: number, engine: number): string => (first + engine - 1).toString();

/** @returns where the engine sits: engines 1 and 4 are the outer engines, 2 and 3 the inner ones */
const enginePosition = (engine: number): string => (engine === 1 || engine === 4 ? 'outer' : 'inner');

/** What the shut-down engine adds to the STATUS page (the reverser and the BTV only for the engines 2 and 3) */
const engineOutConsequences = (engine: number): string =>
  `ENG ${engine} BLEED is listed as inoperative in all phases.` +
  (engine === 2 || engine === 3
    ? ` For approach and landing ENG ${engine} REVERSER and BTV are also listed as inoperative (BTV cannot be armed).`
    : '') +
  ' With the APU off, CAT 3 DUAL is listed as inoperative for approach and landing and CAT 3 SINGLE ONLY as information.';

const ENGINE_FADEC_NOTE =
  'The four engines are each controlled by their own FADEC; the failure acts on the FADEC of one engine only.';

// ---------------------------------------------------------------------------------------------------------------------
// Overthrust (thrust control lost)
// ---------------------------------------------------------------------------------------------------------------------

const overthrustDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `The FADEC of the ${enginePosition(engine)} engine ${engine} watches that the engine thrust is not above the thrust ` +
    'commanded by the thrust lever. If it is, the overthrust protection shuts the engine down on the ground with the ' +
    'thrust lever at idle or in reverse, and cuts the fuel back in flight below 15,000 ft. There is no protection ' +
    'above 15,000 ft or above Mach 0.4.',
  impact: [
    `The FADEC of engine ${engine} detects an overthrust. The excess thrust itself is not simulated; only the protection acts.`,
    'On the ground with the thrust lever at idle or in reverse and the engine running, the engine is shut down.',
    'In flight below 15,000 ft and up to Mach 0.4, the fuel cutback gives the alert only: the thrust does not change.',
    'On the ground with the lever above idle, or above 15,000 ft or Mach 0.4, nothing happens.',
  ],
  alertIds: [alertId(CTL_SYS_FAULT_FIRST, engine), alertId(ENG_FAIL_FIRST, engine), alertId(SHUT_DOWN_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} CTL SYS FAULT appears, ${CAUTION}, with the fuel cutback in flight and after the ground ` +
        `shutdown; ${NOT_SHOWN_PHASES_5_AND_6}. Its lines are THR LEVER ${engine} IDLE and ENG ${engine} MASTER OFF.`,
    },
    {
      where: 'E/WD',
      text:
        `After the ground shutdown, ENG ${engine} FAIL appears, ${CAUTION}, in any flight phase, and calls up the SD ` +
        `ENG page. Its lines are THRUST CTL LOST, THR LEVER ${engine} IDLE and ENG ${engine} MASTER OFF; the relight ` +
        'lines do not appear.',
    },
    {
      where: 'E/WD',
      text: `Once ENG MASTER ${engine} is set OFF, ENG ${engine} SHUT DOWN also appears, ${CAUTION}, ${SHUT_DOWN_PHASES}. On the STATUS page: ${engineOutConsequences(engine)}`,
    },
    {
      where: 'Pedestal ENG MASTER panel',
      text: `After the ground shutdown, the FAULT light of ENG MASTER ${engine} comes on.`,
    },
  ],
  notSimulated: ['The excess thrust is not modelled, so in flight the protection does not reduce any real thrust.'],
  logbook: { required: true, reason: 'caution, engine shut down or fuel cutback' },
  clearing:
    `${MAINTENANCE_ONLY} A shut-down engine stays shut down: set ENG MASTER ${engine} OFF, then ON, to start it again. ` +
    'The fuel cutback ends when the failure is restored.',
});

const OverthrustFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Overthrust, A380Failure.Eng2Overthrust, A380Failure.Eng3Overthrust, A380Failure.Eng4Overthrust],
  detail: overthrustDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Thrust lever resolvers
// ---------------------------------------------------------------------------------------------------------------------

const thrustLeverResolversDetail = (engine: number): FailureDetail => {
  const reverser = engine === 2 || engine === 3;
  const effects: SeenEffect[] = [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} THR LEVER FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_5_AND_6}. On the ground its lines are ` +
        `ENG ${engine} IDLE ONLY and THR LEVER ${engine} IDLE; in flight ENG ${engine} CLB ONLY and THR LEVER ${engine} ` +
        `CLB` +
        (reverser ? '; for this engine also LDG DIST IMPACT ON WET/CONTAM RWY ONLY.' : '.'),
    },
    {
      where: 'SD STATUS',
      text:
        `ENG ${engine} IDLE ONLY (on the ground) or ENG ${engine} CLB ONLY (in flight) is listed as information, and ` +
        `ENG ${engine} THR LEVER as inoperative, as long as the failure is set, also while the alert is held back.` +
        (reverser
          ? ` ENG ${engine} REVERSER and BTV are listed as inoperative for approach and landing, and BTV cannot be armed.`
          : ''),
    },
  ];
  return {
    whatItIs:
      `Two resolvers in the thrust lever of engine ${engine} give the lever angle to the FADEC of that engine. When both ` +
      'fail, the FADEC has lost the lever position: it sets the engine to idle on the ground and limits it to climb ' +
      'thrust in flight.',
    impact: [
      `The FADEC of engine ${engine} no longer follows the lever: on the ground it holds idle, in flight it takes the climb detent.`,
      `The other engines and their levers are not affected. ${ENGINE_FADEC_NOTE}`,
      reverser
        ? `The reverser of engine ${engine} cannot deploy, so there is no reverse thrust from it.`
        : `Engine ${engine} has no reverser, so only its forward thrust is limited.`,
    ],
    alertIds: [alertId(THR_LEVER_FAULT_FIRST, engine)],
    effects,
    logbook: { required: true, reason: 'caution, engine held at idle or climb thrust' },
    clearing: `${MAINTENANCE_ONLY} The FADEC then follows the lever again at once.`,
  };
};

const ThrustLeverResolversFamily: FailureDetailFamily = {
  ids: [
    A380Failure.ThrustLever1Resolvers,
    A380Failure.ThrustLever2Resolvers,
    A380Failure.ThrustLever3Resolvers,
    A380Failure.ThrustLever4Resolvers,
  ],
  detail: thrustLeverResolversDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Max thrust miscalculated (thrust loss)
// ---------------------------------------------------------------------------------------------------------------------

const maxThrustMiscalculatedDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `The FADEC of the ${enginePosition(engine)} engine ${engine} computes the maximum thrust (THR) of its engine for ` +
    'each rating. When that calculation is wrong but still valid, the engine gives less thrust than the lever asks ' +
    'for, and the FADEC detects it by comparing its maximum THR with that of the other engines.',
  impact: [
    `The FADEC of engine ${engine} computes ratings 15 % lower above idle, so the engine N1 target and the thrust are that much lower in every detent.`,
    'The alert compares the engine with the other three: it needs the maximum THR of the engine to be at most 90 % of that of at least two other engines.',
    'With three or four engines affected the healthy engines are too few and the alert does not appear.',
  ],
  alertIds: [alertId(THRUST_LOSS_FIRST, engine), alertId(SHUT_DOWN_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} THRUST LOSS appears, ${CAUTION}; ${NOT_SHOWN_OUTSIDE_PHASE_3}. Its lines are THR LEVER ${engine} IDLE ` +
        `and ENG ${engine} MASTER OFF. It calls up the SD ENG page. Once shown it stays when the flight phase changes.`,
    },
    {
      where: 'E/WD',
      text: `Once ENG MASTER ${engine} is set OFF, ENG ${engine} SHUT DOWN also appears, ${CAUTION}, ${SHUT_DOWN_PHASES}. On the STATUS page: ${engineOutConsequences(engine)}`,
    },
  ],
  logbook: { required: true, reason: 'caution, engine thrust lower than commanded' },
  clearing: `${MAINTENANCE_ONLY} The ratings are then computed correctly again at once.`,
});

const MaxThrustMiscalculatedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1MaxThrustMiscalculated,
    A380Failure.Eng2MaxThrustMiscalculated,
    A380Failure.Eng3MaxThrustMiscalculated,
    A380Failure.Eng4MaxThrustMiscalculated,
  ],
  detail: maxThrustMiscalculatedDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// FADEC faults without an effect on the engine: sensors, overthrust protection, control valve, thrust rating
// ---------------------------------------------------------------------------------------------------------------------

const sensorsDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `The ${enginePosition(engine)} engine ${engine} has probes for the total pressure, the total temperature and the ` +
    'static temperature that the FADEC uses to compute the engine parameters.',
  impact: [
    `A probe of engine ${engine} is failed. Only the FADEC fault message follows.`,
    'The model keeps the engine parameters, the thrust and the displays unchanged.',
  ],
  alertIds: [alertId(SENSOR_FAULT_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} SENSOR FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_10}. It has no procedure line ` +
        'and no STATUS line.',
    },
  ],
  notSimulated: [
    'With more than one probe failed the real aircraft shows the alert before engine start; here there is one failure per engine and the alert follows the usual phases.',
  ],
  logbook: { required: true, reason: 'advisory, probe fault' },
  clearing: MAINTENANCE_ONLY,
});

const SensorsFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Sensors, A380Failure.Eng2Sensors, A380Failure.Eng3Sensors, A380Failure.Eng4Sensors],
  detail: sensorsDetail,
};

const overthrustProtectionDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `The overthrust protection of the ${enginePosition(engine)} engine ${engine} is a function of its FADEC that shuts ` +
    'the engine down or cuts the fuel back when the thrust is above the commanded thrust.',
  impact: [
    `The FADEC of engine ${engine} reports that its overthrust protection is lost.`,
    'The model keeps the protection as it is: only the alert follows.',
  ],
  alertIds: [alertId(OVTHR_PROT_LOST_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} OVTHR PROT LOST appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_10}. It has no procedure ` +
        'line and no STATUS line.',
    },
  ],
  notSimulated: [
    'In the real aircraft the lost protection no longer acts on an overthrust of that engine; here an overthrust failure of the engine is still handled by the protection.',
  ],
  logbook: { required: true, reason: 'advisory, protection lost' },
  clearing: MAINTENANCE_ONLY,
});

const OverthrustProtectionFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1OverthrustProtection,
    A380Failure.Eng2OverthrustProtection,
    A380Failure.Eng3OverthrustProtection,
    A380Failure.Eng4OverthrustProtection,
  ],
  detail: overthrustProtectionDetail,
};

const controlValveDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `The ${enginePosition(engine)} engine ${engine} has control valves for the cooling air, the high pressure turbine ` +
    'and the compressor discharge that the FADEC commands open. A valve that does not open is reported.',
  impact: [
    `A control valve of engine ${engine} is reported failed. Only the FADEC fault message follows.`,
    'The model keeps the engine parameters and the thrust unchanged.',
  ],
  alertIds: [alertId(CTL_VLV_FAULT_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} CTL VLV FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_10}. It has no procedure ` +
        'line and no STATUS line, and does not name the valve.',
    },
  ],
  notSimulated: [
    'The real aircraft names the failed valve (cooling, high pressure turbine or compressor discharge valve not open); the failure does not say which valve failed.',
  ],
  logbook: { required: true, reason: 'advisory, control valve fault' },
  clearing: MAINTENANCE_ONLY,
});

const ControlValveFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1ControlValve,
    A380Failure.Eng2ControlValve,
    A380Failure.Eng3ControlValve,
    A380Failure.Eng4ControlValve,
  ],
  detail: controlValveDetail,
};

const thrustRatingDisagreeDetail = (engine: number): FailureDetail => ({
  whatItIs:
    'The FADECs of the four engines each hold the thrust rating of their engine, and the engines must have the same ' +
    'rating. When one differs, the FADEC reports the disagreement.',
  impact: [
    `The thrust rating of engine ${engine} differs from the others. Only the alert follows.`,
    'The model keeps the engine thrust and the thrust limits unchanged.',
    'The alert is one alert for the four engines: several engines affected give the same single alert.',
  ],
  alertIds: [ENG_TYPE_DISAGREE],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG TYPE DISAGREE appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_12}. It has no procedure line and no STATUS line, ` +
        'and stays when the flight phase changes.',
    },
  ],
  logbook: { required: true, reason: 'caution, thrust ratings differ' },
  clearing: MAINTENANCE_ONLY,
});

const ThrustRatingDisagreeFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1ThrustRatingDisagree,
    A380Failure.Eng2ThrustRatingDisagree,
    A380Failure.Eng3ThrustRatingDisagree,
    A380Failure.Eng4ThrustRatingDisagree,
  ],
  detail: thrustRatingDisagreeDetail,
};

export const Ata73ThrustFamilies: FailureDetailFamily[] = [
  OverthrustFamily,
  ThrustLeverResolversFamily,
  MaxThrustMiscalculatedFamily,
  SensorsFamily,
  OverthrustProtectionFamily,
  ControlValveFamily,
  ThrustRatingDisagreeFamily,
];
