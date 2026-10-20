use super::{fuel_tank_sensors::FuelTankSensors, A380FuelPump, FuelLevel, FuelPumpStatus};
use crate::fuel::{A380FuelTankType, ArincFuelPumpStatusProvider, ArincFuelQuantityProvider};
use enum_map::Enum;
use systems::{
    failures::{Failure, FailureType},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        ElectricalBusType, ElectricalBuses,
    },
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};
use uom::{
    si::{f64::*, mass::kilogram},
    ConstZero,
};

pub(super) struct FuelQuantityDataConcentrator {
    powered_by: ElectricalBusType,
    is_powered: bool,
    failure: Failure,
    /// The Alternate Gauging Processor: its tank quantities are the ones written to the simulator; the FQMS gets the
    /// tank sensor data through the Tank Signal Processors, which still work when it is failed
    alternate_gauging_processor_failure: Failure,

    tank_quantity_identifiers: [VariableIdentifier; A380FuelTankType::LENGTH],
    tank_quantities: [Arinc429Word<Mass>; A380FuelTankType::LENGTH],

    left_fuel_pump_running: Arinc429Word<u32>,
    right_fuel_pump_running: Arinc429Word<u32>,
}
impl FuelQuantityDataConcentrator {
    const LEFT_FUEL_PUMPS: [A380FuelPump; 10] = [
        A380FuelPump::Feed1Main,
        A380FuelPump::Feed1Stby,
        A380FuelPump::Feed2Main,
        A380FuelPump::Feed2Stby,
        A380FuelPump::LeftOuter,
        A380FuelPump::LeftMidFwd,
        A380FuelPump::LeftMidAft,
        A380FuelPump::LeftInnerFwd,
        A380FuelPump::LeftInnerAft,
        A380FuelPump::TrimLeft,
    ];
    const RIGHT_FUEL_PUMPS: [A380FuelPump; 10] = [
        A380FuelPump::Feed3Main,
        A380FuelPump::Feed3Stby,
        A380FuelPump::Feed4Main,
        A380FuelPump::Feed4Stby,
        A380FuelPump::RightOuter,
        A380FuelPump::RightMidFwd,
        A380FuelPump::RightMidAft,
        A380FuelPump::RightInnerFwd,
        A380FuelPump::RightInnerAft,
        A380FuelPump::TrimRight,
    ];
    pub(super) fn new(context: &mut InitContext, id: usize, powered_by: ElectricalBusType) -> Self {
        Self {
            powered_by,
            is_powered: false,
            failure: Failure::new(FailureType::FuelQuantityDataConcentrator(id)),
            alternate_gauging_processor_failure: Failure::new(
                FailureType::FuelAlternateGaugingProcessor(id),
            ),

            // Fuel quantities as "calculated" by the AGP and published on an arinc 429 bus
            // These values are also used the FQMS because in the sim there only exists this value
            tank_quantity_identifiers: A380FuelTankType::iterator()
                .map(|tank_type| context.get_identifier(format!("FQDC_{id}_{tank_type}_QUANTITY")))
                .collect::<Vec<_>>()
                .try_into()
                .expect("Failed to create fuel quantity identifiers array"),
            tank_quantities: [Arinc429Word::new(Mass::ZERO, SignStatus::FailureWarning);
                A380FuelTankType::LENGTH],

            left_fuel_pump_running: Arinc429Word::new(0, SignStatus::FailureWarning),
            right_fuel_pump_running: Arinc429Word::new(0, SignStatus::FailureWarning),
        }
    }

    pub(super) fn update(
        &mut self,
        fuel_levels: &(impl FuelLevel + FuelPumpStatus),
        tank_sensors: &FuelTankSensors,
    ) {
        if !self.is_healthy() {
            self.tank_quantities = Default::default();
            self.left_fuel_pump_running = Arinc429Word::default();
            self.right_fuel_pump_running = Arinc429Word::default();
            return;
        }

        let ssm = SignStatus::NormalOperation;

        self.tank_quantities[A380FuelTankType::LeftOuter.into_usize()] =
            Arinc429Word::new(fuel_levels.left_outer_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::LeftMid.into_usize()] =
            Arinc429Word::new(fuel_levels.left_mid_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::LeftInner.into_usize()] =
            Arinc429Word::new(fuel_levels.left_inner_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::FeedOne.into_usize()] =
            Arinc429Word::new(fuel_levels.feed_one_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::FeedTwo.into_usize()] =
            Arinc429Word::new(fuel_levels.feed_two_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::FeedThree.into_usize()] =
            Arinc429Word::new(fuel_levels.feed_three_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::FeedFour.into_usize()] =
            Arinc429Word::new(fuel_levels.feed_four_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::RightInner.into_usize()] =
            Arinc429Word::new(fuel_levels.right_inner_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::RightMid.into_usize()] =
            Arinc429Word::new(fuel_levels.right_mid_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::RightOuter.into_usize()] =
            Arinc429Word::new(fuel_levels.right_outer_tank_quantity(), ssm);
        self.tank_quantities[A380FuelTankType::Trim.into_usize()] =
            Arinc429Word::new(fuel_levels.trim_tank_quantity(), ssm);
        for tank in A380FuelTankType::iterator() {
            if tank_sensors.is_quantity_lost(tank) {
                self.tank_quantities[tank.into_usize()] =
                    Arinc429Word::new(Mass::ZERO, SignStatus::NoComputedData);
            }
        }

        self.left_fuel_pump_running =
            Self::update_fuel_pump_state(fuel_levels, ssm, Self::LEFT_FUEL_PUMPS);
        self.right_fuel_pump_running =
            Self::update_fuel_pump_state(fuel_levels, ssm, Self::RIGHT_FUEL_PUMPS);
    }

