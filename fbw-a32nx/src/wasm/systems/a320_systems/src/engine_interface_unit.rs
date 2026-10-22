//! The Engine Interface Units (EIU) of the A320, one per engine.
//!
//! The EIU transmits to the FADEC of its engine the aircraft data the FADEC uses for the engine
//! management: among them the ENG MASTER, ENG MODE selector and ENG MAN START positions, the
//! flight or ground status and the slats position. An EIU that is failed (flyPad failure) or not
//! powered no longer sends them: ENG 1(2) EIU FAULT (the data bus between the EIU and the FADEC is
//! lost), with these effects on that engine:
//! - its start is lost: no start sequence on the ground and no relight in flight
//!   (`EngineStartSequence::set_start_commands_lost`);
//! - the A/THR control is lost: the flight computer interface of fbw_a320 cuts the A/THR orders to
//!   that FADEC, as for a FADEC FAULT;
//! - its thrust reverser is lost;
//! - the thrust lever failure rules of the FADEC use the Mach number in place of the slats position
//!   (`engine_control_failure`);
//! - only approach idle is available (`IdleControl_A32NX` of the fadec_a32nx module);
//! - the N1 limit loses its bleed corrections (`N1LimitBleedCorrection_A32NX` of the fadec_a32nx
//!   module).
//!
//! The fadec_a32nx module computes one idle setting and one N1 limit for both engines: either EIU
//! lost gives the approach idle and the uncorrected N1 limit to both.
//!
//! Supply: EIU 2 by the DC ESS BUS, which loses it. Design choice: EIU 1 by DC BUS 1 or the DC ESS
//! BUS, as no single DC bus fault loses EIU 1.

use systems::{
    failures::{Failure, FailureType},
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

const EIU_1_SUPPLIES: [ElectricalBusType; 2] = [
    ElectricalBusType::DirectCurrent(1),
    ElectricalBusType::DirectCurrentEssential,
];
const EIU_2_SUPPLIES: [ElectricalBusType; 1] = [ElectricalBusType::DirectCurrentEssential];

struct A320EngineInterfaceUnit {
    failure: Failure,
    supplies: &'static [ElectricalBusType],
    is_powered: bool,

    fault_id: VariableIdentifier,
}
impl A320EngineInterfaceUnit {
    fn new(
        context: &mut InitContext,
        engine_number: usize,
        supplies: &'static [ElectricalBusType],
    ) -> Self {
        Self {
            failure: Failure::new(FailureType::EngineInterfaceUnit(engine_number)),
            supplies,
            is_powered: false,
            fault_id: context.get_identifier(format!("ENGINE_{}_EIU_FAULT", engine_number)),
        }
    }

    /// The EIU sends the aircraft data to its FADEC.
    fn is_operative(&self) -> bool {
        self.is_powered && !self.failure.is_active()
    }
}
impl SimulationElement for A320EngineInterfaceUnit {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.any_is_powered(self.supplies);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fault_id, !self.is_operative());
    }
}

/// The EIUs of both engines. Writes `ENGINE_n_EIU_FAULT`.
pub struct A320EngineInterfaceUnits {
    units: [A320EngineInterfaceUnit; 2],
}
impl A320EngineInterfaceUnits {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            units: [
                A320EngineInterfaceUnit::new(context, 1, &EIU_1_SUPPLIES),
                A320EngineInterfaceUnit::new(context, 2, &EIU_2_SUPPLIES),
            ],
        }
    }

    /// Per engine, the EIU sends the aircraft data to the FADEC.
    pub fn operative(&self) -> [bool; 2] {
        [self.units[0].is_operative(), self.units[1].is_operative()]
    }
}
impl SimulationElement for A320EngineInterfaceUnits {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for unit in &mut self.units {
            unit.accept(visitor);
        }

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed},
            Aircraft, UpdateContext,
        },
    };

    struct TestAircraft {
        units: A320EngineInterfaceUnits,
        source: TestElectricitySource,
        dc_1: ElectricalBus,
        dc_ess: ElectricalBus,
        dc_1_powered: bool,
        dc_ess_powered: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                units: A320EngineInterfaceUnits::new(context),
                source: TestElectricitySource::powered(context, PotentialOrigin::Battery(1)),
                dc_1: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                dc_ess: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_1_powered: true,
                dc_ess_powered: true,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.source);
            if self.dc_1_powered {
                electricity.flow(&self.source, &self.dc_1);
            }
            if self.dc_ess_powered {
                electricity.flow(&self.source, &self.dc_ess);
            }
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.units.accept(visitor);
            self.dc_1.accept(visitor);
            self.dc_ess.accept(visitor);

            visitor.visit(self);
        }
    }

    fn powered_test_bed(
        dc_1_powered: bool,
        dc_ess_powered: bool,
    ) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| {
            a.dc_1_powered = dc_1_powered;
            a.dc_ess_powered = dc_ess_powered;
        });
        test_bed.run();
        test_bed
    }

    fn eiu_faults(test_bed: &mut SimulationTestBed<TestAircraft>) -> [bool; 2] {
        [
            test_bed.read_by_name("ENGINE_1_EIU_FAULT"),
            test_bed.read_by_name("ENGINE_2_EIU_FAULT"),
        ]
    }

    #[test]
    fn powered_eius_are_operative() {
        let mut test_bed = powered_test_bed(true, true);
        assert_eq!(test_bed.query(|a| a.units.operative()), [true, true]);
        assert_eq!(eiu_faults(&mut test_bed), [false, false]);
    }

    #[test]
    fn a_failed_eiu_is_lost_for_its_engine_only() {
        let mut test_bed = powered_test_bed(true, true);
        test_bed.fail(FailureType::EngineInterfaceUnit(2));
        test_bed.run();
        assert_eq!(test_bed.query(|a| a.units.operative()), [true, false]);
        assert_eq!(eiu_faults(&mut test_bed), [false, true]);
    }

    #[test]
    fn the_dc_ess_bus_loss_loses_eiu_2_only() {
        let mut test_bed = powered_test_bed(true, false);
        assert_eq!(test_bed.query(|a| a.units.operative()), [true, false]);
        assert_eq!(eiu_faults(&mut test_bed), [false, true]);
    }

    #[test]
    fn eiu_1_needs_dc_bus_1_or_the_dc_ess_bus() {
        let test_bed = powered_test_bed(false, true);
        assert_eq!(test_bed.query(|a| a.units.operative()), [true, true]);

        let mut test_bed = powered_test_bed(false, false);
        assert_eq!(test_bed.query(|a| a.units.operative()), [false, false]);
        assert_eq!(eiu_faults(&mut test_bed), [true, true]);
    }
}
