//  Copyright (c) 2025 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  MappedSubscribable,
  NodeReference,
  SimVarValueType,
  Subject,
  Subscribable,
  Subscription,
  VNode,
} from '@microsoft/msfs-sdk';
import { OisDomain } from './OIT';
import { OitUiService, OitUriInformation } from './OitUiService';
import { getDisplayIndex, OitDisplayUnit } from './OitDisplayUnit';
import { fltOpsPageForUrl } from './OitPageDirectory';
import { OitFltOpsHeader } from './Pages/FltOps/OitFltOpsHeader';
import { OitNotFound } from './Pages/OitNotFound';
import { OitFltOpsFooter } from './Pages/FltOps/OitFltOpsFooter';
import { OisLaptop } from './OisLaptop';
import { InternalKbdKeyEvent, OitSimvars } from './OitSimvarPublisher';
import { InteractionMode } from '../MsfsAvionicsCommon/UiWidgets/InputField';
import { OitFltOpsLoadingScreen } from './Pages/FltOps/OitFltOpsLoadingScreen';
import { OitFltOpsLogin } from './Pages/FltOps/OitFltOpsLogin';
import { XOisFunction, fltOpsPageCode } from './System/XOisFunction';

interface OitFltOpsContainerProps {
  readonly bus: EventBus;
  readonly laptop: OisLaptop;
  readonly displayUnitRef: NodeReference<OitDisplayUnit>;
  readonly captOrFo: 'CAPT' | 'FO';
  readonly avncsOrFltOps: Subscribable<OisDomain>;
}

export abstract class OitFltOpsContainer extends DisplayComponent<OitFltOpsContainerProps> {
  // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
  protected readonly subscriptions = [] as Subscription[];

  private readonly sub = this.props.bus.getSubscriber<OitSimvars>();

  #uiService = new OitUiService(this.props.captOrFo);

  get uiService() {
    return this.#uiService;
  }

  get laptop() {
    return this.props.laptop;
  }

  get laptopData() {
    return this.props.laptop.data;
  }

  public readonly hEventConsumer = this.props.bus.getSubscriber<InternalKbdKeyEvent>().on('kbdKeyEvent');
  public readonly interactionMode = Subject.create<InteractionMode>(InteractionMode.Touchscreen);

  private readonly topRef = FSComponent.createRef<HTMLDivElement>();

  private readonly laptopHealthy = ConsumerSubject.create(
    this.sub.on(this.props.captOrFo === 'CAPT' ? 'laptopCaptHealthy' : 'laptopFoHealthy'),
    false,
  );

  private readonly hideContent = MappedSubject.create(
    ([mode, healthy]) => mode === 'nss-avncs' || !healthy,
    this.props.avncsOrFltOps,
    this.laptopHealthy,
  );

  private readonly hideContainer = this.props.avncsOrFltOps.map((mode) => mode === 'nss-avncs');

  private readonly activePageRef = FSComponent.createRef<HTMLDivElement>();

  private activePage: VNode = (<OitNotFound uiService={this.uiService} />);

  private readonly showChartsSimvar = `L:A32NX_OIS_${getDisplayIndex()}_SHOW_CHARTS`;
  private readonly showOfpSimvar = `L:A32NX_OIS_${getDisplayIndex()}_SHOW_OFP`;

  private overlaySub: MappedSubscribable<void> | undefined;

  /** The OIS MENU / OIS XFR keys and the X-OIS function (see XOisFunction) */
  private readonly xOis = new XOisFunction();

  /** This OIT mirrors the other OIT ("X-OIS Activated") */
  private readonly xOisActive = Subject.create(false);

  private readonly hideXOisMessage = this.xOisActive.map((active) => !active);

  /** The page of the other OIT, for X-OIS */
  private readonly otherOitPage = ConsumerSubject.create(
    this.sub.on(this.props.captOrFo === 'CAPT' ? 'fltOpsPageFo' : 'fltOpsPageCapt'),
    0,
  );

  /** The page of this OIT, for the X-OIS of the other OIT */
  private readonly ownPageSimvar = `L:A380X_OIT_${this.props.captOrFo}_FLT_OPS_PAGE`;

  /**
   * A key of the keyboard: OIS MENU and OIS XFR act on the FLT OPS side only, with the laptop running and the crew
   * logged in
   * @param key the H event name without its A380X_LAPTOP_KEYBOARD_L(R)_ prefix, e.g. OIS_MENU
   */
  private onKeyboardKey(key: string): void {
    if (key !== 'OIS_MENU' && key !== 'OIS_XFR') {
      return;
    }
    if (
      this.props.avncsOrFltOps.get() !== 'flt-ops' ||
      !this.laptopHealthy.get() ||
      this.uiService.fltOpsLoginScreenVisible.get()
    ) {
      return;
    }

    const uri =
      key === 'OIS_MENU'
        ? this.xOis.onOisMenuKey()
        : this.xOis.onOisXfrKey(this.uiService.activeUri.get().uri, this.otherOitPage.get());
    this.xOisActive.set(this.xOis.isActive());
    if (uri !== null) {
      this.uiService.navigateTo(uri);
    }
    this.publishOwnPage();
  }

