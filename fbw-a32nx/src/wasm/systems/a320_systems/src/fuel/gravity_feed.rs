//! Gravity feeding of the A320 engines and its ceiling.
//!
//! FCOM DSC-28-10-30 (a320_fcom.txt l.42023-42024): the suction valves of the inner tanks are
//! "Closed by pumps pressure in normal operation, they allow engines to be fed by gravity if the
//! inner tank pumps fail". The FADEC (CrossFeedBurn_A32NX.hpp) already burns the fuel of a gravity
//! fed engine from its own wing tank.
//!
//! Gravity feeding only works up to a ceiling. FCOM PRO-ABN-FUEL [QRH] GRAVITY FUEL FEEDING
//! (a320_fcom.txt l.85083-85087):
//! "MAX FL: GRAVITY FEED CEILING
//!  - FL 360 if flight time above FL 300 > 30 min.
//!  - FL 260 if flight time above FL 300 < 30 min.
//!  - Highest of FL 150 or 7 000 ft above takeoff airport if FL 300 never exceeded."
//!
//! An engine is fed by gravity when no wing tank pump pushes fuel to it: both pumps of its own wing
//! tank are off (or failed), and the fuel X FEED valve is closed or both pumps of the other wing
//! tank are off too (with the X FEED valve open the pumps of one side feed both engines, as in
//! CrossFeedBurn_A32NX.hpp).
//!
//! Above the ceiling a gravity fed engine is starved: its fuel is cut (`engine_is_starved`) and it
//! flames out. Design choice (the FCOM gives neither a time nor a partial thrust loss): the engine is
//! starved once it has been fed by gravity above the ceiling for STARVATION_DELAY (3 min), the time
//! for the crew to start the descent the procedure requires (e.g. ELEC EMER CONFIG, l.77564-77576:
//! "Engines are fed by gravity only", "Apply GRVTY FUEL FEEDING procedure"), and it stays out until
//! the crew relight procedure (A320 FCOM PRO-ABN-ENG [QRH] ENG RELIGHT IN FLIGHT): the ENG MASTER OFF ends the
//! starvation once the engine is no longer gravity fed above the ceiling, and the MASTER ON relights
//! the engine inside the relight envelope (engine_failure.rs). Restoring the pumps or descending
//! alone does not relight the engine.
//!
//! Design choices for the data the FCOM does not define: the flight levels are the pressure
//! altitude, the ISA altitude of the static pressure (as for the relight envelope,
//! engine_failure.rs); the takeoff airport elevation is the pressure altitude on the
//! ground before the takeoff (0 ft for a flight loaded in the air); the time above FL 300 and the
//! FL 300 exceedance are counted from the takeoff (they restart on every ground contact).

