// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

/** CDS ... DU FAULT, CDS ... DU NOT MONITORED, FWS n FAULT and ECP FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** AUDIO FUNCTION LOST: inhibited in flight phases 3 to 7, 10 and 11 */
const NOT_SHOWN_PHASES_3_TO_7_10_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from touch down until the engines are shut down ' +
  'after landing';

/** TAIL STRIKE DET FAULT: inhibited in flight phases 3 to 11 */
const SHOWN_ONLY_PHASES_1_2_12 =
  'a new alert is shown only on the ground with the engines off, during engine start and taxi before take-off power ' +
  'is set, and after the engines are shut down following landing';

// ---------------------------------------------------------------------------------------------------------------------
// Display units
// ---------------------------------------------------------------------------------------------------------------------

type Side = 'CAPT' | 'F/O';

interface DisplayUnitDetail {
  /** The name of the DU in the alert titles, 'CAPT PFD' */
  name: string;
  whatItIs: string;
  impact: readonly string[];
  /** The effects on the displays, after the alert bullet */
  displayEffects: readonly SeenEffect[];
  /** The line of the INOP SYS list of the SD STATUS page, null when the aircraft lists none */
  statusLine: string | null;
  /** The DUs that monitor each other, the alerts of its last working DU */
  monitoringGroup: string;
  notMonitoredAlerts: string;
  notMonitoredNone: string;
  notSimulated?: readonly string[];
  extraProcedureLine?: string;
}

const duFaultAlertId = (name: string): string => {
  switch (name) {
    case 'CAPT PFD':
      return '311800013';
    case 'CAPT ND':
      return '311800014';
    case 'CAPT MFD':
      return '311800015';
    case 'EWD':
      return '311800016';
    case 'SD':
      return '311800017';
    case 'F/O PFD':
      return '311800018';
    case 'F/O ND':
      return '311800019';
    default:
      return '311800020';
  }
};

const CAPT_GROUP = 'CAPT PFD, CAPT ND, CAPT MFD and EWD';
const FO_GROUP = 'F/O PFD, F/O ND, F/O MFD and SD';
const CAPT_GROUP_ALERTS = 'CDS CAPT PFD DU NOT MONITORED, CDS CAPT ND DU NOT MONITORED or CDS EWD DU NOT MONITORED';
const FO_GROUP_ALERTS = 'CDS F/O PFD DU NOT MONITORED or CDS F/O ND DU NOT MONITORED';

const PFD_DESCRIPTION =
  'The primary flight display shows the flight information a pilot flies by: attitude, speed, altitude, vertical ' +
  'speed, heading and the autoflight mode annunciations. Its lower part also carries the ECAM memos and limitations. ' +
  'Each pilot has one, on the display unit in front of them.';

const ND_DESCRIPTION =
  'The navigation display shows the lateral map with the flight plan, the traffic, the weather radar and the terrain, ' +
  'and the vertical display. Each pilot has one, on the display unit between their PFD and the MFD.';

const MFD_DESCRIPTION =
  'The multi-function display is the pilot interface of the flight management system (flight plan, performance, ' +
  'fuel and load), of the ATC datalink, of the surveillance controls, and of the FCU backup of the autoflight. Each ' +
  'pilot has one, driven with the keyboard and cursor control device of the KCCU.';

const EWD_DESCRIPTION =
  'The engine and warning display is the upper centre display. It shows the engine primary parameters, the flap and ' +
  'slat position, the memos, the alerts with their procedures and the checklists.';

const SD_DESCRIPTION =
  'The system display is the lower centre display. It shows the system synoptic pages selected on the ECAM control ' +
  'panel or called up by an alert, the STATUS page, and at its bottom the ATC mailbox.';

const otherSide = (side: Side): Side => (side === 'CAPT' ? 'F/O' : 'CAPT');

