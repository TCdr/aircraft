// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  ComponentProps,
  DisplayComponent,
  FSComponent,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { cruisePredictionLookup } from '@fmgc/guidance/vnav/cruise/ConstantMachSpeedProfile';
import {
  A380ConstantMachLimits,
  canLegBoundConstantMachSegment,
  ConstantMachWaypointChoice,
  constantMachWaypointChoices,
  findConstantMachSegment,
  isConstantMachSegmentEntryAllowed,
} from '@fmgc/flightplanning/ConstantMachSegment';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { dropdownEntryIndex } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownEntry';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { SpeedMachFormat } from '../../common/DataEntryFormats';
import { fcomAt, fcomCentre } from '../../common/FcomLayout';
import { onEntryNotInList } from '../../../shared/utils';
import { FmcServiceInterface } from '../../../FMC/FmcServiceInterface';
import { AbstractMfdPageProps } from '../../../MFD';

interface MfdFmsFplnVertRevCmsProps extends ComponentProps {
  fmcService: FmcServiceInterface;
  mfd: AbstractMfdPageProps['mfd'];
  tmpyActive: Subscribable<boolean>;
}

/** Start, Mach and end entered before the three of them create the segment */
interface PendingConstantMachSegment {
  startLegIndex: number | null;
  endLegIndex: number | null;
  mach: number | null;
}

/** The CMS panel of the VERT REV page: start waypoint, Mach and end waypoint of the constant Mach segment */
export class MfdFmsFplnVertRevCms extends DisplayComponent<MfdFmsFplnVertRevCmsProps> {
  private plan: ReadonlyFlightPlan | null = null;

  private planIndex = FlightPlanIndex.Active;

  private revisedLegIndex: number | null = null;

  private revisedLegIsAltn = false;

  private pending: PendingConstantMachSegment = { startLegIndex: null, endLegIndex: null, mach: null };

  private startChoices: ConstantMachWaypointChoice[] = [];

  private endChoices: ConstantMachWaypointChoice[] = [];

  /** CMS NOT ALLOWED IN EO / IN ALTN F-PLN: the panel only shows this message */
  private readonly unavailableMessage = Subject.create('');

  private readonly notAllowedAtIdent = Subject.create('');

  private readonly startValues = ArraySubject.create<string>([]);

  private readonly startSelectedIndex = Subject.create<number | null>(null);

  private readonly endValues = ArraySubject.create<string>([]);

  private readonly endSelectedIndex = Subject.create<number | null>(null);

  private readonly mach = Subject.create<number | null>(null);

  private readonly deleteDisabled = Subject.create(true);

