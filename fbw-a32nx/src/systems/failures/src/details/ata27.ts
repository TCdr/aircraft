// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 3, 4, 5, 7 and 8 */
const NOT_SHOWN_TAKE_OFF_AND_LANDING =
  'not shown from take-off power to 1,500 ft, nor from 800 ft on the approach to 80 kt on the landing roll';

/** Flight phases 3, 4 and 5 */
const NOT_SHOWN_TAKE_OFF_TO_1500 = 'not shown from take-off power to 1,500 ft';

/** Flight phases 4 and 5 */
const NOT_SHOWN_TAKE_OFF_ROLL_TO_1500 = 'not shown from 80 kt on the take-off roll to 1,500 ft';

/** The SD F/CTL page is a blank page in the A32NX, so the alerts that call it up show nothing on it */
const NO_FCTL_PAGE = 'The SD F/CTL page that this alert calls up is not drawn: it stays empty.';

const SECS = [
  { spoilers: 'spoilers 3 and 4', alert: '2700210', status: 'SEC 1 and SPLR 3+4' },
  { spoilers: 'spoiler 5', alert: '2700220', status: 'SEC 2 and SPLR 5' },
  { spoilers: 'spoilers 1 and 2', alert: '2700230', status: 'SEC 3 and SPLR 1+2' },
] as const;

const ElacFamily: FailureDetailFamily = {
  ids: [A320Failure.Elac1Failure, A320Failure.Elac2Failure],
  detail: (number): FailureDetail => {
    const other = number === 1 ? 2 : 1;
    return {
      whatItIs:
        'The two elevator aileron computers (ELACs) normally fly the aircraft. They turn the sidestick and autopilot ' +
        'orders into aileron and elevator movements, trim the stabilizer and give the protections of normal law. One ' +
        'ELAC is enough for all of this and the other stands by.',
      impact: [
        `ELAC ${number} stops and sends nothing to the surfaces or to the other computers.`,
        `ELAC ${other} takes over, so normal law stays and the CAT 3 DUAL capability is lost.`,
        'Both ELACs failed: the SECs fly pitch in alternate law and roll in direct law on the spoilers.',
        'Both ELACs failed: the ailerons and both autopilots are lost, and the PFD shows the protection lost symbols.',
      ],
      alertIds: [number === 1 ? '2700110' : '2700120', '2701010', '2700390', '2200005'],
      effects: [
        {
          where: 'E/WD',
          text:
            `ELAC ${number} FAULT, amber caution with master caution and a single chime, ` +
            `${NOT_SHOWN_TAKE_OFF_AND_LANDING}. The actions are ELAC ${number} OFF THEN ON, then OFF if unsuccessful; ` +
            'they are left out when the pb is already off. FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE follow.',
        },
        { where: 'Overhead F/CTL panel', text: `The FAULT light of the ELAC ${number} pb comes on.` },
        {
          where: 'SD STATUS',
          text: `ELAC ${number} and CAT 3 DUAL are listed as inoperative, with CAT 3 SINGLE ONLY.`,
        },
        {
          where: 'E/WD',
          text:
            'Both ELACs failed: ELAC 1+2 FAULT replaces the two single alerts. ALTN LAW (PROT LOST) with MAX SPEED 320 KT ' +
            'follows, not shown from 80 kt on the take-off roll to 1,500 ft, nor from 800 ft on the approach to 80 kt ' +
            'on the landing roll, nor before the first engine start or after shutdown. AP OFF with the cavalry charge if an autopilot is engaged (red warning, no flight phase inhibition).',
        },
      ],
      notSimulated: [NO_FCTL_PAGE],
      logbook: { required: true, reason: 'ECAM caution, fault light and lost redundancy' },
      clearing: 'Maintenance only: use Restore. Switching the ELAC off then on does not clear it.',
    };
  },
};

