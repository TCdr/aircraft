//! ATA 30 probe and window heat of the A320: the three Probe Heat Computers (PHC) and the two Window Heat Computers
//! (WHC), with the failures of the heaters, for the ANTI ICE probe and window cautions of the FWC.
//!
//! A320 FCOM DSC-30-50-10 (a320_fcom.txt l.44511-44529), probes heat:
//! - "Three independent Probe Heat Computers (PHCs) automatically control and monitor: Captain probes, F/O probes,
//!   STBY probes. They protect against overheating and indicate faults."
//! - "The probes are heated: Automatically when at least one engine is running, or when the aircraft is in flight.
//!   Manually, when the flight crew switches ON the PROBE/WINDOW HEAT pb."
//! - "On the ground, the TAT probes are not heated and pitot heating operates at a low level".
//!   The heated probes: pitot, static ports, AOA and TAT probes (the STBY probes have no TAT probe).
//!
//! A320 FCOM DSC-30-40-10 (l.44435-44448), window heat: "Two independent Window Heat Computers (WHCs), one on each
//! side, automatically regulate the system, protect it against overheating, and indicate faults. Window heating comes
//! on: automatically when at least one engine is running, or when the aircraft is in flight; manually, before engine
//! start, when the flight crew switches ON the PROBE/WINDOW HEAT pushbutton switch."
//!
//! Design choices (the FCOM gives no more): a computer detects the failure of a heater while it heats it (a TAT heater on
//! the ground, not heated, shows no fault); a failed PHC raises the PROBES fault, an unpowered one does not (the
//! electrical alerts give the STATUS of a lost bus); the computer buses are not in the FCOM: CAPT PHC AC ESS SHED,
//! F/O PHC AC 2, STBY PHC AC 1, L WHC AC 1, R WHC AC 2. The heat itself has no effect on the sim (no probe icing model).

use systems::{
    failures::{Failure, FailureType},
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, VariableIdentifier, Write,
    },
};

/// The heated probes of a PHC, in the order of the probe index of FailureType::ProbeHeater
const PROBE_NAMES: [&str; 5] = ["PITOT", "L_STATIC", "R_STATIC", "AOA", "TAT"];
const TAT_PROBE: usize = 4;

/// When the probes and windows are heated: the PROBE/WINDOW HEAT pb ON, an engine running, or in flight
#[derive(Clone, Copy, Default)]
pub struct HeatingDemand {
    pub push_button_on: bool,
    pub engine_running: bool,
    pub in_flight: bool,
}
impl HeatingDemand {
    fn heats(&self) -> bool {
        self.push_button_on || self.engine_running || self.in_flight
    }
}

/// One Probe Heat Computer: 1 CAPT, 2 F/O, 3 STBY
struct ProbeHeatComputer {
    computer_fault_id: VariableIdentifier,
    heater_fault_ids: Vec<VariableIdentifier>,

    powered_by: ElectricalBusType,
    is_powered: bool,
    computer_failure: Failure,
    heater_failures: Vec<Failure>,
    heater_faults: Vec<bool>,
}
impl ProbeHeatComputer {
    fn new(context: &mut InitContext, number: usize, powered_by: ElectricalBusType) -> Self {
        // "the STBY probes": pitot, static ports and AOA, no TAT probe
        let probe_count = if number == 3 { 4 } else { 5 };
        Self {
            computer_fault_id: context.get_identifier(format!("PHC_{}_FAULT", number)),
            heater_fault_ids: PROBE_NAMES[..probe_count]
                .iter()
                .map(|probe| context.get_identifier(format!("PHC_{}_{}_HEAT_FAULT", number, probe)))
                .collect(),
            powered_by,
            is_powered: false,
            computer_failure: Failure::new(FailureType::ProbeHeatComputer(number)),
            heater_failures: (1..=probe_count)
                .map(|probe| Failure::new(FailureType::ProbeHeater(number, probe)))
                .collect(),
            heater_faults: vec![false; probe_count],
        }
    }

    fn is_operating(&self) -> bool {
        self.is_powered && !self.computer_failure.is_active()
    }

