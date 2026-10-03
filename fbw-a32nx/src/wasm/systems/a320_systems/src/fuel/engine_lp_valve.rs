//! Engine low-pressure (LP) fuel valves and the fuel left between each valve and its engine.
//!
//! FCOM DSC-28-10-30 (ENGINE LP VALVES): "The engine fuel flow can be stopped by its low pressure
//! (LP) fuel valve. The LP fuel valve is closed by either: The engine master switch, or The ENG FIRE
//! PUSH pushbutton."
//!
//! FCOM DSC-26-20-20 (ENG 1(2) FIRE PB): when the flight crew pushes it, the pushbutton is released
//! and, among other actions, "Closes the low-pressure fuel valve".
//!
//! Closing the LP valve does not stop the engine at once. FCOM PRO-ABN-ENG (ON GROUND - NON ENG
//! SHUTDOWN AFTER ENG MASTER OFF): "Using the ENG FIRE pb-sw will force the LP fuel valve to close.
//! The engine will shut down after a time delay." ... "ENGINE WILL SHUT DOWN AFTER A TIME DELAY UP
//! TO 2 MIN 30 S. The engine shuts down when the remaining fuel between the LP fuel valve and the
//! nozzles is burned. The time delay for engine shutdown depends on airport altitude and fuel
//! recirculation system operation."
//!
//! This module therefore keeps track of the fuel between each LP valve and the engine nozzles: the
//! line stays full while the valve is open and is burned at the engine fuel flow computed by the
//! FADEC once the valve is fully closed. When it is empty the engine is starved: the systems WASM
//! then closes a dedicated MSFS fuel valve in series with the engine feed (so MSFS stops the
//! combustion) and the FADEC treats the engine as having no fuel (no relight while starved).
//! The fuel recirculation system is not simulated.

