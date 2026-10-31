// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const RESTORE_MODULE = 'Maintenance only: use Restore. The module also needs its DC bus powered to be available.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'a caution with master caution and single chime';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.

/** Alerts inhibited from take-off power to 1,500 ft and from 800 ft on approach to the end of the landing roll */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited from take-off power through the landing roll and taxi-in */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert is not shown from take-off power through the landing roll and taxi-in, so it appears on the ground ' +
  'before take-off power or after engine shutdown';

/** Alerts inhibited from take-off power to 1,500 ft and from 800 ft on approach until engine shutdown */
const NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until engine shutdown';

const CPIOM_B_POWER_NOTE = 'while the DC bus of that CPIOM B is powered';

const STATUS_NOTE = 'while the alert is shown';

/** The phases in which FQMS 1(2) FAULT is shown */
const FQMS_ALERT_PHASES =
  'shown with the engines off, with the first engine started, in flight above 1,500 ft down to 800 ft (climb, ' +
  'cruise and descent above 800 ft) and with the engines shut down; not from the second engine at take-off power ' +
  'up to 1,500 ft, on approach, at touch down or at or below 80 kt after landing; once shown it stays when the ' +
  'phase changes';

/** The phases in which FUEL TRIM TK XFR FAULT and WINGS MAN BALANCING PROCEDURE are shown */
const FQI_ALERT_PHASES =
  'shown with the engines off, with the first engine started, in flight above 1,500 ft down to 800 ft (climb, ' +
  'cruise and descent above 800 ft), at or below 80 kt after landing and with the engines shut down; not from the ' +
  'second engine at take-off power up to 1,500 ft, on approach or at touch down; once shown it stays when the ' +
  'phase changes';

/** The phases in which FQMS 1+2 FAULT is shown */
const FQMS_12_ALERT_PHASES =
  'shown with the engines off, with the first engine started, with the second engine at take-off power below 80 ' +
  'kt, in flight above 1,500 ft down to 800 ft (climb, cruise and descent above 800 ft), at or below 80 kt after ' +
  'landing and with the engines shut down; not from 80 kt on the take-off roll up to 1,500 ft, on approach or at ' +
  'touch down; once shown it stays when the phase changes';

/** The phase in which MAN XFR PROCEDURE is shown */
const CRUISE_ONLY_ALERT_PHASES =
  'shown only in flight above 1,500 ft down to 800 ft (climb, cruise and descent above 800 ft); once shown it ' +
  'stays when the phase changes';

const SD_CALL_UP = 'The page comes up with the alert when it is the first one on the E/WD and no page is selected.';

/**
 * What the E/WD shows only if both CPIOM C are lost as well as every module of the group: the warning system is gone
 * and the E/WD lists the fallback actions of the lost groups instead of the alerts.
 * @param lines the fallback lines of this group
 * @returns the effect
 */
function fallbackEffect(lines: string): SeenEffect {
  return {
    where: 'E/WD',
    text:
      'Only if both CPIOM C are lost too, and every module of this group: the E/WD shows the fallback list FWS 1+2 & ' +
      `CPIOM FAULT instead of the alerts, with ${lines}.`,
  };
}

const CPIOM_EXPLANATION =
  'Core processing and input/output modules (CPIOM) are the computers of the integrated avionics: each hosts the ' +
  'applications of one aircraft system on shared hardware, and the modules of a group back each other up. ';

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM A: bleed air
// ---------------------------------------------------------------------------------------------------------------------

/** Crossbleed valves driven by A1+A2 (left) and by A3+A4 (center and right) and their STATUS lines */
const CROSSBLEED_OF_PAIR = [
  {
    valves: 'the left crossbleed valve',
    inop: 'L X BLEED AUTO CTL',
    modules: 'A1 and A2',
  },
  {
    valves: 'the center and right crossbleed valves',
    inop: 'CTR X BLEED AUTO CTL and R X BLEED AUTO CTL',
    modules: 'A3 and A4',
  },
] as const;

