// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const RESTORE_COMPUTER =
  'Maintenance only: use Restore. Cycling the pushbutton as the procedure says does not clear a failed computer, and a pushbutton left OFF keeps the computer off after Restore.';

const DIRECT_LAW_ALERT_ID = '271800009';

const DIRECT_LAW_ON_ALL_PRIMS_LOST =
  'Only if all three PRIMs are lost: F/CTL DIRECT LAW (amber caution, master caution and single chime) with MAX SPEED 310/.86, MANEUVER WITH CARE, AFS CTL PNL KNOB AVAIL FOR BUG SETTING and F/CTL BKUP CTL ACTIVE (the last one only if the three SECs are lost too). STATUS: INOP SYS F/CTL PROT, LOAD ALLEVIATION, AP 1+2, FD 1+2; APPR & LDG CAT 2, GLS AUTOLAND; INFO DIRECT LAW : PROT LOST, and F/CTL BKUP CTL ACTIVE with the three SECs lost too; LIMITATIONS MAX SPEED 310/.86 and MANEUVER WITH CARE (also on the PFD). It does not show with engines off or after engine shutdown, and it is inhibited from 80 kt through 1,500 ft and from 800 ft on approach to touch down. The autopilot engaged status comes from the master PRIM, so with all PRIMs lost an engaged autopilot is no longer reported engaged.';

const PRIM_NOT_SUCCESSFUL_LINES =
  'Procedure lines: FOR TAXI: FLAP LVR 1 (from one minute after landing, also after engine shutdown), PRIM OFF THEN ON, and if not successful PRIM OFF (PRIM 2: KEEP ON instead of OFF when the DC EHA bus is not powered). SPD BRK: DO NOT USE appears when two PRIMs are lost; FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE appear in flight when PRIM 2 and 3 are both lost, or PRIM 2 was lost before take-off; GA THR: TOGA ONLY and the differential braking line appear when all three are lost; LDG DIST AFFECTED always.';

const PRIM_FAULT_ALERT_IDS = ['271800036', '271800037', '271800038'];
const SEC_FAULT_ALERT_IDS = ['271800058', '271800059', '271800060'];

// Spoiler pair driven by each computer (spoilers 1 to 8, the same on both wings); nothing takes a spoiler over
const PRIM_SPOILERS = ['6', '5', '4'];
const SEC_SPOILERS = ['3', '2 and 7', '1 and 8'];

const PRIM_ELEVATOR_ACTUATORS = ['left outer elevator', 'right outer elevator', 'left inner elevator'];
const PRIM_ELEVATOR_ALERT_IDS = ['271800033', '271800034', '271800035'];
const PRIM_RUDDER_ACTUATORS = ['upper rudder', 'upper rudder', 'lower rudder'];
const PRIM_RUDDER_ALERT_IDS = ['271800039', '271800040', '271800041'];

