//! Engine flameout and seizure failures of the A320 and its engine relight envelope.
//!
//! The failure logic is the aircraft-independent `systems::engine::engine_failure::EngineFailure`;
//! this module gives it the A320 relight envelope and windmilling speeds, and the A320 variables.
//! The fuel cut it computes closes the MSFS fuel valves 13/14 (see a320_systems_wasm) and the FADEC
//! reads it in place of the LP valve starvation.
//!
//! Relight envelope: the A320neo chart of [QRH] ENG RELIGHT IN FLIGHT (FCOM 21 JAN 19, PRO-ABN-ENG
//! P 1/368, PDF page 4761 of "A320 Neo FCOM_1.pdf", applicable to MSN 06720-09063, A320neo with
//! PW1100G-JM engines). FBW models the LEAP-1A: no LEAP chart is available, so the neo (PW) chart is
//! used. The values were read off the chart (Zp the pressure altitude, Vc the calibrated airspeed,
//! used here as the indicated airspeed):
//! - (1) STARTER ASSISTED RELIGHT: Vc 150 to 260 kt up to 15 000 ft; above, the lowest speed rises
//!   linearly to 180 kt at 20 000 ft; from 20 000 ft to 28 000 ft, Vc 200 to 280 kt.
//! - (3) STABILIZED WINDMILL RELIGHT, "N2 > 8.5%": Vc 260 to 350 kt up to 20 000 ft; from 20 000 ft,
//!   Vc 280 to 350 kt up to 26 000 ft, the ceiling falling linearly from 26 000 ft at 340 kt to
//!   24 000 ft at 350 kt.
//! - (2) WINDMILL QUICK RELIGHT, "T < 20 s, N2 > 15%": Vc 230 to 260 kt up to 13 000 ft.
//!
//! How each zone lights up the engine (FCOM):
//! - PDF page 4762 (a320_fcom.txt l.78284 for the CFM56): "If outside the windmilling start
//!   envelope, the FADEC will open the starter valve", and the note "For an in-flight restart, the
//!   FADEC decides whether the rotor speed is sufficient to perform a windmill relight or needs
//!   assistance from the starter": with the ENG MODE selector at IGN (the in-flight start of the
//!   QRH) the engine lights up in zone 3 by windmilling, and in zone 1 with starter air.
//! - DSC-70-80-30 WINDMILLING QUICK RELIGHT (PDF page 3267, a320_fcom.txt l.63538-63541): "In case
//!   of inadvertent engine shutdown by cycling the Engine Master lever to OFF then ON, in the
//!   windmilling quick relight envelope, the FADEC will attempt automatically a relight regardless of
//!   the rotary selector position": zone 2, with the master OFF for less than 20 s (design choice:
//!   T is how long the master stayed OFF) and N2 above 15 %, at any ENG MODE selector position.
//! - On the ground (FCOM ENG 1(2) FAIL, l.79815: "If no damage, a new start sequence may be
//!   initiated") a failed engine starts again as a normal start, with starter air.

use std::time::Duration;
use systems::{
    engine::engine_failure::{
        EngineFailure, EngineFailureInputs, EngineRelightEnvelope, RelightConditions,
    },
    pneumatic::{EngineModeSelector, EngineState},
    simulation::{
        InitContext, Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        UpdateContext, VariableIdentifier,
    },
};
use uom::si::{
    f64::{Length, Ratio, Velocity},
    length::foot,
    ratio::percent,
    velocity::knot,
};

use crate::fuel::A320Fuel;

