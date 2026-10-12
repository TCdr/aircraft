// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject } from '@microsoft/msfs-sdk';
import { FmcInterface } from '../FMC/FmcInterface';
import { isCpnyFplnButtonDisabled } from './CpnyFplnButtonRule';

export class CpnyFplnButtonUtils {
  public static cpnyFplnButtonDisabled(fmc: FmcInterface | null, flightPlanIndex: number) {
    return fmc
      ? MappedSubject.create(
          ([windUplinkInProgress, forPlan, enginesStarted, hasActiveFlightPlan]) =>
            isCpnyFplnButtonDisabled(
              windUplinkInProgress,
              forPlan,
              enginesStarted,
              hasActiveFlightPlan,
              flightPlanIndex,
            ),
          fmc.getCpnyWindUplinkInProgress(),
          fmc.getCpnyFplnRequestedForPlan(),
          fmc.enginesWereStarted,
          fmc.hasActiveFlightPlanWithCityPair,
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
          fmc.getCpnyFplnAvailable(),
          fmc.getCpnyFplnUplinkInProgress(),
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
                      fmc.deleteCpnyFpln();
                    },
                  },
                ]
              : [],
          fmc.getCpnyFplnAvailable(),
        )
      : MappedSubject.create(() => []);
  }
}