use std::time::Duration;
use systems::{
    shared::EngineFirePushButtons,
    simulation::{
        InitContext, Read, SimulationElement, SimulatorReader, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use uom::si::{
    f64::*,
    mass::kilogram,
    mass_rate::kilogram_per_second,
    ratio::ratio,
    time::{hour, second},
};

pub struct EngineLpFuelValve {
    engine_number: usize,

    // ENG MASTER switch position: the A32NX master switch drives the MSFS fuel valve switch of the
    // same index (see FBW_ENGINE_Switch_Master_Template in A32NX_Interior_Misc.xml).
    master_switch_id: VariableIdentifier,
    // Engine fuel flow computed by the FADEC (A32NX_ENGINE_FF:{n}), in kg/h.
    fuel_flow_id: VariableIdentifier,

    open_percentage_id: VariableIdentifier,
    starved_id: VariableIdentifier,
    fuel_downstream_id: VariableIdentifier,

    master_switch_is_on: bool,
    engine_fuel_flow: MassRate,

    position: Ratio,
    position_is_initialised: bool,
    fuel_downstream: Mass,
}
impl EngineLpFuelValve {
    /// The FCOM gives no LP valve travel time. The valve travels in the same 1.7 s as the MSFS
    /// engine fuel valves of flight_model.cfg (Valve.1/2 OpeningTime), so the SD FUEL page keeps
    /// showing the amber transit indication as it did before.
    const TRAVEL_TIME: Duration = Duration::from_millis(1700);

    /// FCOM PRO-ABN-ENG: "ENGINE WILL SHUT DOWN AFTER A TIME DELAY UP TO 2 MIN 30 S".
    const MAX_SHUTDOWN_DELAY_SECONDS: f64 = 150.;

    /// The lowest ground idle fuel flow of the FADEC within the airfield range of the aircraft, so
    /// that the time delay never exceeds the FCOM 2 min 30 s at any airport. The FCOM gives
    /// 14 100 ft as the highest airfield the pressurization system supports (DSC-21-20-30, "high
    /// airfield operations up to a pressure of 14 100 ft").
    ///
    /// Derivation, with the FADEC idle model (EngineControl_A32NX::generateIdleParameters) at
    /// 14 100 ft, ISA (-12.9 degrees C, 594 hPa), Mach 0:
    /// - idle CN2 = 68.2 / sqrt((288.15 - 1.98 * 14.1) / 288.15) = 71.8 %
    /// - idle CN1 (Tables1502_A32NX::iCN1, Mach clamped to 0.2) = 22.19 %
    /// - corrected idle fuel flow (Polynomial_A32NX::correctedFuelFlow) = 779.5 lb/h
    /// - idle fuel flow = 779.5 lb/h * 0.4536 * delta2 (0.586) * sqrt(theta2) (0.955) = 196.6 kg/h
    ///
    /// The fuel downstream of the LP valve is then 196.6 kg/h * 150 s = 8.19 kg. At ground idle it
    /// lasts 150 s at 14 100 ft, 125 s at 8 000 ft and 99 s at sea level (ISA, idle fuel flow
    /// 298.6 kg/h): the delay depends on airport altitude, as the FCOM says. At a higher fuel flow
    /// it is burned sooner.
    const LOWEST_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR: f64 = 196.6;

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            engine_number,
            master_switch_id: context
                .get_identifier(format!("FUELSYSTEM VALVE SWITCH:{}", engine_number)),
            fuel_flow_id: context.get_identifier(format!("ENGINE_FF:{}", engine_number)),
            open_percentage_id: context.get_identifier(format!(
                "FUEL_ENG_{}_LP_VALVE_OPEN_PERCENTAGE",
                engine_number
            )),
            starved_id: context.get_identifier(format!("FUEL_ENG_{}_STARVED", engine_number)),
            fuel_downstream_id: context.get_identifier(format!(
                "FUEL_ENG_{}_FUEL_DOWNSTREAM_LP_VALVE",
                engine_number
            )),
            master_switch_is_on: false,
            engine_fuel_flow: MassRate::default(),
            position: Ratio::new::<ratio>(1.),
            position_is_initialised: false,
            fuel_downstream: Self::fuel_downstream_capacity(),
        }
    }

    /// The fuel between the LP valve and the engine nozzles when the line is full.
    fn fuel_downstream_capacity() -> Mass {
        MassRate::new::<kilogram_per_second>(
            Self::LOWEST_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR / Time::new::<hour>(1.).get::<second>(),
        ) * Time::new::<second>(Self::MAX_SHUTDOWN_DELAY_SECONDS)
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
    ) {
        // FCOM DSC-28-10-30: closed by the engine master switch or by the ENG FIRE PUSH pushbutton.
        let is_commanded_open =
            self.master_switch_is_on && !engine_fire_push_buttons.is_released(self.engine_number);
        let commanded_position = Ratio::new::<ratio>(if is_commanded_open { 1. } else { 0. });

        if self.position_is_initialised {
            self.move_towards(commanded_position, context.delta());
        } else {
            // A freshly loaded flight starts with the valve where it is commanded, without travel.
            self.position = commanded_position;
            self.position_is_initialised = true;
        }

        if self.is_fully_closed() {
            // The engine keeps burning the fuel left between the valve and its nozzles.
            let burned_fuel = self.engine_fuel_flow * context.delta_as_time();
            self.fuel_downstream = (self.fuel_downstream - burned_fuel).max(Mass::default());
        } else {
            self.fuel_downstream = Self::fuel_downstream_capacity();
        }
    }

    fn move_towards(&mut self, commanded_position: Ratio, delta: Duration) {
        let max_travel = Ratio::new::<ratio>(delta.as_secs_f64() / Self::TRAVEL_TIME.as_secs_f64());

        self.position = if commanded_position > self.position {
            (self.position + max_travel).min(commanded_position)
        } else {
            (self.position - max_travel).max(commanded_position)
        };
    }

    fn is_fully_closed(&self) -> bool {
        self.position.get::<ratio>() <= 0.
    }

    /// The LP valve is closed and the fuel between the valve and the nozzles has been burned.
    pub fn engine_is_starved(&self) -> bool {
        self.is_fully_closed() && self.fuel_downstream.get::<kilogram>() <= 0.
    }

    #[cfg(test)]
    fn fuel_downstream(&self) -> Mass {
        self.fuel_downstream
    }
}
impl SimulationElement for EngineLpFuelValve {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.master_switch_is_on = reader.read(&self.master_switch_id);

