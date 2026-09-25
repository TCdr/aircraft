// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

import { FmcInterface } from '../FMC/FmcInterface';
import { CompanyWindRequestState } from '../FMC/FlightManagementComputer';
import { ButtonMenuItem } from '../../MsfsAvionicsCommon/UiWidgets/Button';

/** URI page of the COMPANY WIND DATA REQUEST page */
export const cpnyWindRequestPage = 'cpny-wind-request';

/**
 * State of the CPNY WIND REQUEST button of the INIT and WIND pages (A380 FCOM DSC-22-FMS-20-30 P 392): CPNY WIND
 * REQUEST opens the COMPANY WIND DATA REQUEST page, REQUEST PENDING ... while the request is pending (still giving
 * access to the page), RECEIVED CPNY WIND with an INSERT / CLEAR menu once the winds are received.
 */
export class CpnyWindButton {
  private readonly state = Subject.create(CompanyWindRequestState.None);

  private stateSub?: Subscription;

  private readonly planSub: Subscription;

  readonly label: Subscribable<string>;

  readonly menuItems: Subscribable<ButtonMenuItem[]>;

  readonly received: Subscribable<boolean>;

  constructor(
    private readonly fmc: FmcInterface,
    private readonly planIndex: Subscribable<FlightPlanIndex>,
  ) {
    this.planSub = planIndex.sub((index) => {
      this.stateSub?.destroy();
      this.stateSub = fmc.companyWindRequestState(index).sub((s) => this.state.set(s), true);
    }, true);

    this.label = this.state.map((s) => {
      switch (s) {
        case CompanyWindRequestState.Pending:
          return 'REQUEST<br />PENDING...';
        case CompanyWindRequestState.Received:
          return 'RECEIVED<br />CPNY WIND';
        default:
          return 'CPNY WIND<br />REQUEST';
      }
    });
    this.received = this.state.map((s) => s === CompanyWindRequestState.Received);
    this.menuItems = this.state.map((s) =>
      s === CompanyWindRequestState.Received
        ? [
            { label: 'INSERT', action: () => this.fmc.insertCompanyWinds(this.planIndex.get()) },
            { label: 'CLEAR', action: () => this.fmc.clearCompanyWinds(this.planIndex.get()) },
          ]
        : [],
    );
  }

  destroy(): void {
    this.stateSub?.destroy();
    this.planSub.destroy();
  }
}