  /**
   * Refreshes the panel from the loaded flight plan
   * @param revisedLegIndex the waypoint the VERT REV page was called for
   */
  public update(
    plan: ReadonlyFlightPlan | null,
    planIndex: FlightPlanIndex,
    revisedLegIndex: number | null,
    revisedLegIsAltn: boolean,
  ): void {
    const fmc = this.props.fmcService.master;
    if (plan !== this.plan || planIndex !== this.planIndex) {
      this.pending = { startLegIndex: null, endLegIndex: null, mach: null };
    }
    this.plan = plan;
    this.planIndex = planIndex;
    this.revisedLegIndex = revisedLegIndex;
    this.revisedLegIsAltn = revisedLegIsAltn;

    if (!fmc || !plan) {
      return;
    }

    if (fmc.fmgc.data.engineOut.get()) {
      this.unavailableMessage.set('CMS NOT ALLOWED IN EO');
      return;
    }
    if (revisedLegIsAltn) {
      this.unavailableMessage.set('CMS NOT ALLOWED IN ALTN F-PLN');
      return;
    }
    this.unavailableMessage.set('');

    const isPredictedInCruise = cruisePredictionLookup(
      planIndex < FlightPlanIndex.FirstSecondary
        ? fmc.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions
        : undefined,
    );
    const entryAllowed = isConstantMachSegmentEntryAllowed(
      fmc.fmgc.getFlightPhase(),
      false,
      planIndex >= FlightPlanIndex.FirstSecondary,
    );
    const revisedLeg = revisedLegIndex !== null ? plan.maybeElementAt(revisedLegIndex) : undefined;
    const revisedLegAllowed =
      revisedLegIndex !== null &&
      revisedLegIndex >= plan.activeLegIndex &&
      canLegBoundConstantMachSegment(revisedLeg, isPredictedInCruise(revisedLegIndex)) &&
      entryAllowed;
    this.notAllowedAtIdent.set(revisedLeg?.isDiscontinuity === false && !revisedLegAllowed ? revisedLeg.ident : '');

    const segment = findConstantMachSegment(plan.allLegs);
    if (segment === null && this.pending.startLegIndex === null && revisedLegAllowed) {
      this.pending.startLegIndex = revisedLegIndex;
    }

    const startLegIndex = segment?.startLegIndex ?? this.pending.startLegIndex;
    const endLegIndex = segment ? segment.endLegIndex : this.pending.endLegIndex;
    const choices = entryAllowed
      ? constantMachWaypointChoices(plan.allLegs, plan.activeLegIndex, startLegIndex, endLegIndex, isPredictedInCruise)
      : [];

    // A list keeps the current selection, so that the dropdown shows it
    this.startChoices = choices.filter((c) => c.canBeStart || c.legIndex === startLegIndex);
    this.endChoices = choices.filter((c) => c.canBeEnd || c.legIndex === endLegIndex);
    this.setList(this.startValues, this.startSelectedIndex, this.startChoices, startLegIndex);
    this.setList(this.endValues, this.endSelectedIndex, this.endChoices, endLegIndex);

    this.mach.set(segment?.mach ?? this.pending.mach);
    this.deleteDisabled.set(segment === null);
  }

  private setList(
    values: ArraySubject<string>,
    selectedIndex: Subject<number | null>,
    choices: ConstantMachWaypointChoice[],
    selectedLegIndex: number | null,
  ) {
    const idents = choices.map((c) => c.ident);
    if (idents.join() !== values.getArray().join()) {
      values.set(idents);
    }
    const index = choices.findIndex((c) => c.legIndex === selectedLegIndex);
    selectedIndex.set(index >= 0 ? index : null);
  }

  private async onBoundsOrMachEntered(startLegIndex: number | null, endLegIndex: number | null, mach: number | null) {
    const fmc = this.props.fmcService.master;
    if (!fmc || !this.plan) {
      return;
    }

    // The entries stay displayed until the VERT REV page reloads the (temporary) flight plan with the segment
    this.pending = { startLegIndex, endLegIndex, mach };
    if (startLegIndex !== null && endLegIndex !== null && mach !== null) {
      await fmc.flightPlanInterface.setConstantMachSegment(startLegIndex, endLegIndex, mach, this.planIndex);
    } else {
      this.update(this.plan, this.planIndex, this.revisedLegIndex, this.revisedLegIsAltn);
    }
  }

  private currentBounds(): PendingConstantMachSegment {
    const segment = this.plan ? findConstantMachSegment(this.plan.allLegs) : null;
    return segment
      ? { startLegIndex: segment.startLegIndex, endLegIndex: segment.endLegIndex, mach: segment.mach }
      : this.pending;
  }

  private async deleteSegment() {
    const fmc = this.props.fmcService.master;
    this.pending = { startLegIndex: null, endLegIndex: null, mach: null };
    if (fmc && this.plan && findConstantMachSegment(this.plan.allLegs) !== null) {
      await fmc.flightPlanInterface.deleteConstantMachSegment(this.planIndex);
    } else {
      this.update(this.plan, this.planIndex, this.revisedLegIndex, this.revisedLegIsAltn);
    }
  }