pub struct A320RelightEnvelope;
impl A320RelightEnvelope {
    /// Zone 1, starter assisted relight
    const STARTER_ASSISTED_MIN_CAS_KNOTS: f64 = 150.;
    const STARTER_ASSISTED_MIN_CAS_SLOPE_START_FEET: f64 = 15_000.;
    const STARTER_ASSISTED_MIN_CAS_AT_20000_FEET_KNOTS: f64 = 180.;
    const HIGH_REGION_FLOOR_FEET: f64 = 20_000.;
    const HIGH_STARTER_ASSISTED_MIN_CAS_KNOTS: f64 = 200.;
    const HIGH_STARTER_ASSISTED_MAX_CAS_KNOTS: f64 = 280.;
    const STARTER_ASSISTED_CEILING_FEET: f64 = 28_000.;
    /// Zone 3, stabilized windmill relight
    const WINDMILL_MIN_CAS_KNOTS: f64 = 260.;
    const HIGH_WINDMILL_MIN_CAS_KNOTS: f64 = 280.;
    const MAX_CAS_KNOTS: f64 = 350.;
    const WINDMILL_CEILING_FEET: f64 = 26_000.;
    const WINDMILL_CEILING_SLOPE_START_CAS_KNOTS: f64 = 340.;
    const WINDMILL_CEILING_AT_MAX_CAS_FEET: f64 = 24_000.;
    /// Zone 2, windmill quick relight "T < 20 s, N2 > 15%"
    const QUICK_RELIGHT_MIN_CAS_KNOTS: f64 = 230.;
    const QUICK_RELIGHT_CEILING_FEET: f64 = 13_000.;
    const QUICK_RELIGHT_MAX_MASTER_OFF: Duration = Duration::from_secs(20);
    const QUICK_RELIGHT_MIN_N2_PERCENT: f64 = 15.;

    /// The windmill N2. The chart marks zone 3 "STABILIZED WINDMILL RELIGHT N2 > 8.5%", from 260 kt
    /// up to 20 000 ft. Design choice: the windmill N2 is proportional to the airspeed and is 8.5 %
    /// at 260 kt, at any altitude (9.8 % at 300 kt). The CFM56 FCOM gives 12 % at 300 kt (a320_fcom.txt
    /// l.107842-107843: "above 300 kt (corresponding N2 above 12 %)"): a CFM56 value, not used.
    const WINDMILL_N2_PERCENT_AT_260_KNOTS: f64 = 8.5;
    /// Design choice, no FCOM value: the fan windmills at 1.5 times the core speed.
    const WINDMILL_N1_TO_N2_RATIO: f64 = 1.5;

    fn is_in_starter_assisted_zone(cas_knots: f64, altitude_feet: f64) -> bool {
        if altitude_feet <= Self::HIGH_REGION_FLOOR_FEET {
            let min_cas_knots = if altitude_feet <= Self::STARTER_ASSISTED_MIN_CAS_SLOPE_START_FEET
            {
                Self::STARTER_ASSISTED_MIN_CAS_KNOTS
            } else {
                Self::STARTER_ASSISTED_MIN_CAS_KNOTS
                    + (Self::STARTER_ASSISTED_MIN_CAS_AT_20000_FEET_KNOTS
                        - Self::STARTER_ASSISTED_MIN_CAS_KNOTS)
                        * (altitude_feet - Self::STARTER_ASSISTED_MIN_CAS_SLOPE_START_FEET)
                        / (Self::HIGH_REGION_FLOOR_FEET
                            - Self::STARTER_ASSISTED_MIN_CAS_SLOPE_START_FEET)
            };
            (min_cas_knots..Self::WINDMILL_MIN_CAS_KNOTS).contains(&cas_knots)
        } else {
            altitude_feet <= Self::STARTER_ASSISTED_CEILING_FEET
                && (Self::HIGH_STARTER_ASSISTED_MIN_CAS_KNOTS
                    ..=Self::HIGH_STARTER_ASSISTED_MAX_CAS_KNOTS)
                    .contains(&cas_knots)
        }
    }

