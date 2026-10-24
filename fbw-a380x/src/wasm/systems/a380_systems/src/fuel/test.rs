use std::{collections::HashMap, time::Duration};

use ntest::{assert_false, assert_true};
use systems::{
    electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
    engine::EngineFireOverheadPanel,
    failures::FailureType,
    fuel::RefuelRate,
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        PotentialOrigin,
    },
    simulation::test::ReadByName,
};
use uom::si::{electric_potential::volt, f64::ElectricPotential, mass::kilogram};

use super::*;
use crate::{
    airframe::A380Airframe,
    systems::simulation::{
        test::{SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElement, SimulationElementVisitor,
    },
};
struct FuelTestAircraft {
    acdn: A380AvionicsDataCommunicationNetwork,
    engine_fire_overhead: EngineFireOverheadPanel<4>,
    fuel: A380Fuel,
    source: TestElectricitySource,
    /// The buses of the FQDCs (501PP, DC 1) and of the CPIOM-F (108PH, 502PP)
    fuel_measurement_buses: [ElectricalBus; 4],
    fuel_measurement_powered: bool,
}

impl FuelTestAircraft {
    fn new(context: &mut InitContext) -> Self {
        Self {
            acdn: A380AvionicsDataCommunicationNetwork::new(context),
            engine_fire_overhead: EngineFireOverheadPanel::new(context),
            fuel: A380Fuel::new(context),
            source: TestElectricitySource::powered(context, PotentialOrigin::EngineGenerator(1)),
            fuel_measurement_buses: [
                ElectricalBus::new(context, ElectricalBusType::Sub("501PP")),
                ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                ElectricalBus::new(context, ElectricalBusType::DirectCurrentNamed("108PH")),
                ElectricalBus::new(context, ElectricalBusType::DirectCurrentNamed("502PP")),
            ],
            fuel_measurement_powered: false,
        }
    }

    fn fore_aft_center_of_gravity(&self) -> f64 {
        self.fuel.fore_aft_center_of_gravity()
    }

    fn tank_mass(&self, tank: usize) -> Mass {
        self.fuel.tank_mass(tank)
    }
}

impl Aircraft for FuelTestAircraft {
    fn update_before_power_distribution(
        &mut self,
        context: &UpdateContext,
        electricity: &mut Electricity,
    ) {
        if self.fuel_measurement_powered {
            self.source
                .power_with_potential(ElectricPotential::new::<volt>(28.));
            electricity.supplied_by(&self.source);
            for bus in &self.fuel_measurement_buses {
                electricity.flow(&self.source, bus);
            }
        }
        self.acdn.update();
        self.fuel.update(
            context,
            &self.acdn,
            A380Airframe::get_loadsheet(),
            &self.engine_fire_overhead,
        );
    }
}
impl SimulationElement for FuelTestAircraft {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.acdn.accept(visitor);
        self.engine_fire_overhead.accept(visitor);
        self.fuel.accept(visitor);
        for bus in &mut self.fuel_measurement_buses {
            bus.accept(visitor);
        }

        visitor.visit(self);
    }
}

const MINUTES_TO_SECONDS: u64 = 60;
const FUEL_GALLONS_TO_KG: f64 = 3.039075693483925;

struct FuelTestBed {
    test_bed: SimulationTestBed<FuelTestAircraft>,
}
impl FuelTestBed {
    fn new() -> Self {
        FuelTestBed {
            test_bed: SimulationTestBed::new(FuelTestAircraft::new),
        }
    }

    fn and_run(mut self) -> Self {
        self.run();

        self
    }

    fn and_stabilize(mut self) -> Self {
        let five_minutes = 5 * MINUTES_TO_SECONDS;
        self.test_bed
            .run_multiple_frames(Duration::from_secs(five_minutes));

        self
    }

    fn run_multiple_frames(mut self, duration: Duration) -> Self {
        self.test_bed.run_multiple_frames(duration);
        self
    }

    fn fuel_low(mut self) -> Self {
        self.write_by_name("FUEL_TANK_QUANTITY_1", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_2", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_3", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_4", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_5", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_6", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_7", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_8", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_9", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_10", 300. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_11", 300. / FUEL_GALLONS_TO_KG);

        self
    }

