// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, MappedSubject, Subject, UnitType, VNode } from '@microsoft/msfs-sdk';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsPage } from '../common/FmsPage';
import { Footer } from '../common/Footer';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { IconButton } from '../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { RadioButtonGroup } from '../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import {
  FreeTextFormat,
  LengthFormat,
  QnhFormat,
  RunwayDesignatorFormat,
  WindDirectionFormat,
  WindSpeedFormat,
} from '../common/DataEntryFormats';

/** URI pages of the company takeoff data pages */
export const cpnyToRequestPage = 'cpny-to-request';
export const receivedCpnyToDataPage = 'received-cpny-to-data';

/** FCOM P 37: runway conditions of the list */
export const runwayConditions = ['DRY', 'WET', '1/4 WATER', '1/2 WATER', '1/4 SLUSH', '1/2 SLUSH', 'COMP SNOW'];

/** The request data of one of the two requested runways */
class RunwayRequest {
  readonly runway = Subject.create<string | null>(null);

  readonly shift = Subject.create<number | null>(null);

  readonly limit = Subject.create<number | null>(null);

  readonly windDirection = Subject.create<number | null>(null);

  readonly windSpeed = Subject.create<number | null>(null);

  readonly condition = Subject.create<number | null>(0);

  readonly qnh = Subject.create<number | null>(null);

  /** 0 = TOGA (default), 1 = FLEX, 2 = DERATED */
  readonly thrust = Subject.create<number | null>(0);

  /** Index in the flaps list 1, 2, 3 */
  readonly flaps = Subject.create<number | null>(null);
}

/**
 * COMPANY T.O DATA REQUEST page (A380 FCOM DSC-22-FMS-20-30 P 32-41): takeoff data request for two runways, with the
 * takeoff parameters sent to the company ground station. Only for the active flight plan.
 *
 * No company ground station computes takeoff data in the simulation: the page shows and keeps the request parameters,
 * but SEND T.O REQUEST is inactive.
 */
export class MfdFmsCpnyToRequest extends FmsPage<AbstractMfdPageProps> {
  private readonly runways = [new RunwayRequest(), new RunwayRequest()];

  private readonly runwayPage = Subject.create(0);

  private readonly runwayPageText = this.runwayPage.map((i) => `RWY ${i + 1}/2`);