    fn is_in_stabilized_windmill_zone(cas_knots: f64, altitude_feet: f64) -> bool {
        if cas_knots > Self::MAX_CAS_KNOTS {
            false
        } else if altitude_feet <= Self::HIGH_REGION_FLOOR_FEET {
            cas_knots >= Self::WINDMILL_MIN_CAS_KNOTS
        } else {
            let ceiling_feet = if cas_knots <= Self::WINDMILL_CEILING_SLOPE_START_CAS_KNOTS {
                Self::WINDMILL_CEILING_FEET
            } else {
                Self::WINDMILL_CEILING_FEET
                    - (Self::WINDMILL_CEILING_FEET - Self::WINDMILL_CEILING_AT_MAX_CAS_FEET)
                        * (cas_knots - Self::WINDMILL_CEILING_SLOPE_START_CAS_KNOTS)
                        / (Self::MAX_CAS_KNOTS - Self::WINDMILL_CEILING_SLOPE_START_CAS_KNOTS)
            };
            cas_knots > Self::HIGH_WINDMILL_MIN_CAS_KNOTS && altitude_feet <= ceiling_feet
        }
    }

    fn is_in_quick_relight_zone(cas_knots: f64, altitude_feet: f64) -> bool {
        altitude_feet <= Self::QUICK_RELIGHT_CEILING_FEET
            && (Self::QUICK_RELIGHT_MIN_CAS_KNOTS..Self::WINDMILL_MIN_CAS_KNOTS)
                .contains(&cas_knots)
    }
}
impl EngineRelightEnvelope for A320RelightEnvelope {
    fn engine_lights_up(&self, conditions: &RelightConditions) -> bool {
        if conditions.on_ground {
            return conditions.starter_air_pressurized;
        }

        let cas_knots = conditions.indicated_airspeed.get::<knot>();
        let altitude_feet = conditions.pressure_altitude.get::<foot>();
        let quick_relight = Self::is_in_quick_relight_zone(cas_knots, altitude_feet)
            && conditions.master_off_duration < Self::QUICK_RELIGHT_MAX_MASTER_OFF
            && conditions.core_speed.get::<percent>() > Self::QUICK_RELIGHT_MIN_N2_PERCENT;

        if conditions.ignition_selected {
            Self::is_in_stabilized_windmill_zone(cas_knots, altitude_feet)
                || (Self::is_in_starter_assisted_zone(cas_knots, altitude_feet)
                    && conditions.starter_air_pressurized)
                || quick_relight
        } else {
            quick_relight
        }
    }

    fn windmill_n1(&self, indicated_airspeed: Velocity, pressure_altitude: Length) -> Ratio {
        self.windmill_n2(indicated_airspeed, pressure_altitude) * Self::WINDMILL_N1_TO_N2_RATIO
    }

    fn windmill_n2(&self, indicated_airspeed: Velocity, _: Length) -> Ratio {
        Ratio::new::<percent>(
            Self::WINDMILL_N2_PERCENT_AT_260_KNOTS * indicated_airspeed.get::<knot>().max(0.)
                / Self::WINDMILL_MIN_CAS_KNOTS,
        )
    }
}

/// The engine failures of one A320 engine and the variables they read.
struct A320EngineFailure {
    engine_number: usize,
    failure: EngineFailure,

    master_switch_id: VariableIdentifier,
    ignition_selector_id: VariableIdentifier,
    starter_pressurized_id: VariableIdentifier,
    engine_state_id: VariableIdentifier,
    n2_id: VariableIdentifier,

