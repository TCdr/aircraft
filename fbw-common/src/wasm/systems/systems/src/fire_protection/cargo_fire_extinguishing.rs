//! Cargo compartment fire extinguishing, shared by the aircraft: one or more fire extinguisher bottles, discharged by
//! the crew into one cargo compartment.
//!
//! - A320: one bottle with a discharge head for each compartment. The FWD (AFT) DISCH pb fires the squib of that head
//!   and the bottle empties into that compartment; the amber DISCH light comes on once the bottle is fully discharged,
//!   within 60 s.
//! - A380: two bottles and a diverter valve to the forward or the aft/bulk compartment. Bottle 1 discharges first, in
//!   about one minute; bottle 2 then discharges slowly, to hold the agent concentration for about four hours.
//!
//! The bottles discharge in sequence into the compartment of the first DISCH (AGENT) pb pressed; a bottle already
//! empty cannot discharge again, so the other compartment's pb does nothing afterwards. A bottle can lose its agent
//! ([`FailureType::CargoFireBottleLowPressure`]): it is then at low pressure (the BTL FAULT cautions) and has nothing
//! left to discharge.
//!
//! What the agent does to the smoke is not modelled: the crew must expect the SMOKE warning to stay after the agent
//! discharge, even with the smoke source extinguished, so the smoke warning stays as long as the smoke failure.

use std::time::Duration;

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum BottleState {
    Full,
    Discharging(Duration),
    /// Discharged by the crew
    Discharged,
    /// The agent leaked out (low pressure failure)
    Empty,
}

struct CargoFireBottle {
    discharged_id: VariableIdentifier,
    low_pressure_id: VariableIdentifier,

    discharge_duration: Duration,
    state: BottleState,
    low_pressure: Failure,
}

impl CargoFireBottle {
    fn new(context: &mut InitContext, number: usize, discharge_duration: Duration) -> Self {
        Self {
            discharged_id: context
                .get_identifier(format!("CARGOSMOKE_BOTTLE_{}_DISCHARGED", number)),
            low_pressure_id: context
                .get_identifier(format!("CARGOSMOKE_BOTTLE_{}_LOW_PRESSURE", number)),

            discharge_duration,
            state: BottleState::Full,
            low_pressure: Failure::new(FailureType::CargoFireBottleLowPressure(number)),
        }
    }

    fn update(&mut self, context: &UpdateContext, should_discharge: bool) {
        let elapsed = match self.state {
            BottleState::Full if self.low_pressure.is_active() => {
                self.state = BottleState::Empty;
                return;
            }
            BottleState::Full if should_discharge => context.delta(),
            BottleState::Discharging(elapsed) => elapsed + context.delta(),
            _ => return,
        };

        self.state = if elapsed >= self.discharge_duration {
            BottleState::Discharged
        } else {
            BottleState::Discharging(elapsed)
        };
    }

    fn is_full(&self) -> bool {
        self.state == BottleState::Full
    }

    /// Fully discharged by the crew (the DISCH / BTL lights)
    fn is_discharged(&self) -> bool {
        self.state == BottleState::Discharged
    }

    /// Low pressure from a loss of agent, not from a discharge (the BTL FAULT cautions)
    fn has_low_pressure(&self) -> bool {
        self.state == BottleState::Empty
    }
}

impl SimulationElement for CargoFireBottle {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.low_pressure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.discharged_id, self.is_discharged());
        writer.write(&self.low_pressure_id, self.has_low_pressure());
    }
}

/// The cargo fire extinguishing of `C` compartments with `B` bottles.
///
/// Reads the DISCH (AGENT) pb of each compartment, L:A32NX_CARGOSMOKE_<compartment>_DISCHARGED (set by the cockpit
/// behaviour XML when the pb is pressed, never reset in flight). Writes for each bottle
/// L:A32NX_CARGOSMOKE_BOTTLE_<n>_DISCHARGED and L:A32NX_CARGOSMOKE_BOTTLE_<n>_LOW_PRESSURE, and for each compartment
/// L:A32NX_CARGOSMOKE_<compartment>_AGENT_RELEASED (the bottles discharge into it).
pub struct CargoFireExtinguishing<const C: usize, const B: usize> {
    discharge_pb_id: [VariableIdentifier; C],
    agent_released_id: [VariableIdentifier; C],

