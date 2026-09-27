// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ComponentProps,
  DisplayComponent,
  FSComponent,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdAtccomRequest.scss';
import './MfdAtccomConnect.scss';

import { AtccomMfdPageProps, MfdDisplayInterface } from '../../MFD';
import { ActivePageTitleBar } from '../common/ActivePageTitleBar';
import { fcomAt, fcomCentre, fcomLine } from '../common/FcomLayout';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { ConfirmationDialog } from '../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import { ATCCOMMessages } from '../../shared/NXSystemMessages';
import { AtccomFooter } from './MfdAtccomFooter';
import { AtcDatalinkSystem } from '../../ATCCOM/AtcDatalinkSystem';
import { FrameComposer } from '../../ATCCOM/FrameComposer';
import {
  ADD_TEXT_MENU,
  isAddTextFrame,
  EMERGENCY_MENU,
  OTHER_REPORTS_MENU,
  REQUEST_FRAMES,
  REQUEST_MENU,
  RequestFrame,
  RequestFrameId,
} from '../../ATCCOM/RequestFrames';
import { requestFieldFormat } from './AtccomEntryFormats';
import { AtccomMenuButtonLayout, AtccomRequestMenu } from './AtccomRequestMenu';

/** The geometry of the frames of a page (FCOM figures, page coordinates) */
interface FrameGeometry {
  /** The top of the first frame and the height of a frame: a fifth of the area above the buttons */
  areaTop: number;
  frameHeight: number;
  frameWidth: number;
  /** The centres of the three lines of a frame; the first one is left of the delete symbol */
  lineY: number[];
  textLeft: number;
  trashLeft: number;
}

/** REQUEST and OTHER REPORTS: the frames between the title bar and the buttons */
const FRAME_GEOMETRY: FrameGeometry = {
  areaTop: -7,
  frameHeight: 152.4,
  frameWidth: 569,
  lineY: [29, 77, 124],
  textLeft: 21,
  trashLeft: 521,
};

/** EMERGENCY: the frames below the ADS EMERGENCY area (FCOM figure DSC-46-10-20-30 P 35) */
const EMERGENCY_GEOMETRY: FrameGeometry = {
  areaTop: 112.6,
  frameHeight: 130.5,
  frameWidth: 537,
  lineY: [33.8, 76, 116],
  textLeft: 25,
  trashLeft: 483.3,
};

/** The labels: 13.5 px per character; the space between a label and a field */
const CHAR_WIDTH = 13.5;
const GAP = 19;

/** The REQUEST menu buttons, from the FCOM figure */
const REQUEST_MENU_LAYOUT: AtccomMenuButtonLayout[] = [
  { button: REQUEST_MENU[0], top: 4.2, height: 42.6 },
  { button: REQUEST_MENU[1], top: 47.8, height: 42.6 },
  { button: REQUEST_MENU[2], top: 91.4, height: 42.6 },
  { button: REQUEST_MENU[3], top: 135, height: 42.6 },
  { button: REQUEST_MENU[4], top: 178.6, height: 64.5 },
  { button: REQUEST_MENU[5], top: 243.1, height: 42.6 },
  { button: ADD_TEXT_MENU, top: 327.2, height: 42.6 },
];

/** The OTHER REPORTS menu buttons, from the FCOM figure */
const OTHER_REPORTS_MENU_LAYOUT: AtccomMenuButtonLayout[] = [
  { button: OTHER_REPORTS_MENU[0], top: 5.5, height: 64.2 },
  { button: OTHER_REPORTS_MENU[1], top: 72.1, height: 64.2 },
  { button: OTHER_REPORTS_MENU[2], top: 137.5, height: 64.2 },
  { button: OTHER_REPORTS_MENU[3], top: 202.9, height: 40.5 },
  { button: OTHER_REPORTS_MENU[4], top: 245.3, height: 64.2 },
  { button: OTHER_REPORTS_MENU[5], top: 311.3, height: 64.2 },
  { button: OTHER_REPORTS_MENU[6], top: 419.7, height: 64.2 },
];

