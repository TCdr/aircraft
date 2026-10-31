// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

const ALREADY_SHOWN_STAYS = 'an alert already shown stays when the phase changes';

/** Alerts inhibited in flight phases 4, 5, 6, 9 and 10 (NAV IR FAULT), on top of the engines-off condition */
const NOT_SHOWN_PHASES_4_TO_6_9_10 =
  'it is not raised with the engines off; a new alert is not shown from 80 kt on take-off to 400 ft, nor from 800 ft ' +
  'on approach until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 (F/CTL ALTN LAW and DIRECT LAW), with the engines running */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'it needs an engine running; a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on ' +
  'approach until the landing roll is below 80 kt';

/** The autopilot disengages when the PRIMs can no longer offer the law that it needs */
const AP_OFF_BULLET: SeenEffect = {
  where: 'E/WD',
  text:
    'An engaged autopilot disengages: AUTO FLT AP OFF, a red warning with master warning and the cavalry charge, with no ' +
    'phase inhibition; it has no lines and can be cancelled.',
};

/** Alerts inhibited in flight phases 4, 5 and 10 (NAV GPS FAULT) */
const NOT_SHOWN_PHASES_4_5_10 =
  'a new alert is not shown on the take-off roll from 80 kt, nor on the landing roll above 80 kt';

/** Alerts inhibited in flight phases 3 to 7 (NAV LS, ILS, FLS and GLS FAULT) */
const NOT_SHOWN_PHASES_3_TO_7 = 'a new alert is not shown from take-off power to 1,500 ft';

/** Alerts inhibited in flight phases 2 to 11 (NAV RA SYS A, B or C FAULT) */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert is shown only on the ground with the engines off, before the first engine start or after shutdown';

/** Alerts inhibited in flight phases 3 to 7, 10 and 11 (NAV RA SYS A+B, A+C and B+C FAULT) */
const NOT_SHOWN_PHASES_3_TO_7_10_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until engine shutdown';

/** Alerts inhibited in flight phases 3 to 7 and 10 (NAV RA SYS A+B+C FAULT) */
const NOT_SHOWN_PHASES_3_TO_7_AND_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor on the landing roll above 80 kt';

/** Alerts inhibited in flight phases 1, 3 to 7 and 10 to 12 (SURV REACTIVE W/S DET FAULT) */
const NOT_SHOWN_PHASES_1_3_TO_7_AND_10_TO_12 =
  'a new alert is shown only on the ground with an engine running before take-off power, and in flight from 1,500 ft ' +
  'after take-off until touch down';

// ---------------------------------------------------------------------------------------------------------------
// IR 1, 2 and 3
// ---------------------------------------------------------------------------------------------------------------

/**
 * The IR failure alert ids by IR, the single alert, then the pair alerts that contain the IR (IR 1+2, IR 1+3, IR 2+3).
 */
const IR_ALERT_IDS = [
  ['340800040', '340800042', '340800043'],
  ['340800041', '340800042', '340800044'],
  ['340800072', '340800043', '340800044'],
];

const IR_PFD_SOURCE = [
  'The captain PFD takes its attitude, heading, track and ground speed from IR 1 (from IR 3 with the ATT HDG selector on CAPT ON 3).',
  'The first officer PFD takes its attitude, heading, track and ground speed from IR 2 (from IR 3 with the ATT HDG selector on F/O ON 3).',
  'IR 3 supplies a PFD only when the ATT HDG selector sends it to the captain or first officer side.',
];

const IR_SINGLE_STATUS = [
  'IR 1 is listed as inoperative in all phases; until the ATT HDG selector is on CAPT ON 3, TCAS 1, WXR 1, TERR SYS 1 and ADS-B RPTG 1 are listed too.',
  'IR 2 is listed as inoperative in all phases; until the ATT HDG selector is on F/O ON 3, TCAS 2, WXR 2, TERR SYS 2 and ADS-B RPTG 2 are listed too.',
  'IR 3 is listed as inoperative in all phases.',
];

