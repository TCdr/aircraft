// @ts-strict-ignore
// Copyright (c) 2021-2023, 2025-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXDataStore, UpdateThrottler } from '@flybywiresim/fbw-sdk';
import { FMCMainDisplay } from './A32NX_FMCMainDisplay';
import { recallMessageById } from '@fmgc/components';
import { Keypad } from './A320_Neo_CDU_Keypad';
import { NXNotifManager } from '@shared/NxNotif';
import { McduMessage, NXFictionalMessages, NXSystemMessages, TypeIIMessage } from '../messages/NXSystemMessages';
import { McduServerClient } from '@simbridge/index';
import { ScratchpadDataLink, ScratchpadDisplay } from './A320_Neo_CDU_Scratchpad';
import { A32NX_MessageQueue } from './A32NX_MessageQueue';
import { CDUMenuPage } from '../legacy_pages/A320_Neo_CDU_MenuPage';
import { CDUFuelPredPage } from '../legacy_pages/A320_Neo_CDU_FuelPredPage';
import { FmgcFlightPhase } from '@shared/flightphase';
import { CDU_Field } from './A320_Neo_CDU_Field';
import { AtsuStatusCodes } from '@datalink/common';
import { DebounceTimer, EventBus, GameStateProvider, HEvent } from '@microsoft/msfs-sdk';
import { LegacyFmsPageInterface, LskCallback, LskDelayFunction } from './LegacyFmsPageInterface';
import { LegacyAtsuPageInterface } from './LegacyAtsuPageInterface';
import { EngineOutTargetPage } from '@fmgc/events/EngineOutEvents';
import { CDUFlightPlanPage } from '../legacy_pages/A320_Neo_CDU_FlightPlanPage';
import { CDUPerformancePage } from '../legacy_pages/A320_Neo_CDU_PerformancePage';

