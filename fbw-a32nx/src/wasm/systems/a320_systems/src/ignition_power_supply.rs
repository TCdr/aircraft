//! The electrical supply of the igniters of an A320 engine.
//!
//! Igniter A of both engines is supplied by the AC ESS BUS, and switches to the STAT INV bus as
//! soon as the static inverter works. Igniter B is supplied by AC BUS 1 for engine 1 and AC BUS 2
//! for engine 2. An igniter without power does not light the engine (see
//! `EngineStartSequence::set_powered_igniters`): in the emergency electrical configuration only
//! igniter A remains.

use systems::{
    engine::engine_start::Igniters,
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{SimulationElement, SimulationElementVisitor},
};

pub struct A320IgnitionPowerSupply {
    igniter_b_supply: ElectricalBusType,
    powered: Igniters,
}
impl A320IgnitionPowerSupply {
    pub fn new(engine_number: usize) -> Self {
        Self {
            igniter_b_supply: ElectricalBusType::AlternatingCurrent(engine_number as u8),
            powered: Igniters::default(),
        }
    }

    pub fn powered_igniters(&self) -> Igniters {
        self.powered
    }
}
impl SimulationElement for A320IgnitionPowerSupply {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.powered = Igniters {
            a: buses.any_is_powered(&[
                ElectricalBusType::AlternatingCurrentStaticInverter,
                ElectricalBusType::AlternatingCurrentEssential,
            ]),
            b: buses.is_powered(self.igniter_b_supply),
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{SimulationTestBed, TestBed},
            Aircraft, InitContext, UpdateContext,
        },
    };

    struct TestAircraft {
        supplies: [A320IgnitionPowerSupply; 2],
        source: TestElectricitySource,
        buses: Vec<(ElectricalBusType, ElectricalBus)>,
        powered_buses: Vec<ElectricalBusType>,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                supplies: [1, 2].map(A320IgnitionPowerSupply::new),
                source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: [
                    ElectricalBusType::AlternatingCurrent(1),
                    ElectricalBusType::AlternatingCurrent(2),
                    ElectricalBusType::AlternatingCurrentEssential,
                    ElectricalBusType::AlternatingCurrentStaticInverter,
                ]
                .into_iter()
                .map(|bus_type| (bus_type, ElectricalBus::new(context, bus_type)))
                .collect(),
                powered_buses: vec![],
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
            for (bus_type, bus) in &self.buses {
                if self.powered_buses.contains(bus_type) {
                    electricity.flow(&self.source, bus);
                }
            }
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            for supply in &mut self.supplies {
                supply.accept(visitor);
            }
            for (_, bus) in &mut self.buses {
                bus.accept(visitor);
            }

            visitor.visit(self);
        }
    }

    fn powered_igniters(powered_buses: &[ElectricalBusType]) -> [Igniters; 2] {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        let powered_buses = powered_buses.to_vec();
        test_bed.command(|a| a.powered_buses = powered_buses);
        test_bed.run();
        test_bed.query(|a| a.supplies.each_ref().map(|s| s.powered_igniters()))
    }

    const BOTH: Igniters = Igniters { a: true, b: true };
    const A_ONLY: Igniters = Igniters { a: true, b: false };
    const B_ONLY: Igniters = Igniters { a: false, b: true };
    const NONE: Igniters = Igniters { a: false, b: false };

    #[test]
    fn normal_supply_powers_both_igniters_of_both_engines() {
        assert_eq!(
            powered_igniters(&[
                ElectricalBusType::AlternatingCurrent(1),
                ElectricalBusType::AlternatingCurrent(2),
                ElectricalBusType::AlternatingCurrentEssential,
            ]),
            [BOTH, BOTH]
        );
    }

    #[test]
    fn igniter_b_follows_the_ac_bus_of_its_engine() {
        assert_eq!(
            powered_igniters(&[
                ElectricalBusType::AlternatingCurrent(2),
                ElectricalBusType::AlternatingCurrentEssential,
            ]),
            [A_ONLY, BOTH]
        );
        assert_eq!(
            powered_igniters(&[ElectricalBusType::AlternatingCurrent(1)]),
            [B_ONLY, NONE]
        );
    }

    #[test]
    fn igniter_a_is_on_the_static_inverter_once_it_works() {
        assert_eq!(
            powered_igniters(&[ElectricalBusType::AlternatingCurrentStaticInverter]),
            [A_ONLY, A_ONLY]
        );
    }
}
