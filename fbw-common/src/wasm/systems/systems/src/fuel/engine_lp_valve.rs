//! Engine low-pressure (LP) fuel valve and the fuel left between the valve and its engine.
//!
//! On Airbus aircraft each engine has an LP fuel valve that stops the flow of fuel to the engine. It
//! is closed by the ENG MASTER switch (lever) of that engine or by the ENG FIRE pushbutton.
//!
//! Closing the LP valve does not stop the engine at once: the engine keeps burning the fuel left in
//! the line between the valve and its nozzles. This element keeps track of that fuel: the line stays
//! full while the valve is open and is burned at the engine fuel flow computed by the FADEC once the
//! valve is fully closed. When it is empty the engine is starved. The aircraft is expected to stop
//! the engine combustion from the starved state (e.g. with an MSFS fuel valve in series with the
//! engine feed) and its FADEC to handle a starved engine as one without fuel.
//!
//! The travel time of the valve and the fuel left downstream of it are aircraft specific and must be
//! sourced by the aircraft that uses this element.
//!
//! Jammed valve failure (`FailureType::EngineLpValveJammed`): the valve stays where it is, whatever
//! the ENG MASTER and the ENG FIRE pushbutton command. The valve position is monitored against its
//! command: a valve still not where it is commanded once its travel is over is abnormally open (it
//! remains open while commanded closed) or abnormally closed (it remains closed while commanded
//! open). A320 FCOM PRO-ABN-FUEL FUEL ENG 1(2) LP VALVE OPEN (a320_fcom.txt l.85829-85839): "This
//! alert triggers when the valve remains in the open position." A380 FCOM PRO-ABN-ECAM-10-28 FUEL
//! ENG 1(2)(3)(4) LP VLV FAULT (a380_fcom.txt l.149688-149694): the LP valve is "Abnormally closed
//! on ground, during engine start, or - Abnormally open on ground, during engine shutdown". With
//! the valve jammed open the engine still shuts down with its ENG MASTER, which also closes the HP
//! valve (l.149731-149732); with the valve jammed closed the engine is starved and cannot start
//! (l.149725-149726).

