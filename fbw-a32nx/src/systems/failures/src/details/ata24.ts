// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 4, 5, 7 and 8: most bus alerts, the APU generator alert */
const NOT_SHOWN_ON_TAKE_OFF_AND_LANDING =
  'not shown on take-off from 80 kt to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

/** Flight phases 3, 4, 5, 7 and 8: the battery, TR, static inverter and crew awareness alerts */
const NOT_SHOWN_FROM_TAKE_OFF_POWER =
  'not shown from take-off power set to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

/** Flight phases 1, 4, 5, 7, 8 and 10: the generator fault and the IDG oil alerts */
const NOT_SHOWN_BEFORE_START_AND_AROUND_FLIGHT =
  'not shown before the first engine start, on take-off from 80 kt to 1,500 ft (or 2 min), from 800 ft on approach to 80 kt on landing, nor 5 min after shutdown';

const NOT_DRAWN_ON_SD_ELEC = 'The bus is not drawn on the page, so nothing changes there.';

/** LGCIU 2 FAULT (3200190): crew awareness, flight phases 3, 4, 5, 7 and 8 */
const LGCIU_2_FAULT_EFFECT = {
  where: 'E/WD',
  text: `LGCIU 2 FAULT, crew awareness only (no master caution, no chime), ${NOT_SHOWN_FROM_TAKE_OFF_POWER}. It gives way to LGCIU 1+2 FAULT if LGCIU 1 also faults.`,
};

const ABNORMAL_ALERT_FOLLOW_UPS = 'The alerts of the systems that lose their power can follow.';

