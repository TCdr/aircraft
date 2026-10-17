use crate::aspects::{
    EventToVariableMapping, EventToVariableOptions, VariableToEventMapping, VariableToEventWriteOn,
};
use crate::{ExecuteOn, MsfsAspectBuilder, Variable};
use msfs::sys;
use std::error::Error;

/// The MSFS engine anti-ice events of all engines, with their effect on each ENG ANTI ICE pb-sw
const ALL_ENGINES_ANTI_ICE_EVENTS: [(&str, EventToVariableMapping); 5] = [
    ("ANTI_ICE_ON", EventToVariableMapping::Value(1.)),
    ("ANTI_ICE_OFF", EventToVariableMapping::Value(0.)),
    (
        "ANTI_ICE_SET",
        EventToVariableMapping::EventDataToValue(set_event_value),
    ),
    (
        "ANTI_ICE_TOGGLE",
        EventToVariableMapping::CurrentValueToValue(toggled),
    ),
    (
        "ANTI_ICE_GRADUAL_SET",
        EventToVariableMapping::EventDataToValue(set_event_value),
    ),
];

/// A SET event switches the pb-sw ON with any data but 0
fn set_event_value(data: sys::DWORD) -> f64 {
    if data != 0 {
        1.
    } else {
        0.
    }
}

/// A TOGGLE event switches the pb-sw to its other position
fn toggled(push_button: f64) -> f64 {
    if push_button > 0. {
        0.
    } else {
        1.
    }
}

/// The engine anti-ice of each engine:
/// - The MSFS engine anti-ice events (ANTI_ICE_TOGGLE_ENGn, ANTI_ICE_SET_ENGn, ANTI_ICE_GRADUAL_SET_ENGn and the
///   all-engines ANTI_ICE_ON, ANTI_ICE_OFF, ANTI_ICE_SET, ANTI_ICE_TOGGLE, ANTI_ICE_GRADUAL_SET) of key bindings and
///   hardware panels move the ENG ANTI ICE pb-sw (L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_n_POSITION) instead of the MSFS
///   variable: they are masked from the sim.
/// - The MSFS engine anti-ice (ENG ANTI ICE, used by the MSFS engine model and the FADEC thrust limits) follows the
///   engine anti-ice valve of the systems model (systems::ice_rain_protection::engine_anti_ice): this module transmits
///   ANTI_ICE_SET_ENGn with the valve position when it changes. Like the brakes axis events, a transmitted event goes
///   to the sim and not back to the masked handler.
pub(super) fn engine_anti_ice_valves(
    engine_count: usize,
) -> impl FnOnce(&mut MsfsAspectBuilder) -> Result<(), Box<dyn Error>> {
    move |builder: &mut MsfsAspectBuilder| {
        for engine_number in 1..=engine_count {
            let push_button = Variable::named(&format!(
                "BUTTON_OVHD_ANTI_ICE_ENG_{}_POSITION",
                engine_number
            ));

            let set_event_id = builder.event_to_variable(
                &format!("ANTI_ICE_SET_ENG{}", engine_number),
                EventToVariableMapping::EventDataToValue(set_event_value),
                push_button.clone(),
                EventToVariableOptions::mask,
            )?;
            builder.event_to_variable(
                &format!("ANTI_ICE_TOGGLE_ENG{}", engine_number),
                EventToVariableMapping::CurrentValueToValue(toggled),
                push_button.clone(),
                EventToVariableOptions::mask,
            )?;
            builder.event_to_variable(
                &format!("ANTI_ICE_GRADUAL_SET_ENG{}", engine_number),
                EventToVariableMapping::EventDataToValue(set_event_value),
                push_button.clone(),
                EventToVariableOptions::mask,
            )?;
            for (event, mapping) in ALL_ENGINES_ANTI_ICE_EVENTS {
                builder.event_to_variable(
                    event,
                    mapping,
                    push_button.clone(),
                    EventToVariableOptions::mask,
                )?;
            }

            builder.variable_to_event_id(
                Variable::named(&format!("PNEU_ENG_{}_ANTI_ICE_VALVE_OPEN", engine_number)),
                VariableToEventMapping::EventDataRaw,
                VariableToEventWriteOn::Change,
                set_event_id,
            );
        }

        Ok(())
    }
}

/// The number of TOGGLE_STRUCTURAL_DEICE events to transmit so far, and the STRUCTURAL DEICE SWITCH position from
/// which the last one was transmitted (-1 when none is pending). A toggle is transmitted when the MSFS structural
/// deice disagrees with the wing anti-ice and no toggle from that position is pending (the sim applies it on a later
/// frame).
fn wing_toggle_needed(values: &[f64]) -> bool {
    let [switch_on, pending_from] = [values[2], values[4]];
    // Allow floating point equality comparison: both values come from the same bool variable
    #[allow(clippy::float_cmp)]
    let toggle_pending = switch_on == pending_from;
    structural_deice_disagrees(values) && !toggle_pending
}