function primDetail(number: number): FailureDetail {
  const faultId = PRIM_FAULT_ALERT_IDS[number - 1];
  return {
    whatItIs:
      'The three primary flight control computers (PRIMs) compute the normal, alternate and direct control laws and drive the ailerons, spoilers, elevators, stabilizer and rudders. One PRIM is the master; if it cannot be, the next one takes over. They also host the autopilot, flight director and autothrust and the flight envelope protections.',
    impact: [
      `PRIM ${number} stops commanding its surfaces; if it was the master, the next healthy PRIM becomes the master.`,
      `Spoiler ${PRIM_SPOILERS[number - 1]} on each wing is lost: only PRIM ${number} drives that pair and no other computer takes it over.`,
      'With two PRIMs lost the speed brakes must not be used; with all three lost the aircraft is in direct law, flown by the SECs.',
    ],
    alertIds: [faultId, DIRECT_LAW_ALERT_ID],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL PRIM ${number} FAULT, amber caution with master caution and single chime. It needs the DC supply of the PRIM and is not raised on the ground with engines off, or after engine shutdown, while the PRIM pushbutton is OFF. A new alert is inhibited from second engine at take-off power through 1,500 ft and from 800 ft on approach down to touch down; once displayed it stays.`,
      },
      { where: 'E/WD', text: PRIM_NOT_SUCCESSFUL_LINES },
      { where: 'E/WD', text: DIRECT_LAW_ON_ALL_PRIMS_LOST },
      {
        where: 'Overhead F/CTL panel',
        text: `PRIM ${number} pushbutton FAULT light on while the PRIM is failed and the pushbutton is ON; it goes out when the crew selects OFF (OFF light on).`,
      },
      {
        where: 'SD F/CTL',
        text: `The page is called up when the alert first shows; PRIM ${number} is drawn with an amber outline and an amber number, and spoiler ${PRIM_SPOILERS[number - 1]} is drawn amber on both wings. BKUP CTL ACTIVE shows in amber only when all three PRIMs and all three SECs are lost.`,
      },
      {
        where: 'SD STATUS',
        text: `INOP SYS: PRIM ${number}, for as long as the PRIM is not healthy, including with its pushbutton OFF.`,
      },
    ],
    logbook: { required: true, reason: `PRIM ${number} fault, caution and degraded flight control redundancy` },
    clearing: RESTORE_COMPUTER,
  };
}

function secDetail(number: number): FailureDetail {
  const faultId = SEC_FAULT_ALERT_IDS[number - 1];
  const trimLine =
    number === 2
      ? 'SEC 2 does not drive a rudder trim channel.'
      : `SEC ${number} drives rudder trim channel ${number === 1 ? 1 : 2}: the STATUS shows REDUND LOSS RUDDER TRIM ${number === 1 ? 1 : 2}, or INOP SYS RUDDER TRIM if SEC 1 and SEC 3 are both lost.`;
  return {
    whatItIs:
      'The three secondary flight control computers (SECs) compute the direct control law and control the ailerons, spoilers, elevators, stabilizer and rudders as a back-up to the PRIMs. SEC 1 and SEC 3 also command the rudder trim. The SECs depend on fewer aircraft parameters than the PRIMs.',
    impact: [
      `SEC ${number} stops commanding its surfaces; the PRIMs and the other SECs carry on.`,
      `Spoiler${number === 1 ? '' : 's'} ${SEC_SPOILERS[number - 1]} on each wing ${number === 1 ? 'is' : 'are'} lost: only SEC ${number} drives ${number === 1 ? 'that pair' : 'those pairs'} and no other computer takes ${number === 1 ? 'it' : 'them'} over. If the three SECs are lost, five of the eight pairs (spoilers 1, 2, 3, 7 and 8) are lost.`,
      'The back-up for the PRIMs is reduced: with all PRIMs lost, direct law needs the remaining SECs.',
    ],
    alertIds: [faultId],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL SEC ${number} FAULT, amber caution with master caution and single chime. It needs the DC supply of the SEC and is not raised on the ground with engines off, or after engine shutdown, while the SEC pushbutton is OFF. A new alert is inhibited from second engine at take-off power through 1,500 ft and from 800 ft on approach down to touch down; once displayed it stays.`,
      },
      {
        where: 'E/WD',
        text: `Procedure lines: SEC ${number} OFF THEN ON, and if not successful SEC ${number} OFF (SEC 2: KEEP ON instead of OFF when the DC EHA bus is not powered), then LDG DIST AFFECTED. FOR TAXI: FLAP LVR 1 shows more than one minute after landing.`,
      },
      {
        where: 'Overhead F/CTL panel',
        text: `SEC ${number} pushbutton FAULT light on while the SEC is failed and the pushbutton is ON; it goes out when the crew selects OFF (OFF light on).`,
      },
      {
        where: 'SD F/CTL',
        text: `The page is called up when the alert first shows; SEC ${number} is drawn with an amber outline and an amber number, and spoiler${number === 1 ? '' : 's'} ${SEC_SPOILERS[number - 1]} ${number === 1 ? 'is' : 'are'} drawn amber on both wings.${number === 2 ? '' : ' With SEC 1 and SEC 3 both lost the rudder trim indication is removed.'}`,
      },
      {
        where: 'SD STATUS',
        text: `INOP SYS: SEC ${number} while it is not healthy, PART SPLRs (MOST SPLRs if all three SECs are lost). INFO: ON DRY RWY ONLY : LDG DIST AFFECTED < 15%. ${trimLine}`,
      },
    ],
    logbook: { required: true, reason: `SEC ${number} fault, caution and loss of flight control redundancy` },
    clearing: RESTORE_COMPUTER,
  };
}

