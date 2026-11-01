// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const CAUTION = 'an amber caution with master caution and single chime';
const ADVISORY = 'an amber advisory with no master caution and no chime';

const ALERT_APU_FAULT = '490800001';
const ALERT_APU_OIL_FILTER_CLOGGED = '490800003';

/** APU FAULT: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** APU OIL FILTER CLOGGED: inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 =
  'a new alert is shown only on the ground with the engines off, or after the engines are shut down';

const ECB_DESCRIPTION =
  'The electronic control box (ECB) is the computer of the APU. It sequences the start, watches the speed, the ' +
  'temperatures and the oil, controls the bleed valve and the air intake flap, and shuts the APU down on a fault. It ' +
  'is powered up by the APU MASTER SW.';

const SHUTDOWN_CONSEQUENCES =
  'The APU runs down, so its generators and its bleed air stop and the AVAIL indication goes out. The APU AVAIL or APU BLEED memo goes. An electrical or air source the APU alone supplied is lost.';

const APU_RUNS_DOWN_AND_CAN_RESTART_ONLY_AFTER_OFF =
  'The fault stays until the APU MASTER SW is OFF and the APU has stopped with its air intake flap closed; a new start is then possible only while the failure is not set.';

/** What every automatic APU shutdown shows: the same alert, lights and SD page */
const autoShutdownEffects = (whenText: string): FailureDetail['effects'] => [
  {
    where: 'E/WD',
    text:
      `APU FAULT, ${CAUTION}, ${whenText}; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines are AUTO SHUTDOWN and APU ` +
      'MASTER SW OFF, which is checked once the switch is OFF. It is not shown while the APU FIRE warning is active.',
  },
  { where: 'SD STATUS', text: 'INOP SYS APU, while the alert is shown.' },
  {
    where: 'SD APU',
    text: 'The page is called up when the alert first appears, unless another page was selected. The AVAIL indication goes out and N and EGT run down.',
  },
  {
    where: 'Overhead APU panel',
    text: 'The MASTER SW FAULT light comes on. The START ON light and the AVAIL light go out.',
  },
];

const LOGBOOK_SHUTDOWN = { required: true, reason: 'APU FAULT caution and an APU shutdown' };

const RESTORE_THEN_MASTER_SW_OFF =
  'Maintenance only: use Restore, then set the APU MASTER SW to OFF to clear the fault. With the failure still set the APU shuts down again.';

const apuEcbDetail: FailureDetail = {
  whatItIs: ECB_DESCRIPTION,
  impact: [
    'The ECB fails as soon as it is on, which is with the APU MASTER SW ON or while the APU still turns, so the APU cannot start.',
    'An APU that runs is shut down automatically at once, in flight too. The ECB keeps its indications: N, EGT and the other values stay on the SD.',
    SHUTDOWN_CONSEQUENCES,
    APU_RUNS_DOWN_AND_CAN_RESTART_ONLY_AFTER_OFF,
  ],
  alertIds: [ALERT_APU_FAULT],
  effects: autoShutdownEffects(
    'as soon as the ECB is on with the failure set (APU MASTER SW ON, or the APU running); with the MASTER SW OFF and the APU stopped nothing shows',
  ),
  logbook: { required: true, reason: 'APU FAULT caution and an APU that does not start' },
  clearing: RESTORE_THEN_MASTER_SW_OFF,
};

const apuOverspeedDetail: FailureDetail = {
  whatItIs:
    'The ECB limits the speed of the APU and has an independent overspeed protection. If the APU goes too fast it ' +
    'shuts the APU down to protect the turbine.',
  impact: [
    'The ECB detects an overspeed and shuts the APU down automatically, in flight too.',
    'It acts only on an APU that is running, which means after the start has finished with N at 100 %: a failure set during a start waits until then, and a stopped APU is not affected.',
    SHUTDOWN_CONSEQUENCES,
    APU_RUNS_DOWN_AND_CAN_RESTART_ONLY_AFTER_OFF,
  ],
  alertIds: [ALERT_APU_FAULT],
  effects: autoShutdownEffects('once the APU is running with the failure set'),
  logbook: LOGBOOK_SHUTDOWN,
  clearing: RESTORE_THEN_MASTER_SW_OFF,
};