    fn fuel_high(mut self) -> Self {
        self.write_by_name("FUEL_TANK_QUANTITY_1", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_2", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_3", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_4", 10000. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_5", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_6", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_7", 10000. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_8", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_9", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_10", 1500. / FUEL_GALLONS_TO_KG);
        self.write_by_name("FUEL_TANK_QUANTITY_11", 1500. / FUEL_GALLONS_TO_KG);

        self
    }

    #[allow(dead_code)]
    fn desired_fuel_a(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 18000.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_b(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 26000.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_c(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 36000.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_d(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 47000.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_e(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 103788.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_f(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 158042.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_g(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 215702.);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_h(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 223088.);
        self
    }

    #[cfg(test)]
    fn desired_fuel_max(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 259755.);
        self.write_by_name("AIRFRAME_ZFW_DESIRED", 300000.);
        self.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", 36.5);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_min(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 0.);
        self.write_by_name("AIRFRAME_ZFW_DESIRED", 300000.);
        self.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", 36.5);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_50000(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 50000.);
        self.write_by_name("AIRFRAME_ZFW_DESIRED", 300000.);
        self.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", 36.5);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_100000(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 100000.);
        self.write_by_name("AIRFRAME_ZFW_DESIRED", 300000.);
        self.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", 36.5);
        self
    }

    #[allow(dead_code)]
    fn desired_fuel_200000(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 200000.);
        self.write_by_name("AIRFRAME_ZFW_DESIRED", 300000.);
        self.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", 36.5);
        self
    }

    #[cfg(test)]
    fn desired_fuel_250000(mut self) -> Self {
        self.write_by_name("FUEL_DESIRED", 250000.);
        self.write_by_name("AIRFRAME_ZFW_DESIRED", 300000.);
        self.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", 36.5);
        self
    }

    fn trigger_instant_refuel(mut self) -> Self {
        self.write_by_name("EFB_REFUEL_RATE_SETTING", RefuelRate::Instant);
        self.write_by_name("REFUEL_STARTED_BY_USR", true);
        self
    }

    fn trigger_fast_refuel(mut self) -> Self {
        self.write_by_name("EFB_REFUEL_RATE_SETTING", RefuelRate::Fast);
        self.write_by_name("REFUEL_STARTED_BY_USR", true);
        self
    }

    fn trigger_real_refuel(mut self) -> Self {
        self.write_by_name("EFB_REFUEL_RATE_SETTING", RefuelRate::Real);
        self.write_by_name("REFUEL_STARTED_BY_USR", true);
        self
    }

    fn refuel_status(&mut self) -> bool {
        self.read_by_name("REFUEL_STARTED_BY_USR")
    }

    fn fore_aft_center_of_gravity(&self) -> f64 {
        self.query(|a: &FuelTestAircraft| a.fore_aft_center_of_gravity())
    }

    fn tank_mass(&self, tank: usize) -> Mass {
        self.query(|a: &FuelTestAircraft| a.tank_mass(tank))
    }

    /// The FQDCs and the CPIOM-F powered, the FQMS self test done
    fn with_fuel_measurement_powered(mut self) -> Self {
        self.command(|a| a.fuel_measurement_powered = true);
        self.run_multiple_frames(Duration::from_secs(31))
    }

    fn quantity_system_faults(&mut self) -> u32 {
        self.read_by_name("FUEL_QUANTITY_SYSTEM_FAULTS")
    }

    fn feed_one_quantity_word(&mut self, source: &str) -> Arinc429Word<f64> {
        self.read_arinc429_by_name(&format!("{source}_FEED_1_TANK_QUANTITY"))
    }
}

impl TestBed for FuelTestBed {
    type Aircraft = FuelTestAircraft;

    fn test_bed(&self) -> &SimulationTestBed<FuelTestAircraft> {
        &self.test_bed
    }

    fn test_bed_mut(&mut self) -> &mut SimulationTestBed<FuelTestAircraft> {
        &mut self.test_bed
    }
}

fn test_bed() -> FuelTestBed {
    FuelTestBed::new()
}

fn test_bed_with() -> FuelTestBed {
    test_bed()
}

fn assert_fuel_quantity(
    test_bed: &FuelTestBed,
    expected_quantities: HashMap<A380FuelTankType, Mass>,
) {
    for tank in A380FuelTankType::iterator() {
        assert_eq!(
            test_bed.tank_mass(tank as usize).get::<kilogram>().round(),
            (*expected_quantities.get(&tank).unwrap_or(&Mass::default()))
                .get::<kilogram>()
                .round(),
            "Actual Mass of {:?} was {:?}",
            tank,
            test_bed.tank_mass(tank as usize).get::<kilogram>(),
        )
    }
}

fn assert_fuel_quantity_0(test_bed: &FuelTestBed) {
    let expected_quantities = HashMap::new();
    assert_fuel_quantity(test_bed, expected_quantities);
}

fn assert_fuel_quantity_50000(test_bed: &FuelTestBed) {
    let mut expected_quantities = HashMap::new();
    expected_quantities.insert(A380FuelTankType::Trim, Mass::new::<kilogram>(3000.));
    expected_quantities.insert(A380FuelTankType::LeftOuter, Mass::new::<kilogram>(4000.));
    expected_quantities.insert(A380FuelTankType::RightOuter, Mass::new::<kilogram>(4000.));
    expected_quantities.insert(A380FuelTankType::LeftInner, Mass::new::<kilogram>(5500.));
    expected_quantities.insert(A380FuelTankType::RightInner, Mass::new::<kilogram>(5500.));
    expected_quantities.insert(A380FuelTankType::FeedOne, Mass::new::<kilogram>(7000.));
    expected_quantities.insert(A380FuelTankType::FeedTwo, Mass::new::<kilogram>(7000.));
    expected_quantities.insert(A380FuelTankType::FeedThree, Mass::new::<kilogram>(7000.));
    expected_quantities.insert(A380FuelTankType::FeedFour, Mass::new::<kilogram>(7000.));
    assert_fuel_quantity(test_bed, expected_quantities);
}

fn assert_fuel_quantity_100000(test_bed: &FuelTestBed) {
    let mut expected_quantities = HashMap::new();
    expected_quantities.insert(A380FuelTankType::Trim, Mass::new::<kilogram>(8500.));
    expected_quantities.insert(A380FuelTankType::LeftOuter, Mass::new::<kilogram>(4000.));
    expected_quantities.insert(A380FuelTankType::RightOuter, Mass::new::<kilogram>(4000.));
    expected_quantities.insert(A380FuelTankType::LeftInner, Mass::new::<kilogram>(5500.));
    expected_quantities.insert(A380FuelTankType::RightInner, Mass::new::<kilogram>(5500.));
    expected_quantities.insert(
        A380FuelTankType::FeedOne,
        Mass::new::<kilogram>(7000. + 44500. * 20558. / 84788.),
    );
    expected_quantities.insert(
        A380FuelTankType::FeedTwo,
        Mass::new::<kilogram>(7000. + 44500. * 21836. / 84788.),
    );
    expected_quantities.insert(
        A380FuelTankType::FeedThree,
        Mass::new::<kilogram>(7000. + 44500. * 21836. / 84788.),
    );
    expected_quantities.insert(
        A380FuelTankType::FeedFour,
        Mass::new::<kilogram>(7000. + 44500. * 20558. / 84788.),
    );

    assert_fuel_quantity(test_bed, expected_quantities);
}

fn assert_fuel_quantity_200000(test_bed: &FuelTestBed) {
    let mut expected_quantities = HashMap::new();
    expected_quantities.insert(A380FuelTankType::Trim, Mass::new::<kilogram>(13500.));
    expected_quantities.insert(A380FuelTankType::LeftOuter, Mass::new::<kilogram>(4000.));
    expected_quantities.insert(A380FuelTankType::RightOuter, Mass::new::<kilogram>(4000.));
    expected_quantities.insert(A380FuelTankType::LeftMid, Mass::new::<kilogram>(27127.));
    expected_quantities.insert(A380FuelTankType::RightMid, Mass::new::<kilogram>(27127.));
    expected_quantities.insert(A380FuelTankType::LeftInner, Mass::new::<kilogram>(19729.));
    expected_quantities.insert(A380FuelTankType::RightInner, Mass::new::<kilogram>(19729.));
    expected_quantities.insert(A380FuelTankType::FeedOne, Mass::new::<kilogram>(20558.));
    expected_quantities.insert(A380FuelTankType::FeedTwo, Mass::new::<kilogram>(21836.));
    expected_quantities.insert(A380FuelTankType::FeedThree, Mass::new::<kilogram>(21836.));
    expected_quantities.insert(A380FuelTankType::FeedFour, Mass::new::<kilogram>(20558.));

    assert_fuel_quantity(test_bed, expected_quantities);
}

fn assert_fuel_quantity_250000(test_bed: &FuelTestBed) {
    let mut expected_quantities = HashMap::new();
    expected_quantities.insert(A380FuelTankType::Trim, Mass::new::<kilogram>(14500.));
    expected_quantities.insert(A380FuelTankType::LeftOuter, Mass::new::<kilogram>(8121.0));
    expected_quantities.insert(A380FuelTankType::RightOuter, Mass::new::<kilogram>(8121.0));
    expected_quantities.insert(A380FuelTankType::LeftMid, Mass::new::<kilogram>(28636.3));
    expected_quantities.insert(A380FuelTankType::RightMid, Mass::new::<kilogram>(28636.3));
    expected_quantities.insert(A380FuelTankType::LeftInner, Mass::new::<kilogram>(36240.0));
    expected_quantities.insert(A380FuelTankType::RightInner, Mass::new::<kilogram>(36240.0));
    expected_quantities.insert(A380FuelTankType::FeedOne, Mass::new::<kilogram>(21701.8));
    expected_quantities.insert(A380FuelTankType::FeedTwo, Mass::new::<kilogram>(23050.9));
    expected_quantities.insert(A380FuelTankType::FeedThree, Mass::new::<kilogram>(23050.9));
    expected_quantities.insert(A380FuelTankType::FeedFour, Mass::new::<kilogram>(21701.8));

    assert_fuel_quantity(test_bed, expected_quantities);
}

fn assert_fuel_quantity_max(test_bed: &FuelTestBed) {
    let mut expected_quantities = HashMap::new();
    expected_quantities.insert(A380FuelTankType::Trim, Mass::new::<kilogram>(19000.));
    expected_quantities.insert(A380FuelTankType::LeftOuter, Mass::new::<kilogram>(8302.2));
    expected_quantities.insert(A380FuelTankType::RightOuter, Mass::new::<kilogram>(8302.2));
    expected_quantities.insert(A380FuelTankType::LeftMid, Mass::new::<kilogram>(29275.3));
    expected_quantities.insert(A380FuelTankType::RightMid, Mass::new::<kilogram>(29275.3));
    expected_quantities.insert(A380FuelTankType::LeftInner, Mass::new::<kilogram>(37048.7));
    expected_quantities.insert(A380FuelTankType::RightInner, Mass::new::<kilogram>(37048.7));
    expected_quantities.insert(A380FuelTankType::FeedOne, Mass::new::<kilogram>(22186.1));
    expected_quantities.insert(A380FuelTankType::FeedTwo, Mass::new::<kilogram>(23565.2));
    expected_quantities.insert(A380FuelTankType::FeedThree, Mass::new::<kilogram>(23565.2));
    expected_quantities.insert(A380FuelTankType::FeedFour, Mass::new::<kilogram>(22186.1));

    assert_fuel_quantity(test_bed, expected_quantities);
}

#[test]
fn init() {
    let test_bed = test_bed_with().fuel_low();

    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_1"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_2"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_3"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_4"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_5"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_6"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_7"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_8"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_9"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_10"));
    assert!(test_bed.contains_variable_with_name("FUEL_TANK_QUANTITY_11"));
}

#[test]
fn low_fuel() {
    let mut test_bed = test_bed_with().fuel_low();
    test_bed = test_bed.and_run().and_stabilize();

    assert_eq!(
        (test_bed.fore_aft_center_of_gravity() * 100.).round() / 100.,
        -4.57,
        "Expected cg: -4.57, cg: {}",
        (test_bed.fore_aft_center_of_gravity() * 100.).round() / 100.,
    );
}

#[test]
fn high_fuel() {
    let mut test_bed = test_bed_with().fuel_high();
    test_bed = test_bed.and_run().and_stabilize();

    assert_eq!(
        (test_bed.fore_aft_center_of_gravity() * 100.).round() / 100.,
        6.12,
        "Expected cg: 6.12, cg: {}",
        (test_bed.fore_aft_center_of_gravity() * 100.).round() / 100.,
    );
}

#[test]
fn spawn_no_fuel_with_desired_set() {
    let mut test_bed = test_bed_with().desired_fuel_200000().and_run();

    assert_fuel_quantity_0(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_instant_50000() {
    let test_bed = test_bed_with()
        .desired_fuel_50000()
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_50000(&test_bed);
}

#[test]
fn spawn_high_fuel_load_desired_instant_50000() {
    let test_bed = test_bed_with()
        .fuel_high()
        .desired_fuel_50000()
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_50000(&test_bed);
}

#[test]
fn spawn_no_fuel_load_desired_instant_100000() {
    let test_bed = test_bed_with()
        .desired_fuel_100000()
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_100000(&test_bed);
}

#[test]
fn spawn_no_fuel_load_desired_instant_200000() {
    let test_bed = test_bed_with()
        .desired_fuel_200000()
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_200000(&test_bed);
}

#[test]
fn spawn_no_fuel_load_desired_instant_250000() {
    let test_bed: FuelTestBed = test_bed_with()
        .desired_fuel_250000()
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_250000(&test_bed);
}

#[test]
fn spawn_no_fuel_load_desired_instant_max() {
    let test_bed: FuelTestBed = test_bed_with()
        .desired_fuel_max()
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_max(&test_bed);
}

#[test]
fn spawn_no_fuel_load_desired_fast_50000_one_tick() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .desired_fuel_50000()
        .trigger_fast_refuel()
        .and_run();

    let mut expected_quantities = HashMap::new();
    expected_quantities.insert(A380FuelTankType::FeedOne, Mass::new::<kilogram>(121.55));
    expected_quantities.insert(A380FuelTankType::FeedFour, Mass::new::<kilogram>(121.55));

    assert_fuel_quantity(&test_bed, expected_quantities);
    assert_true!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_fast_50000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .desired_fuel_50000()
        .trigger_fast_refuel()
        .and_run()
        .and_stabilize();

    assert_fuel_quantity_50000(&test_bed);
}

#[test]
fn spawn_no_fuel_load_desired_real_50000_in_progress() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .desired_fuel_50000()
        .trigger_real_refuel()
        .and_run()
        .and_stabilize();

    assert_true!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_real_50000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    let eighteen_minutes = 18 * MINUTES_TO_SECONDS;

    test_bed = test_bed
        .desired_fuel_50000()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_secs(eighteen_minutes));

    assert_fuel_quantity_50000(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_real_100000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    let fourty_minutes = 40 * MINUTES_TO_SECONDS;

    test_bed = test_bed
        .desired_fuel_100000()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_secs(fourty_minutes));

    assert_fuel_quantity_100000(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_real_200000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    let seventy_minutes = 70 * MINUTES_TO_SECONDS;

    test_bed = test_bed
        .desired_fuel_200000()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_secs(seventy_minutes));

    assert_fuel_quantity_200000(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_real_250000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .desired_fuel_250000()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_mins(95));

    assert_fuel_quantity_250000(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_no_fuel_load_desired_real_max_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .desired_fuel_max()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_mins(100));

    assert_fuel_quantity_max(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn defuel_high_fuel_load_desired_real_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    let seventy_minutes = 70 * MINUTES_TO_SECONDS;

    test_bed = test_bed
        .fuel_high()
        .desired_fuel_min()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_secs(seventy_minutes));

    assert_fuel_quantity_0(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_high_fuel_load_desired_real_200000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    let seventy_minutes = 70 * MINUTES_TO_SECONDS;

    test_bed = test_bed
        .fuel_high()
        .desired_fuel_200000()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_secs(seventy_minutes));

    assert_fuel_quantity_200000(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_high_fuel_load_desired_real_250000_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .fuel_high()
        .desired_fuel_250000()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_mins(95));

    assert_fuel_quantity_250000(&test_bed);
    assert_false!(test_bed.refuel_status());
}

#[test]
fn spawn_high_fuel_load_desired_real_max_done() {
    let mut test_bed: FuelTestBed = test_bed();
    test_bed.set_on_ground(true);

    test_bed = test_bed
        .fuel_high()
        .desired_fuel_max()
        .trigger_real_refuel()
        .and_run()
        .run_multiple_frames(Duration::from_mins(100));

    assert_fuel_quantity_max(&test_bed);
    assert_false!(test_bed.refuel_status());
}

mod fuel_quantity_measurement {
    use super::*;