const SecFamily: FailureDetailFamily = {
  ids: [A320Failure.Sec1Failure, A320Failure.Sec2Failure, A320Failure.Sec3Failure],
  detail: (number): FailureDetail => {
    const sec = SECS[number - 1];
    return {
      whatItIs:
        'The three spoiler elevator computers (SECs) command the spoilers for roll help, speed brake and ground ' +
        'spoilers. SEC 1 drives spoilers 3 and 4, SEC 2 spoiler 5 and SEC 3 spoilers 1 and 2. SEC 1 and 2 also stand ' +
        'by for the ELACs on the elevators and the stabilizer.',
      impact: [
        `SEC ${number} stops and its ${sec.spoilers} no longer move: their speed brake, ground spoiler and roll help are lost.`,
        'The other SECs and the ELACs carry on, so the control law does not change.',
      ],
      alertIds: [sec.alert],
      effects: [
        {
          where: 'E/WD',
          text:
            `SEC ${number} FAULT, amber caution with master caution and a single chime, ` +
            `${NOT_SHOWN_TAKE_OFF_TO_1500}. The actions are SEC ${number} OFF THEN ON, then OFF if unsuccessful; ` +
            'they are left out when the pb is already off.' +
            (number === 1 ? ' SPD BRK DO NOT USE is added while SEC 3 still extends spoiler 2.' : ''),
        },
        { where: 'Overhead F/CTL panel', text: `The FAULT light of the SEC ${number} pb comes on.` },
        { where: 'SD WHEEL', text: `An amber X replaces the ${sec.spoilers} on both wings.` },
        {
          where: 'SD STATUS',
          text: `${sec.status} are listed as inoperative, with LDG DIST PROC APPLY${
            number === 1 ? ' and SPD BRK DO NOT USE' : ''
          }.`,
        },
      ],
      notSimulated: [NO_FCTL_PAGE],
      logbook: { required: true, reason: 'ECAM caution, fault light and lost spoilers' },
      clearing: 'Maintenance only: use Restore. Switching the SEC off then on does not clear it.',
    };
  },
};