    master_switch_is_on: bool,
    ignition_selector: EngineModeSelector,
    starter_air_pressurized: bool,
    engine_state: EngineState,
    n2: Ratio,
}
impl A320EngineFailure {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            engine_number,
            failure: EngineFailure::new(context, engine_number),
            master_switch_id: context
                .get_identifier(format!("FUELSYSTEM VALVE SWITCH:{}", engine_number)),
            // The ENG MODE selector sets the ignition switch of both engines.
            ignition_selector_id: context
                .get_identifier(format!("TURB ENG IGNITION SWITCH EX1:{}", engine_number)),
            starter_pressurized_id: context
                .get_identifier(format!("PNEU_ENG_{}_STARTER_PRESSURIZED", engine_number)),
            engine_state_id: context.get_identifier(format!("ENGINE_STATE:{}", engine_number)),
            n2_id: context.get_identifier(format!("ENGINE_N2:{}", engine_number)),
            master_switch_is_on: false,
            ignition_selector: EngineModeSelector::Norm,
            starter_air_pressurized: false,
            engine_state: EngineState::Off,
            n2: Ratio::default(),
        }
    }

    fn update(&mut self, context: &UpdateContext, fuel: &A320Fuel) {
        self.failure.update(
            context,
            &A320RelightEnvelope,
            EngineFailureInputs {
                master_switch_is_on: self.master_switch_is_on,
                ignition_selected: self.ignition_selector == EngineModeSelector::Ignition,
                starter_air_pressurized: self.starter_air_pressurized,
                engine_is_running: self.engine_state == EngineState::On,
                core_speed: self.n2,
                lp_valve_starved: fuel.engine_is_starved(self.engine_number),
            },
        );
    }
}
impl SimulationElement for A320EngineFailure {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.master_switch_is_on = reader.read(&self.master_switch_id);
        self.ignition_selector = reader.read_discrete_or_fallback(
            &self.ignition_selector_id,
            "EngineModeSelector",
            EngineModeSelector::Norm,
        );
        self.starter_air_pressurized = reader.read(&self.starter_pressurized_id);
        self.engine_state = reader.read_discrete_or_fallback(
            &self.engine_state_id,
            "EngineState",
            EngineState::Off,
        );
        self.n2 = Ratio::new::<percent>(reader.read(&self.n2_id));
    }
}

/// The engine flameout and seizure failures of both engines.
pub struct A320EngineFailures {
    engines: [A320EngineFailure; 2],
}
impl A320EngineFailures {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2].map(|number| A320EngineFailure::new(context, number)),
        }
    }

    /// After the fuel system, whose LP valve starvation also cuts the fuel.
    pub fn update(&mut self, context: &UpdateContext, fuel: &A320Fuel) {
        for engine in &mut self.engines {
            engine.update(context, fuel);
        }
    }
}
impl SimulationElement for A320EngineFailures {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conditions(cas_knots: f64, altitude_feet: f64) -> RelightConditions {
        RelightConditions {
            on_ground: false,
            indicated_airspeed: Velocity::new::<knot>(cas_knots),
            pressure_altitude: Length::new::<foot>(altitude_feet),
            ignition_selected: true,
            starter_air_pressurized: false,
            core_speed: Ratio::new::<percent>(8.),
            master_off_duration: Duration::from_secs(60),
        }
    }

    fn lights_up(conditions: RelightConditions) -> bool {
        A320RelightEnvelope.engine_lights_up(&conditions)
    }

    fn with_starter_air(mut conditions: RelightConditions) -> RelightConditions {
        conditions.starter_air_pressurized = true;
        conditions
    }

    fn with_starter_air_lights_up(cas_knots: f64, altitude_feet: f64) -> bool {
        lights_up(with_starter_air(conditions(cas_knots, altitude_feet)))
    }

    #[test]
    fn stabilized_windmill_relight_in_zone_3() {
        assert!(lights_up(conditions(260., 0.)));
        assert!(lights_up(conditions(300., 20_000.)));
        assert!(lights_up(conditions(285., 26_000.)));
        assert!(lights_up(conditions(350., 24_000.)));
    }

    #[test]
    fn no_windmill_relight_outside_zone_3() {
        assert!(!lights_up(conditions(255., 10_000.)));
        // from 20 000 ft the zone starts above 280 kt
        assert!(!lights_up(conditions(275., 22_000.)));
        // above the ceiling: 26 000 ft, falling from 340 kt to 24 000 ft at 350 kt
        assert!(!lights_up(conditions(300., 27_000.)));
        assert!(!lights_up(conditions(350., 25_000.)));
        assert!(lights_up(conditions(345., 24_900.)));
        // above 350 kt, and at cruise
        assert!(!lights_up(conditions(360., 10_000.)));
        assert!(!lights_up(conditions(270., 35_000.)));
    }

