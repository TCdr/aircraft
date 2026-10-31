// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Engines 1 and 2 are on the left wing, 3 and 4 on the right wing */
const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

/** ENG n FADEC FAULT: inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** FADEC SYS FAULT and FADEC TEMP HI: inhibited in flight phases 3 to 10 */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: with the engines off, with the first engine started before take-off power, ' +
  'and after landing once below 80 kt; a failure that appears in flight shows after landing';

/** ENG n CTL SYS FAULT: inhibited in flight phases 5 and 6 */
const NOT_SHOWN_PHASES_5_AND_6 = 'a new alert is not shown from V1 on the take-off roll until 400 ft';

/** ENG n MINOR FAULT: inhibited in flight phases 2 to 10 */
const NOT_SHOWN_PHASES_2_TO_10 =
  'a new alert shows only with the engines off on electrical power, and after landing (once below 80 kt, and after ' +
  'the engines are shut down); it is not shown from the first engine start before take-off through the flight and ' +
  'the landing roll until the speed is below 80 kt';

/** ENG n FADEC IDENT FAULT: inhibited in flight phases 2 to 12 */
const NOT_SHOWN_PHASES_2_TO_12 =
  'a new alert shows only with the aircraft on electrical power and the engines off; it is not shown once an engine ' +
  'is started, nor in the first minutes after the engines are shut down';

/** ENG n SHUT DOWN: inhibited in flight phases 5 and 6, and not raised in phases 1, 2, 11 and 12 */
const SHUT_DOWN_TIMING =
  'it appears for an engine switched off in flight, on the take-off roll before V1 or on the landing roll above 80 ' +
  'kt, but not while taxiing or stopped on the ground, and a new one is not shown from V1 to 400 ft';

/** The FADEC without a valid FLEX TEMP is in TOGA mode; the E/WD thrust rating is the one of FADEC 1 */
const ratingClause = (fadec: number, derateAlsoLost: boolean): string =>
  fadec === 1
    ? 'The thrust rating on the E/WD comes from FADEC 1: on the ground with engine 1 running it shows TOGA and the ' +
      `TOGA limit instead of FLX and the flex temperature${derateAlsoLost ? ' (or the derate level)' : ''}.`
    : 'The thrust rating on the E/WD comes from FADEC 1 and stays as normal.';

const thrustDisagreeText = (engine: number): string =>
  `ENG T.O THRUST DISAGREE appears, ${CAUTION}, as one alert for the four engines: it does not name engine ` +
  `${engine}. It has no lines and calls up no SD page. It shows only on the ground below 80 kt, after the first ` +
  'engine start before take-off power is set and after landing. An alert already on screen stays when take-off ' +
  'power is set.';

const ENGINE_DESCRIPTION =
  'The FADEC (full authority digital engine control) manages its engine completely: protection, thrust management, ' +
  'starting and ignition, and the monitoring and display of the engine parameters.';

const alertId = (first: number, engine: number): string => (first + engine - 1).toString();

/** First alert key of each kind; the engine number minus one is added */
const FIRST_CTL_SYS_FAULT_ALERT = 701800001;
const FIRST_FADEC_FAULT_ALERT = 701800013;
const FIRST_FADEC_IDENT_FAULT_ALERT = 701800017;
const FIRST_FADEC_SYS_FAULT_ALERT = 701800021;
const FIRST_FADEC_TEMP_HI_ALERT = 701800025;
const FIRST_ENG_FAIL_ALERT = 701800029;
const FIRST_MINOR_FAULT_ALERT = 701800069;
const FIRST_ENG_SHUT_DOWN_ALERT = 701800109;
const TO_THRUST_DISAGREE_ALERT = '701800155';

const position = (engine: number): string => ENGINE_POSITIONS[engine - 1];

// ---------------------------------------------------------------------------------------------------------------------
// FADEC avionics network link
// ---------------------------------------------------------------------------------------------------------------------

const networkLinkDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} It exchanges data with the avionics networks through input/output modules and sends the ` +
    `main engine values to the E/WD. Engine ${engine} is the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} keeps running under its own FADEC: only the link of the FADEC to the avionics networks is lost.`,
    `The autothrust loses engine ${engine}: its thrust follows thrust lever ${engine} alone, while the other engines ` +
      'stay under autothrust.',
    `The ENG page loses the values of engine ${engine}; the E/WD still shows its N1, EGT and thrust, but the ENG ` +
      `${engine} EGT OVER LIMIT alert is no longer raised, so the crew has to watch its EGT.`,
    `With a flex temperature entered, FADEC ${engine} also loses it: its take-off mode becomes TOGA while the other ` +
      'FADECs stay in FLEX.',
  ],
  alertIds: [
    alertId(FIRST_FADEC_FAULT_ALERT, engine),
    alertId(FIRST_ENG_SHUT_DOWN_ALERT, engine),
    TO_THRUST_DISAGREE_ALERT,
  ],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} FADEC FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its lines: THR LEVER ` +
        `${engine} MAN ADJUST (only with the A/THR engaged), ENG ${engine} PARAMETERS MONITOR, and under IF ` +
        `ABNORMAL: THR LEVER ${engine} IDLE, ENG ${engine} MASTER OFF.`,
    },
    {
      where: 'SD ENG',
      text:
        `The alert calls up the ENG page when it first appears, unless the crew has selected another page. The ` +
        `values of engine ${engine} (N2, N3, fuel flow, oil quantity, temperature and pressure, vibrations, and the ` +
        'nacelle temperature when it is shown) are replaced by amber XX.',
    },
    {
      where: 'SD STATUS',
      text:
        `While the A/THR is engaged, ENG ${engine} A/THR is listed as inoperative for all phases, also when the ` +
        'alert itself is held back by the flight phase.',
    },
    {
      where: 'E/WD',
      text:
        `If the crew follows the last line and sets the ENG ${engine} MASTER OFF, ENG ${engine} SHUT DOWN appears, ` +
        `${CAUTION}; ${SHUT_DOWN_TIMING}.`,
    },
    {
      where: 'E/WD',
      text:
        `With a flex temperature entered, ${thrustDisagreeText(engine)} In the FLX/MCT detent engine ${engine} gives ` +
        `MCT thrust instead of the flex thrust. ${ratingClause(engine, false)}`,
    },
  ],
  logbook: { required: true, reason: 'caution, engine values lost on the ENG page' },
  clearing: MAINTENANCE_ONLY,
});

const NetworkLinkFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FadecNetworkLink,
    A380Failure.Eng2FadecNetworkLink,
    A380Failure.Eng3FadecNetworkLink,
    A380Failure.Eng4FadecNetworkLink,
  ],
  detail: networkLinkDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// FADEC system fault and FADEC overheat: alerts only
// ---------------------------------------------------------------------------------------------------------------------

const systemFaultDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} When a failure of the FADEC affects the control of the engine, the crew is told. Engine ` +
    `${engine} is the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} runs and is controlled as before: the failure only raises the alert.`,
    'The alert is for crew awareness: it has no procedure line.',
  ],
  alertIds: [alertId(FIRST_FADEC_SYS_FAULT_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text: `ENG ${engine} FADEC SYS FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_10}. It has no lines.`,
    },
    {
      where: 'SD ENG',
      text:
        'The alert calls up the ENG page when it first appears, unless the crew has selected another page; the ' +
        `values of engine ${engine} stay normal.`,
    },
  ],
  notSimulated: [
    'The real alert reports a real fault of the engine control; here the control of the engine is not changed.',
  ],
  logbook: { required: true, reason: 'caution, FADEC fault' },
  clearing: MAINTENANCE_ONLY,
});

const SystemFaultFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FadecSystemFault,
    A380Failure.Eng2FadecSystemFault,
    A380Failure.Eng3FadecSystemFault,
    A380Failure.Eng4FadecSystemFault,
  ],
  detail: systemFaultDetail,
};

const overheatDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} The temperature of the FADEC electronics is monitored and an excessive temperature is ` +
    `signalled to the crew. Engine ${engine} is the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} runs and is controlled as before: the failure only raises the alert.`,
    'The alert is for crew awareness: it has no procedure line.',
    'The FADEC does not shut the engine down; that is the separate failure "FADEC overheat (engine shutdown)".',
  ],
  alertIds: [alertId(FIRST_FADEC_TEMP_HI_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text: `ENG ${engine} FADEC TEMP HI appears, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_10}. It has no lines.`,
    },
    {
      where: 'SD ENG',
      text:
        'The alert calls up the ENG page when it first appears, unless the crew has selected another page; the ' +
        `values of engine ${engine} stay normal.`,
    },
  ],
  logbook: { required: true, reason: 'caution, FADEC temperature high' },
  clearing: MAINTENANCE_ONLY,
});

const OverheatFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FadecOverheat,
    A380Failure.Eng2FadecOverheat,
    A380Failure.Eng3FadecOverheat,
    A380Failure.Eng4FadecOverheat,
  ],
  detail: overheatDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// FADEC overheat with an engine shutdown
// ---------------------------------------------------------------------------------------------------------------------

const overheatShutdownDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} It also protects the engine by shutting it down by itself in some cases, for example when ` +
    `the FADEC overheats. Engine ${engine} is the ${position(engine)} engine.`,
  impact: [
    `The FADEC shuts the running engine ${engine} down at once and keeps its fuel cut, with no automatic relight. ` +
      'The engine cannot be restarted while the failure is active: its fuel stays cut. An engine that is not yet ' +
      'running when the failure is set is shut down once it runs.',
    'Everything the engine supplied is lost, as with any engine failure.',
    'The shutdown is latched: it stays until the failure is restored and the crew sets the ENG MASTER OFF.',
  ],
  alertIds: [alertId(FIRST_ENG_FAIL_ALERT, engine), alertId(FIRST_ENG_SHUT_DOWN_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} FAIL appears, ${CAUTION}, as the engine runs down below 50 % N3 with its ENG MASTER still ON; ` +
        'it is never held back by the flight phase. Its lines are the reason FADEC OVHT, THR LEVER ' +
        `${engine} IDLE and ENG ${engine} MASTER OFF, with L/G UP first when the gear lever is down between lift-off ` +
        'and 1,500 ft. The auto relight, damage and fire lines of an ordinary engine failure are not shown. If all ' +
        'four engines are out, ALL ENG FLAME OUT replaces it.',
    },
    {
      where: 'SD ENG',
      text: 'The alert calls up the ENG page when it first appears, unless the crew has selected another page.',
    },
    {
      where: 'E/WD',
      text:
        `When the crew sets the ENG ${engine} MASTER OFF, ENG ${engine} SHUT DOWN appears as well, ${CAUTION}; ` +
        `${SHUT_DOWN_TIMING}. ENG ${engine} FAIL stays, its lines done, until the engine runs again.`,
    },
  ],
  notSimulated: [
    'On the real aircraft the FADEC loses its supply 15 minutes after the shutdown on the ground, and THR LEVER IDLE ' +
      'then shows as not done again even with the lever at idle; here the line only follows the lever.',
  ],
  logbook: { required: true, reason: 'caution, engine shut down by the FADEC' },
  clearing: `${MAINTENANCE_ONLY} The shutdown stays until the ENG MASTER is set OFF; the engine can then be started normally.`,
});

const OverheatShutdownFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FadecOverheatShutdown,
    A380Failure.Eng2FadecOverheatShutdown,
    A380Failure.Eng3FadecOverheatShutdown,
    A380Failure.Eng4FadecOverheatShutdown,
  ],
  detail: overheatShutdownDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// FADEC channels A and B
// ---------------------------------------------------------------------------------------------------------------------

/** Channel A is supplied from AC ESS; channel B from AC 3 for engines 1 and 3 and AC 2 for engines 2 and 4 */
const channelSupply = (channel: 'A' | 'B', engine: number): string => {
  if (channel === 'A') {
    return 'AC ESS';
  }
  return engine % 2 === 1 ? 'AC 3' : 'AC 2';
};

