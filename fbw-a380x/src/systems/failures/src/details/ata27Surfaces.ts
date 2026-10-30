// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const ACTUATOR_ADVISORY_WHEN =
  'amber advisory, no master caution or chime; a new alert shows only on the ground before take-off thrust is set, in climb, cruise and descent above 800 ft, and after the engines are shut down; one already shown stays';

const ACTUATOR_CAUTION_WHEN =
  'amber caution, master caution and single chime; a new alert shows only on the ground before take-off thrust is set, in climb, cruise and descent above 800 ft, and after the engines are shut down; one already shown stays';

const AILERON_LOST_WHEN =
  'amber caution, master caution and single chime; a new alert is held back from 80 kt on the take-off roll until 1,500 ft, and at touch down; one already shown stays';

const ELEVATOR_LOST_WHEN =
  'amber caution, master caution and single chime; a new alert is held back from 80 kt on the take-off roll until 1,500 ft; one already shown stays';

const SD_CALL_UP =
  'The SD F/CTL page is called up when the alert first shows, unless the crew has selected another page.';

const RESTORE_CLEARING = 'Maintenance only: use Restore.';

/** Only the hand-over to an EHA is limited: the other way round the hydraulic actuator always takes over. */
const EHA_TAKE_OVER =
  'An EHA takes over a failed hydraulic actuator in flight, within two minutes of touch down, or while an engine starter is active; after that on the ground the surface is left with no active actuator.';

const HYDRAULIC_TAKE_OVER = 'A failed active actuator hands its order over to the other actuator of the surface.';

interface AileronSurface {
  /** the surface in plain words */
  name: string;
  /** actuator 1 and actuator 2, in the order of the failure ids */
  failures: [number, number];
  /** outer: green and yellow hydraulic actuators; mid: yellow actuator and EHA; inner: green actuator and EHA */
  arrangement: 'outer' | 'mid' | 'inner';
  lostAlertId: string;
  lostAlertTitle: string;
  inopLine: string;
}

const AILERON_SURFACES: AileronSurface[] = [
  {
    name: 'left outer',
    failures: [A380Failure.LeftOuterAileronGreenActuator, A380Failure.LeftOuterAileronYellowActuator],
    arrangement: 'outer',
    lostAlertId: '271800023',
    lostAlertTitle: 'F/CTL L OUTR AILERON FAULT',
    inopLine: 'L OUTR AILERON',
  },
  {
    name: 'left mid',
    failures: [A380Failure.LeftMidAileronYellowActuator, A380Failure.LeftMidAileronEha],
    arrangement: 'mid',
    lostAlertId: '271800021',
    lostAlertTitle: 'F/CTL L MID AILERON FAULT',
    inopLine: 'L MID AILERON',
  },
  {
    name: 'left inner',
    failures: [A380Failure.LeftInnerAileronGreenActuator, A380Failure.LeftInnerAileronEha],
    arrangement: 'inner',
    lostAlertId: '271800019',
    lostAlertTitle: 'F/CTL L INR AILERON FAULT',
    inopLine: 'L INR AILERON',
  },
  {
    name: 'right inner',
    failures: [A380Failure.RightInnerAileronGreenActuator, A380Failure.RightInnerAileronEha],
    arrangement: 'inner',
    lostAlertId: '271800020',
    lostAlertTitle: 'F/CTL R INR AILERON FAULT',
    inopLine: 'R INR AILERON',
  },
  {
    name: 'right mid',
    failures: [A380Failure.RightMidAileronYellowActuator, A380Failure.RightMidAileronEha],
    arrangement: 'mid',
    lostAlertId: '271800022',
    lostAlertTitle: 'F/CTL R MID AILERON FAULT',
    inopLine: 'R MID AILERON',
  },
  {
    name: 'right outer',
    failures: [A380Failure.RightOuterAileronGreenActuator, A380Failure.RightOuterAileronYellowActuator],
    arrangement: 'outer',
    lostAlertId: '271800024',
    lostAlertTitle: 'F/CTL R OUTR AILERON FAULT',
    inopLine: 'R OUTR AILERON',
  },
];

interface ElevatorSurface {
  name: string;
  /** the hydraulic actuator, then the EHA */
  failures: [number, number];
  hydraulicSystem: 'green' | 'yellow';
  inopLine: string;
}

