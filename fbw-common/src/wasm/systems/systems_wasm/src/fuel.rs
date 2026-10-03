#[cfg(not(target_arch = "wasm32"))]
use crate::msfs::legacy::trigger_key_event;
#[cfg(target_arch = "wasm32")]
use msfs::legacy::trigger_key_event;

use crate::{aspects::MsfsAspectBuilder, ExecuteOn, Variable};
use msfs::sys::{KEY_FUELSYSTEM_VALVE_CLOSE, KEY_FUELSYSTEM_VALVE_OPEN};
use std::error::Error;
use systems::shared::to_bool;

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
/// The valve is commanded whenever the variable changes, and once on the first tick so that the
/// MSFS valve matches the variable on a freshly loaded flight.
pub(super) fn fuel_valves_closed_while(
    valves: impl IntoIterator<Item = (Variable, u32)>,
) -> impl FnOnce(&mut MsfsAspectBuilder) -> Result<(), Box<dyn Error>> {
    move |builder| {
        // Neither true (1) nor false (0), so the first tick always counts as a change.
        const NEVER_WRITTEN: f64 = -1.;

        for (closed_variable, valve_number) in valves {
            builder.on_change_with_starting_values(
                ExecuteOn::PostTick,
                vec![closed_variable],
                vec![NEVER_WRITTEN],
                Box::new(move |_, values| {
                    let key_event = if to_bool(values[0]) {
                        KEY_FUELSYSTEM_VALVE_CLOSE
                    } else {
                        KEY_FUELSYSTEM_VALVE_OPEN
                    };
                    trigger_key_event(key_event, valve_number);
                }),
            );
        }
        Ok(())
    }
}
