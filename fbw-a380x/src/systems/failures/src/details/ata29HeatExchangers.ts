// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Alerts inhibited in flight phases 4 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_4_TO_7_9_10 =
  'a new alert is not shown from 80 kt on take-off to 1,500 ft, nor from 800 ft on approach until the landing roll ' +
  'is below 80 kt';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const HEAT_EXCHANGER_DESCRIPTION =
  'Each hydraulic system has two air/hydraulic heat exchangers in a flap track fairing. They cool the hydraulic ' +
  'fluid with ambient air, helped by hydraulically driven fans on the ground. A fuel/hydraulic heat exchanger backs ' +
  'them up, and the HSMU opens its fuel valve when the reservoir temperature rises because an air/hydraulic ' +
  'exchanger failed.';

/** The alert of the green (1) or yellow (2) system, for the families with a pair of systems */
const colour = (number: number): string => (number === 1 ? 'G' : 'Y');
const colourWord = (number: number): string => (number === 1 ? 'green' : 'yellow');

// ---------------------------------------------------------------------------------------------------------------------
// Air/hydraulic heat exchanger
// ---------------------------------------------------------------------------------------------------------------------

const SYS_COOLING_FAULT_ALERTS = ['290800027', '290800028'] as const;

const AirHeatExchangerFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenAirHeatExchanger, A380Failure.YellowAirHeatExchanger],
  detail: (number): FailureDetail => ({
    whatItIs: HEAT_EXCHANGER_DESCRIPTION,
    impact: [
      `A ${colourWord(number)} air/hydraulic heat exchanger is lost. In flight the fuel/hydraulic heat exchanger ` +
        'takes over the cooling.',
      'The model has no fluid temperature, so the failed exchanger does not heat the fluid and no hydraulic ' +
        'function is lost.',
      'The use of the fuel exchanger in flight is remembered and reported once the aircraft is on the ground.',
    ],
    alertIds: [SYS_COOLING_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `Nothing appears in flight. After landing, HYD ${colour(number)} SYS COOLING FAULT appears, ${ADVISORY}; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}, so it shows once the landing roll is below 80 kt.`,
      },
      {
        where: 'E/WD',
        text:
          'The alert only exists if the failure was active in flight. Set on the ground, the failure shows nothing. ' +
          'It stays on the ground until the failure is cleared. It goes out at lift-off and comes back after each ' +
          'landing while the failure is set. Cleared in flight, nothing shows after landing.',
      },
    ],
    notSimulated: [
      'The fuel heated by the fuel/hydraulic heat exchanger, and the FUEL FEED TK TEMP HI alert it can cause, are not simulated.',
      'The reservoir temperature rise from a failed exchanger is not simulated.',
    ],
    logbook: { required: true, reason: 'cooling fault advisory after landing' },
    clearing:
      'Maintenance only: use Restore. On the ground the alert goes at once. Restored in flight, nothing shows after ' +
      'landing.',
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Fuel/hydraulic heat exchanger valve
// ---------------------------------------------------------------------------------------------------------------------

const FUEL_HEAT_EXCHANGER_VALVE_ALERTS = ['290800013', '290800014'] as const;

const FuelHeatExchangerValveFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenFuelHeatExchangerValve, A380Failure.YellowFuelHeatExchangerValve],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The fuel/hydraulic heat exchanger of each hydraulic system is a backup that cools the hydraulic fluid with ' +
      'fuel from engine feed tank 1 (green) or 4 (yellow). The HSMU, through the fuel system computer, opens its ' +
      'valve when the reservoir passes 85 °C and closes it below 40 °C. The fuel system computer keeps it shut with ' +
      'low feed tank fuel, fuel above 53 °C, crossfeed open, gravity feed, low feed pump pressure or the electrical ' +
      'emergency configuration.',
    impact: [
      `The ${colourWord(number)} fuel/hydraulic heat exchanger valve is reported as abnormally open or closed.`,
      'The model has no fuel or fluid temperature, so nothing else changes.',
    ],
    alertIds: [FUEL_HEAT_EXCHANGER_VALVE_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `HYD ${colour(number)} FUEL HEAT EXCHANGER VLV FAULT, ${CAUTION}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
      },
      {
        where: 'SD F/CTL',
        text: 'The page is called up with the alert, but shows nothing for this failure.',
      },
    ],
    notSimulated: ['The valve position and the fuel flow through the exchanger are not simulated.'],
    logbook: { required: true, reason: 'caution on the ECAM' },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Heat exchanger air leak and its detection
// ---------------------------------------------------------------------------------------------------------------------

const AIR_LEAK_ALERTS = ['290800015', '290800016'] as const;
const AIR_LEAK_DETECTION_FAULT_ALERTS = ['290800017', '290800018'] as const;

const AirLeakFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenHeatExchangerAirLeak, A380Failure.YellowHeatExchangerAirLeak],
  detail: (number): FailureDetail => ({
    whatItIs:
      'A leak detection watches the air/hydraulic heat exchanger area of each hydraulic system, in a flap track ' +
      'fairing, and reports an air leak.',
    impact: [
      `A hot air leak of the ${colourWord(number)} air/hydraulic heat exchanger is detected.`,
      'The model has no hot air in the fairing, so no system is damaged.',
    ],
    alertIds: [AIR_LEAK_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `HYD ${colour(number)} HEAT EXCHANGER AIR LEAK, ${ADVISORY}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          'If the leak detection of the same system has failed too, the leak is not reported, or goes out if already ' +
          'shown, and only the air leak detection fault shows.',
      },
      {
        where: 'SD HYD',
        text: 'The page is called up with the alert, but shows nothing for this failure.',
      },
    ],
    notSimulated: ['The hot air in the flap track fairing and its effects are not simulated.'],
    logbook: { required: true, reason: 'advisory on the ECAM' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AirLeakDetectionFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenHeatExchangerAirLeakDetection, A380Failure.YellowHeatExchangerAirLeakDetection],
  detail: (number): FailureDetail => ({
    whatItIs:
      'A leak detection watches the air/hydraulic heat exchanger area of each hydraulic system, in a flap track ' +
      'fairing, and reports an air leak.',
    impact: [
      `The ${colourWord(number)} heat exchanger leak detection is lost.`,
      'A hot air leak of that system can then no longer be reported.',
    ],
    alertIds: [AIR_LEAK_DETECTION_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `HYD ${colour(number)} HEAT EXCHANGER AIR LEAK DET FAULT, ${ADVISORY}; ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
      },
      {
        where: 'E/WD',
        text:
          `With the ${colourWord(number)} heat exchanger air leak failure also active, HYD ${colour(number)} HEAT ` +
          'EXCHANGER AIR LEAK does not appear, or goes out if already shown.',
      },
      {
        where: 'SD HYD',
        text: 'The page is called up with the alert, but shows nothing for this failure.',
      },
    ],
    logbook: { required: true, reason: 'advisory on the ECAM' },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Overheat detection channels
// ---------------------------------------------------------------------------------------------------------------------

const OVERHEAT_DETECTION_CHANNEL_ALERTS = ['290800023', '290800024', '290800025', '290800026'] as const;
const OVERHEAT_DETECTION_FAULT_ALERTS = ['290800033', '290800034'] as const;
const OverheatDetectionChannelFamily: FailureDetailFamily = {
  ids: [
    A380Failure.GreenOverheatDetectionChannelA,
    A380Failure.GreenOverheatDetectionChannelB,
    A380Failure.YellowOverheatDetectionChannelA,
    A380Failure.YellowOverheatDetectionChannelB,
  ],
  detail: (number): FailureDetail => {
    const system = number <= 2 ? 1 : 2;
    const channel = number % 2 === 1 ? 'A' : 'B';
    return {
      whatItIs:
        'The HSMU of each hydraulic system has two channels, A and B, and each of them detects a system overheat. One ' +
        'working channel is enough to detect an overheat of the reservoir or of an engine pump case drain.',
      impact: [
        `The other ${colourWord(system)} channel still detects an overheat, so nothing is lost.`,
        `With both ${colourWord(system)} channels lost, the system overheat detection is lost.`,
        `HYD ${colour(system)} SYS OVERHEAT and HYD ${colour(system)} SYS TEMP EXCESS HI can then no longer be raised.`,
      ],
      alertIds: [OVERHEAT_DETECTION_CHANNEL_ALERTS[number - 1], OVERHEAT_DETECTION_FAULT_ALERTS[system - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `HYD ${colour(system)} SYS CHAN ${channel} OVHT DET FAULT, ${ADVISORY}, while the other channel works; ` +
            `${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
        },
        {
          where: 'E/WD',
          text:
            `Both channels lost: HYD ${colour(system)} SYS OVHT DET FAULT, ${ADVISORY}, replaces the channel ` +
            `alerts; ${NOT_SHOWN_PHASES_4_TO_7_9_10}.`,
        },
        {
          where: 'SD STATUS',
          text:
            `${colour(system)} SYS CHAN ${channel} OVHT DET is listed under redundancy loss while only this channel ` +
            `is lost, whatever the flight phase. With both channels lost, ${colour(system)} SYS OVHT DET is listed as ` +
            'inoperative instead.',
        },
      ],
      logbook: { required: true, reason: 'advisory on the ECAM' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata29HeatExchangersFamilies: FailureDetailFamily[] = [
  AirHeatExchangerFamily,
  FuelHeatExchangerValveFamily,
  AirLeakFamily,
  AirLeakDetectionFamily,
  OverheatDetectionChannelFamily,
];
