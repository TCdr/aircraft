// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Alerts inhibited in flight phases 2 to 11 */
const SHOWN_ENGINES_OFF =
  'appears only with the engines off (before the first engine start or after shutdown); once shown it stays after engine start; set in flight, it gives no alert and no STATUS';

/** Alerts inhibited in flight phases 3-7, 9 and 10 */
const SHOWN_GROUND_AND_CRUISE =
  'not shown from take-off power until 1,500 ft, nor from 800 ft on approach until the aircraft slows below 80 kt after landing (once shown it stays)';

/** Alerts inhibited in flight phases 3-7, 9, 10 and 11 */
const SHOWN_NOT_LANDING_ROLL =
  'not shown from take-off power until 1,500 ft, nor from 800 ft on approach until the engines are shut down (once shown it stays)';

const ADVISORY = 'amber advisory without master caution or chime';
const CAUTION = 'amber caution with master caution and single chime';

const NO_NETWORK_EFFECT = 'The electrical network model does not react to this failure: only the alert follows.';

const NO_NETWORK_EFFECT_STATUS =
  'The electrical network model does not react to this failure: only the alert and STATUS follow.';

const PrimarySupplyCentreFamily: FailureDetailFamily = {
  ids: [A380Failure.PrimarySupplyCenter1, A380Failure.PrimarySupplyCenter2],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'left' : 'right';
    return {
      whatItIs:
        'The two primary supply centres distribute the high loads (more than 15 A) of the normal network, among them the galleys ' +
        `and commercial loads. Primary supply centre ${number} serves the ${side} cabin side.`,
      impact: [
        `Primary supply centre ${number} fails: the main and secondary galleys of the ${side} cabin side lose their power.`,
        'The rest of the electrical network is not affected.',
      ],
      alertIds: [number === 1 ? '240800070' : '240800071'],
      effects: [
        {
          where: 'E/WD',
          text: `ELEC PRIMARY SUPPLY CENTER ${number} FAULT, ${ADVISORY}, ${SHOWN_ENGINES_OFF}.`,
        },
        {
          where: 'SD STATUS',
          text: `While the alert is shown: ELEC PRIMARY CTR ${number} and PART COMMERCIAL inoperative. With both centres failed COMMERCIAL replaces PART COMMERCIAL.`,
        },
        {
          where: 'SD ELEC AC',
          text: 'GALLEY PARTIALLY SHED shows. With both centres failed it reads GALLEY SHED.',
        },
      ],
      logbook: { required: true, reason: 'galleys of one cabin side lost and ECAM alert' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const NetworkManagementUnitFamily: FailureDetailFamily = {
  ids: [A380Failure.NetworkManagementUnit1, A380Failure.NetworkManagementUnit2],
  detail: (number): FailureDetail => {
    const side = number === 1 ? 'left' : 'right';
    const apuGenerator = number === 1 ? 'A' : 'B';
    const externalPower = number === 1 ? '1 and 2' : '3 and 4';
    const generators = number === 1 ? '1+2' : '3+4';
    return {
      whatItIs:
        'The two electrical network management units close the contactors that connect the power sources to the ' +
        `network. Unit ${number} looks after the ${side} side: the APU generator ${apuGenerator}, external power ${externalPower}, ` +
        'and the engine generators and bus ties of that side.',
      impact: [
        `APU generator ${apuGenerator} and external power ${externalPower} no longer connect to the network.`,
        `An external power unit already supplying is disconnected, and stays off after Restore until its pushbutton is pushed again.`,
        `The main galleys of the ${side} cabin side are shed.`,
      ],
      alertIds: [number === 1 ? '240800052' : '240800053'],
      effects: [
        {
          where: 'E/WD',
          text:
            `ELEC ELEC NETWORK MANAGEMENT ${number} FAULT, ${CAUTION}, ${SHOWN_GROUND_AND_CRUISE}. ` +
            `It asks to keep GEN ${generators} on.`,
        },
        {
          where: 'SD STATUS',
          text: `While the alert is shown: ENMU ${number}, APU GEN ${apuGenerator} and PART GALLEY inoperative. On the ground EXT PWR ${externalPower} are listed too.`,
        },
        {
          where: 'SD ELEC AC',
          text: 'The page comes up with the alert when it is the first one on the E/WD and no page is selected. It shows GALLEY PARTIALLY SHED.',
        },
        {
          where: 'Overhead ELEC panel',
          text: `With ground power connected, the EXT PWR pushbuttons of the ${side} side show AVAIL, never ON; pushing them does nothing while the failure is set.`,
        },
      ],
      notSimulated: [
        `The engine generator and bus tie contactors of the ${side} side keep working; the real unit controls them too.`,
      ],
      logbook: { required: true, reason: 'ECAM caution, power sources and galleys lost' },
      clearing: `${MAINTENANCE_ONLY} Push the EXT PWR pushbuttons again to reconnect external power.`,
    };
  },
};

interface CabinSupplyCentreSide {
  side: string;
  commercial: 1 | 2;
  overheatAlert: string;
  detectionAlert: string;
}

const CABIN_SUPPLY_CENTRE_SIDES: readonly CabinSupplyCentreSide[] = [
  { side: 'left', commercial: 1, overheatAlert: '240800022', detectionAlert: '240800024' },
  { side: 'right', commercial: 2, overheatAlert: '240800023', detectionAlert: '240800025' },
];

const CabinSupplyCentreOverheatFamily: FailureDetailFamily = {
  ids: [A380Failure.CabinSupplyCenterLeftOverheat, A380Failure.CabinSupplyCenterRightOverheat],
  detail: (number): FailureDetail => {
    const { side, commercial, overheatAlert } = CABIN_SUPPLY_CENTRE_SIDES[number - 1];
    return {
      whatItIs:
        'The cabin supply centres in the upper deck distribute the commercial loads of the cabin. Each has temperature ' +
        `detectors, and the COMMERCIAL ${commercial} pushbutton sheds the commercial loads of the ${side} cabin side.`,
      impact: [
        `An overheat of the ${side} cabin supply centre is reported to the crew.`,
        `The crew sets COMMERCIAL ${commercial} OFF, which sheds the commercial loads of that side.`,
        'The overheat itself does not change any load or temperature in the model.',
      ],
      alertIds: [overheatAlert],
      effects: [
        {
          where: 'E/WD',
          text:
            `ELEC CABIN ${side === 'left' ? 'L' : 'R'} SUPPLY CENTER OVHT, ${CAUTION}, not shown from 80 kt on the ` +
            'take-off roll until 1,500 ft, nor from 800 ft on approach until the aircraft slows below 80 kt after landing (once shown it stays). ' +
            `It asks for COMMERCIAL ${commercial} OFF and stays while the failure is set, even with the pushbutton OFF.`,
        },
        {
          where: 'SD ELEC AC',
          text: `Setting COMMERCIAL ${commercial} OFF sheds the galleys of that side: COMMERCIAL PARTIALLY SHED shows.`,
        },
        {
          where: 'E/WD',
          text: `Not shown when the overheat detection of the ${side} side is also failed: the detection fault alert replaces it.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution for a cabin supply centre overheat' },
      clearing: `${MAINTENANCE_ONLY} COMMERCIAL ${commercial} OFF only ticks the procedure line.`,
    };
  },
};

const CabinSupplyCentreDetectionFamily: FailureDetailFamily = {
  ids: [A380Failure.CabinSupplyCenterLeftOverheatDetection, A380Failure.CabinSupplyCenterRightOverheatDetection],
  detail: (number): FailureDetail => {
    const { side, detectionAlert } = CABIN_SUPPLY_CENTRE_SIDES[number - 1];
    return {
      whatItIs:
        'Detectors watch the temperature in each cabin supply centre in the upper deck. They trigger the overheat alert ' +
        'for the centre and report their own faults.',
      impact: [
        `The overheat detection of the ${side} cabin supply centre is lost.`,
        'An overheat of that centre is no longer announced.',
        NO_NETWORK_EFFECT,
      ],
      alertIds: [detectionAlert],
      effects: [
        {
          where: 'E/WD',
          text: `ELEC CABIN ${side === 'left' ? 'L' : 'R'} SUPPLY CTR OVHT DET FAULT, ${ADVISORY}, ${SHOWN_ENGINES_OFF}.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM alert for the lost overheat detection' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const SecondarySupplyCentreFamily: FailureDetailFamily = {
  ids: [A380Failure.SecondarySupplyCenter1, A380Failure.SecondarySupplyCenter2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two secondary supply centres distribute the low loads (15 A or less) of the normal network. ' +
      `Secondary supply centre ${number} is one of the two.`,
    impact: [`Secondary supply centre ${number} fails and its supplies are reported lost.`, NO_NETWORK_EFFECT_STATUS],
    alertIds: [number === 1 ? '240800076' : '240800077'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC SECONDARY SUPPLY CENTER ${number} FAULT, ${ADVISORY}, ${SHOWN_ENGINES_OFF}.`,
      },
      { where: 'SD STATUS', text: `While the alert is shown: ELEC SECONDARY CTR ${number} inoperative.` },
      {
        where: 'E/WD',
        text:
          `While this failure is set, the DEGRADED and REDUND LOST alerts of centre ${number} are not shown; ` +
          'the FAULT alert replaces them.',
      },
    ],
    notSimulated: ['No load is actually lost: the systems that the centre supplies keep their power.'],
    logbook: { required: true, reason: 'ECAM alert for a lost supply centre' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const SecondarySupplyCentreCommunicationFamily: FailureDetailFamily = {
  ids: [A380Failure.SecondarySupplyCenter1Communication, A380Failure.SecondarySupplyCenter2Communication],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each secondary supply centre exchanges data with the avionics modules and with the systems it supplies. ' +
      'A loss of this communication makes the centre work degraded.',
    impact: [`The communication of secondary supply centre ${number} is degraded.`, NO_NETWORK_EFFECT_STATUS],
    alertIds: [number === 1 ? '240800074' : '240800075'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC SECONDARY SUPPLY CENTER ${number} DEGRADED, ${ADVISORY}, ${SHOWN_ENGINES_OFF}. Not shown while secondary supply centre ${number} FAULT is also failed.`,
      },
      { where: 'SD STATUS', text: `While the alert is shown: ELEC SECONDARY CTR ${number} inoperative.` },
    ],
    notSimulated: ['No load is actually lost: the systems that the centre supplies keep their power.'],
    logbook: { required: true, reason: 'ECAM alert for a degraded supply centre' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const SecondarySupplyCentreRedundancyFamily: FailureDetailFamily = {
  ids: [A380Failure.SecondarySupplyCenter1Redundancy, A380Failure.SecondarySupplyCenter2Redundancy],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Some systems are supplied by both secondary supply centres, so that one centre can take over from the other. ' +
      'Losing this back-up is reported as a loss of redundancy.',
    impact: [
      `Secondary supply centre ${number} loses the redundancy of some of its system supplies.`,
      NO_NETWORK_EFFECT,
    ],
    alertIds: [number === 1 ? '240800078' : '240800079'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC SECONDARY SUPPLY CTR ${number} REDUND LOST, ${ADVISORY}, ${SHOWN_ENGINES_OFF}. Not shown while secondary supply centre ${number} FAULT is also failed.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM alert for a lost redundancy' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const SecondarySupplyCentreFanFamily: FailureDetailFamily = {
  ids: [A380Failure.SecondarySupplyCenter1Fan, A380Failure.SecondarySupplyCenter2Fan],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each secondary supply centre is cooled by the avionics ventilation and by its own blowing fan. A failed fan ' +
      'leaves the centre with the avionics ventilation only.',
    impact: [`The fan of secondary supply centre ${number} fails.`, NO_NETWORK_EFFECT_STATUS],
    alertIds: [number === 1 ? '240800092' : '240800093'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC SECONDARY SUPPLY CENTER ${number} FAN FAULT, ${ADVISORY}, ${SHOWN_ENGINES_OFF}.`,
      },
      { where: 'SD STATUS', text: `While the alert is shown: ELEC SEC CTR ${number} FAN inoperative.` },
    ],
    notSimulated: ['The centre does not overheat or shut down without its fan.'],
    logbook: { required: true, reason: 'ECAM alert for a failed fan' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata24DistributionEntries: Record<number, FailureDetail> = {
  [A380Failure.LoadManagementUnit]: {
    whatItIs:
      'The electrical load management unit sheds the commercial loads automatically when the generators are overloaded, ' +
      'and reconnects them in order of priority. The ELMU pushbutton on the ELEC panel switches the function.',
    impact: [
      'The unit fails and the automatic shedding of low commercial loads is reported lost.',
      'The network model does not change: shedding on generator overload still works.',
    ],
    alertIds: ['240800069'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC LOAD MANAGEMENT FAULT, ${CAUTION}, ${SHOWN_NOT_LANDING_ROLL}. It asks for ELMU OFF.`,
      },
      { where: 'Overhead ELEC panel', text: 'The ELMU pushbutton FAULT light comes on.' },
      { where: 'SD STATUS', text: 'While the alert is shown: ELEC LOAD MANAGT inoperative.' },
      {
        where: 'SD ELEC AC',
        text: 'The page comes up with the alert when it is the first one on the E/WD and no page is selected.',
      },
    ],
    notSimulated: ['The automatic shedding of low commercial loads is not actually lost.'],
    logbook: { required: true, reason: 'ECAM caution and fault light' },
    clearing: `${MAINTENANCE_ONLY} ELMU OFF only ticks the procedure line.`,
  },
  [A380Failure.CircuitBreakerMonitoring]: {
    whatItIs:
      'The circuit breaker monitoring function watches the circuit breakers of the aircraft and identifies a breaker ' +
      'that has tripped.',
    impact: [
      'The monitoring function is lost.',
      'A tripped breaker can no longer be identified, so the C/B TRIPPED alert is not shown while this failure is set.',
    ],
    alertIds: ['240800020'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC C/B MONITORING FAULT, ${ADVISORY}, ${SHOWN_ENGINES_OFF}.`,
      },
      { where: 'SD STATUS', text: 'While the alert is shown: C/B MONITORING inoperative.' },
    ],
    notSimulated: ['The tripped breakers are no longer shown on the SD C/B page (that page is not simulated).'],
    logbook: { required: true, reason: 'ECAM alert for a lost monitoring function' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.EmergencyCircuitBreakerMonitoring]: {
    whatItIs:
      'The emergency circuit breaker monitoring function watches the circuit breakers of the emergency network and ' +
      'identifies a breaker that has tripped.',
    impact: ['The emergency monitoring function is lost.', NO_NETWORK_EFFECT_STATUS],
    alertIds: ['240800054'],
    effects: [
      {
        where: 'E/WD',
        text: `ELEC EMER C/B MONITORING FAULT, ${ADVISORY}, ${SHOWN_ENGINES_OFF}.`,
      },
      { where: 'SD STATUS', text: 'While the alert is shown: EMER C/B MONITORING inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM alert for a lost monitoring function' },
    clearing: MAINTENANCE_ONLY,
  },
  [A380Failure.CircuitBreakerTripped]: {
    whatItIs:
      'A circuit breaker opens by itself when its circuit carries too much current. The circuit breaker monitoring ' +
      'function reports a tripped breaker to the crew.',
    impact: [
      'A circuit breaker is reported as tripped.',
      'No circuit loses its power in the model: only the alert follows.',
    ],
    alertIds: ['240800021'],
    effects: [
      {
        where: 'E/WD',
        text:
          `ELEC C/B TRIPPED, ${CAUTION}, ${SHOWN_GROUND_AND_CRUISE}. Not shown while the C/B monitoring failure ` +
          'is also set.',
      },
    ],
    notSimulated: [
      'No real circuit breaker opens, and the SD C/B page (not simulated) does not show which one tripped.',
    ],
    logbook: { required: true, reason: 'ECAM caution for a tripped circuit breaker' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata24DistributionFamilies: FailureDetailFamily[] = [
  PrimarySupplyCentreFamily,
  NetworkManagementUnitFamily,
  CabinSupplyCentreOverheatFamily,
  CabinSupplyCentreDetectionFamily,
  SecondarySupplyCentreFamily,
  SecondarySupplyCentreCommunicationFamily,
  SecondarySupplyCentreRedundancyFamily,
  SecondarySupplyCentreFanFamily,
];