const FcdcFamily: FailureDetailFamily = {
  ids: [A320Failure.Fcdc1Failure, A320Failure.Fcdc2Failure],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two flight control data concentrators (FCDCs) collect the data of the ELACs and SECs and pass it on to the ' +
      'warning system and the displays: surface positions, fault messages, the control law on the PFD and the ' +
      'sidestick priority lights. They do not move any surface.',
    impact: [
      `FCDC ${number} stops sending data. The other FCDC supplies the same data, so nothing is lost.`,
      'Both FCDCs failed: the flight control computers keep flying, but the crew loses the F/CTL information.',
      'The warning system then cannot see any ELAC, SEC or surface fault.',
    ],
    alertIds: [number === 1 ? '2700555' : '2700557', '2700360', '2700365'],
    effects: [
      {
        where: 'E/WD',
        text: `FCDC ${number} FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_AND_LANDING}. STATUS lists FCDC ${number} as inoperative.`,
      },
      {
        where: 'E/WD',
        text:
          'Both FCDCs failed: FCDC 1+2 FAULT replaces the single alerts, amber caution with MONITOR F/CTL OVHD PNL, ' +
          'with STATUS F/CTL INDICATIONS LOST. In the emergency electrical configuration with the gear down, DIRECT LAW also shows.',
      },
      { where: 'PFD', text: 'Both FCDCs failed: the protection lost symbols show.' },
      { where: 'Glareshield', text: 'Both FCDCs failed: the SIDE STICK PRIORITY lights stay off.' },
    ],
    notSimulated: [NO_FCTL_PAGE],
    logbook: { required: true, reason: 'ECAM alert and lost F/CTL data path' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const FlapChannelFamily: FailureDetailFamily = {
  ids: [A320Failure.Sfcc1FlapChannel, A320Failure.Sfcc2FlapChannel],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two slat flap control computers (SFCCs) move the slats and flaps when the flap lever is moved. Each has a ' +
      'flap channel that controls one of the two hydraulic motors of the flap drive unit. One motor alone moves the ' +
      'flaps at half speed.',
    impact: [
      `The flap channel of SFCC ${number} no longer controls its flap motor.`,
      'The other channel keeps the flaps moving at half speed, so they take twice as long to travel.',
      'Both flap channels failed: the flaps stay where they are, whatever the lever position.',
    ],
    alertIds: [number === 1 ? '2701110' : '2701120', '2701170', '2701150'],
    effects: [
      {
        where: 'E/WD',
        text: `FLAP SYS ${number} FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'SD STATUS',
        text:
          `FLAPS SLOW and ENG ${number} APPR IDLE ONLY are listed` +
          (number === 1 ? ', with APPR PROC GPWS FLAP MODE OFF.' : '.'),
      },
      {
        where: 'E/WD',
        text:
          `Both flap channels failed: FLAPS FAULT, amber caution with MAX SPEED VFE NEXT and FLAPS LEVER RECYCLE, ` +
          `${NOT_SHOWN_TAKE_OFF_ROLL_TO_1500}.`,
      },
      {
        where: 'E/WD',
        text:
          'All four slat and flap channels failed with both surfaces retracted: SLATS AND FLAPS FAULT IN CONF 0 ' +
          'replaces SLATS FAULT and FLAPS FAULT.',
      },
    ],
    notSimulated: [
      'Both flap channels failed: the loss of both autopilots, autothrust, both flight directors and CAT 2 is not simulated.',
    ],
    logbook: { required: true, reason: 'ECAM alert and slow flaps' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const SlatChannelFamily: FailureDetailFamily = {
  ids: [A320Failure.Sfcc1SlatChannel, A320Failure.Sfcc2SlatChannel],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two slat flap control computers (SFCCs) move the slats and flaps when the flap lever is moved. Each has a ' +
      'slat channel that controls one of the two hydraulic motors of the slat drive unit. One motor alone moves the ' +
      'slats at half speed.',
    impact: [
      `The slat channel of SFCC ${number} no longer controls its slat motor.`,
      'The other channel keeps the slats moving at half speed, so they take twice as long to travel.',
      'Both slat channels failed: the slats stay where they are, whatever the lever position.',
    ],
    alertIds: [number === 1 ? '2701130' : '2701140', '2701160', '2701150'],
    effects: [
      {
        where: 'E/WD',
        text: `SLAT SYS ${number} FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'SLATS SLOW is listed.' },
      {
        where: 'E/WD',
        text:
          'Both slat channels failed: SLATS FAULT, amber caution with MAX SPEED VFE NEXT and FLAPS LEVER RECYCLE, ' +
          `${NOT_SHOWN_TAKE_OFF_ROLL_TO_1500}.`,
      },
      {
        where: 'E/WD',
        text:
          'All four slat and flap channels failed with both surfaces retracted: SLATS AND FLAPS FAULT IN CONF 0 ' +
          'replaces SLATS FAULT and FLAPS FAULT.',
      },
    ],
    notSimulated: [
      'Both slat channels failed: alternate law, the loss of both autopilots, autothrust, both flight directors and CAT 2 are not simulated; the control law stays normal.',
    ],
    logbook: { required: true, reason: 'ECAM alert and slow slats' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const TransmissionAsymmetryFamily: FailureDetailFamily = {
  ids: [A320Failure.FlapTransmissionAsymmetry, A320Failure.SlatTransmissionAsymmetry],
  detail: (number): FailureDetail => {
    const flaps = number === 1;
    const surface = flaps ? 'flaps' : 'slats';
    const other = flaps ? 'slats' : 'flaps';
    return {
      whatItIs:
        `One drive unit moves the ${surface} through shafts that run along both wings. A wing tip brake at the end of ` +
        'each shaft locks the transmission when the SFCCs see the two wings move differently, so the surfaces never ' +
        'end up asymmetric.',
      impact: [
        `An asymmetry between the two wings is set on the ${surface} transmission.`,
        `The first time the SFCCs drive the ${surface}, they apply the wing tip brakes: the ${surface} stay where they are.`,
        `The ${other} keep working. The brakes cannot be released in flight.`,
      ],
      alertIds: flaps ? ['2701170', '2700090'] : ['2701160', '2700085'],
      effects: [
        {
          where: 'E/WD',
          text: flaps
            ? `FLAPS LOCKED, amber caution with WING TIP BRK ON OR ALIGNMENT FAULT and MAX SPEED VFE NEXT, ${NOT_SHOWN_TAKE_OFF_ROLL_TO_1500}.`
            : `SLATS LOCKED, amber caution with WING TIP BRK ON and MAX SPEED VFE NEXT, ${NOT_SHOWN_TAKE_OFF_ROLL_TO_1500}.`,
        },
        {
          where: 'E/WD',
          text: `FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE are added while the ${surface} are extended.`,
        },
        {
          where: 'SD STATUS',
          text: `${flaps ? 'FLAPS' : 'SLATS'} is listed as inoperative, with the approach procedure lines.`,
        },
        {
          where: 'E/WD',
          text:
            `Locked retracted on the ground: ${flaps ? 'FLAPS' : 'SLATS'} NOT IN T.O CONFIG, red warning, when ` +
            'TO CONFIG is pressed or take-off power is set.',
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and locked surfaces' },
      clearing: 'Maintenance only: use Restore. The brakes then release on the ground only; in flight they stay on.',
    };
  },
};

const WingTipBrakeFamily: FailureDetailFamily = {
  ids: [A320Failure.FlapWingTipBrake, A320Failure.SlatWingTipBrake],
  detail: (number): FailureDetail => {
    const flaps = number === 1;
    const surface = flaps ? 'flap' : 'slat';
    return {
      whatItIs:
        `A wing tip brake at the end of each ${surface} shaft holds the surfaces when the SFCCs see an asymmetry. Each ` +
        'brake has its own solenoid, and the SFCCs monitor the brakes and the solenoids.',
      impact: [
        `One ${surface} wing tip brake, or its solenoid, is reported failed.`,
        'Nothing moves differently: it is a caution about a protection that has lost its redundancy.',
      ],
      alertIds: [flaps ? '2701230' : '2701220'],
      effects: [
        {
          where: 'E/WD',
          text: `${surface.toUpperCase()} TIP BRK FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_AND_LANDING}.`,
        },
        {
          where: 'E/WD',
          text: 'It shows only while at least one SFCC is powered, and it has no STATUS lines.',
        },
      ],
      notSimulated: [
        `The ${surface} wing tip brakes keep working: a locked transmission after a real brake failure is not simulated.`,
      ],
      logbook: { required: true, reason: 'ECAM alert and lost brake redundancy' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const SidestickFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptSidestick, A320Failure.FoSidestick],
  detail: (number): FailureDetail => {
    const captain = number === 1;
    const side = captain ? 'L' : 'R';
    return {
      whatItIs:
        'Each pilot has a sidestick with transducers that measure the pitch and roll orders. The orders go to the ' +
        'ELACs and the SECs, which fly the aircraft. A sidestick priority logic lets one pilot deactivate the other ' +
        'sidestick.',
      impact: [
        `The pitch and roll transducers of the ${captain ? 'CAPT' : 'F/O'} sidestick fail: it sends no order to the computers.`,
        captain
          ? 'The sim has one pilot input: it is then read as the F/O sidestick, so flying is unchanged.'
          : 'The sim has one pilot input, read as the CAPT sidestick: this failure alone changes nothing in flight.',
        'Both sidesticks failed: no order reaches the computers and the aircraft no longer answers the controls.',
      ],
      alertIds: [captain ? '2701180' : '2701190'],
      effects: [
        {
          where: 'E/WD',
          text: `${side} SIDESTICK FAULT, crew awareness, shown in every flight phase.`,
        },
        { where: 'SD STATUS', text: `${side} SIDESTICK is listed as inoperative.` },
        {
          where: 'Side stick',
          text: captain
            ? 'Both failed: the stick order is read as zero.'
            : 'With the CAPT sidestick also failed: the stick order is read as zero.',
        },
      ],
      notSimulated: ['The failed stick does not lose its priority or light the priority lights.'],
      logbook: { required: true, reason: 'ECAM alert and a lost sidestick' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const SpeedBrakeLeverFamily: FailureDetailFamily = {
  ids: [A320Failure.SpeedBrakeLeverSec1, A320Failure.SpeedBrakeLeverSec3],
  detail: (number): FailureDetail => {
    const sec = number === 1 ? 1 : 3;
    const spoilers = number === 1 ? 'spoilers 3 and 4' : 'spoiler 2';
    const otherSpoilers = number === 1 ? 'spoiler 2' : 'spoilers 3 and 4';
    return {
      whatItIs:
        'The speed brake lever has position transducers that each SEC reads. A SEC uses them to extend its spoilers ' +
        'as speed brakes and to arm its ground spoilers. SEC 1 uses its transducers for spoilers 3 and 4, SEC 3 for ' +
        'spoiler 2.',
      impact: [
        `SEC ${sec} reads the lever as retracted and disarmed, whatever its position: ${spoilers} stay retracted.`,
        'Its ground spoilers are not armed by the lever: they extend on landing only with reverse selected.',
        `${otherSpoilers} still extend with the lever.`,
      ],
      alertIds: [number === 1 ? '2701300' : '2701290', '2701310'],
      effects: [
        {
          where: 'E/WD',
          text:
            `SPD BRK ${number === 1 ? '3+4' : '2'} FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_TO_1500}.` +
            (number === 1 ? ' SPD BRK DO NOT USE is the action.' : ''),
        },
        {
          where: 'E/WD',
          text:
            'With the lever transducers of SEC 1 and SEC 3 both failed: SPD BRK FAULT replaces the single alert, ' +
            'crew awareness, with SPD BRK DO NOT USE in STATUS.',
        },
        ...(number === 1 ? [{ where: 'SD STATUS', text: 'SPD BRK DO NOT USE is listed.' }] : []),
      ],
      notSimulated: [
        'The SEC loses its ground spoiler arming without a GND SPLR alert: that alert follows only a lost ground spoiler function.',
      ],
      logbook: { required: true, reason: 'ECAM alert and a lost speed brake' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const GroundSpoilerFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GroundSpoilerFunctionSec1,
    A320Failure.GroundSpoilerFunctionSec2,
    A320Failure.GroundSpoilerFunctionSec3,
  ],
  detail: (number): FailureDetail => {
    const spoilers = ['spoilers 3 and 4', 'spoiler 5', 'spoilers 1 and 2'][number - 1];
    const label = ['GND SPLR 3+4', 'GND SPLR 5', 'GND SPLR 1+2'][number - 1];
    return {
      whatItIs:
        'On landing and in a rejected take-off, with the ground spoilers armed and the thrust levers at idle or in ' +
        'reverse, each SEC extends its spoilers fully to dump lift and add braking. SEC 1 does this with spoilers ' +
        '3 and 4, SEC 2 with spoiler 5 and SEC 3 with spoilers 1 and 2.',
      impact: [
        `SEC ${number} no longer arms its ground spoilers from the lever and no longer reacts to the thrust levers.`,
        `Its ${spoilers} do not extend on landing or in a rejected take-off.`,
        'Its roll and speed brake functions work. The other SECs extend theirs, so the landing distance grows.',
      ],
      alertIds: [['2701270', '2701250', '2701260'][number - 1], '2701280'],
      effects: [
        { where: 'E/WD', text: `${label} FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_TO_1500}.` },
        { where: 'SD STATUS', text: `${label} is listed as inoperative, with LDG DIST PROC APPLY.` },
        {
          where: 'E/WD',
          text:
            'The function lost in two or three SECs: GND SPLR FAULT replaces the single alert, ' +
            'and STATUS lists each lost pair.',
        },
      ],
      logbook: { required: true, reason: 'ECAM alert and lost ground spoilers' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata27Entries: Record<number, FailureDetail> = {
  [A320Failure.FlapAttachmentSensor]: {
    whatItIs:
      'Sensors on the flap panels let the SFCCs detect a flap panel that is no longer attached to its actuator or ' +
      'track. The SFCCs monitor them whenever they are powered.',
    impact: [
      'The attachment sensor is reported failed to the SFCCs.',
      'Nothing moves differently: it is a caution about a monitoring part.',
    ],
    alertIds: ['2701240'],
    effects: [
      {
        where: 'E/WD',
        text: `FLAP ATTACH SENSOR, crew awareness, ${NOT_SHOWN_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'E/WD', text: 'It shows only while at least one SFCC is powered, and it has no STATUS lines.' },
    ],
    notSimulated: ['No flap attachment failure is modelled: the sensor only raises the alert.'],
    logbook: { required: true, reason: 'ECAM alert on a flap monitoring part' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.SidestickPriorityLogic]: {
    whatItIs:
      'The sidestick priority logic lets a pilot press the red take over pb on the sidestick to deactivate the other ' +
      'sidestick. The arrow lights in front of the pilots and the voice messages PRIORITY LEFT and PRIORITY RIGHT ' +
      'tell who has the control.',
    impact: [
      'The take over pbs no longer reach the ELACs and SECs.',
      'Neither pilot can take the priority or deactivate the other sidestick.',
    ],
    alertIds: ['2701200'],
    effects: [
      {
        where: 'E/WD',
        text:
          'SIDESTICK PRIORITY, amber caution with CHECK PRIORITY LOGIC, shown only before take-off power (power ' +
          'on, engine start and taxi) and in the 5 minutes after engine shutdown.',
      },
      { where: 'Glareshield', text: 'Pressing a take over pb does not light the red and green priority arrows.' },
      { where: 'Aural', text: 'Pressing a take over pb does not give PRIORITY LEFT or PRIORITY RIGHT.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a failed priority logic' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.StabilizerElecControl]: {
    whatItIs:
      'The trimmable horizontal stabilizer sets the pitch trim. Hydraulic motors move it, controlled electrically by ' +
      'the ELACs and SECs, and the pilots can also move it with the pitch trim wheels.',
    impact: [
      'The ELACs and SECs see a fault in the electric control of the stabilizer and stop commanding it.',
      'The ELACs can no longer fly pitch, so the SECs take over in alternate law without protections.',
      'Trim then comes from the manual pitch trim wheels only.',
    ],
    alertIds: ['2701210', '2701020', '2701030', '2700390', '2200005'],
    effects: [
      {
        where: 'E/WD',
        text:
          'STABILIZER JAM, amber caution with MAN PITCH TRIM CHECK and TRIM FOR NEUTRAL ELEV, ' +
          `${NOT_SHOWN_TAKE_OFF_ROLL_TO_1500}.`,
      },
      {
        where: 'E/WD',
        text:
          `ELAC 1 PITCH FAULT and ELAC 2 PITCH FAULT, crew awareness, ${NOT_SHOWN_TAKE_OFF_AND_LANDING}. ALTN LAW (PROT LOST) ` +
          'also shows, not shown from 80 kt on the take-off roll to 1,500 ft, on the approach below 800 ft or the landing roll above 80 kt, nor before the first engine start or after shutdown.',
      },
      {
        where: 'E/WD',
        text: 'AP OFF with the cavalry charge if an autopilot is engaged (red warning, no flight phase inhibition).',
      },
      {
        where: 'SD STATUS',
        text: 'MAX SPEED 320 KT, with STABILIZER, ELAC PITCH, F/CTL PROT, AP 1+2 and CAT 2 inoperative.',
      },
    ],
    notSimulated: [NO_FCTL_PAGE],
    logbook: { required: true, reason: 'ECAM caution, lost electric trim and alternate law' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata27Families: FailureDetailFamily[] = [
  ElacFamily,
  SecFamily,
  FcdcFamily,
  FlapChannelFamily,
  SlatChannelFamily,
  TransmissionAsymmetryFamily,
  WingTipBrakeFamily,
  SidestickFamily,
  SpeedBrakeLeverFamily,
  GroundSpoilerFamily,
];
