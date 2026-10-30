// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'amber caution with master caution and single chime';
const ADVISORY = 'amber advisory without master caution or chime';

const SD_FUEL_CALL_UP =
  'The page comes up with the alert when it is the first one on the E/WD and no page is selected.';

/** The phases (1, 2, 8 and 12) in which FQDC 1(2) FAULT and FQMS 1(2) FAULT are shown */
const FQDC_FQMS_ALERT_PHASES =
  'shown with the engines off, with the first engine started, in flight above 1,500 ft down to 800 ft (climb, ' +
  'cruise and descent above 800 ft) and with the engines shut down; not from the second engine at take-off power ' +
  'up to 1,500 ft, on approach, at touch down or at or below 80 kt after landing; once shown it stays when the ' +
  'phase changes';

/** The phases (1, 2, 8, 11 and 12) in which FQI FAULT, GAUGING FAULT and WINGS MAN BALANCING PROCEDURE are shown */
const FQI_ALERT_PHASES =
  'shown with the engines off, with the first engine started, in flight above 1,500 ft down to 800 ft (climb, ' +
  'cruise and descent above 800 ft), at or below 80 kt after landing and with the engines shut down; not from the ' +
  'second engine at take-off power up to 1,500 ft, on approach or at touch down; once shown it stays when the ' +
  'phase changes';

/** The phases (1, 2, 3, 8, 11 and 12) in which FQMS 1+2 FAULT is shown */
const FQMS_12_ALERT_PHASES =
  'shown with the engines off, with the first engine started, with the second engine at take-off power below 80 ' +
  'kt, in flight above 1,500 ft down to 800 ft (climb, cruise and descent above 800 ft), at or below 80 kt after ' +
  'landing and with the engines shut down; not from 80 kt on the take-off roll up to 1,500 ft, on approach or at ' +
  'touch down; once shown it stays when the phase changes';

/** The phases (1, 2 and 12) in which SYS COMPONENT FAULT is shown */
const GROUND_ONLY_ALERT_PHASES =
  'shown only on the ground, with the engines off, with the first engine started or with the engines shut down; ' +
  'once shown it stays when the phase changes';

/** The phase (8) in which MAN XFR PROCEDURE is shown */
const CRUISE_ONLY_ALERT_PHASES =
  'shown only in flight above 1,500 ft down to 800 ft (climb, cruise and descent above 800 ft); once shown it ' +
  'stays when the phase changes';

const FQDC_FAULT_ALERTS = ['281800043', '281800044'] as const;
const FQMS_FAULT_ALERTS = ['281800046', '281800047'] as const;
const FQI_FAULT_ALERT = '281800045';
const FQMS_12_FAULT_ALERT = '281800048';
const GAUGING_FAULT_ALERT = '281800049';
const SYS_COMPONENT_FAULT_ALERT = '281800085';
const MAN_XFR_PROCEDURE_ALERT = '281800074';
const WINGS_MAN_BALANCING_ALERT = '281800099';
const TRIM_TK_XFR_FAULT_ALERT = '281800094';

/** The alerts that follow the manual transfer requirement of the FQMS */
const MANUAL_TRANSFER_ALERTS = [MAN_XFR_PROCEDURE_ALERT, WINGS_MAN_BALANCING_ALERT] as const;

const PROBES_EXPLANATION =
  'Fuel quantity indication (FQI) probes are spread through every fuel tank. They tell the fuel quantity management ' +
  'system (FQMS) the fuel level at several points, from which it computes the quantity of each tank. The FQMS ' +
  'computes the fuel on board from the tank quantities and, with the zero fuel weight and CG entered in the FMS, ' +
  'the gross weight and its CG.';

const MANUAL_TRANSFER_EFFECTS: SeenEffect[] = [
  {
    where: 'E/WD',
    text:
      `FUEL MAN XFR PROCEDURE, ${CAUTION}, because the transfers must now be made by hand. It is ` +
      `${CRUISE_ONLY_ALERT_PHASES}. It lists the next manual transfer, from the inner tanks to the trim tank, and adds ` +
      'JETTISON to the inoperative systems and FUEL XFR : MAN ONLY to the information on the STATUS page.',
  },
  {
    where: 'E/WD',
    text:
      `FUEL WINGS MAN BALANCING PROCEDURE, ${CAUTION}, when a pair of symmetrical tanks (feed 1 and 4, feed 2 and 3, ` +
      `inner, mid or outer) gets out of balance while the transfers are manual. It is ${FQI_ALERT_PHASES}. It adds ` +
      'the information FUEL CONSUMPT INCRSD : FMS PRED DISREGARD and TKs BALANCING : ONE PAIR AT A TIME, and on the ' +
      'ground the limitation DELAY T.O.',
  },
];

