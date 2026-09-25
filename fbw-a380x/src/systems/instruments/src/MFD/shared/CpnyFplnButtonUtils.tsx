// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject } from '@microsoft/msfs-sdk';
import { FmcInterface } from '../FMC/FmcInterface';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

export class CpnyFplnButtonUtils {
  public static cpnyFplnButtonDisabled(fmc: FmcInterface | null, flightPlanIndex: number) {
    return fmc
      ? MappedSubject.create(
          // FCOM DSC-22-FMS-20-30 INIT page: selectable before engine start, with no active flight plan and no
          // secondary flight plan request pending. A pending active request still gives access to the page.
          // FCOM SEC INDEX page: a secondary flight plan request needs no other flight plan request pending.
          ([forPlan, enginesStarted, hasActiveFlightPlan]) =>
            flightPlanIndex === FlightPlanIndex.Active
              ? enginesStarted || hasActiveFlightPlan || (forPlan !== null && forPlan >= FlightPlanIndex.FirstSecondary)
              : forPlan !== null && forPlan !== flightPlanIndex,
          fmc.fmgc.data.cpnyFplnRequestedForPlan,
          fmc.enginesWereStarted,
          fmc.hasActiveFlightPlan,
        )
      : MappedSubject.create(() => true);
  }

  public static cpnyFplnButtonLabel(fmc: FmcInterface | null) {
    return fmc
      ? MappedSubject.create(
          ([avail, uplinkInProgress]) => {
            if (uplinkInProgress) {
              return 'REQUEST\nPENDING...';
            } else if (!avail) {
              return 'CPNY F-PLN\nREQUEST';
            } else {
              return 'RECEIVED\nCPNY F-PLN';
            }
          },
          fmc.fmgc.data.cpnyFplnAvailable,
          fmc.fmgc.data.cpnyFplnUplinkInProgress,
        )
      : MappedSubject.create(() => <></>);
  }

  public static cpnyFplnButtonMenuItems(fmc: FmcInterface | null, flightPlanIndex: number) {
    return fmc
      ? MappedSubject.create(
          ([avail]) =>
            avail
              ? [
                  {
                    label: 'INSERT*',
                    action: () => fmc.insertCpnyFpln(flightPlanIndex),
                  },
                  {
                    label: 'CLEAR*',
                    action: () => {
                      fmc.flightPlanInterface.uplinkDelete();
                      fmc.fmgc.data.cpnyFplnAvailable.set(false);
                      fmc.fmgc.data.cpnyFplnRequestedForPlan.set(null);
                    },
                  },
                ]
              : [],
          fmc.fmgc.data.cpnyFplnAvailable,
        )
      : MappedSubject.create(() => []);
  }
}
