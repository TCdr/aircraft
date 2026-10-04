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
import { DisplayUnitFailure, DisplayUnitID, displayUnitFailedVar, isDisplayUnitPowered } from '@shared/CdsDisplayUnits';
import { DisplayVars } from './SimVarTypes';

import './common.scss';

export const getDisplayIndex = () => {
  const url = Array.from(document.querySelectorAll('vcockpit-panel > *'))
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
  displayUnitId: DisplayUnitID;
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
  private state: DisplayUnitState = SimVar.GetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool')
    ? DisplayUnitState.Off
    : DisplayUnitState.Standby;

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
    this.failuresConsumer.register(DisplayUnitFailure[this.props.displayUnitId], (f) => {
      this.displayUnitFailed = f;
      SimVar.SetSimVarValue(displayUnitFailedVar(this.props.displayUnitId), 'Bool', f);
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
      `LIGHT POTENTIOMETER:${DisplayUnitToPotentiometer[this.props.displayUnitId]}`,
      'percent over 100',
    );

    this.brightness.set(potentiometer);
    this.powered.set(
      isDisplayUnitPowered(
        this.props.displayUnitId,
        (bus) => SimVar.GetSimVarValue(`L:A32NX_ELEC_${bus}_BUS_IS_POWERED`, 'Bool') > 0,
      ),
    );
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

    if (this.state === DisplayUnitState.Selftest) {
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
