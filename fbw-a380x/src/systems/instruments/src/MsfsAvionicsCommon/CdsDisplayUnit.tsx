// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  DisplayComponent,
  EventBus,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';
import { FailuresConsumer, NXDataStore } from '@flybywiresim/fbw-sdk';
// import { getSupplier } from '@flybywiresim/fbw-sdk';
import {
  DisplayUnitFailure,
  DisplayUnitID,
  displayUnitDisplayVar,
  displayUnitFailedVar,
  isDisplayUnitPowered,
} from '@shared/CdsDisplayUnits';
import { normalDisplayOf, resolveDisplay } from '@shared/CdsReconfiguration';
import { DisplayVars } from './SimVarTypes';
import { findInstrumentUrl } from './HostedDisplay';

import './common.scss';

/**
 * The last digit of the gauge URL (its duID)
 * @param folder the instrument folder of the gauge (PFD, ND): all gauges of a panel.cfg block share the document, and a
 * gauge drawn on another DU (CDS reconfiguration) is not the first one. Without it, the first gauge.
 * @returns the digit, 0 without a URL
 */
export const getDisplayIndex = (folder?: string) => {
  const url = folder
    ? findInstrumentUrl(folder)
    : Array.from(document.querySelectorAll('vcockpit-panel > *'))
        ?.find((it) => it.tagName.toLowerCase() !== 'wasm-instrument')
        ?.getAttribute('url');

  return url ? parseInt(url.substring(url.length - 1), 10) : 0;
};

// The DUs and their supplies live in @shared/CdsDisplayUnits (shared with the FWS); re-exported for the instruments
export { DisplayUnitID };

const DisplayUnitToPotentiometer: { [k in DisplayUnitID]: number } = {
  [DisplayUnitID.CaptPfd]: 88,
  [DisplayUnitID.CaptNd]: 89,
  [DisplayUnitID.CaptMfd]: 98,
  [DisplayUnitID.FoPfd]: 90,
  [DisplayUnitID.FoNd]: 91,
  [DisplayUnitID.FoMfd]: 99,
  [DisplayUnitID.Ewd]: 92,
  [DisplayUnitID.Sd]: 93,
};

interface DisplayUnitProps {
  bus: EventBus;
  /** The DU of the display (its normal DU): the display is the normal display of this DU */
  displayUnitId: DisplayUnitID;
  /**
   * The DU this gauge draws on when it is a hosted gauge (CDS reconfiguration, MsfsAvionicsCommon/HostedDisplay.ts):
   * its power, brightness knob and failure apply. Without it, the DU of displayUnitId.
   */
  hostDisplayUnitId?: DisplayUnitID;
  /** An extra failure condition of the instrument; the DU's own flyPad failure is always applied */
  failed?: Subscribable<boolean>;
  test?: Subscribable<number>;
}

enum DisplayUnitState {
  On,
  MaintenanceMode,
  EngineeringTest,
  Off,
  ThalesBootup,
  Selftest,
  Standby,
}

export class CdsDisplayUnit extends DisplayComponent<DisplayUnitProps> {
  /** The DU this display is drawn on */
  private readonly physicalDisplayUnit = this.props.hostDisplayUnitId ?? this.props.displayUnitId;

  /** The display of this gauge */
  private readonly display = normalDisplayOf(this.props.displayUnitId);

  /** The L:var with the display the DU shows (CDS reconfiguration, written by the systems host) */
  private readonly displayVar = displayUnitDisplayVar(this.physicalDisplayUnit);

  /**
   * A hosted gauge starts when its display moves onto a DU that is already running: no power-up from Off (design
   * choice, the DU does not boot again because it shows another display).
   */
  private state: DisplayUnitState =
    this.props.hostDisplayUnitId === undefined && SimVar.GetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool')
      ? DisplayUnitState.Off
      : DisplayUnitState.Standby;

  /**
   * The DU shows this gauge's display (CDS reconfiguration, A380 FCOM DSC-31-15-20). Only the gauge of the display
   * shown draws on the DU, also its power-up test screens.
   */
  private shown = true;

  private timeOut: number = 0;

  private selfTestRef = FSComponent.createRef<SVGElement>();

  private thalesBootupRef = FSComponent.createRef<SVGElement>();

  private maintenanceModeRef = FSComponent.createRef<SVGElement>();

  private engineeringTestModeRef = FSComponent.createRef<SVGElement>();

  private pfdRef = FSComponent.createRef<HTMLDivElement>();

  // private supplyingDmc: number = 3;

  private readonly brightness = Subject.create(0);

  private failed = false;

  /** The instrument's extra failure condition (props.failed) */
  private externalFailed = false;

  /** The DU's own flyPad failure (shared/src/CdsDisplayUnits.ts DisplayUnitFailure) */
  private displayUnitFailed = false;

