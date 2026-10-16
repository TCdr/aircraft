//! The aft cargo ventilation isolation valves and their AFT ISOL VALVE pb-sw of the CARGO VENT panel.
//!
//! FCOM DSC-21-40-20 AFT CARGO VENTILATION (a320_fcom.txt l.9701-9716): "Air from the cabin goes via the inlet
//! isolation valve to the aft cargo compartment, driven by an extraction fan. Air is controlled by the outlet isolation
//! valve [...]. The cargo ventilation controller controls the operation of the inlet and outlet isolation valves and
//! the extraction fan. [...] The controller closes the isolation valves and stops the extraction fan when:
//! - The flight crew sets the AFT ISOL VALVE pb-sw to OFF, or
//! - The aft cargo smoke detection unit detects smoke."
//!
//! FAULT light: FCOM PRO-ABN-COND COND FWD(AFT) CRG ISOL VALVE (l.74019-74027) "This alert triggers if the
//! forward(aft) cargo isolation valve disagrees with the selected position". The selected position is the one the
//! controller commands, so the automatic closure on smoke is no disagreement. The FWC reads the same disagreement (the
//! FAULT light L:var) for that alert (FWC/Logic/VentilationAlerts.ts), and the valve positions for AIR AFT CRG VENT
//! FAULT (the extraction fan runs only with the valves fully open).
//!
//! flyPad failure 21026: the isolation valves stuck closed.
//!
//! Not modelled yet: the extraction fan and the airflow through the compartment (the fan failure is a TS-only flyPad
//! failure of the FWC), the electrical supply of the controller (not in the FCOM) and a valve travel time (not in the
//! FCOM: the valves follow their command at once). The FWD cargo ventilation (FWD ISOL VALVE pb-sw) is not installed
//! on this aircraft.

use systems::{
    failures::{Failure, FailureType},
    overhead::AutoOffFaultPushButton,
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// One isolation valve: open or closed. A valve stuck closed stays closed.
struct CargoIsolationValve {
    is_open_id: VariableIdentifier,
    is_open: bool,
}

impl CargoIsolationValve {
    fn new(context: &mut InitContext, name: &str) -> Self {
        Self {
            is_open_id: context
                .get_identifier(format!("CARGO_VENT_AFT_{}_ISOL_VALVE_IS_OPEN", name)),
            // The pb-sw is in AUTO on a cold and dark aircraft: the valves are open
            is_open: true,
        }
    }

    fn update(&mut self, open_command: bool, is_stuck_closed: bool) {
        self.is_open = open_command && !is_stuck_closed;
    }

    fn is_open(&self) -> bool {
        self.is_open
    }
}

impl SimulationElement for CargoIsolationValve {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.is_open_id, self.is_open);
    }
}

pub(super) struct A320AftCargoVentilation {
    isolation_valve_pb: AutoOffFaultPushButton,
    inlet_isolation_valve: CargoIsolationValve,
    outlet_isolation_valve: CargoIsolationValve,
    /// flyPad failure 21026: both isolation valves stuck closed
    isolation_valves_stuck_closed: Failure,
}

impl A320AftCargoVentilation {
    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            isolation_valve_pb: AutoOffFaultPushButton::new_auto(
                context,
                "CARGO_VENT_AFT_ISOL_VALVE",
            ),
            inlet_isolation_valve: CargoIsolationValve::new(context, "INLET"),
            outlet_isolation_valve: CargoIsolationValve::new(context, "OUTLET"),
            isolation_valves_stuck_closed: Failure::new(
                FailureType::AftCargoIsolationValvesStuckClosed,
            ),
        }
    }

    /// @param aft_cargo_smoke_detected the aft cargo smoke detection unit detects smoke (the update of the fire
    /// protection that ran before this one)
    pub(super) fn update(&mut self, aft_cargo_smoke_detected: bool) {
        // l.9714-9716: closed with the pb-sw OFF or smoke in the aft cargo compartment
        let open_command = self.isolation_valve_pb.is_auto() && !aft_cargo_smoke_detected;
        let is_stuck_closed = self.isolation_valves_stuck_closed.is_active();

        self.inlet_isolation_valve
            .update(open_command, is_stuck_closed);
        self.outlet_isolation_valve
            .update(open_command, is_stuck_closed);

        // l.74026-74027: a valve disagrees with the commanded position
        self.isolation_valve_pb.set_fault(
            self.inlet_isolation_valve.is_open() != open_command
                || self.outlet_isolation_valve.is_open() != open_command,
        );
    }

    #[cfg(test)]
    fn isolation_valves_are_open(&self) -> [bool; 2] {
        [
            self.inlet_isolation_valve.is_open(),
            self.outlet_isolation_valve.is_open(),
        ]
    }
}

