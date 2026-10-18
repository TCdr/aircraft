//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { DestroyableComponent } from '@flybywiresim/msfs-avionics-common';
import { AbstractOitAvncsPageProps } from '../../../OIT';
import { RadioButtonGroup } from '../../../../MsfsAvionicsCommon/UiWidgets/RadioButtonGroup';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { AirportFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { MAX_WEATHER_AIRPORTS, weatherRequestAirports } from '../../../System/CompanyComRequests';

interface OitAvncsCompanyComWeatherRequestProps extends AbstractOitAvncsPageProps {}

/** The page of the drafts: the weather request of every flight phase */
const WEATHER_REQUEST_PAGE = 'nss-avncs/company-com/weather';

/**
 * COMPANY COM > Requests > Weather: the METAR or TAF of up to four airports, sent through the AOC; the report comes in
 * the inbox (the layout is an operator choice, see CompanyComRequests).
 */
export class OitAvncsCompanyComWeatherRequest extends DestroyableComponent<OitAvncsCompanyComWeatherRequestProps> {
  private readonly requests = this.props.container.ansu.companyComRequests;

  /** The entries stay while COMPANY COM is open: the page is drawn again at each return to it */
  private readonly drafts = this.props.container.ansu.pageDrafts;

  /** 0: METAR, 1: TAF */
  private readonly reportType = this.drafts.field<number | null>(WEATHER_REQUEST_PAGE, 'report type', 0);

  private readonly airports = Array.from({ length: MAX_WEATHER_AIRPORTS }, (_, i) =>
    this.drafts.field<string | null>(WEATHER_REQUEST_PAGE, `airport ${i}`, null),
  );

  private send(): void {
    this.requests.requestWeather(
      weatherRequestAirports(this.airports.map((airport) => airport.get())),
      this.reportType.get() !== 1,
    );
  }

  render(): VNode {
    return (
      <>
        <div class="oit-ccom-headline">Weather Request</div>
        <div class="oit-labeled-box-container">
          <span class="oit-labeled-box-label">Report</span>
          <div style="display: flex; flex-direction: row; justify-content: flex-start; padding: 15px;">
            <RadioButtonGroup
              values={['METAR', 'TAF']}
              selectedIndex={this.reportType}
              idPrefix={`${this.props.uiService.captOrFo}_oit-ccom-wx-type`}
            />
          </div>
        </div>
        <div class="oit-labeled-box-container">
          <span class="oit-labeled-box-label">Airports</span>
          <div style="display: flex; flex-direction: row; justify-content: space-around; padding: 15px;">
            {this.airports.map((airport) => (
              <InputField<string>
                dataEntryFormat={new AirportFormat()}
                value={airport}
                containerStyle="width: 150px;"
                alignText="center"
                canBeCleared={true}
                hEventConsumer={this.props.container.hEventConsumer}
                interactionMode={this.props.container.interactionMode}
                errorHandler={() => {}}
              />
            ))}
          </div>
        </div>
        <div style="display: flex; flex-direction: row; justify-content: flex-end; align-items: center; margin: 0px 20px;">
          <div class="oit-green-text" style="margin-right: 25px;">
            {this.requests.weatherStatus}
          </div>
          <Button label="SEND" onClick={() => this.send()} />
        </div>
        <div style="flex-grow: 1" />
      </>
    );
  }
}