const ELEVATOR_SURFACES: ElevatorSurface[] = [
  {
    name: 'left outer',
    failures: [A380Failure.LeftOuterElevatorGreenActuator, A380Failure.LeftOuterElevatorEha],
    hydraulicSystem: 'green',
    inopLine: 'L OUTR ELEVATOR',
  },
  {
    name: 'left inner',
    failures: [A380Failure.LeftInnerElevatorGreenActuator, A380Failure.LeftInnerElevatorEha],
    hydraulicSystem: 'green',
    inopLine: 'L INR ELEVATOR',
  },
  {
    name: 'right inner',
    failures: [A380Failure.RightInnerElevatorYellowActuator, A380Failure.RightInnerElevatorEha],
    hydraulicSystem: 'yellow',
    inopLine: 'R INR ELEVATOR',
  },
  {
    name: 'right outer',
    failures: [A380Failure.RightOuterElevatorYellowActuator, A380Failure.RightOuterElevatorEha],
    hydraulicSystem: 'yellow',
    inopLine: 'R OUTR ELEVATOR',
  },
];

function aileronActuatorNames(surface: AileronSurface): [string, string] {
  switch (surface.arrangement) {
    case 'outer':
      return ['green hydraulic actuator', 'yellow hydraulic actuator'];
    case 'mid':
      return ['yellow hydraulic actuator', 'EHA'];
    default:
      return ['green hydraulic actuator', 'EHA'];
  }
}

function aileronActuatorDetail(surface: AileronSurface, actuator: 1 | 2): FailureDetail {
  const names = aileronActuatorNames(surface);
  const thisActuator = names[actuator - 1];
  const otherActuator = names[actuator === 1 ? 1 : 0];
  const isEha = thisActuator === 'EHA';
  const singleAlertId = isEha ? '271800007' : '271800006';
  const singleAlertTitle = isEha ? 'F/CTL AILERON ELEC ACTUATOR FAULT' : 'F/CTL AILERON ACTUATOR FAULT';
  const arrangement =
    surface.arrangement === 'outer'
      ? 'a green and a yellow hydraulic actuator'
      : `a ${names[0]} and an electro-hydrostatic actuator (EHA), which has its own pump and electrical supply`;
  const handOver = otherActuator === 'EHA' ? EHA_TAKE_OVER : HYDRAULIC_TAKE_OVER;

  return {
    whatItIs:
      `The ${surface.name} aileron is one of three ailerons on each wing. It is moved by ${arrangement}; ` +
      'one controls the surface while the other follows it, ready to take over. The flight control computers send ' +
      'their orders to both.',
    impact: [
      `The ${surface.name} aileron stays controlled by the ${otherActuator}, so roll control stays whole.`,
      `With the ${otherActuator} failed too the ${surface.name} aileron is lost: it floats and the crew gets a caution.`,
      handOver,
    ],
    alertIds: [singleAlertId, surface.lostAlertId],
    effects: [
      {
        where: 'E/WD',
        text: `${singleAlertTitle} (${ACTUATOR_ADVISORY_WHEN}) while this ${thisActuator} is the only failed actuator of the ${surface.name} aileron.`,
      },
      {
        where: 'E/WD',
        text: `${surface.lostAlertTitle} (${AILERON_LOST_WHEN}) once the ${otherActuator} is failed too, with the line LDG DIST AFFECTED; the actuator alert then goes out, unless another aileron has a failed actuator.`,
      },
      {
        where: 'SD F/CTL',
        text: `${SD_CALL_UP} The box of the failed actuator of the ${surface.name} aileron gets an amber frame; with both actuators failed the surface position index turns amber.`,
      },
      {
        where: 'SD STATUS',
        text: `While the alert is shown, INOP SYS lists ${surface.inopLine}, and BTV for approach and landing; the limitation LDG DIST AFFECTED shows for approach and landing (also on the E/WD LIMITATIONS area); the information lines are FUEL CONSUMPT INCRSD : FMS PRED DISREGARD and LDG DIST COEF < 1.40 ON DRY RUNWAY.`,
      },
    ],
    notSimulated: [
      'With two pairs of ailerons lost (other ailerons failed too) the real aircraft reverts to alternate law; the simulation stays in normal law, as the flight control computers do not read these failures.',
    ],
    clearing: RESTORE_CLEARING,
    logbook: { required: true, reason: `actuator fault alert, amber actuator frame on the SD` },
  };
}