  private publishOwnPage(): void {
    SimVar.SetSimVarValue(
      this.ownPageSimvar,
      SimVarValueType.Number,
      fltOpsPageCode(this.xOis.publishedUri(this.uiService.activeUri.get().uri)),
    );
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.overlaySub = MappedSubject.create(
      ([uri, displayFailed, displayPowered, laptopHealthy, operationMode]) => {
        // Activate EFB overlay if on charts or flt-folder page
        SimVar.SetSimVarValue(
          this.showChartsSimvar,
          SimVarValueType.Bool,
          uri.uri === 'flt-ops/charts' &&
            operationMode === 'flt-ops' &&
            !displayFailed &&
            displayPowered &&
            laptopHealthy,
        );
        SimVar.SetSimVarValue(
          this.showOfpSimvar,
          SimVarValueType.Bool,
          uri.uri === 'flt-ops/flt-folder' &&
            operationMode === 'flt-ops' &&
            !displayFailed &&
            displayPowered &&
            laptopHealthy,
        );
      },
      this.uiService.activeUri,
      this.props.displayUnitRef.instance.failed,
      this.props.displayUnitRef.instance.powered,
      this.laptopHealthy,
      this.props.avncsOrFltOps,
    );

    this.subscriptions.push(
      this.uiService.activeUri.sub((uri) => {
        this.activeUriChanged(uri);
        this.publishOwnPage();
      }),
      this.laptopHealthy.sub((healthy) => {
        if (!healthy) {
          this.xOis.reset();
          this.xOisActive.set(false);
          this.uiService.resetFltOpsSession();
        }
      }, true),
      this.hEventConsumer.handle(([, key]) => this.onKeyboardKey(key)),
      this.otherOitPage.sub((code) => {
        const uri = this.xOis.onOtherOitPage(code);
        if (uri !== null) {
          this.uiService.navigateTo(uri);
        }
      }),
      this.overlaySub,
      this.laptopHealthy,
      this.hideContent,
      this.hideContainer,
      this.otherOitPage,
      this.hideXOisMessage,
    );

    // EXIT SESSION: the STS page starts empty for the next flight
    this.uiService.onFltOpsSessionExit(() => this.laptopData.reset());

    this.uiService.navigateTo('flt-ops');
  }

  private activeUriChanged(uri: OitUriInformation) {
    // Remove and destroy old OIT page
    if (this.activePageRef.getOrDefault()) {
      while (this.activePageRef.instance.firstChild) {
        this.activePageRef.instance.removeChild(this.activePageRef.instance.firstChild);
      }
    }
    if (this.activePage && this.activePage.instance instanceof DisplayComponent) {
      this.activePage.instance.destroy();
    }

    // Mapping from URL to page component
    if (uri.page) {
      this.activePage = fltOpsPageForUrl(`${uri.sys}/${uri.page}`, this.props.bus, this.uiService, this);
    } else {
      this.activePage = fltOpsPageForUrl(`${uri.sys}`, this.props.bus, this.uiService, this);
    }

    FSComponent.render(this.activePage, this.activePageRef?.getOrDefault());

    // A page that exists opens its application on the switching bar
    if (!(this.activePage.instance instanceof OitNotFound)) {
      this.uiService.fltOpsApplications.show(uri.uri);
    }
  }

  public destroy(): void {
    // Destroy all subscriptions to remove all references to this instance.
    for (const s of this.subscriptions) {
      s.destroy();
    }

    super.destroy();
  }

  render(): VNode {
    return (
      <>
        <div ref={this.topRef} class={{ 'oit-main': true, hidden: this.hideContainer }}>
          <div class={{ 'oit-page-container': true, hidden: this.hideContent }}>
            <OitFltOpsHeader uiService={this.uiService} messageToolbar={this.props.laptop.messageToolbar} />
            <div ref={this.activePageRef} class="mfd-navigator-container" />
            {/* HIDE SWITCHING BAR: full screen */}
            <div class={{ hidden: this.uiService.fullScreen }}>
              <OitFltOpsFooter uiService={this.uiService} avncsOrFltOps={this.props.avncsOrFltOps} />
            </div>
            <div class={{ 'oit-x-ois-message': true, hidden: this.hideXOisMessage }}>X-OIS Activated</div>
          </div>
          <OitFltOpsLogin
            bus={this.props.bus}
            uiService={this.uiService}
            captOrFo={this.props.captOrFo}
            standalone={this.props.laptop.standalone}
          />
          <OitFltOpsLoadingScreen bus={this.props.bus} captOrFo={this.props.captOrFo} />
        </div>
      </>
    );
  }
}