/** The EMERGENCY menu buttons, from the FCOM figure */
const EMERGENCY_MENU_LAYOUT: AtccomMenuButtonLayout[] = [
  { button: EMERGENCY_MENU[0], top: 121.3, height: 42.6 },
  { button: EMERGENCY_MENU[1], top: 165.2, height: 42.6 },
  { button: EMERGENCY_MENU[2], top: 208.3, height: 42.6 },
  { button: EMERGENCY_MENU[3], top: 260.9, height: 42.6 },
  { button: EMERGENCY_MENU[4], top: 304.1, height: 42.6 },
  { button: EMERGENCY_MENU[5], top: 347.3, height: 42.6 },
  { button: EMERGENCY_MENU[6], top: 390.5, height: 42.6 },
  { button: EMERGENCY_MENU[7], top: 443.1, height: 65.1 },
  { button: EMERGENCY_MENU[8], top: 509.5, height: 63.9 },
  { button: EMERGENCY_MENU[9], top: 583.9, height: 42.6 },
];

/** A frame can be selected once; an ADD TEXT frame completes another frame */
function isFrameAvailable(id: RequestFrameId, frames: readonly RequestFrame[]): boolean {
  return !frames.some((f) => f.id === id) && (!isAddTextFrame(id) || frames.some((f) => !isAddTextFrame(f.id)));
}

interface RequestFrameSlotProps extends ComponentProps {
  mfd: MfdDisplayInterface;
  atcService: AtcDatalinkSystem;
  composer: FrameComposer;
  geometry: FrameGeometry;
  index: number;
  frame: Subscribable<RequestFrame | null>;
}

/** A frame of the REQUEST page: its lines of labels and fields, the delete symbol, and the line below it */
class RequestFrameSlot extends DisplayComponent<RequestFrameSlotProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  private readonly containerRef = FSComponent.createRef<HTMLDivElement>();

  private renderedId: RequestFrameId | null = null;

  private content: VNode | null = null;

  /** The values of the fields of the displayed frame */
  private values = new Map<string, Subject<string | null>>();

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(this.props.frame.sub((frame) => this.update(frame), true));
  }

  private update(frame: RequestFrame | null): void {
    if ((frame?.id ?? null) !== this.renderedId) {
      this.renderFrame(frame);
    }
    if (frame) {
      for (const [key, value] of this.values) {
        value.set(frame.values[key] ?? null);
      }
    }
  }

  private renderFrame(frame: RequestFrame | null): void {
    if (this.content) {
      FSComponent.shallowDestroy(this.content);
      this.content = null;
    }
    this.containerRef.instance.innerHTML = '';
    this.values = new Map();
    this.renderedId = frame?.id ?? null;
    if (!frame) {
      return;
    }

    const index = this.props.index;
    const geometry = this.props.geometry;
    const items: VNode[] = [];
    REQUEST_FRAMES[frame.id].lines(frame).forEach((line, lineIndex) => {
      let x = geometry.textLeft;
      for (const item of line) {
        if (typeof item === 'string') {
          items.push(fcomAt(geometry.lineY[lineIndex], x, <span class="mfd-atccom-request-label">{item}</span>));
          x += item.length * CHAR_WIDTH + GAP;
        } else {
          const value = Subject.create<string | null>(frame.values[item.key] ?? null);
          this.values.set(item.key, value);
          items.push(
            fcomAt(
              geometry.lineY[lineIndex],
              x,
              <InputField<string>
                dataEntryFormat={requestFieldFormat(item.kind)}
                value={value}
                mandatory={Subject.create(item.mandatory)}
                canBeCleared={Subject.create(true)}
                dataHandlerDuringValidation={async (newValue) =>
                  this.props.composer.setValue(index, item.key, newValue)
                }
                errorHandler={(e) => this.props.atcService.showAtcErrorMessage(e.type, e.details)}
                containerStyle={`width: ${item.width}px;`}
                alignText="center"
                class={item.kind === 'freetext' ? 'mfd-atccom-request-freetext' : undefined}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />,
            ),
          );
          x += item.width + GAP;
        }
      }
    });
    items.push(
      fcomAt(
        geometry.lineY[0],
        geometry.trashLeft,
        <Button
          label={
            <svg width="26" height="30" viewBox="0 0 26 30">
              <rect x="1" y="1" width="24" height="3" fill="none" stroke="white" stroke-width="1.5" />
              <rect x="9" y="-1" width="8" height="2" fill="white" />
              <rect x="3" y="6" width="20" height="23" fill="none" stroke="white" stroke-width="1.5" />
              <line x1="8" y1="9" x2="8" y2="26" stroke="white" stroke-width="1.5" />
              <line x1="13" y1="9" x2="13" y2="26" stroke="white" stroke-width="1.5" />
              <line x1="18" y1="9" x2="18" y2="26" stroke="white" stroke-width="1.5" />
            </svg>
          }
          onClick={() => this.props.composer.remove(index)}
          buttonStyle="width: 44px; height: 43px; padding: 0; display: flex; justify-content: center; align-items: center;"
        />,
      ),
    );
    items.push(fcomLine(geometry.frameHeight, 0, geometry.frameWidth));
    this.content = <>{items}</>;
    FSComponent.render(this.content, this.containerRef.instance);
  }

  public destroy(): void {
    if (this.content) {
      FSComponent.shallowDestroy(this.content);
    }
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  render(): VNode {
    return (
      <div
        ref={this.containerRef}
        class="mfd-atccom-request-frame"
        style={`top: ${this.props.geometry.areaTop + this.props.index * this.props.geometry.frameHeight}px; width: ${this.props.geometry.frameWidth}px; height: ${this.props.geometry.frameHeight}px;`}
      />
    );
  }
}