use std::time::Duration;
use systems::{
    shared::InternationalStandardAtmosphere,
    simulation::{
        InitContext, Read, SimulationElement, SimulatorReader, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use uom::si::length::foot;

/// Which wing tank pumps push fuel, and the X FEED valve, as read on one update.
#[derive(Clone, Copy, Debug, Default)]
pub struct WingPumpsRunning {
    /// The left wing tank pumps 1 and 2 run.
    pub left: [bool; 2],
    /// The right wing tank pumps 1 and 2 run.
    pub right: [bool; 2],
}

pub struct GravityFeed {
    x_feed_valve_open_id: VariableIdentifier,
    master_switch_ids: [VariableIdentifier; 2],
    ceiling_id: VariableIdentifier,
    starved_ids: [VariableIdentifier; 2],

    x_feed_valve_open: bool,
    master_switch_is_on: [bool; 2],

    time_above_fl300: Duration,
    fl300_exceeded: bool,
    /// Feet (pressure altitude).
    takeoff_airport_elevation_ft: f64,
    /// Feet (pressure altitude).
    ceiling_ft: f64,
    starved: [bool; 2],
    /// Each engine is fed by gravity (no wing tank pump pushes fuel to it), as of the last update.
    gravity_fed: [bool; 2],
    /// How long each engine has been fed by gravity above the ceiling without a break.
    time_gravity_fed_above_ceiling: [Duration; 2],
}
impl GravityFeed {
    /// Design choice, see the module comment.
    const STARVATION_DELAY: Duration = Duration::from_secs(3 * 60);
    /// l.85085: "FL 360 if flight time above FL 300 > 30 min."
    const LONG_FLIGHT_ABOVE_FL300_CEILING_FT: f64 = 36_000.;
    /// l.85086: "FL 260 if flight time above FL 300 < 30 min."
    const SHORT_FLIGHT_ABOVE_FL300_CEILING_FT: f64 = 26_000.;
    /// l.85087: "Highest of FL 150 or 7 000 ft above takeoff airport if FL 300 never exceeded."
    const FL300_NEVER_EXCEEDED_CEILING_FT: f64 = 15_000.;
    const ABOVE_TAKEOFF_AIRPORT_CEILING_FT: f64 = 7_000.;
    const FL300_FT: f64 = 30_000.;
    const LONG_FLIGHT_ABOVE_FL300: Duration = Duration::from_secs(30 * 60);

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            // The fuel X FEED valve (flight_model.cfg Valve.3), as the FADEC reads it.
            x_feed_valve_open_id: context.get_identifier("FUELSYSTEM VALVE OPEN:3".to_owned()),
            // The ENG MASTER switches drive the MSFS engine fuel valve switches 1 and 2.
            master_switch_ids: [1, 2].map(|engine_number| {
                context.get_identifier(format!("FUELSYSTEM VALVE SWITCH:{}", engine_number))
            }),
            ceiling_id: context.get_identifier("FUEL_GRAVITY_FEED_CEILING".to_owned()),
            starved_ids: [1, 2].map(|engine_number| {
                context.get_identifier(format!("FUEL_ENG_{}_GRAVITY_FEED_STARVED", engine_number))
            }),
            x_feed_valve_open: false,
            master_switch_is_on: [false; 2],
            time_above_fl300: Duration::ZERO,
            fl300_exceeded: false,
            takeoff_airport_elevation_ft: 0.,
            ceiling_ft: Self::FL300_NEVER_EXCEEDED_CEILING_FT,
            starved: [false; 2],
            gravity_fed: [false; 2],
            time_gravity_fed_above_ceiling: [Duration::ZERO; 2],
        }
    }

    pub fn update(&mut self, context: &UpdateContext, pumps: WingPumpsRunning) {
        let pressure_altitude_ft =
            InternationalStandardAtmosphere::altitude_from_pressure(context.ambient_pressure())
                .get::<foot>();

        if context.is_on_ground() {
            // The flight history of the ceiling starts again at the next takeoff.
            self.takeoff_airport_elevation_ft = pressure_altitude_ft;
            self.time_above_fl300 = Duration::ZERO;
            self.fl300_exceeded = false;
        } else if pressure_altitude_ft > Self::FL300_FT {
            self.fl300_exceeded = true;
            self.time_above_fl300 += context.delta();
        }
        self.ceiling_ft = self.gravity_feed_ceiling_ft();

        let left_pumps_off = !pumps.left.iter().any(|&running| running);
        let right_pumps_off = !pumps.right.iter().any(|&running| running);
        let gravity_fed = [
            Self::engine_is_gravity_fed(left_pumps_off, right_pumps_off, self.x_feed_valve_open),
            Self::engine_is_gravity_fed(right_pumps_off, left_pumps_off, self.x_feed_valve_open),
        ];
        let above_ceiling = !context.is_on_ground() && pressure_altitude_ft > self.ceiling_ft;
        self.gravity_fed = gravity_fed;

        for (engine_index, &engine_is_gravity_fed) in gravity_fed.iter().enumerate() {
            self.time_gravity_fed_above_ceiling[engine_index] =
                if engine_is_gravity_fed && above_ceiling {
                    self.time_gravity_fed_above_ceiling[engine_index] + context.delta()
                } else {
                    Duration::ZERO
                };

            // The ENG MASTER OFF of the relight procedure ends the starvation.
            if !self.master_switch_is_on[engine_index] {
                self.starved[engine_index] = false;
            }
            if self.time_gravity_fed_above_ceiling[engine_index] >= Self::STARVATION_DELAY {
                self.starved[engine_index] = true;
            }
        }
    }

    /// No wing tank pump pushes fuel to the engine.
    /// * `own_pumps_off` - both pumps of the wing tank of the engine are off
    /// * `other_pumps_off` - both pumps of the other wing tank are off
    fn engine_is_gravity_fed(
        own_pumps_off: bool,
        other_pumps_off: bool,
        x_feed_open: bool,
    ) -> bool {
        own_pumps_off && (!x_feed_open || other_pumps_off)
    }

    fn gravity_feed_ceiling_ft(&self) -> f64 {
        if self.time_above_fl300 > Self::LONG_FLIGHT_ABOVE_FL300 {
            Self::LONG_FLIGHT_ABOVE_FL300_CEILING_FT
        } else if self.fl300_exceeded {
            Self::SHORT_FLIGHT_ABOVE_FL300_CEILING_FT
        } else {
            Self::FL300_NEVER_EXCEEDED_CEILING_FT
                .max(self.takeoff_airport_elevation_ft + Self::ABOVE_TAKEOFF_AIRPORT_CEILING_FT)
        }
    }

    /// No wing tank pump pushes fuel to the engine (1 or 2).
    pub fn is_gravity_fed(&self, engine_number: usize) -> bool {
        self.gravity_fed[engine_number - 1]
    }

    /// The engine (1 or 2) was fed by gravity above the gravity feed ceiling: it has no fuel until
    /// the crew relight procedure.
    pub fn engine_is_starved(&self, engine_number: usize) -> bool {
        self.starved[engine_number - 1]
    }
}
impl SimulationElement for GravityFeed {
    fn read(&mut self, reader: &mut SimulatorReader) {
        // Percent over 100: the valve is open as soon as it is not fully closed, as for the FADEC.
        let x_feed_valve_open_ratio: f64 = reader.read(&self.x_feed_valve_open_id);
        self.x_feed_valve_open = x_feed_valve_open_ratio > 0.;
        for (is_on, id) in self
            .master_switch_is_on
            .iter_mut()
            .zip(self.master_switch_ids.iter())
        {
            *is_on = reader.read(id);
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.ceiling_id, self.ceiling_ft);
        for (starved, id) in self.starved.iter().zip(self.starved_ids.iter()) {
            writer.write(id, *starved);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElementVisitor,
    };
    use uom::si::f64::Length;

    struct TestAircraft {
        gravity_feed: GravityFeed,
        pumps: WingPumpsRunning,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                gravity_feed: GravityFeed::new(context),
                pumps: WingPumpsRunning {
                    left: [true; 2],
                    right: [true; 2],
                },
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.gravity_feed.update(context, self.pumps);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.gravity_feed.accept(visitor);

            visitor.visit(self);
        }
    }