    #[test]
    fn starter_assisted_relight_in_zone_1_with_starter_air() {
        assert!(with_starter_air_lights_up(150., 5_000.));
        assert!(with_starter_air_lights_up(250., 15_000.));
        // the lowest speed rises from 150 kt at 15 000 ft to 180 kt at 20 000 ft
        assert!(with_starter_air_lights_up(170., 18_000.));
        assert!(!with_starter_air_lights_up(160., 18_000.));
        // 200 to 280 kt from 20 000 ft to 28 000 ft
        assert!(with_starter_air_lights_up(200., 27_500.));
        assert!(with_starter_air_lights_up(280., 21_000.));
        assert!(!lights_up(conditions(210., 10_000.)));
    }

    #[test]
    fn no_starter_assisted_relight_outside_zone_1() {
        assert!(!with_starter_air_lights_up(145., 5_000.));
        assert!(!with_starter_air_lights_up(190., 22_000.));
        assert!(!with_starter_air_lights_up(250., 29_000.));
    }

    #[test]
    fn windmill_quick_relight_in_zone_2_within_20_s_above_15_percent_n2_at_any_selector_position() {
        let mut quick = conditions(240., 10_000.);
        quick.ignition_selected = false;
        quick.core_speed = Ratio::new::<percent>(30.);
        quick.master_off_duration = Duration::from_secs(5);
        assert!(lights_up(quick));

        let mut slow_cycle = quick;
        slow_cycle.master_off_duration = Duration::from_secs(25);
        assert!(!lights_up(slow_cycle));

        let mut low_n2 = quick;
        low_n2.core_speed = Ratio::new::<percent>(14.);
        assert!(!lights_up(low_n2));

        // below 230 kt and above 13 000 ft there is no quick relight
        let mut slow = quick;
        slow.indicated_airspeed = Velocity::new::<knot>(220.);
        assert!(!lights_up(slow));
        let mut high = quick;
        high.pressure_altitude = Length::new::<foot>(14_000.);
        assert!(!lights_up(high));
    }

    #[test]
    fn without_ignition_only_the_quick_relight_lights_up() {
        let mut windmill = conditions(320., 10_000.);
        windmill.ignition_selected = false;
        assert!(!lights_up(windmill));
        assert!(!lights_up(with_starter_air(windmill)));
    }

    #[test]
    fn on_the_ground_a_start_needs_starter_air() {
        let mut ground = conditions(0., 0.);
        ground.on_ground = true;
        assert!(!lights_up(ground));
        assert!(lights_up(with_starter_air(ground)));
    }

    mod aircraft {
        use super::super::*;
        use systems::{
            engine::EngineFireOverheadPanel,
            failures::FailureType,
            simulation::{
                test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
                Aircraft,
            },
        };

        struct TestAircraft {
            engine_fire_overhead: EngineFireOverheadPanel<2>,
            fuel: A320Fuel,
            engine_failures: A320EngineFailures,
        }
        impl TestAircraft {
            fn new(context: &mut InitContext) -> Self {
                Self {
                    engine_fire_overhead: EngineFireOverheadPanel::new(context),
                    fuel: A320Fuel::new(context),
                    engine_failures: A320EngineFailures::new(context),
                }
            }
        }
        impl Aircraft for TestAircraft {
            fn update_after_power_distribution(&mut self, context: &UpdateContext) {
                self.fuel.update(context, &self.engine_fire_overhead);
                self.engine_failures.update(context, &self.fuel);
            }
        }
        impl SimulationElement for TestAircraft {
            fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
                self.engine_fire_overhead.accept(visitor);
                self.fuel.accept(visitor);
                self.engine_failures.accept(visitor);
                visitor.visit(self);
            }
        }

        fn run(test_bed: &mut SimulationTestBed<TestAircraft>) {
            test_bed.run_with_delta(Duration::from_millis(50));
        }