function elevatorActuatorDetail(surface: ElevatorSurface, actuator: 1 | 2): FailureDetail {
  const hydraulicActuator = `${surface.hydraulicSystem} hydraulic actuator`;
  const isEha = actuator === 2;
  const thisActuator = isEha ? 'EHA' : hydraulicActuator;
  const otherActuator = isEha ? hydraulicActuator : 'EHA';
  const singleAlertId = isEha ? '271800012' : '271800011';
  const singleAlertTitle = isEha ? 'F/CTL ELEVATOR ELEC ACTUATOR FAULT' : 'F/CTL ELEVATOR ACTUATOR FAULT';

  return {
    whatItIs:
      `The ${surface.name} elevator is one of the four elevators on the trailing edge of the horizontal stabilizer. It is moved by a ` +
      `${hydraulicActuator} and an electro-hydrostatic actuator (EHA), which has its own pump and electrical ` +
      'supply; one controls the surface while the other follows it, ready to take over.',
    impact: [
      `The ${surface.name} elevator stays controlled by the ${otherActuator}, so pitch control stays whole.`,
      `With the ${otherActuator} failed too the ${surface.name} elevator is lost and floats.`,
      isEha ? HYDRAULIC_TAKE_OVER : EHA_TAKE_OVER,
    ],
    alertIds: [singleAlertId, '271800061', '271800010'],
    effects: [
      {
        where: 'E/WD',
        text: `${singleAlertTitle} (${isEha ? ACTUATOR_ADVISORY_WHEN : ACTUATOR_CAUTION_WHEN}) while this ${thisActuator} is the only failed actuator of the ${surface.name} elevator.`,
      },
      {
        where: 'E/WD',
        text: `F/CTL SINGLE ELEVATOR FAULT (${ELEVATOR_LOST_WHEN}) once the ${otherActuator} is failed too and no other elevator is lost; the actuator alert then goes out, unless another elevator has a failed actuator.`,
      },
      {
        where: 'E/WD',
        text: `F/CTL DOUBLE ELEVATOR FAULT (${ELEVATOR_LOST_WHEN}) instead of the single alert when two elevators or more are lost, with the line LDG PERF AFFECTED. The deferred procedure DOUBLE ELEVATOR FAULT is added for the approach: LDG PERF COMPUTATION (CONFIRM), INITIATE FLARE AT 50FT.`,
      },
      {
        where: 'SD F/CTL',
        text: `${SD_CALL_UP} The box of the failed actuator of the ${surface.name} elevator gets an amber frame; with both actuators failed the surface position index turns amber.`,
      },
      {
        where: 'SD STATUS',
        text: `While the alert is shown, INOP SYS lists ${surface.inopLine}. With two elevators lost it also lists BTV for approach and landing, the limitation LDG PERF AFFECTED shows for approach and landing (also on the E/WD LIMITATIONS area), and the information line is FUEL CONSUMPT INCRSD : FMS PRED DISREGARD.`,
      },
    ],
    notSimulated: [
      'A lost elevator reverts the real aircraft to alternate law (protections lost, ALTN LAW alert, maximum speed 310 kt / M .89); the simulation stays in normal law, as the flight control computers do not read these failures.',
    ],
    clearing: RESTORE_CLEARING,
    logbook: { required: true, reason: 'actuator fault alert, amber actuator frame on the SD' },
  };
}

export const Ata27SurfacesEntries: Record<number, FailureDetail> = {};

for (const surface of AILERON_SURFACES) {
  Ata27SurfacesEntries[surface.failures[0]] = aileronActuatorDetail(surface, 1);
  Ata27SurfacesEntries[surface.failures[1]] = aileronActuatorDetail(surface, 2);
}

for (const surface of ELEVATOR_SURFACES) {
  Ata27SurfacesEntries[surface.failures[0]] = elevatorActuatorDetail(surface, 1);
  Ata27SurfacesEntries[surface.failures[1]] = elevatorActuatorDetail(surface, 2);
}
