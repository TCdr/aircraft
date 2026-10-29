// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power to 1,500 ft, on approach below 800 ft and in the landing roll';
const NOT_SHOWN_IN_TAKE_OFF_ROLL_AND_LANDING_ROLL =
  'not shown in the take-off roll above 80 kt and in the landing roll';

const ENG_FAIL_ALERTS = ['7700101', '7700102'] as const;
const ENG_SHUT_DOWN_ALERTS = ['7700111', '7700112'] as const;
const ENG_STALL_ALERTS = ['7700721', '7700722'] as const;
const ENG_OVER_LIMIT_ALERTS = ['7700731', '7700732'] as const;
const ENG_LOW_N1_ALERTS = ['7700921', '7700922'] as const;
const ENG_START_FAULT_ALERTS = ['7700801', '7700802'] as const;
const ENGINE_PUMP_LOW_PRESSURE_ALERTS = ['2900105', '2900106'] as const;
const ALL_ENGINES_FAILURE_ALERT = '7700027';
const GREEN_YELLOW_SYSTEM_LOW_PRESSURE_ALERT = '2900122';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ENGINE_NAMES = ['1', '2'] as const;
const PUMP_ALERT_TEXTS = ['HYD G ENG 1 PUMP LO PR', 'HYD Y ENG 2 PUMP LO PR'] as const;

const ENGINE_BASICS =
  'A turbofan engine has a fan (N1 rotor) in front and a core (N2 rotor) behind it. The FADEC, the engine computer, ' +
  'meters the fuel and controls the ignition and the start. The engine also drives its generator and, on engines ' +
  '1 and 2, a hydraulic pump.';

/** The effects of the engine alerts that both stop-type failures (flameout, seizure) raise */
function engineStoppedEffects(number: number) {
  const engine = ENGINE_NAMES[number - 1];
  return [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} FAIL once the core falls below idle: amber caution, shown in every phase, ENG page called. ` +
        'On the ground: thrust lever idle, ENG MASTER OFF. In flight: ENG MODE SEL IGN, thrust lever idle, then ' +
        'ENG MASTER OFF if not relit after 30 s.',
    },
    {
      where: 'E/WD',
      text: `ENG ${engine} SHUT DOWN replaces it once the ENG MASTER is OFF in flight, or the ENG ${engine} FIRE push button is pushed on the ground.`,
    },
    {
      where: 'E/WD',
      text:
        `${PUMP_ALERT_TEXTS[number - 1]} in flight only, with the ENG MASTER ON, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
        'Never on the ground; it goes when the ENG MASTER is set OFF. G+Y SYS LO PR replaces it with both engines out.',
    },
    {
      where: 'E/WD',
      text:
        'Both engines out in flight: ENG ALL ENGINES FAILURE, red warning with master warning, replacing the single ' +
        'engine alerts. Shown only airborne.',
    },
  ];
}

const FlameoutFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1Flameout, A320Failure.Eng2Flameout],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${ENGINE_BASICS} The engine runs while fuel burns in the combustion chamber. Two igniters light the fuel ` +
      'at a start and at a relight in flight.',
    impact: [
      'The flame goes out and stays out, so the fuel is cut and the engine loses its thrust.',
      'In flight the core and fan run down to windmill speed; on the ground the engine stops.',
      'The generator and the hydraulic pump of this engine lose their drive.',
      'In flight the FADEC tries a relight for 30 s; the engine lights up only inside the relight speed and altitude window.',
    ],
    alertIds: [
      ENG_FAIL_ALERTS[number - 1],
      ENG_SHUT_DOWN_ALERTS[number - 1],
      ENGINE_PUMP_LOW_PRESSURE_ALERTS[number - 1],
      GREEN_YELLOW_SYSTEM_LOW_PRESSURE_ALERT,
      ALL_ENGINES_FAILURE_ALERT,
    ],
    effects: engineStoppedEffects(number),
    notSimulated: ['The fuel flow is simply cut: no fuel or air system reacts to the lost combustion.'],
    logbook: { required: true, reason: 'ECAM caution and an engine lost' },
    clearing:
      'Relight with ENG MASTER OFF then ON (ENG MODE SEL IGN helps); in flight it lights up only inside the relight window. On the ground, start normally. Restore removes the failure.',
  }),
};

const SeizureFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1Seizure, A320Failure.Eng2Seizure],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${ENGINE_BASICS} The core carries the compressor and turbine that keep the engine running, and it drives the ` +
      'accessory gearbox with the generator and the hydraulic pump.',
    impact: [
      'The core stops turning within about 3 s and the fuel is cut. N2 falls to zero.',
      'No relight is possible while the failure is active, whatever the crew does.',
      'The generator and the hydraulic pump of this engine lose their drive.',
    ],
    alertIds: [
      ENG_FAIL_ALERTS[number - 1],
      ENG_SHUT_DOWN_ALERTS[number - 1],
      ENGINE_PUMP_LOW_PRESSURE_ALERTS[number - 1],
      GREEN_YELLOW_SYSTEM_LOW_PRESSURE_ALERT,
      ALL_ENGINES_FAILURE_ALERT,
    ],
    effects: engineStoppedEffects(number),
    notSimulated: [
      'No engine damage cascade: no fire, no vibration burst, no loss of oil or fuel through the engine.',
      'In flight the fan keeps windmilling although the core is stopped.',
    ],
    logbook: { required: true, reason: 'ECAM caution and an engine lost' },
    clearing: `${MAINTENANCE_ONLY} Afterwards the engine can be relit or started normally.`,
  }),
};

const FanBlockedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1FanBlocked, A320Failure.Eng2FanBlocked],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The fan is the large front rotor, turned by the low-pressure shaft, and it makes most of the thrust. During ' +
      'a start the starter turns the core (N2) and the air flowing through the engine makes the fan (N1) turn too.',
    impact: [
      'During a start on the ground the fan does not turn: N1 stays at 0 while the starter turns the core.',
      'The core cannot accelerate to idle, so the start never completes.',
      'Only starts on the ground are affected: a running engine and an engine in flight are not.',
    ],
    alertIds: [ENG_LOW_N1_ALERTS[number - 1], ENG_START_FAULT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${ENGINE_NAMES[number - 1]} LOW N1 once N2 is above 35 % with N1 below 2 % for 2 s: amber, master caution ` +
          'and single chime. It asks for thrust lever idle and ENG MASTER OFF, and goes with the ENG MASTER OFF or ' +
          'at lift-off. Not shown from the take-off roll above 80 kt until the engines are shut down after landing.',
      },
      { where: 'SD ENG', text: 'N1 reads 0 while N2 stops short of idle.' },
      {
        where: 'E/WD',
        text:
          `ENG ${ENGINE_NAMES[number - 1]} START FAULT HUNG START can follow when the core stops rising, ` +
          `${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It aborts an automatic start.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and an engine that cannot start' },
    clearing: 'Set the thrust lever to idle and the ENG MASTER to OFF, then use Restore. The next start is normal.',
  }),
};

const CompressorStallFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1CompressorStall, A320Failure.Eng2CompressorStall],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The compressor squeezes the incoming air before the fuel burns in it. A stall is a disturbance of the airflow ' +
      'through the compressor: the engine loses thrust and its parameters fluctuate.',
    impact: [
      'The engine stalls while the thrust command is at 60 % N1 or more, above approach thrust.',
      'The stalled engine loses thrust, its EGT rises, and N1 and N2 fluctuate.',
      'The stall ends once the thrust command is brought below 57 % N1, and comes back when thrust is increased again.',
    ],
    alertIds: [ENG_STALL_ALERTS[number - 1], ENG_OVER_LIMIT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${ENGINE_NAMES[number - 1]} STALL: amber caution. On the ground: thrust lever idle, ENG MASTER OFF. ` +
          `In flight: thrust lever idle, parameters check, stall procedure. ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      {
        where: 'E/WD',
        text: 'N1 and N2 swing by a few percent and the EGT climbs by up to 150 deg C. The thrust falls as if N1 were up to 15 % lower.',
      },
      { where: 'SD ENG', text: 'The ENG page is called. The N1 vibration is about 2 units higher.' },
      {
        where: 'E/WD',
        text: `A high EGT can add ENG ${ENGINE_NAMES[number - 1]} EGT OVER LIMIT, ${NOT_SHOWN_IN_TAKE_OFF_ROLL_AND_LANDING_ROLL}.`,
      },
    ],
    notSimulated: ['No engine bang or surge noise.'],
    logbook: { required: true, reason: 'ECAM caution and a degraded engine' },
    clearing: 'Set the thrust lever to idle, then advance it slowly until the stall comes back. Restore ends it.',
  }),
};

const EgtOvertemperatureFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1EgtOvertemperature, A320Failure.Eng2EgtOvertemperature],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The exhaust gas temperature (EGT) is measured behind the turbine. It shows how hard the engine works and ' +
      'is limited to protect the turbine. The limit is lower at climb and continuous thrust than at take-off.',
    impact: [
      'While the engine runs, the EGT is higher by an amount that grows with N1, 120 deg C at full N1.',
      'The EGT is above its limit at high thrust and back below it once the thrust is reduced.',
      'Thrust and the other parameters do not change.',
    ],
    alertIds: [ENG_OVER_LIMIT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${ENGINE_NAMES[number - 1]} EGT OVER LIMIT while the EGT is above its limit: amber caution. Thrust lever ` +
          'below the limit, or idle and ENG MASTER OFF past the second band. ' +
          `It is ${NOT_SHOWN_IN_TAKE_OFF_ROLL_AND_LANDING_ROLL}.`,
      },
      { where: 'E/WD', text: 'The EGT reading rises with the thrust and shows its limit exceedance.' },
    ],
    notSimulated: ['The engine takes no damage from the high EGT.'],
    logbook: { required: true, reason: 'ECAM caution and an engine limit exceeded' },
    clearing: 'Reduce the thrust of the engine to bring the EGT below its limit. Restore ends the failure.',
  }),
};

const OverspeedFamily: FailureDetailFamily = {
  ids: [A320Failure.Eng1Overspeed, A320Failure.Eng2Overspeed],
  detail: (number): FailureDetail => ({
    whatItIs:
      'N1 is the fan speed and N2 the core speed, both shown as a percentage of a reference speed. Each has a ' +
      'limit, and the FADEC keeps the engine below them.',
    impact: [
      'The N1 and N2 indications read too high while the engine runs: N1 up to 20 % more, N2 up to 6 % more.',
      'Only the indications change: the real engine speed and thrust stay the same.',
      'The indications pass their limits at high thrust only, and fall back once the thrust is reduced.',
    ],
    alertIds: [ENG_OVER_LIMIT_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${ENGINE_NAMES[number - 1]} N1 OVER LIMIT or N2 OVER LIMIT: amber caution, thrust lever below the limit. ` +
          `It is ${NOT_SHOWN_IN_TAKE_OFF_ROLL_AND_LANDING_ROLL}.`,
      },
      { where: 'E/WD', text: 'The N1 reads about a fifth high, 24 % in place of 20 % at idle; N2 reads 6 % high.' },
      { where: 'SD ENG', text: 'The N1 and N2 values read high as well.' },
    ],
    notSimulated: ['The engine does not overspeed: its speed and thrust are those of the thrust lever.'],
    logbook: { required: true, reason: 'ECAM caution and a false overspeed indication' },
    clearing: 'Reduce the thrust of the engine to bring the indications below their limits. Restore ends the failure.',
  }),
};

export const Ata72Entries: Record<number, FailureDetail> = {};

export const Ata72Families: FailureDetailFamily[] = [
  FlameoutFamily,
  SeizureFamily,
  FanBlockedFamily,
  CompressorStallFamily,
  EgtOvertemperatureFamily,
  OverspeedFamily,
];