    fn update(&mut self, demand: HeatingDemand) {
        let operating = self.is_operating();
        for (probe, (fault, failure)) in self
            .heater_faults
            .iter_mut()
            .zip(self.heater_failures.iter())
            .enumerate()
        {
            // "On the ground, the TAT probes are not heated"
            let heated = demand.heats() && (probe != TAT_PROBE || demand.in_flight);
            *fault = operating && heated && failure.is_active();
        }
    }
}
impl SimulationElement for ProbeHeatComputer {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.computer_failure.accept(visitor);
        for failure in self.heater_failures.iter_mut() {
            failure.accept(visitor);
        }
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.computer_fault_id, self.computer_failure.is_active());
        for (id, fault) in self.heater_fault_ids.iter().zip(self.heater_faults.iter()) {
            writer.write(id, *fault);
        }
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

/// One Window Heat Computer: 1 left, 2 right, the windshield and the side window of its side
struct WindowHeatComputer {
    windshield_fault_id: VariableIdentifier,
    window_fault_id: VariableIdentifier,

    powered_by: ElectricalBusType,
    is_powered: bool,
    windshield_failure: Failure,
    window_failure: Failure,
    windshield_fault: bool,
    window_fault: bool,
}
impl WindowHeatComputer {
    fn new(context: &mut InitContext, number: usize, powered_by: ElectricalBusType) -> Self {
        Self {
            windshield_fault_id: context
                .get_identifier(format!("WHC_{}_WINDSHIELD_HEAT_FAULT", number)),
            window_fault_id: context.get_identifier(format!("WHC_{}_WINDOW_HEAT_FAULT", number)),
            powered_by,
            is_powered: false,
            windshield_failure: Failure::new(FailureType::WindshieldHeat(number)),
            window_failure: Failure::new(FailureType::WindowHeat(number)),
            windshield_fault: false,
            window_fault: false,
        }
    }

    fn update(&mut self, demand: HeatingDemand) {
        let monitoring = self.is_powered && demand.heats();
        self.windshield_fault = monitoring && self.windshield_failure.is_active();
        self.window_fault = monitoring && self.window_failure.is_active();
    }
}
impl SimulationElement for WindowHeatComputer {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.windshield_failure.accept(visitor);
        self.window_failure.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.windshield_fault_id, self.windshield_fault);
        writer.write(&self.window_fault_id, self.window_fault);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