const MANUAL_TRANSFER_IMPACT =
  'The FQMS can no longer decide the fuel transfers: the automatic transfers stop and the crew transfers by hand.';
const MANUAL_TRANSFER_LATCH =
  'Once the automatic transfers have stopped in flight, they stay stopped until landing, even if the failure is restored; on the ground they come back with it.';

const FQI_FAULT_FEED_LINES =
  'LAND ANSA, NO FQI AVAIL with INR TKs NOT USABLE, MID TKs NOT USABLE, TRIM TK NOT USABLE and USE TRIM TK XFR FOR ' +
  'CG IF NECESSARY, then OUTR TKs PMPs OFF and OUTR TK XFR MAN';

const FQI_FAULT_STATUS_LINES =
  'INOP SYS: JETTISON, FUEL LEAK DET and CG MANAGEMENT, plus AUTO REFUEL and FUEL AUTO GND XFR while fewer than two ' +
  'engines run. INFO: FOB COMPUTED FROM FU and, in flight, GWCG FROM WBBC and GW FROM WBBC';

const FQI_FAULT_FEED_STATUS_LINES =
  'With the quantities of all four feed tanks lost, the limitations INR TKs NOT USABLE, MID TKs NOT USABLE and ' +
  'TRIM TK NOT USABLE are added, with LAND ANSA on the PFD, and the information USE TRIM TK XFR FOR CG IF NECESSARY.';

/** The inoperative systems and the information that the INOP-style functions are listed with */
const NOT_SWITCHED_OFF =
  'JETTISON, FUEL LEAK DET and CG MANAGEMENT are listed as inoperative, but the fuel jettison and the leak detection keep working.';

const JETTISON_NOT_SWITCHED_OFF = 'JETTISON is listed as inoperative, but the fuel jettison keeps working.';

/** The CG of the weight and balance backup computer, as the FMS takes it when the FQMS gives none */
const WBBC_CG_ON_MFD =
  'After engine start the CG on FUEL & LOAD comes from the weight and balance backup computer, once it computes one (in flight after the slats and flaps retract, until they extend again).';

const PITCH_TRIM_BOX_HIDDEN =
  'On the ground, with an engine running and hydraulic pressure, the magenta GW CG box of the pitch trim scale is hidden.';

const MANUAL_TRANSFER_RESTORE =
  'Transfer pushbuttons the crew set to MAN and crossfeed pushbuttons set for the balancing stay where they are.';

/**
 * The effects of the loss of the monitoring of the quantities (FQMS 1+2 FAULT), whichever way it happens.
 * @param cause both FQMS failed, both FQDCs failed, or both alternate gauging processors failed
 * @returns the effects
 */
