// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DisplayComponent, FSComponent, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdAtccomRequest.scss';

import { AtccomMfdPageProps } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomLine } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AtccomFooter } from './MfdAtccomFooter';
import { applyModification, modifyLines } from '../../ATCCOM/ModifyMessage';
import { requestFieldFormat } from './AtccomEntryFormats';

/** The frames of the page, as on the REQUEST page (FCOM figures: a fifth of the area above the buttons) */
const AREA_TOP = -7;
const FRAME_HEIGHT = 152.4;
const LINE_Y = [29, 77, 124];
const TEXT_LEFT = 21;
const CHAR_WIDTH = 13.5;
const GAP = 19;

/**
 * REPORT/MODIFY page (A380 FCOM DSC-46-10-20-30 P 22-23), laid out on the FCOM figure: the downlink message of the
 * mailbox (the response prepared by the FMS for a confirm message), a frame for each of its elements with its values;
 * ADD FREETEXT adds a freetext frame (RETURN TO REPORT goes back), CANCEL closes the page, XFR TO MAILBOX transfers the
 * modified message to the mailbox.
 */
export class MfdAtccomModify extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly message = this.props.atcService.modifyMessage.get();

  private readonly lines = this.message ? modifyLines(this.message) : [];

  /** The modified values, by element / content index */
  private readonly values = new Map<string, string>();

  private readonly freetextMode = Subject.create(false);

  private readonly freetext = [0, 1, 2].map(() => Subject.create<string | null>(null));

  private readonly incomplete = Subject.create(false);

  private readonly freetextLabel = this.freetextMode.map((on) => (on ? 'RETURN\nTO REPORT' : 'ADD\nFREETEXT'));

  private readonly freetextVisibility = this.freetextMode.map((on) => (on ? 'inherit' : 'hidden'));

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.freetextLabel, this.freetextVisibility);
    this.updateCompleteness();
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  /** All the values of the message are completed */
  private updateCompleteness(): void {
    let complete = !!this.message;
    for (const line of this.lines) {
      for (const item of line) {
        if (typeof item !== 'string' && !(this.values.get(`${item.element}/${item.content}`) ?? item.value)) {
          complete = false;
        }
      }
    }
    this.incomplete.set(!complete);
  }

  private transfer(): void {
    if (!this.message || this.incomplete.get()) {
      return;
    }
    const freetext = this.freetext
      .map((line) => line.get())
      .filter((line) => line)
      .join(' ');
    this.props.atcService.transferModifiedMessage(applyModification(this.message, this.values, freetext || null));
    this.props.mfd.uiService.navigateTo('atccom/request');
  }

  private cancel(): void {
    this.props.atcService.cancelModify();
    // The default ATC COM page
    this.props.mfd.uiService.navigateTo('atccom/request');
  }

  render(): VNode {
    return (
      <>
        <ActivePageTitleBar activePage={Subject.create(this.props.pageTitle ?? '')} offset={Subject.create('')} />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-request">
            {this.lines.map((line, index) => {
              const top = AREA_TOP + index * FRAME_HEIGHT;
              let x = TEXT_LEFT;
              return (
                <>
                  {line.map((item) => {
                    if (typeof item === 'string') {
                      const node = fcomAt(top + LINE_Y[0], x, <span class="mfd-atccom-request-label">{item}</span>);
                      x += item.length * CHAR_WIDTH + GAP;
                      return node;
                    }
                    const value = Subject.create<string | null>(item.value || null);
                    const width = item.kind === 'freetext' ? 300 : 223;
                    const node = fcomAt(
                      top + LINE_Y[0],
                      x,
                      <InputField<string>
                        dataEntryFormat={requestFieldFormat(item.kind)}
                        value={value}
                        mandatory={Subject.create(true)}
                        inactive={this.freetextMode}
                        dataHandlerDuringValidation={async (newValue) => {
                          this.values.set(`${item.element}/${item.content}`, newValue ?? '');
                          this.updateCompleteness();
                        }}
                        errorHandler={(e) => this.props.atcService.showAtcErrorMessage(e.type, e.details)}
                        containerStyle={`width: ${width}px;`}
                        alignText="center"
                        class={item.kind === 'freetext' ? 'mfd-atccom-request-freetext' : undefined}
                        hEventConsumer={this.props.mfd.hEventConsumer}
                        interactionMode={this.props.mfd.interactionMode}
                      />,
                    );
                    x += width + GAP;
                    return node;
                  })}
                  {fcomLine(top + FRAME_HEIGHT, 0, 569)}
                </>
              );
            })}
            {/* The freetext frame, after the frames of the message */}
            <div style={{ visibility: this.freetextVisibility }}>
              {this.freetext.map((line, i) =>
                fcomAt(
                  AREA_TOP + this.lines.length * FRAME_HEIGHT + LINE_Y[i],
                  TEXT_LEFT,
                  <InputField<string>
                    dataEntryFormat={requestFieldFormat('freetext')}
                    value={line}
                    canBeCleared={Subject.create(true)}
                    errorHandler={(e) => this.props.atcService.showAtcErrorMessage(e.type, e.details)}
                    containerStyle="width: 480px;"
                    alignText="center"
                    class="mfd-atccom-request-freetext"
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                ),
              )}
            </div>
            {fcomAt(
              783.5,
              0,
              <Button label="CANCEL" onClick={() => this.cancel()} buttonStyle="width: 190px; height: 57px;" />,
            )}
            {fcomAt(
              783.5,
              389.6,
              <Button
                label={this.freetextLabel}
                disabled={Subject.create(!this.message || this.lines.length >= 5)}
                onClick={() => this.freetextMode.set(!this.freetextMode.get())}
                buttonStyle="width: 191px; height: 57px;"
              />,
            )}
            {fcomAt(
              783.5,
              584.4,
              <Button
                label={'XFR\nTO MAILBOX'}
                disabled={this.incomplete}
                onClick={() => this.transfer()}
                buttonStyle="width: 184px; height: 57px;"
              />,
            )}
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}
