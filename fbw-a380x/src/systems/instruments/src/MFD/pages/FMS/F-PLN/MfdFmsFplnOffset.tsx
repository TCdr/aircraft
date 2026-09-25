// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { fcomAt } from '../../common/FcomLayout';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { InterceptAngleFormat, OffsetDistanceFormat } from '../../common/DataEntryFormats';

import './MfdFmsFplnOffset.scss';

interface MfdFmsFplnOffsetProps extends AbstractMfdPageProps {}

/** FCOM: the default intercept angle is 30° */
const defaultInterceptAngle = 30;

/**
 * OFFSET page (A380 FCOM DSC-22-FMS-20-30 P 215-219): start and end waypoints, intercept angle, offset distance and
 * side of a lateral offset segment, inserted in a temporary flight plan.
 *
 * The FMS has no lateral offset guidance yet: the page shows the start / end waypoint lists of the flight plan (P.POS
 * to the destination, holds excluded) with the FCOM defaults, but the entry fields are inactive and no offset can be
 * inserted.
 */
export class MfdFmsFplnOffset extends FmsPage<MfdFmsFplnOffsetProps> {
  private readonly startWaypoints = ArraySubject.create<string>([]);

  private readonly endWaypoints = ArraySubject.create<string>([]);

  private readonly selectedStart = Subject.create<number | null>(null);

  private readonly selectedEnd = Subject.create<number | null>(null);

  private readonly interceptAngle = Subject.create<number | null>(defaultInterceptAngle);

  private readonly offsetDistance = Subject.create<number | null>(null);

  private readonly offsetSide = Subject.create<number | null>(null);

  private readonly inactive = Subject.create(true);

  protected onNewData(): void {
    const plan = this.loadedFlightPlan;
    if (!plan) {
      return;
    }
    // FCOM: waypoints from the aircraft present position to the primary destination; holds cannot be part of an offset
    const idents: string[] = [];
    const lastLeg = Math.min(plan.firstMissedApproachLegIndex, plan.legCount) - 1;
    for (let i = Math.max(0, plan.activeLegIndex); i <= lastLeg; i++) {
      const leg = plan.maybeElementAt(i);
      if (isLeg(leg) && leg.isXF() && !leg.isHX()) {
        idents.push(leg.ident);
      }
    }
    this.startWaypoints.set(['P.POS', ...idents]);
    this.endWaypoints.set(idents);

    // FCOM defaults: the revised waypoint as start (P.POS for the FROM waypoint), the last waypoint before the
    // destination as end
    if (this.selectedStart.get() === null) {
      const revisedIndex = this.props.fmcService.master.revisedLegIndex.get();
      const revisedLeg = revisedIndex !== null ? plan.maybeElementAt(revisedIndex) : undefined;
      const start = isLeg(revisedLeg) && revisedIndex !== plan.fromLegIndex ? idents.indexOf(revisedLeg.ident) + 1 : 0;
      this.selectedStart.set(Math.max(0, start));
    }
    if (this.selectedEnd.get() === null && idents.length > 1) {
      this.selectedEnd.set(idents.length - 2);
    }
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 215), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomAt(41, 30, <span class="mfd-label">START WPT</span>)}
            {fcomAt(
              92,
              23,
              <DropdownMenu
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_offsetStartWpt`}
                selectedIndex={this.selectedStart}
                values={this.startWaypoints}
                freeTextAllowed={false}
                disabled={this.inactive}
                containerStyle="width: 178px;"
                numberOfDigitsForInputField={7}
                alignLabels="flex-start"
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(41, 233, <span class="mfd-label">END WPT</span>)}
            {fcomAt(
              92,
              227,
              <DropdownMenu
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_offsetEndWpt`}
                selectedIndex={this.selectedEnd}
                values={this.endWaypoints}
                freeTextAllowed={false}
                disabled={this.inactive}
                containerStyle="width: 177px;"
                numberOfDigitsForInputField={7}
                alignLabels="flex-start"
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            <div class="mfd-offset-separator" />
            {fcomAt(41, 455, <span class="mfd-label">INTERCEPT ANGLE</span>)}
            {fcomAt(
              95,
              456,
              <InputField<number>
                dataEntryFormat={new InterceptAngleFormat()}
                value={this.interceptAngle}
                disabled={this.inactive}
                containerStyle="width: 64px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(216, 455, <span class="mfd-label">OFFSET DIST</span>)}
            {fcomAt(
              290,
              456,
              <InputField<number>
                dataEntryFormat={new OffsetDistanceFormat((side) => this.offsetSide.set(side === 'L' ? 0 : 1))}
                value={this.offsetDistance}
                disabled={this.inactive}
                containerStyle="width: 81px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(
              288,
              600,
              <RadioButtonGroup
                values={['LEFT', 'RIGHT']}
                valuesDisabled={Subject.create([true, true])}
                selectedIndex={this.offsetSide}
                idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_offsetSide`}
              />,
            )}
            {fcomAt(
              780,
              323,
              <Button
                label="CANCEL<br />OFFSET*"
                disabled={this.inactive}
                onClick={() => {}}
                buttonStyle="min-width: 133px; min-height: 60px;"
              />,
            )}
            {/* FCOM: RETURN (lower left) when no temporary flight plan exists, it displays the F-PLN page */}
            {fcomAt(
              790,
              2,
              <Button
                label="RETURN"
                onClick={() =>
                  this.props.mfd.uiService.navigateTo(`fms/${this.props.mfd.uiService.activeUri.get().category}/f-pln`)
                }
                buttonStyle="min-width: 130px;"
              />,
            )}
          </div>
        </div>
        <Footer
          bus={this.props.bus}
          mfd={this.props.mfd}
          fmcService={this.props.fmcService}
          flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
        />
      </>
    );
  }
}