        let fuel_flow_kg_per_hour: f64 = reader.read(&self.fuel_flow_id);
        self.engine_fuel_flow = MassRate::new::<kilogram_per_second>(
            fuel_flow_kg_per_hour.max(0.) / Time::new::<hour>(1.).get::<second>(),
        );
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.open_percentage_id, self.position);
        writer.write(&self.starved_id, self.engine_is_starved());
        writer.write(
            &self.fuel_downstream_id,
            self.fuel_downstream.get::<kilogram>(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::{
        engine::EngineFireOverheadPanel,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, SimulationElementVisitor,
        },
    };

    struct TestAircraft {
        engine_fire_overhead: EngineFireOverheadPanel<2>,
        lp_valves: [EngineLpFuelValve; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_fire_overhead: EngineFireOverheadPanel::new(context),
                lp_valves: [1, 2].map(|number| EngineLpFuelValve::new(context, number)),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            for lp_valve in &mut self.lp_valves {
                lp_valve.update(context, &self.engine_fire_overhead);
            }
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.engine_fire_overhead.accept(visitor);
            for lp_valve in &mut self.lp_valves {
                lp_valve.accept(visitor);
            }

            visitor.visit(self);
        }
    }

    /// Ground idle fuel flow of the FADEC at sea level, ISA.
    const SEA_LEVEL_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR: f64 = 298.6;

    struct LpValveTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl LpValveTestBed {
        /// Both engines running: masters ON, fire pushbuttons in, ground idle fuel flow.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            for engine_number in 1..=2 {
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

        fn fuel_downstream_kg(&self, engine_number: usize) -> f64 {
            self.query(|a: &TestAircraft| a.lp_valves[engine_number - 1].fuel_downstream())
                .get::<kilogram>()
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
    impl TestBed for LpValveTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> LpValveTestBed {
        LpValveTestBed::new()
    }

    #[test]
    fn lp_valves_are_open_with_master_on_and_fire_push_button_in() {
        let mut test_bed = test_bed().and_run_for(Duration::from_secs(10));

        for engine_number in 1..=2 {
            assert_eq!(test_bed.lp_valve_open_percentage(engine_number), 100.);
            assert!(!test_bed.engine_is_starved(engine_number));
        }
    }

    #[test]
    fn master_switch_off_closes_the_lp_valve() {
        let mut test_bed = test_bed()
            .master_switch(1, false)
            .and_run_for(Duration::from_secs(2));

        assert_eq!(test_bed.lp_valve_open_percentage(1), 0.);
        assert_eq!(test_bed.lp_valve_open_percentage(2), 100.);
    }

    #[test]
    fn released_fire_push_button_closes_the_lp_valve() {
        let mut test_bed = test_bed()
            .fire_push_button_released(2, true)
            .and_run_for(Duration::from_secs(2));

        assert_eq!(test_bed.lp_valve_open_percentage(2), 0.);
        assert_eq!(test_bed.lp_valve_open_percentage(1), 100.);
    }

    #[test]
    fn lp_valve_is_in_transit_while_travelling() {
        let mut test_bed = test_bed()
            .fire_push_button_released(1, true)
            .and_run_for(Duration::from_millis(800));

        let open_percentage = test_bed.lp_valve_open_percentage(1);
        assert!(
            open_percentage > 0. && open_percentage < 100.,
            "Expected the valve in transit, open percentage: {}",
            open_percentage
        );
    }

    #[test]
    fn lp_valve_starts_where_it_is_commanded_without_travel() {
        let mut test_bed = LpValveTestBed {
            test_bed: SimulationTestBed::new(TestAircraft::new),
        }
        .master_switch(1, false)
        .master_switch(2, true);
        test_bed.run_with_delta(Duration::from_millis(50));

        assert_eq!(test_bed.lp_valve_open_percentage(1), 0.);
        assert_eq!(test_bed.lp_valve_open_percentage(2), 100.);
    }

    #[test]
    fn engine_is_not_starved_while_the_lp_valve_is_open() {
        let mut test_bed = test_bed()
            .fuel_flow(1, 5000.)
            .and_run_for(Duration::from_secs(600));

        assert!(!test_bed.engine_is_starved(1));
        assert!((test_bed.fuel_downstream_kg(1) - 8.19).abs() < 0.01);
    }

    #[test]
    fn fire_push_button_starves_the_engine_after_the_fcom_delay_at_the_lowest_idle_fuel_flow() {
        let mut test_bed = test_bed()
            .fuel_flow(
                1,
                EngineLpFuelValve::LOWEST_GROUND_IDLE_FUEL_FLOW_KG_PER_HOUR,
            )
            .fire_push_button_released(1, true);

        let time_until_starved = test_bed.time_until_starved(1, Duration::from_secs(300));

        // 150 s of burning plus the 1.7 s valve travel
        assert!(
            (time_until_starved.as_secs_f64() - 151.7).abs() < 0.5,
            "Expected starvation after about 151.7 s, was {:?}",
            time_until_starved
        );
        assert_eq!(test_bed.fuel_downstream_kg(1), 0.);
        assert!(!test_bed.engine_is_starved(2));
    }

    #[test]
    fn fire_push_button_starves_the_engine_sooner_at_sea_level_ground_idle() {
        let mut test_bed = test_bed().fire_push_button_released(1, true);

        let time_until_starved = test_bed.time_until_starved(1, Duration::from_secs(300));

        // 8.19 kg at 298.6 kg/h is burned in 98.8 s, plus the 1.7 s valve travel
        assert!(
            (time_until_starved.as_secs_f64() - 100.5).abs() < 0.5,
            "Expected starvation after about 100.5 s, was {:?}",
            time_until_starved
        );
    }

    #[test]
    fn a_higher_fuel_flow_starves_the_engine_sooner() {
        let mut test_bed = test_bed()
            .fuel_flow(1, 2500.)
            .fire_push_button_released(1, true);

        let time_until_starved = test_bed.time_until_starved(1, Duration::from_secs(300));

        // 8.19 kg at 2 500 kg/h is burned in 11.8 s, plus the 1.7 s valve travel
        assert!(
            (time_until_starved.as_secs_f64() - 13.5).abs() < 0.5,
            "Expected starvation after about 13.5 s, was {:?}",
            time_until_starved
        );
    }

    #[test]
    fn engine_without_fuel_flow_is_not_starved_by_a_closed_lp_valve() {
        let mut test_bed = test_bed()
            .fuel_flow(1, 0.)
            .master_switch(1, false)
            .and_run_for(Duration::from_secs(600));

        assert!(!test_bed.engine_is_starved(1));
    }

    #[test]
    fn reopening_the_lp_valve_refills_the_line() {
        let mut test_bed = test_bed()
            .fire_push_button_released(1, true)
            .and_run_for(Duration::from_secs(200));
        assert!(test_bed.engine_is_starved(1));

        let mut test_bed = test_bed
            .fire_push_button_released(1, false)
            .and_run_for(Duration::from_millis(100));

        assert!(!test_bed.engine_is_starved(1));
        assert!((test_bed.fuel_downstream_kg(1) - 8.19).abs() < 0.01);
    }

    #[test]
    fn starved_engine_stays_starved_while_the_fire_push_button_is_released() {
        let mut test_bed = test_bed()
            .fire_push_button_released(1, true)
            .and_run_for(Duration::from_secs(200))
            .fuel_flow(1, 0.)
            .and_run_for(Duration::from_secs(60));

        assert!(test_bed.engine_is_starved(1));
    }
}