const TrFamily: FailureDetailFamily = {
  ids: [A320Failure.TransformerRectifier1, A320Failure.TransformerRectifier2],
  detail: (number): FailureDetail => {
    const bus = number === 1 ? 'DC BUS 1' : 'DC BUS 2';
    return {
      whatItIs:
        'A transformer rectifier (TR) changes the 115 V AC of an AC bus into 28 V DC. TR 1 feeds DC BUS 1 from AC BUS ' +
        '1, TR 2 feeds DC BUS 2 from AC BUS 2. The DC BAT BUS is fed from whichever of the two DC buses is powered.',
      impact: [
        `TR ${number} gives no output, so ${bus} loses its own supply.`,
        number === 1
          ? 'DC BUS 1 and the DC BAT BUS stay unpowered for 5 s, then DC BUS 2 takes them over.'
          : 'DC BUS 1 takes DC BUS 2 over at once. The DC GND/FLT bus loses its feed, so LGCIU 2 is lost.',
        'The ESS TR starts to supply the DC ESS BUS, as a TR is no longer available.',
      ],
      alertIds: number === 1 ? ['2400114', '2400107', '2400106'] : ['2400115', '3200190'],
      effects: [
        {
          where: 'E/WD',
          text: `TR ${number} FAULT after 1 s, a caution with master caution and a single chime, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
        },
        ...(number === 1
          ? [
              {
                where: 'E/WD',
                text: 'DC BUS 1 FAULT and DC BAT BUS FAULT come up after 1 s and clear once DC BUS 2 has taken over.',
              },
            ]
          : []),
        ...(number === 2 ? [LGCIU_2_FAULT_EFFECT] : []),
        { where: 'SD ELEC', text: `The TR ${number} box turns amber and the ESS TR box shows its values.` },
        { where: 'SD STATUS', text: `CAT 3 SINGLE ONLY; TR ${number} and CAT 3 DUAL listed as inoperative.` },
      ],
      logbook: { required: true, reason: 'ECAM caution and a lost transformer rectifier' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const BatteryFamily: FailureDetailFamily = {
  ids: [A320Failure.Battery1, A320Failure.Battery2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two 28 V batteries are connected to the DC BAT BUS through contactors that the battery charge limiters ' +
      'control. They keep the DC HOT buses alive, start the APU, and carry the essential buses until the emergency ' +
      'generator takes over.',
    impact: [
      `Battery ${number} gets an internal cell short while it is on charge from a powered DC BAT BUS.`,
      'Its charging current rises by about 2 A each second, up to 100 A, and its voltage drops by 1.5 V.',
      'After 2 s above 12 A its charge limiter opens the battery contactor and latches the fault.',
      'The APU can no longer be started on batteries: both battery contactors must be closed.',
    ],
    alertIds: [['2400201', '2400202'][number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `BAT ${number} FAULT, a caution with master caution and a single chime, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      { where: 'Overhead ELEC panel', text: `The BAT ${number} pb FAULT light comes on.` },
      { where: 'SD STATUS', text: `APU BAT START NOT AVAIL; BAT ${number} listed as inoperative.` },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost battery' },
    clearing:
      'Setting the BAT pb to OFF resets the latched fault, but the runaway restarts when the battery is on charge ' +
      'again: use Restore.',
  }),
};

const BatteryChargeLimiterFamily: FailureDetailFamily = {
  ids: [A320Failure.BatteryChargeLimiter1, A320Failure.BatteryChargeLimiter2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each battery has a charge limiter. It closes the battery contactor when the battery may be connected to the ' +
      'DC BAT BUS, watches the charging current, and opens the contactor if the charge is abnormal.',
    impact: [
      `Battery charge limiter ${number} fails and keeps its battery contactor open.`,
      `Battery ${number} is cut off from the DC BAT BUS: it neither charges nor supplies the bus.`,
      'The APU can no longer be started on batteries: both battery contactors must be closed.',
    ],
    alertIds: [['2400203', '2400204'][number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `BCL ${number} FAULT, a caution with master caution and a single chime, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      { where: 'Overhead ELEC panel', text: `The BAT ${number} pb FAULT light comes on.` },
      { where: 'SD STATUS', text: `APU BAT START NOT AVAIL; BCL ${number} listed as inoperative.` },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost battery' },
    clearing: 'Maintenance only: use Restore. The BAT pb does not clear it.',
  }),
};

const GeneratorFamily: FailureDetailFamily = {
  ids: [A320Failure.Generator1, A320Failure.Generator2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each engine drives a 115 V AC, 400 Hz generator through its integrated drive. Generator 1 normally feeds AC ' +
      'BUS 1 and generator 2 feeds AC BUS 2. With the bus tie in AUTO, one generator can feed both buses.',
    impact: [
      `Generator ${number} gives no output and its line contactor opens.`,
      'The caution comes once the engine has run 15 s and the contactor has stayed open for about 5 s.',
      'The bus tie lets the other generator, the APU generator or external power keep both AC buses powered.',
      'With both generators lost and no APU or external power, the aircraft goes to the emergency configuration.',
    ],
    alertIds: [['2400001', '2400002'][number - 1]],
    effects: [
      {
        where: 'E/WD',
        text: `GEN ${number} FAULT, a caution with master caution and a single chime, ${NOT_SHOWN_BEFORE_START_AND_AROUND_FLIGHT}.`,
      },
      { where: 'Overhead ELEC panel', text: `The GEN ${number} pb FAULT light comes on.` },
      { where: 'SD ELEC', text: `The GEN ${number} box turns amber.` },
      {
        where: 'SD STATUS',
        text: `CAT 3 SINGLE ONLY; GEN ${number} and CAT 3 DUAL listed as inoperative, MAIN GALLEY too without the APU GEN.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost generator' },
    clearing: 'Maintenance only: use Restore. Switching the GEN pb OFF then ON does not clear it.',
  }),
};

const IDG_WHAT_IT_IS =
  'The integrated drive generator (IDG) is a constant speed drive between the engine gearbox and the generator, so ' +
  'the generator turns at a fixed speed and gives 400 Hz. Its oil is cooled by fuel and by air. The IDG pb on the ' +
  'overhead panel disconnects the drive, and it cannot be reconnected in flight.';

const IdgOilLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.Idg1OilLeak, A320Failure.Idg2OilLeak],
  detail: (number): FailureDetail => ({
    whatItIs: IDG_WHAT_IT_IS,
    impact: [
      `IDG ${number} loses 1 percent of its oil each second while its engine turns.`,
      'The oil pressure is low about 50 s after the leak starts. The oil temperature then rises.',
      'At 200 deg C the drive disconnects itself, and the generator stops.',
      'The bus tie keeps the AC buses powered from the other generator, the APU or external power.',
    ],
    alertIds: [
      ['2400205', '2400206'][number - 1],
      ['2400207', '2400208'][number - 1],
      ['2400400', '2400405'][number - 1],
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `IDG ${number} OIL LO PR, then OIL OVHT above 180 deg C: cautions with master caution, a single chime and ` +
          `an IDG ${number} OFF line, ${NOT_SHOWN_BEFORE_START_AND_AROUND_FLIGHT}.`,
      },
      {
        where: 'E/WD',
        text:
          `After the disconnection, IDG ${number} DISCONNECTED, shown only from engine start through take-off power ` +
          `below 80 kt.`,
      },
      {
        where: 'Overhead ELEC panel',
        text: `The IDG ${number} pb FAULT light comes on until the drive is disconnected.`,
      },
      { where: 'SD ELEC', text: 'The IDG oil temperature pulses above 147 deg C. LO PR, OVHT then DISC turn amber.' },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost generator drive' },
    clearing:
      `Release the IDG ${number} pb as the E/WD asks: the drive stays disconnected until the aircraft is reloaded. ` +
      'Restore stops the leak but does not refill the oil.',
  }),
};

const IdgOilOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.Idg1OilOverheat, A320Failure.Idg2OilOverheat],
  detail: (number): FailureDetail => ({
    whatItIs: IDG_WHAT_IT_IS,
    impact: [
      `The oil cooling of IDG ${number} is lost and the oil temperature climbs steadily.`,
      'The oil overheats about 3.5 min after the failure. At 200 deg C, about 40 s later, the drive disconnects itself and the generator stops.',
      'The bus tie keeps the AC buses powered from the other generator, the APU or external power.',
    ],
    alertIds: [['2400207', '2400208'][number - 1], ['2400400', '2400405'][number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `IDG ${number} OIL OVHT about 3.5 min after the failure, a caution with master caution, a single chime and ` +
          `an IDG ${number} OFF line, ${NOT_SHOWN_BEFORE_START_AND_AROUND_FLIGHT}.`,
      },
      {
        where: 'E/WD',
        text:
          `After the disconnection, IDG ${number} DISCONNECTED, shown only from engine start through take-off power ` +
          `below 80 kt.`,
      },
      {
        where: 'Overhead ELEC panel',
        text: `The IDG ${number} pb FAULT light comes on until the drive is disconnected.`,
      },
      { where: 'SD ELEC', text: 'The IDG oil temperature pulses above 147 deg C. OVHT then DISC turn amber.' },
    ],
    notSimulated: ['There is no low oil pressure with a lost oil cooling: only the oil temperature reacts.'],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost generator drive' },
    clearing:
      `Release the IDG ${number} pb as the E/WD asks: the drive stays disconnected until the aircraft is reloaded. ` +
      'Restore ends the overheat if the drive is still connected.',
  }),
};