const pfdDetail = (side: Side): DisplayUnitDetail => ({
  name: `${side} PFD`,
  whatItIs: PFD_DESCRIPTION,
  impact: [
    `The ${side} PFD DU goes blank and the PFD moves by itself to the ${side} ND DU, so the ${side} ND is no longer shown.`,
    `The ${otherSide(side)} side is not touched, and the ${side} pilot keeps the flight information on the ND DU.`,
    'The picture of a blank DU comes back with a self test when the failure is restored.',
  ],
  displayEffects: [
    {
      where: `${side} PFD DU`,
      text: 'Blank, whatever it showed.',
    },
    {
      where: `${side} ND DU`,
      text:
        'Shows the PFD instead of the ND, with the memo and limitation area at its bottom. The ND picture, with its ' +
        'weather radar and terrain, is not shown anywhere on this side.',
    },
  ],
  statusLine: `${side} PFD DU`,
  monitoringGroup: side === 'CAPT' ? CAPT_GROUP : FO_GROUP,
  notMonitoredAlerts: side === 'CAPT' ? CAPT_GROUP_ALERTS : FO_GROUP_ALERTS,
  notMonitoredNone: side === 'CAPT' ? 'the CAPT MFD DU has none' : 'the F/O MFD DU and the SD DU have none',
  notSimulated: [
    'On the aircraft the DU RECONF pushbutton then shows the ND (or the E/WD or SD) on the MFD DU; here the MFD DU shows only the MFD, so the pushbutton changes nothing.',
  ],
});

const ndDetail = (side: Side): DisplayUnitDetail => ({
  name: `${side} ND`,
  whatItIs: ND_DESCRIPTION,
  impact: [
    `The ${side} ND DU goes blank, and nothing takes its place: the ${side} ND is lost.`,
    `The ${side} PFD stays on its own DU. The ND DU was also the DU on which the E/WD or the SD can be recalled with the DU RECONF pb.`,
    'The picture of a blank DU comes back with a self test when the failure is restored.',
  ],
  displayEffects: [
    {
      where: `${side} ND DU`,
      text: 'Blank. The weather radar and terrain picture drawn over the ND goes blank with it.',
    },
    {
      where: `${side} PFD DU`,
      text: 'Unchanged.',
    },
  ],
  statusLine: `${side} ND DU`,
  monitoringGroup: side === 'CAPT' ? CAPT_GROUP : FO_GROUP,
  notMonitoredAlerts: side === 'CAPT' ? CAPT_GROUP_ALERTS : FO_GROUP_ALERTS,
  notMonitoredNone: side === 'CAPT' ? 'the CAPT MFD DU has none' : 'the F/O MFD DU and the SD DU have none',
  notSimulated: [
    'On the aircraft the DU RECONF pushbutton can show the ND on the MFD DU; here the MFD DU shows only the MFD, so the ND cannot be brought back.',
  ],
});

const mfdDetail = (side: Side): DisplayUnitDetail => ({
  name: `${side} MFD`,
  whatItIs: MFD_DESCRIPTION,
  impact: [
    `The ${side} MFD DU goes blank: the MFD pages of the ${side} pilot (flight plan, performance, ATC, surveillance, FCU backup) can no longer be seen or used from this seat.`,
    `The ${otherSide(side)} MFD and every other display stay as they are.`,
    'The picture of a blank DU comes back with a self test when the failure is restored.',
  ],
  displayEffects: [
    {
      where: `${side} MFD DU`,
      text: 'Blank. Nothing else can be shown there.',
    },
    {
      where: `${side} ND DU`,
      text:
        `The DU RECONF pb of the ${side} side now acts on this DU: each press steps it from the ND to the E/WD, to the ` +
        'SD and back to the ND. The E/WD or the SD cannot be shown on both sides at once, so a step to the display ' +
        `the ${otherSide(side)} side already shows is skipped. The ND is not shown while it shows another display.`,
    },
  ],
  statusLine: `${side} MFD DU`,
  monitoringGroup: side === 'CAPT' ? CAPT_GROUP : FO_GROUP,
  notMonitoredAlerts: side === 'CAPT' ? CAPT_GROUP_ALERTS : FO_GROUP_ALERTS,
  notMonitoredNone: side === 'CAPT' ? 'the CAPT MFD DU has none' : 'the F/O MFD DU and the SD DU have none',
  notSimulated: [
    'On the aircraft the DU RECONF pushbutton can show the MFD on the ND DU; here the MFD of a failed MFD DU is shown nowhere.',
  ],
});