    discharge_pb_pressed: [bool; C],
    bottles: [CargoFireBottle; B],
    /// The compartment the bottles discharge into, once a DISCH pb fired them
    target_compartment: Option<usize>,
}

impl<const C: usize, const B: usize> CargoFireExtinguishing<C, B> {
    /// `compartments`: the compartment names of the DISCH pb variables, e.g. ["FWD", "AFT"]; `discharge_durations`: how
    /// long each bottle takes to empty, in their discharge order
    pub fn new(
        context: &mut InitContext,
        compartments: [&str; C],
        discharge_durations: [Duration; B],
    ) -> Self {
        let mut number = 0;
        Self {
            discharge_pb_id: compartments.map(|compartment| {
                context.get_identifier(format!("CARGOSMOKE_{}_DISCHARGED", compartment))
            }),
            agent_released_id: compartments.map(|compartment| {
                context.get_identifier(format!("CARGOSMOKE_{}_AGENT_RELEASED", compartment))
            }),

            discharge_pb_pressed: [false; C],
            bottles: discharge_durations.map(|duration| {
                number += 1;
                CargoFireBottle::new(context, number, duration)
            }),
            target_compartment: None,
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.update_with_reachable_compartments(context, [true; C]);
    }

    /// Like [`Self::update`], for bottles that can fail to reach a compartment (the A380 diverter valve stuck out of a
    /// position, or the bottle control failed): the DISCH pb of a compartment the agent cannot reach fires nothing.
    pub fn update_with_reachable_compartments(
        &mut self,
        context: &UpdateContext,
        reachable: [bool; C],
    ) {
        // The first DISCH pb pressed while a bottle is still full sets the heads / diverter valve to its compartment
        if self.target_compartment.is_none() && self.bottles.iter().any(|bottle| bottle.is_full()) {
            self.target_compartment = self
                .discharge_pb_pressed
                .iter()
                .zip(reachable)
                .position(|(&pressed, reachable)| pressed && reachable);
        }

        // Each bottle starts in the update after the one before it stopped discharging (discharged, or empty from a
        // leak)
        let mut should_discharge = self.target_compartment.is_some();
        for bottle in self.bottles.iter_mut() {
            let was_done = !matches!(
                bottle.state,
                BottleState::Full | BottleState::Discharging(_)
            );
            bottle.update(context, should_discharge);
            should_discharge = should_discharge && was_done;
        }
    }

    /// Bottle n (1-based) is fully discharged
    pub fn bottle_is_discharged(&self, number: usize) -> bool {
        self.bottles[number - 1].is_discharged()
    }

    /// The bottles discharge (or discharged) into compartment `index` (0-based, in the order given to new())
    pub fn agent_released_into(&self, index: usize) -> bool {
        self.target_compartment == Some(index)
    }
}

impl<const C: usize, const B: usize> SimulationElement for CargoFireExtinguishing<C, B> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.bottles, visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        for (pressed, id) in self
            .discharge_pb_pressed
            .iter_mut()
            .zip(&self.discharge_pb_id)
        {
            *pressed = reader.read(id);
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (index, id) in self.agent_released_id.iter().enumerate() {
            writer.write(id, self.agent_released_into(index));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };

    struct TestAircraft {
        extinguishing: CargoFireExtinguishing<2, 2>,
        reachable: [bool; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                extinguishing: CargoFireExtinguishing::new(
                    context,
                    ["FWD", "AFT"],
                    [Duration::from_secs(60), Duration::from_secs(600)],
                ),
                reachable: [true; 2],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.extinguishing
                .update_with_reachable_compartments(context, self.reachable);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.extinguishing.accept(visitor);

            visitor.visit(self);
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.run();
        test_bed
    }

    fn bottle_discharged(test_bed: &mut SimulationTestBed<TestAircraft>, number: usize) -> bool {
        test_bed.read_by_name(&format!("CARGOSMOKE_BOTTLE_{}_DISCHARGED", number))
    }

    fn bottle_low_pressure(test_bed: &mut SimulationTestBed<TestAircraft>, number: usize) -> bool {
        test_bed.read_by_name(&format!("CARGOSMOKE_BOTTLE_{}_LOW_PRESSURE", number))
    }

    fn agent_released(test_bed: &mut SimulationTestBed<TestAircraft>, compartment: &str) -> bool {
        test_bed.read_by_name(&format!("CARGOSMOKE_{}_AGENT_RELEASED", compartment))
    }

    #[test]
    fn the_bottles_stay_full_without_a_discharge() {
        let mut test_bed = test_bed();
        test_bed.run_with_delta(Duration::from_secs(1_000));

        assert!(!bottle_discharged(&mut test_bed, 1));
        assert!(!bottle_discharged(&mut test_bed, 2));
        assert!(!bottle_low_pressure(&mut test_bed, 1));
        assert!(!agent_released(&mut test_bed, "FWD"));
        assert!(!agent_released(&mut test_bed, "AFT"));
    }

    #[test]
    fn the_first_bottle_is_discharged_after_its_discharge_duration() {
        let mut test_bed = test_bed();
        test_bed.write_by_name("CARGOSMOKE_FWD_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(59));

        assert!(agent_released(&mut test_bed, "FWD"));
        assert!(!bottle_discharged(&mut test_bed, 1));

        test_bed.run_with_delta(Duration::from_secs(2));

        assert!(bottle_discharged(&mut test_bed, 1));
        assert!(!bottle_discharged(&mut test_bed, 2));
    }

    #[test]
    fn the_second_bottle_discharges_after_the_first_one() {
        let mut test_bed = test_bed();
        test_bed.write_by_name("CARGOSMOKE_AFT_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(61));
        test_bed.run_with_delta(Duration::from_secs(599));

        assert!(!bottle_discharged(&mut test_bed, 2));

        test_bed.run_with_delta(Duration::from_secs(2));

        assert!(bottle_discharged(&mut test_bed, 2));
        assert!(agent_released(&mut test_bed, "AFT"));
        assert!(!agent_released(&mut test_bed, "FWD"));
    }

    #[test]
    fn the_other_compartment_gets_no_agent_once_the_bottles_are_committed() {
        let mut test_bed = test_bed();
        test_bed.write_by_name("CARGOSMOKE_FWD_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(10));
        test_bed.write_by_name("CARGOSMOKE_AFT_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(10));

        assert!(agent_released(&mut test_bed, "FWD"));
        assert!(!agent_released(&mut test_bed, "AFT"));
    }

    #[test]
    fn a_bottle_that_lost_its_agent_has_low_pressure_and_is_not_shown_discharged() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CargoFireBottleLowPressure(1));
        test_bed.run();

        assert!(bottle_low_pressure(&mut test_bed, 1));
        assert!(!bottle_low_pressure(&mut test_bed, 2));

        test_bed.write_by_name("CARGOSMOKE_FWD_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(1_000));

        assert!(!bottle_discharged(&mut test_bed, 1));
        // The second bottle still discharges
        assert!(bottle_discharged(&mut test_bed, 2));
    }

    #[test]
    fn the_disch_pb_of_a_compartment_the_agent_cannot_reach_fires_nothing() {
        let mut test_bed = test_bed();
        test_bed.command(|a| a.reachable = [false, true]);
        test_bed.write_by_name("CARGOSMOKE_FWD_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(100));

        assert!(!agent_released(&mut test_bed, "FWD"));
        assert!(!bottle_discharged(&mut test_bed, 1));

        // The bottles are still full: the other compartment's pb discharges them
        test_bed.write_by_name("CARGOSMOKE_AFT_DISCHARGED", true);
        test_bed.run_with_delta(Duration::from_secs(61));

        assert!(agent_released(&mut test_bed, "AFT"));
        assert!(bottle_discharged(&mut test_bed, 1));
    }
}