impl SimulationElement for A320AftCargoVentilation {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.isolation_valve_pb.accept(visitor);
        self.inlet_isolation_valve.accept(visitor);
        self.outlet_isolation_valve.accept(visitor);
        self.isolation_valves_stuck_closed.accept(visitor);

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, UpdateContext,
    };

    struct TestAircraft {
        aft_cargo_ventilation: A320AftCargoVentilation,
        aft_cargo_smoke_detected: bool,
    }

    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                aft_cargo_ventilation: A320AftCargoVentilation::new(context),
                aft_cargo_smoke_detected: false,
            }
        }
    }

    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, _: &UpdateContext) {
            self.aft_cargo_ventilation
                .update(self.aft_cargo_smoke_detected);
        }
    }

    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.aft_cargo_ventilation.accept(visitor);

            visitor.visit(self);
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        set_pb_auto(&mut test_bed, true);
        test_bed.run();
        test_bed
    }

    fn set_pb_auto(test_bed: &mut SimulationTestBed<TestAircraft>, is_auto: bool) {
        test_bed.write_by_name("OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_IS_AUTO", is_auto);
    }

    fn valves_are_open(test_bed: &SimulationTestBed<TestAircraft>) -> [bool; 2] {
        test_bed.query(|a| a.aft_cargo_ventilation.isolation_valves_are_open())
    }

    fn pb_has_fault(test_bed: &mut SimulationTestBed<TestAircraft>) -> bool {
        test_bed.read_by_name("OVHD_CARGO_VENT_AFT_ISOL_VALVE_PB_HAS_FAULT")
    }

    #[test]
    fn isolation_valves_are_open_with_the_pb_sw_in_auto() {
        let mut test_bed = test_bed();
        test_bed.run();

        assert_eq!(valves_are_open(&test_bed), [true, true]);
        assert!(!pb_has_fault(&mut test_bed));
    }

    // FCOM l.9715: "The flight crew sets the AFT ISOL VALVE pb-sw to OFF"
    #[test]
    fn pb_sw_off_closes_both_isolation_valves() {
        let mut test_bed = test_bed();

        set_pb_auto(&mut test_bed, false);
        test_bed.run();
        test_bed.run();

        assert_eq!(valves_are_open(&test_bed), [false, false]);
        assert!(!pb_has_fault(&mut test_bed));
        let inlet_is_open: bool = test_bed.read_by_name("CARGO_VENT_AFT_INLET_ISOL_VALVE_IS_OPEN");
        let outlet_is_open: bool =
            test_bed.read_by_name("CARGO_VENT_AFT_OUTLET_ISOL_VALVE_IS_OPEN");
        assert!(!inlet_is_open);
        assert!(!outlet_is_open);

        set_pb_auto(&mut test_bed, true);
        test_bed.run();
        test_bed.run();

        assert_eq!(valves_are_open(&test_bed), [true, true]);
    }

    // FCOM l.9716: "The aft cargo smoke detection unit detects smoke"
    #[test]
    fn aft_cargo_smoke_closes_both_isolation_valves_without_fault() {
        let mut test_bed = test_bed();

        test_bed.command(|a| a.aft_cargo_smoke_detected = true);
        test_bed.run();
        test_bed.run();

        assert_eq!(valves_are_open(&test_bed), [false, false]);
        assert!(!pb_has_fault(&mut test_bed));
    }

    // FCOM l.74026-74027: the valves disagree with the selected position
    #[test]
    fn valves_stuck_closed_light_the_fault_while_commanded_open() {
        let mut test_bed = test_bed();

        test_bed.fail(FailureType::AftCargoIsolationValvesStuckClosed);
        test_bed.run();
        test_bed.run();

        assert_eq!(valves_are_open(&test_bed), [false, false]);
        assert!(pb_has_fault(&mut test_bed));

        // Set OFF, the closed valves agree with the selection
        set_pb_auto(&mut test_bed, false);
        test_bed.run();
        test_bed.run();

        assert!(!pb_has_fault(&mut test_bed));
    }

    #[test]
    fn valves_stuck_closed_give_no_fault_with_aft_cargo_smoke() {
        let mut test_bed = test_bed();

        test_bed.fail(FailureType::AftCargoIsolationValvesStuckClosed);
        test_bed.command(|a| a.aft_cargo_smoke_detected = true);
        test_bed.run();
        test_bed.run();

        assert!(!pb_has_fault(&mut test_bed));
    }
}
