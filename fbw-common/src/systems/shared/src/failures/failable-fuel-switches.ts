// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * What a failure does to an MSFS fuel valve or pump switch:
 * - 'jam': the switch is held where the valve was when it jammed (a valve jammed in place);
 * - 'off': the switch is held off (a failed pump stops).
 */
export type FuelSwitchFailureEffect = 'jam' | 'off';

/** An MSFS fuel valve or pump that a failure can hold in place, whatever its cockpit control says */
export interface FailableFuelSwitch {
  /** The failure */
  failure: number;
  /** The MSFS valve (Valve.N) or pump (Pump.N) number, the index of its K events and simvars */
  index: number;
  effect: FuelSwitchFailureEffect;
  /**
   * The L:var of the flight crew selection, when the cockpit pushbutton used to drive the MSFS switch directly: the
   * pushbutton now toggles the L:var and shows it, and this driver copies it to the MSFS switch. Without it (the A380X
   * feed pumps: their pushbutton connects the pump circuit, the MSFS pump switch stays ON), the selection is the switch
   * position last set by something else than this driver.
   */
  selectionVar?: string;
  /**
   * For the 'jam' effect: where the switch is held while the failure is active, decided once when the failure becomes
   * active: true (held on), false (held off) or null (not held, the switch follows its selection). Without it, the switch
   * is held where the valve is (FUELSYSTEM VALVE OPEN). Used when one cockpit valve is made of several MSFS valves (the
   * A32NX centre tank transfer valves), whose jam depends on all of them.
   */
  jammedOn?: () => boolean | null;
}

/** Reads and commands one kind of MSFS fuel switch (valves or pumps), and the crew selection L:vars */
export interface FuelSwitchAccess {
  /** Whether the crew selection L:var is ON */
  isSelected(selectionVar: string): boolean;
  setSelected(selectionVar: string, on: boolean): void;
  /** Whether the MSFS switch is on (FUELSYSTEM VALVE SWITCH / FUELSYSTEM PUMP SWITCH) */
  isSwitchOn(index: number): boolean;
  /** How far the valve is open, 0 to 1 (FUELSYSTEM VALVE OPEN); only read for the 'jam' effect */
  position(index: number): number;
  /** Switches the MSFS switch on or off (FUELSYSTEM_VALVE_OPEN/CLOSE, FUELSYSTEM_PUMP_ON/OFF) */
  command(index: number, on: boolean): void;
}

const isLVarOn = (selectionVar: string): boolean => SimVar.GetSimVarValue(selectionVar, 'Bool') > 0;
const setLVar = (selectionVar: string, on: boolean): void => {
  SimVar.SetSimVarValue(selectionVar, 'Bool', on);
};

/** The MSFS fuel valves (Valve.N) */
export const msfsFuelValveAccess: FuelSwitchAccess = {
  isSelected: isLVarOn,
  setSelected: setLVar,
  isSwitchOn: (valve) => SimVar.GetSimVarValue(`A:FUELSYSTEM VALVE SWITCH:${valve}`, 'Bool') > 0,
  position: (valve) => SimVar.GetSimVarValue(`A:FUELSYSTEM VALVE OPEN:${valve}`, 'Percent over 100'),
  command: (valve, open) =>
    SimVar.SetSimVarValue(open ? 'K:FUELSYSTEM_VALVE_OPEN' : 'K:FUELSYSTEM_VALVE_CLOSE', 'number', valve),
};

