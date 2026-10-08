//! Decides when an MSFS fuel valve must be commanded so that it follows the valve state wanted by
//! the systems.
//!
//! Some aircraft stop the MSFS engine combustion by closing an MSFS fuel valve of flight_model.cfg
//! in series with the engine feed (e.g. the A380X HP fuel valves, the A32NX engine fuel cut). The
//! systems only own a variable that says whether that valve must be closed; the MSFS valve itself is
//! moved with the FUELSYSTEM_VALVE_CLOSE / FUELSYSTEM_VALVE_OPEN key events.
//!
//! Commanding the valve only when the variable changes is not enough: MSFS can move the valve on
//! its own afterwards (e.g. the flight state application or the power-up of the electrical circuit
//! of the valve reopened an A380X HP fuel valve a few seconds after it was closed, while the
//! variable stayed closed). The decision below therefore also looks at the MSFS valve switch
//! (FUELSYSTEM VALVE SWITCH:n) and commands the valve again whenever it disagrees with the
//! variable.
//!
//! This module has no MSFS dependency so that the decision can be unit tested on the host. The
//! MSFS glue that reads the variables and sends the key events lives in systems_wasm `fuel.rs`.

/// The two inputs of the decision, as read on one update.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SimFuelValveInputs {
    /// The systems want the MSFS valve closed (the value of the aircraft's "valve closed" variable).
    pub valve_should_be_closed: bool,
    /// The MSFS valve switch (FUELSYSTEM VALVE SWITCH:n) is open.
    pub msfs_valve_switch_open: bool,
}

impl SimFuelValveInputs {
    pub fn new(valve_should_be_closed: bool, msfs_valve_switch_open: bool) -> Self {
        Self {
            valve_should_be_closed,
            msfs_valve_switch_open,
        }
    }

    /// True when the MSFS valve switch is already in the state the systems want.
    fn msfs_valve_agrees(&self) -> bool {
        self.valve_should_be_closed != self.msfs_valve_switch_open
    }

    /// The command that moves the MSFS valve to the state the systems want.
    fn wanted_command(&self) -> SimFuelValveCommand {
        if self.valve_should_be_closed {
            SimFuelValveCommand::Close
        } else {
            SimFuelValveCommand::Open
        }
    }
}

/// A command to send to the MSFS fuel valve.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SimFuelValveCommand {
    /// Send FUELSYSTEM_VALVE_OPEN.
    Open,
    /// Send FUELSYSTEM_VALVE_CLOSE.
    Close,
}

