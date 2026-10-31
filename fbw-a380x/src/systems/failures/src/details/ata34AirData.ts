// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';
const WARNING = 'a red warning with master warning and continuous chime';

/** Alerts inhibited in flight phases 4, 5 and 10 */
const NOT_SHOWN_PHASES_4_5_10 =
  'a new alert is not shown on the take-off roll above 80 kt, nor from touch down until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 4 to 7 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_AND_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from touch down until the landing roll is below ' +
  '80 kt';

/** Alerts inhibited in flight phases 4 to 6, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_6_9_10 =
  'a new alert is not shown from 80 kt on take-off to 400 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 3 to 10 (shown in phases 1, 2, 11 and 12) */
const NOT_SHOWN_PHASES_3_TO_10 =
  'a new alert shows only on the ground: before take-off thrust is set, once below 80 kt after landing and after the ' +
  'engines are shut down';

/** Alerts inhibited in flight phases 3 to 11 (shown in phases 1, 2 and 12) */
const NOT_SHOWN_PHASES_3_TO_11 =
  'a new alert shows only on the ground before take-off thrust is set and after the engines are shut down';

const NO_PAGE_CALL_UP = 'No system page is called up.';

const ADIRS_SWTG_MEMO =
  'The memo ADIRS SWTG shows on the E/WD while the AIR DATA or ATT HDG selector is off NORM, in every flight phase.';

const ALTERNATE_LAW_NOTE =
  'A second ADR lost or rejected reverts the flight controls to alternate law, and all three to direct law.';

/** F/CTL ALTN LAW (PROT LOST) and F/CTL DIRECT LAW follow the law the flight controls take */
const LAW_ALERT_ALTN = '271800008';
const LAW_ALERT_DIRECT = '271800009';

const AUTO_FLT_AP_OFF = '220800001';

/** Two lost or rejected ADRs drop the autopilot and flight director condition of the PRIMs */
const apOffBullet = (cause: string) => ({
  where: 'E/WD',
  text:
    `${cause} an engaged autopilot disconnects: AUTO FLT AP OFF, ${WARNING}, in every flight phase (it has no ` +
    'inhibition). Nothing shows if no autopilot was engaged.',
});

const lawAlertsText = (cause: string): string =>
  `${cause} F/CTL ALTN LAW (PROT LOST), ${CAUTION}, follows the alternate law (STATUS information ALTN LAW : PROT ` +
  `LOST, line MAX SPEED: 310 KT); ${NOT_SHOWN_PHASES_4_TO_7_9_10}. F/CTL DIRECT LAW, ${CAUTION}, follows the direct ` +
  `law, with the same phase limits (lines MAX SPEED: 310/.86 and MANEUVER WITH CARE).`;

// ---------------------------------------------------------------------------------------------------------------------
// Shared descriptions
// ---------------------------------------------------------------------------------------------------------------------

const ADR_DESCRIPTION =
  'Each of the three ADIRUs holds an air data reference part (ADR) that turns the pitot, static and temperature ' +
  'pressures and the angle of attack of its probes into airspeed, Mach, altitude, vertical speed and angle of ' +
  'attack. ADR 1 normally feeds the captain PFD and ND, ADR 2 the first officer ones, and ADR 3 is the spare that ' +
  'the AIR DATA selector gives to either side.';

/** The PFD that shows the data of ADR `adr`, with the AIR DATA selector position that gives it to the side */
const PFD_OF_ADR = (adr: number): string =>
  adr === 1
    ? 'the captain PFD (except with the AIR DATA selector on CAPT ON 3)'
    : adr === 2
      ? 'the first officer PFD (except with the AIR DATA selector on F/O ON 3)'
      : 'the captain PFD with the AIR DATA selector on CAPT ON 3, and the first officer PFD with it on F/O ON 3';

// ---------------------------------------------------------------------------------------------------------------------
// ADR airspeed erroneous (pitot)
// ---------------------------------------------------------------------------------------------------------------------