    struct GravityFeedTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl GravityFeedTestBed {
        /// On the ground at a sea level airport, both engines running, all wing pumps on, X FEED
        /// closed.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            }
            .master_switch(1, true)
            .master_switch(2, true)
            .x_feed_open(false)
            .on_ground_at(0.);
            test_bed.run_with_delta(Duration::from_secs(1));

            test_bed
        }

        fn on_ground_at(mut self, elevation_ft: f64) -> Self {
            self.set_on_ground(true);
            self.set_pressure_altitude(Length::new::<foot>(elevation_ft));
            self.run_with_delta(Duration::from_secs(1));
            self
        }

        /// Takes off and flies at this pressure altitude for this long.
        fn fly_at(mut self, altitude_ft: f64, duration: Duration) -> Self {
            self.set_on_ground(false);
            self.set_pressure_altitude(Length::new::<foot>(altitude_ft));
            let step = Duration::from_secs(1);
            let mut elapsed = Duration::ZERO;
            while elapsed < duration {
                self.run_with_delta(step);
                elapsed += step;
            }
            self
        }

        fn master_switch(mut self, engine_number: usize, is_on: bool) -> Self {
            self.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), is_on);
            self
        }

        fn x_feed_open(mut self, open: bool) -> Self {
            self.write_by_name("FUELSYSTEM VALVE OPEN:3", if open { 1. } else { 0. });
            self
        }

        fn wing_pumps(mut self, left: [bool; 2], right: [bool; 2]) -> Self {
            self.command(|a| a.pumps = WingPumpsRunning { left, right });
            self
        }

        fn all_wing_pumps_off(self) -> Self {
            self.wing_pumps([false; 2], [false; 2])
        }

        fn ceiling_ft(&mut self) -> f64 {
            self.read_by_name("FUEL_GRAVITY_FEED_CEILING")
        }

        fn is_starved(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FUEL_ENG_{}_GRAVITY_FEED_STARVED", engine_number))
        }
    }
    impl TestBed for GravityFeedTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    /// Longer than the starvation delay.
    const STARVED: Duration = Duration::from_secs(181);

    fn test_bed() -> GravityFeedTestBed {
        GravityFeedTestBed::new()
    }

    #[test]
    fn ceiling_is_fl150_when_fl300_was_never_exceeded_from_a_low_airport() {
        let mut test_bed = test_bed().fly_at(20_000., Duration::from_secs(60));

        assert!((test_bed.ceiling_ft() - 15_000.).abs() < 0.1);
    }

    #[test]
    fn ceiling_is_7000_ft_above_a_high_takeoff_airport_when_fl300_was_never_exceeded() {
        let mut test_bed = test_bed()
            .on_ground_at(9_500.)
            .fly_at(20_000., Duration::from_secs(60));

        assert!((test_bed.ceiling_ft() - 16_500.).abs() < 0.1);
    }

    #[test]
    fn ceiling_is_fl260_after_less_than_30_min_above_fl300() {
        let mut test_bed = test_bed()
            .fly_at(35_000., Duration::from_secs(29 * 60))
            .fly_at(20_000., Duration::from_secs(60));

        assert!((test_bed.ceiling_ft() - 26_000.).abs() < 0.1);
    }

    #[test]
    fn ceiling_is_fl360_after_more_than_30_min_above_fl300() {
        let mut test_bed = test_bed()
            .fly_at(35_000., Duration::from_secs(31 * 60))
            .fly_at(20_000., Duration::from_secs(60));

        assert!((test_bed.ceiling_ft() - 36_000.).abs() < 0.1);
    }

    #[test]
    fn the_flight_history_starts_again_at_the_next_takeoff() {
        let mut test_bed = test_bed()
            .fly_at(35_000., Duration::from_secs(31 * 60))
            .on_ground_at(0.)
            .fly_at(10_000., Duration::from_secs(60));

        assert!((test_bed.ceiling_ft() - 15_000.).abs() < 0.1);
    }

    #[test]
    fn engines_fed_by_pumps_are_not_starved_above_the_ceiling() {
        let mut test_bed = test_bed().fly_at(39_000., Duration::from_secs(60));

        assert!(!test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));
    }

    #[test]
    fn gravity_fed_engines_are_not_starved_below_the_ceiling() {
        let mut test_bed = test_bed()
            .all_wing_pumps_off()
            .fly_at(14_000., Duration::from_secs(60));

        assert!(!test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));
    }

    #[test]
    fn gravity_fed_engines_are_starved_after_3_min_above_the_ceiling() {
        let mut test_bed = test_bed()
            .all_wing_pumps_off()
            .fly_at(16_000., Duration::from_secs(179));
        assert!(!test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));

        let mut test_bed = test_bed.fly_at(16_000., Duration::from_secs(2));
        assert!(test_bed.is_starved(1));
        assert!(test_bed.is_starved(2));
    }

    #[test]
    fn descending_below_the_ceiling_within_3_min_avoids_the_starvation() {
        let mut test_bed = test_bed()
            .all_wing_pumps_off()
            .fly_at(16_000., Duration::from_secs(170))
            .fly_at(14_000., Duration::from_secs(60))
            .fly_at(16_000., Duration::from_secs(170));

        assert!(!test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));
    }

    #[test]
    fn only_the_engine_whose_wing_pumps_are_off_is_gravity_fed_with_the_x_feed_closed() {
        let mut test_bed = test_bed()
            .wing_pumps([false; 2], [true; 2])
            .fly_at(20_000., STARVED);

        assert!(test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));
    }

    #[test]
    fn the_x_feed_valve_lets_the_pumps_of_one_side_feed_both_engines() {
        let mut test_bed = test_bed()
            .x_feed_open(true)
            .wing_pumps([false; 2], [true, false])
            .fly_at(20_000., STARVED);

        assert!(!test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));
    }

    #[test]
    fn the_x_feed_valve_does_not_help_when_all_wing_pumps_are_off() {
        let mut test_bed = test_bed()
            .x_feed_open(true)
            .all_wing_pumps_off()
            .fly_at(20_000., STARVED);

        assert!(test_bed.is_starved(1));
        assert!(test_bed.is_starved(2));
    }

    #[test]
    fn a_starved_engine_stays_starved_until_its_master_is_set_off_after_the_pumps_are_back() {
        let mut test_bed = test_bed()
            .all_wing_pumps_off()
            .fly_at(20_000., STARVED)
            .wing_pumps([true; 2], [true; 2])
            .fly_at(20_000., Duration::from_secs(10));
        assert!(test_bed.is_starved(1));

        let mut test_bed = test_bed.master_switch(1, false).fly_at(20_000., STARVED);
        assert!(!test_bed.is_starved(1));
        assert!(test_bed.is_starved(2));

        let mut test_bed = test_bed.master_switch(1, true).fly_at(20_000., STARVED);
        assert!(!test_bed.is_starved(1));
    }

    #[test]
    fn a_relight_above_the_ceiling_in_gravity_feeding_is_starved_again() {
        let mut test_bed = test_bed()
            .all_wing_pumps_off()
            .fly_at(20_000., STARVED)
            .master_switch(1, false)
            .fly_at(20_000., STARVED)
            .master_switch(1, true)
            .fly_at(20_000., STARVED);

        assert!(test_bed.is_starved(1));
    }

    #[test]
    fn a_starved_engine_can_be_relit_below_the_ceiling_in_gravity_feeding() {
        let mut test_bed = test_bed()
            .all_wing_pumps_off()
            .fly_at(20_000., STARVED)
            .fly_at(14_000., Duration::from_secs(60))
            .master_switch(1, false)
            .fly_at(14_000., Duration::from_secs(1))
            .master_switch(1, true)
            .fly_at(14_000., Duration::from_secs(1));

        assert!(!test_bed.is_starved(1));
    }

    #[test]
    fn no_starvation_on_the_ground() {
        let mut test_bed = test_bed().all_wing_pumps_off().on_ground_at(0.);

        assert!(!test_bed.is_starved(1));
        assert!(!test_bed.is_starved(2));
    }
}
