use systems::{
    failures::{Failure, FailureType},
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, VariableIdentifier, Write,
    },
};

/// Where the avionics overboard valve is: the extract valve is open whenever the overboard valve is closed
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum OverboardValvePosition {
    Closed,
    /// The inner flap opens, as in flight with the EXTRACT pb-sw at OVRD
    PartiallyOpen,
    FullyOpen,
}

/// Avionics ventilation of the main and upper avionics bays (L and R blowing circuits, extraction fan, extract and
/// overboard valves), the supplemental cooling systems that serve as avionics ground cooling and the THS bay
/// ventilation, as far as the ECAM monitors them. The faults are published to the FWS in an ARINC 429 discrete word of
/// the CPIOM B (cpiom_b.rs).
pub(super) struct AvionicsVentilationSystem {
    extract_pb_is_auto_id: VariableIdentifier,
    extract_pb_fault_id: VariableIdentifier,

    extract_pb_is_auto: bool,
    ac_bus_powered: [bool; 4],

    blowing_fan_failure: [Failure; 2],
    backup_valve_failure: [Failure; 2],
    extraction_fan_failure: Failure,
    extract_valve_failure: Failure,
    overboard_valve_stuck_open_failure: Failure,
    overboard_valve_stuck_closed_failure: Failure,
    controller_failure: Failure,
    cooling_overheat_failure: [Failure; 2],
    cooling_protection_failure: [Failure; 2],
    ths_bay_fan_failure: Failure,

    circuit_not_ventilated: [bool; 2],
    extract_fault: bool,
    overboard_valve_fault: bool,
    overboard_valve_fully_open: bool,
    controller_fault: bool,
    cooling_overheat: [bool; 2],
    cooling_protection_fault: bool,
    ths_bay_ventilation_fault: bool,
}

impl AvionicsVentilationSystem {
    /// Corrected N1 above which an inner engine counts as started (as the pack flow valves of the FDAC)
    const INNER_ENGINE_STARTED_N1_PERCENT: f64 = 15.;

    // Electrical supply: left blowing fan AC 1, right blowing fan AC 3, extraction fan AC 4 and
    // THS bay blowing fan AC 3
    const LEFT_BLOWING_FAN_BUS: usize = 0;
    const RIGHT_BLOWING_FAN_BUS: usize = 2;
    const EXTRACTION_FAN_BUS: usize = 3;
    const THS_BAY_FAN_BUS: usize = 2;

    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            extract_pb_is_auto_id: context.get_identifier("VENTILATION_EXTRACT_TOGGLE".to_owned()),
            extract_pb_fault_id: context.get_identifier("VENTILATION_EXTRACT_FAULT".to_owned()),

            extract_pb_is_auto: true,
            ac_bus_powered: [false; 4],

            blowing_fan_failure: [1, 2]
                .map(|circuit| Failure::new(FailureType::AvionicsBlowingFan(circuit))),
            backup_valve_failure: [1, 2]
                .map(|circuit| Failure::new(FailureType::AvionicsBackupValve(circuit))),
            extraction_fan_failure: Failure::new(FailureType::AvionicsExtractionFan),
            extract_valve_failure: Failure::new(FailureType::AvionicsExtractValve),
            overboard_valve_stuck_open_failure: Failure::new(
                FailureType::AvionicsOverboardValveStuckOpen,
            ),
            overboard_valve_stuck_closed_failure: Failure::new(
                FailureType::AvionicsOverboardValveStuckClosed,
            ),
            controller_failure: Failure::new(FailureType::AvionicsVentilationController),
            cooling_overheat_failure: [1, 2]
                .map(|system| Failure::new(FailureType::SupplementalCoolingOverheat(system))),
            cooling_protection_failure: [1, 2]
                .map(|system| Failure::new(FailureType::SupplementalCoolingProtection(system))),
            ths_bay_fan_failure: Failure::new(FailureType::ThsBayBlowingFan),