  render(): VNode {
    const captOrFo = this.props.mfd.uiService.captOrFo;

    return (
      <div class="mfd-fcom-canvas">
        <div style={{ display: this.unavailableMessage.map((m) => (m === '' ? 'none' : 'block')) }}>
          {fcomAt(40, 31, <span class="mfd-label amber">{this.unavailableMessage}</span>)}
        </div>
        <div style={{ display: this.unavailableMessage.map((m) => (m === '' ? 'block' : 'none')) }}>
          <div style={{ visibility: this.notAllowedAtIdent.map((i) => (i === '' ? 'hidden' : 'visible')) }}>
            {fcomAt(40, 31, [
              <span class="mfd-label amber">CMS NOT ALLOWED AT</span>,
              <span class="mfd-value bigger amber">{this.notAllowedAtIdent}</span>,
            ])}
          </div>
          {fcomCentre(96, 112, <span class="mfd-label">START WPT</span>)}
          {fcomCentre(96, 292, <span class="mfd-label">MACH</span>)}
          {fcomCentre(96, 472, <span class="mfd-label">END WPT</span>)}
          {fcomAt(
            139,
            23,
            <DropdownMenu
              idPrefix={`${captOrFo}_MFD_cmsStartWptDropdown`}
              selectedIndex={this.startSelectedIndex}
              values={this.startValues}
              keyboardEntryAllowed
              errorOnNotInList={() => onEntryNotInList(this.props.fmcService)}
              containerStyle="width: 180px;"
              alignLabels="center"
              onModified={(i, text) => {
                const index = dropdownEntryIndex(this.startValues, i, text);
                const choice = index !== null ? this.startChoices[index] : undefined;
                if (choice) {
                  const { endLegIndex, mach } = this.currentBounds();
                  this.onBoundsOrMachEntered(choice.legIndex, endLegIndex, mach);
                }
              }}
              numberOfDigitsForInputField={7}
              tmpyActive={this.props.tmpyActive}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />,
          )}
          {fcomAt(
            139,
            243,
            <InputField<number>
              dataEntryFormat={
                new SpeedMachFormat(
                  Subject.create(A380ConstantMachLimits.min),
                  Subject.create(A380ConstantMachLimits.max),
                )
              }
              value={this.mach}
              onModified={(mach) => {
                if (mach === null) {
                  this.deleteSegment();
                  return;
                }
                const { startLegIndex, endLegIndex } = this.currentBounds();
                this.onBoundsOrMachEntered(startLegIndex, endLegIndex, mach);
              }}
              alignText="center"
              containerStyle="width: 104px;"
              tmpyActive={this.props.tmpyActive}
              errorHandler={(e) => this.props.fmcService.master?.showFmsErrorMessage(e.type, e.details)}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />,
          )}
          {fcomAt(
            139,
            383,
            <DropdownMenu
              idPrefix={`${captOrFo}_MFD_cmsEndWptDropdown`}
              selectedIndex={this.endSelectedIndex}
              values={this.endValues}
              keyboardEntryAllowed
              errorOnNotInList={() => onEntryNotInList(this.props.fmcService)}
              containerStyle="width: 180px;"
              alignLabels="center"
              onModified={(i, text) => {
                const index = dropdownEntryIndex(this.endValues, i, text);
                const choice = index !== null ? this.endChoices[index] : undefined;
                if (choice) {
                  const { startLegIndex, mach } = this.currentBounds();
                  this.onBoundsOrMachEntered(startLegIndex, choice.legIndex, mach);
                }
              }}
              numberOfDigitsForInputField={7}
              tmpyActive={this.props.tmpyActive}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />,
          )}
          {fcomAt(
            140,
            606,
            <Button
              label={
                <span class="fr aic">
                  <span style="white-space: pre; text-align: center;">{'DELETE\nCMS'}</span>
                  <span style="margin-left: 12px;">*</span>
                </span>
              }
              onClick={() => this.deleteSegment()}
              disabled={this.deleteDisabled}
              buttonStyle="min-width: 130px; min-height: 60px;"
            />,
          )}
        </div>
      </div>
    );
  }
}