function cpiomADetail(number: number): FailureDetail {
  const pairIndex = number <= 2 ? 0 : 1;
  const pair = CROSSBLEED_OF_PAIR[pairIndex];
  const partner = number === 1 ? 'A2' : number === 2 ? 'A1' : number === 3 ? 'A4' : 'A3';
  return {
    whatItIs:
      `${CPIOM_EXPLANATION}The four CPIOM A host the bleed air monitoring and control. A1 and A2 command the left ` +
      'crossbleed valve, A3 and A4 the center and right crossbleed valves; the modules of a pair run the same logic.',
    impact: [
      `Alone, CPIOM A${number} changes nothing: ${partner} sends the command to ${pair.valves} and the crossbleed logic is unchanged.`,
      `With ${pair.modules} both lost, ${pair.valves} no longer opens or closes by itself at the AUTO position of the XBLEED selector.`,
      'The engine bleed valves and the bleed monitoring do not depend on these modules in the simulator.',
    ],
    alertIds: ['361800033'],
    effects: [
      {
        where: 'E/WD',
        text:
          `Only when ${pair.modules} are both lost: AIR XBLEED FAULT, ${CAUTION}, with the line XBLEED MAN CTL ONLY; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. A single module or one module of each pair raises nothing.`,
      },
      {
        where: 'SD BLEED',
        text: `With ${pair.modules} lost, the page comes up with the alert when no page is selected. The valve stays where it was; the XBLEED selector at OPEN or SHUT still moves it.`,
      },
      {
        where: 'SD STATUS',
        text: `With ${pair.modules} lost, ${STATUS_NOTE}: INOP SYS ${pair.inop}; INFO XBLEED MAN CTL ONLY.`,
      },
      fallbackEffect(
        'DESCENT TO FL 100/MEA, RAM AIR ON, and FUNCTIONS NOT AVAIL: ENG BLEED 1+2+3+4 / WING A-ICE (when all four CPIOM A are lost)',
      ),
    ],
    logbook: {
      required: true,
      reason: `CPIOM A${number} lost, crossbleed control lost if ${partner} is lost too`,
    },
    clearing: RESTORE_MODULE,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM B: air conditioning and pressurization
// ---------------------------------------------------------------------------------------------------------------------

const PACK_CTL_REDUNDANCY_LOST_ALERTS = ['211800007', '211800008'] as const;
const PACK_CTL_DEGRADED_ALERTS = ['211800005', '211800006'] as const;

/** The outflow valve controller each CPIOM B (1 to 4) serves with its cabin pressure application */
const OCSM_OF_CPIOM_B = [2, 4, 1, 3] as const;

function cpiomBDetail(number: number): FailureDetail {
  const pack = number % 2 === 1 ? 1 : 2;
  const partner = number <= 2 ? number + 2 : number - 2;
  const forward = number % 2 === 1;
  const ventLine = forward ? 'FWD' : 'AFT';
  const ventRedundancyAlert = forward ? '212800011' : '212800005';
  const ventDegradedAlert = forward ? '212800009' : '212800003';
  const pair = forward ? 'B1 and B3' : 'B2 and B4';
  const leadsFans = number <= 2;
  const fanNumbers = forward ? '1 and 2' : '3 and 4';
  return {
    whatItIs:
      `${CPIOM_EXPLANATION}The four CPIOM B host the air conditioning and pressurization applications: pack flow ` +
      'control, temperature control, ventilation control and cabin pressure control. ' +
      `CPIOM B${number} serves pack ${pack}, the ${forward ? 'forward' : 'aft'} ventilation and outflow valve ` +
      `controller ${OCSM_OF_CPIOM_B[number - 1]}.`,
    impact: [
      `All four applications of B${number} stop together; B${partner} still serves pack ${pack}, so alone the loss costs only redundancy.`,
      `With ${pair} both lost, pack ${pack} gets a fixed flow demand of 1 kg/s.`,
      `With ${pair} both lost, the duct temperature demand of pack ${pack} stays at the last value computed before the loss.`,
      ...(leadsFans
        ? [
            `The recirculation fans ${fanNumbers} take their speed command from B${number} first: once B${number} is lost they keep its last command if it was commanding them, and B${partner} does not take over.`,
          ]
        : []),
      'With all four lost both packs get the fixed demand, the cabin pressure control runs in backup mode, and the SD shows the air conditioning as failed.',
    ],
    alertIds: [
      PACK_CTL_REDUNDANCY_LOST_ALERTS[pack - 1],
      PACK_CTL_DEGRADED_ALERTS[pack - 1],
      '211800042',
      '211800050',
      ventRedundancyAlert,
      ventDegradedAlert,
      '213800006',
      '213800005',
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `AIR PACK ${pack} CTL REDUNDANCY LOST, COND TEMP CTL REDUNDANCY LOST and COND ${ventLine} VENT CTL REDUNDANCY LOST, ` +
          `each ${ADVISORY}, ${CPIOM_B_POWER_NOTE}; ${NOT_SHOWN_PHASES_3_TO_11}. The temperature alert is hidden when COND TEMP CTL FAULT shows.`,
      },
      {
        where: 'E/WD',
        text:
          `${pair} both lost: AIR PACK ${pack} CTL DEGRADED and COND ${ventLine} VENT CTL DEGRADED, each ${ADVISORY}, replace the two redundancy alerts; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `All four lost: COND TEMP CTL DEGRADED, ${ADVISORY}, replaces the temperature alert; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_AND_9_TO_11}.`,
      },
      {
        where: 'E/WD',
        text:
          `Two or more modules lost: CAB PRESS CTL REDUNDANCY LOST, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}. With three or more lost no outflow valve controller ` +
          'uses a computed cabin pressure target.',
      },
      {
        where: 'E/WD',
        text:
          `All four lost: CAB PRESS AUTO CTL FAULT, ${CAUTION}, replaces it; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are AUTO CTL SYS 1+2+3+4 FAULT, ` +
          'CAB PRESS IN BACKUP MODE, CAB PRESS MAN MODES : DO NOT USE, IN DES : CAB ALT REGULATED TO 7000 FT, BELOW 7000 FT : CAB ALT = ACFT ALT and ' +
          'BELOW 7000 FT : AVOID HI DES V/S. The ECAM limitations show MAN PRESS : DO NOT USE.',
      },
      {
        where: 'E/WD',
        text:
          'All four lost: the differential pressure, excess and negative pressure, residual pressure and pressure sensor alerts, and the cargo, fan, extract valve, pack bay fan and avionics ventilation ' +
          'alerts cannot be raised, as their reports fail with the lost modules.',
      },
      {
        where: 'PFD',
        text: 'All four lost: the limitation AVOID HI DESCENT V/S.',
      },
      {
        where: 'SD CAB PRESS',
        text: `The number ${number} of outflow valve ${number} turns amber. With CAB PRESS AUTO CTL FAULT the page comes up when it is the first alert and no page is selected.`,
      },
      {
        where: 'SD COND',
        text: 'All four lost: both packs are drawn amber, the hot-air valves closed, the forward and bulk extraction fans amber (off), the isolation valves closed and the bulk heater faulty.',
      },
      {
        where: 'SD BLEED',
        text: 'All four lost: both packs are drawn amber and the hot-air valves closed.',
      },
      {
        where: 'SD STATUS',
        text:
          `${STATUS_NOTE}: ${pair} lost shows PACK ${pack} CTL DEGRADED and ${ventLine} VENT CTL DEGRADED as inoperative; all four lost shows ` +
          'TEMP CTL DEGRADED.',
      },
      fallbackEffect(
        'CAB PRESS MAN MODES : DO NOT USE, the cabin altitude lines for descent, and FUNCTIONS NOT AVAIL: FWD + AFT VENT CTL / TEMP CTL (when all four CPIOM B are lost)',
      ),
    ],
    notSimulated: [
      `In the real aircraft the remaining CPIOM B take over the pack temperature demand of a lost pair (${pair}); here the demand of pack ${pack} stays at its last value.`,
      ...(leadsFans
        ? [
            `In the real aircraft B${partner} takes over the recirculation fans ${fanNumbers} when B${number} is lost; here the fans keep the last command of B${number}.`,
          ]
        : []),
    ],
    logbook: { required: true, reason: `alerts and CPIOM B${number} lost with its air conditioning applications` },
    clearing: RESTORE_MODULE,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM C: flight warning system
// ---------------------------------------------------------------------------------------------------------------------

const FWS_FAULT_ALERTS = ['314800008', '314800009'] as const;
const FWS_12_AND_FCDC_ALERT = '314800003';

function cpiomCDetail(number: number): FailureDetail {
  const other = number === 1 ? 2 : 1;
  const bus = number === 1 ? 'DC ESS' : 'DC 2';
  return {
    whatItIs:
      `${CPIOM_EXPLANATION}The two CPIOM C host the flight warning system (FWS 1 and FWS 2): the alerts, the memos, ` +
      'the limitations and the STATUS, and the aural warnings of the cockpit. The flight control data concentrators ' +
      'are hosted in the same modules.',
    impact: [
      `FWS ${number} stops; FWS ${other} keeps running everything, so only the redundancy is lost.`,
      'With both CPIOM C lost the warning system stops: no alerts, memos, limitations or STATUS on the displays.',
      'With one FWS lost the FMA cannot show CAT3 DUAL, as that capability needs both FWS audio functions.',
    ],
    alertIds: [FWS_FAULT_ALERTS[number - 1], FWS_12_AND_FCDC_ALERT],
    effects: [
      {
        where: 'E/WD',
        text: `FWS ${number} FAULT, ${ADVISORY}, while the ${bus} bus is powered; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. It has no line.`,
      },
      {
        where: 'SD STATUS',
        text: `INOP SYS: FWS ${number}, for as long as the FWS is lost, with or without the alert.`,
      },
      {
        where: 'PFD',
        text: 'The FMA approach capability cannot show CAT3 DUAL while one FWS is lost. With both lost it cannot show CAT2 or CAT3 SINGLE either.',
      },
      {
        where: 'E/WD',
        text:
          'Both CPIOM C lost: the E/WD stops listing alerts and shows CDS FWS 1+2 & FCDC 1+2 FAULT with the lines ECAM SD and ' +
          'OVHD PNL : MONITOR, then FUNCTIONS NOT AVAIL : F/CTL INDICATIONS, ECAM WARNINGS & CAUTIONS, ABN PROCEDURES, LIMITATIONS & STATUS, ' +
          'ALTITUDE ALERT, AUTO CALLOUT, NORM C/L & MEMO. It is not shown during a take-off or landing roll above 50 kt ground speed.',
      },
      {
        where: 'PFD',
        text: 'Both CPIOM C lost: the memo area shows MEMO NOT AVAIL and the limitations area shows LIMITATIONS NOT AVAIL.',
      },
      {
        where: 'SD STATUS',
        text: 'Both CPIOM C lost: the page shows STATUS NOT AVAILABLE in amber.',
      },
    ],
    notSimulated: [
      'The FCDCs run in the same modules in the real aircraft: here they keep working and no FCDC fault follows.',
    ],
    logbook: { required: true, reason: `FWS ${number} lost, advisory and loss of warning system redundancy` },
    clearing: RESTORE_MODULE,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM D: ATC and datalink
// ---------------------------------------------------------------------------------------------------------------------

const CPIOM_D_FALLBACK = fallbackEffect('ATC COM VOICE ONLY (when both CPIOM D are lost)');

const CpiomD1Detail: FailureDetail = {
  whatItIs:
    `${CPIOM_EXPLANATION}CPIOM D1 hosts the air traffic control datalink: the CPDLC and ADS connections, the ATIS ` +
    'requests and the ATC mailbox. CPIOM D3 hosts the aircraft communication router.',
  impact: [
    'The whole ATC datalink stops: every CPDLC and ADS connection and every message in the mailbox is lost.',
    'ATC communication is by voice only.',
    'The router in CPIOM D3 and the other communication functions keep working.',
  ],
  alertIds: ['460800002'],
  effects: [
    {
      where: 'E/WD',
      text:
        `COM ATC DATALINK FAULT, ${CAUTION}, with the line ATC COM VOICE ONLY; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. ` +
        'It also hides COM ADS DATALINK FAULT.',
    },
    {
      where: 'SD STATUS',
      text: `${STATUS_NOTE}: INOP SYS ATC DATALINK; LIMITATIONS ATC COM VOICE ONLY.`,
    },
    {
      where: 'SD',
      text: 'The ATC mailbox shows MAILBOX NOT AVAIL.',
    },
    {
      where: 'MFD',
      text: 'Selecting an ATC COM page with the KCCU shows ATC COM NOT AVAIL for about 5 s.',
    },
    CPIOM_D_FALLBACK,
  ],
  logbook: { required: true, reason: 'ATC datalink lost, caution and voice-only ATC communication' },
  clearing: RESTORE_MODULE,
};

const CpiomD3Detail: FailureDetail = {
  whatItIs:
    `${CPIOM_EXPLANATION}CPIOM D3 hosts the aircraft communication router (ACR), which carries the datalink messages of ` +
    'the ATC and the airline between the avionics and the VHF datalink. CPIOM D1 hosts the ATC datalink applications.',
  impact: [
    'The router stops: no datalink message is sent or received, and the datalink is reported as not available.',
    'The ATC applications in CPIOM D1 keep running, but their messages cannot leave the aircraft.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'MFD',
      text: 'A request that needs the datalink, such as a company wind request, ends with NOT TRANSMITTED TO ACR; an ATC COM request shows COM DATALINK NOT AVAIL.',
    },
    {
      where: 'E/WD',
      text: 'No alert: nothing in the warning system reads this module, and COM ATC DATALINK FAULT needs CPIOM D1.',
    },
    CPIOM_D_FALLBACK,
  ],
  logbook: { required: true, reason: 'datalink router lost, no datalink messages' },
  clearing: RESTORE_MODULE,
};

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM E: electrical
// ---------------------------------------------------------------------------------------------------------------------

function cpiomEDetail(number: number): FailureDetail {
  return {
    whatItIs:
      `${CPIOM_EXPLANATION}The two CPIOM E host the electrical system applications: the monitoring and the control ` +
      'logic of the electrical network.',
    impact: [
      `Nothing in the simulator reads CPIOM E${number}: the electrical system, its alerts and its pages do not change.`,
    ],
    alertIds: [],
    effects: [
      {
        where: 'E/WD',
        text: 'No indication. The only reader is the E/WD fallback list, which needs both CPIOM C lost as well.',
      },
      fallbackEffect('the general lines of the list (the electrical modules have no line of their own)'),
    ],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: RESTORE_MODULE,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM F: fuel
// ---------------------------------------------------------------------------------------------------------------------

const FQMS_FAULT_ALERTS = ['281800046', '281800047'] as const;
const FQMS_12_FAULT_ALERT = '281800048';
const TRIM_TK_XFR_FAULT_ALERT = '281800094';
const MAN_XFR_PROCEDURE_ALERT = '281800074';
const WINGS_MAN_BALANCING_ALERT = '281800099';

function cpiomFDetail(number: number): FailureDetail {
  const fqms = number % 2 === 1 ? 1 : 2;
  const pairNote = fqms === 1 ? 'F1 and F3' : 'F2 and F4';
  const otherPair = fqms === 1 ? 'F2 or F4' : 'F1 or F3';
  return {
    whatItIs:
      `${CPIOM_EXPLANATION}The four CPIOM F host the two fuel quantity management systems (FQMS): each FQMS runs on a ` +
      'pair of modules, one for the command and one for the monitoring. They compute the tank quantities, fuel on ' +
      'board, gross weight and CG, and manage the transfers, the refuel and the jettison.',
    impact: [
      `FQMS ${fqms} runs on ${pairNote}: losing either module loses FQMS ${fqms}; the other FQMS keeps measuring, so the quantities, fuel on board, gross weight and CG stay normal.`,
      `With a module of ${otherPair} lost as well, both FQMS are lost: the tank quantities fall back to the alternate gauging and the transfers become manual.`,
    ],
    alertIds: [
      FQMS_FAULT_ALERTS[fqms - 1],
      TRIM_TK_XFR_FAULT_ALERT,
      FQMS_12_FAULT_ALERT,
      MAN_XFR_PROCEDURE_ALERT,
      WINGS_MAN_BALANCING_ALERT,
    ],
    effects: [
      {
        where: 'E/WD',
        text: `FUEL FQMS ${fqms} FAULT, ${ADVISORY}. It is ${FQMS_ALERT_PHASES}. Its only line, FQMS ${fqms} RESET, cannot be done. It is hidden when FQMS 1+2 FAULT is shown.`,
      },
      {
        where: 'SD FUEL',
        text: `${SD_CALL_UP} Nothing else changes on the page while the other FQMS works.`,
      },
      {
        where: 'E/WD',
        text:
          `With one FQMS lost, FUEL TRIM TK XFR FAULT, ${CAUTION}, also shows from a CG above 48.5 % MAC when the FQMS CG ` +
          `is valid (above 49.5 % with both FQMS working). It is ${FQI_ALERT_PHASES}. It adds CG MANAGEMENT to the ` +
          'inoperative systems on the STATUS page and, on the ground, the limitation DELAY T.O.',
      },
      {
        where: 'E/WD',
        text:
          `Both FQMS lost: FUEL FQMS 1+2 FAULT, ${CAUTION}. It is ${FQMS_12_ALERT_PHASES}. It replaces the single alerts and lists ` +
          'LOSS OF FUEL XFR INDICATIONS, ALTN GAUGING ONLY, FOB COMPUTED FROM FU, FUEL XFR : MAN ONLY and, in flight, GW FROM WBBC and GWCG FROM WBBC.',
      },
      {
        where: 'E/WD',
        text:
          `Both FQMS lost: FUEL MAN XFR PROCEDURE, ${CAUTION}, ${CRUISE_ONLY_ALERT_PHASES}; it adds JETTISON to the inoperative systems and FUEL XFR : MAN ONLY to the information. FUEL WINGS MAN BALANCING PROCEDURE, ${CAUTION}, ` +
          `shows when a pair of symmetrical tanks gets out of balance while the transfers are manual; it is ${FQI_ALERT_PHASES}. It adds the information FUEL CONSUMPT INCRSD : FMS PRED DISREGARD and TKs BALANCING : ONE PAIR AT A TIME and, on the ground, the limitation DELAY T.O.`,
      },
      {
        where: 'SD STATUS',
        text:
          `Both FQMS lost, ${STATUS_NOTE}: INOP SYS FQMS 1+2 and JETTISON (CAT 2 and GLS AUTOLAND for approach and landing). INFO: FOB ` +
          'COMPUTED FROM FU, FUEL XFR : MAN ONLY, LOSS OF FUEL XFR INDICATIONS and, in flight, GWCG FROM WBBC and GW FROM WBBC.',
      },
      {
        where: 'SD FUEL',
        text:
          'Both FQMS lost: the tank quantities come from the alternate gauging, each with its last two digits replaced by amber dashes, ' +
          'and all the pump symbols show not running, whether or not the pumps run.',
      },
      {
        where: 'SD',
        text: 'Both FQMS lost: in the permanent data at the bottom of every SD page, GW, GWCG and FOB are replaced by amber crosses (XX).',
      },
      fallbackEffect(
        'ALL CROSSFEEDS ON, OUTR TK XFR MAN / EMER OUTR TK XFR, INR TKS + MID TKS + TRIM TK : NOT USABLE, and FUNCTIONS NOT AVAIL: FQMS 1+2 / JETTISON (when all four CPIOM F are lost)',
      ),
    ],
    notSimulated: [
      'The FQMS reset is not simulated: the RESET lines stay pending and only Restore brings the FQMS back.',
      'JETTISON is listed as inoperative, but the fuel jettison keeps working.',
    ],
    logbook: { required: true, reason: `ECAM advisory and CPIOM F${number} lost with FQMS ${fqms}` },
    clearing:
      `${RESTORE_MODULE} After both FQMS were lost, their outputs return about 30 s after one is available again. ` +
      'Once the automatic transfers have stopped in flight they stay stopped until landing, even if the module is restored; transfer pushbuttons set to MAN stay where they are.',
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CPIOM G: landing gear, braking and steering
// ---------------------------------------------------------------------------------------------------------------------

function cpiomGDetail(number: number): FailureDetail {
  return {
    whatItIs:
      `${CPIOM_EXPLANATION}The four CPIOM G host the landing gear control, the braking control with the anti-skid, and ` +
      'the nose wheel and body wheel steering.',
    impact: [
      `Nothing in the simulator reads CPIOM G${number}: the landing gear, brakes, anti-skid and steering do not change.`,
    ],
    alertIds: [],
    effects: [
      {
        where: 'E/WD',
        text: 'No indication. The only reader is the E/WD fallback list, which needs both CPIOM C lost as well.',
      },
      fallbackEffect(
        'L/G GRVTY EXTN ONLY (MAX SPEED: 220KT) and FUNCTIONS NOT AVAIL: LG CTL 1+2 / A-SKID / N/W + B/W STEER (when all four CPIOM G are lost)',
      ),
    ],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: RESTORE_MODULE,
  };
}

export const Ata42CpiomEntries: Record<number, FailureDetail> = {
  [A380Failure.CpiomD1]: CpiomD1Detail,
  [A380Failure.CpiomD3]: CpiomD3Detail,
};

export const Ata42CpiomFamilies: FailureDetailFamily[] = [
  {
    ids: [A380Failure.CpiomA1, A380Failure.CpiomA2, A380Failure.CpiomA3, A380Failure.CpiomA4],
    detail: cpiomADetail,
  },
  {
    ids: [A380Failure.CpiomB1, A380Failure.CpiomB2, A380Failure.CpiomB3, A380Failure.CpiomB4],
    detail: cpiomBDetail,
  },
  { ids: [A380Failure.CpiomC1, A380Failure.CpiomC2], detail: cpiomCDetail },
  { ids: [A380Failure.CpiomE1, A380Failure.CpiomE2], detail: cpiomEDetail },
  {
    ids: [A380Failure.CpiomF1, A380Failure.CpiomF2, A380Failure.CpiomF3, A380Failure.CpiomF4],
    detail: cpiomFDetail,
  },
  {
    ids: [A380Failure.CpiomG1, A380Failure.CpiomG2, A380Failure.CpiomG3, A380Failure.CpiomG4],
    detail: cpiomGDetail,
  },
];