export class A320_Neo_CDU_MainDisplay
  extends FMCMainDisplay
  implements LegacyFmsPageInterface, LegacyAtsuPageInterface
{
  private static readonly MIN_BRIGHTNESS = 0.5;
  private static readonly MAX_BRIGHTNESS = 8;

  private static readonly H_EVENT_PREFIX = 'A320_Neo_CDU_';

  private readonly minPageUpdateThrottler = new UpdateThrottler(100);
  private readonly mcduServerConnectUpdateThrottler = new UpdateThrottler(1000);
  private readonly powerCheckUpdateThrottler = new UpdateThrottler(500);

  private readonly mcduServerUpdateDebounceTimer = new DebounceTimer();

  public readonly fmgcMesssagesListener = RegisterViewListener('JS_LISTENER_SIMVARS', null, true);

  private readonly _keypad = new Keypad(this);

  private _title = undefined;
  private _titleLeft = '';
  private _pageCurrent = undefined;
  private _pageCount = undefined;
  private _labels = [];
  private _lines = [];
  private scratchpadDisplay = null;
  private _scratchpad = null;
  private scratchpads?: Record<'MCDU' | 'FMGC' | 'ATSU' | 'AIDS' | 'CFDS', ScratchpadDataLink>;
  private _arrows = [false, false, false, false];

  private annunciators = {
    left: {
      // note these must match the base names in the model xml
      fmgc: false,
      fail: false,
      mcdu_menu: false,
      fm1: false,
      ind: false,
      rdy: false,
      blank: false,
      fm2: false,
    },
    right: {
      fmgc: false,
      fail: false,
      mcdu_menu: false,
      fm1: false,
      ind: false,
      rdy: false,
      blank: false,
      fm2: false,
    },
  };

  /** MCDU request flags from subsystems */
  private requests = {
    AIDS: false,
    ATSU: false,
    CFDS: false,
    FMGC: false,
  };
  private _lastAtsuMessageCount = 0;
  private leftBrightness = 0;
  private rightBrightness = 0;
  public onLeftInput: LskCallback[] = [];
  public onRightInput: LskCallback[] = [];
  public leftInputDelay: LskDelayFunction[] = [];
  public rightInputDelay: LskDelayFunction[] = [];
  private _activeSystem: 'FMGC' | 'ATSU' | 'AIDS' | 'CFDS' = 'FMGC';
  private inFocus = false;
  private lastInput = new Date(0);
  private clrStop = false;
  private allSelected = false;
  private updateRequest = false;
  private initB = false;
  private lastPowerState = null;
  public readonly PageTimeout = {
    Fast: 500,
    Medium: 1000,
    Dyn: 1500,
    Default: 2000,
    Slow: 3000,
  };
  public returnPageCallback: typeof EmptyCallback.Void | null = null;

  public SelfPtr: ReturnType<typeof setTimeout> | false = false;

  public page = {
    Current: 0,
    Clear: 0,
    AirportsMonitor: 1,
    AirwaysFromWaypointPage: 2,
    // AirwaysFromWaypointPageGetAllRows: 3,
    AvailableArrivalsPage: 4,
    AvailableArrivalsPageVias: 5,
    AvailableDeparturesPage: 6,
    AvailableFlightPlanPage: 7,
    DataIndexPage1: 8,
    DataIndexPage2: 9,
    DirectToPage: 10,
    FlightPlanPage: 11,
    FuelPredPage: 12,
    GPSMonitor: 13,
    HoldAtPage: 14,
    IdentPage: 15,
    InitPageA: 16,
    InitPageB: 17,
    IRSInit: 18,
    IRSMonitor: 19,
    IRSStatus: 20,
    LateralRevisionPage: 22,
    MenuPage: 23,
    NavaidPage: 24,
    NavRadioPage: 25,
    NewWaypoint: 26,
    PerformancePageTakeoff: 27,
    PerformancePageClb: 28,
    PerformancePageCrz: 29,
    PerformancePageDes: 30,
    PerformancePageAppr: 31,
    PerformancePageGoAround: 32,
    PilotsWaypoint: 33,
    PosFrozen: 34,
    PositionMonitorPage: 35,
    ProgressPage: 36,
    ProgressPageReport: 37,
    ProgressPagePredictiveGPS: 38,
    SelectedNavaids: 39,
    SelectWptPage: 40,
    VerticalRevisionPage: 41,
    WaypointPage: 42,
    AOCInit: 43,
    AOCInit2: 44,
    AOCOfpData: 45,
    AOCOfpData2: 46,
    AOCMenu: 47,
    AOCRequestWeather: 48,
    AOCRequestAtis: 49,
    AOCDepartRequest: 50,
    ATCMenu: 51,
    ATCModify: 52,
    ATCAtis: 53,
    ATCMessageRecord: 54,
    ATCMessageMonitoring: 55,
    ATCConnection: 56,
    ATCNotification: 57,
    ATCConnectionStatus: 58,
    ATCPositionReport1: 59,
    ATCPositionReport2: 60,
    ATCPositionReport3: 61,
    ATCFlightRequest: 62,
    ATCUsualRequest: 63,
    ATCGroundRequest: 64,
    ATCReports: 65,
    ATCEmergency: 66,
    ATCComLastId: 67, // This is needed for automatic page changes triggered by DCDU
    ATSUMenu: 68,
    ATSUDatalinkStatus: 69,
    ClimbWind: 70,
    CruiseWind: 71,
    DescentWind: 72,
    FixInfoPage: 73,
    AOCRcvdMsgs: 74,
    AOCSentMsgs: 75,
    AOCFreeText: 76,
    StepAltsPage: 77,
    ATCDepartReq: 78,
    ATCCommMenu: 79,
    ATCText: 80,
    ATCProcedureRequest: 81,
    ATCVertRequest: 82,
    ATCLatRequest: 83,
    ATCMessageModifyUM131: 84,
    ATCContactRequest: 85,
    RTAPage: 86,
  };

  private mcduServerClient?: McduServerClient;

  private readonly emptyLines = {
    lines: [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
    scratchpad: '',
    title: '',
    titleLeft: '',
    page: '',
    arrows: [false, false, false, false],
    annunciators: {
      fmgc: false,
      fail: false,
      mcdu_menu: false,
      fm1: false,
      ind: false,
      rdy: false,
      blank: false,
      fm2: false,
    },
    displayBrightness: 0,
    integralBrightness: 0,
  };

  private _titleElement?: HTMLElement;
  private _pageCurrentElement?: HTMLElement;
  private _pageCountElement?: HTMLElement;
  private _labelElements?: any[];
  private _lineElements?: any[];

  public pageRedrawCallback?: () => void;
  public pageUpdate?: () => void;

  private arrowHorizontal?: HTMLSpanElement;
  private arrowVertical?: HTMLSpanElement;

  private check_focus?: ReturnType<typeof setInterval>;
  private check_clr?: ReturnType<typeof setTimeout>;

  private printing = false;

  /** The element this screen is drawn into, undefined on the CPT screen which uses the document. */
  private _container?: HTMLElement;

  /** The following events remain due to shared use by the keypad and keyboard type entry */
  public onLetterInput = (l: string) => this.scratchpad.addChar(l);
  public onSp = () => this.scratchpad.addChar(' ');
  public onDiv = () => this.scratchpad.addChar('/');
  public onDot = () => this.scratchpad.addChar('.');
  public onClr = () => this.scratchpad.clear();
  public onClrHeld = () => this.scratchpad.clearHeld();
  public onPlusMinus = (defaultKey = '-') => this.scratchpad.plusMinus(defaultKey);
  public onLeftFunction = (f) => this.onLsk(this.onLeftInput[f], this.leftInputDelay[f]);
  public onRightFunction = (f) => this.onLsk(this.onRightInput[f], this.rightInputDelay[f]);
  public onOvfy = () => this.scratchpad.addChar('Δ');
  public onUnload = () => {};

  public onPrevPage = () => {};
  public onNextPage = () => {};
  public onUp = () => {};
  public onDown = () => {};

  constructor(bus: EventBus) {
    super(bus);
    this.setupFmgcTriggers();
  }

  // TODO this really belongs in the FMCMainDisplay, not the CDU
  private setupFmgcTriggers() {
    Coherent.on('A32NX_FMGC_SEND_MESSAGE_TO_MCDU', (message) => {
      this.addMessageToQueue(
        new TypeIIMessage(message.text, message.color === 'Amber'),
        () => false,
        () => {
          if (message.clearable) {
            recallMessageById(message.id);
          }
        },
      );
    });

    Coherent.on('A32NX_FMGC_RECALL_MESSAGE_FROM_MCDU_WITH_ID', (text) => {
      this.removeMessageFromQueue(text);
    });
  }

  /**
   * The fields that belong to one MCDU screen (the display, the page being shown, the scratchpad, the message queue, the key
   * handlers), as opposed to the FMS which is shared by both MCDUs. The F/O screen (see createSecondaryScreen) keeps its own
   * copy of these, everything else is forwarded to the one real instance.
   * Anything that holds state of what is shown on a screen has to be listed here, or the two screens will share it.
   */
  private static readonly PER_SCREEN_KEYS: ReadonlySet<PropertyKey> = new Set<PropertyKey>([
    // display
    '_container',
    '_title',
    '_titleLeft',
    '_pageCurrent',
    '_pageCount',
    '_labels',
    '_lines',
    '_arrows',
    '_titleElement',
    '_pageCurrentElement',
    '_pageCountElement',
    '_labelElements',
    '_lineElements',
    'arrowHorizontal',
    'arrowVertical',
    // page being shown
    'page',
    'onLeftInput',
    'onRightInput',
    'leftInputDelay',
    'rightInputDelay',
    'returnPageCallback',
    'SelfPtr',
    'pageRedrawCallback',
    'pageUpdate',
    'updateRequest',
    'onPrevPage',
    'onNextPage',
    'onUp',
    'onDown',
    'onUnload',
    'onAirport',
    // scratchpad, messages and keys
    '_keypad',
    'scratchpadDisplay',
    '_scratchpad',
    'scratchpads',
    '_activeSystem',
    'requests',
    '_messageQueue',
    'mcdu',
    'onLetterInput',
    'onSp',
    'onDiv',
    'onDot',
    'onClr',
    'onClrHeld',
    'onPlusMinus',
    'onOvfy',
    'onLeftFunction',
    'onRightFunction',
    // keyboard entry (only the CPT screen has it)
    'inFocus',
    'lastInput',
    'clrStop',
    'allSelected',
    'check_focus',
    'check_clr',
  ]);

  /**
   * Creates the display of the F/O MCDU. Both MCDUs are the same FMS with a screen each, so this returns a proxy over this
   * instance: what is listed in PER_SCREEN_KEYS is the F/O screen's own, everything else is this FMS. Functions run with the
   * proxy as `this`, so an entry made on the F/O MCDU puts its messages and pages on the F/O screen.
   * @param container the element the F/O screen is drawn into.
   */
  public createSecondaryScreen(container: HTMLElement): A320_Neo_CDU_MainDisplay {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const fms = this;
    const keys = A320_Neo_CDU_MainDisplay.PER_SCREEN_KEYS;
    const state: Record<PropertyKey, any> = {};

    const screen: A320_Neo_CDU_MainDisplay = new Proxy(fms, {
      get: (target, key, receiver) => (keys.has(key) ? state[key as any] : Reflect.get(target, key, receiver)),
      set: (target, key, value, receiver) => {
        if (keys.has(key)) {
          state[key as any] = value;
          return true;
        }
        return Reflect.set(target, key, value, receiver);
      },
      has: (target, key) => keys.has(key) || Reflect.has(target, key),
    });

    state._container = container;
    state.mcdu = screen;
    state._messageQueue = new A32NX_MessageQueue(screen);
    state.page = { ...fms.page, Current: fms.page.Clear };
    state._keypad = new Keypad(screen);
    state._title = undefined;
    state._titleLeft = '';
    state._pageCurrent = undefined;
    state._pageCount = undefined;
    state._labels = [];
    state._lines = [];
    state._arrows = [false, false, false, false];
    state.scratchpadDisplay = null;
    state._scratchpad = null;
    state.scratchpads = undefined;
    state._activeSystem = 'FMGC';
    state.requests = { AIDS: false, ATSU: false, CFDS: false, FMGC: false };
    state.onLeftInput = [];
    state.onRightInput = [];
    state.leftInputDelay = [];
    state.rightInputDelay = [];
    state.returnPageCallback = null;
    state.SelfPtr = false;
    state.pageRedrawCallback = undefined;
    state.pageUpdate = undefined;
    state.updateRequest = false;
    state.inFocus = false;
    state.lastInput = new Date(0);
    state.clrStop = false;
    state.allSelected = false;
    state.onPrevPage = () => {};
    state.onNextPage = () => {};
    state.onUp = () => {};
    state.onDown = () => {};
    state.onUnload = () => {};
    state.onAirport = () => CDUFlightPlanPage.ShowPage(screen);
    state.onLetterInput = (l: string) => screen.scratchpad.addChar(l);
    state.onSp = () => screen.scratchpad.addChar(' ');
    state.onDiv = () => screen.scratchpad.addChar('/');
    state.onDot = () => screen.scratchpad.addChar('.');
    state.onClr = () => screen.scratchpad.clear();
    state.onClrHeld = () => screen.scratchpad.clearHeld();
    state.onPlusMinus = (defaultKey = '-') => screen.scratchpad.plusMinus(defaultKey);
    state.onOvfy = () => screen.scratchpad.addChar('\u0394');
    state.onLeftFunction = (f) => screen.onLsk(screen.onLeftInput[f], screen.leftInputDelay[f]);
    state.onRightFunction = (f) => screen.onLsk(screen.onRightInput[f], screen.rightInputDelay[f]);

    fms.screens.push(screen);
    screen.initSecondaryScreen();
    return screen;
  }

  /** Builds the display of a secondary screen and shows the MCDU MENU on it, the counterpart of Init() for the CPT screen. */
  private initSecondaryScreen() {
    this.generateHTMLLayout(this._container);

    this.scratchpadDisplay = new ScratchpadDisplay(this, this.getChildById('in-out'));
    this.scratchpads = {
      MCDU: new ScratchpadDataLink(this, this.scratchpadDisplay, 'MCDU', false),
      FMGC: new ScratchpadDataLink(this, this.scratchpadDisplay, 'FMGC'),
      ATSU: new ScratchpadDataLink(this, this.scratchpadDisplay, 'ATSU'),
      AIDS: new ScratchpadDataLink(this, this.scratchpadDisplay, 'AIDS'),
      CFDS: new ScratchpadDataLink(this, this.scratchpadDisplay, 'CFDS'),
    };
    this.activateMcduScratchpad();

    this._titleElement = this.getChildById('title');
    this._pageCurrentElement = this.getChildById('page-current');
    this._pageCountElement = this.getChildById('page-count');
    this._labelElements = [];
    this._lineElements = [];
    for (let i = 0; i < 6; i++) {
      this._labelElements[i] = [
        this.getChildById('label-' + i + '-left'),
        this.getChildById('label-' + i + '-right'),
        this.getChildById('label-' + i + '-center'),
      ];
      this._lineElements[i] = [
        this.getChildById('line-' + i + '-left'),
        this.getChildById('line-' + i + '-right'),
        this.getChildById('line-' + i + '-center'),
      ];
    }

    CDUMenuPage.ShowPage(this);
  }

  public get templateID() {
    return 'A320_Neo_CDU';
  }

  public get isInteractive() {
    return true;
  }

  public connectedCallback() {
    RegisterViewListener('JS_LISTENER_KEYEVENT', () => {
      console.log('JS_LISTENER_KEYEVENT registered.');
      RegisterViewListener('JS_LISTENER_FACILITY', () => {
        console.log('JS_LISTENER_FACILITY registered.');
      });
    });

    this.bus
      .getSubscriber<HEvent>()
      .on('hEvent')
      .handle((ev) => {
        if (ev.startsWith(A320_Neo_CDU_MainDisplay.H_EVENT_PREFIX)) {
          this.onEvent(ev.slice(A320_Neo_CDU_MainDisplay.H_EVENT_PREFIX.length));
        }
      });

    this.Init();
  }

  // The callback is called when an event is received from the McduServerClient's socket.
  // See https://developer.mozilla.org/en-US/docs/Web/API/WebSocket#events for possible events.
  // This will be used as a parameter when the McduServerClient's connect method is called.
  // this.mcduServerClient.connect(this, this.mcduServerClientEventHandler);
  private mcduServerClientEventHandler(event) {
    switch (event.type) {
      case 'open': {
        console.log(`[MCDU] Websocket connection to SimBridge opened. (${McduServerClient.url()})`);
        new NXNotifManager().showNotification({
          title: 'MCDU CONNECTED',
          message: 'A32NX MCDU successfully connected to SimBridge MCDU Server.',
          timeout: 5000,
        });
        this.sendToMcduServerClient('mcduConnected');
        this.requestServerUpdate();
        break;
      }
      case 'close': {
        console.log(`[MCDU] Websocket connection to SimBridge closed. (${McduServerClient.url()})`);
        break;
      }
      case 'error': {
        console.log(`[MCDU] Websocket connection to SimBridge error. (${McduServerClient.url()}): ${event.get()}`);
        break;
      }
      case 'message': {
        const [messageType, ...args] = event.data.split(':');
        if (messageType === 'event') {
          // backwards compatible with the old MCDU server...
          // accepts either event:button_name (old), or event:side:button_name (current)
          const mcduIndex = args.length > 1 && args[0] === 'right' ? 2 : 1;
          const button = args.length > 1 ? args[1] : args[0];
          SimVar.SetSimVarValue(`H:A320_Neo_CDU_${mcduIndex}_BTN_${button}`, 'number', 0);
          SimVar.SetSimVarValue(`L:A32NX_MCDU_PUSH_ANIM_${mcduIndex}_${button}`, 'Number', 1);
        }
        if (messageType === 'requestUpdate') {
          this.requestServerUpdate();
        }
        break;
      }
    }
  }

  private getChildById(elementId: string): HTMLElement | null {
    return this._container
      ? this._container.querySelector<HTMLElement>('#' + elementId)
      : document.getElementById(elementId);
  }

  protected Init() {
    super.Init();

    this.generateHTMLLayout(this.getChildById('Mainframe') || this);

    this.scratchpadDisplay = new ScratchpadDisplay(this, this.getChildById('in-out'));
    this.scratchpads = {
      MCDU: new ScratchpadDataLink(this, this.scratchpadDisplay, 'MCDU', false),
      FMGC: new ScratchpadDataLink(this, this.scratchpadDisplay, 'FMGC'),
      ATSU: new ScratchpadDataLink(this, this.scratchpadDisplay, 'ATSU'),
      AIDS: new ScratchpadDataLink(this, this.scratchpadDisplay, 'AIDS'),
      CFDS: new ScratchpadDataLink(this, this.scratchpadDisplay, 'CFDS'),
    };
    this.activateMcduScratchpad();

    try {
      // note: without this, resetting mcdu kills camera
      if (this.scratchpadDisplay && this.scratchpadDisplay.guid) {
        Coherent.trigger('UNFOCUS_INPUT_FIELD', this.scratchpadDisplay.guid);
      }
    } catch (e) {
      console.error(e);
    }

    this.initKeyboardScratchpad();
    this._titleElement = this.getChildById('title');
    this._pageCurrentElement = this.getChildById('page-current');
    this._pageCountElement = this.getChildById('page-count');
    this._labelElements = [];
    this._lineElements = [];
    for (let i = 0; i < 6; i++) {
      this._labelElements[i] = [
        this.getChildById('label-' + i + '-left'),
        this.getChildById('label-' + i + '-right'),
        this.getChildById('label-' + i + '-center'),
      ];
      this._lineElements[i] = [
        this.getChildById('line-' + i + '-left'),
        this.getChildById('line-' + i + '-right'),
        this.getChildById('line-' + i + '-center'),
      ];
    }

    CDUMenuPage.ShowPage(this);

    SimVar.SetSimVarValue('L:A32NX_GPS_PRIMARY_LOST_MSG', 'Bool', 0).then();

    NXDataStore.subscribeLegacy('*', () => {
      this.forEachScreen((screen) => screen.requestUpdate());
    });

    this.mcduServerClient = new McduServerClient();

    // sync annunciator simvar state
    this.updateAnnunciators(true);

    this.sub.on('fms_engine_out_page_request').handle((target) => {
      this.forEachScreen((screen) => {
        if (screen.activeSystem === 'FMGC') {
          switch (target) {
            case EngineOutTargetPage.FlightPlan:
              CDUFlightPlanPage.ShowPage(screen);
              break;
            case EngineOutTargetPage.Perf:
              CDUPerformancePage.ShowPage(screen);
              break;
          }
        }
      });
    });
  }

  public requestUpdate() {
    this.updateRequest = true;
  }

  public onUpdate(_deltaTime: number) {
    super.onUpdate(_deltaTime);

    // every 100ms
    if (this.minPageUpdateThrottler.canUpdate(_deltaTime) !== -1) {
      this.forEachScreen((screen) => {
        if (screen.updateRequest) {
          screen.updateRequest = false;
          if (screen.pageRedrawCallback) {
            screen.pageRedrawCallback();
          }
        }
      });
    }

    // Create a connection to the SimBridge MCDU Server if it is not already connected
    // every 1000ms
    if (
      this.mcduServerConnectUpdateThrottler.canUpdate(_deltaTime) !== -1 &&
      GameStateProvider.get().get() === GameState.ingame &&
      this.mcduServerClient
    ) {
      if (this.mcduServerClient.isConnected()) {
        // Check if connection or SimBridge Setting is still valid.
        // validateConnection() will return false if the connection is not established
        // any longer (probably not the case here as we test isConnected) or if the
        // SimBridge Enabled setting (persistent property CONFIG_SIMBRIDGE_ENABLED) is set
        // to off - this is the case where this clears the remote MCDU screen and
        // disconnects the client.
        if (!this.mcduServerClient.validateConnection()) {
          this.sendClearScreen();
          this.mcduServerClient.disconnect();
        }
      } else {
        // not connected - try to connect
        this.mcduServerClient.connect(this.mcduServerClientEventHandler.bind(this));
      }
    }

    // There is no (known) event when power is turned on or off (e.g. Ext Pwr) and remote clients
    // would not be updated (cleared or updated). Therefore, monitoring power is necessary.
    // every 500ms
    if (this.powerCheckUpdateThrottler.canUpdate(_deltaTime) !== -1) {
      const isPoweredL = SimVar.GetSimVarValue('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED', 'Number');
      if (this.lastPowerState !== isPoweredL) {
        this.lastPowerState = isPoweredL;
        this.onFmPowerStateChanged(isPoweredL);

        if (this.mcduServerClient && this.mcduServerClient.isConnected()) {
          this.requestServerUpdate();
        }
      }
    }

    // TODO these other mechanisms are replaced in the MCDU split PR
    this.forEachScreen((screen) => {
      if (screen.pageUpdate) {
        screen.pageUpdate();
      }
    });
    this.checkAocTimes();
    this.updateMCDU();
  }

  /* MCDU UPDATE */

  /**
   * Updates the MCDU state.
   */
  private updateMCDU() {
    this.updateAnnunciators();

    this.updateBrightness();

    this.updateInitBFuelPred();

    this.updateAtsuRequest();
  }

  /**
   * Checks whether INIT page B is open and an engine is being started, if so:
   * The INIT page B reverts to the FUEL PRED page 15 seconds after the first engine start and cannot be accessed after engine start.
   */
  private updateInitBFuelPred() {
    if (this.isAnEngineOn()) {
      if (!this.initB) {
        this.initB = true;
        setTimeout(() => {
          this.forEachScreen((screen) => {
            if (screen.page.Current === screen.page.InitPageB && this.isAnEngineOn()) {
              CDUFuelPredPage.ShowPage(screen);
            }
          });
        }, 15000);
      }
    } else {
      this.initB = false;
    }
  }

  private updateAnnunciators(forceWrite = false) {
    const lightTestPowered = SimVar.GetSimVarValue('L:A32NX_ELEC_DC_2_BUS_IS_POWERED', 'bool');
    const lightTest = lightTestPowered && SimVar.GetSimVarValue('L:A32NX_OVHD_INTLT_ANN', 'number') === 0;

    // lights are AC1, MCDU is ACC ESS SHED
    const leftAnnuncPower =
      SimVar.GetSimVarValue('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'bool') &&
      SimVar.GetSimVarValue('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED', 'bool');
    this.updateAnnunciatorsForSide('left', lightTest, leftAnnuncPower, forceWrite);

    // lights and MCDU are both AC2
    const rightAnnuncPower = SimVar.GetSimVarValue('L:A32NX_ELEC_AC_2_BUS_IS_POWERED', 'bool');
    // the right annunciators follow the requests on the F/O screen, when there is one
    this.updateAnnunciatorsForSide('right', lightTest, rightAnnuncPower, forceWrite, this.screens[1] ?? this);
  }

  private updateBrightness() {
    const left = SimVar.GetSimVarValue('L:A32NX_MCDU_L_BRIGHTNESS', 'number');
    const right = SimVar.GetSimVarValue('L:A32NX_MCDU_R_BRIGHTNESS', 'number');

    let updateNeeded = false;

    if (left !== this.leftBrightness) {
      this.leftBrightness = left;
      updateNeeded = true;
    }

    if (right !== this.rightBrightness) {
      this.rightBrightness = right;
      updateNeeded = true;
    }

    if (updateNeeded) {
      this.requestServerUpdate();
    }
  }

  private updateAtsuRequest() {
    // the ATSU currently doesn't have the MCDU request signal, so we just check for messages and set it's flag
    const msgs = SimVar.GetSimVarValue('L:A32NX_COMPANY_MSG_COUNT', 'number');
    if (msgs > this._lastAtsuMessageCount) {
      this.forEachScreen((screen) => screen.setRequest('ATSU'));
    }
    this._lastAtsuMessageCount = msgs;
  }

  /**
   * Updates the annunciator light states for one MCDU.
   * @param side Which MCDU to update.
   * @param lightTest Whether ANN LT TEST is active.
   * @param powerOn Whether annunciator LED power is available.
   */
  private updateAnnunciatorsForSide(
    side: 'left' | 'right',
    lightTest: boolean,
    powerOn: boolean,
    forceWrite = false,
    screen: A320_Neo_CDU_MainDisplay = this,
  ) {
    let updateNeeded = false;

    const simVarSide = side.toUpperCase().charAt(0);

    const states = this.annunciators[side];
    for (const [annunc, state] of Object.entries(states)) {
      let newState = !!(lightTest && powerOn);

      if (annunc === 'fmgc') {
        newState = newState || screen.isSubsystemRequesting('FMGC');
      } else if (annunc === 'mcdu_menu') {
        newState =
          newState ||
          screen.isSubsystemRequesting('AIDS') ||
          screen.isSubsystemRequesting('ATSU') ||
          screen.isSubsystemRequesting('CFDS');
      }

      if (newState !== state || forceWrite) {
        states[annunc] = newState;
        SimVar.SetSimVarValue(`L:A32NX_MCDU_${simVarSide}_ANNUNC_${annunc.toUpperCase()}`, 'bool', newState);
        updateNeeded = true;
      }
    }

    if (updateNeeded) {
      this.requestServerUpdate();
    }
  }

  // FIXME move ATSU code to ATSU
  private checkAocTimes() {
    if (!this.aocTimes.off) {
      if (this.flightPhaseManager.phase === FmgcFlightPhase.Takeoff && !this.isOnGround()) {
        // Wheels off
        // Off: remains blank until Take off time
        this.aocTimes.off = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
      }
    }

    if (!this.aocTimes.out) {
      const currentPKGBrakeState = SimVar.GetSimVarValue('L:A32NX_PARK_BRAKE_LEVER_POS', 'Bool');
      if (this.flightPhaseManager.phase === FmgcFlightPhase.Preflight && !currentPKGBrakeState) {
        // Out: is when you set the brakes to off
        this.aocTimes.out = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
      }
    }

    if (!this.aocTimes.on) {
      if (this.aocTimes.off && this.isOnGround()) {
        // On: remains blank until Landing time
        this.aocTimes.on = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
      }
    }

    if (!this.aocTimes.in) {
      const currentPKGBrakeState = SimVar.GetSimVarValue('L:A32NX_PARK_BRAKE_LEVER_POS', 'Bool');
      const cabinDoorPctOpen = SimVar.GetSimVarValue('INTERACTIVE POINT OPEN:0', 'percent');
      if (this.aocTimes.on && currentPKGBrakeState && cabinDoorPctOpen > 20) {
        // In: remains blank until brakes set to park AND the first door opens
        this.aocTimes.in = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
      }
    }

    if (this.flightPhaseManager.phase === FmgcFlightPhase.Preflight) {
      const cabinDoorPctOpen = SimVar.GetSimVarValue('INTERACTIVE POINT OPEN:0', 'percent');
      if (!this.aocTimes.doors && cabinDoorPctOpen < 20) {
        this.aocTimes.doors = Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds'));
      } else {
        if (cabinDoorPctOpen > 20) {
          this.aocTimes.doors = 0;
        }
      }
    }
  }

  /* END OF MCDU UPDATE */
  /* MCDU INTERFACE/LAYOUT */

  private _formatCell(str) {
    return str
      .replace(/{big}/g, "<span class='b-text'>")
      .replace(/{small}/g, "<span class='s-text'>")
      .replace(/{big}/g, "<span class='b-text'>")
      .replace(/{amber}/g, "<span class='amber'>")
      .replace(/{red}/g, "<span class='red'>")
      .replace(/{green}/g, "<span class='green'>")
      .replace(/{cyan}/g, "<span class='cyan'>")
      .replace(/{white}/g, "<span class='white'>")
      .replace(/{magenta}/g, "<span class='magenta'>")
      .replace(/{yellow}/g, "<span class='yellow'>")
      .replace(/{inop}/g, "<span class='inop'>")
      .replace(/{sp}/g, '&nbsp;')
      .replace(/{end}/g, '</span>');
  }

  public setTitle(content: string) {
    let color = content.split('[color]')[1];
    if (!color) {
      color = 'white';
    }
    this._title = content.split('[color]')[0];
    this._title = `{${color}}${this._title}{end}`;
    this._titleElement.textContent = this._title;
    this.requestServerUpdate();
  }

  private setPageCurrent(value: string | number) {
    if (typeof value === 'number') {
      this._pageCurrent = value;
    } else if (typeof value === 'string') {
      this._pageCurrent = parseInt(value);
    }
    this._pageCurrentElement.textContent = (this._pageCurrent > 0 ? this._pageCurrent : '') + '';
    this.requestServerUpdate();
  }

  private setPageCount(value: string | number) {
    if (typeof value === 'number') {
      this._pageCount = value;
    } else if (typeof value === 'string') {
      this._pageCount = parseInt(value);
    }
    this._pageCountElement.textContent = (this._pageCount > 0 ? this._pageCount : '') + '';
    if (this._pageCount === 0) {
      this.getChildById('page-slash').textContent = '';
    } else {
      this.getChildById('page-slash').textContent = '/';
    }
    this.requestServerUpdate();
  }

  private setLabel(label: string, row: number, col = -1) {
    if (col >= this._labelElements[row].length) {
      return;
    }
    if (!this._labels[row]) {
      this._labels[row] = [];
    }
    if (!label) {
      label = '';
    }
    if (col === -1) {
      for (let i = 0; i < this._labelElements[row].length; i++) {
        this._labels[row][i] = '';
        this._labelElements[row][i].textContent = '';
      }
      col = 0;
    }
    if (label === '__FMCSEPARATOR') {
      label = '------------------------';
    }
    if (label !== '') {
      if (label.indexOf('[b-text]') !== -1) {
        label = label.replace('[b-text]', '');
        this._lineElements[row][col].classList.remove('s-text');
        this._lineElements[row][col].classList.add('msg-text');
      } else {
        this._lineElements[row][col].classList.remove('msg-text');
      }

      let color = label.split('[color]')[1];
      if (!color) {
        color = 'white';
      }
      label = label.split('[color]')[0];
      label = `{${color}}${label}{end}`;
    }
    this._labels[row][col] = label;
    this._labelElements[row][col].textContent = label;
    this.requestServerUpdate();
  }

  private setLine(content: string | CDU_Field, row: number, col = -1) {
    if (content instanceof CDU_Field) {
      const field = content;
      (col === 0 || col === -1 ? this.onLeftInput : this.onRightInput)[row] = (value) => {
        field.onSelect(value);
      };
      content = content.getValue();
    }

    if (col >= this._lineElements[row].length) {
      return;
    }
    if (!content) {
      content = '';
    }
    if (!this._lines[row]) {
      this._lines[row] = [];
    }
    if (col === -1) {
      for (let i = 0; i < this._lineElements[row].length; i++) {
        this._lines[row][i] = '';
        this._lineElements[row][i].textContent = '';
      }
      col = 0;
    }
    if (content === '__FMCSEPARATOR') {
      content = '------------------------';
    }
    if (content !== '') {
      let color = content.split('[color]')[1];
      if (!color) {
        color = 'white';
      }
      content = content.split('[color]')[0];
      content = `{${color}}${content}{end}`;
      if (content.indexOf('[s-text]') !== -1) {
        content = content.replace('[s-text]', '');
        content = `{small}${content}{end}`;
      }
    }
    this._lines[row][col] = content;
    this._lineElements[row][col].textContent = this._lines[row][col];
    this.requestServerUpdate();
  }

  public setTemplate(template: any[][], large = false) {
    if (template[0]) {
      this.setTitle(template[0][0]);
      this.setPageCurrent(template[0][1]);
      this.setPageCount(template[0][2]);
    }
    for (let i = 0; i < 6; i++) {
      let tIndex = 2 * i + 1;
      if (template[tIndex]) {
        if (large) {
          if (template[tIndex][1] !== undefined) {
            this.setLine(template[tIndex][0], i, 0);
            this.setLine(template[tIndex][1], i, 1);
            this.setLine(template[tIndex][2], i, 2);
            this.setLine(template[tIndex][3], i, 3);
          } else {
            this.setLine(template[tIndex][0], i, -1);
          }
        } else {
          if (template[tIndex][1] !== undefined) {
            this.setLabel(template[tIndex][0], i, 0);
            this.setLabel(template[tIndex][1], i, 1);
            this.setLabel(template[tIndex][2], i, 2);
            this.setLabel(template[tIndex][3], i, 3);
          } else {
            this.setLabel(template[tIndex][0], i, -1);
          }
        }
      }
      tIndex = 2 * i + 2;
      if (template[tIndex]) {
        if (template[tIndex][1] !== undefined) {
          this.setLine(template[tIndex][0], i, 0);
          this.setLine(template[tIndex][1], i, 1);
          this.setLine(template[tIndex][2], i, 2);
          this.setLine(template[tIndex][3], i, 3);
        } else {
          this.setLine(template[tIndex][0], i, -1);
        }
      }
    }
    if (template[13]) {
      this.setScratchpadText(template[13][0]);
    }

    // Apply formatting helper to title page, lines and labels
    if (this._titleElement !== null) {
      this._titleElement.innerHTML = this._formatCell(this._titleElement.innerHTML);
    }
    this._lineElements.forEach((row) => {
      row.forEach((column) => {
        if (column !== null) {
          column.innerHTML = this._formatCell(column.innerHTML);
        }
      });
    });
    this._labelElements.forEach((row) => {
      row.forEach((column) => {
        if (column !== null) {
          column.innerHTML = this._formatCell(column.innerHTML);
        }
      });
    });
  }

  /**
   * Sets what arrows will be displayed in the corner of the screen. Arrows are removed when clearDisplay() is called.
   * @param up whether the up arrow will be displayed
   * @param down whether the down arrow will be displayed
   * @param left whether the left arrow will be displayed
   * @param right whether the right arrow will be displayed
   */
  public setArrows(up: boolean, down: boolean, left: boolean, right: boolean) {
    this._arrows = [up, down, left, right];
    this.arrowHorizontal.style.opacity = left || right ? '1' : '0';
    this.arrowVertical.style.opacity = up || down ? '1' : '0';
    if (up && down) {
      this.arrowVertical.innerHTML = '↑↓\xa0';
    } else if (up) {
      this.arrowVertical.innerHTML = '↑\xa0\xa0';
    } else {
      this.arrowVertical.innerHTML = '↓\xa0';
    }
    if (left && right) {
      this.arrowHorizontal.innerHTML = '←→\xa0';
    } else if (right) {
      this.arrowHorizontal.innerHTML = '→\xa0';
    } else {
      this.arrowHorizontal.innerHTML = '←\xa0\xa0';
    }
    this.requestServerUpdate();
  }

  public clearDisplay() {
    this.onUnload();
    this.onUnload = () => {};
    this.setTitle('');
    this.setPageCurrent(0);
    this.setPageCount(0);
    for (let i = 0; i < 6; i++) {
      this.setLabel('', i, -1);
    }
    for (let i = 0; i < 6; i++) {
      this.setLine('', i, -1);
    }
    this.onLeftInput = [];
    this.onRightInput = [];
    this.leftInputDelay = [];
    this.rightInputDelay = [];
    this.onPrevPage = () => {};
    this.onNextPage = () => {};
    this.pageUpdate = () => {};
    this.pageRedrawCallback = null;
    if (this.page.Current === this.page.MenuPage) {
      this.setScratchpadText('');
    }
    this.page.Current = this.page.Clear;
    this.setArrows(false, false, false, false);
    this.tryDeleteTimeout();
    this.onUp = () => {};
    this.onDown = () => {};
    this.updateRequest = false;
  }

  /**
   * Set the active subsystem
   * @param {'AIDS' | 'ATSU' | 'CFDS' | 'FMGC'} subsystem
   */
  public set activeSystem(subsystem: 'AIDS' | 'ATSU' | 'CFDS' | 'FMGC') {
    this._activeSystem = subsystem;
    this.scratchpad = this.scratchpads[subsystem];
    this._clearRequest(subsystem);
  }

  public get activeSystem() {
    return this._activeSystem;
  }

  private set scratchpad(sp) {
    if (sp === this._scratchpad) {
      return;
    }

    // pause the old scratchpad so it stops writing to the display
    if (this._scratchpad) {
      this._scratchpad.pause();
    }

    // set the new scratchpad and resume it to update the display
    this._scratchpad = sp;
    this._scratchpad.resume();
  }

  private get scratchpad(): ScratchpadDataLink {
    return this._scratchpad;
  }

  public get mcduScratchpad() {
    return this.scratchpads['MCDU'];
  }

  public get fmgcScratchpad() {
    return this.scratchpads['FMGC'];
  }

  public get atsuScratchpad() {
    return this.scratchpads['ATSU'];
  }

  public get aidsScratchpad() {
    return this.scratchpads['AIDS'];
  }

  public get cfdsScratchpad() {
    return this.scratchpads['CFDS'];
  }

  public activateMcduScratchpad() {
    this.scratchpad = this.scratchpads['MCDU'];
  }

  /**
   * Check if there is an active request from a subsystem to the MCDU
   * @returns true if an active request exists
   */
  public isSubsystemRequesting(subsystem: 'AIDS' | 'ATSU' | 'CFDS' | 'FMGC') {
    return this.requests[subsystem] === true;
  }

  /**
   * Set a request from a subsystem to the MCDU
   */
  public setRequest(subsystem: 'AIDS' | 'ATSU' | 'CFDS' | 'FMGC') {
    if (!(subsystem in this.requests) || this.activeSystem === subsystem) {
      return;
    }
    if (!this.requests[subsystem]) {
      this.requests[subsystem] = true;

      // refresh the menu page if active
      if (this.page.Current === this.page.MenuPage) {
        CDUMenuPage.ShowPage(this);
      }
    }
  }

  /**
   * Clear a request from a subsystem to the MCDU
   */
  private _clearRequest(subsystem: 'AIDS' | 'ATSU' | 'CFDS' | 'FMGC') {
    if (!(subsystem in this.requests)) {
      return;
    }

    if (this.requests[subsystem]) {
      this.requests[subsystem] = false;

      // refresh the menu page if active
      if (this.page.Current === this.page.MenuPage) {
        CDUMenuPage.ShowPage(this);
      }
    }
  }

  private generateHTMLLayout(parent) {
    while (parent.children.length > 0) {
      parent.removeChild(parent.children[0]);
    }
    const header = document.createElement('div');
    header.id = 'header';

    const title = document.createElement('span');
    title.id = 'title';
    header.appendChild(title);

    this.arrowHorizontal = document.createElement('span');
    this.arrowHorizontal.id = 'arrow-horizontal';
    this.arrowHorizontal.innerHTML = '←→\xa0';
    header.appendChild(this.arrowHorizontal);

    parent.appendChild(header);

    const page = document.createElement('div');
    page.id = 'page-info';
    page.classList.add('s-text');

    const pageCurrent = document.createElement('span');
    pageCurrent.id = 'page-current';

    const pageSlash = document.createElement('span');
    pageSlash.id = 'page-slash';
    pageSlash.textContent = '/';

    const pageCount = document.createElement('span');
    pageCount.id = 'page-count';

    page.appendChild(pageCurrent);
    page.appendChild(pageSlash);
    page.appendChild(pageCount);
    parent.appendChild(page);

    for (let i = 0; i < 6; i++) {
      const label = document.createElement('div');
      label.classList.add('label', 's-text');
      const labelLeft = document.createElement('span');
      labelLeft.id = 'label-' + i + '-left';
      labelLeft.classList.add('fmc-block', 'label', 'label-left');
      const labelRight = document.createElement('span');
      labelRight.id = 'label-' + i + '-right';
      labelRight.classList.add('fmc-block', 'label', 'label-right');
      const labelCenter = document.createElement('span');
      labelCenter.id = 'label-' + i + '-center';
      labelCenter.classList.add('fmc-block', 'label', 'label-center');
      label.appendChild(labelLeft);
      label.appendChild(labelRight);
      label.appendChild(labelCenter);
      parent.appendChild(label);
      const line = document.createElement('div');
      line.classList.add('line');
      const lineLeft = document.createElement('span');
      lineLeft.id = 'line-' + i + '-left';
      lineLeft.classList.add('fmc-block', 'line', 'line-left');
      const lineRight = document.createElement('span');
      lineRight.id = 'line-' + i + '-right';
      lineRight.classList.add('fmc-block', 'line', 'line-right');
      const lineCenter = document.createElement('span');
      lineCenter.id = 'line-' + i + '-center';
      lineCenter.classList.add('fmc-block', 'line', 'line-center');
      line.appendChild(lineLeft);
      line.appendChild(lineRight);
      line.appendChild(lineCenter);
      parent.appendChild(line);
    }
    const footer = document.createElement('div');
    footer.classList.add('line');
    const inout = document.createElement('span');
    inout.id = 'in-out';
    this.arrowVertical = document.createElement('span');
    this.arrowVertical.id = 'arrow-vertical';
    this.arrowVertical.innerHTML = '↓↑\xa0';

    footer.appendChild(inout);
    footer.appendChild(this.arrowVertical);
    parent.appendChild(footer);
  }

  /* END OF MCDU INTERFACE/LAYOUT */
  /* MCDU SCRATCHPAD */

  public setScratchpadUserData(value: string) {
    this.scratchpad.setUserData(value);
  }

  private clearFocus() {
    this.inFocus = false;
    this.allSelected = false;
    try {
      Coherent.trigger('UNFOCUS_INPUT_FIELD', this.scratchpadDisplay.guid);
    } catch (e) {
      console.error(e);
    }
    this.scratchpadDisplay.setStyle(null);
    // This is legal but the TS DOM types mark it readonly.
    (this.getChildById('header').style as unknown as any) = null;
    if (this.check_focus) {
      clearInterval(this.check_focus);
    }
  }

  private initKeyboardScratchpad() {
    // The keyboard belongs to the screen that was clicked on, only one screen at a time has it
    window.document.addEventListener('click', (e) => {
      const target = e.target as Node;
      const clicked = this.screens.find((screen) => screen._container?.contains(target)) ?? this;
      for (const screen of this.screens) {
        if (screen !== clicked && screen.inFocus) {
          screen.clearFocus();
        }
      }
      clicked.onKeyboardClick();
    });
    window.document.addEventListener('keydown', (e) => {
      this.screens.find((screen) => screen.inFocus)?.onKeyboardKeyDown(e);
    });
    window.document.addEventListener('keyup', (e) => {
      for (const screen of this.screens) {
        screen.onKeyboardKeyUp(e);
      }
    });
  }

  /** Whether this MCDU is powered: the CPT one from the AC ESS SHED bus, the F/O one from AC 2. */
  private isPowered(): boolean {
    const powerVar =
      this.screens.indexOf(this) === 0 ? 'L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED' : 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED';
    return !!SimVar.GetSimVarValue(powerVar, 'Number');
  }

  /** Animates a key of the keypad of this MCDU, for a key that is typed on the keyboard. */
  private animateKey(key: string) {
    SimVar.SetSimVarValue(`L:A32NX_MCDU_PUSH_ANIM_${this.screens.indexOf(this) + 1}_${key}`, 'Number', 1);
  }

  /** A click on this screen turns the keyboard entry on or off, when it is enabled in the settings. */
  private onKeyboardClick() {
    const mcduInput = NXDataStore.getLegacy('MCDU_KB_INPUT', 'DISABLED');
    const mcduTimeout = parseInt(NXDataStore.getLegacy('CONFIG_MCDU_KB_TIMEOUT', '60'));

    if (mcduInput === 'ENABLED') {
      this.inFocus = !this.inFocus;
      if (this.inFocus && this.isPowered()) {
        // This is legal but the TS DOM types mark it readonly.
        (this.getChildById('header').style as unknown as any) =
          'background: linear-gradient(180deg, rgba(2,182,217,1.0) 65%, rgba(255,255,255,0.0) 65%);';
        this.scratchpadDisplay.setStyle('display: inline-block; width:87%; background: rgba(255,255,255,0.2);');
        try {
          Coherent.trigger('FOCUS_INPUT_FIELD', this.scratchpadDisplay.guid, '', '', '', false);
        } catch (e) {
          console.error(e);
        }
        this.lastInput = new Date();
        if (mcduTimeout) {
          this.check_focus = setInterval(
            () => {
              if (Math.abs(Date.now() - this.lastInput.getTime()) / 1000 >= mcduTimeout) {
                this.clearFocus();
              }
            },
            Math.min((mcduTimeout * 1000) / 2, 1000),
          );
        }
      } else {
        this.clearFocus();
      }
    } else {
      this.clearFocus();
    }
  }

  /** A key typed on the keyboard while this screen has the keyboard entry. */
  private onKeyboardKeyDown(e: KeyboardEvent) {
    // MCDU should not accept input while unpowered
    if (!this.isPowered()) {
      return;
    }

    let keycode = e.keyCode;
    this.lastInput = new Date();
    if (keycode >= KeyCode.KEY_NUMPAD0 && keycode <= KeyCode.KEY_NUMPAD9) {
      keycode -= 48; // numpad support
    }
    // Note: tried using H-events, worse performance. Reverted to direct input.
    // Preventing repeated input also similarly felt awful and defeated the point.
    // Clr hold functionality pointless as scratchpad will be cleared (repeated input).

    if (e.altKey || (e.ctrlKey && keycode === KeyCode.KEY_Z)) {
      this.clearFocus();
    } else if (e.ctrlKey && keycode === KeyCode.KEY_A) {
      this.allSelected = !this.allSelected;
      this.scratchpadDisplay.setStyle(
        `display: inline-block; width:87%; background: ${this.allSelected ? 'rgba(235,64,52,1.0)' : 'rgba(255,255,255,0.2)'};`,
      );
    } else if (e.shiftKey && e.ctrlKey && keycode === KeyCode.KEY_BACK_SPACE) {
      this.setScratchpadText('');
    } else if (e.ctrlKey && keycode === KeyCode.KEY_BACK_SPACE) {
      const scratchpadTextContent = this.scratchpad.getText();
      let wordFlag = !scratchpadTextContent.includes(' ');
      for (let i = scratchpadTextContent.length; i > 0; i--) {
        if (scratchpadTextContent.slice(-1) === ' ') {
          if (!wordFlag) {
            this.onClr();
          } else {
            wordFlag = true;
            break;
          }
        }
        if (scratchpadTextContent.slice(-1) !== ' ') {
          if (!wordFlag) {
            wordFlag = true;
          } else {
            this.onClr();
          }
        }
      }
    } else if (e.shiftKey && keycode === KeyCode.KEY_BACK_SPACE) {
      if (!this.check_clr) {
        this.onClr();
        this.check_clr = setTimeout(() => {
          this.onClrHeld();
        }, 2000);
      }
      this.animateKey('CLR');
    } else if (
      (keycode >= KeyCode.KEY_0 && keycode <= KeyCode.KEY_9) ||
      (keycode >= KeyCode.KEY_A && keycode <= KeyCode.KEY_Z)
    ) {
      const letter = String.fromCharCode(keycode);
      this.onLetterInput(letter);
      this.animateKey(letter.toUpperCase());
    } else if (keycode === KeyCode.KEY_PERIOD || keycode === KeyCode.KEY_DECIMAL) {
      this.onDot();
      this.animateKey('DOT');
    } else if (
      keycode === KeyCode.KEY_SLASH ||
      keycode === KeyCode.KEY_BACK_SLASH ||
      keycode === KeyCode.KEY_DIVIDE ||
      keycode === 226
    ) {
      this.onDiv();
      this.animateKey('SLASH');
    } else if (keycode === KeyCode.KEY_BACK_SPACE || keycode === KeyCode.KEY_DELETE) {
      if (this.allSelected) {
        this.setScratchpadText('');
      } else if (!this.clrStop) {
        this.onClr();
        this.animateKey('CLR');
        this.clrStop = this.scratchpad.isClearStop();
      }
    } else if (keycode === KeyCode.KEY_SPACE) {
      this.onSp();
      this.animateKey('SP');
    } else if (keycode === 189 || keycode === KeyCode.KEY_SUBTRACT) {
      this.onPlusMinus('-');
      this.animateKey('PLUSMINUS');
    } else if (keycode === 187 || keycode === KeyCode.KEY_ADD) {
      this.onPlusMinus('+');
      this.animateKey('PLUSMINUS');
    } else if (keycode >= KeyCode.KEY_F1 && keycode <= KeyCode.KEY_F6) {
      const func_num = keycode - KeyCode.KEY_F1;
      this.onLeftFunction(func_num);
      this.animateKey('L' + (func_num + 1));
    } else if (keycode >= KeyCode.KEY_F7 && keycode <= KeyCode.KEY_F12) {
      const func_num = keycode - KeyCode.KEY_F7;
      this.onRightFunction(func_num);
      this.animateKey('R' + (func_num + 1));
    }
  }

  private onKeyboardKeyUp(e: KeyboardEvent) {
    this.lastInput = new Date();
    const keycode = e.keyCode;
    if (keycode === KeyCode.KEY_BACK_SPACE || keycode === KeyCode.KEY_DELETE) {
      this.clrStop = false;
    }
    if (this.check_clr) {
      clearTimeout(this.check_clr);
      this.check_clr = undefined;
    }
  }

  /* END OF MCDU SCRATCHPAD */
  /* MCDU MESSAGE SYSTEM */

  /**
   * Display a type I message on the active subsystem's scratch pad
   */
  public setScratchpadMessage(message: McduMessage) {
    if (message instanceof TypeIIMessage) {
      console.error('Type II message passed to setScratchpadMessage! Redirecting to the queue.', message);
      this.addMessageToQueue(message);
      return;
    }

    if (this.scratchpad) {
      this.scratchpad.setMessage(message);
    }
  }

  public setScratchpadText(value: string) {
    this.scratchpad.setText(value);
  }

  // FIXME move non-FMS code out of FMS
  /**
   * General ATSU message handler which converts ATSU status codes to new MCDU messages
   * @param code ATSU status code
   */
  public addNewAtsuMessage(code: AtsuStatusCodes) {
    if (!this.atsuScratchpad) {
      return;
    }
    switch (code) {
      case AtsuStatusCodes.CallsignInUse:
        this.atsuScratchpad.setMessage(NXFictionalMessages.fltNbrInUse);
        break;
      case AtsuStatusCodes.NoAcarsConnection:
        this.atsuScratchpad.setMessage(NXFictionalMessages.noAcarsConnection);
        break;
      case AtsuStatusCodes.ComFailed:
        this.atsuScratchpad.setMessage(NXSystemMessages.comUnavailable);
        break;
      case AtsuStatusCodes.NoAtc:
        this.atsuScratchpad.setMessage(NXSystemMessages.noAtc);
        break;
      case AtsuStatusCodes.MailboxFull:
        this.atsuScratchpad.setMessage(NXSystemMessages.dcduFileFull);
        break;
      case AtsuStatusCodes.UnknownMessage:
        this.atsuScratchpad.setMessage(NXFictionalMessages.unknownAtsuMessage);
        break;
      case AtsuStatusCodes.ProxyError:
        this.atsuScratchpad.setMessage(NXFictionalMessages.reverseProxy);
        break;
      case AtsuStatusCodes.NoTelexConnection:
        this.atsuScratchpad.setMessage(NXFictionalMessages.telexNotEnabled);
        break;
      case AtsuStatusCodes.OwnCallsign:
        this.atsuScratchpad.setMessage(NXSystemMessages.noAtc);
        break;
      case AtsuStatusCodes.SystemBusy:
        this.atsuScratchpad.setMessage(NXSystemMessages.systemBusy);
        break;
      case AtsuStatusCodes.NewAtisReceived:
        this.atsuScratchpad.setMessage(NXSystemMessages.newAtisReceived);
        break;
      case AtsuStatusCodes.NoAtisReceived:
        this.atsuScratchpad.setMessage(NXSystemMessages.noAtisReceived);
        break;
      case AtsuStatusCodes.EntryOutOfRange:
        this.atsuScratchpad.setMessage(NXSystemMessages.entryOutOfRange);
        break;
      case AtsuStatusCodes.FormatError:
        this.atsuScratchpad.setMessage(NXSystemMessages.formatError);
        break;
      case AtsuStatusCodes.NotInDatabase:
        this.atsuScratchpad.setMessage(NXSystemMessages.notInDatabase);
        break;
      default:
        break;
    }
  }

  /**
   * ATSU system status from the ATSU, which is not an answer to an entry on one MCDU, is shown on every MCDU.
   * @param code ATSU status code
   */
  public addAtsuStatusMessage(code: AtsuStatusCodes) {
    this.forEachScreen((screen) => screen.addNewAtsuMessage(code));
  }

  /* END OF MCDU MESSAGE SYSTEM */
  /* MCDU EVENTS */

  protected onEvent(_event) {
    const isLeftMcduEvent = _event.indexOf('1_BTN_') !== -1;
    const isRightMcduEvent = _event.indexOf('2_BTN_') !== -1;

    // The keys of the F/O MCDU go to the F/O screen, when there is one
    const screen = isRightMcduEvent && this.screens[1] ? this.screens[1] : this;

    // MCDU should not accept input while unpowered
    if (!screen.isPowered()) {
      return;
    }

    if (isLeftMcduEvent || isRightMcduEvent || _event.indexOf('BTN_') !== -1) {
      const input = _event.replace('1_BTN_', '').replace('2_BTN_', '').replace('BTN_', '');
      if (screen._keypad.onKeyPress(input, isRightMcduEvent ? 'R' : 'L')) {
        return;
      }

      if (input.length === 2 && input[0] === 'L') {
        const v = parseInt(input[1]) - 1;
        if (isFinite(v)) {
          screen.onLeftFunction(v);
        }
      } else if (input.length === 2 && input[0] === 'R') {
        const v = parseInt(input[1]) - 1;
        if (isFinite(v)) {
          screen.onRightFunction(v);
        }
      } else {
        console.log("'" + input + "'");
      }
    }
  }

  private onLsk(fncAction, fncActionDelay = this.getDelayBasic) {
    if (!fncAction) {
      return;
    }

    // First timeout simulates delay for key press
    // Second delay simulates delay for input validation
    const cur = this.page.Current;
    setTimeout(() => {
      const value = this.scratchpad.removeUserContentFromScratchpadAndDisplayAndReturnTextContent();
      setTimeout(() => {
        if (this.page.Current === cur) {
          fncAction(value, () => this.setScratchpadUserData(value));
        }
      }, fncActionDelay());
    }, 100);
  }

  /**
   * Handle brightness key events
   */
  public onBrightnessKey(side: 'L' | 'R', sign: -1 | 1) {
    const oldBrightness = side === 'R' ? this.rightBrightness : this.leftBrightness;
    SimVar.SetSimVarValue(
      `L:A32NX_MCDU_${side}_BRIGHTNESS`,
      'number',
      Math.max(
        A320_Neo_CDU_MainDisplay.MIN_BRIGHTNESS,
        Math.min(A320_Neo_CDU_MainDisplay.MAX_BRIGHTNESS, oldBrightness + sign * 0.2 * oldBrightness),
      ),
    );
  }

  /* END OF MCDU EVENTS */
  /* MCDU DELAY SIMULATION */

  /**
   * Used for switching pages
   * @returns delay in ms between 150 and 200
   */
  public getDelaySwitchPage(): number {
    return 150 + 50 * Math.random();
  }

  /**
   * Used for basic inputs e.g. alternate airport, ci, fl, temp, constraints, ...
   * @returns delay in ms between 300 and 400
   */
  public getDelayBasic(): number {
    return 300 + 100 * Math.random();
  }

  /**
   * Used for e.g. loading time fore pages
   * @returns delay in ms between 600 and 800
   */
  public getDelayMedium(): number {
    return 600 + 200 * Math.random();
  }

  /**
   * Used for intense calculation
   * @returns delay in ms between 900 and 12000
   */
  public getDelayHigh(): number {
    return 900 + 300 * Math.random();
  }

  /**
   * Used for calculation time for fuel pred page
   * @returns dynamic delay in ms between 2000ms and 4000ms
   */
  public getDelayFuelPred(): number {
    return Math.max(2000, Math.min(4000, 225 * this.getActivePlanLegCount()));
  }

  /**
   * Used to load wind data into sfms
   * @returns dynamic delay in ms dependent on amount of waypoints
   */
  public getDelayWindLoad(): number {
    return Math.pow(this.getActivePlanLegCount(), 2);
  }

  /**
   * Tries to delete a pages timeout
   */
  private tryDeleteTimeout() {
    if (this.SelfPtr) {
      clearTimeout(this.SelfPtr);
      this.SelfPtr = false;
    }
  }

  /* END OF MCDU DELAY SIMULATION */
  /* MCDU AOC MESSAGE SYSTEM */

  public printPage(lines: any[]) {
    if (this.printing) {
      return;
    }
    this.printing = true;

    const formattedValues = lines.map((l) => {
      return l
        .replace(/\[color]cyan/g, '<br/>')
        .replace(/{white}[-]{3,}{end}/g, '<br/>')
        .replace(/{end}/g, '<br/>')
        .replace(/(\[color][a-z]*)/g, '')
        .replace(/{[a-z]*}/g, '');
    });

    const websocketLines = formattedValues.map((l) => {
      return l.replace(/<br\/>[ ]*/g, '\n');
    });

    if (SimVar.GetSimVarValue('L:A32NX_PRINTER_PRINTING', 'bool') === 1) {
      SimVar.SetSimVarValue(
        'L:A32NX_PAGES_PRINTED',
        'number',
        SimVar.GetSimVarValue('L:A32NX_PAGES_PRINTED', 'number') + 1,
      );
      SimVar.SetSimVarValue('L:A32NX_PRINT_PAGE_OFFSET', 'number', 0);
    }
    SimVar.SetSimVarValue('L:A32NX_PRINT_LINES', 'number', lines.length);
    SimVar.SetSimVarValue('L:A32NX_PAGE_ID', 'number', SimVar.GetSimVarValue('L:A32NX_PAGE_ID', 'number') + 1);
    SimVar.SetSimVarValue('L:A32NX_PRINTER_PRINTING', 'bool', 0).then(() => {
      this.fmgcMesssagesListener.triggerToAllSubscribers('A32NX_PRINT', formattedValues);
      this.sendToMcduServerClient(`print:${JSON.stringify({ lines: websocketLines })}`);
      setTimeout(() => {
        SimVar.SetSimVarValue('L:A32NX_PRINTER_PRINTING', 'bool', 1);
        this.printing = false;
      }, 2500);
    });
  }

  /* END OF MCDU AOC MESSAGE SYSTEM */

  /* MCDU SERVER CLIENT */

  /**
   * Sends a message to the websocket server (if connected)
   * @param {string} message
   */
  private sendToMcduServerClient(message: string) {
    if (this.mcduServerClient && this.mcduServerClient.isConnected()) {
      try {
        this.mcduServerClient.send(message);
      } catch (_e) {
        /** ignore **/
      }
    }
  }

  /**
   * Schedules an update to the websocket server with the current state of the MCDU.
   * Multiple synchronous state changes are combined into one update.
   */
  public requestServerUpdate() {
    if (
      this.mcduServerUpdateDebounceTimer.isPending() ||
      !this.mcduServerClient ||
      !this.mcduServerClient.isConnected()
    ) {
      return;
    }

    this.mcduServerUpdateDebounceTimer.schedule(this.sendUpdateToMcduServer, 0);
  }

  /** The state of what a screen shows, for the remote MCDU. */
  private getScreenState(screen: A320_Neo_CDU_MainDisplay, integralLightsPowered: boolean): any {
    return {
      lines: [
        screen._labels[0],
        screen._lines[0],
        screen._labels[1],
        screen._lines[1],
        screen._labels[2],
        screen._lines[2],
        screen._labels[3],
        screen._lines[3],
        screen._labels[4],
        screen._lines[4],
        screen._labels[5],
        screen._lines[5],
      ],
      scratchpad: `{${screen.scratchpadDisplay.getColor()}}${screen.scratchpadDisplay.getText()}{end}`,
      title: screen._title,
      titleLeft: '', // deprecated and unused
      page: screen._pageCount > 0 ? `{small}${screen._pageCurrent}/${screen._pageCount}{end}` : '',
      arrows: screen._arrows,
      integralBrightness: integralLightsPowered
        ? SimVar.GetSimVarValue('A:LIGHT POTENTIOMETER:85', 'percent over 100')
        : 0,
    };
  }

  private sendUpdateToMcduServer = (): void => {
    // Only calculate the update when mcduServerClient is established.
    if (!this.mcduServerClient?.isConnected()) {
      return;
    }

    let left = this.emptyLines;
    let right = this.emptyLines;

    const mcdu1Powered = SimVar.GetSimVarValue('L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED', 'bool');
    const mcdu2Powered = SimVar.GetSimVarValue('L:A32NX_ELEC_AC_2_BUS_IS_POWERED', 'bool');
    const integralLightsPowered = SimVar.GetSimVarValue('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'bool');

    if (mcdu1Powered) {
      left = Object.assign({}, this.getScreenState(this, integralLightsPowered));
      left.annunciators = this.annunciators.left;
      left.displayBrightness = this.leftBrightness / A320_Neo_CDU_MainDisplay.MAX_BRIGHTNESS;
    }

    if (mcdu2Powered) {
      right = Object.assign({}, this.getScreenState(this.screens[1] ?? this, integralLightsPowered));
      right.annunciators = this.annunciators.right;
      right.displayBrightness = this.rightBrightness / A320_Neo_CDU_MainDisplay.MAX_BRIGHTNESS;
    }

    const content = { right, left };
    this.sendToMcduServerClient(`update:${JSON.stringify(content)}`);
  };

  /**
   * Clears the remote MCDU clients' screens
   */
  private sendClearScreen() {
    // only calculate update when mcduServerClient is established.
    if (this.mcduServerClient && !this.mcduServerClient.isConnected()) {
      return;
    }
    const left = this.emptyLines;
    const right = left;
    const content = { right, left };
    this.sendToMcduServerClient(`update:${JSON.stringify(content)}`);
  }

  /* END OF WEBSOCKET */

  public logTroubleshootingError(msg: any) {
    this.bus.pub('troubleshooting_log_error', String(msg), true, false);
  }
}
// registerInstrument('a320-neo-cdu-main-display', A320_Neo_CDU_MainDisplay);