/**
 * A page composing a message of frames, laid out on the FCOM figures (page coordinates = display y - 143): up to five
 * frames created with the menu of the page; CANCEL deletes the message, XFR TO MAILBOX transfers it to the mailbox when
 * all its mandatory fields (amber boxes) are completed.
 */
abstract class AtccomFramePage extends DisplayComponent<AtccomMfdPageProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  private readonly subs = [] as Subscription[];

  protected abstract readonly composer: FrameComposer;

  protected abstract readonly menu: { layout: AtccomMenuButtonLayout[]; left: number; width: number };

  protected readonly geometry: FrameGeometry = FRAME_GEOMETRY;

  /** The EMERGENCY page has an orange title bar */
  protected readonly emergency: boolean = false;

  /** The content of the page above the frames (EMERGENCY: the ADS EMERGENCY area) */
  protected renderHeader(): VNode | null {
    return null;
  }

  private get frames() {
    return this.composer.frames;
  }

  private slotFrames: Subscribable<RequestFrame | null>[] = [];

  private noRequest: Subscribable<boolean> = Subject.create(true);

  private incomplete: Subscribable<boolean> = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    this.subs.forEach((x) => x.destroy());

    super.destroy();
  }

  protected onSelect(id: RequestFrameId): void {
    this.composer.add(id);
  }

  render(): VNode {
    // The abstract members are set once the subclass is constructed
    const slotFrames = [0, 1, 2, 3, 4].map((i) => this.frames.map((frames) => frames[i] ?? null));
    const noRequest = this.frames.map((frames) => frames.length === 0);
    const incomplete = this.frames.map((frames) => !this.composer.isComplete(frames));
    this.slotFrames = slotFrames;
    this.noRequest = noRequest;
    this.incomplete = incomplete;
    this.subs.push(...slotFrames, noRequest, incomplete);
    return (
      <>
        <ActivePageTitleBar
          activePage={Subject.create(this.props.pageTitle ?? '')}
          offset={Subject.create('')}
          emergency={this.emergency}
        />
        {/* begin page content */}
        <div class="mfd-page-container">
          <div class="mfd-fcom-canvas mfd-atccom-request">
            {this.renderHeader()}
            {this.slotFrames.map((frame, index) => (
              <RequestFrameSlot
                mfd={this.props.mfd}
                atcService={this.props.atcService}
                composer={this.composer}
                geometry={this.geometry}
                index={index}
                frame={frame}
              />
            ))}
            {fcomAt(
              783.5,
              0,
              <Button
                label="CANCEL"
                disabled={this.noRequest}
                onClick={() => this.composer.cancel()}
                buttonStyle="width: 193px; height: 57px;"
              />,
            )}
            {fcomAt(
              783.5,
              579,
              <Button
                label={'XFR\nTO MAILBOX'}
                disabled={this.incomplete}
                onClick={() => this.composer.transferToMailbox()}
                buttonStyle="width: 189px; height: 57px;"
              />,
            )}
            <AtccomRequestMenu
              buttons={this.menu.layout}
              left={this.menu.left}
              width={this.menu.width}
              isAvailable={isFrameAvailable}
              frames={this.frames}
              onSelect={(id) => this.onSelect(id)}
            />
          </div>
        </div>
        {/* end page content */}
        <AtccomFooter bus={this.props.bus} mfd={this.props.mfd} atcService={this.props.atcService} />
      </>
    );
  }
}

/**
 * REQUEST page (A380 FCOM DSC-46-10-20-30 P 11-16): the frames of a request message, created with the REQUEST menu
 */
