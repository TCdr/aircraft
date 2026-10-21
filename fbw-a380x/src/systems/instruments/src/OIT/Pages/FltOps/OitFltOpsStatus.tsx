//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  DisplayComponent,
  FSComponent,
  Subject,
  SubscribableMapFunctions,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { AbstractOitFltOpsPageProps } from '../../OIT';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AirportFormat, LongAlphanumericFormat } from '../../../MFD/pages/common/DataEntryFormats';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { registrationList } from '../../System/FltOpsStatusSync';

/** Design choice: the sim gives no manufacturer serial number (MSN): a fixed one */
const MSN = '225';

interface OitFltOpsStatusPageProps extends AbstractOitFltOpsPageProps {}

export class OitFltOpsStatus extends DisplayComponent<OitFltOpsStatusPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  /**
   * A laptop operated as a stand-alone (not connected to the network) shows "SYNCHRONIZATION NOT AVAIL" on the FLT OPS
   * STS page.
   */
  private readonly hideSynchronizationNotAvail = this.props.container.laptop.standalone.map(
    SubscribableMapFunctions.not(),
  );

  private readonly registrations = registrationList(SimVar.GetSimVarValue('ATC ID', 'string'));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.hideSynchronizationNotAvail);
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subs) {
      s.destroy();
    }

    super.destroy();
  }

  render(): VNode {
    return (
      <>
        {/* begin page content */}
        <div class="oit-page-container framed">
          <div class="oit-flt-ops-sts-upper">
            <div class="oit-flt-ops-sts-line">
              <div class="oit-flt-ops-sts-line-left oit-label bigger">ACFT REGISTRATION</div>
              <div class="oit-flt-ops-sts-line-right oit-label bigger">
                <DropdownMenu
                  idPrefix={`${this.props.uiService.captOrFo}_OIT_acftRegistration`}
                  selectedIndex={Subject.create<number | null>(this.registrations.length > 0 ? 0 : null)}
                  values={ArraySubject.create(this.registrations)}
                  freeTextAllowed={false} // OIT list, not an FMS field: list only
                  containerStyle="width: 600px;"
                  alignLabels="center"
                  numberOfDigitsForInputField={8}
                  tmpyActive={Subject.create(false)}
                  hEventConsumer={this.props.container.hEventConsumer}
                  interactionMode={this.props.container.interactionMode}
                />
                <div style="width: 40px;" />
                <Button
                  label="SYNCHRO<br />AVIONICS"
                  onClick={() => this.props.container.laptop.synchroAvionics()}
                  containerStyle="width: 175px;"
                />
                <div style="flex-grow: 1" />
              </div>
            </div>
            <div class="oit-flt-ops-sts-line">
              <div class="oit-flt-ops-sts-line-left oit-label bigger">MSN</div>
              <div class="oit-flt-ops-sts-line-right oit-label bigger cyan">{MSN}</div>
            </div>
            <div class="oit-flt-ops-sts-line">
              <div class="oit-flt-ops-sts-line-left oit-label bigger">OIS VERSION</div>
              <div class="oit-flt-ops-sts-line-right oit-label bigger">{this.props.container.laptop.oisVersion}</div>
            </div>
            <div class={{ 'oit-flt-ops-sts-line': true, hidden: this.hideSynchronizationNotAvail }}>
              <div class="oit-flt-ops-sts-line-left oit-label bigger" />
              <div class="oit-flt-ops-sts-line-right oit-label bigger amber">SYNCHRONIZATION NOT AVAIL</div>
            </div>
          </div>
          <div class="oit-flt-ops-sts-lower">
            <div class="oit-flt-ops-sts-line">
              <div class="oit-flt-ops-sts-line-left oit-label bigger">FLT NUMBER</div>
              <div class="oit-flt-ops-sts-line-right oit-label bigger">
                <InputField<string>
                  dataEntryFormat={new LongAlphanumericFormat()}
                  mandatory={Subject.create(true)}
                  value={this.props.container.laptopData.fltNumber}
                  onModified={(value) => this.props.container.laptop.fltOpsStatus.enter('fltNumber', value)}
                  containerStyle="width: 600px; margin-right: 5px;"
                  alignText="center"
                  hEventConsumer={this.props.container.hEventConsumer}
                  interactionMode={this.props.container.interactionMode}
                  overrideEmptyMandatoryPlaceholder="[]"
                  errorHandler={() => {}}
                />
                <div style="flex-grow: 1" />
              </div>
            </div>
            <div class="oit-flt-ops-sts-line">
              <div class="oit-flt-ops-sts-line-left oit-label bigger">FROM</div>
              <div class="oit-flt-ops-sts-line-right oit-label bigger">
                <InputField<string>
                  dataEntryFormat={new AirportFormat()}
                  mandatory={Subject.create(true)}
                  value={this.props.container.laptopData.fromAirport}
                  onModified={(value) => this.props.container.laptop.fltOpsStatus.enter('fromAirport', value)}
                  containerStyle="width: 250px; margin-right: 5px;"
                  alignText="center"
                  hEventConsumer={this.props.container.hEventConsumer}
                  interactionMode={this.props.container.interactionMode}
                  overrideEmptyMandatoryPlaceholder="[]"
                  errorHandler={() => {}}
                />
                <div class="oit-label bigger" style="width: 100px; padding-left: 40px;">
                  TO
                </div>
                <InputField<string>
                  dataEntryFormat={new AirportFormat()}
                  mandatory={Subject.create(true)}
                  value={this.props.container.laptopData.toAirport}
                  onModified={(value) => this.props.container.laptop.fltOpsStatus.enter('toAirport', value)}
                  containerStyle="width: 250px; margin-right: 5px;"
                  alignText="center"
                  hEventConsumer={this.props.container.hEventConsumer}
                  interactionMode={this.props.container.interactionMode}
                  overrideEmptyMandatoryPlaceholder="[]"
                  errorHandler={() => {}}
                />
                <div style="flex-grow: 1" />
              </div>
            </div>
          </div>
        </div>
        {/* end page content */}
      </>
    );
  }
}
