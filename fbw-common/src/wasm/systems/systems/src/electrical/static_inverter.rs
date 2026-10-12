use std::cell::Ref;

use uom::si::{electric_potential::volt, f64::*, frequency::hertz};

use super::{
    ElectricalElement, ElectricalElementIdentifier, ElectricalElementIdentifierProvider,
    ElectricalStateWriter, ElectricityTransformer, Potential, PotentialOrigin, ProvideFrequency,
    ProvidePotential,
};
use crate::{
    failures::{Failure, FailureType},
    shared::{ConsumePower, PowerConsumptionReport},
    simulation::{
        InitContext, SimulationElement, SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

pub struct StaticInverter {
    input_identifier: ElectricalElementIdentifier,
    output_identifier: ElectricalElementIdentifier,
    writer: ElectricalStateWriter,
    output_potential: ElectricPotential,
    output_frequency: Frequency,
    failure: Failure,
    fault_id: VariableIdentifier,
    monitoring_is_powered: bool,
}
impl StaticInverter {
    pub fn new(context: &mut InitContext) -> StaticInverter {
        StaticInverter {
            input_identifier: context.next_electrical_identifier(),
            output_identifier: context.next_electrical_identifier(),
            writer: ElectricalStateWriter::new(context, "STAT_INV"),
            output_potential: ElectricPotential::new::<volt>(0.),
            output_frequency: Frequency::new::<hertz>(0.),
            failure: Failure::new(FailureType::StaticInverter),
            fault_id: context.get_identifier("ELEC_STAT_INV_FAULT".to_owned()),
            monitoring_is_powered: false,
        }
    }

    /// The aircraft tells whether the monitoring of the inverter is powered. An aircraft which
    /// never calls this gets no static inverter fault output.
    pub fn update_monitoring(&mut self, monitoring_is_powered: bool) {
        self.monitoring_is_powered = monitoring_is_powered;
    }

    /// The fault output of the inverter (A320 ELEC STAT INV FAULT): a failed inverter with its
    /// monitoring powered, also while it does not convert.
    pub fn has_fault(&self) -> bool {
        self.monitoring_is_powered && self.failure.is_active()
    }
}
provide_potential!(StaticInverter, (110.0..=120.0));
provide_frequency!(StaticInverter, (390.0..=410.0));
impl ElectricalElement for StaticInverter {
    fn input_identifier(&self) -> ElectricalElementIdentifier {
        self.input_identifier
    }

    fn output_identifier(&self) -> ElectricalElementIdentifier {
        self.output_identifier
    }

    fn is_conductive(&self) -> bool {
        true
    }
}
impl ElectricityTransformer for StaticInverter {
    fn transform(&self, input: Ref<Potential>) -> super::Potential {
        if input.is_powered() && input.raw().get::<volt>() >= 16. {
            Potential::new(PotentialOrigin::StaticInverter, self.output_potential)
        } else {
            Potential::none()
        }
    }
}
impl SimulationElement for StaticInverter {
    fn accept<T: crate::simulation::SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        self.writer.write_alternating(self, writer);
        writer.write(&self.fault_id, self.has_fault());
    }

    fn consume_power_in_converters<T: ConsumePower>(
        &mut self,
        _: &UpdateContext,
        consumption: &mut T,
    ) {
        let ac_power = consumption.total_consumption_of(PotentialOrigin::StaticInverter);

        // Add the AC consumption to the STAT INVs input (DC) consumption.
        // Currently static inverter inefficiency isn't modelled.
        // It is to be expected that DC consumption should actually be somewhat
        // higher than AC consumption.
        consumption.consume_from_input(self, ac_power);
    }

    fn process_power_consumption_report<T: PowerConsumptionReport>(
        &mut self,
        _: &UpdateContext,
        report: &T,
    ) {
        let has_output = report.is_powered(self) && !self.failure.is_active();
        self.output_potential = if has_output {
            ElectricPotential::new::<volt>(115.)
        } else {
            ElectricPotential::new::<volt>(0.)
        };

        self.output_frequency = if has_output {
            Frequency::new::<hertz>(400.)
        } else {
            Frequency::new::<hertz>(0.)
        };
    }
}

#[cfg(test)]
mod static_inverter_tests {
    use uom::si::power::watt;

    use super::*;
    use crate::simulation::test::ReadByName;
    use crate::simulation::InitContext;
    use crate::{
        electrical::{
            consumption::PowerConsumer, test::TestElectricitySource, ElectricalBus,
            ElectricalBusType, Electricity,
        },
        simulation::{
            test::{SimulationTestBed, TestBed},
            Aircraft, SimulationElementVisitor, UpdateContext,
        },
    };

    struct StaticInverterTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl StaticInverterTestBed {
        fn with_powered_static_inverter() -> Self {
            Self {
                test_bed: SimulationTestBed::new(|context| {
                    TestAircraft::new(context).with_powered_static_inverter()
                }),
            }
        }

        fn with_unpowered_static_inverter() -> Self {
            Self {
                test_bed: SimulationTestBed::new(|context| {
                    TestAircraft::new(context).with_unpowered_static_inverter()
                }),
            }
        }

        fn frequency_is_normal(&mut self) -> bool {
            self.read_by_name("ELEC_STAT_INV_FREQUENCY_NORMAL")
        }

        fn potential_is_normal(&mut self) -> bool {
            self.read_by_name("ELEC_STAT_INV_POTENTIAL_NORMAL")
        }

        fn static_inverter_is_powered(&self) -> bool {
            self.query_elec(|a, elec| a.static_inverter_is_powered(elec))
        }

        fn has_fault(&mut self) -> bool {
            self.read_by_name("ELEC_STAT_INV_FAULT")
        }
    }
    impl TestBed for StaticInverterTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    struct TestAircraft {
        electricity_source: TestElectricitySource,
        bus: ElectricalBus,
        static_inverter: StaticInverter,
        consumer: PowerConsumer,
        static_inverter_consumption: Power,
        monitoring_is_powered: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                electricity_source: TestElectricitySource::unpowered(
                    context,
                    PotentialOrigin::Battery(1),
                ),
                bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrentEssential),
                consumer: PowerConsumer::from(ElectricalBusType::AlternatingCurrentEssential),
                static_inverter: StaticInverter::new(context),
                static_inverter_consumption: Power::new::<watt>(0.),
                monitoring_is_powered: false,
            }
        }

        fn power_monitoring(&mut self, powered: bool) {
            self.monitoring_is_powered = powered;
        }

        fn with_powered_static_inverter(mut self) -> Self {
            self.electricity_source.power();
            self
        }

        fn with_unpowered_static_inverter(mut self) -> Self {
            self.electricity_source.unpower();
            self
        }

        fn static_inverter_is_powered(&self, electricity: &Electricity) -> bool {
            electricity.is_powered(&self.static_inverter)
        }

        fn power_demand(&mut self, power: Power) {
            self.consumer.demand(power);
        }

        fn static_inverter_consumption(&self) -> Power {
            self.static_inverter_consumption
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.static_inverter
                .update_monitoring(self.monitoring_is_powered);
            electricity.supplied_by(&self.electricity_source);
            electricity.flow(&self.electricity_source, &self.static_inverter);
            electricity.transform_in(&self.static_inverter);
            electricity.flow(&self.static_inverter, &self.bus);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.static_inverter.accept(visitor);
            self.consumer.accept(visitor);

            visitor.visit(self);
        }

        fn process_power_consumption_report<T: PowerConsumptionReport>(
            &mut self,
            _: &UpdateContext,
            report: &T,
        ) {
            self.static_inverter_consumption =
                report.total_consumption_of(PotentialOrigin::StaticInverter);
        }
    }

    #[test]
    fn a_failed_inverter_reports_its_fault_while_its_monitoring_is_powered_even_when_idle() {
        let mut test_bed = StaticInverterTestBed::with_unpowered_static_inverter();
        test_bed.command(|a| a.power_monitoring(true));
        test_bed.fail(FailureType::StaticInverter);

        test_bed.run();

        assert!(test_bed.has_fault());
    }

    #[test]
    fn a_failed_inverter_without_monitoring_power_reports_no_fault() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();
        test_bed.fail(FailureType::StaticInverter);

        test_bed.run();

        assert!(!test_bed.has_fault());
    }

    #[test]
    fn a_healthy_inverter_reports_no_fault() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();
        test_bed.command(|a| a.power_monitoring(true));

        test_bed.run();

        assert!(!test_bed.has_fault());
    }

    #[test]
    fn when_unpowered_has_no_output() {
        let mut test_bed = StaticInverterTestBed::with_unpowered_static_inverter();

        test_bed.run();

        assert!(!test_bed.static_inverter_is_powered());
    }

    #[test]
    fn when_powered_has_output() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();

        test_bed.run();

        assert!(test_bed.static_inverter_is_powered());
    }

    #[test]
    fn when_unpowered_frequency_is_not_normal() {
        let mut test_bed = StaticInverterTestBed::with_unpowered_static_inverter();

        test_bed.run();

        assert!(!test_bed.frequency_is_normal());
    }

    #[test]
    fn when_powered_frequency_is_normal() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();

        test_bed.run();

        assert!(test_bed.frequency_is_normal());
    }

    #[test]
    fn when_unpowered_potential_is_not_normal() {
        let mut test_bed = StaticInverterTestBed::with_unpowered_static_inverter();

        test_bed.run();

        assert!(!test_bed.potential_is_normal());
    }

    #[test]
    fn when_powered_potential_is_normal() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();

        test_bed.run();

        assert!(test_bed.potential_is_normal());
    }

    #[test]
    fn when_unpowered_has_no_consumption() {
        let mut test_bed = StaticInverterTestBed::with_unpowered_static_inverter();

        test_bed.run();

        assert_eq!(
            test_bed.query(|a| a.static_inverter_consumption()),
            Power::new::<watt>(0.)
        );
    }

    #[test]
    fn when_powered_without_demand_has_no_consumption() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();

        test_bed.command(|a| a.power_demand(Power::new::<watt>(0.)));
        test_bed.run();

        assert_eq!(
            test_bed.query(|a| a.static_inverter_consumption()),
            Power::new::<watt>(0.)
        );
    }

    #[test]
    fn when_powered_with_demand_has_consumption() {
        let mut test_bed = StaticInverterTestBed::with_powered_static_inverter();

        test_bed.command(|a| a.power_demand(Power::new::<watt>(200.)));
        test_bed.run();

        assert_eq!(
            test_bed.query(|a| a.static_inverter_consumption()),
            Power::new::<watt>(200.)
        );
    }

    #[test]
    fn writes_its_state() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);

        test_bed.run();

        assert!(test_bed.contains_variable_with_name("ELEC_STAT_INV_POTENTIAL"));
        assert!(test_bed.contains_variable_with_name("ELEC_STAT_INV_POTENTIAL_NORMAL"));
        assert!(test_bed.contains_variable_with_name("ELEC_STAT_INV_FREQUENCY"));
        assert!(test_bed.contains_variable_with_name("ELEC_STAT_INV_FREQUENCY_NORMAL"));
    }
}
