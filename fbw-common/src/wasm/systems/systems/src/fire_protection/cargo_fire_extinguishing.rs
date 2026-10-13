//! Cargo compartment fire extinguishing, shared by the aircraft: one or more fire extinguisher bottles, discharged by
//! the crew into one cargo compartment.
//!
//! - A320 FCOM DSC-26-50-10 (a320_fcom.txt l.38932-38939): "One fire bottle with two discharge heads, one for each
//!   compartment [...] When the flight crew presses the FWD(AFT) DISCH pb, the action ignites the corresponding squib on
//!   the fire bottle, which then discharges the extinguisher agent into that cargo compartment. When the bottle is
//!   empty, the DISCH light comes on amber." DSC-26-50-20 DISCH LIGHT (l.39017-39019): "Within 60 s after pressing the
//!   discharge pushbutton, the amber DISCH light comes on when the associated bottle is fully discharged."
//! - A380 FCOM DSC-26-60-10 FIRE EXTINGUISHING (a380_fcom.txt l.53846-53866): "two fire extinguisher bottles that can
//!   discharge extinguisher agent in the forward or aft/bulk cargo compartment [...] A diverter valve directs
//!   extinguisher agent to either the forward or aft/bulk cargo compartment. Bottle 1 first discharges extinguisher
//!   agent in the affected cargo compartment. This takes approximately one minute. [...] Bottle 2 then slowly discharges
//!   extinguisher agent, to provide sufficient extinguisher agent concentration in the affected cargo compartment for
//!   approximately four hours."
//!
//! The bottles discharge in sequence into the compartment of the first DISCH (AGENT) pb pressed; a bottle already
//! empty cannot discharge again, so the other compartment's pb does nothing afterwards. A bottle can lose its agent
//! ([`FailureType::CargoFireBottleLowPressure`]): it is then at low pressure (the BTL FAULT cautions) and has nothing
//! left to discharge.
//!
//! What the agent does to the smoke is not modelled: the A320 procedure says "Expect the SMOKE warning to remain after
//! agent discharge, even if the smoke source is extinguished" (PRO-ABN-SMOKE FWD CARGO SMOKE, a320_fcom.txt
//! l.95130-95132), so the smoke warning stays as long as the smoke failure.

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
        // The first DISCH pb pressed while a bottle is still full sets the heads / diverter valve to its compartment
        if self.target_compartment.is_none() && self.bottles.iter().any(|bottle| bottle.is_full()) {
            self.target_compartment = self
                .discharge_pb_pressed
                .iter()
                .position(|&pressed| pressed);
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

    /// Bottle n (1-based) has lost its agent
    pub fn bottle_has_low_pressure(&self, number: usize) -> bool {
        self.bottles[number - 1].has_low_pressure()
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
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                extinguishing: CargoFireExtinguishing::new(
                    context,
                    ["FWD", "AFT"],
                    [Duration::from_secs(60), Duration::from_secs(600)],
                ),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.extinguishing.update(context);
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
}