const AcBusFamily: FailureDetailFamily = {
  ids: [A320Failure.AlternatingCurrent1, A320Failure.AlternatingCurrent2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'AC BUS 1 and AC BUS 2 are the two main 115 V AC buses. Each is fed by its engine generator, or by the other ' +
      'generator through the bus tie, the APU generator or external power. Each also feeds its transformer rectifier.',
    impact:
      number === 1
        ? [
            'AC BUS 1 loses power and everything on it, such as TR 1, the blue electric hydraulic pump and ADIRU 3.',
            'The blue pump stops, so HYD B ELEC PUMP LO PR can follow once the blue pressure falls.',
            'DC BUS 1 and the DC BAT BUS stay unpowered for 5 s, then DC BUS 2 takes them over. Their FAULT cautions show meanwhile.',
            'The AC ESS BUS changes over to AC BUS 2 after 3 s.',
            ABNORMAL_ALERT_FOLLOW_UPS,
          ]
        : [
            'AC BUS 2 loses power and everything on it, such as TR 2, ADIRU 2 and the AC GND/FLT bus.',
            'DC BUS 1 takes DC BUS 2 over at once. The DC GND/FLT bus loses its feed, so LGCIU 2 is lost.',
            'The yellow electric hydraulic pump has no supply: with its pb ON, HYD Y ELEC PUMP LO PR follows.',
            ABNORMAL_ALERT_FOLLOW_UPS,
          ],
    alertIds:
      number === 1 ? ['2400101', '2400103', '2400107', '2400106', '2900101'] : ['2400102', '3200190', '2900103'],
    effects: [
      {
        where: 'E/WD',
        text:
          `AC BUS ${number} FAULT after 1 s, a caution with master caution and a single chime, ` +
          `${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. ${number === 1 ? 'BLOWER' : 'EXTRACT'} at OVRD is asked for.`,
      },
      ...(number === 1
        ? [
            {
              where: 'E/WD',
              text:
                `AC ESS BUS ALTN about 5 s later while the AC ESS FEED pb is at NORMAL, crew awareness only, ` +
                `${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
            },
          ]
        : [LGCIU_2_FAULT_EFFECT]),
      { where: 'SD ELEC', text: `The AC ${number} bus turns amber.` },
      { where: 'SD STATUS', text: 'The systems lost with the bus are listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost AC bus' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const DcBusFamily: FailureDetailFamily = {
  ids: [A320Failure.DirectCurrent1, A320Failure.DirectCurrent2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'DC BUS 1 and DC BUS 2 are the two main 28 V DC buses, fed by TR 1 and TR 2. Through tie contactors they also ' +
      'feed the DC BAT BUS, and either bus can feed the other side.',
    impact:
      number === 1
        ? [
            'DC BUS 1 loses power and its loads. The normal supply of fuel pump 1 opens and its standby feed takes over.',
            'DC BUS 2 feeds the DC BAT BUS at once, so the batteries and the DC ESS BUS stay powered.',
            ABNORMAL_ALERT_FOLLOW_UPS,
          ]
        : [
            'DC BUS 2 loses power and its loads, such as the yellow electric pump control, one automatic outflow ' +
              'valve motor and one supply of the cargo smoke detectors.',
            'DC BUS 1 feeds the DC BAT BUS at once, so the batteries and the DC ESS BUS stay powered.',
            'The DC GND/FLT bus loses its feed, so LGCIU 2 is lost.',
            ABNORMAL_ALERT_FOLLOW_UPS,
          ],
    alertIds: number === 1 ? ['2400107'] : ['2400108', '3200190'],
    effects: [
      {
        where: 'E/WD',
        text:
          `DC BUS ${number} FAULT after 1 s, a caution with master caution and a single chime, ` +
          `${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}.`,
      },
      ...(number === 2 ? [LGCIU_2_FAULT_EFFECT] : []),
      { where: 'SD ELEC', text: `The DC ${number} bus turns amber.` },
      { where: 'SD STATUS', text: 'The systems lost with the bus are listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost DC bus' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const DcHotBusFamily: FailureDetailFamily = {
  ids: [A320Failure.DirectCurrentHot1, A320Failure.DirectCurrentHot2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The two DC HOT buses are connected to the batteries and stay powered with the aircraft switched off. They feed ' +
      'the RAT release solenoids, the backup supply of the inertial references and the battery connection to the ' +
      'DC BAT BUS and the essential supplies.',
    impact:
      number === 1
        ? [
            'DC HOT 1 loses power. Battery 1 is cut off: it no longer charges or supplies the network.',
            'RAT release solenoid 1 and the backup supply of ADIRU 1 lose power. The static inverter loses its feed.',
            'The ISIS loses its battery supply above 50 kt. Refuelling then depends on DC BUS 2 alone.',
          ]
        : [
            'DC HOT 2 loses power. Battery 2 is cut off: it no longer charges or supplies the network.',
            'RAT release solenoid 2 and the backup supply of ADIRU 2 and 3 lose power.',
            'Battery 2 can no longer carry the DC ESS BUS when the main buses are lost.',
          ],
    alertIds: [],
    effects: [{ where: 'SD ELEC', text: NOT_DRAWN_ON_SD_ELEC }],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata24Entries: Record<number, FailureDetail> = {
  [A320Failure.TransformerRectifierEssential]: {
    whatItIs:
      'The essential transformer rectifier (ESS TR) changes the AC ESS BUS into 28 V DC. It stays idle while TR 1 and ' +
      'TR 2 work. It takes over the DC ESS BUS when a TR is lost, and in the emergency configuration.',
    impact: [
      'The ESS TR gives no output. Nothing changes while TR 1 and TR 2 work.',
      'If TR 1 or TR 2 is also lost, or in the emergency configuration, the DC ESS BUS has no supply.',
    ],
    alertIds: [],
    effects: [
      { where: 'SD ELEC', text: 'The ESS TR box turns amber only once TR 1 or TR 2 is lost: it then shows no output.' },
      { where: 'E/WD', text: 'No alert of its own: the DC ESS BUS FAULT follows if it is needed and cannot supply.' },
    ],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.StaticInverter]: {
    whatItIs:
      'The static inverter changes the 28 V DC of battery 1 into 115 V AC, 400 Hz. It feeds the AC ESS BUS from the ' +
      'batteries when no generator is available, until the emergency generator takes over. It stays idle in normal ' +
      'operation.',
    impact: [
      'The static inverter gives no output and its fault is reported while DC HOT 1 is powered.',
      'On batteries only, the AC ESS BUS and the AC STAT INV BUS stay unpowered until the emergency generator couples.',
    ],
    alertIds: ['2400212'],
    effects: [
      {
        where: 'E/WD',
        text: `STATIC INV FAULT, a caution with master caution and a single chime, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      { where: 'SD ELEC', text: 'The static inverter box only appears on batteries, and then shows no output.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost static inverter' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.ApuGenerator1]: {
    whatItIs:
      'The APU drives a 115 V AC, 400 Hz generator. On the ground, and in flight when an engine generator is lost, it ' +
      'can feed the AC buses through the bus tie.',
    impact: [
      'The APU generator gives no output and its line contactor stays open.',
      'The APU keeps running. The engine generators or external power remain the sources.',
      'It matters when the APU generator is the source needed, for example with one engine generator lost.',
    ],
    alertIds: ['2400004'],
    effects: [
      {
        where: 'E/WD',
        text:
          `APU GEN FAULT, a caution with master caution and a single chime, once the APU is available and the ` +
          `generator pb is ON, for 5 s. It stays silent while external power or both engine generators supply the ` +
          `buses. ${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'Overhead ELEC panel', text: 'The APU GEN pb FAULT light comes on under the same conditions.' },
      { where: 'SD STATUS', text: 'APU GEN listed as inoperative, MAIN GALLEY too when only one generator operates.' },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost generator' },
    clearing: 'Maintenance only: use Restore. Switching the APU GEN pb OFF then ON does not clear it.',
  },

  // Buses
  [A320Failure.AlternatingCurrentEssential]: {
    whatItIs:
      'The AC ESS BUS is the essential 115 V AC bus. It is fed from AC BUS 1, and changes to AC BUS 2 on the AC ESS ' +
      'FEED selector or 3 s after AC BUS 1 is lost. On batteries, the static inverter or the emergency generator feeds ' +
      'it. It feeds the ESS TR and the AC ESS SHED BUS.',
    impact: [
      'The AC ESS BUS stays unpowered, whatever its feed: the bus itself has failed.',
      'The AC ESS SHED BUS, the ESS TR input and loads such as ADIRU 1 lose their AC supply.',
      ABNORMAL_ALERT_FOLLOW_UPS,
    ],
    alertIds: ['2400104'],
    effects: [
      {
        where: 'E/WD',
        text:
          `AC ESS BUS FAULT after 5 s, a caution with master caution and a single chime, ` +
          `${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. AC ESS FEED to ALTN is asked for while it is at NORMAL.`,
      },
      { where: 'Overhead ELEC panel', text: 'The AC ESS FEED pb FAULT light comes on.' },
      { where: 'SD ELEC', text: 'The AC ESS bus and its SHED legend turn amber.' },
      { where: 'SD STATUS', text: 'The systems lost with the bus are listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and a lost essential bus' },
    clearing: 'Maintenance only: use Restore. AC ESS FEED to ALTN does not help.',
  },
  [A320Failure.AlternatingCurrentEssentialShed]: {
    whatItIs:
      'The AC ESS SHED BUS hangs on the AC ESS BUS. It carries the loads that are dropped on battery power or the ' +
      'emergency generator, to save the supply for the essential ones.',
    impact: [
      'The AC ESS SHED BUS loses power and its loads, such as probe heat computer 1.',
      'The AC ESS BUS is not affected.',
    ],
    alertIds: ['2400105'],
    effects: [
      {
        where: 'E/WD',
        text:
          `AC ESS BUS SHED after 5 s, a caution with master caution and a single chime, ` +
          `${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. It also stays silent when the batteries carry the essential buses.`,
      },
      { where: 'SD ELEC', text: 'The SHED legend under the AC ESS bus turns amber.' },
      { where: 'SD STATUS', text: 'The systems lost with the bus are listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost shed loads' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AlternatingCurrentStaticInverter]: {
    whatItIs:
      'The AC STAT INV BUS is fed by the static inverter alone. It stays idle in normal operation. On batteries, it ' +
      'keeps a few loads running.',
    impact: [
      'The bus loses power. Nothing changes while the AC ESS SHED BUS is powered.',
      'With the AC ESS SHED BUS unpowered, as on batteries only, the APU fuel pump loses its backup supply.',
    ],
    alertIds: [],
    effects: [{ where: 'SD ELEC', text: NOT_DRAWN_ON_SD_ELEC }],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AlternatingCurrentGndFltService]: {
    whatItIs:
      'The AC GND/FLT SVCE bus feeds the loads that are needed on the ground and in flight, such as the yellow ' +
      'electric hydraulic pump. It is fed from AC BUS 2, or from external power with the maintenance bus switch on.',
    impact: [
      'The yellow electric hydraulic pump has no supply and cannot run.',
      'That removes the yellow pressure on the ground without engine 2, and the electric operation of the cargo doors.',
    ],
    alertIds: ['2900103'],
    effects: [
      { where: 'E/WD', text: 'No alert of its own while the pump is not asked to run.' },
      { where: 'Overhead HYD panel', text: 'Switching the Y ELEC PUMP on gives no yellow pressure.' },
      {
        where: 'E/WD',
        text: `With the pump pb ON: HYD Y ELEC PUMP LO PR after 5 s, a caution with master caution and a single chime, ${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}.`,
      },
    ],
    logbook: { required: true, reason: 'yellow electric pump unusable' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.DirectCurrentEssential]: {
    whatItIs:
      'The DC ESS BUS is the essential 28 V DC bus. It is fed from the DC BAT BUS, by the ESS TR when a TR is lost, ' +
      'and by battery 2 when the main buses are lost. It feeds the DC ESS SHED BUS.',
    impact: [
      'The DC ESS BUS stays unpowered, whatever its feed: the bus itself has failed.',
      'The DC ESS SHED BUS and loads such as LGCIU 1, the blue pump and green engine pump controls lose power.',
      ABNORMAL_ALERT_FOLLOW_UPS,
    ],
    alertIds: ['2400111', '3200180'],
    effects: [
      {
        where: 'E/WD',
        text:
          `DC ESS BUS FAULT after 5 s, a caution with master caution and a single chime, ` +
          `${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. The action lines include BARO REF CHECK and GPWS SYS OFF.`,
      },
      {
        where: 'E/WD',
        text: `LGCIU 1 FAULT, crew awareness only, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      { where: 'SD ELEC', text: 'The DC ESS bus and its SHED legend turn amber.' },
      { where: 'SD STATUS', text: 'The systems lost with the bus are listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost essential bus' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.DirectCurrentEssentialShed]: {
    whatItIs:
      'The DC ESS SHED BUS hangs on the DC ESS BUS. It carries the loads that are dropped on battery power or the ' +
      'emergency generator, to save the supply for the essential ones.',
    impact: [
      'The DC ESS SHED BUS loses power and its loads: the engine and wing anti-ice valves, the pack inlet pressure ' +
        'sensors and one supply of the cargo smoke detectors.',
      'The DC ESS BUS is not affected.',
    ],
    alertIds: ['2400112'],
    effects: [
      {
        where: 'E/WD',
        text:
          `DC ESS BUS SHED after 5 s, a caution with master caution and a single chime, ` +
          `${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. AVOID ICING CONDITIONS is asked for.`,
      },
      { where: 'SD ELEC', text: 'The SHED legend under the DC ESS bus turns amber.' },
      { where: 'SD STATUS', text: 'The systems lost with the bus are listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost shed loads' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.DirectCurrentBattery]: {
    whatItIs:
      'The DC BAT BUS links the batteries to the main network. DC BUS 1 or DC BUS 2 feed it through tie contactors, ' +
      'and the batteries charge from it. It is the normal supply of the DC ESS BUS and the APU start circuit.',
    impact: [
      'The DC BAT BUS loses power. The batteries no longer charge from the network, and the APU cannot be started on batteries.',
      'The DC ESS BUS loses its normal feed through the DC BAT BUS, and the ESS TR is not asked to take over.',
      'The APU fire detection loops lose their supply.',
    ],
    alertIds: ['2400106', '2400111', '3200180'],
    effects: [
      {
        where: 'E/WD',
        text: `DC BAT BUS FAULT after 1 s, a caution with master caution and a single chime, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      {
        where: 'E/WD',
        text:
          `DC ESS BUS FAULT after 5 s, ${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}, and LGCIU 1 FAULT, crew awareness only, ` +
          `${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      { where: 'SD ELEC', text: 'The DC BAT bus and the DC ESS bus turn amber.' },
      {
        where: 'SD STATUS',
        text: 'APU BAT START NOT AVAIL; APU FIRE DET and the other lost systems listed as inoperative.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost battery bus' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.DirectCurrentGndFltService]: {
    whatItIs:
      'The DC GND/FLT SVCE bus feeds the loads that are needed on the ground and in flight, such as the landing gear ' +
      'control interface unit 2 and the power transfer unit control. It is fed from TR 2 or DC BUS 2.',
    impact: [
      'The bus loses power and its loads: LGCIU 2, the PTU control and the yellow pump control for cargo door operation.',
      'LGCIU 1 remains the source of the landing gear data.',
    ],
    alertIds: ['3200190'],
    effects: [
      {
        where: 'E/WD',
        text: `LGCIU 2 FAULT, crew awareness only, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.`,
      },
      { where: 'SD STATUS', text: 'LGCIU 2 listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and a lost landing gear unit' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata24Families: FailureDetailFamily[] = [
  TrFamily,
  BatteryFamily,
  BatteryChargeLimiterFamily,
  GeneratorFamily,
  IdgOilLeakFamily,
  IdgOilOverheatFamily,
  AcBusFamily,
  DcBusFamily,
  DcHotBusFamily,
];