const apuOilLowPressureDetail: FailureDetail = {
  whatItIs:
    'The APU has two independent oil systems, one for the APU and one for its two generators. The ECB reads the oil ' +
    'pressure and shuts the APU down if it is too low.',
  impact: [
    'The ECB sees a low oil pressure and shuts the APU down automatically, in flight too.',
    'It acts only on an APU that is running, which means after the start has finished with N at 100 %: a failure set during a start waits until then, and a stopped APU is not affected.',
    SHUTDOWN_CONSEQUENCES,
    APU_RUNS_DOWN_AND_CAN_RESTART_ONLY_AFTER_OFF,
  ],
  alertIds: [ALERT_APU_FAULT],
  effects: autoShutdownEffects('once the APU is running with the failure set'),
  logbook: LOGBOOK_SHUTDOWN,
  clearing: RESTORE_THEN_MASTER_SW_OFF,
};

const apuOilHighTemperatureDetail: FailureDetail = {
  whatItIs:
    'The ECB reads the temperature of the APU oil and shuts the APU down on the ground if it gets too hot. In flight ' +
    'the APU is kept running.',
  impact: [
    'On the ground the ECB sees a high oil temperature and shuts a running APU down automatically.',
    'In flight nothing happens and nothing shows. The APU stops at touchdown if it still runs; APU FAULT then appears once the landing roll is below 80 kt.',
    'It acts only on an APU that is running, which means after the start has finished with N at 100 %: a stopped APU is not affected.',
    SHUTDOWN_CONSEQUENCES,
  ],
  alertIds: [ALERT_APU_FAULT],
  effects: [
    ...autoShutdownEffects('on the ground, once the APU is running with the failure set'),
    {
      where: 'E/WD',
      text: 'In flight there is no alert, no light and no page change as long as the failure is set.',
    },
  ],
  logbook: { required: true, reason: 'APU FAULT caution and an APU shutdown on the ground' },
  clearing: RESTORE_THEN_MASTER_SW_OFF,
};

const apuOilFilterCloggingDetail: FailureDetail = {
  whatItIs:
    'One oil filter protects both APU oil systems from contamination. The ECB watches it and warns the crew when a ' +
    'clogging is coming, while the APU is still available.',
  impact: [
    'A clogging of the oil filter is announced to the crew. The APU keeps running and keeps its generators and bleed air.',
    'Nothing else changes: the clogging never grows, and the APU is never shut down by it.',
  ],
  alertIds: [ALERT_APU_OIL_FILTER_CLOGGED],
  effects: [
    {
      where: 'E/WD',
      text:
        `APU OIL FILTER CLOGGED, ${ADVISORY}, while the APU is available (N above 95 %); ${NOT_SHOWN_PHASES_2_TO_11}. ` +
        'It has no lines. Once shown it stays through engine start and the flight while the APU stays available; ' +
        'set with an engine running, it waits until the engines are shut down.',
    },
    {
      where: 'SD APU',
      text: 'The alert does not call up the page, and nothing on the page changes.',
    },
  ],
  notSimulated: [
    'A filter that is entirely clogged would shut the APU down with APU FAULT; here the clogging stays an advisory.',
  ],
  logbook: { required: true, reason: 'APU OIL FILTER CLOGGED advisory: the filter needs maintenance' },
  clearing: `${MAINTENANCE_ONLY} Stopping the APU also ends the alert.`,
};

const apuOilLevelLowDetail: FailureDetail = {
  whatItIs:
    'The ECB checks the quantity of APU oil on the ground and tells the crew when it is low, before the minimum level ' +
    'for operation is reached. The APU can still be operated normally.',
  impact: [
    'The ECB senses a low oil quantity. The APU is not affected: it starts, runs and supplies as usual.',
    'There is no alert: the only sign is a pulsing indication on the APU page.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'SD APU',
      text:
        'OIL LVL LO, green and pulsing, on the ground while the APU is not running (it also shows during the ' +
        'start, until N reaches 100 %). The ECB must be on: APU MASTER SW ON, or the APU still turning. With ' +
        'the MASTER SW OFF and the APU stopped nothing shows.',
    },
    {
      where: 'SD APU',
      text: 'In flight it is not shown. No alert calls the page up, so it is seen only when the APU page is selected.',
    },
  ],
  notSimulated: [
    'A quantity that keeps falling to the critical level would shut the APU down with APU FAULT; here the level never drops further.',
  ],
  logbook: { required: true, reason: 'OIL LVL LO on the APU page: the oil needs topping up' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata49ApuEntries: Record<number, FailureDetail> = {
  [A380Failure.ApuEcb]: apuEcbDetail,
  [A380Failure.ApuOverspeed]: apuOverspeedDetail,
  [A380Failure.ApuOilLowPressure]: apuOilLowPressureDetail,
  [A380Failure.ApuOilHighTemperature]: apuOilHighTemperatureDetail,
  [A380Failure.ApuOilFilterClogging]: apuOilFilterCloggingDetail,
  [A380Failure.ApuOilLevelLow]: apuOilLevelLowDetail,
};
