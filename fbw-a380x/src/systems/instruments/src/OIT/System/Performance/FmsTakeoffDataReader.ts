// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus } from '@microsoft/msfs-sdk';
import { CompanyTakeoffDataEvents, CompanyTakeoffDataRequest } from '@flybywiresim/fbw-sdk';
import { FmsTakeoffThrust } from './TakeoffCrosscheck';

/** How long the OIS waits for the FMS answer */
const FMS_ANSWER_TIMEOUT_MS = 3_000;

/** The FMS T.O page selections the crosscheck needs and the FMS does not publish as L:vars */
export interface FmsTakeoffSelections {
  /** 1 = 1+F, 2, 3; null when not entered */
  readonly flaps: number | null;
  readonly thrust: FmsTakeoffThrust | null;
}

/**
 * @param answer the takeoff data of the FMS
 * @returns the flaps and the thrust of the FMS T.O page (the active runway of the active flight plan)
 */
function fmsTakeoffSelections(answer: CompanyTakeoffDataRequest): FmsTakeoffSelections {
  const runway = answer.runways[0];
  return { flaps: runway?.flaps ?? null, thrust: runway?.thrust ?? null };
}

/**
 * Reads the takeoff data of the FMS T.O page: the OIS asks the FMS for its takeoff data, the same read-only request the
 * flyPad takeoff calculator uses (the FMS answers it with the T.O page of the active flight plan; nothing is written
 * into the FMS).
 * @param bus the event bus
 * @returns the T.O flaps and thrust of the FMS, or null when the FMS does not answer
 */
export function readFmsTakeoffSelections(bus: EventBus): Promise<FmsTakeoffSelections | null> {
  const requestId = Math.floor(Math.random() * 1_000_000_000);
  return new Promise((resolve) => {
    const sub = bus
      .getSubscriber<CompanyTakeoffDataEvents>()
      .on('cpny_to_fms_data')
      .handle((answer) => {
        if (answer.answersRequestId === requestId) {
          clearTimeout(timeout);
          sub.destroy();
          resolve(fmsTakeoffSelections(answer));
        }
      });
    const timeout = setTimeout(() => {
      sub.destroy();
      resolve(null);
    }, FMS_ANSWER_TIMEOUT_MS);
    bus.getPublisher<CompanyTakeoffDataEvents>().pub('cpny_to_fms_data_request', requestId, true, false);
  });
}
