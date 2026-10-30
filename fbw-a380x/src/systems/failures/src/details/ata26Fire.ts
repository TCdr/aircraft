// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const FIRE_WARNING = 'red warning, master warning and continuous repetitive chime';

const HELD_BACK_TAKE_OFF_ROLL_TO_400_FT =
  'A new warning is held back from V1 on the take-off roll until 400 ft after lift-off; one already shown stays.';

const HELD_BACK_ABOVE_V1 = 'A new warning is held back above V1 on the take-off roll; one already shown stays.';

const DET_FAULT_WHEN =
  'amber caution, master caution and single chime; a new alert is held back from take-off thrust until 1,500 ft, and below 800 ft on approach until slowed to 80 kt after landing; one already shown stays';

const LOOP_ADVISORY_WHEN =
  'amber advisory, no master caution or chime; a new alert shows only on the ground before take-off thrust is set and after the engines are shut down; one already shown stays';

const CARGO_BOTTLES_WHEN =
  'amber caution, master caution and single chime; a new alert is held back from 80 kt on the take-off roll until 1,500 ft, and below 800 ft on approach until slowed to 80 kt after landing; one already shown stays';

const FLAME_EFFECT =
  'if the other loop of the same zone fails within 5 s of this one, the detection unit takes it for a flame and gives a false fire warning that lasts while both failures stay, whatever the bottles discharge';

const ENGINE_FIRE_CLEARING =
  'Crew action: push the ENG FIRE pushbutton and discharge the AGENTs, about an even chance each. Otherwise maintenance only: use Restore; discharged bottles stay discharged and the pushbutton stays out until reset.';