    const FQMS_1: u32 = 1 << 0;
    const FQMS_2: u32 = 1 << 1;
    const FQDC_1: u32 = 1 << 2;
    const AGP_1: u32 = 1 << 4;
    const AGP_2: u32 = 1 << 5;

    fn powered_test_bed() -> FuelTestBed {
        test_bed_with().fuel_high().with_fuel_measurement_powered()
    }

    #[test]
    fn no_fault_when_powered() {
        let mut test_bed = powered_test_bed();

        assert_eq!(test_bed.quantity_system_faults(), 0);
        assert!(test_bed
            .feed_one_quantity_word("FQMS")
            .is_normal_operation());
        assert!(test_bed
            .feed_one_quantity_word("FQDC_1")
            .is_normal_operation());
    }

    #[test]
    fn a_failed_fqdc_gives_no_data_and_the_fqms_uses_the_other_one() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::FuelQuantityDataConcentrator(1));
        test_bed = test_bed.and_run();

        assert_eq!(test_bed.quantity_system_faults(), FQDC_1 | AGP_1);
        assert!(test_bed
            .feed_one_quantity_word("FQDC_1")
            .is_failure_warning());
        assert!(test_bed
            .feed_one_quantity_word("FQDC_2")
            .is_normal_operation());
        assert!(test_bed
            .feed_one_quantity_word("FQMS")
            .is_normal_operation());
    }

    #[test]
    fn a_failed_alternate_gauging_processor_loses_its_quantities_only() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::FuelAlternateGaugingProcessor(2));
        test_bed = test_bed.and_run();

        assert_eq!(test_bed.quantity_system_faults(), AGP_2);
        assert!(test_bed
            .feed_one_quantity_word("FQDC_2")
            .is_failure_warning());
        assert!(test_bed
            .feed_one_quantity_word("FQMS")
            .is_normal_operation());
    }

    #[test]
    fn lost_probes_lose_the_tank_quantity() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::FuelQuantityIndication(
            A380FuelTankType::FeedOne.into_usize(),
        ));
        test_bed = test_bed.and_run();

        let lost: u32 = test_bed.read_by_name("FUEL_FQI_LOST_TANKS");
        assert_eq!(lost, 1 << A380FuelTankType::FeedOne.into_usize());
        assert!(test_bed
            .feed_one_quantity_word("FQDC_1")
            .is_no_computed_data());
        assert!(!test_bed
            .feed_one_quantity_word("FQMS")
            .is_normal_operation());
        let feed_two: Arinc429Word<f64> =
            test_bed.read_arinc429_by_name("FQMS_FEED_2_TANK_QUANTITY");
        assert!(feed_two.is_normal_operation());
    }

    #[test]
    fn degraded_gauging_is_flagged_per_tank() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::FuelGaugingDegraded(
            A380FuelTankType::Trim.into_usize(),
        ));
        test_bed = test_bed.and_run();

        let degraded: u32 = test_bed.read_by_name("FUEL_GAUGING_DEGRADED_TANKS");
        assert_eq!(degraded, 1 << A380FuelTankType::Trim.into_usize());
        let trim: Arinc429Word<f64> = test_bed.read_arinc429_by_name("FQMS_TRIM_TANK_QUANTITY");
        assert!(trim.is_normal_operation());
    }

    #[test]
    fn one_failed_fqms_leaves_the_other_one_working() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::FuelQuantityManagementSystem(2));
        test_bed = test_bed.and_run();

        assert_eq!(test_bed.quantity_system_faults(), FQMS_2);
        assert!(test_bed
            .feed_one_quantity_word("FQMS")
            .is_normal_operation());
    }

    #[test]
    fn the_loss_of_one_cpiom_of_its_pair_fails_the_fqms() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::CoreProcessingInputOutputModule('F', 3));
        test_bed = test_bed.and_run();

        assert_eq!(test_bed.quantity_system_faults(), FQMS_1);
    }

    #[test]
    fn both_failed_fqms_give_no_quantities() {
        let mut test_bed = powered_test_bed();
        test_bed.fail(FailureType::FuelQuantityManagementSystem(1));
        test_bed.fail(FailureType::FuelQuantityManagementSystem(2));
        test_bed = test_bed.and_run();

        assert_eq!(test_bed.quantity_system_faults(), FQMS_1 | FQMS_2);
        assert!(test_bed.feed_one_quantity_word("FQMS").is_failure_warning());
        assert!(test_bed
            .feed_one_quantity_word("FQDC_1")
            .is_normal_operation());
    }
}

