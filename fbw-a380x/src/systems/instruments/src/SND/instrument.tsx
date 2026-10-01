// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject } from '@microsoft/msfs-sdk';
import { readSndNavigation, SndNavigation } from './SndData';
import { IsisPowerUnit, IsisUnitState } from './SndPower';
import {
  isisDisplay,
  isisUnitOf,
  ISIS_CONFIGURATION_VAR,
  IsisConfiguration,
  IsisUnit,
} from '@shared/IsisConfiguration';
import { SndDisplay } from './SndDisplay';
import { SndPoint } from './SndGeo';
import { SndMenu } from './SndMenu';
import { SndNavigator } from './SndNavigator';
import { SndFixView, sndFixView, SndGuidanceView, SndLowerView, sndGuidanceView, sndListView } from './SndViews';

import './Snd.scss';

/** The display during the power-up tests: no heading, no position */
const SELF_TEST_NAVIGATION: SndNavigation = {
  headingAdiru: null,
  positionAdiru: 3,
  trueReference: false,
  heading: null,
  track: null,
  groundSpeed: null,
  latitude: null,
  longitude: null,
};

/** Brightness steps of the + and - pb */
const BRIGHTNESS_STEP = 0.1;
const BRIGHTNESS_MIN = 0.2;

/**
 * The Standby Navigation Display (SND, FCOM DSC-34-10-20-30) of the A380 ISIS. The SND is drawn on both ISIS, on the one
 * that displays it (MODE pb, SFD/SND reconfiguration, FCOM DSC-34-10-20-20-10 P 2); the cockpit behaviour sends the
 * SND events of the ISIS that displays the SND, so both drawings keep the same waypoint list. The + and - pb adjust its
 * brightness, the MENU pb, the SET/SEL knob and the LS/DIR TO pb manage the waypoint list and the DIR TO. The waypoint list is kept by the ISIS while the instrument runs. At power-up
 * the ISIS unit runs its tests (INIT and the seconds left), as the SFD.
 */
// eslint-disable-next-line camelcase
class A380X_SND extends BaseInstrument {
  private readonly navigation = Subject.create<SndNavigation>(readSndNavigation());

  private readonly guidance = Subject.create<SndGuidanceView | null>(null);

  private readonly lower = Subject.create<SndLowerView>({ kind: 'list', rows: [], bracket: null });

  private readonly fix = Subject.create<SndFixView | null>(null);

  private readonly brightness = Subject.create(1);

  /** The seconds left of the power-up tests, null out of the tests */
  private readonly selfTest = Subject.create<number | null>(null);

  /** The ISIS unit, created at the first update (it starts off in a cold and dark spawn) */
  private powerUnit: IsisPowerUnit | null = null;

  private lastUpdate: number | null = null;

  private readonly root = FSComponent.createRef<HTMLDivElement>();

  private readonly navigator = new SndNavigator();

  private readonly menu = new SndMenu(this.navigator);

  /** The ISIS of this gauge (panel.cfg Index), 2 by default */
  private unit: IsisUnit = 2;

  get templateID(): string {
    return 'A380X_SND';
  }

  /** The aircraft position, null when invalid */
  private get aircraft(): SndPoint | null {
    const n = this.navigation.get();
    return n.latitude !== null && n.longitude !== null ? { lat: n.latitude, lon: n.longitude } : null;
  }

  public onInteractionEvent(args: string[]): void {
    switch (args[0]) {
      case 'A32NX_ISIS_2_PLUS_PRESSED':
        this.brightness.set(Math.min(1, this.brightness.get() + BRIGHTNESS_STEP));
        break;
      case 'A32NX_ISIS_2_MINUS_PRESSED':
        this.brightness.set(Math.max(BRIGHTNESS_MIN, this.brightness.get() - BRIGHTNESS_STEP));
        break;
      case 'A32NX_ISIS_2_MENU_PRESSED':
        this.menu.pressMenu();
        break;
      case 'A32NX_ISIS_2_LS_DIR_PRESSED':
        this.menu.pressDirTo(this.aircraft);
        break;
      case 'A32NX_ISIS_2_KNOB_CLOCKWISE':
        this.menu.turn(1);
        break;
      case 'A32NX_ISIS_2_KNOB_ANTI_CLOCKWISE':
        this.menu.turn(-1);
        break;
      case 'A32NX_ISIS_2_KNOB_PRESSED':
        this.menu.press(this.aircraft);
        break;
      default:
        break;
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();

    this.unit = isisUnitOf(this.getAttribute('url'), 2);

    FSComponent.render(
      <div ref={this.root} class="snd-root">
        <SndDisplay
          navigation={this.navigation}
          guidance={this.guidance}
          lower={this.lower}
          fix={this.fix}
          brightness={this.brightness}
          selfTest={this.selfTest}
        />
      </div>,
      document.getElementById('SND_CONTENT'),
    );

    // Remove "instrument didn't load" text
    document?.getElementById('SND_CONTENT')?.querySelector(':scope > h1')?.remove();
  }

  public Update(): void {
    super.Update();

    // The ISIS is supplied by the DC ESS bus, and by the DC HOT 1 bus in flight (as the SFD)
    const powered =
      SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 'bool') ||
      (SimVar.GetSimVarValue('L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED', 'bool') &&
        SimVar.GetSimVarValue('AIRSPEED INDICATED', 'knots') > 50);
    const now = Date.now();
    const deltaSeconds = this.lastUpdate !== null ? (now - this.lastUpdate) / 1000 : 0;
    this.lastUpdate = now;
    this.powerUnit ??= new IsisPowerUnit(SimVar.GetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'bool'));
    if (this.powerUnit.update(powered, deltaSeconds)) {
      // The ISIS start in their normal configuration (ISIS 1 SFD, ISIS 2 SND) at each power-up, whatever the MODE pb
      // selected before. Not in the FCOM (silent on it): a design choice. Both SND gauges see the same power-up and
      // write the same value.
      SimVar.SetSimVarValue(ISIS_CONFIGURATION_VAR, 'number', IsisConfiguration.Normal);
    }

    const state = this.powerUnit.state;
    const displayed = isisDisplay(this.unit, SimVar.GetSimVarValue(ISIS_CONFIGURATION_VAR, 'number')) === 'SND';
    const on = state !== IsisUnitState.Off && displayed;
    this.root.getOrDefault()?.style.setProperty('visibility', on ? 'visible' : 'hidden');
    this.selfTest.set(this.powerUnit.selfTestRemaining);
    if (!on) {
      return;
    }
    if (state === IsisUnitState.SelfTest) {
      // The tests: the flags of the display (HDG, PPOS) and INIT, no navigation
      this.navigation.set(SELF_TEST_NAVIGATION);
      this.guidance.set(null);
      this.fix.set(null);
      this.lower.set({ kind: 'list', rows: [], bracket: null });
      return;
    }

    const navigation = readSndNavigation();
    this.navigation.set(navigation);
    const aircraft = this.aircraft;
    // The navigation goes on (sequencing) only with a valid position
    const guidance = aircraft !== null ? this.navigator.update(aircraft) : null;
    const magneticVariation = SimVar.GetSimVarValue('MAGVAR', 'degrees');
    this.guidance.set(sndGuidanceView(guidance, navigation.trueReference, magneticVariation));
    this.fix.set(sndFixView(this.navigator.fix, aircraft, navigation.trueReference, magneticVariation));
    const menu = this.menu.view;
    this.lower.set(menu !== null ? { kind: 'menu', menu } : sndListView(this.navigator, guidance));
  }
}

registerInstrument('a380x-snd', A380X_SND);