  private readonly failuresConsumer = new FailuresConsumer();

  private readonly powered = Subject.create(false);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<DisplayVars & ClockEvents>();

    sub.on('realTime').handle(() => this.update());
    sub
      .on('realTime')
      .atFrequency(1)
      .handle((_t) => {
        // override MSFS menu animations setting for this instrument
        if (!document.documentElement.classList.contains('animationsEnabled')) {
          document.documentElement.classList.add('animationsEnabled');
        }
      });

    MappedSubject.create(
      () => {
        this.updateState();
      },
      this.brightness,
      this.powered,
    );

    this.props.failed?.sub((f) => {
      this.externalFailed = f;
      this.onFailedChanged();
    }, true);

    // The DU's own failure: the DU goes blank (Off) and boots again (self test) when the failure is cleared
    this.failuresConsumer.register(DisplayUnitFailure[this.physicalDisplayUnit], (f) => {
      this.displayUnitFailed = f;
      SimVar.SetSimVarValue(displayUnitFailedVar(this.physicalDisplayUnit), 'Bool', f);
      this.onFailedChanged();
    });
  }

  private onFailedChanged(): void {
    this.failed = this.externalFailed || this.displayUnitFailed;
    this.updateState();
  }

  setTimer(time: number) {
    this.timeOut = window.setTimeout(() => {
      if (this.state === DisplayUnitState.Standby) {
        this.state = DisplayUnitState.Off;
      }
      if (this.state === DisplayUnitState.Selftest) {
        this.state = DisplayUnitState.On;
      }
      this.updateState();
    }, time * 1000);
  }

  // TODO: Fix and reenable
  /*
    checkMaintMode() {
        const dmcKnob = SimVar.GetSimVarValue('L:A32NX_EIS_DMC_SWITCHING_KNOB', 'Enum');
        this.supplyingDmc = getSupplier(this.props.normDmc, dmcKnob);
        const dmcDisplayTestMode = SimVar.GetSimVarValue(`L:A32NX_DMC_DISPLAYTEST:${this.supplyingDmc}`, 'Enum');
        switch (dmcDisplayTestMode) {
        case 1:
            this.state = DisplayUnitState.MaintenanceMode;
            break;
        case 2:
            this.state = DisplayUnitState.EngineeringTest;
            break;
        default:
            this.state = DisplayUnitState.On;
        }
    }
    */

  public update() {
    this.failuresConsumer.update();

    const potentiometer = SimVar.GetSimVarValue(
      `LIGHT POTENTIOMETER:${DisplayUnitToPotentiometer[this.physicalDisplayUnit]}`,
      'percent over 100',
    );

    this.brightness.set(potentiometer);
    this.powered.set(
      isDisplayUnitPowered(
        this.physicalDisplayUnit,
        (bus) => SimVar.GetSimVarValue(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 'Bool') > 0,
      ),
    );

    const shown =
      resolveDisplay(this.physicalDisplayUnit, SimVar.GetSimVarValue(this.displayVar, 'number')) === this.display;
    if (shown !== this.shown) {
      this.shown = shown;
      // only what is drawn changes: the DU state (power-up sequence) is the DU's own
      this.updateVisibility();
    }
  }

  updateState() {
    if (this.state !== DisplayUnitState.Off && this.failed) {
      this.state = DisplayUnitState.Off;
      clearTimeout(this.timeOut);
    } else if (this.state === DisplayUnitState.On && (this.brightness.get() === 0 || !this.powered.get())) {
      this.state = DisplayUnitState.Standby;
      this.setTimer(10);
    } else if (this.state === DisplayUnitState.Standby && this.brightness.get() !== 0 && this.powered.get()) {
      this.state = DisplayUnitState.On;
      clearTimeout(this.timeOut);
    } else if (
      this.state === DisplayUnitState.Off &&
      this.brightness.get() !== 0 &&
      this.powered.get() &&
      !this.failed
    ) {
      this.state = DisplayUnitState.ThalesBootup;
      this.setTimer(0.25 + Math.random() * 0.2);
    } else if (
      this.state === DisplayUnitState.ThalesBootup &&
      this.brightness.get() !== 0 &&
      this.powered.get() &&
      !this.failed
    ) {
      this.state = DisplayUnitState.Selftest;
      this.setTimer(parseInt(NXDataStore.getLegacy('CONFIG_SELF_TEST_TIME', '15')));
    } else if (
      (this.state === DisplayUnitState.Selftest || this.state === DisplayUnitState.ThalesBootup) &&
      (this.brightness.get() === 0 || !this.powered.get())
    ) {
      this.state = DisplayUnitState.Off;
      clearTimeout(this.timeOut);
    }

    this.updateVisibility();
  }

  /** Shows the element of the DU state, or nothing when the DU shows another display */
  private updateVisibility(): void {
    if (!this.shown) {
      // the DU shows another display (CDS reconfiguration): this gauge draws nothing, its DU state keeps running
      this.selfTestRef.instance.style.display = 'none';
      this.thalesBootupRef.instance.style.display = 'none';
      this.maintenanceModeRef.instance.style.display = 'none';
      this.engineeringTestModeRef.instance.style.display = 'none';
      this.pfdRef.instance.style.display = 'none';
    } else if (this.state === DisplayUnitState.Selftest) {
      this.selfTestRef.instance.style.display = 'block';
      this.thalesBootupRef.instance.style.display = 'none';
      this.maintenanceModeRef.instance.style.display = 'none';
      this.engineeringTestModeRef.instance.style.display = 'none';
      this.pfdRef.instance.style.display = 'none';
    } else if (this.state === DisplayUnitState.ThalesBootup) {
      this.selfTestRef.instance.style.display = 'none';
      this.thalesBootupRef.instance.style.display = 'block';
      this.maintenanceModeRef.instance.style.display = 'none';
      this.engineeringTestModeRef.instance.style.display = 'none';
      this.pfdRef.instance.style.display = 'none';
    } else if (this.state === DisplayUnitState.On) {
      this.selfTestRef.instance.style.display = 'none';
      this.thalesBootupRef.instance.style.display = 'none';
      this.maintenanceModeRef.instance.style.display = 'none';
      this.engineeringTestModeRef.instance.style.display = 'none';
      this.pfdRef.instance.style.display = 'block';
    } else if (this.state === DisplayUnitState.MaintenanceMode) {
      this.selfTestRef.instance.style.display = 'none';
      this.thalesBootupRef.instance.style.display = 'none';
      this.maintenanceModeRef.instance.style.display = 'block';
      this.engineeringTestModeRef.instance.style.display = 'none';
      this.pfdRef.instance.style.display = 'none';
    } else if (this.state === DisplayUnitState.EngineeringTest) {
      this.selfTestRef.instance.style.display = 'none';
      this.thalesBootupRef.instance.style.display = 'none';
      this.maintenanceModeRef.instance.style.display = 'none';
      this.engineeringTestModeRef.instance.style.display = 'block';
      this.pfdRef.instance.style.display = 'none';
    } else {
      this.selfTestRef.instance.style.display = 'none';
      this.thalesBootupRef.instance.style.display = 'none';
      this.maintenanceModeRef.instance.style.display = 'none';
      this.engineeringTestModeRef.instance.style.display = 'none';
      this.pfdRef.instance.style.display = 'none';
    }
  }

  render(): VNode {
    return (
      <>
        <svg style="display:none" ref={this.selfTestRef} class="SelfTest" viewBox="0 0 768 1024">
          <rect class="SelfTestBackground" x="0" y="0" width="100%" height="100%" />

          <text class="SelfTestText" x="50%" y="50%">
            SAFETY TEST IN PROGRESS
          </text>
          <text class="SelfTestText" x="50%" y="54%">
            (MAX 30 SECONDS)
          </text>
        </svg>

        <svg style="display:none" ref={this.thalesBootupRef} class="SelfTest" viewBox="0 0 768 1024">
          <rect class="SelfTestBackground" x="0" y="0" width="100%" height="100%" />

          <rect x={84} y={880} width={600} height={70} fill="#ffffff" />
          <rect x={89} y={885} width={35} height={60} fill="#4d4dff" />
        </svg>

        <svg style="display:none" ref={this.maintenanceModeRef} class="MaintenanceMode" viewBox="0 0 600 600">
          <text class="SelfTestText" x="50%" y="50%">
            MAINTENANCE MODE
          </text>
        </svg>

        <svg style="display:none" ref={this.engineeringTestModeRef} class="EngineeringTestMode" viewBox="0 0 600 600">
          <text class="EngineeringTestModeText" x={9} y={250}>
            P/N : C19755BA01
          </text>
          <text class="EngineeringTestModeText" x={10} y={270}>
            S/N : C1975517334
          </text>
          <text class="EngineeringTestModeText" x={10} y={344}>
            EIS SW
          </text>
          <text class="EngineeringTestModeText" x={10} y={366}>
            P/N : C1975517332
          </text>
          <text class="EngineeringTestModeText" text-anchor="end" x="90%" y={250}>
            THALES AVIONICS
          </text>
          <text class="EngineeringTestModeText" text-anchor="end" x="98%" y={366}>
            LCDU 725
          </text>
        </svg>

        <div style="display:none" ref={this.pfdRef}>
          {this.props.children}
        </div>
      </>
    );
  }
}