function primElevatorActuatorDetail(number: number): FailureDetail {
  const actuator = PRIM_ELEVATOR_ACTUATORS[number - 1];
  return {
    whatItIs: `Each PRIM drives one actuator of its own on the elevators. PRIM ${number} normally controls the ${actuator} actuator, and the SEC that shares the actuator can engage it when the PRIM no longer does.`,
    impact: [
      `PRIM ${number} loses the control of the ${actuator} actuator; it sends no order and no longer reports the actuator as engaged.`,
      'The rest of the PRIM keeps working: its other surfaces are not touched.',
      'The actuator is left to the SEC that shares it.',
    ],
    alertIds: [PRIM_ELEVATOR_ALERT_IDS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL PRIM ${number} ELEVATOR ACTUATOR FAULT, amber advisory without master caution or chime, no action line. Shown only while PRIM ${number} is healthy and only on the ground before take-off or after engine shutdown; a new alert is inhibited from second engine at take-off power, in flight and after landing. If PRIM ${number} itself is lost, PRIM ${number} FAULT shows instead.`,
      },
      {
        where: 'SD',
        text: 'No F/CTL page call-up and no STATUS line: nothing else shows.',
      },
    ],
    logbook: { required: true, reason: `PRIM ${number} elevator actuator fault advisory` },
    clearing: 'Maintenance only: use Restore.',
  };
}

function primRudderActuatorDetail(number: number): FailureDetail {
  const actuator = PRIM_RUDDER_ACTUATORS[number - 1];
  return {
    whatItIs: `Each PRIM can drive a rudder actuator, in hydraulic or electric mode. The ${actuator} actuator is the one named for PRIM ${number}; the SEC that shares it can engage it when the PRIM no longer does.`,
    impact: [
      `PRIM ${number} loses the control of its first rudder actuator: no order, and neither the hydraulic nor the electric mode is reported engaged.`,
      'The rest of the PRIM keeps working: its other surfaces are not touched.',
      number === 1
        ? 'The upper rudder actuator is left to the SEC that shares it.'
        : 'PRIM 2 and PRIM 3 drive a rudder actuator only after a reconfiguration, so in the normal configuration nothing else changes.',
    ],
    alertIds: [PRIM_RUDDER_ALERT_IDS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL PRIM ${number} RUDDER ACTUATOR FAULT, amber advisory without master caution or chime, no action line. Shown only while PRIM ${number} is healthy and only on the ground before take-off or after engine shutdown; a new alert is inhibited from second engine at take-off power, in flight and after landing. If PRIM ${number} itself is lost, PRIM ${number} FAULT shows instead.`,
      },
      {
        where: 'SD',
        text: 'No F/CTL page call-up and no STATUS line: nothing else shows.',
      },
    ],
    logbook: { required: true, reason: `PRIM ${number} rudder actuator fault advisory` },
    clearing: 'Maintenance only: use Restore.',
  };
}

function fcdcDetail(number: number): FailureDetail {
  const otherNumber = number === 1 ? 2 : 1;
  return {
    whatItIs:
      'The two flight control data concentrators (FCDCs), hosted in the CPIOM-C, collect the data of the PRIMs and SECs for the F/CTL display, the flight warning system, maintenance and the recorders. They also give the control law status the other systems read.',
    impact: [
      `FCDC ${number} sends no valid data; the warning system and the control law symbols still read FCDC ${otherNumber}, so only the redundancy is lost there.`,
      `Both PFDs select the failed FCDC ${number} for their FMA data, so the FMA approach capability shows CAT1 at most (only when the landing mode is armed or active, or the approach condition is met), never CAT2, CAT3 SINGLE or CAT3 DUAL, on both PFDs.`,
      'If both FCDCs are lost the control law is no longer known to the displays: no ALTN LAW or DIRECT LAW alert, and the PFD uses the symbols of a non-normal law.',
    ],
    alertIds: number === 1 ? ['271800013', '271800015'] : ['271800014', '271800015'],
    effects: [
      {
        where: 'E/WD',
        text: `F/CTL FCDC ${number} FAULT, amber caution with master caution and single chime, no action line. ${
          number === 2 ? 'It needs the DC 2 bus to be powered. ' : ''
        }New alert inhibited from second engine at take-off power through 1,500 ft, from 800 ft on approach to touch down and after landing below 80 kt; it shows on the ground with engines off or one engine running before take-off, in climb, cruise and descent above 800 ft, and after engine shutdown.`,
      },
      {
        where: 'E/WD',
        text: 'If both FCDCs fail (and the DC 2 bus is powered), F/CTL FCDC 1+2 FAULT replaces the single alerts: amber caution with master caution and single chime, with AUDIOS NOT AVAIL : WINDSHEAR, SPEED SPEED. New alert inhibited from 80 kt through 1,500 ft and from 800 ft on approach to touch down.',
      },
      {
        where: 'SD STATUS',
        text: `REDUND LOSS: FCDC ${number} (FCDC 1+2 if both are lost) for as long as the condition holds. With both lost, INFO: AUDIOS NOT AVAIL : WINDSHEAR, SPEED SPEED and F/CTL INDICATIONS LOST; also INOP SYS APPR & LDG AUTOLAND and INFO APPR 1 ONLY, except on the ground with engines off or after engine shutdown.`,
      },
      {
        where: 'SD F/CTL',
        text: 'The page is called up when the alert first shows.',
      },
      {
        where: 'PFD',
        text: 'With FCDC 1 or FCDC 2 lost, both PFDs select the failed one, so the FMA approach capability shows CAT1 at most, never CAT2, CAT3 SINGLE or CAT3 DUAL, on both PFDs. Only with both FCDCs lost: the attitude symbols change to the ones used outside normal law and the V prot speed bug is removed.',
      },
    ],
    notSimulated: ['The SD F/CTL page keeps all its indications when both FCDCs are lost.'],
    logbook: { required: true, reason: `FCDC ${number} fault, caution and loss of redundancy` },
    clearing: 'Maintenance only: use Restore.',
  };
}