/// Returns the command that brings the MSFS fuel valve to the state the systems want, or `None`
/// when no command is needed.
///
/// - `previous`: the inputs of the previous update, or `None` on the first update of a flight. The
///   first update always commands the wanted state, so the MSFS valve matches the variable on a
///   freshly loaded flight even before MSFS reports a meaningful switch state.
/// - `current`: the inputs of this update.
///
/// After the first update a command is only sent when an input changed and the MSFS valve switch
/// disagrees with the variable. This is one command per change: when MSFS does not follow a command
/// the inputs stay the same and the command is not repeated on every update.
pub fn sim_fuel_valve_command(
    previous: Option<SimFuelValveInputs>,
    current: SimFuelValveInputs,
) -> Option<SimFuelValveCommand> {
    match previous {
        None => Some(current.wanted_command()),
        Some(previous) if previous == current => None,
        Some(_) if current.msfs_valve_agrees() => None,
        Some(_) => Some(current.wanted_command()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLOSED: bool = true;
    const OPEN: bool = false;
    const SWITCH_OPEN: bool = true;
    const SWITCH_CLOSED: bool = false;

    fn inputs(valve_should_be_closed: bool, msfs_valve_switch_open: bool) -> SimFuelValveInputs {
        SimFuelValveInputs::new(valve_should_be_closed, msfs_valve_switch_open)
    }

    #[test]
    fn first_update_commands_the_wanted_state_even_when_the_switch_agrees() {
        assert_eq!(
            sim_fuel_valve_command(None, inputs(CLOSED, SWITCH_CLOSED)),
            Some(SimFuelValveCommand::Close)
        );
        assert_eq!(
            sim_fuel_valve_command(None, inputs(OPEN, SWITCH_OPEN)),
            Some(SimFuelValveCommand::Open)
        );
    }

    #[test]
    fn first_update_commands_the_wanted_state_when_the_switch_disagrees() {
        assert_eq!(
            sim_fuel_valve_command(None, inputs(CLOSED, SWITCH_OPEN)),
            Some(SimFuelValveCommand::Close)
        );
        assert_eq!(
            sim_fuel_valve_command(None, inputs(OPEN, SWITCH_CLOSED)),
            Some(SimFuelValveCommand::Open)
        );
    }

    #[test]
    fn variable_closing_closes_an_open_valve() {
        assert_eq!(
            sim_fuel_valve_command(Some(inputs(OPEN, SWITCH_OPEN)), inputs(CLOSED, SWITCH_OPEN)),
            Some(SimFuelValveCommand::Close)
        );
    }

    #[test]
    fn variable_opening_opens_a_closed_valve() {
        assert_eq!(
            sim_fuel_valve_command(
                Some(inputs(CLOSED, SWITCH_CLOSED)),
                inputs(OPEN, SWITCH_CLOSED)
            ),
            Some(SimFuelValveCommand::Open)
        );
    }

    /// The bug seen in the sim on 2026-10-07: the A380X HP fuel valve variable stayed closed, MSFS
    /// reopened the valve on its own, and the valve was never closed again.
    #[test]
    fn msfs_reopening_the_valve_while_the_variable_stays_closed_closes_it_again() {
        assert_eq!(
            sim_fuel_valve_command(
                Some(inputs(CLOSED, SWITCH_CLOSED)),
                inputs(CLOSED, SWITCH_OPEN)
            ),
            Some(SimFuelValveCommand::Close)
        );
    }

    #[test]
    fn msfs_closing_the_valve_while_the_variable_stays_open_opens_it_again() {
        assert_eq!(
            sim_fuel_valve_command(Some(inputs(OPEN, SWITCH_OPEN)), inputs(OPEN, SWITCH_CLOSED)),
            Some(SimFuelValveCommand::Open)
        );
    }

    #[test]
    fn switch_following_the_command_sends_nothing() {
        assert_eq!(
            sim_fuel_valve_command(
                Some(inputs(CLOSED, SWITCH_OPEN)),
                inputs(CLOSED, SWITCH_CLOSED)
            ),
            None
        );
        assert_eq!(
            sim_fuel_valve_command(Some(inputs(OPEN, SWITCH_CLOSED)), inputs(OPEN, SWITCH_OPEN)),
            None
        );
    }

    #[test]
    fn variable_change_to_the_state_the_switch_already_has_sends_nothing() {
        assert_eq!(
            sim_fuel_valve_command(
                Some(inputs(OPEN, SWITCH_CLOSED)),
                inputs(CLOSED, SWITCH_CLOSED)
            ),
            None
        );
    }

    #[test]
    fn unchanged_disagreement_is_not_commanded_on_every_update() {
        assert_eq!(
            sim_fuel_valve_command(
                Some(inputs(CLOSED, SWITCH_OPEN)),
                inputs(CLOSED, SWITCH_OPEN)
            ),
            None
        );
    }

    /// The recorded sequence of the sim flight, update by update: the valve closes when the
    /// variable goes closed, MSFS reopens it eight seconds later, and the valve must close again.
    #[test]
    fn recorded_hp_valve_sequence_ends_with_the_valve_closed() {
        let updates = [
            inputs(OPEN, SWITCH_OPEN),     // first update, engine shut down, valve open
            inputs(CLOSED, SWITCH_OPEN),   // t = 112.4 s: the variable goes closed
            inputs(CLOSED, SWITCH_CLOSED), // MSFS closes the valve
            inputs(CLOSED, SWITCH_OPEN),   // t = 120.1 s: MSFS reopens the valve on its own
            inputs(CLOSED, SWITCH_CLOSED), // MSFS follows the new close command
        ];

        let mut previous = None;
        let commands: Vec<_> = updates
            .iter()
            .map(|&current| {
                let command = sim_fuel_valve_command(previous, current);
                previous = Some(current);
                command
            })
            .collect();

        assert_eq!(
            commands,
            [
                Some(SimFuelValveCommand::Open),
                Some(SimFuelValveCommand::Close),
                None,
                Some(SimFuelValveCommand::Close),
                None,
            ]
        );
    }
}
