// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  MappedSubject,
  MappedSubscribable,
  Subject,
  Subscribable,
  SubscribableMapFunctions,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { FmcInterface } from '../../FMC/FmcInterface';
import { Button, ButtonMenuItem } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { FmgcFlightPhase } from '@shared/flightphase';
import { CpnyWindButtonState, cpnyWindButtonClickAction, isCpnyWindButtonDisabled } from './CpnyWindButtonRule';

/** URI suffix of the COMPANY WIND DATA REQUEST page (under fms/active, fms/sec1..3) */
export const cpnyWindRequestPage = 'cpny-wind-request';

/**
 * Follows what the CPNY WIND REQUEST button of one flight plan depends on (see CpnyWindButtonRule). Shared by the
 * button and the COMPANY WIND DATA REQUEST page; the per-plan subscription follows the plan index.
 */
export class CpnyWindButtonStateTracker {
  private readonly availableForPlan = Subject.create(false);

  private readonly availableForAnyPlan = Subject.create(false);

  private planSubscription: Subscription | undefined;

  private readonly subs: Subscription[] = [];

  public readonly state: MappedSubscribable<CpnyWindButtonState>;

  constructor(
    fmc: FmcInterface,
    flightPlanIndex: Subscribable<number>,
    tmpyExists: Subscribable<boolean>,
    isActiveOrCopiedFromActive: Subscribable<boolean>,
  ) {
    this.state = MappedSubject.create(
      ([
        isActiveOrCopy,
        flightPhase,
        tmpy,
        uplinkInProgress,
        cpnyWindUplinkInProgress,
        availableForPlan,
        availableForAnyPlan,
      ]): CpnyWindButtonState => ({
        flightPhaseDisallows: isActiveOrCopy && flightPhase > FmgcFlightPhase.Cruise,
        tmpyExists: tmpy,
        uplinkInProgress,
        cpnyWindUplinkInProgress,
        availableForPlan,
        availableForAnyPlan,
      }),
      isActiveOrCopiedFromActive,
      fmc.fmgc.data.flightPhase,
      tmpyExists,
      fmc.getUplinkInProgress(),
      fmc.getCpnyWindUplinkInProgress(),
      this.availableForPlan,
      this.availableForAnyPlan,
    );

    this.subs.push(
      flightPlanIndex.sub((index) => {
        this.planSubscription?.destroy();
        this.planSubscription = fmc.getWindUplinkAvailableForPlan(index).pipe(this.availableForPlan);
      }, true),
      fmc.getWindUplinkAvailableForPlan().pipe(this.availableForAnyPlan),
    );
  }

  destroy(): void {
    this.planSubscription?.destroy();
    this.subs.forEach((s) => s.destroy());
    this.state.destroy();
  }
}

export interface CpnyWindRequestButtonProps extends ComponentProps {
  fmc: FmcInterface;
  flightPlanIndex: Subscribable<number>;
  tmpyExists: Subscribable<boolean>;
  isActiveOrCopiedFromActive: Subscribable<boolean>;
  /**
   * Opens the COMPANY WIND DATA REQUEST page of this plan (free text option, A380 FCOM l.42121-42128). Without it,
   * the button sends the request directly (l.42115).
   */
  onOpenRequestPage?: () => void;
  /** Style of the button, to fit the page layout (default: the WIND page slot) */
  buttonStyle?: string;
}

export class CpnyWindRequestButton extends DisplayComponent<CpnyWindRequestButtonProps> {
  private readonly tracker = new CpnyWindButtonStateTracker(
    this.props.fmc,
    this.props.flightPlanIndex,
    this.props.tmpyExists,
    this.props.isActiveOrCopiedFromActive,
  );

  private readonly uplinkAvailable = this.tracker.state.map((s) => s.availableForPlan);

  // TODO Disable when connection to ATSU is lost.
  private readonly disabled = this.tracker.state.map(isCpnyWindButtonDisabled);

  private readonly topLabel = MappedSubject.create(
    ([avail, uplinkInProgress]) => {
      if (uplinkInProgress) {
        return 'REQUEST';
      }

      return avail ? 'RECEIVED' : 'CPNY WIND';
    },
    this.uplinkAvailable,
    this.props.fmc.getCpnyWindUplinkInProgress(),
  );

  private readonly bottomLabel = MappedSubject.create(
    ([avail, uplinkInProgress]) => {
      if (uplinkInProgress) {
        return 'PENDING...';
      }

      return avail ? 'CPNY WIND' : 'REQUEST';
    },
    this.uplinkAvailable,
    this.props.fmc.getCpnyWindUplinkInProgress(),
  );

  private readonly showAsterisk = MappedSubject.create(
    ([avail, uplinkInProgress]) => !avail && !uplinkInProgress,
    this.uplinkAvailable,
    this.props.fmc.getCpnyWindUplinkInProgress(),
  );

  private readonly hideAsterisk = this.showAsterisk.map(SubscribableMapFunctions.not());

  private readonly label = (
    <div style="display: flex; flex-direction: row; justify-content: space-between;">
      <span style="text-align: center; vertical-align: center; margin-right: 10px;">
        {this.topLabel}
        <br />
        {this.bottomLabel}
      </span>
      <span class={{ hidden: this.hideAsterisk }} style="display: flex; align-items: center; justify-content: center;">
        *
      </span>
    </div>
  );

  private readonly menuItems: MappedSubscribable<ButtonMenuItem[]> = MappedSubject.create(
    ([avail, tmpy]) =>
      avail && !tmpy
        ? [
            {
              label: 'INSERT*',
              action: () => this.props.fmc.insertCpnyWind(this.props.flightPlanIndex.get()),
            },
            {
              label: 'CLEAR*',
              action: () => {
                this.props.fmc.deleteCpnyWind(this.props.flightPlanIndex.get());
              },
            },
          ]
        : [],
    this.uplinkAvailable,
    this.props.tmpyExists,
  );

  /** Received winds: the Button opens its INSERT/CLEAR menu itself; else the request page, or a direct request */
  private onClick(): void {
    if (cpnyWindButtonClickAction(this.uplinkAvailable.get()) !== 'open-request-page') {
      return;
    }
    if (this.props.onOpenRequestPage) {
      this.props.onOpenRequestPage();
    } else if (!this.tracker.state.get().cpnyWindUplinkInProgress) {
      this.props.fmc.requestCpnyWind(this.props.flightPlanIndex.get());
    }
  }

  public render(): VNode {
    return (
      <Button
        disabled={this.disabled}
        label={this.label}
        onClick={() => this.onClick()}
        idPrefix="mfd-fms-wind-cpny-wind-request"
        menuItems={this.menuItems}
        buttonStyle={
          this.props.buttonStyle ?? 'margin-right: 10px; justify-self: flex-end; width: 178px; height: 58px;'
        }
        showArrow={false}
      />
    );
  }

  public destroy(): void {
    this.uplinkAvailable.destroy();
    this.disabled.destroy();
    this.topLabel.destroy();
    this.bottomLabel.destroy();
    this.showAsterisk.destroy();
    this.hideAsterisk.destroy();
    this.menuItems.destroy();
    this.tracker.destroy();
    super.destroy();
  }
}