export class MfdAtccomRequest extends AtccomFramePage {
  protected readonly composer = this.props.atcService.request;

  protected readonly menu = { layout: REQUEST_MENU_LAYOUT, left: 569, width: 182 };

  protected onSelect(id: RequestFrameId): void {
    let label: string | undefined;
    if (id === 'SID_STAR') {
      // With the aircraft on ground, the request is made for a SID, in flight for a STAR (FCOM P 14)
      label = SimVar.GetSimVarValue('SIM ON GROUND', 'bool') ? 'REQUEST SID' : 'REQUEST STAR';
    }
    this.composer.add(id, label);
  }
}

/**
 * REPORT/OTHER REPORTS page (A380 FCOM DSC-46-10-20-30 P 24-26): the frames of a report message, created with the OTHER
 * REPORTS menu
 */
export class MfdAtccomOtherReports extends AtccomFramePage {
  protected readonly composer = this.props.atcService.otherReports;

  protected readonly menu = { layout: OTHER_REPORTS_MENU_LAYOUT, left: 572.4, width: 180.6 };
}

/**
 * EMERGENCY page (A380 FCOM DSC-46-10-20-30 P 35-38), laid out on the FCOM figure: the ADS EMERGENCY status, and the
 * frames of an emergency message created with the EMERGENCY menu (MAYDAY, PANPAN, CANCEL EMER...)
 */
export class MfdAtccomEmergency extends AtccomFramePage {
  protected readonly composer = this.props.atcService.emergency;

  protected readonly menu = { layout: EMERGENCY_MENU_LAYOUT, left: 541.5, width: 226.5 };

  protected readonly geometry = EMERGENCY_GEOMETRY;

  protected readonly emergency = true;

  private readonly adsEmergencyRef = FSComponent.createRef<HTMLDivElement>();

  private readonly confirmationVisible = Subject.create(false);

  private readonly adsOnClass = this.props.atcService.adsEmergency.map((on) => (on ? 'ads-upper active' : 'ads-upper'));

  private readonly adsOffClass = this.props.atcService.adsEmergency.map((on) =>
    on ? 'ads-lower' : 'ads-lower active',
  );

  /** ON after confirmation (ADS EMERGENCY ON ?), as on the CONNECT/CONNECTION STATUS page */
  private readonly onAdsEmergencyClicked = () => {
    if (this.props.atcService.adsEmergency.get()) {
      this.props.atcService.adsEmergency.set(false);
    } else {
      this.confirmationVisible.set(true);
    }
  };

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // A plain element: JSX onClick is not a listener with FSComponent
    this.adsEmergencyRef.instance.addEventListener('click', this.onAdsEmergencyClicked);
  }

  public destroy(): void {
    this.adsEmergencyRef.getOrDefault()?.removeEventListener('click', this.onAdsEmergencyClicked);
    this.adsOnClass.destroy();
    this.adsOffClass.destroy();

    super.destroy();
  }

  protected onSelect(id: RequestFrameId): void {
    // SENDING MAYDAY WILL SWITCH ADS TO EMERGENCY, as soon as MAYDAY is clicked (FCOM DSC-46-10-20-40 S)
    if (id === 'MAYDAY') {
      this.props.atcService.addMessageToQueue(ATCCOMMessages.sendingMaydayWillSwitchAdsToEmergency);
    }
    this.composer.add(id);
  }

  protected renderHeader(): VNode {
    return (
      <>
        {fcomCentre(9.9, 375.6, <span class="mfd-label">ADS EMERGENCY</span>)}
        <div ref={this.adsEmergencyRef} class="mfd-atccom-ads-slot" style="left: 325.5px; top: 26.2px;">
          <div class="mfd-atccom-ads-button" style="width: 117px;">
            <span class={this.adsOnClass}>ON</span>
            <span class={this.adsOffClass}>OFF</span>
          </div>
        </div>
        {fcomLine(112.6, 6.3, 762.5)}
        <div class="mfd-atccom-dialogs">
          <ConfirmationDialog
            visible={this.confirmationVisible}
            cancelAction={() => this.confirmationVisible.set(false)}
            confirmAction={() => {
              this.confirmationVisible.set(false);
              this.props.atcService.adsEmergency.set(true);
            }}
            contentContainerStyle="width: 400px; height: 165px; transform: translateX(-50%);"
          >
            ADS EMERGENCY ON ?
          </ConfirmationDialog>
        </div>
      </>
    );
  }
}