function monitoringLostEffects(cause: 'fqms' | 'fqdc' | 'agp'): SeenEffect[] {
  const alternateGaugingLine =
    cause === 'fqms' ? ', ALTN GAUGING ONLY while at least one alternate gauging processor works' : '';
  const fqdcStatusLine =
    cause === 'agp'
      ? ', and FQDC 1+2 because both alternate gauging processors are lost'
      : cause === 'fqdc'
        ? ', and FQDC 1+2'
        : ' (and FQDC 1+2 too when both alternate gauging processors are lost as well)';
  const effects: SeenEffect[] = [
    {
      where: 'E/WD',
      text:
        `FUEL FQMS 1+2 FAULT, ${CAUTION}. It is ${FQMS_12_ALERT_PHASES}. It replaces FQDC 1(2) FAULT and ` +
        'FQMS 1(2) FAULT. The procedure asks for FQMS 1 and 2 to be reset one by one, then shows LOSS OF FUEL XFR ' +
        `INDICATIONS${alternateGaugingLine}, FOB COMPUTED FROM FU, FUEL XFR : MAN ONLY and, in flight, GW FROM WBBC and ` +
        'GWCG FROM WBBC.',
    },
    {
      where: 'SD STATUS',
      text:
        `INOP SYS: FQMS 1+2 and JETTISON${fqdcStatusLine}; for approach and landing also CAT 2 and GLS AUTOLAND. ` +
        'INFO: FOB COMPUTED FROM FU, FUEL XFR : MAN ONLY, LOSS OF FUEL XFR INDICATIONS and, in flight, GWCG FROM WBBC ' +
        'and GW FROM WBBC. Only while the alert is shown.',
    },
    ...MANUAL_TRANSFER_EFFECTS,
  ];
  if (cause === 'fqms') {
    effects.push(
      {
        where: 'SD FUEL',
        text:
          `${SD_FUEL_CALL_UP} The tank quantities come from the alternate gauging (FQDC 1, or FQDC 2 when FQDC 1 is ` +
          'lost), each with its last two digits replaced by amber dashes. All the pump symbols show not running, ' +
          'whether or not the pumps run, as the pump states come through the FQMS.',
      },
      {
        where: 'SD',
        text: 'In the permanent data at the bottom of every SD page, GW, GWCG and FOB are replaced by amber crosses (XX).',
      },
      {
        where: 'MFD',
        text: `After engine start FUEL & LOAD has no FOB and no GW. ${WBBC_CG_ON_MFD}`,
      },
      {
        where: 'PFD',
        text: PITCH_TRIM_BOX_HIDDEN,
      },
    );
  } else if (cause === 'fqdc') {
    effects.push(
      {
        where: 'E/WD',
        text:
          `FUEL FQI FAULT, ${CAUTION}, as the quantities of all tanks are lost. It is ${FQI_ALERT_PHASES}. Its lines ` +
          `are FUEL XFR : MAN ONLY, FOB COMPUTED FROM FU, in flight GWCG FROM WBBC and GW FROM WBBC, then ` +
          `${FQI_FAULT_FEED_LINES}.`,
      },
      {
        where: 'SD STATUS',
        text: `${FQI_FAULT_STATUS_LINES}, FUEL XFR : MAN ONLY. ${FQI_FAULT_FEED_STATUS_LINES} Only while the alert is shown.`,
      },
      {
        where: 'SD FUEL',
        text:
          `${SD_FUEL_CALL_UP} Every tank quantity is replaced by amber crosses (XX), and all the pump symbols show ` +
          'not running, whether or not the pumps run.',
      },
      {
        where: 'SD',
        text: 'In the permanent data at the bottom of every SD page, FOB is replaced by amber crosses (XX); GW and GWCG show cyan dashes.',
      },
      {
        where: 'MFD',
        text: `After engine start FUEL & LOAD has no FOB and no GW. ${WBBC_CG_ON_MFD}`,
      },
      {
        where: 'PFD',
        text: PITCH_TRIM_BOX_HIDDEN,
      },
    );
  } else {
    effects.push({
      where: 'SD FUEL',
      text: `${SD_FUEL_CALL_UP} The tank quantities stay normal: the FQMS still measures, only its check against the alternate gauging is gone.`,
    });
    effects.push({
      where: 'SD',
      text: 'In the permanent data at the bottom of every SD page, GW, GWCG and FOB stay normal.',
    });
  }
  return effects;
}

// ---------------------------------------------------------------------------------------------------------------------
// FQDC 1 and 2
// ---------------------------------------------------------------------------------------------------------------------

const FqdcFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelFqdc1, A380Failure.FuelFqdc2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two fuel quantity data concentrators (FQDC) collect the level, density and temperature readings of the ' +
      'sensors in the fuel tanks and pass them to the FQMS. Each one also holds an alternate gauging processor that ' +
      'computes the tank quantities a second time, to check the FQMS and to serve as a back-up display.',
    impact: [
      `FQDC ${number} is lost together with its alternate gauging processor; the other FQDC keeps passing the tank data to the FQMS.`,
      'The tank quantities, fuel on board, gross weight and CG stay as they were.',
      'Losing the second FQDC too (or the alternate gauging processor of the other one) leaves the FQMS without tank data or without its check.',
    ],
    alertIds: [FQDC_FAULT_ALERTS[number - 1], FQMS_12_FAULT_ALERT, FQI_FAULT_ALERT, ...MANUAL_TRANSFER_ALERTS],
    effects: [
      {
        where: 'E/WD',
        text: `FUEL FQDC ${number} FAULT, ${ADVISORY}, with no procedure line. It is ${FQDC_FQMS_ALERT_PHASES}. It is hidden when FQMS 1+2 FAULT is shown, and it does not show when both FQDCs are lost.`,
      },
      {
        where: 'SD FUEL',
        text: `${SD_FUEL_CALL_UP} Nothing else changes on the page.`,
      },
      {
        where: 'E/WD',
        text: 'With the other FQDC lost too, or its alternate gauging processor lost, the alerts below replace it.',
      },
      ...monitoringLostEffects('fqdc'),
    ],
    notSimulated: [
      NOT_SWITCHED_OFF,
      'With both FQDCs lost, the real aircraft computes the fuel on board from the fuel used; here it is amber crosses.',
    ],
    logbook: { required: true, reason: 'ECAM advisory and a fuel data concentrator lost' },
    clearing: `${MAINTENANCE_ONLY} ${MANUAL_TRANSFER_LATCH} ${MANUAL_TRANSFER_RESTORE}`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// FQMS 1 and 2
// ---------------------------------------------------------------------------------------------------------------------

const FqmsFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelFqms1, A380Failure.FuelFqms2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two fuel quantity management systems (FQMS) compute the tank quantities, the fuel on board and, from the ' +
      'zero fuel weight and CG entered in the FMS, the gross weight and its CG. They also manage the fuel transfers, ' +
      'the refuel, the jettison and the fault detection for the E/WD. One FQMS is active, the other in standby.',
    impact: [
      `FQMS ${number} is lost; the other FQMS keeps measuring, so the tank quantities, fuel on board, gross weight and CG stay normal.`,
      'The loss of the second FQMS too turns the quantities on the FUEL page to the less accurate alternate gauging and the transfers to manual.',
    ],
    alertIds: [FQMS_FAULT_ALERTS[number - 1], TRIM_TK_XFR_FAULT_ALERT, FQMS_12_FAULT_ALERT, ...MANUAL_TRANSFER_ALERTS],
    effects: [
      {
        where: 'E/WD',
        text: `FUEL FQMS ${number} FAULT, ${ADVISORY}. It is ${FQDC_FQMS_ALERT_PHASES}. Its only line, FQMS ${number} RESET, cannot be done. It is hidden when FQMS 1+2 FAULT is shown.`,
      },
      {
        where: 'SD FUEL',
        text: `${SD_FUEL_CALL_UP} Nothing else changes on the page.`,
      },
      {
        where: 'E/WD',
        text:
          `With one FQMS lost, FUEL TRIM TK XFR FAULT, ${CAUTION}, also shows from a CG above 48.5 % MAC when the ` +
          `FQMS CG is valid (above 49.5 % with both FQMS working). It is ${FQI_ALERT_PHASES}. It adds CG MANAGEMENT ` +
          'to the inoperative systems on the STATUS page and, on the ground, the limitation DELAY T.O.',
      },
      {
        where: 'E/WD',
        text: 'With the other FQMS lost too, the alerts below replace FQMS 1(2) FAULT.',
      },
      ...monitoringLostEffects('fqms'),
    ],
    notSimulated: [
      'The FQMS reset is not simulated: the RESET lines of the alerts stay pending and only Restore brings the FQMS back.',
      JETTISON_NOT_SWITCHED_OFF,
      'With both FQMS lost, the real aircraft keeps the pump indications on the FUEL page and shows FOB (from the fuel used), GW and GWCG (from the backup computer) with amber dashes; here the pumps show not running and the values are amber crosses.',
    ],
    logbook: { required: true, reason: 'ECAM advisory and a fuel management computer lost' },
    clearing: `${MAINTENANCE_ONLY} After both FQMS were lost, their outputs return about 30 s after one is available again. ${MANUAL_TRANSFER_LATCH} ${MANUAL_TRANSFER_RESTORE}`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Alternate gauging processors
