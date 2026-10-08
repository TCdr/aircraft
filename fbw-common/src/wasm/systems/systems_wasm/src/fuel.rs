#[cfg(not(target_arch = "wasm32"))]
use crate::msfs::legacy::trigger_key_event;
#[cfg(target_arch = "wasm32")]
use msfs::legacy::trigger_key_event;

use crate::{aspects::MsfsAspectBuilder, ExecuteOn, Variable};
use msfs::sys::{KEY_FUELSYSTEM_VALVE_CLOSE, KEY_FUELSYSTEM_VALVE_OPEN};
use std::error::Error;
use systems::{
    fuel::sim_fuel_valve::{sim_fuel_valve_command, SimFuelValveCommand, SimFuelValveInputs},
    shared::to_bool,
};

pub(super) fn fuel_pumps(
    pump_indexes: impl IntoIterator<Item = u32>,
) -> impl FnOnce(&mut MsfsAspectBuilder) -> Result<(), Box<dyn Error>> {
    move |builder| {
        for pump_index in pump_indexes {
            builder.copy(
                Variable::aircraft("FUELSYSTEM PUMP ACTIVE", "Bool", pump_index as _),
                Variable::aspect(&format!("FUEL_PUMP_{pump_index}_ACTIVE")),
            );
        }
        Ok(())
    }
}

/// Closes each MSFS fuel valve while its variable is true and opens it while the variable is false.
///
/// Both the variable and the MSFS valve switch (FUELSYSTEM VALVE SWITCH:n) are watched, so the
/// valve is commanded again when MSFS moves it on its own (e.g. the flight state application or
/// the power-up of the electrical circuit of the valve) while the variable does not change. The
/// valve is also commanded once on the first tick so that it matches the variable on a freshly
/// loaded flight. The decision is made by [`sim_fuel_valve_command`], which is unit tested in the
/// systems crate.
pub(super) fn fuel_valves_closed_while(
    valves: impl IntoIterator<Item = (Variable, u32)>,
) -> impl FnOnce(&mut MsfsAspectBuilder) -> Result<(), Box<dyn Error>> {
    move |builder| {
        // Neither true (1) nor false (0), so the first tick always counts as a change.
        const NEVER_WRITTEN: f64 = -1.;

        for (closed_variable, valve_number) in valves {
            let msfs_valve_switch_variable =
                Variable::aircraft("FUELSYSTEM VALVE SWITCH", "Bool", valve_number as _);

            builder.on_change_with_starting_values(
                ExecuteOn::PostTick,
                vec![closed_variable, msfs_valve_switch_variable],
                vec![NEVER_WRITTEN, NEVER_WRITTEN],
                Box::new(move |previous_values, current_values| {
                    let to_inputs = |values: &[f64]| {
                        SimFuelValveInputs::new(to_bool(values[0]), to_bool(values[1]))
                    };

                    #[allow(clippy::float_cmp)]
                    let is_first_tick = previous_values[0] == NEVER_WRITTEN;
                    let previous = if is_first_tick {
                        None
                    } else {
                        Some(to_inputs(previous_values))
                    };

                    match sim_fuel_valve_command(previous, to_inputs(current_values)) {
                        Some(SimFuelValveCommand::Close) => {
                            trigger_key_event(KEY_FUELSYSTEM_VALVE_CLOSE, valve_number)
                        }
                        Some(SimFuelValveCommand::Open) => {
                            trigger_key_event(KEY_FUELSYSTEM_VALVE_OPEN, valve_number)
                        }
                        None => {}
                    }
                }),
            );
        }
        Ok(())
    }
}
