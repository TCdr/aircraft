//! APU fuel feed of the A320: the fuel pressure that the APU fuel pressure switch of the ECB senses.
//!
//! The left fuel feed line supplies the APU. The tank pumps normally give the required pressure; without it (batteries
//! only or pumps off) the APU FUEL PUMP starts automatically, and it runs whenever no fuel tank pump runs. The ECB
//! controls the fuel flow, and the APU FIRE pb shuts off the APU fuel pump.
//!
//! The APU has fuel pressure while a left wing tank pump runs and is powered, or while the APU fuel pump runs (powered
//! by the AC ESS SHED bus or the static inverter, electrical/alternating_current.rs). With neither, the ECB sees no
//! pressure and shuts the APU down (FUEL LO PR on the APU page, APU AUTO SHUT DOWN).
//!
//! Design choices (no published value): the ECB asks for the APU fuel pump while the MASTER SW is ON or the APU still
//! turns
//! (cooldown and run down after MASTER SW OFF); the line keeps its pressure for PRESSURE_DECAY_TIME after its last
//! source stopped, so that a transfer between electrical sources does not stop the APU.

use std::time::Duration;
use systems::{
    shared::DelayedTrueLogicGate,
    simulation::{
        InitContext, Read, SimulationElement, SimulatorReader, UpdateContext, VariableIdentifier,
    },
};

pub struct ApuFuelFeed {
    master_switch_id: VariableIdentifier,
    fire_button_released_id: VariableIdentifier,
    apu_n_id: VariableIdentifier,

    master_switch_is_on: bool,
    fire_button_is_released: bool,
    apu_is_turning: bool,