/** ENG n FIRE: the same logic on all four engines, the in-flight procedure of engine 1 also has the APU bleed lines. */
function engineFireDetail(engine: number): FailureDetail {
  const outerEngine = engine === 1 || engine === 4;
  const flightAlert = String(260800005 + engine - 1);
  const groundAlert = String(260800009 + engine - 1);
  const shutDownAlert = String(701800109 + engine - 1);

  return {
    whatItIs:
      `Engine ${engine} has a fire protection system: two identical detection loops (A and B) of heat sensors feed ` +
      'a fire detection unit, and two extinguisher bottles are discharged from the ENG FIRE panel. A fire warning ' +
      'needs both loops to see the fire, or one loop to see it while the other is failed.',
    impact: [
      `A fire burns in engine ${engine} and the detection unit warns the crew; flames show on the engine when situation effects are enabled.`,
      'The procedure shuts the engine down and discharges the bottles; each discharge may put the fire out.',
      'The bleed of the burning engine is declared lost, which brings up the abnormal bleed configuration alert.',
    ],
    alertIds: [flightAlert, groundAlert, shutDownAlert, '211800056'],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FIRE in flight (${FIRE_WARNING}), with the recommendation LAND ASAP. ${HELD_BACK_TAKE_OFF_ROLL_TO_400_FT}`,
      },
      ...(engine === 1
        ? [
            {
              where: 'E/WD',
              text: 'The in-flight procedure adds APU BLEED: OFF while the APU is available, and APU BLEED: DO NOT USE once the ENG 1 FIRE pushbutton is pushed.',
            },
            {
              where: 'E/WD',
              text: 'The limitation APU BLEED DO NOT USE shows while the ENG 1 FIRE pushbutton stays out.',
            },
          ]
        : []),
      {
        where: 'E/WD',
        text: `ENG ${engine} FIRE on the ground (${FIRE_WARNING}), with the stop and evacuation lines. ${HELD_BACK_ABOVE_V1}`,
      },
      {
        where: 'E/WD',
        text:
          `ENG ${engine} SHUT DOWN (amber caution, master caution and single chime) once the ENG ${engine} FIRE ` +
          `pushbutton is pushed or the ENG ${engine} MASTER is set OFF, from take-off thrust until 80 kt after landing. ` +
          'A new alert is held back from V1 until 400 ft after lift-off; one already shown stays.',
      },
      {
        where: 'E/WD',
        text:
          'AIR ABNORM BLEED CONFIG (amber caution, master caution, no chime of its own) lists XBLEED: CLOSE while the crossbleed is open' +
          `${outerEngine ? ', with WING A-ICE: OFF and AVOID ICING CONDs' : ''}.`,
      },
      {
        where: 'E/WD',
        text: 'Once the engine is shut down, AIR ABNORM BLEED CONFIG shows the engine shut-down lines instead.',
      },
      ...(outerEngine
        ? [
            {
              where: 'E/WD',
              text: 'AVOID ICING CONDs also shows as a limitation, on the PFD too, while wing anti-ice is off.',
            },
          ]
        : []),
      {
        where: 'E/WD',
        text: 'AIR ABNORM BLEED CONFIG is held back from V1 until 400 ft after lift-off, like the fire warning.',
      },
      { where: 'Aural', text: `The chime stops when the ENG ${engine} FIRE pushbutton is pushed.` },
      { where: 'SD ENG', text: 'The ENG page is called up with the warning.' },
      {
        where: 'Overhead ENG FIRE panel',
        text: `Among others, the ENG ${engine} FIRE pushbutton light comes on while the fire is detected.`,
      },
      {
        where: 'Overhead ENG FIRE panel',
        text: `The AGENT 1 and 2 SQUIB lights come on once the pushbutton is pushed and go out on discharge; the DISCH lights then come on.`,
      },
      { where: 'Pedestal ENG MASTER panel', text: `The ENG ${engine} FIRE light comes on.` },
    ],
    logbook: { required: true, reason: 'the fire warning is raised and the engine is shut down' },
    clearing: ENGINE_FIRE_CLEARING,
  };
}

/** The letter of a detection loop and of its twin: odd positions are loop A, even ones loop B. */
function loopLetters(position: number): { loop: 'A' | 'B'; otherLoop: 'A' | 'B' } {
  return position % 2 === 1 ? { loop: 'A', otherLoop: 'B' } : { loop: 'B', otherLoop: 'A' };
}

/** Engine loop A and B of the four engines, in order: engine 1 A, engine 1 B, engine 2 A, ... */
function engineLoopDetail(position: number): FailureDetail {
  const engine = Math.ceil(position / 2);
  const { loop, otherLoop } = loopLetters(position);

  return {
    whatItIs:
      `Detection loop ${loop} of engine ${engine} is one of the two identical loops of heat sensors that watch the ` +
      'engine for fire. Both loops feed the fire detection unit, which compares them before it warns the crew.',
    impact: [
      `Loop ${loop} of engine ${engine} is lost; loop ${otherLoop} still protects the engine.`,
      'A real fire is still detected with one loop failed, but not with both loops failed.',
      `Both loops failed more than 5 s apart give a detection fault; within 5 s they give a false fire warning, then the detection fault.`,
    ],
    alertIds: [
      String(260800017 + position - 1),
      String(260800013 + engine - 1),
      String(260800005 + engine - 1),
      String(260800009 + engine - 1),
      String(701800109 + engine - 1),
      '211800056',
    ],
    effects: [
      {
        where: 'E/WD',
        text: `ENG ${engine} FIRE LOOP ${loop} FAULT (${LOOP_ADVISORY_WHEN}); hidden by the DET FAULT alert.`,
      },
      {
        where: 'E/WD',
        text: `ENG ${engine} FIRE DET FAULT (${DET_FAULT_WHEN}) once loop ${otherLoop} is failed too, for 5 s.`,
      },
      {
        where: 'E/WD',
        text: `ENG ${engine} FIRE, in flight or on the ground (${FIRE_WARNING}), ${FLAME_EFFECT}.`,
      },
      {
        where: 'E/WD',
        text: `AIR ABNORM BLEED CONFIG follows the false warning, and ENG ${engine} SHUT DOWN follows if the crew shuts the engine down.`,
      },
      {
        where: 'SD STATUS',
        text: `ENG ${engine} FIRE LOOP ${loop} is listed as inoperative in every phase, or ENG ${engine} FIRE DET when both loops are failed.`,
      },
    ],
    logbook: { required: true, reason: 'the loop is lost and listed as inoperative' },
    clearing: 'Maintenance only: use Restore. A false warning goes out at once when one of the two loops is restored.',
  };
}

function apuLoopDetail(position: number): FailureDetail {
  const { loop, otherLoop } = loopLetters(position);

  return {
    whatItIs:
      `Detection loop ${loop} of the APU is one of the two identical loops of heat sensors in the APU compartment. ` +
      'Both loops feed the fire detection unit, which compares them before it warns the crew.',
    impact: [
      `APU loop ${loop} is lost; loop ${otherLoop} still protects the APU.`,
      'A real APU fire is still detected with one loop failed, but not with both loops failed.',
      'A false fire on the ground shuts the APU down and discharges its bottle.',
    ],
    alertIds: [String(260800003 + position - 1), '260800002', '260800001', '490800001'],
    effects: [
      {
        where: 'E/WD',
        text: `APU FIRE LOOP ${loop} FAULT (${LOOP_ADVISORY_WHEN}); hidden by the DET FAULT alert.`,
      },
      {
        where: 'E/WD',
        text: `APU FIRE DET FAULT (${DET_FAULT_WHEN}) once loop ${otherLoop} is failed too.`,
      },
      {
        where: 'E/WD',
        text: `APU FIRE (${FIRE_WARNING}), ${FLAME_EFFECT}. ${HELD_BACK_TAKE_OFF_ROLL_TO_400_FT}`,
      },
      {
        where: 'E/WD',
        text: 'On the ground the APU also shuts down at once and its bottle discharges after 10 s.',
      },
      {
        where: 'E/WD',
        text: `APU FAULT (${DET_FAULT_WHEN}) once the false warning is gone, while the APU MASTER SW is still on.`,
      },
      { where: 'SD STATUS', text: 'APU is listed as inoperative while the APU FAULT alert shows.' },
      {
        where: 'SD STATUS',
        text: `APU FIRE LOOP ${loop} is listed as inoperative in every phase; APU FIRE DET is added while the DET FAULT alert shows.`,
      },
    ],
    logbook: { required: true, reason: 'the loop is lost and listed as inoperative' },
    clearing: 'Maintenance only: use Restore. A false warning goes out at once when one of the two loops is restored.',
  };
}

function mlgLoopDetail(position: number): FailureDetail {
  const { loop, otherLoop } = loopLetters(position);

  return {
    whatItIs:
      `Detection loop ${loop} of the main landing gear bays is one of the two identical loops that watch the bays for ` +
      'overheat. Both loops feed the fire detection unit, which compares them before it warns the crew.',
    impact: [
      `MLG bay loop ${loop} is lost; loop ${otherLoop} still protects the bays.`,
      'A real fire is still detected with one loop failed, but not with both loops failed.',
      'Unlike the engines and the APU, two failures close together give no false fire warning here.',
    ],
    alertIds: [String(260800027 + position - 1), '260800026'],
    effects: [
      {
        where: 'E/WD',
        text: `MLG BAY FIRE LOOP ${loop} FAULT (${LOOP_ADVISORY_WHEN}); hidden by the DET FAULT alert.`,
      },
      {
        where: 'E/WD',
        text: `MLG BAY FIRE DET FAULT (${DET_FAULT_WHEN}) once loop ${otherLoop} is failed too.`,
      },
      {
        where: 'SD STATUS',
        text: `MLG BAY FIRE LOOP ${loop} is listed as inoperative in every phase.`,
      },
      {
        where: 'SD STATUS',
        text: 'MLG BAY FIRE DET, and APU FIRE DET too, are listed after both loops have been failed for 5 s.',
      },
    ],
    logbook: { required: true, reason: 'the loop is lost and listed as inoperative' },
    clearing: 'Maintenance only: use Restore.',
  };
}

function cargoBottleLowPressureDetail(bottle: number): FailureDetail {
  return {
    whatItIs:
      'Two extinguisher bottles serve all cargo compartments. Bottle 1 is the bigger one and empties into the affected ' +
      'compartment in about a minute; bottle 2 then empties slowly, over about four hours, to hold the agent ' +
      'concentration.',
    impact: [
      `Cargo bottle ${bottle} loses its agent and has nothing left to discharge, if it is still full when the failure is set.`,
      `The other bottle still discharges when AGENT TO is pressed${bottle === 1 ? ', slowly' : ''}.`,
    ],
    alertIds: [String(260800052 + bottle - 1)],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE FWD+AFT CARGO BTL ${bottle} FAULT (${CARGO_BOTTLES_WHEN}).`,
      },
      { where: 'SD STATUS', text: `FWD+AFT CRGs BTL ${bottle} is listed as inoperative.` },
      {
        where: 'Overhead CARGO SMOKE panel',
        text: `The BTL ${bottle} light does not come on when AGENT TO is pressed, as the bottle is empty and not discharged.`,
      },
    ],
    logbook: { required: true, reason: 'the alert is raised and the bottle is lost' },
    clearing:
      'Restoring the failure does not refill the bottle: it stays at low pressure until the flight is restarted.',
  };
}