const EWD_DETAIL: DisplayUnitDetail = {
  name: 'EWD',
  whatItIs: EWD_DESCRIPTION,
  impact: [
    'The EWD DU goes blank and the E/WD moves by itself to the SD DU, so the SD pages are no longer shown on their own DU.',
    'The alerts, memos and checklists stay readable on the SD DU; the system pages and the STATUS page need the DU RECONF pb.',
    'The picture of a blank DU comes back with a self test when the failure is restored.',
  ],
  displayEffects: [
    {
      where: 'EWD DU',
      text: 'Blank.',
    },
    {
      where: 'SD DU',
      text:
        'Shows the E/WD, with its alerts, memos and procedures, and no longer the SD. The alert of the failure itself ' +
        'is read there.',
    },
    {
      where: 'F/O ND DU',
      text:
        'The DU RECONF pb is active on both sides. On the F/O side it acts on the ND DU: the first press shows the ' +
        'E/WD there, the second the SD, the third the ND again. The ATC mailbox is the bottom part of the SD, so it is ' +
        'shown nowhere until the SD is shown on an ND DU.',
    },
  ],
  statusLine: 'EWD DU',
  monitoringGroup: CAPT_GROUP,
  notMonitoredAlerts: CAPT_GROUP_ALERTS,
  notMonitoredNone: 'the CAPT MFD DU has none',
  notSimulated: [
    'On the aircraft the captain DU RECONF pushbutton can show the E/WD on the CAPT MFD DU; here that DU shows only the MFD, so the pushbutton changes nothing.',
  ],
};

const SD_DETAIL: DisplayUnitDetail = {
  name: 'SD',
  whatItIs: SD_DESCRIPTION,
  impact: [
    'The SD DU goes blank: the system pages, the STATUS page and the ATC mailbox have no DU of their own.',
    'The E/WD stays on its own DU, so the alerts and procedures stay readable.',
    'The F/O DU RECONF pb can put the SD on the F/O ND DU, which brings the mailbox with it.',
  ],
  displayEffects: [
    {
      where: 'SD DU',
      text: 'Blank. The system page an alert calls up is not shown.',
    },
    {
      where: 'F/O ND DU',
      text:
        'The DU RECONF pb is active on both sides. On the F/O side it acts on the ND DU: the first press shows the ' +
        'E/WD there, the second the SD with the ATC mailbox at its bottom, the third the ND again. While no DU shows ' +
        'the SD, a new ATC message is not marked as read.',
    },
  ],
  statusLine: null,
  monitoringGroup: FO_GROUP,
  notMonitoredAlerts: FO_GROUP_ALERTS,
  notMonitoredNone: 'the F/O MFD DU and the SD DU have none',
  extraProcedureLine: ' and, last, IF SD DU OFF : F/O RECONF FOR MAILBOX',
  notSimulated: [
    'On the aircraft the captain DU RECONF pushbutton can show the SD on the CAPT MFD DU; here that DU shows only the MFD, so the SD cannot be recalled from that side.',
  ],
};

/** Positions of the DUs in the family, in the order of the failure list */
const DISPLAY_UNIT_DETAILS: readonly DisplayUnitDetail[] = [
  pfdDetail('CAPT'),
  ndDetail('CAPT'),
  mfdDetail('CAPT'),
  EWD_DETAIL,
  SD_DETAIL,
  mfdDetail('F/O'),
  ndDetail('F/O'),
  pfdDetail('F/O'),
];