// ---------------------------------------------------------------------------------------------------------------------

const AlternateGaugingFamily: FailureDetailFamily = {
  ids: [A380Failure.FuelFqdc1AlternateGauging, A380Failure.FuelFqdc2AlternateGauging],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each fuel quantity data concentrator holds an alternate gauging processor (AGP). It computes the tank ' +
      'quantities independently from the same tank sensors. The FQMS compares them with its own quantities, and they ' +
      'are shown on the FUEL page when both FQMS fail, less accurate, with amber dashes.',
    impact: [
      `The alternate gauging processor of FQDC ${number} is lost, but the FQDC itself still passes the tank data to the FQMS.`,
      'The tank quantities, fuel on board, gross weight and CG stay as they were.',
      'With the alternate gauging processor of the other FQDC lost too, the FQMS can no longer check its quantities.',
    ],
    alertIds: [SYS_COMPONENT_FAULT_ALERT, FQMS_12_FAULT_ALERT, ...MANUAL_TRANSFER_ALERTS],
    effects: [
      {
        where: 'E/WD',
        text: `FUEL SYS COMPONENT FAULT, ${ADVISORY}, with the line FQDC ${number} AGP FAULT. It is ${GROUND_ONLY_ALERT_PHASES}. It does not show when both alternate gauging processors are lost.`,
      },
      {
        where: 'SD FUEL',
        text: `${SD_FUEL_CALL_UP} Nothing else changes on the page.`,
      },
      {
        where: 'E/WD',
        text: 'With the alternate gauging processor of the other FQDC lost too, the alerts below replace it.',
      },
      ...monitoringLostEffects('agp'),
    ],
    notSimulated: [
      'The FQMS does not declare itself faulty when its quantities disagree with the alternate gauging; the check is not simulated.',
      JETTISON_NOT_SWITCHED_OFF,
    ],
    logbook: { required: true, reason: 'ECAM advisory on the ground and a back-up gauging lost' },
    clearing: `${MAINTENANCE_ONLY} ${MANUAL_TRANSFER_LATCH} ${MANUAL_TRANSFER_RESTORE}`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Quantity indication lost
// ---------------------------------------------------------------------------------------------------------------------

const WING_TANKS = [
  { name: 'left outer', opposite: 'right outer' },
  { name: 'right outer', opposite: 'left outer' },
  { name: 'left mid', opposite: 'right mid' },
  { name: 'right mid', opposite: 'left mid' },
  { name: 'left inner', opposite: 'right inner' },
  { name: 'right inner', opposite: 'left inner' },
] as const;

/**
 * The effects the E/WD and the status page show for a lost tank quantity
 * @param manualTransfer whether the lost quantity makes the transfers manual (a feed tank)
 * @returns the effects of the FQI FAULT alert
 */
function fqiFaultEffects(manualTransfer: boolean): SeenEffect[] {
  const manualOnly = manualTransfer ? 'FUEL XFR : MAN ONLY, ' : '';
  return [
    {
      where: 'E/WD',
      text:
        `FUEL FQI FAULT, ${CAUTION}. It is ${FQI_ALERT_PHASES}. Its lines are ${manualOnly}FOB COMPUTED FROM FU and, ` +
        'in flight, GWCG FROM WBBC and GW FROM WBBC.',
    },
    {
      where: 'SD STATUS',
      text: `${FQI_FAULT_STATUS_LINES}${manualTransfer ? ', FUEL XFR : MAN ONLY' : ''}. Only while the alert is shown.`,
    },
  ];
}

const FeedTankFqiLostFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelFeedTank1FqiLost,
    A380Failure.FuelFeedTank2FqiLost,
    A380Failure.FuelFeedTank3FqiLost,
    A380Failure.FuelFeedTank4FqiLost,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${PROBES_EXPLANATION} Feed tank ${number} is the tank that supplies engine ${number}, kept topped up from the ` +
      'other tanks by the fuel transfers.',
    impact: [
      `The quantity of feed tank ${number} is lost to the FQMS and to the alternate gauging; the fuel in the tank is unchanged.`,
      'The fuel on board and the gross weight no longer include the tank and read low; the CG cannot be computed.',
      MANUAL_TRANSFER_IMPACT,
    ],
    alertIds: [FQI_FAULT_ALERT, ...MANUAL_TRANSFER_ALERTS],
    effects: [
      ...fqiFaultEffects(true),
      {
        where: 'E/WD',
        text: `With the quantities of all four feed tanks lost, FQI FAULT adds ${FQI_FAULT_FEED_LINES}.`,
      },
      {
        where: 'SD STATUS',
        text: FQI_FAULT_FEED_STATUS_LINES,
      },
      {
        where: 'SD FUEL',
        text: `${SD_FUEL_CALL_UP} The quantity of feed tank ${number} is replaced by amber crosses (XX); the other tanks are unchanged.`,
      },
      {
        where: 'SD',
        text: 'In the permanent data at the bottom of every SD page, FOB and GW stay green, without the tank; GWCG shows cyan dashes.',
      },
      {
        where: 'MFD',
        text: WBBC_CG_ON_MFD,
      },
      {
        where: 'PFD',
        text: PITCH_TRIM_BOX_HIDDEN,
      },
      ...MANUAL_TRANSFER_EFFECTS,
    ],
    notSimulated: [
      'The real aircraft computes the fuel on board from the departure value and the fuel used, shown with amber dashes, and shows GW and GWCG with amber dashes; here the total simply leaves the tank out and looks normal.',
      'With the quantities of more than one tank lost, the real aircraft also raises FQMS 1+2 FAULT; here that needs both FQMS, both FQDCs or both alternate gauging processors.',
      NOT_SWITCHED_OFF,
    ],
    logbook: { required: true, reason: 'ECAM caution and a tank quantity lost' },
    clearing: `${MAINTENANCE_ONLY} ${MANUAL_TRANSFER_LATCH} ${MANUAL_TRANSFER_RESTORE}`,
  }),
};

const WingTankFqiLostFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelLeftOuterTankFqiLost,
    A380Failure.FuelRightOuterTankFqiLost,
    A380Failure.FuelLeftMidTankFqiLost,
    A380Failure.FuelRightMidTankFqiLost,
    A380Failure.FuelLeftInnerTankFqiLost,
    A380Failure.FuelRightInnerTankFqiLost,
  ],
  detail: (number): FailureDetail => {
    const { name, opposite } = WING_TANKS[number - 1];
    return {
      whatItIs: PROBES_EXPLANATION,
      impact: [
        `The quantity of the ${name} tank is lost to the FQMS and to the alternate gauging; the fuel in the tank is unchanged.`,
        `The FQMS takes the quantity of the ${opposite} tank for the lost one, so the fuel on board, gross weight and CG stay valid, as good as the two sides are balanced.`,
        'The automatic transfers stay available.',
      ],
      alertIds: [FQI_FAULT_ALERT],
      effects: [
        ...fqiFaultEffects(false),
        {
          where: 'SD FUEL',
          text: `${SD_FUEL_CALL_UP} The quantity of the ${name} tank is replaced by amber crosses (XX); the other tanks are unchanged.`,
        },
        {
          where: 'SD',
          text: 'In the permanent data at the bottom of every SD page, FOB, GW and GWCG stay green.',
        },
      ],
      notSimulated: [
        'After the fourth engine start the real aircraft may show FOB, GW and GWCG with amber dashes; here they stay green.',
        NOT_SWITCHED_OFF,
      ],
      logbook: { required: true, reason: 'ECAM caution and a tank quantity lost' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const TrimTankFqiLostEntry: FailureDetail = {
  whatItIs: `${PROBES_EXPLANATION} The trim tank is the tail tank that moves fuel forward and aft to adjust the CG.`,
  impact: [
    'The quantity of the trim tank is lost to the FQMS and to the alternate gauging; the fuel in the tank is unchanged.',
    'The FQMS counts the trim tank as empty: the fuel on board and the gross weight read low, and the CG cannot be computed.',
    'The main transfers stay automatic, but the CG control transfer to and from the trim tank can no longer start or stop, and an automatic ground transfer stops in fault.',
  ],
  alertIds: [FQI_FAULT_ALERT],
  effects: [
    ...fqiFaultEffects(false),
    {
      where: 'SD FUEL',
      text: `${SD_FUEL_CALL_UP} The quantity of the trim tank is replaced by amber crosses (XX); the other tanks are unchanged.`,
    },
    {
      where: 'SD',
      text: 'In the permanent data at the bottom of every SD page, FOB and GW stay green, without the tank; GWCG shows cyan dashes.',
    },
    {
      where: 'MFD',
      text: WBBC_CG_ON_MFD,
    },
    {
      where: 'PFD',
      text: PITCH_TRIM_BOX_HIDDEN,
    },
  ],
  notSimulated: [
    'The real aircraft computes the fuel on board from the departure value and the fuel used, shown with amber dashes, and shows GW and GWCG with amber dashes; here the total simply leaves the tank out and looks normal.',
    NOT_SWITCHED_OFF,
  ],
  logbook: { required: true, reason: 'ECAM caution and a tank quantity lost' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// Gauging degraded
// ---------------------------------------------------------------------------------------------------------------------

/** In the order of the failure ids */
const GAUGING_TANK_NAMES = [
  'left outer',
  'feed 1',
  'left mid',
  'left inner',
  'feed 2',
  'feed 3',
  'right inner',
  'right mid',
  'feed 4',
  'right outer',
  'trim',
] as const;

const GaugingDegradedFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FuelLeftOuterTankGaugingDegraded,
    A380Failure.FuelFeedTank1GaugingDegraded,
    A380Failure.FuelLeftMidTankGaugingDegraded,
    A380Failure.FuelLeftInnerTankGaugingDegraded,
    A380Failure.FuelFeedTank2GaugingDegraded,
    A380Failure.FuelFeedTank3GaugingDegraded,
    A380Failure.FuelRightInnerTankGaugingDegraded,
    A380Failure.FuelRightMidTankGaugingDegraded,
    A380Failure.FuelFeedTank4GaugingDegraded,
    A380Failure.FuelRightOuterTankGaugingDegraded,
    A380Failure.FuelTrimTankGaugingDegraded,
  ],
  detail: (number): FailureDetail => {
    const tank = GAUGING_TANK_NAMES[number - 1];
    return {
      whatItIs: `${PROBES_EXPLANATION} When some probes of a tank fail, the FQMS can still compute its quantity, but less accurately.`,
      impact: [
        `The gauging of the ${tank} tank is degraded: its quantity is flagged as less accurate.`,
        'The quantity itself, the fuel on board, the gross weight, the CG and the transfers are not changed.',
      ],
      alertIds: [GAUGING_FAULT_ALERT],
      effects: [
        {
          where: 'E/WD',
          text:
            `FUEL GAUGING FAULT, ${CAUTION}. It is ${FQI_ALERT_PHASES}. On the ground it shows the line GAUGING ` +
            'MEDIUM DEGRADATION; in flight it has no line. It does not show for a tank whose quantity is lost too.',
        },
        {
          where: 'SD STATUS',
          text: 'INOP SYS: FUEL LEAK DET, and on the ground also AUTO REFUEL and FUEL AUTO GND XFR. Only while the alert is shown.',
        },
        {
          where: 'SD FUEL',
          text: `${SD_FUEL_CALL_UP} The quantity of the ${tank} tank is shown without its last two digits, which are replaced by amber dashes.`,
        },
      ],
      notSimulated: [
        'The size of the error is not simulated, and neither are the low and high degradation levels: only the medium one exists.',
        'FOB, GW and GWCG do not turn to amber dashes as on the real aircraft.',
        'FUEL LEAK DET, AUTO REFUEL and FUEL AUTO GND XFR are listed as inoperative but keep working.',
      ],
      logbook: { required: true, reason: 'ECAM caution and a less accurate tank quantity' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata28GaugingEntries: Record<number, FailureDetail> = {
  // Own entry: the trim tank is counted as empty and its CG moment is missing, unlike a wing tank
  [A380Failure.FuelTrimTankFqiLost]: TrimTankFqiLostEntry,
};

export const Ata28GaugingFamilies: FailureDetailFamily[] = [
  FqdcFamily,
  FqmsFamily,
  AlternateGaugingFamily,
  FeedTankFqiLostFamily,
  WingTankFqiLostFamily,
  GaugingDegradedFamily,
];