export const Ata27ComputersEntries: Record<number, FailureDetail> = {
  [A380Failure.PrimSoftwareVersions]: {
    whatItIs:
      'The three PRIMs must run the same software version. Each PRIM compares its version with the others and warns the crew when they differ.',
    impact: [
      'Only a warning to the crew: the computers keep running and the flight controls do not change.',
      'The check needs at least two healthy PRIMs.',
    ],
    alertIds: ['271800045'],
    effects: [
      {
        where: 'E/WD',
        text: 'F/CTL PRIM VERSIONS DISAGREE, amber advisory without master caution or chime, no action line. It shows only on the ground with engines off (the alert is inhibited in every other phase), while at least two PRIMs are healthy.',
      },
      { where: 'SD', text: 'No F/CTL page call-up and no STATUS line: nothing else shows.' },
    ],
    logbook: { required: true, reason: 'PRIM software versions disagree' },
    clearing: 'Maintenance only: use Restore.',
  },
  [A380Failure.SecSoftwareVersions]: {
    whatItIs:
      'The three SECs must run the same software version. Each SEC compares its version with the others and warns the crew when they differ.',
    impact: [
      'Only a warning to the crew: the computers keep running and the flight controls do not change.',
      'The check needs at least two healthy SECs.',
    ],
    alertIds: ['271800046'],
    effects: [
      {
        where: 'E/WD',
        text: 'F/CTL SEC VERSIONS DISAGREE, amber advisory without master caution or chime, no action line. It shows only on the ground with engines off (the alert is inhibited in every other phase), while at least two SECs are healthy.',
      },
      { where: 'SD', text: 'No F/CTL page call-up and no STATUS line: nothing else shows.' },
    ],
    logbook: { required: true, reason: 'SEC software versions disagree' },
    clearing: 'Maintenance only: use Restore.',
  },
  [A380Failure.PrimPinProgramming]: {
    whatItIs:
      'Configuration pins on the aircraft wiring tell each PRIM which aircraft configuration it is installed in. The three PRIMs must read the same pins, and the system warns the crew when they differ.',
    impact: [
      'A warning to the crew with a few inoperative functions in the STATUS: the PRIMs themselves keep running.',
      'The check needs at least two healthy PRIMs.',
    ],
    alertIds: ['271800047'],
    effects: [
      {
        where: 'E/WD',
        text: 'F/CTL PRIMs PIN PROG DISAGREE, amber advisory without master caution or chime, no action line. It shows only on the ground with engines off (the alert is inhibited in every other phase), while at least two PRIMs are healthy.',
      },
      {
        where: 'SD STATUS',
        text: 'INOP SYS: AP/FD TCAS MODE. INOP SYS APPR & LDG: BTV, RWY OVERRUN PROT. They are listed with the alert; the SD F/CTL page is not called up.',
      },
    ],
    logbook: { required: true, reason: 'PRIM pin programming disagree and inoperative functions' },
    clearing: 'Maintenance only: use Restore.',
  },
};

export const Ata27ComputersFamilies: FailureDetailFamily[] = [
  { ids: [A380Failure.Prim1, A380Failure.Prim2, A380Failure.Prim3], detail: primDetail },
  { ids: [A380Failure.Sec1, A380Failure.Sec2, A380Failure.Sec3], detail: secDetail },
  { ids: [A380Failure.Fcdc1, A380Failure.Fcdc2], detail: fcdcDetail },
  {
    ids: [
      A380Failure.Prim1ElevatorActuatorControl,
      A380Failure.Prim2ElevatorActuatorControl,
      A380Failure.Prim3ElevatorActuatorControl,
    ],
    detail: primElevatorActuatorDetail,
  },
  {
    ids: [
      A380Failure.Prim1RudderActuatorControl,
      A380Failure.Prim2RudderActuatorControl,
      A380Failure.Prim3RudderActuatorControl,
    ],
    detail: primRudderActuatorDetail,
  },
];