fn refuel_application_zero_fuel_data(
    mut test_bed: FuelTestBed,
    zfw_kg: f64,
    zfcg: f64,
) -> FuelTestBed {
    test_bed.write_by_name("FUEL_REFUEL_ZFW", zfw_kg);
    test_bed.write_by_name("FUEL_REFUEL_ZFCG", zfcg);
    test_bed.and_run()
}

fn fms_zero_fuel_data(mut test_bed: FuelTestBed, zfw_kg: f64, zfcg: f64) -> FuelTestBed {
    for fms in [1, 2] {
        test_bed.write_arinc429_by_name(
            &format!("FM{fms}_ZERO_FUEL_WEIGHT"),
            zfw_kg,
            SignStatus::NormalOperation,
        );
        test_bed.write_arinc429_by_name(
            &format!("FM{fms}_ZERO_FUEL_WEIGHT_CG"),
            zfcg,
            SignStatus::NormalOperation,
        );
    }
    test_bed.and_run()
}

fn trim_tank_after_instant_refuel(test_bed: FuelTestBed) -> f64 {
    test_bed
        .trigger_instant_refuel()
        .and_run()
        .and_stabilize()
        .tank_mass(A380FuelTankType::Trim as usize)
        .get::<kilogram>()
        .round()
}

// 100 t of fuel at a 300 t ZFW: the payload's 36.5 % ZFCG gives 8.5 t of trim fuel, a 40 % one 3.5 t.
const TRIM_FUEL_AT_PAYLOAD_ZFCG_KG: f64 = 8500.;
const TRIM_FUEL_AT_40_PERCENT_ZFCG_KG: f64 = 3500.;

