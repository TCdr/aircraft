// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Subject } from '@microsoft/msfs-sdk';
import { fakeUiService, withStandIns } from '../../../OitSpecSupport';
import { createTechLogbook } from '../../../System/TechLogbook';
import { OitPageDrafts } from '../../../System/OitPageDrafts';

/**
 * @param drafts the drafts of the OIT
 * @returns the props of a logbook page, as the container gives them
 */
export function logbookPageProps(drafts: OitPageDrafts) {
  return {
    bus: new EventBus(),
    uiService: fakeUiService().uiService,
    // the assistant page of a free-text entry
    kind: 'free-text',
    container: withStandIns({
      ansu: withStandIns({
        pageDrafts: drafts,
        // the flight log times and fuel of the flight, none yet
        outBlockTime: Subject.create(null),
        offBlockTime: Subject.create(null),
        onBlockTime: Subject.create(null),
        inBlockTime: Subject.create(null),
        outBlockFob: Subject.create(null),
        inBlockFob: Subject.create(null),
        flightTime: Subject.create(null),
        techLogbook: withStandIns({
          state: Subject.create(createTechLogbook()),
          shownFlightIndex: Subject.create<number | null>(null),
          avionicsInfo: () => ({ flightNumber: null, from: null, to: null, now: null }),
          blockData: () => ({
            outTime: null,
            offTime: null,
            onTime: null,
            inTime: null,
            outFob: null,
            inFob: null,
            flightTime: null,
          }),
        }),
      }),
    }),
  };
}
