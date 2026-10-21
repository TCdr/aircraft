//! The engine (nacelle) anti-ice valve of one engine.
//!
//! Each nacelle is protected by its own bleed from the HP compressor, through a two-position (open/closed) valve
//! that the crew controls with the ENG ANTI ICE pb-sw. The valve closes when the engine supplies no air (engine not
//! running) and opens when electrical power fails. The FAULT light comes on (with an ECAM caution) when the valve
//! position disagrees with the pb-sw selection, and briefly while the valve transits.
//!
//! The valve is solenoid controlled and pneumatically operated: the energised solenoid holds it closed (pb-sw OFF),
//! the air of the HP compressor opens it. So it opens with the pb-sw ON, or without electrical power, as long as the
//! engine supplies air.

use std::time::Duration;

use uom::si::{f64::*, pressure::psi, ratio::ratio};

use crate::{
    failures::{Failure, FailureType},
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

pub struct EngineAntiIceValve {
    push_button_id: VariableIdentifier,
    valve_open_id: VariableIdentifier,
    fault_light_id: VariableIdentifier,

    powered_by: ElectricalBusType,
    is_powered: bool,
    push_button_on: bool,
    /// The controller channel of the valve solenoid works (A380: a channel of an anti-ice control unit)
    control_available: bool,
    /// The controller still monitors the valve position
    monitoring_available: bool,
    /// 0 (closed) to 1 (open)
    open_amount: Ratio,

    stuck_closed: Failure,
    stuck_open: Failure,
}
impl EngineAntiIceValve {
    /// Design choice (no published value): the time the valve takes to go from closed to open, or back, short enough
    /// for the FAULT light to come on only briefly while the valve transits.
    const TRAVEL_TIME: Duration = Duration::from_secs(2);

    /// Design choice (no published value): the HP compressor air pressure over the ambient pressure that opens the valve,
    /// the same 10 PSI as the A320 wing anti-ice valves. The FBW engine HP compressor model is at the ambient
    /// pressure with the engine stopped, and reaches it at about 25 % N2 during a start.
    const MIN_SUPPLY_PRESSURE_PSIG: f64 = 10.;

    /// * `engine_number` - the engine of the valve, from 1
    /// * `powered_by` - the bus of the solenoid that holds the valve closed with the pb-sw OFF
    pub fn new(
        context: &mut InitContext,
        engine_number: usize,
        powered_by: ElectricalBusType,
    ) -> Self {
        Self {
            push_button_id: context.get_identifier(format!(
                "BUTTON_OVHD_ANTI_ICE_ENG_{}_POSITION",
                engine_number
            )),
            valve_open_id: context
                .get_identifier(format!("PNEU_ENG_{}_ANTI_ICE_VALVE_OPEN", engine_number)),
            fault_light_id: context
                .get_identifier(format!("PNEU_ENG_{}_ANTI_ICE_FAULT", engine_number)),

            powered_by,
            is_powered: false,
            push_button_on: false,
            control_available: true,
            monitoring_available: true,
            open_amount: Ratio::default(),

            stuck_closed: Failure::new(FailureType::EngineAntiIceValveStuckClosed(engine_number)),
            stuck_open: Failure::new(FailureType::EngineAntiIceValveStuckOpen(engine_number)),
        }
    }

    /// * `supply_pressure` - the pressure of the air of the engine HP compressor
    pub fn update(&mut self, context: &UpdateContext, supply_pressure: Pressure) {
        let air_available = (supply_pressure - context.ambient_pressure()).get::<psi>()
            > Self::MIN_SUPPLY_PRESSURE_PSIG;
        // The energised solenoid holds the valve closed, so the valve opens when electrical power or its controller
        // fails
        let solenoid_holds_closed =
            self.is_powered && self.control_available && !self.push_button_on;

        let should_be_open = if self.stuck_closed.is_active() {
            false
        } else if self.stuck_open.is_active() {
            true
        } else {
            air_available && !solenoid_holds_closed
        };

        let travel = context.delta_as_secs_f64() / Self::TRAVEL_TIME.as_secs_f64();
        let open_amount = if should_be_open {
            self.open_amount.get::<ratio>() + travel
        } else {
            self.open_amount.get::<ratio>() - travel
        };
        self.open_amount = Ratio::new::<ratio>(open_amount.clamp(0., 1.));
    }

    /// Whether the valve is not fully closed: anti-ice air flows to the nacelle
    pub fn is_open(&self) -> bool {
        self.open_amount.get::<ratio>() > 0.
    }

    fn is_fully_open(&self) -> bool {
        self.open_amount.get::<ratio>() >= 1.
    }

    pub fn push_button_on(&self) -> bool {
        self.push_button_on
    }

    /// For an aircraft whose valves have separate control and monitoring channels (A380 AICUs): without its control
    /// channel the solenoid is no longer energised and the valve opens; without its monitoring the FAULT light comes on.
    pub fn set_controller_state(&mut self, control_available: bool, monitoring_available: bool) {
        self.control_available = control_available;
        self.monitoring_available = monitoring_available;
    }

    /// The FAULT light of the ENG ANTI ICE pb-sw: the valve position disagrees with the pb-sw selection, also while
    /// the valve transits, or the valve position is no longer monitored. The cockpit lamp has its own power
    /// (SEQ_POWERED of the pb-sw in the cockpit behaviour).
    pub fn fault_light(&self) -> bool {
        if !self.monitoring_available {
            true
        } else if self.push_button_on {
            !self.is_fully_open()
        } else {
            self.is_open()
        }
    }
}
impl SimulationElement for EngineAntiIceValve {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.stuck_closed.accept(visitor);
        self.stuck_open.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.push_button_on = reader.read(&self.push_button_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.valve_open_id, self.is_open());
        writer.write(&self.fault_light_id, self.fault_light());
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };

    struct TestAircraft {
        valve: EngineAntiIceValve,
        dc_source: TestElectricitySource,
        dc_1_bus: ElectricalBus,
        is_dc_1_powered: bool,
        /// The HP compressor air pressure over the ambient pressure
        supply_pressure_psig: f64,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                valve: EngineAntiIceValve::new(context, 1, ElectricalBusType::DirectCurrent(1)),
                dc_source: TestElectricitySource::powered(context, PotentialOrigin::Battery(1)),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                is_dc_1_powered: true,
                supply_pressure_psig: 0.,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.dc_source);
            if self.is_dc_1_powered {
                electricity.flow(&self.dc_source, &self.dc_1_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.valve.update(
                context,
                context.ambient_pressure() + Pressure::new::<psi>(self.supply_pressure_psig),
            );
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.valve.accept(visitor);
            self.dc_1_bus.accept(visitor);
            visitor.visit(self);
        }
    }

    /// An engine running at idle: well above the 10 PSI that open the valve
    const IDLE_SUPPLY_PRESSURE_PSIG: f64 = 40.;

    fn test_bed(
        push_button_on: bool,
        supply_pressure_psig: f64,
    ) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| a.supply_pressure_psig = supply_pressure_psig);
        test_bed.write_by_name("BUTTON_OVHD_ANTI_ICE_ENG_1_POSITION", push_button_on);
        test_bed
    }

    fn run_seconds(test_bed: &mut SimulationTestBed<TestAircraft>, seconds: u32) {
        test_bed.run_iterations_with_delta(seconds * 10, Duration::from_millis(100));
    }

    fn valve_open(test_bed: &mut SimulationTestBed<TestAircraft>) -> bool {
        test_bed.read_by_name("PNEU_ENG_1_ANTI_ICE_VALVE_OPEN")
    }

    fn fault_light(test_bed: &mut SimulationTestBed<TestAircraft>) -> bool {
        test_bed.read_by_name("PNEU_ENG_1_ANTI_ICE_FAULT")
    }

    #[test]
    fn opens_with_the_push_button_on_and_the_engine_running() {
        let mut test_bed = test_bed(true, IDLE_SUPPLY_PRESSURE_PSIG);
        run_seconds(&mut test_bed, 3);

        assert!(valve_open(&mut test_bed));
        assert!(!fault_light(&mut test_bed));
    }

    #[test]
    fn the_fault_light_comes_on_briefly_as_the_valve_transits() {
        let mut test_bed = test_bed(true, IDLE_SUPPLY_PRESSURE_PSIG);
        run_seconds(&mut test_bed, 1);

        assert!(valve_open(&mut test_bed));
        assert!(fault_light(&mut test_bed));

        run_seconds(&mut test_bed, 2);
        assert!(!fault_light(&mut test_bed));

        // Closing: the light again comes on while the valve transits
        test_bed.write_by_name("BUTTON_OVHD_ANTI_ICE_ENG_1_POSITION", false);
        run_seconds(&mut test_bed, 1);
        assert!(fault_light(&mut test_bed));
        run_seconds(&mut test_bed, 2);
        assert!(!valve_open(&mut test_bed));
        assert!(!fault_light(&mut test_bed));
    }

    #[test]
    fn stays_closed_without_engine_air_and_the_fault_light_shows_the_disagreement() {
        let mut test_bed = test_bed(true, 0.);
        run_seconds(&mut test_bed, 5);

        assert!(!valve_open(&mut test_bed));
        assert!(fault_light(&mut test_bed));

        // Engine start: the valve opens once the HP compressor supplies air
        test_bed.command(|a| a.supply_pressure_psig = IDLE_SUPPLY_PRESSURE_PSIG);
        run_seconds(&mut test_bed, 3);
        assert!(valve_open(&mut test_bed));
        assert!(!fault_light(&mut test_bed));
    }

    #[test]
    fn closes_with_the_push_button_off() {
        let mut test_bed = test_bed(false, IDLE_SUPPLY_PRESSURE_PSIG);
        run_seconds(&mut test_bed, 3);

        assert!(!valve_open(&mut test_bed));
        assert!(!fault_light(&mut test_bed));
    }

    #[test]
    fn opens_when_its_electrical_power_fails() {
        let mut test_bed = test_bed(false, IDLE_SUPPLY_PRESSURE_PSIG);
        test_bed.command(|a| a.is_dc_1_powered = false);
        run_seconds(&mut test_bed, 3);

        assert!(valve_open(&mut test_bed));
    }

    #[test]
    fn a_valve_stuck_closed_does_not_open_and_lights_the_fault_light() {
        let mut test_bed = test_bed(true, IDLE_SUPPLY_PRESSURE_PSIG);
        test_bed.fail(FailureType::EngineAntiIceValveStuckClosed(1));
        run_seconds(&mut test_bed, 3);

        assert!(!valve_open(&mut test_bed));
        assert!(fault_light(&mut test_bed));
    }

    #[test]
    fn a_valve_stuck_open_does_not_close_and_lights_the_fault_light() {
        let mut test_bed = test_bed(false, IDLE_SUPPLY_PRESSURE_PSIG);
        test_bed.fail(FailureType::EngineAntiIceValveStuckOpen(1));
        run_seconds(&mut test_bed, 3);

        assert!(valve_open(&mut test_bed));
        assert!(fault_light(&mut test_bed));
    }

    #[test]
    fn opens_when_its_control_channel_fails() {
        let mut test_bed = test_bed(false, IDLE_SUPPLY_PRESSURE_PSIG);
        test_bed.command(|a| a.valve.set_controller_state(false, true));
        run_seconds(&mut test_bed, 3);

        assert!(valve_open(&mut test_bed));
    }

    #[test]
    fn lights_the_fault_light_when_its_position_is_no_longer_monitored() {
        let mut test_bed = test_bed(false, IDLE_SUPPLY_PRESSURE_PSIG);
        test_bed.command(|a| a.valve.set_controller_state(true, false));
        run_seconds(&mut test_bed, 3);

        assert!(!valve_open(&mut test_bed));
        assert!(fault_light(&mut test_bed));
    }
}