        /// In flight at 300 kt and FL 100, both engines running.
        fn flying_test_bed() -> SimulationTestBed<TestAircraft> {
            let mut test_bed = SimulationTestBed::new(TestAircraft::new);
            test_bed.set_on_ground(false);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(300.));
            test_bed.set_pressure_altitude(Length::new::<foot>(10_000.));
            for engine_number in 1..=2 {
                test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
                test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), 1.);
                test_bed.write_by_name(&format!("ENGINE_N2:{}", engine_number), 80.);
            }
            run(&mut test_bed);
            test_bed
        }

        fn fuel_is_cut(
            test_bed: &mut SimulationTestBed<TestAircraft>,
            engine_number: usize,
        ) -> bool {
            test_bed.read_by_name(&format!("ENGINE_{}_FUEL_CUT", engine_number))
        }

        #[test]
        fn the_flameout_of_engine_2_cuts_its_fuel_only() {
            let mut test_bed = flying_test_bed();
            test_bed.fail(FailureType::EngineFlameout(2));
            run(&mut test_bed);

            assert!(!fuel_is_cut(&mut test_bed, 1));
            assert!(fuel_is_cut(&mut test_bed, 2));
        }

        #[test]
        fn engine_1_relights_with_ign_and_the_master_off_then_on_in_the_windmill_zone() {
            let mut test_bed = flying_test_bed();
            test_bed.fail(FailureType::EngineFlameout(1));
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:1", 4.);
            test_bed.write_by_name("ENGINE_N2:1", 12.);
            test_bed.write_by_name("TURB ENG IGNITION SWITCH EX1:1", 2.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", false);
            run(&mut test_bed);
            assert!(fuel_is_cut(&mut test_bed, 1));

            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", true);
            run(&mut test_bed);
            assert!(!fuel_is_cut(&mut test_bed, 1));
        }

        #[test]
        fn a_starter_assisted_relight_reads_the_starter_air_of_its_engine() {
            let mut test_bed = flying_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
            test_bed.fail(FailureType::EngineFlameout(1));
            run(&mut test_bed);
            test_bed.write_by_name("ENGINE_STATE:1", 4.);
            test_bed.write_by_name("ENGINE_N2:1", 8.);
            test_bed.write_by_name("TURB ENG IGNITION SWITCH EX1:1", 2.);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", false);
            run(&mut test_bed);
            test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", true);
            run(&mut test_bed);
            assert!(fuel_is_cut(&mut test_bed, 1));

            test_bed.write_by_name("PNEU_ENG_1_STARTER_PRESSURIZED", true);
            run(&mut test_bed);
            assert!(!fuel_is_cut(&mut test_bed, 1));
        }

        #[test]
        fn the_lp_valve_starvation_still_cuts_the_fuel() {
            let mut test_bed = flying_test_bed();
            test_bed.write_by_name("FIRE_BUTTON_ENG1", true);
            test_bed.write_by_name("ENGINE_FF:1", 3_000.);
            for _ in 0..400 {
                run(&mut test_bed);
            }

            assert!(fuel_is_cut(&mut test_bed, 1));
        }
    }

    fn windmill_n2_percent(cas_knots: f64, altitude_feet: f64) -> f64 {
        A320RelightEnvelope
            .windmill_n2(
                Velocity::new::<knot>(cas_knots),
                Length::new::<foot>(altitude_feet),
            )
            .get::<percent>()
    }

    #[test]
    fn the_windmill_n2_is_8_5_percent_at_260_knots() {
        // the chart: zone 3 from 260 kt, "STABILIZED WINDMILL RELIGHT N2 > 8.5%"
        assert!((windmill_n2_percent(260., 10_000.) - 8.5).abs() < 1e-9);
        // proportional to the airspeed, at any altitude
        assert!((windmill_n2_percent(130., 0.) - 4.25).abs() < 1e-9);
        assert!((windmill_n2_percent(300., 35_000.) - windmill_n2_percent(300., 0.)).abs() < 1e-9);
    }

    #[test]
    fn the_windmill_n1_is_one_and_a_half_times_the_windmill_n2() {
        let n1 =
            A320RelightEnvelope.windmill_n1(Velocity::new::<knot>(260.), Length::new::<foot>(0.));
        assert!((n1.get::<percent>() - 12.75).abs() < 1e-9);
    }
}