/** The MSFS fuel pumps (Pump.N) */
export const msfsFuelPumpAccess: FuelSwitchAccess = {
  isSelected: isLVarOn,
  setSelected: setLVar,
  isSwitchOn: (pump) => SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP SWITCH:${pump}`, 'Bool') > 0,
  position: (pump) => (SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, 'Bool') > 0 ? 1 : 0),
  command: (pump, on) => SimVar.SetSimVarValue(on ? 'K:FUELSYSTEM_PUMP_ON' : 'K:FUELSYSTEM_PUMP_OFF', 'number', pump),
};

/** What the driver remembers of one switch */
interface SwitchState {
  /** The switch position this driver last saw or commanded, null before the first update */
  expectedOn: boolean | null;
  /** The crew selection, as last read or taken from the switch */
  selected: boolean;
  /** The time left before the switch is read again after a command, in milliseconds */
  settleTimeLeft: number;
  /** Whether the jam of the valve has been decided since its failure became active */
  jamDecided: boolean;
  /** While a valve is jammed: whether it is held open (true) or closed (false); null while it is not held */
  jammedOn: boolean | null;
}

/**
 * Simulates failures of MSFS fuel valves and pumps by holding their MSFS switch: a jammed valve stays where it was, a
 * failed pump is switched off, while the crew selection (the cockpit pushbutton) still changes.
 *
 * Switching off the MSFS circuit of a valve or a pump does not stop it in the sim (found in MSFS 2024), so the switch
 * itself is held. Where the pushbutton used to drive the switch directly, it now toggles a selection L:var and this
 * driver copies the selection to the switch while there is no failure.
 *
 * When the switch moves without this driver (a K:FUELSYSTEM_* event from a hardware panel, a checklist, an aircraft
 * preset, a flight being loaded, the A380X refuel logic...), the new switch position is taken as the crew selection, as
 * the pushbutton showed the switch before. A failed switch is then commanded back.
 */
export class FailableFuelSwitchesDriver {
  /** How long to wait after a command before reading the switch again, in milliseconds */
  public static readonly COMMAND_SETTLE_TIME_MS = 500;

  /** A valve jammed at least this open stays open, a valve less open stays closed (MSFS valves are open or closed) */
  public static readonly JAMMED_OPEN_RATIO = 0.5;

  private readonly states: SwitchState[];

  /**
   * @param switches the valves or pumps and their failures
   * @param isFailureActive whether a failure is active
   * @param access the MSFS valves or pumps
   */
  constructor(
    private readonly switches: readonly FailableFuelSwitch[],
    private readonly isFailureActive: (failure: number) => boolean,
    private readonly access: FuelSwitchAccess,
  ) {
    this.states = switches.map(() => ({
      expectedOn: null,
      selected: false,
      settleTimeLeft: 0,
      jamDecided: false,
      jammedOn: null,
    }));
  }

  /**
   * The selection of a switch: the crew selection, or the automatic command (the MSFS triggers of the fuel system,
   * the FQMS...) for a switch without a selection L:var. A failed pump or a jammed valve keeps its selection.
   * @param switchNumber the position of the switch in the list given to the constructor
   */
  public getSelection(switchNumber: number): boolean {
    return this.states[switchNumber].selected;
  }

  /**
   * Sets the automatic command of a switch without a selection L:var, as its owner sees it (the A380X FQMS: the edges of
   * the MSFS fuel triggers). While a failure holds a pump off, an automatic stop does not move its switch, so this driver
   * cannot see it: without this, the repaired pump would be switched back on although its owner stopped it meanwhile.
   * Ignored for a switch with a selection L:var (the crew selection).
   * @param switchNumber the position of the switch in the list given to the constructor
   * @param on whether the automatic command is on
   */
  public setAutomaticSelection(switchNumber: number, on: boolean): void {
    if (this.switches[switchNumber].selectionVar === undefined) {
      this.states[switchNumber].selected = on;
    }
  }

  /**
   * Copies each crew selection to its switch, or holds the switch of a failed valve or pump.
   * @param deltaTime the time since the last update, in milliseconds
   */
  public update(deltaTime: number): void {
    this.switches.forEach((fuelSwitch, index) => this.updateSwitch(fuelSwitch, this.states[index], deltaTime));
  }

  private updateSwitch(
    { failure, index, effect, selectionVar, jammedOn }: FailableFuelSwitch,
    state: SwitchState,
    deltaTime: number,
  ): void {
    const failed = this.isFailureActive(failure);

    // A valve jams where it is (or where jammedOn says) when the failure becomes active
    if (!failed) {
      state.jamDecided = false;
      state.jammedOn = null;
    } else if (effect === 'jam' && !state.jamDecided) {
      state.jamDecided = true;
      state.jammedOn = jammedOn
        ? jammedOn()
        : this.access.position(index) >= FailableFuelSwitchesDriver.JAMMED_OPEN_RATIO;
    }

    state.settleTimeLeft -= deltaTime;
    if (state.settleTimeLeft > 0) {
      return;
    }

    const switchOn = this.access.isSwitchOn(index);
    if (state.expectedOn === null || switchOn !== state.expectedOn) {
      // First update (saved flight, cold and dark...) or the switch moved without this driver: take it as the selection
      state.expectedOn = switchOn;
      state.selected = switchOn;
      if (selectionVar !== undefined) {
        this.access.setSelected(selectionVar, switchOn);
      }
    } else if (selectionVar !== undefined) {
      state.selected = this.access.isSelected(selectionVar);
    }

    let wantedOn = state.selected;
    if (failed) {
      wantedOn = effect === 'off' ? false : state.jammedOn ?? state.selected;
    }
    if (switchOn !== wantedOn) {
      this.access.command(index, wantedOn);
      state.expectedOn = wantedOn;
      state.settleTimeLeft = FailableFuelSwitchesDriver.COMMAND_SETTLE_TIME_MS;
    }
  }
}
