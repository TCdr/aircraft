// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { CompanyRouteFormat, FreeTextFormat, LongAlphanumericFormat } from '../../common/DataEntryFormats';

import { fcomAt, fcomCentre, fcomRight } from '../../common/FcomLayout';

interface MfdFmsFplnCpnyFplnReqProps extends AbstractMfdPageProps {}

/**
 * COMPANY F-PLN REQUEST page (A380 FCOM DSC-22-FMS-20-30 "COMPANY F-PLN REQUEST PAGE"): flight number, company route
 * and free text of the flight plan request, sent with SEND F-PLN REQUEST for the flight plan the page was opened from.
 *
 * The company ground station is SimBrief: the request downloads the SimBrief OFP, whatever the entered data.
 */
export class MfdFmsFplnCpnyFplnReq extends FmsPage<MfdFmsFplnCpnyFplnReqProps> {
  private readonly flightNumber = Subject.create<string | null>(null);

  private readonly companyRoute = Subject.create<string | null>(null);

  private readonly freeText = Subject.create<string | null>(null);

  private readonly sendButtonLabel = this.props.fmcService.master.fmgc.data.cpnyFplnUplinkInProgress.map((pending) =>
    pending ? 'REQUEST\nPENDING...' : 'SEND F-PLN\nREQUEST *',
  );

  /** FCOM: after engine start, a flight plan request can only be sent from a secondary flight plan */
  private readonly sendButtonDisabled = MappedSubject.create(
    ([pending, enginesStarted, planIndex]) => pending || (enginesStarted && planIndex < FlightPlanIndex.FirstSecondary),
    this.props.fmcService.master.fmgc.data.cpnyFplnUplinkInProgress,
    this.props.fmcService.master.enginesWereStarted,
    this.loadedFlightPlanIndex,
  );

  protected onNewData(): void {
    const planIndex = this.loadedFlightPlanIndex.get();
    // Defaults: the flight number of the flight plan, and the company route of a secondary flight plan
    if (this.flightNumber.get() === null && this.props.flightPlanInterface.has(planIndex)) {
      this.flightNumber.set(this.props.flightPlanInterface.get(planIndex).getFlightNumber().get() ?? null);
    }
    if (this.companyRoute.get() === null && planIndex >= FlightPlanIndex.FirstSecondary) {
      this.companyRoute.set(this.props.fmcService.master.fmgc.data.companyRouteIdent(planIndex).get());
    }
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      // The FCOM page title has no flight plan prefix
      this.props.mfd.uiService.activeUri.sub(() => this.activePageTitle.set('COMPANY F-PLN REQUEST'), true),
      this.sendButtonLabel,
      this.sendButtonDisabled,
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 28), page container coordinates */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas">
            {fcomRight(56, 143, <span class="mfd-label">FLT NBR</span>)}
            {fcomAt(
              56,
              156,
              <InputField<string>
                dataEntryFormat={new LongAlphanumericFormat()}
                value={this.flightNumber}
                containerStyle="width: 209px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomRight(115, 143, <span class="mfd-label">CPNY RTE</span>)}
            {fcomAt(
              115,
              156,
              <InputField<string>
                dataEntryFormat={new CompanyRouteFormat()}
                value={this.companyRoute}
                containerStyle="width: 209px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomCentre(178, 384, <span class="mfd-label">FREE TEXT</span>)}
            {fcomAt(
              230,
              136,
              <InputField<string>
                dataEntryFormat={new FreeTextFormat(24)}
                value={this.freeText}
                containerStyle="width: 489px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            )}
            {fcomAt(
              305,
              290,
              <Button
                label={
                  <span class="fr aic">
                    <span style="white-space: pre; text-align: left;">{this.sendButtonLabel}</span>
                    <span
                      style={{
                        'margin-left': '18px',
                        visibility: this.props.fmcService.master.fmgc.data.cpnyFplnUplinkInProgress.map((p) =>
                          p ? 'hidden' : 'visible',
                        ),
                      }}
                    >
                      *
                    </span>
                  </span>
                }
                disabled={this.sendButtonDisabled}
                onClick={() => this.props.fmcService.master.cpnyFplnRequest(this.loadedFlightPlanIndex.get())}
                buttonStyle="min-width: 187px; min-height: 58px;"
              />,
            )}
            {fcomAt(
              788,
              5,
              <Button
                label="RETURN"
                buttonStyle="min-width: 129px;"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
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
