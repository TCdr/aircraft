//! The four engine low-pressure (LP) fuel valves of the A380 and the fuel left between each valve
//! and its engine.
//!
//! FCOM DSC-28-10 (ENGINE LP VALVES): "Each engine has a Low Pressure (LP) valve, that is used to
//! stop the flow of fuel to the engine. The ENG MASTER sw control the LP valves. The LP valves
//! automatically close, when their associated ENG FIRE pb is pushed."
//!
//! FCOM DSC-26-20-10 (ENGINE ISOLATION): when the ENG FIRE pb is pressed, the system, among other
//! actions, "Closes the low-pressure fuel valve". FCOM DSC-70-30 (ENGINE SHUTDOWN): "The ENG FIRE
//! pb-sw provides a backup engine shutdown capability on ground and in flight." FCOM PRO-ABN-ECAM
//! ENG 1(2)(3)(4) HP FUEL VLV FAULT: "The engine will shutdown by closure of the LP fuel valve."
//!
//! The valve and the fuel it leaves downstream are simulated by the aircraft-independent
//! `systems::fuel::engine_lp_valve::EngineLpFuelValve`; this module gives it the A380 values.
//! Once that fuel is burned the engine is starved: the systems WASM closes the MSFS engine feed
//! valve 60..63 of that engine (so MSFS stops the combustion) and the FADEC handles the engine as one
//! without fuel (it shuts down and cannot relight while starved).
//!
//! Not simulated: the two valve motors and their electrical supplies (DSC-28-10: "For redundancy,
//! each LP valve has two motors with different electrical supplies"), the LP valve failures.

use std::time::Duration;
use systems::{
    fuel::{engine_lp_valve::EngineLpFuelValve, FUEL_GALLONS_TO_KG},
    shared::EngineFirePushButtons,
    simulation::{InitContext, SimulationElement, SimulationElementVisitor, UpdateContext},
};
use uom::si::{f64::*, mass::kilogram};

pub(super) struct A380EngineLpFuelValves {
    valves: [EngineLpFuelValve; 4],
}
impl A380EngineLpFuelValves {
    /// The A380 FCOM gives no LP valve travel time. The valves travel in the same 3 s as the MSFS
    /// engine LP valves Valve.1..4 of flight_model.cfg (OpeningTime:3), which the ENG MASTER
    /// switches drive.
    const TRAVEL_TIME: Duration = Duration::from_secs(3);

    /// The fuel left between an LP valve and its engine, burned by the engine after the valve has
    /// closed. The A380 FCOM gives neither this quantity nor a time delay between the LP valve
    /// closure and the engine shutdown (unlike the A320 FCOM "UP TO 2 MIN 30 S", which is not an
    /// A380 value). It is the 1 gallon of the "Extra" tank that the FBW fuel model of
    /// flight_model.cfg places between each engine LP valve and its engine (Tank.12..15 Extra1..4,
    /// Capacity:1), i.e. 3.04 kg.
    ///
    /// With the FADEC idle fuel flow model (EngineControl_A380X::generateIdleParameters, ISA,
    /// Mach 0) the engine starves, after the 3 s of valve travel:
    /// - at sea level, idle fuel flow 782.8 kg/h: 14.0 s later
    /// - at 14 100 ft, idle fuel flow 520.2 kg/h: 21.0 s later
    /// - at a higher fuel flow sooner, e.g. 1.0 s later at 11 000 kg/h.
    const FUEL_DOWNSTREAM_LP_VALVE_GALLONS: f64 = 1.;

    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            valves: [1, 2, 3, 4].map(|engine_number| {
                EngineLpFuelValve::new(
                    context,
                    engine_number,
                    Self::TRAVEL_TIME,
                    Self::fuel_downstream_capacity(),
                )
            }),
        }
    }

    fn fuel_downstream_capacity() -> Mass {
        Mass::new::<kilogram>(Self::FUEL_DOWNSTREAM_LP_VALVE_GALLONS * FUEL_GALLONS_TO_KG)
    }

    pub(super) fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
    ) {
        for valve in &mut self.valves {
            valve.update(context, engine_fire_push_buttons);
        }
    }

    /// The LP valve of the engine (1 to 4) is closed and the fuel between it and the engine is
    /// burned.
    pub(super) fn engine_is_starved(&self, engine_number: usize) -> bool {
        self.valves[engine_number - 1].engine_is_starved()
    }
}
impl SimulationElement for A380EngineLpFuelValves {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for valve in &mut self.valves {
            valve.accept(visitor);
        }

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::{
        engine::EngineFireOverheadPanel,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };

    /// Ground idle fuel flow of the A380X FADEC at sea level, ISA.
    const SEA_LEVEL_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR: f64 = 782.8;
    /// Ground idle fuel flow of the A380X FADEC at 14 100 ft, ISA.
    const HIGH_AIRFIELD_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR: f64 = 520.2;

    struct TestAircraft {
        engine_fire_overhead: EngineFireOverheadPanel<4>,
        lp_valves: A380EngineLpFuelValves,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_fire_overhead: EngineFireOverheadPanel::new(context),
                lp_valves: A380EngineLpFuelValves::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.lp_valves.update(context, &self.engine_fire_overhead);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.engine_fire_overhead.accept(visitor);
            self.lp_valves.accept(visitor);

            visitor.visit(self);
        }
    }

    struct LpValvesTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl LpValvesTestBed {
        /// All four engines running: masters ON, fire pushbuttons in, sea level ground idle.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            for engine_number in 1..=4 {
                test_bed = test_bed
                    .master_switch(engine_number, true)
                    .fire_push_button_released(engine_number, false)
                    .fuel_flow(engine_number, SEA_LEVEL_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR);
            }
            test_bed.run_for(Duration::from_secs(1));

            test_bed
        }

        fn master_switch(mut self, engine_number: usize, is_on: bool) -> Self {
            self.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), is_on);
            self
        }

        fn fire_push_button_released(mut self, engine_number: usize, released: bool) -> Self {
            self.write_by_name(&format!("FIRE_BUTTON_ENG{}", engine_number), released);
            self
        }

        fn fuel_flow(mut self, engine_number: usize, kg_per_hour: f64) -> Self {
            self.write_by_name(&format!("ENGINE_FF:{}", engine_number), kg_per_hour);
            self
        }

        fn run_for(&mut self, duration: Duration) {
            // 50 ms steps, as at 20 fps
            let step = Duration::from_millis(50);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.run_with_delta(step);
                elapsed += step;
            }
        }

        fn and_run_for(mut self, duration: Duration) -> Self {
            self.run_for(duration);
            self
        }

        fn lp_valve_open_percentage(&mut self, engine_number: usize) -> f64 {
            self.read_by_name(&format!(
                "FUEL_ENG_{}_LP_VALVE_OPEN_PERCENTAGE",
                engine_number
            ))
        }

        fn engine_is_starved(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FUEL_ENG_{}_STARVED", engine_number))
        }

        fn fuel_downstream_kg(&mut self, engine_number: usize) -> f64 {
            self.read_by_name(&format!(
                "FUEL_ENG_{}_FUEL_DOWNSTREAM_LP_VALVE",
                engine_number
            ))
        }

        /// Runs until the engine is starved and returns how long it took, up to the given limit.
        fn time_until_starved(&mut self, engine_number: usize, limit: Duration) -> Duration {
            let step = Duration::from_millis(50);
            let mut elapsed = Duration::ZERO;
            while elapsed < limit && !self.engine_is_starved(engine_number) {
                self.run_with_delta(step);
                elapsed += step;
            }
            elapsed
        }
    }
    impl TestBed for LpValvesTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> LpValvesTestBed {
        LpValvesTestBed::new()
    }

    #[test]
    fn lp_valves_are_open_with_masters_on_and_fire_push_buttons_in() {
        let mut test_bed = test_bed().and_run_for(Duration::from_secs(60));

        for engine_number in 1..=4 {
            assert_eq!(test_bed.lp_valve_open_percentage(engine_number), 100.);
            assert!(!test_bed.engine_is_starved(engine_number));
            assert!((test_bed.fuel_downstream_kg(engine_number) - 3.04).abs() < 0.01);
        }
    }

    #[test]
    fn eng_master_off_closes_only_its_lp_valve_in_3_s() {
        let mut test_bed = test_bed()
            .master_switch(4, false)
            .and_run_for(Duration::from_millis(2900));
        assert!(test_bed.lp_valve_open_percentage(4) > 0.);

        let mut test_bed = test_bed.and_run_for(Duration::from_millis(200));
        assert_eq!(test_bed.lp_valve_open_percentage(4), 0.);
        for engine_number in 1..=3 {
            assert_eq!(test_bed.lp_valve_open_percentage(engine_number), 100.);
        }
    }

    #[test]
    fn eng_fire_push_button_closes_only_its_lp_valve() {
        let mut test_bed = test_bed()
            .fire_push_button_released(3, true)
            .and_run_for(Duration::from_secs(3));

        assert_eq!(test_bed.lp_valve_open_percentage(3), 0.);
        for engine_number in [1, 2, 4] {
            assert_eq!(test_bed.lp_valve_open_percentage(engine_number), 100.);
        }
    }

    #[test]
    fn eng_fire_push_button_starves_the_engine_after_the_extra_tank_gallon_at_sea_level_idle() {
        let mut test_bed = test_bed().fire_push_button_released(2, true);

        let time_until_starved = test_bed.time_until_starved(2, Duration::from_secs(120));

        // 3.04 kg at 782.8 kg/h is burned in 14.0 s, after the 3 s valve travel
        assert!(
            (time_until_starved.as_secs_f64() - 17.0).abs() < 0.5,
            "Expected starvation after about 17.0 s, was {:?}",
            time_until_starved
        );
        assert_eq!(test_bed.fuel_downstream_kg(2), 0.);
        for engine_number in [1, 3, 4] {
            assert!(!test_bed.engine_is_starved(engine_number));
        }
    }

    #[test]
    fn eng_fire_push_button_starves_the_engine_later_at_a_high_airfield_idle() {
        let mut test_bed = test_bed()
            .fuel_flow(1, HIGH_AIRFIELD_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR)
            .fire_push_button_released(1, true);

        let time_until_starved = test_bed.time_until_starved(1, Duration::from_secs(120));

        // 3.04 kg at 520.2 kg/h is burned in 21.0 s, after the 3 s valve travel
        assert!(
            (time_until_starved.as_secs_f64() - 24.0).abs() < 0.5,
            "Expected starvation after about 24.0 s, was {:?}",
            time_until_starved
        );
    }

    #[test]
    fn reopening_the_lp_valve_refills_the_line_and_ends_the_starvation() {
        let mut test_bed = test_bed()
            .fire_push_button_released(1, true)
            .and_run_for(Duration::from_secs(60));
        assert!(test_bed.engine_is_starved(1));

        let mut test_bed = test_bed
            .fire_push_button_released(1, false)
            .and_run_for(Duration::from_millis(100));

        assert!(!test_bed.engine_is_starved(1));
        assert!((test_bed.fuel_downstream_kg(1) - 3.04).abs() < 0.01);
    }

    #[test]
    fn shut_down_engine_is_not_starved_by_its_closed_lp_valve() {
        let mut test_bed = test_bed()
            .fuel_flow(1, 0.)
            .master_switch(1, false)
            .and_run_for(Duration::from_secs(600));

        assert!(!test_bed.engine_is_starved(1));
    }
}