#[test]
fn cg_targeting_uses_the_payload_zero_fuel_data_without_a_refuel_application_entry() {
    let test_bed = fms_zero_fuel_data(test_bed_with().desired_fuel_100000(), 300000., 40.);

    assert_eq!(
        trim_tank_after_instant_refuel(test_bed),
        TRIM_FUEL_AT_PAYLOAD_ZFCG_KG
    );
}

#[test]
fn cg_targeting_uses_the_refuel_application_zero_fuel_data() {
    let test_bed =
        refuel_application_zero_fuel_data(test_bed_with().desired_fuel_100000(), 300000., 40.);

    assert_eq!(
        trim_tank_after_instant_refuel(test_bed),
        TRIM_FUEL_AT_40_PERCENT_ZFCG_KG
    );
}

#[test]
fn cg_targeting_uses_the_fms_zero_fuel_data_entered_after_the_refuel_application_ones() {
    let test_bed =
        refuel_application_zero_fuel_data(test_bed_with().desired_fuel_100000(), 300000., 40.);
    let test_bed = fms_zero_fuel_data(test_bed, 300000., 36.5);

    assert_eq!(
        trim_tank_after_instant_refuel(test_bed),
        TRIM_FUEL_AT_PAYLOAD_ZFCG_KG
    );
}

#[test]
fn cg_targeting_uses_the_refuel_application_zero_fuel_data_entered_after_the_fms_ones() {
    let test_bed = fms_zero_fuel_data(test_bed_with().desired_fuel_100000(), 300000., 36.5);
    let test_bed = refuel_application_zero_fuel_data(test_bed, 300000., 40.);

    assert_eq!(
        trim_tank_after_instant_refuel(test_bed),
        TRIM_FUEL_AT_40_PERCENT_ZFCG_KG
    );
}