const IR_SINGLE_LINES = [
  'The lines are ATT HDG SWTG : CAPT ON 3 and IR 1 P/B : OFF.',
  'The lines are ATT HDG SWTG : F/O ON 3 and IR 2 P/B : OFF.',
  'The lines are ATT HDG SWTG : NORM and IR 3 P/B : OFF.',
];

const IR_PAIR_TEXT =
  'IR 1+2 FAULT and IR 2+3 FAULT carry the lines ATT HDG SWTG, WXR & TAWS, XPDR & TCAS and the two IR P/B : OFF; IR 1+3 FAULT also lists STANDBY NAV IN TRUE GPS TRK. ' +
  'Their STATUS lists F/CTL PROT, the two IRs and the surveillance functions that stay on a failed IR, with the INFO ALTN LAW : PROT LOST; IR 1+3 and IR 2+3 add AP and FD of the affected side, IR 1+3 also STANDBY NAV IN TRUE GPS TRK.';

const irDetail = (ir: number): FailureDetail => {
  const [single, firstPair, secondPair] = IR_ALERT_IDS[ir - 1];
  const others = [1, 2, 3].filter((n) => n !== ir);
  return {
    whatItIs:
      'Each air data and inertial reference unit has an inertial reference part (IR) that gives attitude, heading, track, ' +
      'ground speed and position. Three units serve the two PFDs, the flight controls and the FMS, and the ATT HDG ' +
      'selector sends IR 3 to the captain or first officer side when one of them fails.',
    impact: [
      `IR ${ir} gives no valid attitude, heading, track, position or ground speed; the air data part of the same unit is not affected.`,
      IR_PFD_SOURCE[ir - 1],
      `With IR ${others[0]} or IR ${others[1]} also lost, the PRIMs lose the gyro redundancy: two lost IRs limit the pitch law to alternate law 1B, and three lost leave only direct law.`,
      'With all three IRs lost the reactive windshear detection is lost too.',
    ],
    alertIds: [single, firstPair, secondPair, '271800008', '271800009', '220800001', '341800043'],
    effects: [
      {
        where: 'E/WD',
        text:
          `NAV IR ${ir} FAULT, ${CAUTION}, while the IR is failed and no other IR is; ${NOT_SHOWN_PHASES_4_TO_6_9_10}; ${ALREADY_SHOWN_STAYS}. ` +
          `${IR_SINGLE_LINES[ir - 1]}`,
      },
      {
        where: 'SD STATUS',
        text: `While NAV IR ${ir} FAULT is shown: ${IR_SINGLE_STATUS[ir - 1]}`,
      },
      {
        where: 'E/WD',
        text:
          `With IR ${others[0]} or IR ${others[1]} also failed the alert becomes NAV IR ${Math.min(ir, others[0])}+${Math.max(ir, others[0])} FAULT or NAV IR ${Math.min(ir, others[1])}+${Math.max(ir, others[1])} FAULT, ` +
          `${CAUTION}, with the same phases (all three pairs show together when all three IRs fail, there is no triple alert). ${IR_PAIR_TEXT}`,
      },
      {
        where: 'E/WD',
        text:
          `With two IRs failed, F/CTL ALTN LAW (PROT LOST), ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ${ALREADY_SHOWN_STAYS}. The line is ` +
          'MAX SPEED : 310 KT and the INFO is ALTN LAW : PROT LOST. With all three IRs failed, F/CTL DIRECT LAW, ' +
          `${CAUTION}, with the same phases and the lines MAX SPEED : 310/.86 and MANEUVER WITH CARE.`,
      },
      {
        ...AP_OFF_BULLET,
        text: `With two or three IRs failed, ${AP_OFF_BULLET.text.charAt(0).toLowerCase()}${AP_OFF_BULLET.text.slice(1)}`,
      },
      {
        where: 'PFD',
        text: 'The PFD fed by the failed IR shows the red ATT and HDG flags until the ATT HDG selector sends it to the working IR.',
      },
      {
        where: 'Overhead ADIRS panel',
        text: `The IR ${ir} pb-sw FAULT light comes on steady (it also stays on when the pb-sw is set OFF).`,
      },
      {
        where: 'E/WD',
        text:
          `With all three IRs failed, SURV REACTIVE W/S DET FAULT, ${ADVISORY}, with no aural; ${NOT_SHOWN_PHASES_1_3_TO_7_AND_10_TO_12}; ${ALREADY_SHOWN_STAYS}. ` +
          'It is not shown while NAV RA SYS A+B+C FAULT, NAV ADR 1+2+3 FAULT, ALL AIR DATA DISAGREE or AOA DISAGREE is shown. The STATUS lists REACTIVE W/S DET for approach and landing.',
      },
    ],
    notSimulated: [
      'The ATT mode, in which a failed IR could still give attitude, is not simulated: the lines about it are not shown.',
    ],
    logbook: { required: true, reason: 'caution, IR fault light and lost inertial data' },
    clearing: `${MAINTENANCE_ONLY} The IR gives valid data again; the ATT HDG selector and IR pb-sw stay where the crew put them.`,
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Radio altimeters
// ---------------------------------------------------------------------------------------------------------------

/** The RA SYS FAULT alerts that contain each system: the single alert, then the three dual alerts and the triple one */
const RA_ALERT_IDS = [
  ['340800053', '340800059', '340800060', '340800062'],
  ['340800054', '340800059', '340800061', '340800062'],
  ['340800055', '340800060', '340800061', '340800062'],
];

const RA_NAMES = ['A', 'B', 'C'];

/** The AC bus that powers each radio altimeter as the alert reads it */
const RA_BUSES = ['AC 2', 'AC 4', 'AC ESS'];

const RA_HEIGHT_VOTE =
  'Both PFDs show the same radio height, the median of the three radio altimeters when all three are usable, the average of two, or the remaining one.';

const raFaultEffects = (ra: number): SeenEffect[] => {
  const name = RA_NAMES[ra - 1];
  const dualNames = ['A+B', 'A+C', 'B+C'].filter((pair) => pair.indexOf(name) >= 0);
  return [
    {
      where: 'E/WD',
      text:
        `NAV RA SYS ${name} FAULT, ${ADVISORY}, while the radio altimeter is failed and the ${RA_BUSES[ra - 1]} busbar is powered; ` +
        `${NOT_SHOWN_PHASES_2_TO_11}; ${ALREADY_SHOWN_STAYS}. It has no lines and adds no STATUS line.`,
    },
    {
      where: 'E/WD',
      text:
        `With a second radio altimeter failed, NAV RA SYS ${dualNames[0]} FAULT or NAV RA SYS ${dualNames[1]} FAULT, ${CAUTION}, ` +
        `when both busbars are powered; ${NOT_SHOWN_PHASES_3_TO_7_10_11}; ${ALREADY_SHOWN_STAYS}. They have no lines; the STATUS lists the ` +
        'failed pair as inoperative for approach and landing.',
    },
    {
      where: 'E/WD',
      text:
        `With all three failed, NAV RA SYS A+B+C FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_3_TO_7_AND_10}; ${ALREADY_SHOWN_STAYS}. ` +
        'The lines are APPR MODE NOT AVAIL, LOC MODE AVAIL ONLY and L/G DN & AP OFF : USE MAN PITCH TRIM, already shown as done.',
    },
    {
      where: 'SD STATUS',
      text:
        'With RA SYS A+B+C FAULT shown, TCAS 1+2, GPWS 1+2 and PRED W/S 1+2 are listed as inoperative in all phases, and RA SYS A+B+C, ' +
        'AUTO CALLOUT, GLS AUTOLAND and REACTIVE W/S DET for approach and landing; the INFO lines are AD/FD APPR MODE NOT AVAIL, ' +
        'LOC MODE AVAIL ONLY and WHEN L/G DOWN AND AP OFF: USE MAN PITCH TRIM.',
    },
  ];
};

const radioAltimeterDetail = (ra: number): FailureDetail => {
  const name = RA_NAMES[ra - 1];
  const [single, firstDual, secondDual, triple] = RA_ALERT_IDS[ra - 1];
  return {
    whatItIs:
      `The radio altimeter system ${name} measures the height of the aircraft above the ground below 5,000 ft with a ` +
      'transmitting and a receiving antenna. The three systems feed the PFDs, the flight controls, the automatic ' +
      'callouts and the ground proximity functions.',
    impact: [
      `Radio altimeter ${name} fails and gives no valid height; the other two keep measuring.`,
      RA_HEIGHT_VOTE,
      'With all three failed there is no radio height at all: no automatic callouts, and with the gear down and no autopilot the PRIM pitch law goes to alternate law 1A.',
    ],
    alertIds: [single, firstDual, secondDual, triple, '271800008', '220800001'],
    effects: [
      ...raFaultEffects(ra),
      {
        where: 'E/WD',
        text:
          `With all three failed, the gear down and no autopilot, F/CTL ALTN LAW (PROT LOST), ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}; ` +
          `${ALREADY_SHOWN_STAYS}. In alternate law 1A its MAX SPEED line is not shown; the INFO is ALTN LAW : PROT LOST.`,
      },
      {
        ...AP_OFF_BULLET,
        text:
          'With all three failed and LAND armed, or G/S or LAND active, an engaged autopilot disengages: AUTO FLT AP OFF, a red ' +
          'warning with master warning and the cavalry charge, with no phase inhibition; it has no lines and can be cancelled.',
      },
      {
        where: 'PFD',
        text: 'The radio height follows the vote of the usable systems. With all three failed a red RA flag replaces it (it blinks for 9 s below the transition altitude).',
      },
    ],
    logbook: { required: true, reason: 'radio altimeter fault alert and lost height data' },
    clearing: `${MAINTENANCE_ONLY} The radio altimeter restarts with a self-test of about 4 to 6 s before it gives height again.`,
  };
};

const antennaInterruptedDetail = (ra: number): FailureDetail => {
  const name = RA_NAMES[ra - 1];
  return {
    whatItIs:
      `The radio altimeter ${name} measures the height with a transmitting and a receiving antenna, each joined to the ` +
      'transceiver by a cable. The signal that goes from one antenna to the ground and back gives the height.',
    impact: [
      `A cable of radio altimeter ${name} is interrupted: no signal comes back, so it gives no computed data with the maximum height (8,192 ft) at any real height.`,
      'The PFD vote leaves this system out, as it does a failed one; the system itself is not reported failed.',
      'No alert is raised, because the warning system only reacts to a failed system.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'PFD',
        text: `${RA_HEIGHT_VOTE} A system without computed data is not used; with all three in this state the radio height is not shown.`,
      },
      { where: 'E/WD', text: 'No NAV RA SYS alert and no STATUS line: the failure is not reported.' },
    ],
    logbook: { required: false, reason: 'no alert; the system drops out of the PFD radio height vote' },
    clearing: MAINTENANCE_ONLY,
  };
};

const antennaDirectCouplingDetail = (ra: number): FailureDetail => {
  const name = RA_NAMES[ra - 1];
  return {
    whatItIs:
      `The radio altimeter ${name} measures the height with a transmitting and a receiving antenna. The signal is ` +
      'expected to reflect off the ground; a direct path between the two antennas would give a false, very low height.',
    impact: [
      `Radio altimeter ${name} measures through a direct path between its antennas: it reads about minus ${12 + ra} ft at any real height, with a normal sign status.`,
      'The PFD vote still uses it: with all three systems the median hides it, with only two usable the average is wrong by half the height.',
      'No alert is raised, because the warning system only reacts to a failed system.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'PFD',
        text: `${RA_HEIGHT_VOTE} A system reading about minus ${12 + ra} ft is counted as usable, so the shown height is wrong when another system is lost.`,
      },
      { where: 'E/WD', text: 'No NAV RA SYS alert and no STATUS line: the failure is not reported.' },
    ],
    logbook: { required: false, reason: 'no alert; the wrong height shows only when a second system is lost' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------
// GPS 1 and 2
// ---------------------------------------------------------------------------------------------------------------

const GPS_STATUS = ['GPS 1 is listed as inoperative in all phases.', 'GPS 2 is listed as inoperative in all phases.'];

const gpsRestartClearing =
  `${MAINTENANCE_ONLY} The receiver restarts with a self-test, an initialisation and the acquisition of the satellites, ` +
  'about 20 to 40 s with the satellite data kept, before its data are valid again.';

const GPS_BOTH_LOST_EFFECTS: SeenEffect[] = [
  {
    where: 'E/WD',
    text:
      `With both receivers failed, NAV GPS 1+2 FAULT replaces them, ${CAUTION}; ${NOT_SHOWN_PHASES_4_5_10}; ${ALREADY_SHOWN_STAYS}. ` +
      'The STATUS lists GPS 1+2 as inoperative in all phases, and BTV and ROW/ROP for approach and landing.',
  },
  {
    where: 'ND',
    text: 'With both receivers lost the FMS is no longer in GPS PRIMARY: the amber NAV PRIMARY LOST message shows.',
  },
  {
    where: 'MFD',
    text: 'The POSITION MONITOR page no longer shows its GPS PRIMARY legend, and the FMS message list gets NAV PRIMARY LOST.',
  },
];

const gpsDetail = (gps: number): FailureDetail => ({
  whatItIs:
    `GPS receiver ${gps} is the satellite navigation receiver of multi-mode receiver ${gps}. Each air data and inertial ` +
    'reference unit mixes the inertial position with the position of one receiver, and the FMS needs that hybrid position ' +
    'for GPS PRIMARY.',
  impact: [
    `GPS ${gps} gives no valid position; the other receiver then supplies every inertial reference unit.`,
    'The FMS stays in GPS PRIMARY on the other receiver as long as its accuracy and integrity allow it.',
    'With both receivers lost, the hybrid position is lost, and the FMS leaves GPS PRIMARY.',
  ],
  alertIds: [gps === 1 ? '340800034' : '340800035', '340800036'],
  effects: [
    {
      where: 'E/WD',
      text:
        `NAV GPS ${gps} FAULT, ${CAUTION}, while the receiver is failed and powered and the other is not; ${NOT_SHOWN_PHASES_4_5_10}; ` +
        `${ALREADY_SHOWN_STAYS}. It has no lines. ${GPS_STATUS[gps - 1]}`,
    },
    ...GPS_BOTH_LOST_EFFECTS,
  ],
  logbook: { required: true, reason: 'GPS fault caution and lost receiver' },
  clearing: gpsRestartClearing,
});

// ---------------------------------------------------------------------------------------------------------------
// MMR 1 and 2, ILS receivers, FLS and GLS functions
// ---------------------------------------------------------------------------------------------------------------

const MMR_DESCRIPTION =
  'Each of the two multi-mode receivers (MMR) contains a landing system receiver for the ILS, the FLS and GLS ' +
  'functions and a GPS receiver. MMR 1 serves the captain side and MMR 2 the first officer side.';

const LS_STATUS = [
  'CAT 2, GLS AUTOLAND and LS 1 are listed as inoperative for approach and landing.',
  'CAT 2, GLS AUTOLAND and LS 2 are listed as inoperative for approach and landing.',
];

const ILS_STATUS = [
  'CAT 2 and ILS 1 are listed as inoperative for approach and landing.',
  'CAT 2 and ILS 2 are listed as inoperative for approach and landing.',
];

const MMR_PFD_EFFECTS: SeenEffect[][] = [
  [
    {
      where: 'PFD',
      text: 'The captain PFD loses the localiser and glideslope deviations (its receiver is switched off), and so does the autoflight, which reads the same receiver.',
    },
  ],
  [
    {
      where: 'PFD',
      text: 'The first officer PFD loses the localiser and glideslope deviations; its ident, frequency and DME stay. The autoflight, which reads receiver 1, is not affected.',
    },
  ],
];

const mmrDetail = (mmr: number): FailureDetail => {
  const lsAlert = mmr === 1 ? '340800046' : '340800047';
  const gpsAlert = mmr === 1 ? '340800034' : '340800035';
  return {
    whatItIs: `${MMR_DESCRIPTION} This is MMR ${mmr}, with its ILS ${mmr} receiver and GPS ${mmr} receiver.`,
    impact: [
      `MMR ${mmr} fails as a whole: ILS ${mmr} and GPS ${mmr} stop together; its FLS and GLS alerts are replaced by the LS alert.`,
      `The other MMR keeps its ILS and GPS; the FMS stays in GPS PRIMARY on GPS ${3 - mmr} as long as accuracy and integrity allow it.`,
    ],
    alertIds: [lsAlert, '340800048', gpsAlert, '340800036'],
    effects: [
      {
        where: 'E/WD',
        text:
          `NAV LS ${mmr} FAULT, ${CAUTION}, when MMR ${mmr} is failed and the other is not; ${NOT_SHOWN_PHASES_3_TO_7}; ` +
          `${ALREADY_SHOWN_STAYS}. It has no lines. ${LS_STATUS[mmr - 1]} NAV LS 1+2 FAULT replaces both when both MMRs are failed, ` +
          'with LS 1+2 listed as inoperative for approach and landing.',
      },
      ...MMR_PFD_EFFECTS[mmr - 1],
      {
        where: 'E/WD',
        text:
          `NAV GPS ${mmr} FAULT follows at once, as the GPS receiver of the MMR fails with it, ${CAUTION}; ${NOT_SHOWN_PHASES_4_5_10}; ` +
          `${ALREADY_SHOWN_STAYS}. GPS ${mmr} is listed as inoperative in all phases. NAV GPS 1+2 FAULT replaces both when both receivers are failed.`,
      },
      {
        where: 'E/WD',
        text: 'The NAV ILS, FLS and GLS FAULT alerts of this MMR are not raised on top: the MMR failure replaces them.',
      },
    ],
    logbook: { required: true, reason: 'LS and GPS fault cautions, lost landing system and GPS' },
    clearing: `${MAINTENANCE_ONLY} The GPS receiver restarts with a self-test and a satellite acquisition of about 20 to 40 s.`,
  };
};

const ilsReceiverDetail = (ils: number): FailureDetail => ({
  whatItIs:
    `${MMR_DESCRIPTION} The ILS ${ils} receiver of MMR ${ils} gives the localiser and glideslope deviations to the PFD and ` +
    'the autoflight.',
  impact: [
    `The ILS ${ils} receiver receives nothing: no localiser and no glideslope. The rest of MMR ${ils} (GPS, FLS, GLS) is not affected.`,
    ils === 1
      ? 'The receiver is switched off, so the captain PFD and the autoflight lose the deviations.'
      : 'The first officer PFD loses the deviations; its ident, frequency and DME stay.',
  ],
  alertIds: [ils === 1 ? '340800037' : '340800038', '340800039'],
  effects: [
    {
      where: 'E/WD',
      text:
        `NAV ILS ${ils} FAULT, ${CAUTION}, while ILS ${ils} is failed and the MMR is not; ${NOT_SHOWN_PHASES_3_TO_7}; ${ALREADY_SHOWN_STAYS}. ` +
        `It has no lines. ${ILS_STATUS[ils - 1]} NAV ILS 1+2 FAULT replaces both when both ILS receivers are failed, with ILS 1+2 ` +
        'listed as inoperative for approach and landing.',
    },
    ...MMR_PFD_EFFECTS[ils - 1],
  ],
  logbook: { required: true, reason: 'ILS fault caution and lost localiser and glideslope' },
  clearing: MAINTENANCE_ONLY,
});

const functionNotSimulated =
  'On the aircraft the guidance of that function on that side is lost; here the approach functions keep working.';

const flsDetail = (mmr: number): FailureDetail => ({
  whatItIs: `${MMR_DESCRIPTION} The FLS function of MMR ${mmr} builds the FMS landing system (FLS) beams for non-precision approaches.`,
  impact: [
    `The FLS function of MMR ${mmr} is reported lost; the rest of the MMR works normally.`,
    'The FLS capability on the PFD and the approach modes are not changed.',
  ],
  alertIds: [mmr === 1 ? '340800075' : '340800076', '340800077'],
  effects: [
    {
      where: 'E/WD',
      text:
        `NAV FLS ${mmr} FAULT, ${ADVISORY}, while the function is failed and the MMR is not; ${NOT_SHOWN_PHASES_3_TO_7}; ${ALREADY_SHOWN_STAYS}. ` +
        `It has no lines. FLS ${mmr} is listed as inoperative for approach and landing. NAV FLS 1+2 FAULT replaces both when both ` +
        'are failed, with FLS 1+2 listed as inoperative.',
    },
  ],
  notSimulated: [functionNotSimulated],
  logbook: { required: true, reason: 'FLS fault advisory' },
  clearing: MAINTENANCE_ONLY,
});

const glsDetail = (mmr: number): FailureDetail => ({
  whatItIs:
    `${MMR_DESCRIPTION} The GLS function of MMR ${mmr} receives the GBAS landing system for precision approaches and ` +
    'automatic landings.',
  impact: [
    `The GLS function of MMR ${mmr} is reported lost; the rest of the MMR works normally.`,
    'The approach modes and autoland are not changed.',
  ],
  alertIds: [mmr === 1 ? '340800030' : '340800031', '340800032'],
  effects: [
    {
      where: 'E/WD',
      text:
        `NAV GLS ${mmr} FAULT, ${ADVISORY}, while the function is failed and the MMR is not; ${NOT_SHOWN_PHASES_3_TO_7}; ${ALREADY_SHOWN_STAYS}. ` +
        `It has no lines. GLS AUTOLAND and GLS ${mmr} are listed as inoperative for approach and landing. NAV GLS 1+2 FAULT ` +
        'replaces both when both are failed, with GLS 1+2 listed as inoperative.',
    },
  ],
  notSimulated: [functionNotSimulated],
  logbook: { required: true, reason: 'GLS fault advisory' },
  clearing: MAINTENANCE_ONLY,
});

export const Ata34NavSensorsFamilies: FailureDetailFamily[] = [
  {
    ids: [A380Failure.Ir1Fault, A380Failure.Ir2Fault, A380Failure.Ir3Fault],
    detail: irDetail,
  },
  {
    ids: [A380Failure.RadioAltimeter1, A380Failure.RadioAltimeter2, A380Failure.RadioAltimeter3],
    detail: radioAltimeterDetail,
  },
  {
    ids: [
      A380Failure.RadioAntennaInterrupted1,
      A380Failure.RadioAntennaInterrupted2,
      A380Failure.RadioAntennaInterrupted3,
    ],
    detail: antennaInterruptedDetail,
  },
  {
    ids: [
      A380Failure.RadioAntennaDirectCoupling1,
      A380Failure.RadioAntennaDirectCoupling2,
      A380Failure.RadioAntennaDirectCoupling3,
    ],
    detail: antennaDirectCouplingDetail,
  },
  { ids: [A380Failure.Gps1, A380Failure.Gps2], detail: gpsDetail },
  { ids: [A380Failure.Mmr1, A380Failure.Mmr2], detail: mmrDetail },
  { ids: [A380Failure.Ils1Receiver, A380Failure.Ils2Receiver], detail: ilsReceiverDetail },
  { ids: [A380Failure.Mmr1FlsFunction, A380Failure.Mmr2FlsFunction], detail: flsDetail },
  { ids: [A380Failure.Mmr1GlsFunction, A380Failure.Mmr2GlsFunction], detail: glsDetail },
];