function cargoDiverterValveDetail(position: number): FailureDetail {
  const compartment = position === 1 ? 'forward' : 'aft/bulk';
  const name = position === 1 ? 'FWD' : 'AFT';
  const otherName = position === 1 ? 'AFT' : 'FWD';

  return {
    whatItIs:
      'A diverter valve directs the agent of the two cargo extinguisher bottles to either the forward or the ' +
      'aft/bulk cargo compartment, depending on which AGENT TO pushbutton the crew presses first.',
    impact: [
      `The valve cannot take its ${name} position: the agent can no longer be sent to the ${compartment} compartment.`,
      `AGENT TO ${name} fires nothing, while AGENT TO ${otherName} still works.`,
    ],
    alertIds: [position === 1 ? '260800043' : '260800044', '260800051'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE ${name} CARGO BOTTLES FAULT (${CARGO_BOTTLES_WHEN}).`,
      },
      {
        where: 'E/WD',
        text: `SMOKE FWD+AFT CARGO BOTTLES FAULT, same terms, replaces it when the ${otherName} position of the valve is also failed.`,
      },
      { where: 'SD STATUS', text: `${name} CARGO BTLs is listed as inoperative; both lines under the combined alert.` },
      {
        where: 'Overhead CARGO SMOKE panel',
        text: `AGENT TO ${name} releases no agent, so the BTL lights come on only after AGENT TO ${otherName} is pressed.`,
      },
    ],
    logbook: { required: true, reason: 'the alert is raised and the extinguishing is degraded' },
    clearing: 'Maintenance only: use Restore.',
  };
}

function crewRestFireBottleDetail(bottle: number): FailureDetail {
  return {
    whatItIs:
      'Two extinguisher bottles can discharge agent into the aft lower deck cabin crew rest compartment. They are ' +
      'operated from the compartment by the cabin crew.',
    impact: [
      `Fire extinguisher bottle ${bottle} of the aft lower deck cabin crew rest is declared failed.`,
      'The crew is made aware; the other bottle is still available.',
    ],
    alertIds: [String(260800054 + bottle - 1)],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE AFT LWR CAB REST BTL ${bottle} FAULT (amber advisory, no master caution or chime; a new alert is held back from take-off thrust until 1,500 ft, and below 800 ft on approach until the engines are shut down; one already shown stays).`,
      },
      { where: 'SD STATUS', text: `AFT LWR REST BTL ${bottle} is listed as inoperative.` },
    ],
    notSimulated: ['The bottles cannot be discharged: the compartment and its cabin crew panel are not modelled.'],
    logbook: { required: true, reason: 'the alert is raised and the bottle is lost' },
    clearing: 'Maintenance only: use Restore.',
  };
}