pub struct A320ProbeWindowHeat {
    push_button_id: VariableIdentifier,
    push_button_on: bool,
    probe_heat_computers: [ProbeHeatComputer; 3],
    window_heat_computers: [WindowHeatComputer; 2],
}
impl A320ProbeWindowHeat {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            push_button_id: context.get_identifier("MAN_PITOT_HEAT".to_owned()),
            push_button_on: false,
            probe_heat_computers: [
                ProbeHeatComputer::new(
                    context,
                    1,
                    ElectricalBusType::AlternatingCurrentEssentialShed,
                ),
                ProbeHeatComputer::new(context, 2, ElectricalBusType::AlternatingCurrent(2)),
                ProbeHeatComputer::new(context, 3, ElectricalBusType::AlternatingCurrent(1)),
            ],
            window_heat_computers: [
                WindowHeatComputer::new(context, 1, ElectricalBusType::AlternatingCurrent(1)),
                WindowHeatComputer::new(context, 2, ElectricalBusType::AlternatingCurrent(2)),
            ],
        }
    }

    /// * `engine_running` - at least one engine is running
    /// * `in_flight` - the aircraft is in flight
    pub fn update(&mut self, engine_running: bool, in_flight: bool) {
        let demand = HeatingDemand {
            push_button_on: self.push_button_on,
            engine_running,
            in_flight,
        };
        for computer in self.probe_heat_computers.iter_mut() {
            computer.update(demand);
        }
        for computer in self.window_heat_computers.iter_mut() {
            computer.update(demand);
        }
    }
}
impl SimulationElement for A320ProbeWindowHeat {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for computer in self.probe_heat_computers.iter_mut() {
            computer.accept(visitor);
        }
        for computer in self.window_heat_computers.iter_mut() {
            computer.accept(visitor);
        }
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.push_button_on = reader.read(&self.push_button_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, UpdateContext,
        },
    };

    struct TestAircraft {
        heat: A320ProbeWindowHeat,
        ac_source: TestElectricitySource,
        buses: Vec<ElectricalBus>,
        engine_running: bool,
        in_flight: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                heat: A320ProbeWindowHeat::new(context),
                ac_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: vec![
                    ElectricalBus::new(context, ElectricalBusType::AlternatingCurrentEssentialShed),
                    ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                    ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),
                ],
                engine_running: false,
                in_flight: false,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.ac_source);
            for bus in self.buses.iter() {
                electricity.flow(&self.ac_source, bus);
            }
        }

        fn update_after_power_distribution(&mut self, _: &UpdateContext) {
            self.heat.update(self.engine_running, self.in_flight);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.heat.accept(visitor);
            for bus in self.buses.iter_mut() {
                bus.accept(visitor);
            }
            visitor.visit(self);
        }
    }

    fn test_bed(engine_running: bool, in_flight: bool) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| {
            a.engine_running = engine_running;
            a.in_flight = in_flight;
        });
        test_bed
    }

    fn flag(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    #[test]
    fn a_failed_pitot_heater_is_detected_in_flight() {
        let mut test_bed = test_bed(true, true);
        test_bed.fail(FailureType::ProbeHeater(1, 1));
        test_bed.run();

        assert!(flag(&mut test_bed, "PHC_1_PITOT_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "PHC_1_AOA_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "PHC_2_PITOT_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "PHC_1_FAULT"));
    }

    #[test]
    fn heater_failures_are_not_detected_while_the_probes_are_not_heated() {
        // On ground, engines stopped, PROBE/WINDOW HEAT pb AUTO: no heating
        let mut test_bed = test_bed(false, false);
        test_bed.fail(FailureType::ProbeHeater(3, 1));
        test_bed.fail(FailureType::WindshieldHeat(1));
        test_bed.run();
        assert!(!flag(&mut test_bed, "PHC_3_PITOT_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "WHC_1_WINDSHIELD_HEAT_FAULT"));

        // PROBE/WINDOW HEAT pb ON: heated, the failures show
        test_bed.write_by_name("MAN_PITOT_HEAT", true);
        test_bed.run();
        assert!(flag(&mut test_bed, "PHC_3_PITOT_HEAT_FAULT"));
        assert!(flag(&mut test_bed, "WHC_1_WINDSHIELD_HEAT_FAULT"));
    }

    #[test]
    fn the_tat_probes_are_not_heated_on_ground() {
        let mut test_bed = test_bed(true, false);
        test_bed.fail(FailureType::ProbeHeater(2, 5));
        test_bed.run();
        assert!(!flag(&mut test_bed, "PHC_2_TAT_HEAT_FAULT"));

        test_bed.command(|a| a.in_flight = true);
        test_bed.run();
        assert!(flag(&mut test_bed, "PHC_2_TAT_HEAT_FAULT"));
    }

    #[test]
    fn a_failed_probe_heat_computer_is_a_probes_fault() {
        let mut test_bed = test_bed(true, true);
        test_bed.fail(FailureType::ProbeHeatComputer(2));
        test_bed.fail(FailureType::ProbeHeater(2, 1));
        test_bed.run();

        assert!(flag(&mut test_bed, "PHC_2_FAULT"));
        // The failed computer no longer monitors its heaters
        assert!(!flag(&mut test_bed, "PHC_2_PITOT_HEAT_FAULT"));
    }

    #[test]
    fn window_heat_failures_are_detected_with_an_engine_running() {
        let mut test_bed = test_bed(true, false);
        test_bed.fail(FailureType::WindowHeat(2));
        test_bed.run();

        assert!(flag(&mut test_bed, "WHC_2_WINDOW_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "WHC_2_WINDSHIELD_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "WHC_1_WINDOW_HEAT_FAULT"));
    }
}