  private readonly freeText = Subject.create<string | null>(null);

  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.KILOGRAM : UnitType.POUND,
  );

  private readonly takeoffWeight = Subject.create<number | null>(null);

  private readonly takeoffWeightText = MappedSubject.create(
    ([tow, unit]) => (tow !== null ? (UnitType.KILOGRAM.convertTo(tow, unit) / 1000).toFixed(0) : '----'),
    this.takeoffWeight,
    this.weightUnit,
  );

  private readonly takeoffCg = Subject.create('--.-');

  private readonly takeoffTemperature = Subject.create('---');

  private readonly runwayConditionLabels = ArraySubject.create(runwayConditions);

  private readonly flapsLabels = ArraySubject.create(['1', '2', '3']);

  private readonly noCompanyTakeoffData = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('COMPANY T.O DATA REQUEST'), true),
      this.runwayPageText,
      this.weightUnit,
      this.takeoffWeightText,
    );
  }

  protected onNewData(): void {
    const fmc = this.props.fmcService.master;
    const plan = this.props.flightPlanInterface.hasActive ? this.props.flightPlanInterface.active : null;
    if (!plan) {
      return;
    }
    const pd = plan.performanceData;
    const first = this.runways[0];
    // FCOM defaults: the departure runway of the active flight plan, the T.O panel flaps and shift, the EFIS CP QNH
    if (first.runway.get() === null && plan.originRunway) {
      first.runway.set(plan.originRunway.ident.substring(4));
    }
    for (const rwy of this.runways) {
      if (rwy.flaps.get() === null && pd.takeoffFlaps.get() !== null) {
        rwy.flaps.set((pd.takeoffFlaps.get() ?? 1) - 1);
      }
      if (rwy.shift.get() === null) {
        rwy.shift.set(pd.takeoffShift.get());
      }
      if (rwy.qnh.get() === null) {
        rwy.qnh.set(Math.round(SimVar.GetSimVarValue('KOHLSMAN SETTING MB:1', 'millibars')));
      }
    }
    this.takeoffWeight.set(fmc.getTakeoffWeight(FlightPlanIndex.Active) ?? null);
    const cg = pd.zeroFuelWeightCenterOfGravity.get();
    this.takeoffCg.set(cg !== null ? cg.toFixed(1) : '--.-');
    const sat = fmc.getStaticAirTemperature();
    this.takeoffTemperature.set(sat !== null ? `${sat >= 0 ? '+' : '-'}${Math.abs(Math.round(sat))}` : '---');
  }

  /** The fields of one requested runway, shown when its page is selected */
  private renderRunway(index: number): VNode {
    const rwy = this.runways[index];
    const visibility = this.runwayPage.map((p) => (p === index ? 'inherit' : 'hidden'));
    this.subs.push(visibility);
    const field = (y: number, x: number, el: VNode) => fcomAt(y, x, el);
    return (
      <div style={{ visibility }}>
        {field(
          26,
          251,
          <InputField<string>
            dataEntryFormat={new RunwayDesignatorFormat()}
            value={rwy.runway}
            containerStyle="width: 68px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          95,
          174,
          <InputField<number>
            dataEntryFormat={new LengthFormat(Subject.create(0), Subject.create(2000))}
            value={rwy.shift}
            containerStyle="width: 137px;"
            alignText="flex-end"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          95,
          532,
          <InputField<number>
            dataEntryFormat={
              new LengthFormat(Subject.create(1000), Subject.create(20000), Subject.create(UnitType.FOOT))
            }
            value={rwy.limit}
            containerStyle="width: 139px;"
            alignText="flex-end"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          150,
          535,
          <InputField<number>
            dataEntryFormat={new WindDirectionFormat()}
            value={rwy.windDirection}
            containerStyle="width: 84px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          150,
          635,
          <InputField<number>
            dataEntryFormat={new WindSpeedFormat()}
            value={rwy.windSpeed}
            containerStyle="width: 96px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          202,
          532,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_cpnyToRwyCond${index}`}
            selectedIndex={rwy.condition}
            values={this.runwayConditionLabels}
            freeTextAllowed={false}
            containerStyle="width: 218px;"
            numberOfDigitsForInputField={9}
            alignLabels="center"
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          254,
          532,
          <InputField<number>
            dataEntryFormat={new QnhFormat()}
            value={rwy.qnh}
            containerStyle="width: 90px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {field(
          362,
          455,
          <RadioButtonGroup
            values={['TOGA', 'FLEX', 'DERATED']}
            selectedIndex={rwy.thrust}
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_cpnyToThrust${index}`}
            additionalVerticalSpacing={15}
          />,
        )}
        {field(
          471,
          98,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_cpnyToFlaps${index}`}
            selectedIndex={rwy.flaps}
            values={this.flapsLabels}
            freeTextAllowed={false}
            containerStyle="width: 69px;"
            numberOfDigitsForInputField={1}
            alignLabels="center"
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
      </div>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container">
          {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 32), page container coordinates */}
          <div class="mfd-fcom-canvas">
            {fcomAt(26, 16, <span class="mfd-label">REQUEST FOR RWY</span>)}
            {fcomAt(
              31,
              399,
              <IconButton
                icon="double-left"
                disabled={this.runwayPage.map((p) => p === 0)}
                onClick={() => this.runwayPage.set(0)}
                containerStyle="width: 60px; height: 55px;"
              />,
            )}
            {fcomAt(
              31,
              469,
              <IconButton
                icon="double-right"
                disabled={this.runwayPage.map((p) => p === 1)}
                onClick={() => this.runwayPage.set(1)}
                containerStyle="width: 60px; height: 55px;"
              />,
            )}
            {fcomAt(23, 561, <span class="mfd-label">{this.runwayPageText}</span>)}
            {fcomRight(95, 158, <span class="mfd-label">T.O SHIFT</span>)}
            {fcomRight(95, 511, <span class="mfd-label">T.O LIMIT</span>)}
            {fcomRight(150, 157, <span class="mfd-label">TOW</span>)}
            {fcomRight(150, 280, <span class="mfd-value bigger">{this.takeoffWeightText}</span>)}
            {fcomAt(
              150,
              284,
              <span class="mfd-label-unit">{this.weightUnit.map((u) => (u === UnitType.KILOGRAM ? 'T' : 'KLB'))}</span>,
            )}
            {fcomRight(150, 511, <span class="mfd-label">MAG WIND</span>)}
            {fcomRight(200, 176, <span class="mfd-label">T.O CG</span>)}
            {fcomRight(200, 275, <span class="mfd-value bigger">{this.takeoffCg}</span>)}
            {fcomAt(200, 279, <span class="mfd-label-unit">%</span>)}
            {fcomRight(202, 511, <span class="mfd-label">RWY COND</span>)}
            {fcomRight(252, 157, <span class="mfd-label">TEMP</span>)}
            {fcomRight(252, 238, <span class="mfd-value bigger">{this.takeoffTemperature}</span>)}
            {fcomAt(252, 242, <span class="mfd-label-unit">°C</span>)}
            {fcomRight(254, 511, <span class="mfd-label">QNH</span>)}
            {fcomLine(285, 10, 752)}
            {fcomRight(471, 84, <span class="mfd-label">FLAPS</span>)}
            {fcomLine(500, 10, 752)}
            {this.renderRunway(0)}
            {this.renderRunway(1)}

            {fcomCentre(531, 380, <span class="mfd-label">FREE TEXT</span>)}
            {fcomAt(
              583,
              134,
              <InputField<string>
                dataEntryFormat={new FreeTextFormat(24)}
                value={this.freeText}
                containerStyle="width: 488px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(
              656,
              290,
              <Button
                label="SEND T.O<br />REQUEST *"
                disabled={this.noCompanyTakeoffData}
                onClick={() => {}}
                buttonStyle="min-width: 183px; min-height: 59px;"
              />,
            )}
            {fcomAt(
              788,
              4,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="min-width: 127px;"
              />,
            )}
            {fcomAt(
              788,
              487,
              <Button
                label="RECEIVED T.O DATA"
                onClick={() => this.props.mfd.uiService.navigateTo(`fms/active/${receivedCpnyToDataPage}`)}
                buttonStyle="min-width: 273px;"
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