use crate::{
    failures::{Failure, FailureType},
    shared::EngineFirePushButtons,
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use std::time::Duration;
use uom::si::{
    f64::*,
    mass::kilogram,
    mass_rate::kilogram_per_second,
    ratio::ratio,
    time::{hour, second},
};

pub struct EngineLpFuelValve {
    engine_number: usize,
    travel_time: Duration,
    fuel_downstream_capacity: Mass,

    // ENG MASTER switch position: both aircraft drive the MSFS fuel valve switch of the engine index
    // with their ENG MASTER switch (see FBW_ENGINE_Switch_Master_Template in A32NX_Interior_Misc.xml).
    master_switch_id: VariableIdentifier,
    // Engine fuel flow computed by the FADEC (A32NX_ENGINE_FF:{n}), in kg/h.
    fuel_flow_id: VariableIdentifier,

    open_percentage_id: VariableIdentifier,
    starved_id: VariableIdentifier,
    fuel_downstream_id: VariableIdentifier,
    abnormally_open_id: VariableIdentifier,
    abnormally_closed_id: VariableIdentifier,

    jammed: Failure,

    master_switch_is_on: bool,
    engine_fuel_flow: MassRate,

    position: Ratio,
    position_is_initialised: bool,
    fuel_downstream: Mass,

    is_commanded_open: bool,
    /// How long the valve position has disagreed with its command without a break.
    disagreement_duration: Duration,
}
impl EngineLpFuelValve {
    /// Design choice (no FCOM value): the position monitoring reports a valve that is still not
    /// where it is commanded this long after its travel time.
    const DISAGREEMENT_MARGIN: Duration = Duration::from_secs(1);

    /// # Arguments
    /// * `engine_number` - the engine number, from 1
    /// * `travel_time` - the time the valve takes to travel from fully open to fully closed
    /// * `fuel_downstream_capacity` - the fuel between the valve and the engine nozzles when the line
    ///   is full, i.e. what the engine burns after the valve has closed before it is starved
    pub fn new(
        context: &mut InitContext,
        engine_number: usize,
        travel_time: Duration,
        fuel_downstream_capacity: Mass,
    ) -> Self {
        Self {
            engine_number,
            travel_time,
            fuel_downstream_capacity,
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
            abnormally_open_id: context.get_identifier(format!(
                "FUEL_ENG_{}_LP_VALVE_ABNORMALLY_OPEN",
                engine_number
            )),
            abnormally_closed_id: context.get_identifier(format!(
                "FUEL_ENG_{}_LP_VALVE_ABNORMALLY_CLOSED",
                engine_number
            )),
            jammed: Failure::new(FailureType::EngineLpValveJammed(engine_number)),
            master_switch_is_on: false,
            engine_fuel_flow: MassRate::default(),
            position: Ratio::new::<ratio>(1.),
            position_is_initialised: false,
            fuel_downstream: fuel_downstream_capacity,
            is_commanded_open: true,
            disagreement_duration: Duration::ZERO,
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
    ) {
        let is_commanded_open =
            self.master_switch_is_on && !engine_fire_push_buttons.is_released(self.engine_number);
        let commanded_position = Ratio::new::<ratio>(if is_commanded_open { 1. } else { 0. });
        self.is_commanded_open = is_commanded_open;

        if self.position_is_initialised {
            // A jammed valve stays where it is.
            if !self.jammed.is_active() {
                self.move_towards(commanded_position, context.delta());
            }
        } else {
            // A freshly loaded flight starts with the valve where it is commanded, without travel.
            self.position = commanded_position;
            self.position_is_initialised = true;
        }

        let disagrees = if is_commanded_open {
            !self.is_fully_open()
        } else {
            !self.is_fully_closed()
        };
        self.disagreement_duration = if disagrees {
            self.disagreement_duration + context.delta()
        } else {
            Duration::ZERO
        };

        if self.is_fully_closed() {
            // The engine keeps burning the fuel left between the valve and its nozzles.
            let burned_fuel = self.engine_fuel_flow * context.delta_as_time();
            self.fuel_downstream = (self.fuel_downstream - burned_fuel).max(Mass::default());
        } else {
            self.fuel_downstream = self.fuel_downstream_capacity;
        }
    }

    fn move_towards(&mut self, commanded_position: Ratio, delta: Duration) {
        let max_travel = Ratio::new::<ratio>(delta.as_secs_f64() / self.travel_time.as_secs_f64());

        self.position = if commanded_position > self.position {
            (self.position + max_travel).min(commanded_position)
        } else {
            (self.position - max_travel).max(commanded_position)
        };
    }

    fn is_fully_closed(&self) -> bool {
        self.position.get::<ratio>() <= 0.
    }

    fn is_fully_open(&self) -> bool {
        self.position.get::<ratio>() >= 1.
    }

    /// The valve position has disagreed with its command for longer than its travel.
    fn position_disagrees(&self) -> bool {
        self.disagreement_duration > self.travel_time + Self::DISAGREEMENT_MARGIN
    }

    /// The valve remains (partly) open while it is commanded closed.
    pub fn is_abnormally_open(&self) -> bool {
        !self.is_commanded_open && self.position_disagrees()
    }

    /// The valve remains (partly) closed while it is commanded open.
    pub fn is_abnormally_closed(&self) -> bool {
        self.is_commanded_open && self.position_disagrees()
    }

    /// The LP valve is closed and the fuel between the valve and the nozzles has been burned.
    pub fn engine_is_starved(&self) -> bool {
        self.is_fully_closed() && self.fuel_downstream.get::<kilogram>() <= 0.
    }

    /// The fuel left between the valve and the engine nozzles.
    pub fn fuel_downstream(&self) -> Mass {
        self.fuel_downstream
    }
}
impl SimulationElement for EngineLpFuelValve {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.jammed.accept(visitor);

        visitor.visit(self);
    }

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
        writer.write(&self.abnormally_open_id, self.is_abnormally_open());
        writer.write(&self.abnormally_closed_id, self.is_abnormally_closed());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::EngineFireOverheadPanel,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, SimulationElementVisitor,
        },
    };

    // Arbitrary parameters: the aircraft source their own.
    const TRAVEL_TIME: Duration = Duration::from_secs(2);
    const FUEL_DOWNSTREAM_CAPACITY_KG: f64 = 5.;

    struct TestAircraft {
        engine_fire_overhead: EngineFireOverheadPanel<1>,
        lp_valve: EngineLpFuelValve,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_fire_overhead: EngineFireOverheadPanel::new(context),
                lp_valve: EngineLpFuelValve::new(
                    context,
                    1,
                    TRAVEL_TIME,
                    Mass::new::<kilogram>(FUEL_DOWNSTREAM_CAPACITY_KG),
                ),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.lp_valve.update(context, &self.engine_fire_overhead);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.engine_fire_overhead.accept(visitor);
            self.lp_valve.accept(visitor);

            visitor.visit(self);
        }
    }

    struct LpValveTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl LpValveTestBed {
        /// Engine running: master ON, fire pushbutton in, 1 800 kg/h (0.5 kg/s).
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            }
            .master_switch(true)
            .fire_push_button_released(false)
            .fuel_flow(1800.);
            test_bed.run_for(Duration::from_secs(1));

            test_bed
        }

        fn master_switch(mut self, is_on: bool) -> Self {
            self.write_by_name("FUELSYSTEM VALVE SWITCH:1", is_on);
            self
        }

        fn fire_push_button_released(mut self, released: bool) -> Self {
            self.write_by_name("FIRE_BUTTON_ENG1", released);
            self
        }

        fn fuel_flow(mut self, kg_per_hour: f64) -> Self {
            self.write_by_name("ENGINE_FF:1", kg_per_hour);
            self
        }

        fn run_for(&mut self, duration: Duration) {
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

        fn open_percentage(&mut self) -> f64 {
            self.read_by_name("FUEL_ENG_1_LP_VALVE_OPEN_PERCENTAGE")
        }

        fn is_starved(&mut self) -> bool {
            self.read_by_name("FUEL_ENG_1_STARVED")
        }

        fn fuel_downstream_kg(&mut self) -> f64 {
            self.read_by_name("FUEL_ENG_1_FUEL_DOWNSTREAM_LP_VALVE")
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

    #[test]
    fn valve_is_open_and_line_full_with_master_on_and_fire_push_button_in() {
        let mut test_bed = LpValveTestBed::new().and_run_for(Duration::from_secs(60));

        assert_eq!(test_bed.open_percentage(), 100.);
        assert!(!test_bed.is_starved());
        assert_eq!(test_bed.fuel_downstream_kg(), FUEL_DOWNSTREAM_CAPACITY_KG);
    }

    #[test]
    fn master_off_or_fire_push_button_closes_the_valve_in_the_travel_time() {
        let mut test_bed = LpValveTestBed::new()
            .master_switch(false)
            .and_run_for(Duration::from_secs(1));
        assert!((test_bed.open_percentage() - 50.).abs() < 1.);

        let mut test_bed = test_bed.and_run_for(Duration::from_secs(1));
        assert_eq!(test_bed.open_percentage(), 0.);

        let mut test_bed = LpValveTestBed::new()
            .fire_push_button_released(true)
            .and_run_for(Duration::from_secs(2));
        assert_eq!(test_bed.open_percentage(), 0.);
    }

    #[test]
    fn engine_starves_once_the_fuel_downstream_is_burned() {
        let mut test_bed = LpValveTestBed::new()
            .fire_push_button_released(true)
            .and_run_for(Duration::from_millis(11_900));
        // 2 s of travel, then 5 kg at 0.5 kg/s = 10 s
        assert!(!test_bed.is_starved());

        let mut test_bed = test_bed.and_run_for(Duration::from_millis(200));
        assert!(test_bed.is_starved());
        assert_eq!(test_bed.fuel_downstream_kg(), 0.);
    }

    #[test]
    fn engine_without_fuel_flow_is_not_starved() {
        let mut test_bed = LpValveTestBed::new()
            .fuel_flow(0.)
            .master_switch(false)
            .and_run_for(Duration::from_secs(600));

        assert!(!test_bed.is_starved());
    }

    #[test]
    fn reopening_the_valve_refills_the_line() {
        let mut test_bed = LpValveTestBed::new()
            .fire_push_button_released(true)
            .and_run_for(Duration::from_secs(30));
        assert!(test_bed.is_starved());

        let mut test_bed = test_bed
            .fire_push_button_released(false)
            .and_run_for(Duration::from_millis(100));

        assert!(!test_bed.is_starved());
        assert_eq!(test_bed.fuel_downstream_kg(), FUEL_DOWNSTREAM_CAPACITY_KG);
    }

    #[test]
    fn valve_starts_where_it_is_commanded_without_travel() {
        let mut test_bed = LpValveTestBed {
            test_bed: SimulationTestBed::new(TestAircraft::new),
        }
        .master_switch(false);
        test_bed.run_with_delta(Duration::from_millis(50));

        assert_eq!(test_bed.open_percentage(), 0.);
    }

    impl LpValveTestBed {
        fn jammed(mut self) -> Self {
            self.fail(FailureType::EngineLpValveJammed(1));
            self
        }

        fn repaired(mut self) -> Self {
            self.unfail(FailureType::EngineLpValveJammed(1));
            self
        }

        fn is_abnormally_open(&mut self) -> bool {
            self.read_by_name("FUEL_ENG_1_LP_VALVE_ABNORMALLY_OPEN")
        }

        fn is_abnormally_closed(&mut self) -> bool {
            self.read_by_name("FUEL_ENG_1_LP_VALVE_ABNORMALLY_CLOSED")
        }
    }

    #[test]
    fn a_valve_that_closes_normally_is_never_abnormal() {
        let mut test_bed = LpValveTestBed::new()
            .master_switch(false)
            .and_run_for(Duration::from_secs(10));

        assert!(!test_bed.is_abnormally_open());
        assert!(!test_bed.is_abnormally_closed());
    }

    #[test]
    fn a_valve_jammed_open_stays_open_and_does_not_starve_the_engine() {
        let mut test_bed = LpValveTestBed::new()
            .jammed()
            .fire_push_button_released(true)
            .and_run_for(Duration::from_secs(60));

        assert_eq!(test_bed.open_percentage(), 100.);
        assert!(!test_bed.is_starved());
        assert!(test_bed.is_abnormally_open());
        assert!(!test_bed.is_abnormally_closed());
    }

    #[test]
    fn a_valve_jammed_open_is_reported_once_its_travel_time_and_the_margin_are_over() {
        // 2 s travel time + 1 s margin
        let mut test_bed = LpValveTestBed::new()
            .jammed()
            .master_switch(false)
            .and_run_for(Duration::from_millis(2_900));
        assert!(!test_bed.is_abnormally_open());

        let mut test_bed = test_bed.and_run_for(Duration::from_millis(200));
        assert!(test_bed.is_abnormally_open());
    }

    #[test]
    fn a_valve_jammed_closed_starves_the_engine_and_is_abnormally_closed() {
        let mut test_bed = LpValveTestBed::new()
            .master_switch(false)
            .and_run_for(Duration::from_secs(30))
            .jammed()
            .master_switch(true)
            .and_run_for(Duration::from_secs(30));

        assert_eq!(test_bed.open_percentage(), 0.);
        assert!(test_bed.is_starved());
        assert!(test_bed.is_abnormally_closed());
        assert!(!test_bed.is_abnormally_open());
    }

    #[test]
    fn a_repaired_valve_follows_its_command_again() {
        let mut test_bed = LpValveTestBed::new()
            .jammed()
            .master_switch(false)
            .and_run_for(Duration::from_secs(10))
            .repaired()
            .and_run_for(Duration::from_secs(3));

        assert_eq!(test_bed.open_percentage(), 0.);
        assert!(!test_bed.is_abnormally_open());
    }
}