const displayUnitDetail = (number: number): FailureDetail => {
  const du = DISPLAY_UNIT_DETAILS[number - 1];
  const alertId = duFaultAlertId(du.name);
  const effects: SeenEffect[] = [
    {
      where: 'E/WD',
      text:
        `CDS ${du.name} DU FAULT, ${CAUTION}, as long as the DU is powered (a DU that lost its DC supply is blank too ` +
        `but only gets the electrical alert); ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are ${du.name} DU OFF 5 S ` +
        `THEN ON, then, NOT SUCCESSFUL, ${du.name} DU OFF, then DU RECONF P/B AVAIL${du.extraProcedureLine ?? ''}; ` +
        'the lines are not sensed and switching the DU off and on does not clear the failure.',
    },
    ...du.displayEffects,
    {
      where: 'SD STATUS',
      text:
        du.statusLine !== null
          ? `INOP SYS ${du.statusLine}, all phases, while the DU is failed and powered.`
          : 'No INOP SYS line: the aircraft lists none for the SD DU.',
    },
    {
      where: 'E/WD',
      text:
        `Only if the other DUs of its monitoring group (${du.monitoringGroup}) are lost too, the last DU still ` +
        `working shows ${du.notMonitoredAlerts}, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}; ${du.notMonitoredNone}.`,
    },
  ];
  return {
    whatItIs: du.whatItIs,
    impact: du.impact,
    alertIds: [alertId],
    effects,
    notSimulated: du.notSimulated,
    logbook: { required: true, reason: `CDS ${du.name} DU FAULT caution` },
    clearing: `${MAINTENANCE_ONLY} Switching the DU off and on with its brightness knob does not clear it.`,
  };
};