            circuit_not_ventilated: [false; 2],
            extract_fault: false,
            overboard_valve_fault: false,
            overboard_valve_fully_open: false,
            controller_fault: false,
            cooling_overheat: [false; 2],
            cooling_protection_fault: false,
            ths_bay_ventilation_fault: false,
        }
    }

    pub(super) fn update(
        &mut self,
        on_ground: bool,
        inner_engines_n1_percent: [f64; 2],
        ditching_is_on: bool,
    ) {
        // With every AC bus dead the aircraft is dark: nothing is monitored
        let ac_network_is_alive = self.ac_bus_powered.iter().any(|powered| *powered);
        // A failed controller no longer monitors the alerts of the avionics ventilation (the blowing fans and
        // the extraction fan run at maximum speed, the COND SD page indications are lost)
        let monitored = ac_network_is_alive && !self.controller_failure.is_active();

        self.controller_fault = ac_network_is_alive && self.controller_failure.is_active();

        let fan_available = |fan_failure: &Failure, bus: usize| {
            !fan_failure.is_active() && self.ac_bus_powered[bus]
        };
        let blowing_fan_buses = [Self::LEFT_BLOWING_FAN_BUS, Self::RIGHT_BLOWING_FAN_BUS];
        // The backup valve of a circuit opens when its blowing fan fails and lets in air of the mixer unit
        let circuit_not_ventilated: [bool; 2] = [0, 1].map(|circuit| {
            monitored
                && !fan_available(
                    &self.blowing_fan_failure[circuit],
                    blowing_fan_buses[circuit],
                )
                && self.backup_valve_failure[circuit].is_active()
        });

        let inner_engines_started = inner_engines_n1_percent
            .iter()
            .all(|n1| *n1 >= Self::INNER_ENGINE_STARTED_N1_PERCENT);
        let commanded_overboard_valve = if ditching_is_on {
            OverboardValvePosition::Closed
        } else if on_ground {
            if inner_engines_started {
                OverboardValvePosition::Closed
            } else {
                OverboardValvePosition::FullyOpen
            }
        } else if self.extract_pb_is_auto {
            OverboardValvePosition::Closed
        } else {
            OverboardValvePosition::PartiallyOpen
        };
        let overboard_valve = if self.overboard_valve_stuck_open_failure.is_active() {
            OverboardValvePosition::FullyOpen
        } else if self.overboard_valve_stuck_closed_failure.is_active() {
            OverboardValvePosition::Closed
        } else {
            commanded_overboard_valve
        };

        let extract_valve_commanded_open =
            commanded_overboard_valve == OverboardValvePosition::Closed;
        let extract_valve_stuck_closed =
            extract_valve_commanded_open && self.extract_valve_failure.is_active();
        let extraction_fan_available =
            fan_available(&self.extraction_fan_failure, Self::EXTRACTION_FAN_BUS);

        self.circuit_not_ventilated = circuit_not_ventilated;
        self.extract_fault = monitored && (!extraction_fan_available || extract_valve_stuck_closed);
        self.overboard_valve_fault = monitored && overboard_valve != commanded_overboard_valve;
        self.overboard_valve_fully_open =
            monitored && overboard_valve == OverboardValvePosition::FullyOpen;

        // The overheat of a supplemental cooling system is only detected while its protection works
        self.cooling_overheat = [0, 1].map(|system| {
            ac_network_is_alive
                && self.cooling_overheat_failure[system].is_active()
                && !self.cooling_protection_failure[system].is_active()
        });
        self.cooling_protection_fault = ac_network_is_alive
            && self
                .cooling_protection_failure
                .iter()
                .any(|failure| failure.is_active());

        // The THS bay is ventilated on ground when the aircraft is electrically powered; in flight it needs no fan
        self.ths_bay_ventilation_fault = ac_network_is_alive
            && (self.ths_bay_fan_failure.is_active()
                || (on_ground && !self.ac_bus_powered[Self::THS_BAY_FAN_BUS]));
    }

    /// The L (index 0) or R (index 1) circuit gets no air: its blowing fan and its backup valve are lost
    pub(super) fn circuit_not_ventilated(&self, circuit_index: usize) -> bool {
        self.circuit_not_ventilated[circuit_index]
    }

    pub(super) fn extract_fault(&self) -> bool {
        self.extract_fault
    }

    /// The overboard valve is not where the controller commands it
    pub(super) fn overboard_valve_fault(&self) -> bool {
        self.overboard_valve_fault
    }

    pub(super) fn overboard_valve_fully_open(&self) -> bool {
        self.overboard_valve_fully_open
    }

    pub(super) fn controller_fault(&self) -> bool {
        self.controller_fault
    }

    /// Supplemental cooling system 1 (index 0) or 2 (index 1) overheats and the overheat is detected
    pub(super) fn cooling_overheat(&self, system_index: usize) -> bool {
        self.cooling_overheat[system_index]
    }

    /// The overheat detection of a supplemental cooling system is lost
    pub(super) fn cooling_protection_fault(&self) -> bool {
        self.cooling_protection_fault
    }

    pub(super) fn ths_bay_ventilation_fault(&self) -> bool {
        self.ths_bay_ventilation_fault
    }
}