    apu_fuel_pump_runs: bool,
    pressure_lost: DelayedTrueLogicGate,
}
impl ApuFuelFeed {
    const PRESSURE_DECAY_TIME: Duration = Duration::from_secs(1);

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            master_switch_id: context.get_identifier("OVHD_APU_MASTER_SW_PB_IS_ON".to_owned()),
            fire_button_released_id: context.get_identifier("FIRE_BUTTON_APU".to_owned()),
            apu_n_id: context.get_identifier("APU_N_RAW".to_owned()),
            master_switch_is_on: false,
            fire_button_is_released: false,
            apu_is_turning: false,
            apu_fuel_pump_runs: false,
            pressure_lost: DelayedTrueLogicGate::new(Self::PRESSURE_DECAY_TIME),
        }
    }

    /// `left_tank_pump_delivers`: a left wing tank pump runs and is powered.
    /// `apu_fuel_pump_is_powered`: the supply of the APU fuel pump is powered.
    pub fn update(
        &mut self,
        context: &UpdateContext,
        left_tank_pump_delivers: bool,
        apu_fuel_pump_is_powered: bool,
    ) {
        let ecb_asks_for_fuel =
            (self.master_switch_is_on || self.apu_is_turning) && !self.fire_button_is_released;
        self.apu_fuel_pump_runs =
            ecb_asks_for_fuel && !left_tank_pump_delivers && apu_fuel_pump_is_powered;

        let a_pump_delivers = left_tank_pump_delivers || self.apu_fuel_pump_runs;
        self.pressure_lost.update(context, !a_pump_delivers);
    }

    /// The APU fuel pump runs: no left tank pump delivers and the ECB asks for fuel.
    #[cfg(test)]
    pub fn apu_fuel_pump_runs(&self) -> bool {
        self.apu_fuel_pump_runs
    }

    /// A pump pressurises the APU fuel feed line (or did so less than PRESSURE_DECAY_TIME ago).
    pub fn has_pressure(&self) -> bool {
        !self.pressure_lost.output()
    }
}
impl SimulationElement for ApuFuelFeed {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.master_switch_is_on = reader.read(&self.master_switch_id);
        self.fire_button_is_released = reader.read(&self.fire_button_released_id);
        let apu_n: f64 = reader.read(&self.apu_n_id);
        self.apu_is_turning = apu_n > 0.;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElementVisitor,
    };

    struct TestAircraft {
        feed: ApuFuelFeed,
        left_tank_pump_delivers: bool,
        apu_fuel_pump_is_powered: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                feed: ApuFuelFeed::new(context),
                left_tank_pump_delivers: false,
                apu_fuel_pump_is_powered: true,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.feed.update(
                context,
                self.left_tank_pump_delivers,
                self.apu_fuel_pump_is_powered,
            );
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.feed.accept(visitor);
            visitor.visit(self);
        }
    }

    struct ApuFuelFeedTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl ApuFuelFeedTestBed {
        /// APU MASTER SW OFF, APU stopped, no left tank pump, the APU fuel pump supply powered
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.run_for(Duration::from_secs(1));
            test_bed
        }

        fn master_switch(&mut self, on: bool) {
            self.write_by_name("OVHD_APU_MASTER_SW_PB_IS_ON", on);
        }

        fn apu_n(&mut self, n: f64) {
            self.write_by_name("APU_N_RAW", n);
        }

        fn fire_button_released(&mut self, released: bool) {
            self.write_by_name("FIRE_BUTTON_APU", released);
        }

        fn left_tank_pump_delivers(&mut self, delivers: bool) {
            self.command(|a| a.left_tank_pump_delivers = delivers);
        }

        fn apu_fuel_pump_is_powered(&mut self, powered: bool) {
            self.command(|a| a.apu_fuel_pump_is_powered = powered);
        }

        fn run_for(&mut self, duration: Duration) {
            let step = Duration::from_millis(100);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.run_with_delta(step);
                elapsed += step;
            }
        }

        fn has_pressure(&self) -> bool {
            self.query(|a| a.feed.has_pressure())
        }

        fn apu_fuel_pump_runs(&self) -> bool {
            self.query(|a| a.feed.apu_fuel_pump_runs())
        }
    }
    impl TestBed for ApuFuelFeedTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn with_the_master_switch_on_and_no_tank_pump_the_apu_fuel_pump_starts_and_gives_pressure() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        assert!(!test_bed.apu_fuel_pump_runs());

        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(2));

        assert!(test_bed.apu_fuel_pump_runs());
        assert!(test_bed.has_pressure());
    }

    #[test]
    fn a_running_left_tank_pump_gives_pressure_and_the_apu_fuel_pump_stays_off() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        test_bed.left_tank_pump_delivers(true);
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(2));

        assert!(!test_bed.apu_fuel_pump_runs());
        assert!(test_bed.has_pressure());
    }

    #[test]
    fn without_a_tank_pump_and_an_unpowered_apu_fuel_pump_the_apu_has_no_fuel_pressure() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        test_bed.apu_fuel_pump_is_powered(false);
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(2));

        assert!(!test_bed.apu_fuel_pump_runs());
        assert!(!test_bed.has_pressure());
    }

    #[test]
    fn the_apu_fuel_pump_takes_over_when_the_tank_pumps_stop_without_a_pressure_loss() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        test_bed.left_tank_pump_delivers(true);
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(2));

        test_bed.left_tank_pump_delivers(false);
        for _ in 0..30 {
            test_bed.run_for(Duration::from_millis(100));
            assert!(test_bed.has_pressure());
        }
        assert!(test_bed.apu_fuel_pump_runs());
    }

    #[test]
    fn the_apu_fuel_pump_runs_on_after_the_master_switch_off_while_the_apu_turns() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        test_bed.master_switch(true);
        test_bed.apu_n(100.);
        test_bed.run_for(Duration::from_secs(2));

        test_bed.master_switch(false);
        test_bed.run_for(Duration::from_secs(5));
        assert!(test_bed.apu_fuel_pump_runs());
        assert!(test_bed.has_pressure());

        test_bed.apu_n(0.);
        test_bed.run_for(Duration::from_secs(2));
        assert!(!test_bed.apu_fuel_pump_runs());
        assert!(!test_bed.has_pressure());
    }

    #[test]
    fn the_apu_fire_pushbutton_shuts_off_the_apu_fuel_pump() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(2));

        test_bed.fire_button_released(true);
        test_bed.run_for(Duration::from_secs(2));

        assert!(!test_bed.apu_fuel_pump_runs());
        assert!(!test_bed.has_pressure());
    }

    #[test]
    fn a_short_supply_interruption_of_the_apu_fuel_pump_keeps_the_pressure() {
        let mut test_bed = ApuFuelFeedTestBed::new();
        test_bed.master_switch(true);
        test_bed.run_for(Duration::from_secs(2));

        test_bed.apu_fuel_pump_is_powered(false);
        test_bed.run_for(Duration::from_millis(500));
        assert!(test_bed.has_pressure());

        test_bed.apu_fuel_pump_is_powered(true);
        test_bed.run_for(Duration::from_secs(2));
        assert!(test_bed.has_pressure());
    }
}