const DisplayUnitFamily: FailureDetailFamily = {
  ids: [
    A380Failure.CaptPfdDisplayUnit,
    A380Failure.CaptNdDisplayUnit,
    A380Failure.CaptMfdDisplayUnit,
    A380Failure.EwdDisplayUnit,
    A380Failure.SdDisplayUnit,
    A380Failure.FoMfdDisplayUnit,
    A380Failure.FoNdDisplayUnit,
    A380Failure.FoPfdDisplayUnit,
  ],
  detail: displayUnitDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// FWS
// ---------------------------------------------------------------------------------------------------------------------

const FWS_DESCRIPTION =
  'The aircraft has two identical flight warning systems, FWS 1 and FWS 2, each on its own CPIOM-C. They watch the ' +
  'aircraft systems, compute the alerts with their flight phase inhibitions, and produce the memos, the STATUS, the ' +
  'checklists, the aural warnings and the master lights. They work in parallel, and one alone does everything.';

const FWS_FALLBACK_LINES =
  'ECAM SD MONITOR and OVHD PNL MONITOR, with ECAM WARNINGS & CAUTIONS, ABN PROCEDURES, LIMITATIONS & STATUS, ' +
  'ALTITUDE ALERT, AUTO CALLOUT and NORM C/L & MEMO listed as functions not available';

const fwsDetail = (number: number): FailureDetail => {
  const other = 3 - number;
  const bus = number === 1 ? 'DC ESS' : 'DC 2';
  return {
    whatItIs: FWS_DESCRIPTION,
    impact: [
      `FWS ${number} stops. FWS ${other} computes everything alone, so the crew sees the alert and the STATUS line, and LAND 3 DUAL is lost.`,
      `If FWS ${other} is lost as well, the warning system is gone: no alerts, memos, STATUS, checklists, aural warnings or master lights, and the E/WD falls back to a fixed FWS 1+2 FAULT message.`,
    ],
    alertIds: [number === 1 ? '314800008' : '314800009', '314800004'],
    effects: [
      {
        where: 'E/WD',
        text:
          `FWS ${number} FAULT, ${ADVISORY}, with no procedure lines, while the ${bus} busbar is powered and FWS ` +
          `${other} still works; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          `FWS 1+2 FAULT replaces it when FWS ${other} is lost as well. It does not depend on the flight phase, but it ` +
          `is not shown on the ground at 50 kt ground speed or more. It lists ${FWS_FALLBACK_LINES}. With the second ` +
          'FWS lost the master lights go out and no aural is made. When both FCDCs are lost too, the message is the ' +
          'FWS 1+2 & FCDC 1+2 FAULT one, with the F/CTL INDICATIONS added.',
      },
      {
        where: 'SD STATUS',
        text:
          `INOP SYS FWS ${number}, all phases, while the failure is active (the busbar and the flight phase do not ` +
          'matter). INFO LAND 3 SINGLE ONLY as well, except with electrical power only and after engine shutdown. ' +
          'With both FWS lost the page reads STATUS NOT AVAILABLE instead.',
      },
      {
        where: 'PFD',
        text:
          'The landing capability on the FMA can no longer show LAND 3 DUAL; with one FWS lost LAND 3 SINGLE is the best, because the ' +
          'flight control data concentrators count the FWS with audio. With both FWS lost the lower part reads LIMITATIONS ' +
          'NOT AVAIL and MEMO NOT AVAIL.',
      },
      {
        where: 'OIT',
        text:
          `On the App & Ldg Capability page of the NSS avionics, the FWS w/ audio row no longer counts FWS ${number}: ` +
          'one is left for LAND 2 and LAND 3 SGL, and the LAND 3 DUAL box is no longer green.',
      },
    ],
    logbook: { required: true, reason: `FWS ${number} FAULT advisory` },
    clearing:
      `${MAINTENANCE_ONLY} The FWS ${number} reset switch of the overhead RESET panel holds the FWS failed too when it ` +
      'is pulled out, so it has to be pushed in as well.',
  };
};

const FwsFamily: FailureDetailFamily = {
  ids: [A380Failure.Fws1, A380Failure.Fws2],
  detail: fwsDetail,
};

const fwsAudioDetail = (number: number): FailureDetail => {
  const other = 3 - number;
  return {
    whatItIs:
      'Each flight warning system has its own audio function, which plays the aural warnings of the cockpit: the ' +
      'continuous repetitive chime, the single chime, the synthetic voices, the altitude alert and the automatic ' +
      'callouts. One audio function is enough for all of them.',
    impact: [
      `The audio function of FWS ${number} is lost. While the audio of FWS ${other} works, every sound is still played and no alert appears, but LAND 3 DUAL is lost (STATUS INFO LAND 3 SINGLE ONLY).`,
      `If the audio of FWS ${other} is lost too, the FWS plays no sound at all: no chime, no synthetic voice, no callout, no stall warning of the FWS. ROW/ROP, BTV and autoland (LAND 2) are then lost as well.`,
    ],
    alertIds: ['314800006', '341800015', '320800014'],
    effects: [
      {
        where: 'E/WD',
        text:
          `AUDIO FUNCTION LOST, an amber alert with no master caution and no chime, only when the audio of FWS ${other} ` +
          `is lost as well and the loss lasts 5 s; ${NOT_SHOWN_PHASES_3_TO_7_10_11}. Its lines are AUDIOS NOT AVAIL: ` +
          'ALTITUDE ALERT, AUTO CALLOUT and AURAL ATTENTION GETTERS.',
      },
      {
        where: 'Aural',
        text:
          'With both audio functions lost every sound being played stops and none starts, so the cautions below ' +
          'give the master light but no chime.',
      },
      {
        where: 'E/WD',
        text:
          'With both audio functions lost, SURV ROW/ROP LOST also appears, an amber caution with master caution, in flight, and on the ground while ' +
          `an engine on each side runs; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          'With both audio functions lost, BRAKES BTV FAULT also appears, an amber caution with master caution, while ' +
          'engines 2 and 3 run; a new alert is not shown from take-off power to 1,500 ft.',
      },
      {
        where: 'SD STATUS',
        text:
          'With one audio function lost: INFO LAND 3 SINGLE ONLY, except with electrical power only and after engine ' +
          'shutdown. With both lost: INOP SYS BTV and ROW/ROP (approach and landing, set by the loss itself, not only ' +
          'by the AUDIO FUNCTION LOST alert), INOP SYS AUTOLAND (approach and landing) and INFO APPR 1 ONLY, which ' +
          'replaces LAND 3 SINGLE ONLY.',
      },
      {
        where: 'PFD',
        text: 'The landing capability on the FMA can no longer show LAND 3 DUAL; with one audio function lost LAND 3 SINGLE is the best, with both lost there is no autoland capability left.',
      },
      {
        where: 'OIT',
        text:
          `On the App & Ldg Capability page of the NSS avionics, the FWS w/ audio row no longer counts FWS ${number}: ` +
          'one is left for LAND 2 and LAND 3 SGL, and the LAND 3 DUAL box is no longer green.',
      },
    ],
    logbook: { required: true, reason: 'FWS audio function lost (only visible with both lost)' },
    clearing: `${MAINTENANCE_ONLY} The sounds then play again from the queue.`,
  };
};

const FwsAudioFamily: FailureDetailFamily = {
  ids: [A380Failure.Fws1AudioFunction, A380Failure.Fws2AudioFunction],
  detail: fwsAudioDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// ECP and tail strike detector
// ---------------------------------------------------------------------------------------------------------------------

const ecpDetail: FailureDetail = {
  whatItIs:
    'The ECAM control panel on the central pedestal is the crew interface of the ECAM. Its keys select the system ' +
    'pages, the STATUS page, the checklists and the not sensed abnormal procedures, clear and recall alerts, cancel ' +
    'warnings and start the take-off configuration test.',
  impact: [
    'Part of the keys of the panel stop working: the system page keys, the video key, T.O CONFIG, RCL, RCL LAST and EMER CANC.',
    'The alerts themselves are not affected. The STATUS and ALL keys, the clear, checklist, check, arrow, abnormal procedure and MORE keys still work.',
  ],
  alertIds: ['314800007'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ECP FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are ECP KEYS NOT AVAIL: SYSTEMS, MORE, ` +
        'TO CONFIG, RCL LAST, then FOR SYS PAGES: "ALL" AVAIL (the MORE key still works here; RCL, EMER CANC and the ' +
        'video key, not named in the list, do not).',
    },
    {
      where: 'ECAM control panel',
      text:
        'Pressing a system page key or the video key does nothing, and nothing happens when T.O CONFIG, RCL, RCL ' +
        'LAST or EMER CANC is pressed: no configuration test, no recall of cleared alerts, no cancel of a warning or ' +
        'caution.',
    },
  ],
  logbook: { required: true, reason: 'ECP FAULT advisory, keys not available' },
  clearing: MAINTENANCE_ONLY,
};

const tailStrikeDetectorDetail: FailureDetail = {
  whatItIs:
    'The tail strike detection watches for a contact of the lower rear fuselage with the runway during take-off or ' +
    'landing. A detected contact raises the TAIL STRIKE alert on the E/WD, and the crew lands as soon as safely ' +
    'possible. The pitch limit shown on the PFD is a different function.',
  impact: [
    'A contact of the tail with the runway is no longer detected, so no TAIL STRIKE alert would follow it.',
    'A contact stored before the failure stays stored for the rest of the flight.',
    'No other system reads this failure, and the PFD tail strike pitch limit is not changed.',
  ],
  alertIds: ['271800072'],
  effects: [
    {
      where: 'E/WD',
      text:
        `TAIL STRIKE DET FAULT, ${ADVISORY}, with no procedure lines; ${SHOWN_ONLY_PHASES_1_2_12}. A failure in ` +
        'flight therefore shows the alert only after landing, once the engines are shut down.',
    },
    {
      where: 'SD STATUS',
      text: 'INOP SYS TAIL STRIKE DET in the approach and landing part, as soon as the failure is active (unlike the E/WD alert, it is not held back by the flight phase).',
    },
    {
      where: 'E/WD',
      text:
        'With the detector failed, the TAIL STRIKE caution (master caution, single chime, LAND ANSA) is not raised ' +
        'even at a pitch that would touch the tail; one already stored stays on the E/WD.',
    },
  ],
  logbook: { required: true, reason: 'TAIL STRIKE DET FAULT advisory' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata31DisplaysEntries: Record<number, FailureDetail> = {
  [A380Failure.FwsEcp]: ecpDetail,
  [A380Failure.TailStrikeDetector]: tailStrikeDetectorDetail,
};

export const Ata31DisplaysFamilies: FailureDetailFamily[] = [DisplayUnitFamily, FwsFamily, FwsAudioFamily];