/// The MSFS structural deice disagrees with the wing anti-ice (on without a fault) of the systems model
fn structural_deice_disagrees(values: &[f64]) -> bool {
    let [system_on, has_fault, switch_on] = [values[0], values[1], values[2]];
    let wing_anti_ice_on = system_on > 0. && has_fault <= 0.;
    wing_anti_ice_on != (switch_on > 0.)
}

fn wing_toggle_count(values: &[f64]) -> f64 {
    if wing_toggle_needed(values) {
        values[3] + 1.
    } else {
        values[3]
    }
}

fn wing_toggle_pending_from(values: &[f64]) -> f64 {
    if !structural_deice_disagrees(values) {
        -1.
    } else if wing_toggle_needed(values) {
        values[2]
    } else {
        values[4]
    }
}

/// The wing anti-ice:
/// - TOGGLE_STRUCTURAL_DEICE of key bindings and hardware panels toggles the WING ANTI ICE pb-sw
///   (L:A32NX_BUTTON_OVHD_ANTI_ICE_WING_POSITION) instead of the MSFS variable: it is masked from the sim.
/// - The MSFS structural deice (STRUCTURAL DEICE SWITCH, used by the MSFS icing model) follows the wing anti-ice of the
///   systems model (PNEU_WING_ANTI_ICE_SYSTEM_ON without PNEU_WING_ANTI_ICE_HAS_FAULT): this module transmits
///   TOGGLE_STRUCTURAL_DEICE when they disagree (the sim has no set event for it).
pub(super) fn wing_anti_ice() -> impl FnOnce(&mut MsfsAspectBuilder) -> Result<(), Box<dyn Error>> {
    move |builder: &mut MsfsAspectBuilder| {
        let toggle_event_id = builder.event_to_variable(
            "TOGGLE_STRUCTURAL_DEICE",
            EventToVariableMapping::CurrentValueToValue(toggled),
            Variable::named("BUTTON_OVHD_ANTI_ICE_WING_POSITION"),
            EventToVariableOptions::mask,
        )?;

        let toggle_count = Variable::aspect("WING_ANTI_ICE_STRUCTURAL_DEICE_TOGGLES");
        let pending_from = Variable::aspect("WING_ANTI_ICE_STRUCTURAL_DEICE_TOGGLE_FROM");
        builder.init_variable(toggle_count.clone(), 0.);
        builder.init_variable(pending_from.clone(), -1.);
        let inputs = vec![
            Variable::named("PNEU_WING_ANTI_ICE_SYSTEM_ON"),
            //TODO: replace with a mechanism that detects actual air flow into anti-ice system
            Variable::named("PNEU_WING_ANTI_ICE_HAS_FAULT"),
            Variable::aircraft("STRUCTURAL DEICE SWITCH", "Bool", 0),
            toggle_count.clone(),
            pending_from.clone(),
        ];
        // The count first, from the pending position of the previous frame
        builder.map_many(
            ExecuteOn::PostTick,
            inputs.clone(),
            wing_toggle_count,
            toggle_count.clone(),
        );
        builder.map_many(
            ExecuteOn::PostTick,
            inputs,
            wing_toggle_pending_from,
            pending_from,
        );
        builder.variable_to_event_id(
            toggle_count,
            VariableToEventMapping::EventDataRaw,
            VariableToEventWriteOn::Increase,
            toggle_event_id,
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_events_switch_the_push_button_on_with_any_data_but_0() {
        assert_eq!(set_event_value(0), 0.);
        assert_eq!(set_event_value(1), 1.);
        assert_eq!(set_event_value(16384), 1.);
    }

    #[test]
    fn toggle_events_switch_the_push_button_to_its_other_position() {
        assert_eq!(toggled(0.), 1.);
        assert_eq!(toggled(1.), 0.);
    }

    /// [SYSTEM_ON, HAS_FAULT, STRUCTURAL DEICE SWITCH, toggle count, pending from]
    fn wing(system_on: f64, switch_on: f64, count: f64, pending_from: f64) -> [f64; 5] {
        [system_on, 0., switch_on, count, pending_from]
    }

    #[test]
    fn one_structural_deice_toggle_is_transmitted_per_disagreement() {
        // The wing anti-ice comes on: one toggle, pending from the OFF position
        let values = wing(1., 0., 0., -1.);
        assert_eq!(wing_toggle_count(&values), 1.);
        assert_eq!(wing_toggle_pending_from(&values), 0.);

        // The sim has not applied it yet: no second toggle
        let values = wing(1., 0., 1., 0.);
        assert_eq!(wing_toggle_count(&values), 1.);
        assert_eq!(wing_toggle_pending_from(&values), 0.);

        // Applied: agreement, nothing pending
        let values = wing(1., 1., 1., 0.);
        assert_eq!(wing_toggle_count(&values), 1.);
        assert_eq!(wing_toggle_pending_from(&values), -1.);
    }

    #[test]
    fn no_structural_deice_toggle_while_the_sim_agrees() {
        assert_eq!(wing_toggle_count(&wing(0., 0., 3., -1.)), 3.);
        assert_eq!(wing_toggle_count(&wing(1., 1., 3., -1.)), 3.);
        // A faulty wing anti-ice is not on
        assert_eq!(wing_toggle_count(&[1., 1., 1., 3., -1.]), 4.);
    }
}