const channelDetail = (channel: 'A' | 'B', engine: number): FailureDetail => {
  const otherChannel = channel === 'A' ? 'B' : 'A';
  return {
    whatItIs:
      `Each FADEC has an electronic engine controller with two fully redundant channels, A and B. Only one channel ` +
      'controls the engine; if it fails the other takes over, and the channel in control changes at each engine ' +
      `start. When the engine does not power the FADEC itself, channel ${channel} is supplied from ` +
      `${channelSupply(channel, engine)}. Engine ${engine} is the ${position(engine)} engine.`,
    impact: [
      `With channel ${channel} lost, channel ${otherChannel} controls engine ${engine} alone: the engine runs and is ` +
        'controlled as before.',
      `If channel ${otherChannel} is failed too, the FADEC has no working channel: it counts as unpowered, the ` +
        'values of the engine are replaced by XX on the ENG page and the engine cannot be started. A running engine ' +
        'keeps running.',
    ],
    alertIds: [alertId(FIRST_MINOR_FAULT_ALERT, engine)],
    effects: [
      {
        where: 'E/WD',
        text:
          `With only channel ${channel} of the FADEC failed, ENG ${engine} MINOR FAULT appears, ${ADVISORY}; ` +
          `${NOT_SHOWN_PHASES_2_TO_10}. It has no lines and calls up no SD page. With both channels failed it does ` +
          'not appear, and no alert replaces it.',
      },
      {
        where: 'SD ENG',
        text:
          'Nothing changes while the other channel works. With both channels failed, the values of engine ' +
          `${engine} are replaced by amber XX, also when the engine is running.`,
      },
      {
        where: 'ENG START panel',
        text:
          'With both channels failed, the engine does not start: the start valve stays closed and the engine does ' +
          'not turn. An ENG MASTER left ON starts nothing once the channel is restored; set it OFF, then ON.',
      },
    ],
    logbook: { required: true, reason: 'FADEC channel lost, MINOR FAULT advisory' },
    clearing: `${MAINTENANCE_ONLY} An ENG MASTER that was left ON then needs to be set OFF and ON to start the engine.`,
  };
};

const ChannelAFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FadecChannelA,
    A380Failure.Eng2FadecChannelA,
    A380Failure.Eng3FadecChannelA,
    A380Failure.Eng4FadecChannelA,
  ],
  detail: (number) => channelDetail('A', number),
};

const ChannelBFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FadecChannelB,
    A380Failure.Eng2FadecChannelB,
    A380Failure.Eng3FadecChannelB,
    A380Failure.Eng4FadecChannelB,
  ],
  detail: (number) => channelDetail('B', number),
};

// ---------------------------------------------------------------------------------------------------------------------
// EIPM 1 (engines 2 and 4, reverser 2) and EIPM 2 (engines 1 and 3, reverser 3)
// ---------------------------------------------------------------------------------------------------------------------