impl SimulationElement for AvionicsVentilationSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.blowing_fan_failure
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.backup_valve_failure
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.extraction_fan_failure.accept(visitor);
        self.extract_valve_failure.accept(visitor);
        self.overboard_valve_stuck_open_failure.accept(visitor);
        self.overboard_valve_stuck_closed_failure.accept(visitor);
        self.controller_failure.accept(visitor);
        self.cooling_overheat_failure
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.cooling_protection_failure
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.ths_bay_fan_failure.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.extract_pb_is_auto = reader.read(&self.extract_pb_is_auto_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.extract_pb_fault_id,
            self.extract_fault || self.overboard_valve_fault,
        );
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.ac_bus_powered =
            [1, 2, 3, 4].map(|bus| buses.is_powered(ElectricalBusType::AlternatingCurrent(bus)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };

    struct TestAircraft {
        avionics_ventilation: AvionicsVentilationSystem,
        on_ground: bool,
        inner_engines_n1_percent: [f64; 2],
        ditching_is_on: bool,
        ac_bus_powered: [bool; 4],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                avionics_ventilation: AvionicsVentilationSystem::new(context),
                on_ground: true,
                inner_engines_n1_percent: [0.; 2],
                ditching_is_on: false,
                ac_bus_powered: [true; 4],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(
            &mut self,
            _context: &systems::simulation::UpdateContext,
        ) {
            self.avionics_ventilation.ac_bus_powered = self.ac_bus_powered;
            self.avionics_ventilation.update(
                self.on_ground,
                self.inner_engines_n1_percent,
                self.ditching_is_on,
            );
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.avionics_ventilation.accept(visitor);
            visitor.visit(self);
        }
    }

    fn in_cruise() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| {
            a.on_ground = false;
            a.inner_engines_n1_percent = [85.; 2];
        });
        test_bed.write_by_name("VENTILATION_EXTRACT_TOGGLE", true);
        test_bed
    }

    fn run(test_bed: &mut SimulationTestBed<TestAircraft>) {
        test_bed.run();
    }

    /// What the system reports to the FWS
    struct Reported {
        circuit_not_ventilated: [bool; 2],
        extract_fault: bool,
        overboard_valve_fault: bool,
        overboard_valve_fully_open: bool,
        controller_fault: bool,
        cooling_overheat: [bool; 2],
        cooling_protection_fault: bool,
        ths_bay_ventilation_fault: bool,
    }
    impl Reported {
        fn circuit_not_ventilated(&self, circuit: usize) -> bool {
            self.circuit_not_ventilated[circuit]
        }
        fn extract_fault(&self) -> bool {
            self.extract_fault
        }
        fn overboard_valve_fault(&self) -> bool {
            self.overboard_valve_fault
        }
        fn overboard_valve_fully_open(&self) -> bool {
            self.overboard_valve_fully_open
        }
        fn controller_fault(&self) -> bool {
            self.controller_fault
        }
        fn cooling_overheat(&self, system: usize) -> bool {
            self.cooling_overheat[system]
        }
        fn cooling_protection_fault(&self) -> bool {
            self.cooling_protection_fault
        }
        fn ths_bay_ventilation_fault(&self) -> bool {
            self.ths_bay_ventilation_fault
        }
    }

    fn system(test_bed: &SimulationTestBed<TestAircraft>) -> Reported {
        test_bed.query(|aircraft| {
            let system = &aircraft.avionics_ventilation;
            Reported {
                circuit_not_ventilated: [0, 1]
                    .map(|circuit| system.circuit_not_ventilated(circuit)),
                extract_fault: system.extract_fault(),
                overboard_valve_fault: system.overboard_valve_fault(),
                overboard_valve_fully_open: system.overboard_valve_fully_open(),
                controller_fault: system.controller_fault(),
                cooling_overheat: [0, 1].map(|index| system.cooling_overheat(index)),
                cooling_protection_fault: system.cooling_protection_fault(),
                ths_bay_ventilation_fault: system.ths_bay_ventilation_fault(),
            }
        })
    }

    #[test]
    fn nothing_is_reported_while_everything_works() {
        let mut test_bed = in_cruise();
        run(&mut test_bed);

        let system = system(&test_bed);
        assert!(!system.circuit_not_ventilated(0) && !system.circuit_not_ventilated(1));
        assert!(!system.extract_fault() && !system.overboard_valve_fault());
        assert!(!system.controller_fault() && !system.cooling_protection_fault());
        assert!(!system.cooling_overheat(0) && !system.cooling_overheat(1));
        assert!(!system.ths_bay_ventilation_fault());
    }

    #[test]
    fn nothing_is_reported_with_every_ac_bus_dead() {
        let mut test_bed = in_cruise();
        test_bed.command(|a| a.ac_bus_powered = [false; 4]);
        test_bed.fail(FailureType::AvionicsExtractionFan);
        run(&mut test_bed);

        assert!(!system(&test_bed).extract_fault());
    }

    #[test]
    fn a_failed_blowing_fan_is_covered_by_its_backup_valve() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::AvionicsBlowingFan(1));
        run(&mut test_bed);

        assert!(!system(&test_bed).circuit_not_ventilated(0));
    }

    #[test]
    fn a_circuit_without_blowing_fan_and_backup_valve_is_not_ventilated() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::AvionicsBlowingFan(2));
        test_bed.fail(FailureType::AvionicsBackupValve(2));
        run(&mut test_bed);

        let system = system(&test_bed);
        assert!(system.circuit_not_ventilated(1));
        assert!(!system.circuit_not_ventilated(0));
    }

    #[test]
    fn an_unpowered_blowing_fan_counts_as_failed() {
        let mut test_bed = in_cruise();
        test_bed.command(|a| a.ac_bus_powered = [false, true, true, true]);
        test_bed.fail(FailureType::AvionicsBackupValve(1));
        run(&mut test_bed);

        assert!(system(&test_bed).circuit_not_ventilated(0));
    }

    #[test]
    fn a_failed_extraction_fan_or_a_closed_extract_valve_is_an_extract_fault() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::AvionicsExtractionFan);
        run(&mut test_bed);
        assert!(system(&test_bed).extract_fault());

        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::AvionicsExtractValve);
        run(&mut test_bed);
        assert!(system(&test_bed).extract_fault());
    }

    #[test]
    fn the_closed_extract_valve_is_not_a_fault_once_the_extract_pb_is_at_ovrd() {
        let mut test_bed = in_cruise();
        test_bed.write_by_name("VENTILATION_EXTRACT_TOGGLE", false);
        test_bed.fail(FailureType::AvionicsExtractValve);
        run(&mut test_bed);

        assert!(!system(&test_bed).extract_fault());
        assert!(!system(&test_bed).overboard_valve_fault());
    }

    #[test]
    fn the_extract_pb_fault_light_follows_the_extract_and_overboard_valve_faults() {
        let mut test_bed = in_cruise();
        run(&mut test_bed);
        let fault_light: bool = test_bed.read_by_name("VENTILATION_EXTRACT_FAULT");
        assert!(!fault_light);

        test_bed.fail(FailureType::AvionicsOverboardValveStuckOpen);
        run(&mut test_bed);
        let fault_light: bool = test_bed.read_by_name("VENTILATION_EXTRACT_FAULT");
        assert!(fault_light);
    }

    #[test]
    fn the_overboard_valve_stuck_open_in_flight_is_a_fully_open_fault() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::AvionicsOverboardValveStuckOpen);
        run(&mut test_bed);

        let system = system(&test_bed);
        assert!(system.overboard_valve_fault());
        assert!(system.overboard_valve_fully_open());
    }

    #[test]
    fn the_overboard_valve_stuck_closed_on_ground_with_engines_off_is_a_fault() {
        let mut test_bed = in_cruise();
        test_bed.command(|a| {
            a.on_ground = true;
            a.inner_engines_n1_percent = [0.; 2];
        });
        run(&mut test_bed);
        assert!(!system(&test_bed).overboard_valve_fault());
        assert!(system(&test_bed).overboard_valve_fully_open());

        test_bed.fail(FailureType::AvionicsOverboardValveStuckClosed);
        run(&mut test_bed);
        assert!(system(&test_bed).overboard_valve_fault());
    }

    #[test]
    fn the_overboard_valve_closes_on_ground_once_both_inner_engines_are_started() {
        let mut test_bed = in_cruise();
        test_bed.command(|a| {
            a.on_ground = true;
            a.inner_engines_n1_percent = [20., 5.];
        });
        run(&mut test_bed);
        assert!(system(&test_bed).overboard_valve_fully_open());

        test_bed.command(|a| a.inner_engines_n1_percent = [20., 20.]);
        run(&mut test_bed);
        assert!(!system(&test_bed).overboard_valve_fully_open());
        assert!(!system(&test_bed).overboard_valve_fault());
    }

    #[test]
    fn a_failed_controller_stops_the_monitoring_of_the_avionics_ventilation() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::AvionicsVentilationController);
        test_bed.fail(FailureType::AvionicsExtractionFan);
        test_bed.fail(FailureType::AvionicsOverboardValveStuckOpen);
        test_bed.fail(FailureType::AvionicsBlowingFan(1));
        test_bed.fail(FailureType::AvionicsBackupValve(1));
        run(&mut test_bed);

        let system = system(&test_bed);
        assert!(system.controller_fault());
        assert!(!system.extract_fault() && !system.overboard_valve_fault());
        assert!(!system.circuit_not_ventilated(0));
    }

    #[test]
    fn a_cooling_system_overheat_is_only_detected_with_its_protection() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::SupplementalCoolingOverheat(2));
        run(&mut test_bed);
        assert!(system(&test_bed).cooling_overheat(1));
        assert!(!system(&test_bed).cooling_overheat(0));

        test_bed.fail(FailureType::SupplementalCoolingProtection(2));
        run(&mut test_bed);
        assert!(!system(&test_bed).cooling_overheat(1));
        assert!(system(&test_bed).cooling_protection_fault());
    }

    #[test]
    fn the_ths_bay_fault_is_a_failed_fan_or_no_fan_power_on_ground() {
        let mut test_bed = in_cruise();
        test_bed.fail(FailureType::ThsBayBlowingFan);
        run(&mut test_bed);
        assert!(system(&test_bed).ths_bay_ventilation_fault());

        let mut test_bed = in_cruise();
        test_bed.command(|a| a.ac_bus_powered = [true, true, false, true]);
        run(&mut test_bed);
        assert!(!system(&test_bed).ths_bay_ventilation_fault());

        test_bed.command(|a| a.on_ground = true);
        run(&mut test_bed);
        assert!(system(&test_bed).ths_bay_ventilation_fault());
    }
}