export const Ata26FireEntries: Record<number, FailureDetail> = {
  [A380Failure.Engine1Fire]: engineFireDetail(1),

  [A380Failure.APUFire]: {
    whatItIs:
      'The APU compartment has a fire protection system: two identical detection loops (A and B) feed the fire ' +
      'detection unit, and one extinguisher bottle is discharged from the APU FIRE panel.',
    impact: [
      'A fire burns in the APU compartment and the detection unit warns the crew; smoke shows at the APU exhaust when situation effects are enabled.',
      'On the ground the APU shuts down by itself and the bottle discharges after 10 s; in flight the crew does it.',
    ],
    alertIds: ['260800001', '490800001'],
    effects: [
      {
        where: 'E/WD',
        text: `APU FIRE (${FIRE_WARNING}), with the recommendation LAND ASAP in flight. ${HELD_BACK_TAKE_OFF_ROLL_TO_400_FT}`,
      },
      {
        where: 'E/WD',
        text: `APU FAULT (${DET_FAULT_WHEN}) once the fire is out, while the APU MASTER SW is still on: the APU is in emergency shutdown after a ground fire or the APU FIRE pushbutton.`,
      },
      { where: 'SD STATUS', text: 'APU is listed as inoperative while the APU FAULT alert shows.' },
      { where: 'Aural', text: 'The chime stops when the APU FIRE pushbutton is pushed.' },
      { where: 'SD APU', text: 'The APU page is called up with the warning.' },
      {
        where: 'Overhead APU FIRE panel',
        text: 'Among others, the FIRE pushbutton light comes on while the fire is detected.',
      },
      {
        where: 'Overhead APU FIRE panel',
        text: 'The AGENT SQUIB light comes on once the pushbutton is pushed and goes out on discharge; the DISCH light then comes on.',
      },
    ],
    notSimulated: ['The external horn and the APU FIRE light on the nose gear maintenance panel are not modelled.'],
    logbook: { required: true, reason: 'the fire warning is raised and the APU is shut down' },
    clearing:
      'In flight, push the APU FIRE pushbutton and discharge the AGENT, about an even chance. On the ground the bottle fires by itself once, with the same chance. Otherwise maintenance only: use Restore; the bottle stays discharged, and APU FAULT follows until the APU MASTER SW is set OFF.',
  },

  [A380Failure.MLGFire]: {
    whatItIs:
      'The main landing gear bays have a fire detection system with two identical loops (A and B) that watch the ' +
      'bays for overheat. There is no extinguisher: the crew keeps the gear down and avoids further heat.',
    impact: [
      'A fire is detected in the main landing gear bays and the crew is warned.',
      'The flight is limited in speed and the procedure asks for the gear to stay down.',
    ],
    alertIds: ['260800025'],
    effects: [
      {
        where: 'E/WD',
        text: `MLG BAY FIRE (${FIRE_WARNING}), with the recommendation LAND ASAP in flight and the limitation MAX SPEED : 250/.55. ${HELD_BACK_ABOVE_V1}`,
      },
      { where: 'PFD', text: 'The limitation MAX SPEED : 250/.55 is shown.' },
      { where: 'SD WHEEL', text: 'The WHEEL page is called up with the warning.' },
    ],
    logbook: { required: true, reason: 'the fire warning is raised and a limitation applies' },
    clearing:
      'Maintenance only: use Restore. The bays have no extinguisher in the model, so the warning stays until then.',
  },

  [A380Failure.CargoFireBottleControl]: {
    whatItIs:
      'The cargo fire bottle control system routes the agent of the two bottles when the crew presses an AGENT TO ' +
      'pushbutton, together with the diverter valve to the forward or aft/bulk compartment.',
    impact: [
      'The bottles can no longer be discharged into either cargo compartment.',
      'AGENT TO FWD and AGENT TO AFT fire nothing; the smoke detection itself keeps working.',
    ],
    alertIds: ['260800051'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE FWD+AFT CARGO BOTTLES FAULT (${CARGO_BOTTLES_WHEN}).`,
      },
      { where: 'SD STATUS', text: 'FWD CARGO BTLs and AFT CARGO BTLs are listed as inoperative.' },
      { where: 'Overhead CARGO SMOKE panel', text: 'AGENT TO FWD and AFT release no agent; the BTL lights stay off.' },
    ],
    logbook: { required: true, reason: 'the alert is raised and the extinguishing is lost' },
    clearing: 'Maintenance only: use Restore.',
  },
};

export const Ata26FireFamilies: FailureDetailFamily[] = [
  {
    ids: [A380Failure.Engine2Fire, A380Failure.Engine3Fire, A380Failure.Engine4Fire],
    detail: (position) => engineFireDetail(position + 1),
  },
  {
    ids: [
      A380Failure.Engine1LoopA,
      A380Failure.Engine1LoopB,
      A380Failure.Engine2LoopA,
      A380Failure.Engine2LoopB,
      A380Failure.Engine3LoopA,
      A380Failure.Engine3LoopB,
      A380Failure.Engine4LoopA,
      A380Failure.Engine4LoopB,
    ],
    detail: engineLoopDetail,
  },
  { ids: [A380Failure.APULoopA, A380Failure.APULoopB], detail: apuLoopDetail },
  { ids: [A380Failure.MLGLoopA, A380Failure.MLGLoopB], detail: mlgLoopDetail },
  {
    ids: [A380Failure.CargoFireBottle1LowPressure, A380Failure.CargoFireBottle2LowPressure],
    detail: cargoBottleLowPressureDetail,
  },
  {
    ids: [A380Failure.AftLowerCabinCrewRestFireBottle1, A380Failure.AftLowerCabinCrewRestFireBottle2],
    detail: crewRestFireBottleDetail,
  },
  {
    ids: [A380Failure.CargoFireDiverterValveFwdPosition, A380Failure.CargoFireDiverterValveAftPosition],
    detail: cargoDiverterValveDetail,
  },
];