/** @param eipm 1 serves engines 2 and 4 and the reverser of engine 2; 2 serves engines 1 and 3 and the reverser of engine 3 */
const eipmDetail = (eipm: 1 | 2): FailureDetail => {
  const engines = eipm === 1 ? [2, 4] : [1, 3];
  const reverserEngine = eipm === 1 ? 2 : 3;
  const enginesText = `engines ${engines[0]} (${position(engines[0])}) and ${engines[1]} (${position(engines[1])})`;
  return {
    whatItIs:
      'The engine interface and power management unit (EIPM) switches the aircraft electrical network to the FADEC ' +
      'when the engine does not power it by itself, and supplies the thrust reverser power unit when the second line ' +
      `of defence against an inadvertent deployment is cleared. There is one EIPM for two engines: EIPM ${eipm} ` +
      `serves ${enginesText}, and the thrust reverser of engine ${reverserEngine}.`,
    impact: [
      `The FADECs of ${enginesText} lose the aircraft supply: neither engine can be started or cranked.`,
      'A running engine keeps its FADEC through its own alternator, above 12.5 % core speed; an engine that is not ' +
        'running, or has slowed below about 10 %, has no FADEC supply.',
      `The thrust reverser of engine ${reverserEngine} no longer deploys: there is no reverse thrust on that engine.`,
    ],
    alertIds: [],
    effects: [
      {
        where: 'SD ENG',
        text:
          `The values of ${enginesText} are replaced by amber XX whenever the engine is not running, also with the ` +
          'aircraft just powered up. No alert is raised.',
      },
      {
        where: 'ENG START panel',
        text:
          `With the ENG MASTER ON or the ENG START selector at IGN START or CRANK, engines ${engines[0]} and ` +
          `${engines[1]} do not start or turn: the start valve stays closed. No alert is raised. An ENG MASTER left ` +
          'ON starts nothing once the EIPM is restored; set it OFF, then ON.',
      },
      {
        where: 'Thrust levers',
        text:
          `Reverse selected on thrust lever ${reverserEngine} on the ground gives no reverse thrust: the reverser of ` +
          `engine ${reverserEngine} neither releases its second lock nor deploys. No reverser alert and no STATUS ` +
          'line tell the crew.',
      },
    ],
    notSimulated: [
      `The EIPM reset button of the reset panel (ENG ${engines[0]} EIPM ${eipm} and ENG ${engines[1]} EIPM ${eipm}) ` +
        'does nothing, so the crew cannot try a reset.',
    ],
    logbook: { required: true, reason: 'engines cannot be started, values lost on the ENG page' },
    clearing: `${MAINTENANCE_ONLY} An ENG MASTER that was left ON then needs to be set OFF and ON to start the engine.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// FADEC minor fault, control system fault and engine identification
// ---------------------------------------------------------------------------------------------------------------------

const minorFaultDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} A minor fault means that some internal engine sensors, or one of the two channels of the ` +
    `FADEC, have failed while the engine control continues. Engine ${engine} is the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} runs and is controlled as before: the failure only raises the alert.`,
    'The alert is for crew awareness: it has no procedure line.',
  ],
  alertIds: [alertId(FIRST_MINOR_FAULT_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} MINOR FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_10}. It has no lines and calls up ` +
        'no SD page.',
    },
  ],
  notSimulated: [
    'The real alert waits for the end of the flight when only one engine is affected, and shows at power-up when more ' +
      'than two engines are; here it shows whenever the flight phase allows, for any number of engines.',
  ],
  logbook: { required: true, reason: 'amber advisory, FADEC minor fault' },
  clearing: MAINTENANCE_ONLY,
});

const MinorFaultFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1MinorFault, A380Failure.Eng2MinorFault, A380Failure.Eng3MinorFault, A380Failure.Eng4MinorFault],
  detail: minorFaultDetail,
};

const controlSystemDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} It regulates the engine with the engine control system: the HP compressor exit pressure ` +
    'sensor, the N1 and N2 speed sensors and the fuel regulation (the hydromechanical metering unit). Engine ' +
    `${engine} is the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} keeps its normal control and thrust.`,
    'Its N1, N2, N3 and fuel flow values are marked as less accurate.',
    'On the ground the crew is asked to bring the thrust lever to idle and shut the engine down.',
  ],
  alertIds: [alertId(FIRST_CTL_SYS_FAULT_ALERT, engine), alertId(FIRST_ENG_SHUT_DOWN_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} CTL SYS FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_5_AND_6}. On the ground its lines are ` +
        `THR LEVER ${engine} IDLE and ENG ${engine} MASTER OFF; in flight it has no line.`,
    },
    {
      where: 'E/WD',
      text:
        `If the crew follows the ground line and sets the ENG ${engine} MASTER OFF, ENG ${engine} SHUT DOWN appears, ` +
        `${CAUTION}; ${SHUT_DOWN_TIMING}.`,
    },
    {
      where: 'E/WD',
      text:
        `Two amber horizontal lines strike the decimal digit of the N1 value of engine ${engine}, also when the ` +
        'alert itself is held back by the flight phase.',
    },
    {
      where: 'SD ENG',
      text:
        `Two amber lines strike the decimal digit of the N2 and N3 values of engine ${engine} and the last three ` +
        'digits of its fuel flow, while these values are shown. The alert calls up no SD page.',
    },
  ],
  notSimulated: [
    'The engine control itself is not degraded: the real alert with a degraded engine control adds NO RAPID THR ' +
      'CHANGES (also as a limitation on the E/WD and the PFD), ENG SLOW RESPONSE, and the A/THR of the engine as ' +
      'inoperative on the SD STATUS; none of these appear.',
    'The real alert also advises not to use the reverser of the inner engines for some sensor and bleed valve ' +
      'failures; this line is not shown.',
  ],
  logbook: { required: true, reason: 'caution, engine control system fault' },
  clearing: MAINTENANCE_ONLY,
});

const ControlSystemFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1ControlSystem,
    A380Failure.Eng2ControlSystem,
    A380Failure.Eng3ControlSystem,
    A380Failure.Eng4ControlSystem,
  ],
  detail: controlSystemDetail,
};

const fadecIdentDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${ENGINE_DESCRIPTION} Each FADEC identifies the configuration of the engine it controls. Engine ${engine} is ` +
    `the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} runs and is controlled as before: the failure only raises the alert.`,
    'The alert is for crew awareness: it has no procedure line.',
  ],
  alertIds: [alertId(FIRST_FADEC_IDENT_FAULT_ALERT, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} FADEC IDENT FAULT appears, ${ADVISORY}; ${NOT_SHOWN_PHASES_2_TO_12}. It has no lines and ` +
        'calls up no SD page.',
    },
  ],
  logbook: { required: true, reason: 'amber advisory, FADEC cannot identify the engine' },
  clearing: MAINTENANCE_ONLY,
});

const FadecIdentFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1FadecIdent, A380Failure.Eng2FadecIdent, A380Failure.Eng3FadecIdent, A380Failure.Eng4FadecIdent],
  detail: fadecIdentDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// FLEX TEMP not received
// ---------------------------------------------------------------------------------------------------------------------

const flexTempNotReceivedDetail = (fadec: number): FailureDetail => ({
  whatItIs:
    'For a flexible take-off the crew enters a flex temperature on the take-off panel of the FMS PERF page. The ' +
    'flight computers (PRIMs) send it to the FADECs, and a FADEC with a valid flex temperature limits the take-off ' +
    `thrust of its engine to the flex rating. FADEC ${fadec} controls engine ${fadec}, the ${position(fadec)} engine.`,
  impact: [
    `FADEC ${fadec} gets no flex temperature: its take-off mode is TOGA while the other FADECs stay in FLEX. A ` +
      'derated take-off is lost for this engine in the same way.',
    `With the thrust levers in the FLX/MCT detent engine ${fadec} gives MCT thrust instead of the flex thrust of the ` +
      'other engines; in the TOGA detent it gives TOGA thrust like the others.',
    'Without a flex temperature or a derate set all FADECs are in TOGA mode, and the failure changes nothing.',
  ],
  alertIds: [TO_THRUST_DISAGREE_ALERT],
  effects: [
    {
      where: 'E/WD',
      text:
        `${thrustDisagreeText(fadec)} It needs a flex temperature or a derate set, so that the other FADECs are in ` +
        'FLEX.',
    },
    {
      where: 'E/WD',
      text:
        `At take-off power in the FLX/MCT detent the N1 and thrust of engine ${fadec} differ from the other ` +
        `engines. ${ratingClause(fadec, true)}`,
    },
  ],
  logbook: { required: true, reason: 'caution, take-off thrust modes disagree' },
  clearing: MAINTENANCE_ONLY,
});

const FlexTempNotReceivedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Fadec1FlexTempNotReceived,
    A380Failure.Fadec2FlexTempNotReceived,
    A380Failure.Fadec3FlexTempNotReceived,
    A380Failure.Fadec4FlexTempNotReceived,
  ],
  detail: flexTempNotReceivedDetail,
};

export const Ata73FadecEntries: Record<number, FailureDetail> = {
  [A380Failure.Eipm1]: eipmDetail(1),
  [A380Failure.Eipm2]: eipmDetail(2),
};

export const Ata73FadecFamilies: FailureDetailFamily[] = [
  NetworkLinkFamily,
  SystemFaultFamily,
  OverheatFamily,
  OverheatShutdownFamily,
  ChannelAFamily,
  ChannelBFamily,
  MinorFaultFamily,
  ControlSystemFamily,
  FadecIdentFamily,
  FlexTempNotReceivedFamily,
];