    fn update_fuel_pump_state(
        pump_status: &impl FuelPumpStatus,
        ssm: SignStatus,
        fuel_pumps: impl IntoIterator<Item = A380FuelPump>,
    ) -> Arinc429Word<u32> {
        let value = (11..=29).zip(fuel_pumps).fold(0, |value, (bit, pump)| {
            value | ((pump_status.is_fuel_pump_running(pump) as u32) << bit)
        });
        Arinc429Word::new(value, ssm)
    }

    pub(super) fn is_healthy(&self) -> bool {
        self.is_powered && !self.failure.is_active()
    }

    pub(super) fn is_alternate_gauging_healthy(&self) -> bool {
        self.is_healthy() && !self.alternate_gauging_processor_failure.is_active()
    }
}
impl ArincFuelQuantityProvider for FuelQuantityDataConcentrator {
    fn get_tank_quantity(&self, tank: A380FuelTankType) -> Arinc429Word<Mass> {
        self.tank_quantities[tank.into_usize()]
    }
}
impl ArincFuelPumpStatusProvider for FuelQuantityDataConcentrator {
    fn get_left_fuel_pump_running_word(&self) -> Arinc429Word<u32> {
        self.left_fuel_pump_running
    }

    fn get_right_fuel_pump_running_word(&self) -> Arinc429Word<u32> {
        self.right_fuel_pump_running
    }
}
impl SimulationElement for FuelQuantityDataConcentrator {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        self.alternate_gauging_processor_failure.accept(visitor);
        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let alternate_gauging_healthy = self.is_alternate_gauging_healthy();
        for (identifier, quantity) in self
            .tank_quantity_identifiers
            .iter()
            .zip(self.tank_quantities)
        {
            let ssm = if alternate_gauging_healthy {
                quantity.ssm()
            } else {
                SignStatus::FailureWarning
            };
            writer.write_arinc429(identifier, quantity.value().get::<kilogram>(), ssm);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rstest::{fixture, rstest};
    use systems::simulation::{
        test::{SimulationTestBed, TestBed},
        Aircraft, SimulationElementVisitor,
    };

    #[rstest]
    fn fuel_quantity_data_concentrator_writes_simvars(test_bed: FQDCTestBed) {
        for var_name in [
            "FQDC_0_FEED_1_TANK_QUANTITY",
            "FQDC_0_FEED_2_TANK_QUANTITY",
            "FQDC_0_FEED_3_TANK_QUANTITY",
            "FQDC_0_FEED_4_TANK_QUANTITY",
            "FQDC_0_LEFT_OUTER_TANK_QUANTITY",
            "FQDC_0_RIGHT_OUTER_TANK_QUANTITY",
            "FQDC_0_LEFT_MID_TANK_QUANTITY",
            "FQDC_0_RIGHT_MID_TANK_QUANTITY",
            "FQDC_0_LEFT_INNER_TANK_QUANTITY",
            "FQDC_0_RIGHT_INNER_TANK_QUANTITY",
            "FQDC_0_TRIM_TANK_QUANTITY",
        ] {
            assert!(
                test_bed.contains_variable_with_name(var_name),
                "Expected variable {var_name} to be present in the test bed",
            );
        }
    }

    #[fixture]
    fn test_bed() -> FQDCTestBed {
        FQDCTestBed(SimulationTestBed::new(TestAircraft::new))
    }

    struct FQDCTestBed(SimulationTestBed<TestAircraft>);
    impl TestBed for FQDCTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<Self::Aircraft> {
            &self.0
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<Self::Aircraft> {
            &mut self.0
        }
    }

    struct TestAircraft {
        fqdc: FuelQuantityDataConcentrator,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            let fqdc = FuelQuantityDataConcentrator::new(
                context,
                0,
                ElectricalBusType::DirectCurrentEssential,
            );
            Self { fqdc }
        }
    }
    impl Aircraft for TestAircraft {}
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.fqdc.accept(visitor);
        }
    }
}
