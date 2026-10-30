// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

/** A-ICE ENG n VLV CLOSED, inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** A-ICE ENG n VLV OPEN, inhibited in every flight phase but 2 and 8 */
const NOT_SHOWN_PHASES_1_AND_3_TO_7_AND_9_TO_12 =
  'a new alert is shown only on the ground after the first engine start until take-off power, and in climb above ' +
  '1,500 ft, cruise and descent down to 800 ft';

/** A-ICE ENG n VLV MONITORING FAULT, inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the engines are shut ' +
  'down after landing';

/** A-ICE L(R) WING VLV CLOSED, inhibited in flight phases 3 to 7 and 9 to 12 */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_12 =
  'a new alert is shown only on the ground before take-off power, and in climb above 1,500 ft, cruise and descent ' +
  'down to 800 ft';

/** A-ICE L(R) WING VLV OPEN, inhibited in flight phases 3 to 7 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_AND_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the landing roll is below ' +
  '80 kt';

/** The green legend of the bleed supply on the E/WD, drawn while an engine or wing anti-ice valve is open */
const bleedSupplyLegend = (legend: string, valve: string): { where: string; text: string } => ({
  where: 'E/WD',
  text:
    `${legend} shows in green in the bleed supply legend of the thrust area while ${valve} is open, on the ground ` +
    'with an engine running or in flight at an MCT, FLEX or TOGA thrust limit.',
});

/** A-ICE L(R) WING VLV PRESS HI, inhibited in flight phases 4 to 7 */
const NOT_SHOWN_PHASES_4_TO_7 = 'a new alert is not shown from 80 kt on the take-off roll to 1,500 ft';

/** A-ICE L(R) WING VLV PRESS LO, inhibited in every flight phase but 2, 8 and 11 */
const NOT_SHOWN_PHASES_1_3_TO_7_9_10_12 =
  'a new alert is shown only on the ground after the first engine start until take-off power, in climb above ' +
  '1,500 ft, cruise and descent down to 800 ft, and after landing below 80 kt until the engines are shut down';

/** A-ICE CTL SYS FAULT, inhibited in flight phases 3 to 6, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_6_9_10 =
  'a new alert is not shown from take-off power to 400 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** A-ICE ICE DET FAULT, inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on the take-off roll to 1,500 ft, nor from 800 ft on approach until the ' +
  'landing roll is below 80 kt';

/** Alert keys of the engine anti-ice valve alerts, per engine */
const engineValveClosedAlertId = (engine: number): string => String(300800009 + engine);
const engineValveOpenAlertId = (engine: number): string => String(300800013 + engine);
const engineValveMonitoringAlertId = (engine: number): string => String(300800029 + engine);
const CONTROL_SYSTEM_FAULT_ALERT_ID = '300800029';
const ICE_DETECTOR_FAULT_ALERT_ID = '300800034';

/** AIR ENG n BLEED OFF (key 211800052 to 055), raised by the pushbutton OFF line of the wing valve open procedure */
const bleedOffAlertId = (engine: number): string => String(211800051 + engine);

const LIMITATION_AVOID_ICING = 'AVOID ICING CONDs';

const ANTI_ICE_PANEL = 'Overhead ANTI ICE panel';