const AdrAirspeedErroneousFamily: FailureDetailFamily = {
  ids: [A380Failure.AdrAirspeedErroneous1, A380Failure.AdrAirspeedErroneous2, A380Failure.AdrAirspeedErroneous3],
  detail: (adr): FailureDetail => ({
    whatItIs:
      `${ADR_DESCRIPTION} The airspeed of ADR ${adr} comes from the total pressure of the pitot part of its ` +
      'multi-function probe. The PRIMs compare the three ADRs and the standby instruments and reject a source that ' +
      'disagrees with the others.',
    impact: [
      `ADR ${adr} gives an airspeed 40 kt too low (Mach and true airspeed fall in the same ratio) with a valid status, so no flag shows.`,
      `The PFD fed by ADR ${adr} shows the wrong speed until the AIR DATA selector gives it another ADR.`,
      'The monitoring of the PRIMs rejects the ADR for the flight controls after about 1 s of disagreement and keeps it rejected until the end of the flight.',
      'A second erroneous pitot after the first is rejected gives alternate law; two at once, or a third, reject all air data and give direct law.',
    ],
    alertIds: ['340800009', '340800010', LAW_ALERT_ALTN, LAW_ALERT_DIRECT, AUTO_FLT_AP_OFF],
    effects: [
      {
        where: 'PFD',
        text:
          `${PFD_OF_ADR(adr).charAt(0).toUpperCase()}${PFD_OF_ADR(adr).slice(1)} shows the speed scale and the Mach ` +
          'readout too low, without a flag. The altitude is not affected. The rejection does not change what the PFD ' +
          'shows.',
      },
      {
        where: 'E/WD',
        text:
          `NAV AIR DATA DISAGREE, ${CAUTION}, about 1 s after the PRIMs find the speed of ADR ${adr} more ` +
          'than 16 kt away from the other sources, which needs an airspeed above about 70 kt; ' +
          `${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its lines are ADR ${adr} REJECTED BY PRIMs (amber), AIR DATA XCHECK and ` +
          'AIR DATA SWTG AS RQRD. It stays after the failure is restored, until the end of the flight.',
      },
      {
        where: 'E/WD',
        text:
          'A second erroneous pitot after the first is rejected is rejected too: NAV AIR DATA DISAGREE stays, with ' +
          'both ADR lines and RISK OF UNDUE OVERSPEED WARNING (also a STATUS information). Two pitots failed at ' +
          'once, or a third one, leave the PRIMs unable to tell which source is wrong: they reject all air data, and ' +
          `NAV ALL AIR DATA DISAGREE, ${WARNING}, replaces NAV AIR DATA DISAGREE; ${NOT_SHOWN_PHASES_4_5_10}.`,
      },
      {
        where: 'E/WD',
        text: lawAlertsText('With two ADRs rejected, or all of them,'),
      },
      apOffBullet('When the second ADR is rejected,'),
      {
        where: 'E/WD',
        text: `${ADIRS_SWTG_MEMO} (after the crew gives the PFD another ADR with the AIR DATA selector).`,
      },
    ],
    notSimulated: ['The crew can call up NAV UNRELIABLE AIR SPEED INDICATION by hand; it is not modelled.'],
    logbook: { required: true, reason: 'NAV AIR DATA DISAGREE caution and a wrong speed on a PFD' },
    clearing:
      `${MAINTENANCE_ONLY} The ADR reads correctly again, but an ADR the PRIMs rejected stays rejected, with its ` +
      'alert, until the aircraft is on the ground below 30 kt. The AIR DATA selector stays as the crew set it.',
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// ADR angle of attack erroneous
// ---------------------------------------------------------------------------------------------------------------------

const AdrAoaErroneousFamily: FailureDetailFamily = {
  ids: [A380Failure.AdrAoaErroneous1, A380Failure.AdrAoaErroneous2, A380Failure.AdrAoaErroneous3],
  detail: (adr): FailureDetail => ({
    whatItIs:
      `${ADR_DESCRIPTION} The angle of attack of ADR ${adr} comes from the angle of attack vane of its multi-function ` +
      'probe. The PRIMs compare the three angles of attack and reject one that disagrees with the others.',
    impact: [
      `ADR ${adr} gives an angle of attack 10 degrees too high with a valid status, once the airspeed is above 60 kt.`,
      'The monitoring of the PRIMs rejects that angle of attack after about 1 s of disagreement (more than 3.6 degrees in flight, 8 degrees on the ground) and keeps it rejected until the end of the flight.',
      'A second erroneous probe after the first is rejected makes the two left disagree: all three angles of attack are rejected, which gives NAV AOA DISAGREE and the direct law.',
    ],
    alertIds: ['340800014', LAW_ALERT_DIRECT, AUTO_FLT_AP_OFF],
    effects: [
      {
        where: 'E/WD',
        text:
          'One rejected angle of attack gives no alert and nothing else shows. Two probes failed at the same time ' +
          'agree with each other, so the correct third one is rejected instead, again with no alert.',
      },
      {
        where: 'E/WD',
        text:
          `With all three rejected, NAV AOA DISAGREE, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}. Its line is RISK ` +
          'OF UNDUE STALL WARNING.',
      },
      {
        where: 'SD STATUS',
        text:
          'INOP SYS F/CTL PROT, AP 1+2, A/THR and FD 1+2, and for approach and landing CAT 2, GLS AUTOLAND and ' +
          'REACTIVE W/S DET; the information ALTN LAW : PROT LOST and RISK OF UNDUE STALL WARNING; the limitation ' +
          'MAX SPEED: 310 KT, also on the PFD. All only while NAV AOA DISAGREE is shown.',
      },
      {
        where: 'E/WD',
        text:
          `The flight controls count the three ADRs as failed: F/CTL DIRECT LAW, ${CAUTION}; ` +
          `${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
      },
      apOffBullet('With all three angles of attack rejected,'),
    ],
    logbook: { required: true, reason: 'NAV AOA DISAGREE caution and direct law after a second probe failure' },
    clearing:
      `${MAINTENANCE_ONLY} The probe reads correctly again, but rejected angles of attack, with their alerts, stay ` +
      'rejected until the aircraft is on the ground below 30 kt.',
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// ADR fault
// ---------------------------------------------------------------------------------------------------------------------

/** The single NAV ADR n FAULT alert key, and the pair alerts the ADR is part of (1+2, 1+3, 2+3) */
const ADR_FAULT_ALERT = ['340800001', '340800002', '340800003'];
const ADR_PAIR_ALERTS = [
  ['340800004', '340800005'],
  ['340800004', '340800006'],
  ['340800005', '340800006'],
];
const ADR_PAIRS = [
  ['1+2', '1+3'],
  ['1+2', '2+3'],
  ['1+3', '2+3'],
];
/** The IR FAULT alert that the line IR n MODE SEL OFF raises after landing, for ADR 1 and 3 */
const IR_FAULT_ALERTS_OF_ADR = [['340800040'], ['340800040', '340800072'], ['340800040', '340800072']];

const AIR_DATA_SWITCHING_LINE = ['AIR DATA SWTG : CAPT ON 3', 'AIR DATA SWTG : F/O ON 3', 'AIR DATA SWTG : NORM'];

const adrFaultStatus = (adr: number): string =>
  adr === 1
    ? 'INOP SYS ADR 1, with TCAS 1 and GPWS 1 while the AIR DATA selector is not on CAPT ON 3'
    : adr === 2
      ? 'INOP SYS ADR 2, with TCAS 2 and GPWS 2 while the AIR DATA selector is not on F/O ON 3'
      : 'INOP SYS ADR 3';

const AdrFaultFamily: FailureDetailFamily = {
  ids: [A380Failure.Adr1Fault, A380Failure.Adr2Fault, A380Failure.Adr3Fault],
  detail: (adr): FailureDetail => {
    const hasIrLine = adr !== 2;
    return {
      whatItIs: `${ADR_DESCRIPTION} The ADIRU also holds the inertial reference part, which works separately.`,
      impact: [
        `ADR ${adr} gives no valid air data: airspeed, Mach, altitude, vertical speed, static pressure, temperatures and angle of attack all read failed.`,
        `Its ${PFD_OF_ADR(adr)} loses the speed, altitude and Mach; the IR of the same ADIRU is not affected.`,
        ALTERNATE_LAW_NOTE,
      ],
      alertIds: [
        ADR_FAULT_ALERT[adr - 1],
        ...ADR_PAIR_ALERTS[adr - 1],
        '340800008',
        LAW_ALERT_ALTN,
        LAW_ALERT_DIRECT,
        AUTO_FLT_AP_OFF,
        ...IR_FAULT_ALERTS_OF_ADR[adr - 1],
      ],
      effects: [
        {
          where: 'Overhead ADIRS panel',
          text:
            `The FAULT light of the ADR ${adr} pushbutton comes on, and stays on when the pushbutton is set OFF. It ` +
            'goes out only when the failure is restored or the ADIRU is switched off with its IR mode selector.',
        },
        {
          where: 'E/WD',
          text:
            `NAV ADR ${adr} FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_5_10}. It is not raised with the engines off ` +
            '(before the first engine start and after shutdown), nor when the ADIRU has lost a power supply. Its ' +
            `lines are ${AIR_DATA_SWITCHING_LINE[adr - 1]} and ADR ${adr} ` +
            `P/B OFF${hasIrLine ? `, then BEFORE LAST ENG SHUTDOWN : IR ${adr} MODE SEL OFF` : ''}. ${NO_PAGE_CALL_UP}`,
        },
        {
          where: 'E/WD',
          text:
            `With a second ADR also failed or switched off, NAV ADR ${ADR_PAIRS[adr - 1][0]} FAULT or ` +
            `${ADR_PAIRS[adr - 1][1]} FAULT, ${CAUTION}, replaces the single alerts; ${NOT_SHOWN_PHASES_4_5_10}. It asks ` +
            'for the AIR DATA selector, both ADR pushbuttons OFF, WXR & TAWS and XPDR & TCAS on the working system, ' +
            'and GA THR : TOGA ONLY. With all three, NAV ADR 1+2+3 FAULT, ' +
            `${WARNING}, replaces them; ${NOT_SHOWN_PHASES_4_5_10}. It asks for USE STBY INSTRUMENTS and the three ` +
            'pushbuttons OFF.',
        },
        {
          where: 'E/WD',
          text: lawAlertsText(
            'With a second ADR lost the flight controls take the alternate law, with all three the direct law:',
          ),
        },
        apOffBullet('When the second ADR is lost,'),
        {
          where: 'PFD',
          text:
            `${PFD_OF_ADR(adr).charAt(0).toUpperCase()}${PFD_OF_ADR(adr).slice(1)} shows the red SPD, ALT and MACH ` +
            '(in the air) flags. The V/S flag does not appear while the inertial vertical speed is valid. Giving ' +
            'that PFD another working ADR with the AIR DATA selector brings the data back.',
        },
        {
          where: 'SD STATUS',
          text:
            `${adrFaultStatus(adr)}, only while the single alert is shown. With a second ADR out the pair alert lists ` +
            'F/CTL PROT, LOAD ALLEVIATION, GUST LOAD PROT, AP 1+2, FD 1+2 and the ADR pair, with TCAS 1 and GPWS 1 ' +
            '(pair 1+3), TCAS 2 and GPWS 2 (pair 2+3), or for pair 1+2 TCAS 2 and GPWS 2 with the AIR DATA selector on ' +
            'CAPT ON 3 and TCAS 1+2 and GPWS 1+2 otherwise; GLS AUTOLAND and GA SOFT for approach and landing, the information ALTN LAW : ' +
            'PROT LOST and FLS LIMITED TO F-APP + RAW, and for approach and landing the limitation GA THR : TOGA ' +
            'ONLY. With all three out, it lists ADR 1+2+3, TCAS 1+2 and GPWS 1+2, and for approach and landing REACTIVE W/S DET, the information ' +
            'CABIN ALT TRGT (use the published cabin altitude target), and the limitations MAX SPEED: 310/.86, SPD BRK: DO NOT USE, MANEUVER WITH ' +
            'CARE and AVOID ICING CONDs, also on the PFD.',
        },
        {
          where: 'E/WD',
          text:
            `${ADIRS_SWTG_MEMO}` +
            ' The line IR 1 (or IR 3) MODE SEL OFF before the last engine shutdown, in the single alert of ADR 1 and 3 ' +
            'and in the pair alerts, raises NAV IR 1 FAULT or NAV IR 3 FAULT after landing below 80 kt ' +
            `while the engines still run, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_6_9_10}.`,
        },
      ],
      notSimulated: [
        'The backup speed and altitude scales of the PFD do not exist: with all ADRs lost the PFDs show the SPD and ALT flags.',
      ],
      logbook: { required: true, reason: `ADR ${adr} FAULT light and caution` },
      clearing:
        `${MAINTENANCE_ONLY} The air data come back at once if the ADR ${adr} pushbutton is ON; a pushbutton the ` +
        'crew set OFF and the AIR DATA selector stay as set.',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Static probes
// ---------------------------------------------------------------------------------------------------------------------

const STATIC_PROBE_DESCRIPTION =
  'The static probes on the fuselage sides measure the local static pressure. Each ADIRU is connected to two of them, ' +
  'one on each side, and its altitude and airspeed depend on them.';

const staticProbeDetail = (adr: number, side: 'left' | 'right'): FailureDetail => {
  const letter = side === 'left' ? 'L' : 'R';
  const other = side === 'left' ? 'right' : 'left';
  return {
    whatItIs: STATIC_PROBE_DESCRIPTION,
    impact: [
      `The ${side} static probe of ADR ${adr} is reported obstructed.`,
      'The simulation only raises the alert: the air data of the ADR do not change.',
      `With all three ${side} static probes obstructed the air data of all ADRs are reported degraded.`,
    ],
    alertIds: ['340800067', '340800007'],
    effects: [
      {
        where: 'E/WD',
        text:
          `NAV STATIC PROBE FAULT, ${CAUTION}, once a static probe is obstructed; ${NOT_SHOWN_PHASES_3_TO_10}. Its ` +
          `lines are ${letter} ADR ${adr} STAT PROBE (L+R ADR ${adr} STAT PROBE when the ${other} probe of the same ` +
          'ADR is obstructed too) and IAS/ALT MAYBE NOT RELIABLE. A new alert in flight appears only after landing, ' +
          `below 80 kt. ${NO_PAGE_CALL_UP}`,
      },
      {
        where: 'SD STATUS',
        text:
          `INOP SYS ${letter} ADR ${adr} STAT PROBE (or L+R) and the information IAS/ALT MAYBE NOT RELIABLE, only ` +
          'while the alert is shown.',
      },
      {
        where: 'E/WD',
        text:
          `With the three ${side} static probes obstructed, NAV ADR 1+2+3 DATA DEGRADED, ${CAUTION}, replaces NAV ` +
          `STATIC PROBE FAULT; ${NOT_SHOWN_PHASES_4_TO_7_AND_10}. It asks USE STBY INSTRUMENTS and [MFD SURV] ALT ` +
          'RPTG OFF.',
      },
    ],
    notSimulated: [
      'An obstructed static probe does not falsify the altitude and airspeed of the ADR: the simulation only raises the alert.',
    ],
    logbook: { required: true, reason: 'NAV STATIC PROBE FAULT caution on the ground' },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  };
};

const LeftStaticProbeFamily: FailureDetailFamily = {
  ids: [A380Failure.Adr1LeftStaticProbe, A380Failure.Adr2LeftStaticProbe, A380Failure.Adr3LeftStaticProbe],
  detail: (adr): FailureDetail => staticProbeDetail(adr, 'left'),
};

const RightStaticProbeFamily: FailureDetailFamily = {
  ids: [A380Failure.Adr1RightStaticProbe, A380Failure.Adr2RightStaticProbe, A380Failure.Adr3RightStaticProbe],
  detail: (adr): FailureDetail => staticProbeDetail(adr, 'right'),
};

// ---------------------------------------------------------------------------------------------------------------------
// Sideslip probes
// ---------------------------------------------------------------------------------------------------------------------

const SideslipProbeFamily: FailureDetailFamily = {
  ids: [A380Failure.SideslipProbe1, A380Failure.SideslipProbe2, A380Failure.SideslipProbe3],
  detail: (probe): FailureDetail => ({
    whatItIs:
      'The three sideslip probes sit on the nose in front of the windshield and measure the sideslip angle. Each ADIRU ' +
      'is connected to one of them.',
    impact: [
      `Sideslip probe ${probe} is reported failed.`,
      'The simulation only raises the alert and lists the probe as inoperative: no air data or flight control value changes.',
    ],
    alertIds: [String(340800063 + probe)],
    effects: [
      {
        where: 'E/WD',
        text:
          `NAV SIDESLIP PROBE ${probe} FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_3_TO_11}, so a failure in flight shows ` +
          `only after the engines are shut down. ${NO_PAGE_CALL_UP}`,
      },
      { where: 'SD STATUS', text: `INOP SYS SIDESLIP PROBE ${probe}, only while the alert is shown.` },
    ],
    notSimulated: ['A failed sideslip probe does not change any sideslip value used by the systems.'],
    logbook: { required: true, reason: 'NAV SIDESLIP PROBE FAULT advisory' },
    clearing: `${MAINTENANCE_ONLY} The alert goes out at once.`,
  }),
};

export const Ata34AirDataFamilies: FailureDetailFamily[] = [
  AdrAirspeedErroneousFamily,
  AdrAoaErroneousFamily,
  AdrFaultFamily,
  LeftStaticProbeFamily,
  RightStaticProbeFamily,
  SideslipProbeFamily,
];