const AVOID_ICING_PFD_BULLET = {
  where: 'PFD',
  text: `${LIMITATION_AVOID_ICING} is shown as a limitation, only while the alert is shown.`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Wing anti-ice valves
// ---------------------------------------------------------------------------------------------------------------------

const WING_ANTI_ICE_DESCRIPTION =
  'Hot bleed air keeps slat 4, the only deiced part of the leading edge, free of ice. Each wing has two redundant ' +
  'valves: AICU 1 controls the outer valves and AICU 2 the inner ones. The valves are electrically controlled and ' +
  'pneumatically actuated, and they close if they lose their electrical supply. The WING ANTI ICE pushbutton ON ' +
  'opens all four; on the ground they open for 30 s only, then the system is inhibited for 10 min, and it is also ' +
  'inhibited during take-off until the thrust reduction.';

const sideOf = (wing: number): string => (wing === 1 ? 'L' : 'R');
const sideNameOf = (wing: number): string => (wing === 1 ? 'left' : 'right');
/** The two engines whose bleed ducts feed the wing */
const wingEngines = (wing: number): [number, number] => (wing === 1 ? [1, 2] : [3, 4]);
const wingClosedAlertId = (wing: number): string => String(300800017 + wing);
const wingOpenAlertId = (wing: number): string => String(300800019 + wing);
const wingPressHiAlertId = (wing: number): string => String(300800021 + wing);
const wingPressLoAlertId = (wing: number): string => String(300800023 + wing);

const WING_ANTI_ICE_FAULT_LIGHT_ENDS =
  'It is a single light for both wings and it is lit by a valve position disagreement or a low pressure, not by a high pressure.';

const WingValvesStuckClosedFamily: FailureDetailFamily = {
  ids: [A380Failure.LeftWingAntiIceValvesStuckClosed, A380Failure.RightWingAntiIceValvesStuckClosed],
  detail: (wing): FailureDetail => {
    const side = sideNameOf(wing);
    const [firstEngine, secondEngine] = wingEngines(wing);
    return {
      whatItIs: WING_ANTI_ICE_DESCRIPTION,
      impact: [
        `Both the inner and the outer wing anti-ice valve of the ${side} wing stay closed whatever the AICUs command, so slat 4 of the ${side} wing gets no hot air.`,
        `The ${sideNameOf(3 - wing)} wing is not affected.`,
        'Nothing shows with the WING ANTI ICE pushbutton OFF, because the valves are then commanded closed anyway.',
        'With the pushbutton ON the crew is told to switch it OFF and to avoid icing conditions.',
      ],
      alertIds: [wingClosedAlertId(wing), wingPressLoAlertId(wing)],
      effects: [
        {
          where: ANTI_ICE_PANEL,
          text:
            'The FAULT light of the WING ANTI ICE pushbutton comes on once the valves are commanded open and stay ' +
            `closed, with enough bleed pressure on the ${side} side. ${WING_ANTI_ICE_FAULT_LIGHT_ENDS} It goes out ` +
            'when the pushbutton is set OFF. On the ground the valves are commanded open for 30 s only, so the check ' +
            'is made only then.',
        },
        {
          where: 'E/WD',
          text:
            `A-ICE ${sideOf(wing)} WING VLV CLOSED, ${CAUTION}, about 5 s after the valves are commanded open and ` +
            `stay closed while the bleed ducts of engines ${firstEngine} and ${secondEngine} give more than 10 psi ` +
            `above ambient; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_12}. Its lines are WING A-ICE OFF and ${LIMITATION_AVOID_ICING}. ` +
            'Setting the pushbutton OFF ends the alert; on the ground it also goes once the 30 s test ends and the ' +
            'valves are no longer commanded open.',
        },
        {
          where: 'E/WD',
          text:
            `A-ICE ${sideOf(wing)} WING VLV PRESS LO, ${CAUTION}, instead of VLV CLOSED, about 5 s after the valves ` +
            `are commanded open while the higher of the engine ${firstEngine} and ${secondEngine} bleed duct ` +
            'pressures is 10 psi or less above ambient (on the ground it also goes once the 30 s test ends). On the ground its lines are WING A-ICE OFF and ' +
            `${LIMITATION_AVOID_ICING}; in flight THRUST INCREASE, then IF NOT SUCCESSFUL : WING A-ICE OFF and ` +
            `${LIMITATION_AVOID_ICING}. ${NOT_SHOWN_PHASES_1_3_TO_7_9_10_12}.`,
        },
        {
          where: 'SD BLEED',
          text:
            'The page is called up when either alert first appears, unless another page was selected. With VLV CLOSED ' +
            `the WING A-ICE legend of the ${side} wing turns amber and has no triangle; with PRESS LO it is amber with ` +
            'an amber triangle.',
        },
        {
          where: 'SD STATUS',
          text:
            `INOP SYS WING A-ICE and the limitation ${LIMITATION_AVOID_ICING}: with VLV CLOSED while the alert is ` +
            'shown; with PRESS LO on the ground, or in flight once IF NOT SUCCESSFUL is validated.',
        },
        AVOID_ICING_PFD_BULLET,
      ],
      notSimulated: [
        'Ice building up on slat 4 of the unprotected wing and its effect on lift are not modelled by the aircraft systems.',
      ],
      logbook: { required: true, reason: `A-ICE ${sideOf(wing)} WING VLV caution and WING ANTI ICE FAULT light` },
      clearing: `${MAINTENANCE_ONLY} Setting the WING ANTI ICE pushbutton OFF ends the alert and the FAULT light, but the ${side} wing stays unprotected.`,
    };
  },
};

const WingOuterValveStuckOpenFamily: FailureDetailFamily = {
  ids: [A380Failure.LeftWingAntiIceOuterValveStuckOpen, A380Failure.RightWingAntiIceOuterValveStuckOpen],
  detail: (wing): FailureDetail => {
    const side = sideNameOf(wing);
    const [firstEngine, secondEngine] = wingEngines(wing);
    const pack = wing;
    const groundLines =
      `X BLEED CLOSE, PACK ${pack} OFF, ENG ${firstEngine} BLEED OFF, ENG ${secondEngine} BLEED OFF, ` +
      `${wing === 1 ? 'APU BLEED OFF, ' : ''}and before take-off BLEEDS/ PACK/ WING A-ICE AVAIL IN FLT`;
    const flightLines = `ENG ${firstEngine} BLEED ON, ENG ${secondEngine} BLEED ON, PACK ${pack} ON, X BLEED AUTO`;
    return {
      whatItIs: WING_ANTI_ICE_DESCRIPTION,
      impact: [
        `The outer wing anti-ice valve of the ${side} wing stays open whatever the AICU 1 commands, while the inner valve works normally.`,
        `Hot air reaches slat 4 of the ${side} wing even with the WING ANTI ICE pushbutton OFF, and the open valve no longer regulates the pressure.`,
      ],
      alertIds: [
        wingOpenAlertId(wing),
        wingPressHiAlertId(wing),
        bleedOffAlertId(firstEngine),
        bleedOffAlertId(secondEngine),
      ],
      effects: [
        {
          where: ANTI_ICE_PANEL,
          text:
            'The FAULT light of the WING ANTI ICE pushbutton comes on as soon as the valve is open while the AICUs ' +
            'do not command it: pushbutton OFF, the 10 min ground inhibition after the 30 s test, or the take-off ' +
            `inhibition. ${WING_ANTI_ICE_FAULT_LIGHT_ENDS} With the pushbutton ON and the valves commanded open it ` +
            'stays off.',
        },
        {
          where: 'E/WD',
          text:
            `A-ICE ${sideOf(wing)} WING VLV OPEN, ${CAUTION}, about 5 s after the valve is open while it is not ` +
            `commanded open; ${NOT_SHOWN_PHASES_3_TO_7_AND_10}. On the ground its lines are ${groundLines}; in flight ` +
            `${flightLines}.`,
        },
        {
          where: 'E/WD',
          text:
            `AIR ENG ${firstEngine} BLEED OFF and AIR ENG ${secondEngine} BLEED OFF, ${CAUTION} each, when the ` +
            'ground procedure sets the engine bleed pushbutton OFF with that engine running; a new alert is not shown ' +
            'from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is below 80 kt. ' +
            'Each calls up the SD BLEED page and lists the INOP SYS ENG BLEED of that engine on the SD STATUS.',
        },
        bleedSupplyLegend('WAI', `the outer wing anti-ice valve of the ${side} wing`),
        {
          where: 'E/WD',
          text:
            `A-ICE ${sideOf(wing)} WING VLV PRESS HI, ${ADVISORY}, about 5 s after a downstream sensor, with the pushbutton ON, ` +
            `reads more than about 30 psi above ambient, which the unregulated open valve passes when the ${side} ` +
            `bleed duct pressure is that high; no lines; ${NOT_SHOWN_PHASES_4_TO_7}.`,
        },
        {
          where: 'SD BLEED',
          text:
            'The page is called up when VLV OPEN first appears, unless another page was selected. The WING A-ICE ' +
            `legend of the ${side} wing is amber with an amber triangle, also with PRESS HI (which does not call the ` +
            'page up).',
        },
      ],
      notSimulated: [
        'The overheating of slat 4 that the ground procedure guards against is not modelled, and the air the open valve passes is not taken out of the pneumatic system.',
      ],
      logbook: { required: true, reason: `A-ICE ${sideOf(wing)} WING VLV OPEN caution and WING ANTI ICE FAULT light` },
      clearing:
        `${MAINTENANCE_ONLY} Setting the pushbutton ON ends the alert and the FAULT light while the valves are ` +
        'commanded open, but the valve still cannot be closed.',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Engine anti-ice valves
// ---------------------------------------------------------------------------------------------------------------------

const ENGINE_VALVE_DESCRIPTION =
  'Each engine has its own anti-ice system. Hot air from the high-pressure compressor flows through one anti-ice ' +
  'valve to the engine air inlet. The valve is electrically controlled and pneumatically actuated, and it opens if ' +
  'it loses its electrical supply. The ENG ANTI ICE pushbutton ON commands it open; a channel of an anti-ice control ' +
  'unit controls it and another channel monitors its position.';

/** The AICU channel (unit and channel letter) that controls the valve of each engine, then the one that monitors it */
const ENGINE_CONTROL_CHANNEL = ['AICU 2 channel A', 'AICU 1 channel A', 'AICU 2 channel B', 'AICU 1 channel B'];
const ENGINE_MONITORING_CHANNEL = ['AICU 2 channel B', 'AICU 1 channel B', 'AICU 2 channel A', 'AICU 1 channel A'];

const EngineValveStuckClosedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1AntiIceValveStuckClosed,
    A380Failure.Eng2AntiIceValveStuckClosed,
    A380Failure.Eng3AntiIceValveStuckClosed,
    A380Failure.Eng4AntiIceValveStuckClosed,
  ],
  detail: (engine): FailureDetail => ({
    whatItIs: ENGINE_VALVE_DESCRIPTION,
    impact: [
      `The engine ${engine} anti-ice valve stays closed whatever the pushbutton and ${ENGINE_CONTROL_CHANNEL[engine - 1]} command, so no hot air reaches the inlet of engine ${engine}.`,
      'Nothing shows with the pushbutton OFF, because the valve is then commanded closed anyway.',
      `With the pushbutton ON the crew is told to avoid icing conditions; the other engines are not affected.`,
    ],
    alertIds: [engineValveClosedAlertId(engine)],
    effects: [
      {
        where: ANTI_ICE_PANEL,
        text:
          `The FAULT light of the ENG ${engine} ANTI ICE pushbutton comes on as soon as the pushbutton is ON, because ` +
          'the valve stays closed (with the engine stopped it is on even with a healthy valve, since there is no air to ' +
          'open it). It goes out when the pushbutton is set OFF.',
      },
      {
        where: 'E/WD',
        text:
          `A-ICE ENG ${engine} VLV CLOSED, ${CAUTION}, about 5 s after the pushbutton is ON with the engine running ` +
          `and the valve closed; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its only line is ${LIMITATION_AVOID_ICING}. ` +
          'Setting the pushbutton OFF ends the alert; with the engine stopped only the FAULT light shows.',
      },
      {
        where: 'SD STATUS',
        text: `INOP SYS ENG ${engine} A-ICE and the limitation ${LIMITATION_AVOID_ICING}, only while the alert is shown.`,
      },
      AVOID_ICING_PFD_BULLET,
    ],
    notSimulated: [
      'Ice building up on the unprotected engine inlet and its effect on the engine are not modelled by the aircraft systems.',
    ],
    logbook: { required: true, reason: `A-ICE ENG ${engine} VLV CLOSED caution and FAULT light` },
    clearing: `${MAINTENANCE_ONLY} Setting the pushbutton OFF ends the alert, but the engine stays unprotected.`,
  }),
};

const EngineValveStuckOpenFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1AntiIceValveStuckOpen,
    A380Failure.Eng2AntiIceValveStuckOpen,
    A380Failure.Eng3AntiIceValveStuckOpen,
    A380Failure.Eng4AntiIceValveStuckOpen,
  ],
  detail: (engine): FailureDetail => ({
    whatItIs: ENGINE_VALVE_DESCRIPTION,
    impact: [
      `The engine ${engine} anti-ice valve stays open whatever the pushbutton and ${ENGINE_CONTROL_CHANNEL[engine - 1]} command, even with the engine stopped.`,
      'Nothing shows with the pushbutton ON, because the valve is then commanded open anyway.',
    ],
    alertIds: [engineValveOpenAlertId(engine)],
    effects: [
      {
        where: ANTI_ICE_PANEL,
        text:
          `The FAULT light of the ENG ${engine} ANTI ICE pushbutton comes on as soon as the pushbutton is OFF and ` +
          'the valve is open. It goes out when the pushbutton is set ON.',
      },
      {
        where: 'E/WD',
        text:
          `A-ICE ENG ${engine} VLV OPEN, ${CAUTION}, about 5 s after the pushbutton is OFF with the valve open; no ` +
          `lines; ${NOT_SHOWN_PHASES_1_AND_3_TO_7_AND_9_TO_12}. Setting the pushbutton ON ends the alert.`,
      },
      bleedSupplyLegend('NAI', `the engine ${engine} anti-ice valve`),
    ],
    notSimulated: [
      'The extra bleed the open valve takes from the HP compressor and the heating of the nacelle are not modelled by the aircraft systems.',
    ],
    logbook: { required: true, reason: `A-ICE ENG ${engine} VLV OPEN caution and FAULT light` },
    clearing: `${MAINTENANCE_ONLY} Setting the pushbutton ON ends the alert, but the engine anti-ice then stays on.`,
  }),
};

const EngineValveMonitoringFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1AntiIceValveMonitoring,
    A380Failure.Eng2AntiIceValveMonitoring,
    A380Failure.Eng3AntiIceValveMonitoring,
    A380Failure.Eng4AntiIceValveMonitoring,
  ],
  detail: (engine): FailureDetail => ({
    whatItIs:
      `${ENGINE_VALVE_DESCRIPTION} The position of the engine ${engine} valve is monitored by ` +
      `${ENGINE_MONITORING_CHANNEL[engine - 1]}.`,
    impact: [
      `The engine ${engine} anti-ice valve is no longer monitored; it still follows the pushbutton and its control channel.`,
      `A valve that does not follow the pushbutton can no longer raise A-ICE ENG ${engine} VLV CLOSED or VLV OPEN.`,
      'The crew is told to avoid icing conditions.',
    ],
    alertIds: [engineValveMonitoringAlertId(engine)],
    effects: [
      {
        where: ANTI_ICE_PANEL,
        text: `The FAULT light of the ENG ${engine} ANTI ICE pushbutton comes on at once and stays on whatever the pushbutton position.`,
      },
      {
        where: 'E/WD',
        text:
          `A-ICE ENG ${engine} VLV MONITORING FAULT, ${CAUTION}, at once; its only line is ` +
          `${LIMITATION_AVOID_ICING}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      {
        where: 'SD STATUS',
        text: `INOP SYS ENG ${engine} A-ICE MONITORING and the limitation ${LIMITATION_AVOID_ICING}, only while the alert is shown.`,
      },
      AVOID_ICING_PFD_BULLET,
    ],
    logbook: { required: true, reason: `A-ICE ENG ${engine} VLV MONITORING FAULT caution and FAULT light` },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Anti-ice control units
// ---------------------------------------------------------------------------------------------------------------------

const AICU_DESCRIPTION =
  'The ice protection is run by two anti-ice control units (AICUs), each with a channel A and a channel B. In each ' +
  'system one channel controls and another monitors: AICU 1 controls the outer wing anti-ice valves and AICU 2 the ' +
  'inner ones, the engine valves are split between the units, and channel B of each unit also controls and monitors ' +
  'the cockpit windows on its side (AICU 1 the Captain side, AICU 2 the First Officer side).';

interface AicuChannelRoles {
  /** AICU number, 1 or 2 */
  aicu: number;
  channel: 'A' | 'B';
  /** The engine whose anti-ice valve the channel controls, and the one it monitors */
  controlledEngine: number;
  monitoredEngine: number;
}

const aicuChannelDetail = (roles: AicuChannelRoles): FailureDetail => {
  const { aicu, channel, controlledEngine, monitoredEngine } = roles;
  const name = `AICU ${aicu} channel ${channel}`;
  const isChannelA = channel === 'A';
  const windowSide = aicu === 1 ? 'L' : 'R';
  const windowSideName = aicu === 1 ? 'Captain' : 'First Officer';
  const controlledName = isChannelA
    ? `the ${aicu === 1 ? 'outer' : 'inner'} wing anti-ice valves and the engine ${controlledEngine} anti-ice valve`
    : `the engine ${controlledEngine} anti-ice valve and the ${windowSideName} side window heating`;
  const monitoredName = isChannelA
    ? `the engine ${monitoredEngine} anti-ice valve`
    : `the wing anti-ice valves (with channel B of the other unit), the engine ${monitoredEngine} anti-ice valve, and the ${windowSideName} side window heating`;

  const effects: FailureDetail['effects'][number][] = [
    {
      where: 'E/WD',
      text:
        `A-ICE CTL SYS FAULT, ${CAUTION}, at once; lines CHANNEL ${aicu}${channel} and ENG ${monitoredEngine} ` +
        'A-ICE FAULT, then about 5 s later IF AICU CHANNEL FAILED > 5 S : ' +
        `${LIMITATION_AVOID_ICING}; ${NOT_SHOWN_PHASES_3_TO_6_9_10}.`,
    },
    {
      where: 'E/WD',
      text:
        `A-ICE ENG ${monitoredEngine} VLV MONITORING FAULT, ${CAUTION}, at once: the channel no longer monitors the ` +
        `engine ${monitoredEngine} valve; its only line is ${LIMITATION_AVOID_ICING}; ${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
    },
    {
      where: 'E/WD',
      text:
        `A-ICE ENG ${controlledEngine} VLV OPEN, ${CAUTION}, about 5 s after the engine ${controlledEngine} ` +
        'pushbutton is OFF with the engine running: without its control channel the valve opens whatever the ' +
        `pushbutton says. No lines; ${NOT_SHOWN_PHASES_1_AND_3_TO_7_AND_9_TO_12}. Setting the pushbutton ON ends it.`,
    },
    bleedSupplyLegend('NAI', `the engine ${controlledEngine} anti-ice valve (engine running)`),
    {
      where: ANTI_ICE_PANEL,
      text:
        `The FAULT light of the ENG ${monitoredEngine} ANTI ICE pushbutton comes on at once (monitoring lost). The ` +
        `FAULT light of the ENG ${controlledEngine} pushbutton comes on with its pushbutton OFF and the engine ` +
        'running (valve open).',
    },
    {
      where: 'SD STATUS',
      text:
        `INOP SYS ENG ${monitoredEngine} A-ICE and ENG ${monitoredEngine} A-ICE MONITORING` +
        `${isChannelA ? '' : `, and ${windowSide} WINDSHIELD HEATG, ${windowSide} SLIDG WINDOW HEATG and ${windowSide} FIXED WINDOW HEATG`}, ` +
        `with the limitation ${LIMITATION_AVOID_ICING} (after about 5 s for CTL SYS FAULT), only while the alerts are shown.`,
    },
    AVOID_ICING_PFD_BULLET,
  ];

  const impact = [
    `${name} controls ${controlledName}, and monitors ${monitoredName}.`,
    `The engine ${monitoredEngine} valve is no longer monitored and the engine ${controlledEngine} valve opens without a command, as it does when its control is lost.`,
  ];
  if (isChannelA) {
    impact.push(
      `The ${aicu === 1 ? 'outer' : 'inner'} wing valves close and are not commanded, while the other valves of each wing still open: wing anti-ice keeps working and raises no alert.`,
      `With channel A of the other unit also lost, the wing anti-ice is lost, with a landing limitation and a deferred approach procedure.`,
    );
  } else {
    impact.push(
      `The ${windowSideName} side windshield, sliding window and fixed window are no longer commanded to heat and no longer monitored, so none of their heating fault alerts can show.`,
      `Wing anti-ice monitoring continues through channel B of the other unit; with both channels B lost the warning system treats the wing anti-ice as lost (a landing limitation and a deferred approach procedure), although the valves still open and only their monitoring is gone.`,
    );
  }

  return {
    whatItIs: AICU_DESCRIPTION,
    impact,
    alertIds: [
      CONTROL_SYSTEM_FAULT_ALERT_ID,
      engineValveMonitoringAlertId(monitoredEngine),
      engineValveOpenAlertId(controlledEngine),
    ],
    effects,
    notSimulated: isChannelA
      ? ['The hot air that the opened engine valve lets through is not drawn from the engine.']
      : [
          'Fogging or ice on the cockpit windows is not modelled; only the alerts and STATUS lines show the lost heating.',
        ],
    logbook: { required: true, reason: `A-ICE CTL SYS FAULT caution and engine anti-ice alerts` },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Ice detectors
// ---------------------------------------------------------------------------------------------------------------------

const IceDetectorFamily: FailureDetailFamily = {
  ids: [A380Failure.IceDetector1, A380Failure.IceDetector2],
  detail: (detector): FailureDetail => {
    const other = 3 - detector;
    return {
      whatItIs:
        'An ice detector has a probe outside the boundary layer that senses ice building up. There is one on each side ' +
        'of the fuselage. Either detector reporting icing raises the ice alerts, and the probe heats itself to clear ' +
        'the ice and keep detecting.',
      impact: [
        `Ice detector ${detector} is lost; ice detector ${other} still detects ice, so nothing changes for the crew.`,
        `With ice detector ${other} also lost, the aircraft has no ice detection: the ICE DETECTED and SEVERE ICE DETECTED alerts and the ICE NOT DETECTED memo can no longer appear.`,
      ],
      alertIds: [ICE_DETECTOR_FAULT_ALERT_ID],
      effects: [
        {
          where: 'E/WD',
          text:
            `Detector ${detector} alone gives no indication. With both detectors lost, A-ICE ICE DET FAULT, ` +
            `${CAUTION}, at once; its only line is A-ICE AS RQRD; ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
        },
        { where: 'SD STATUS', text: 'With both detectors lost, INOP SYS ICE DET, only while the alert is shown.' },
      ],
      logbook: { required: false, reason: 'no indication to report while the other detector works' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata30AntiIceEntries: Record<number, FailureDetail> = {
  [A380Failure.Aicu1ChannelA]: aicuChannelDetail({ aicu: 1, channel: 'A', controlledEngine: 2, monitoredEngine: 4 }),
  [A380Failure.Aicu1ChannelB]: aicuChannelDetail({ aicu: 1, channel: 'B', controlledEngine: 4, monitoredEngine: 2 }),
  [A380Failure.Aicu2ChannelA]: aicuChannelDetail({ aicu: 2, channel: 'A', controlledEngine: 1, monitoredEngine: 3 }),
  [A380Failure.Aicu2ChannelB]: aicuChannelDetail({ aicu: 2, channel: 'B', controlledEngine: 3, monitoredEngine: 1 }),
};

export const Ata30AntiIceFamilies: FailureDetailFamily[] = [
  WingValvesStuckClosedFamily,
  WingOuterValveStuckOpenFamily,
  EngineValveStuckClosedFamily,
  EngineValveStuckOpenFamily,
  EngineValveMonitoringFamily,
  IceDetectorFamily,
];
