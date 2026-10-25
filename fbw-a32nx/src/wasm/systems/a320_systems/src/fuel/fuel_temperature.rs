//! Fuel temperature of the A320 tanks.
//!
//! The SD FUEL page shows the fuel temperature of the outer and inner cell of each wing tank, and
//! the FWC gives FUEL L (R) OUTER (INNER) TK HI TEMP / LO TEMP from it. The display limits and the
//! alert thresholds are in the instruments (shared/src/FuelTemperature.ts); this module gives the
//! temperatures.
//!
//! There is no published temperature model: every constant below is a design choice. The model:
//! - Each tank holds its fuel at one temperature. Fuel flowing into a tank mixes with it by mass:
//!   the outer cell fuel transferred to the inner cell, the centre tank fuel transferred to the
//!   inner cells, and fresh fuel (refuelling) at the outside air temperature.
//! - The fuel exchanges heat with the air around the wing: it tends to the total air temperature
//!   (TAT, the temperature of the boundary layer that washes the tank skins) with a time constant
//!   that grows with the fuel mass. The fuel temperature limitation, which asks the crew to monitor
//!   the fuel temperature once the TAT reaches -34 °C, ties the fuel temperature to the TAT. The
//!   centre tank follows the same law (its heating by the air conditioning packs is not modelled).
//! - The IDG cooling fuel heats the outer cell: part of the fuel supplied to each engine goes from
//!   the HP fuel line through the IDG heat exchanger, where it absorbs heat, and back to the outer
//!   tank through the fuel return valve. The return flow is 300 kg/h and its temperature stays
//!   below 100 °C (the CFM56 values, the closest available). The flow is commanded by
//!   fuel_recirculation.rs; the FADEC moves the returned mass from the inner to the outer cell.
//!   The return is inhibited at engine shutdown, during takeoff and climb, below about 300 kg in
//!   the wing tank, in gravity feeding, and in flight above 52.5 °C in the wing tank. Not modelled:
//!   the surge tank overflow inhibition.

use std::time::Duration;
use systems::simulation::{
    InitContext, SimulationElement, SimulatorWriter, UpdateContext, VariableIdentifier, Write,
};
use uom::si::{f64::*, thermodynamic_temperature::degree_celsius, velocity::foot_per_minute};

use super::A320FuelTankType;

/// The tanks in the order of A320FuelTankType (the order of the fuel system tanks).
const CENTRE: usize = 0;
const LEFT_INNER: usize = 1;
const LEFT_OUTER: usize = 2;
const RIGHT_INNER: usize = 3;
const RIGHT_OUTER: usize = 4;
const TANK_COUNT: usize = 5;

/// The inner and outer tank of each side, left then right.
const WING_TANKS: [(usize, usize); 2] = [(LEFT_INNER, LEFT_OUTER), (RIGHT_INNER, RIGHT_OUTER)];

/// What the IDG cooling fuel return of one engine depends on, on one update.
#[derive(Clone, Copy, Debug)]
pub struct IdgReturnConditions {
    /// The engine runs (above its minimum idle).
    pub engine_running: bool,
    pub on_ground: bool,
    /// The vertical speed, in ft/min.
    pub vertical_speed_ft_per_min: f64,
    /// The fuel in the wing tank of the engine side (inner + outer cell), in kg.
    pub wing_tank_kg: f64,
    /// The engine is fed by gravity (gravity_feed.rs).
    pub gravity_fed: bool,
    /// The warmer of the two cells of the wing tank, in °C.
    pub wing_tank_temperature_celsius: f64,
}

/// Whether the IDG cooling fuel of an engine returns to its wing tank. The fuel return valve closes
/// at engine shutdown, during takeoff and climb, below about 300 kg (660 lb) in the wing tank, with
/// fuel overflow in the surge tank, in gravity feeding, and in flight with the wing tank fuel above
/// 52.5 °C; on the ground a hot wing tank or a surge tank overflow does not inhibit it. Design
/// choices: takeoff and climb is a vertical speed above 500 ft/min in flight; the surge tank
/// overflow is not used.
pub fn idg_return_is_active(conditions: IdgReturnConditions) -> bool {
    const CLIMB_VERTICAL_SPEED_FT_PER_MIN: f64 = 500.;
    const MIN_WING_TANK_KG: f64 = 300.;
    const MAX_WING_TANK_TEMPERATURE_IN_FLIGHT_CELSIUS: f64 = 52.5;

    let climbing = !conditions.on_ground
        && conditions.vertical_speed_ft_per_min > CLIMB_VERTICAL_SPEED_FT_PER_MIN;
    let too_hot_in_flight = !conditions.on_ground
        && conditions.wing_tank_temperature_celsius > MAX_WING_TANK_TEMPERATURE_IN_FLIGHT_CELSIUS;

    conditions.engine_running
        && !climbing
        && conditions.wing_tank_kg >= MIN_WING_TANK_KG
        && !conditions.gravity_fed
        && !too_hot_in_flight
}

/// The total air temperature: the static air temperature plus the full ram rise
/// (TAT = SAT * (1 + 0.2 M²), design choice: recovery factor 1), in °C.
fn total_air_temperature_celsius(context: &UpdateContext) -> f64 {
    let mach: f64 = context.mach_number().into();
    let static_air_kelvin = context.ambient_temperature().get::<degree_celsius>() + 273.15;
    static_air_kelvin * (1. + 0.2 * mach * mach) - 273.15
}

pub struct FuelTemperature {
    /// The wing cell temperatures for the SD and the FWC, in °C, in the order of A320FuelTankType
    /// (no SD indication for the centre tank).
    temperature_ids: [Option<VariableIdentifier>; TANK_COUNT],

    /// °C, in the order of A320FuelTankType.
    temperatures: [f64; TANK_COUNT],
    /// The tank quantities of the previous update, in kg, None before the first update.
    previous_quantities_kg: Option<[f64; TANK_COUNT]>,
}
impl FuelTemperature {
    /// Design choice: the time constant of the heat exchange with the air of an empty tank...
    const TIME_CONSTANT_EMPTY_TANK_MINUTES: f64 = 20.;
    /// ...grows by this much per tonne of fuel: about 30 min for a full outer cell (690 kg),
    /// 100 min for a full inner cell (5 500 kg).
    const TIME_CONSTANT_PER_TONNE_MINUTES: f64 = 15.;

    /// Design choice: the IDG heat exchanger warms the fuel by this much over the inner cell fuel
    /// that feeds the engine (about 10 kW of IDG heat in 300 kg/h of fuel)...
    const IDG_RETURN_TEMPERATURE_RISE_KELVIN: f64 = 60.;
    /// ...and the returned fuel stays below 100 °C.
    const IDG_RETURN_MAX_TEMPERATURE_CELSIUS: f64 = 100.;
    /// Design choice: below this the outer cell is empty and the returned fuel flows on into the
    /// inner cell (a full outer cell overflows into the inner cell through a spill pipe).
    const EMPTY_TANK_KG: f64 = 1.;

    pub fn new(context: &mut InitContext) -> Self {
        let wing_cell = |context: &mut InitContext, name: &str| {
            Some(context.get_identifier(format!("FUEL_{}_TANK_TEMPERATURE", name)))
        };
        Self {
            temperature_ids: [
                None,
                wing_cell(context, "LEFT_INNER"),
                wing_cell(context, "LEFT_OUTER"),
                wing_cell(context, "RIGHT_INNER"),
                wing_cell(context, "RIGHT_OUTER"),
            ],
            temperatures: [0.; TANK_COUNT],
            previous_quantities_kg: None,
        }
    }

    /// * `quantities_kg` - the tank quantities, in the order of A320FuelTankType
    /// * `idg_return_flow_kg_per_hour` - the IDG cooling fuel that engine 1 (2) returns to the left
    ///   (right) wing tank (fuel_recirculation.rs)
    pub fn update(
        &mut self,
        context: &UpdateContext,
        quantities_kg: [f64; TANK_COUNT],
        idg_return_flow_kg_per_hour: [f64; 2],
    ) {
        let total_air_temperature = total_air_temperature_celsius(context);
        let Some(previous_quantities_kg) = self.previous_quantities_kg else {
            // Design choice: the fuel loaded with the flight has had the time to take the
            // temperature of the air around the wing (the outside air temperature on the ground).
            self.temperatures = [total_air_temperature; TANK_COUNT];
            self.previous_quantities_kg = Some(quantities_kg);
            return;
        };
        self.previous_quantities_kg = Some(quantities_kg);

        let fresh_fuel_temperature = context.ambient_temperature().get::<degree_celsius>();
        let returned_kg =
            idg_return_flow_kg_per_hour.map(|flow| flow * context.delta().as_secs_f64() / 3600.);
        self.mix_inflows(
            previous_quantities_kg,
            quantities_kg,
            returned_kg,
            fresh_fuel_temperature,
        );
        self.heat_with_idg_return(quantities_kg, returned_kg);
        self.exchange_heat_with_air(context.delta(), quantities_kg, total_air_temperature);
    }

    /// Mixes the fuel that flowed into each tank since the last update with the fuel it held. As
    /// the quantities give only net changes, the flows are deduced from them: a decrease of an
    /// outer cell flowed into its inner cell, a decrease of the centre tank flowed into the inner
    /// cell(s) that gained fuel (half each if both did), never more than their gain (the rest
    /// left the aircraft: defuelling, the flyPad fuel page), and any other gain is fresh fuel,
    /// except the IDG return fuel that the FADEC moved to the outer cell (`returned_kg`, which
    /// heat_with_idg_return mixes in with its own temperature).
    fn mix_inflows(
        &mut self,
        previous_kg: [f64; TANK_COUNT],
        now_kg: [f64; TANK_COUNT],
        returned_kg: [f64; 2],
        fresh_fuel_temperature: f64,
    ) {
        let before = self.temperatures;
        let gain = |tank: usize| (now_kg[tank] - previous_kg[tank]).max(0.);
        let loss = |tank: usize| (previous_kg[tank] - now_kg[tank]).max(0.);

        let inner_gains = WING_TANKS.map(|(inner, _)| gain(inner) > 0.);
        let centre_share = match inner_gains {
            [true, false] => [1., 0.],
            [false, true] => [0., 1.],
            [true, true] => [0.5, 0.5],
            [false, false] => [0., 0.],
        };

        let returned_to = |tank: usize| {
            WING_TANKS
                .iter()
                .position(|&(_, outer)| outer == tank)
                .map_or(0., |side| returned_kg[side])
        };
        for tank in [CENTRE, LEFT_OUTER, RIGHT_OUTER] {
            let fresh_gain = (gain(tank) - returned_to(tank)).max(0.);
            self.temperatures[tank] = mixed_temperature(
                before[tank],
                now_kg[tank],
                &[(fresh_gain, fresh_fuel_temperature)],
            );
        }
        for (side, (inner, outer)) in WING_TANKS.iter().copied().enumerate() {
            let from_outer = loss(outer);
            let from_centre = (loss(CENTRE) * centre_share[side]).min(gain(inner));
            let fresh = (gain(inner) - from_outer - from_centre).max(0.);
            self.temperatures[inner] = mixed_temperature(
                before[inner],
                now_kg[inner],
                &[
                    (from_outer, before[outer]),
                    (from_centre, before[CENTRE]),
                    (fresh, fresh_fuel_temperature),
                ],
            );
        }
    }

    /// The IDG cooling fuel returns to the outer cell (to the inner cell once the outer one is
    /// empty) warmer than the inner cell fuel that fed the engine.
    fn heat_with_idg_return(&mut self, quantities_kg: [f64; TANK_COUNT], returned_kg: [f64; 2]) {
        for (side, (inner, outer)) in WING_TANKS.iter().copied().enumerate() {
            let returned_kg = returned_kg[side];
            if returned_kg <= 0. {
                continue;
            }
            let return_temperature = self.idg_return_temperature_celsius(side);
            let cell = if quantities_kg[outer] > Self::EMPTY_TANK_KG {
                outer
            } else {
                inner
            };
            // The cell already holds the returned fuel (the FADEC moved it); a full cell spills as
            // much fuel into the inner cell.
            self.temperatures[cell] = mixed_temperature(
                self.temperatures[cell],
                quantities_kg[cell],
                &[(returned_kg, return_temperature)],
            );
        }
    }

    /// The temperature of the fuel that the IDG cooling of engine 1 (2) returns to the left (right)
    /// wing tank: warmer than the inner cell fuel that feeds the engine, below 100 °C.
    pub fn idg_return_temperature_celsius(&self, side: usize) -> f64 {
        let (inner, _) = WING_TANKS[side];
        (self.temperatures[inner] + Self::IDG_RETURN_TEMPERATURE_RISE_KELVIN)
            .min(Self::IDG_RETURN_MAX_TEMPERATURE_CELSIUS)
    }

    /// Each tank tends to the TAT with a first order lag.
    fn exchange_heat_with_air(
        &mut self,
        delta: Duration,
        quantities_kg: [f64; TANK_COUNT],
        total_air_temperature: f64,
    ) {
        for (temperature, quantity_kg) in self.temperatures.iter_mut().zip(quantities_kg) {
            let time_constant_seconds = Self::time_constant_minutes(quantity_kg) * 60.;
            let approach = 1. - (-delta.as_secs_f64() / time_constant_seconds).exp();
            *temperature += (total_air_temperature - *temperature) * approach;
        }
    }

    fn time_constant_minutes(quantity_kg: f64) -> f64 {
        Self::TIME_CONSTANT_EMPTY_TANK_MINUTES
            + Self::TIME_CONSTANT_PER_TONNE_MINUTES * quantity_kg.max(0.) / 1000.
    }

    pub fn temperature(&self, tank: A320FuelTankType) -> ThermodynamicTemperature {
        ThermodynamicTemperature::new::<degree_celsius>(self.temperatures[usize::from(tank)])
    }
}
impl SimulationElement for FuelTemperature {
    fn write(&self, writer: &mut SimulatorWriter) {
        for (id, temperature) in self.temperature_ids.iter().zip(self.temperatures) {
            if let Some(id) = id {
                writer.write(id, temperature);
            }
        }
    }
}

/// The temperature of a tank holding `mass_now_kg` after the given inflows (mass in kg,
/// temperature in °C) mixed with the fuel it held at `temperature`.
fn mixed_temperature(temperature: f64, mass_now_kg: f64, inflows: &[(f64, f64)]) -> f64 {
    let inflow_kg: f64 = inflows.iter().map(|(mass, _)| mass).sum();
    if inflow_kg <= 0. {
        return temperature;
    }
    let resident_kg = (mass_now_kg - inflow_kg).max(0.);
    let heat: f64 =
        inflows.iter().map(|(mass, t)| mass * t).sum::<f64>() + resident_kg * temperature;
    heat / (resident_kg + inflow_kg)
}

/// The vertical speed of the context, in ft/min.
pub fn vertical_speed_ft_per_min(context: &UpdateContext) -> f64 {
    context.vertical_speed().get::<foot_per_minute>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElementVisitor,
    };
    use uom::si::{f64::Velocity, velocity::foot_per_minute};

    /// Full tanks of the A320: centre 6 620 kg, inner cells 5 520 kg, outer cells 690 kg.
    const FULL_KG: [f64; TANK_COUNT] = [6620., 5520., 690., 5520., 690.];

    struct TestAircraft {
        fuel_temperature: FuelTemperature,
        quantities_kg: [f64; TANK_COUNT],
        idg_return_flow_kg_per_hour: [f64; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                fuel_temperature: FuelTemperature::new(context),
                quantities_kg: FULL_KG,
                idg_return_flow_kg_per_hour: [0.; 2],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.fuel_temperature.update(
                context,
                self.quantities_kg,
                self.idg_return_flow_kg_per_hour,
            );
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.fuel_temperature.accept(visitor);
            visitor.visit(self);
        }
    }

    struct FuelTemperatureTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl FuelTemperatureTestBed {
        /// On the ground at 15 °C, full tanks, the first update done.
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            test_bed.set_on_ground(true);
            test_bed.outside_air(15., 0.);
            test_bed.run_with_delta(Duration::from_secs(1));
            test_bed
        }

        /// The static air temperature and the Mach number.
        fn outside_air(&mut self, celsius: f64, mach: f64) {
            self.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(celsius));
            self.write_by_name("AIRSPEED MACH", mach);
        }

        /// Cruise at FL 350, -54.3 °C (ISA), Mach 0.78: TAT -27.7 °C.
        fn cruise(&mut self) {
            self.set_on_ground(false);
            self.set_vertical_speed(Velocity::new::<foot_per_minute>(0.));
            self.outside_air(-54.3, 0.78);
        }

        fn quantities(&mut self, quantities_kg: [f64; TANK_COUNT]) {
            self.command(|a| a.quantities_kg = quantities_kg);
        }

        /// The IDG return of each side at 300 kg/h, or not.
        fn idg_return(&mut self, active: [bool; 2]) {
            self.command(|a| {
                a.idg_return_flow_kg_per_hour = active.map(|on| if on { 300. } else { 0. })
            });
        }

        fn run_minutes(&mut self, minutes: u64) {
            for _ in 0..minutes * 6 {
                self.run_with_delta(Duration::from_secs(10));
            }
        }

        fn temperature(&mut self, name: &str) -> f64 {
            self.read_by_name(&format!("FUEL_{}_TANK_TEMPERATURE", name))
        }
    }
    impl TestBed for FuelTemperatureTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn the_fuel_starts_at_the_outside_air_temperature_on_the_ground() {
        let mut test_bed = FuelTemperatureTestBed::new();

        for cell in ["LEFT_INNER", "LEFT_OUTER", "RIGHT_INNER", "RIGHT_OUTER"] {
            assert!((test_bed.temperature(cell) - 15.).abs() < 0.01, "{}", cell);
        }
    }

    #[test]
    fn in_cruise_the_fuel_cools_towards_the_tat_and_a_full_inner_cell_cools_slower_than_an_outer_cell(
    ) {
        let mut test_bed = FuelTemperatureTestBed::new();
        test_bed.cruise();
        test_bed.run_minutes(60);

        let inner = test_bed.temperature("LEFT_INNER");
        let outer = test_bed.temperature("LEFT_OUTER");
        // TAT -27.7 °C. Inner (time constant 102.8 min): -27.7 + 42.7 e^(-60/102.8) = -3.9 °C.
        // Outer (30.4 min): -27.7 + 42.7 e^(-60/30.4) = -21.8 °C.
        assert!((inner - -3.9).abs() < 0.3, "inner {}", inner);
        assert!((outer - -21.8).abs() < 0.3, "outer {}", outer);
    }

    #[test]
    fn the_idg_return_fuel_warms_the_outer_cell_of_its_side() {
        let mut test_bed = FuelTemperatureTestBed::new();
        test_bed.cruise();
        test_bed.idg_return([true, false]);
        test_bed.run_minutes(120);

        let left_outer = test_bed.temperature("LEFT_OUTER");
        let right_outer = test_bed.temperature("RIGHT_OUTER");
        assert!(
            left_outer > right_outer + 5.,
            "left outer {} right outer {}",
            left_outer,
            right_outer
        );
        // The inner cells are not heated.
        let left_inner = test_bed.temperature("LEFT_INNER");
        let right_inner = test_bed.temperature("RIGHT_INNER");
        assert!((left_inner - right_inner).abs() < 0.01);
    }

    #[test]
    fn on_a_hot_day_with_a_long_taxi_the_outer_cell_gets_above_its_ground_limit() {
        // HI TEMP on ground: outer cell above 55 °C.
        let mut test_bed = FuelTemperatureTestBed::new();
        test_bed.outside_air(48., 0.);
        test_bed.run_minutes(240);
        test_bed.idg_return([true, true]);
        test_bed.run_minutes(120);

        assert!(test_bed.temperature("LEFT_OUTER") > 55.);
        assert!(test_bed.temperature("LEFT_INNER") < 49.);
    }

    #[test]
    fn the_outer_cell_fuel_transferred_to_the_inner_cell_mixes_with_it() {
        let mut test_bed = FuelTemperatureTestBed::new();
        test_bed.cruise();
        test_bed.run_minutes(60);
        let inner_before = test_bed.temperature("LEFT_INNER");
        let outer_before = test_bed.temperature("LEFT_OUTER");

        // The low level opened the transfer valves: the 690 kg of the outer cell go to the inner
        // cell (750 kg) in one update.
        test_bed.quantities([0., 750., 690., 750., 690.]);
        test_bed.run_with_delta(Duration::from_millis(1));
        test_bed.quantities([0., 1440., 0., 750., 690.]);
        test_bed.run_with_delta(Duration::from_millis(1));

        let expected = (750. * inner_before + 690. * outer_before) / 1440.;
        assert!((test_bed.temperature("LEFT_INNER") - expected).abs() < 0.05);
        assert!((test_bed.temperature("RIGHT_INNER") - inner_before).abs() < 0.05);
    }

    #[test]
    fn refuelling_mixes_fuel_at_the_outside_air_temperature() {
        let mut test_bed = FuelTemperatureTestBed::new();
        test_bed.quantities([0., 1000., 0., 1000., 0.]);
        test_bed.run_with_delta(Duration::from_millis(1));
        test_bed.cruise();
        test_bed.run_minutes(120);
        let cold = test_bed.temperature("LEFT_INNER");

        test_bed.set_on_ground(true);
        test_bed.outside_air(30., 0.);
        test_bed.quantities([0., 3000., 0., 3000., 0.]);
        test_bed.run_with_delta(Duration::from_millis(1));

        let expected = (1000. * cold + 2000. * 30.) / 3000.;
        assert!((test_bed.temperature("LEFT_INNER") - expected).abs() < 0.05);
    }

    fn conditions() -> IdgReturnConditions {
        IdgReturnConditions {
            engine_running: true,
            on_ground: false,
            vertical_speed_ft_per_min: 0.,
            wing_tank_kg: 5000.,
            gravity_fed: false,
            wing_tank_temperature_celsius: 0.,
        }
    }

    #[test]
    fn the_idg_return_works_in_cruise_and_on_the_ground() {
        assert!(idg_return_is_active(conditions()));
        assert!(idg_return_is_active(IdgReturnConditions {
            on_ground: true,
            ..conditions()
        }));
    }

    #[test]
    fn the_idg_return_is_inhibited_by_each_of_its_conditions() {
        for inhibited in [
            IdgReturnConditions {
                engine_running: false,
                ..conditions()
            },
            IdgReturnConditions {
                vertical_speed_ft_per_min: 1500.,
                ..conditions()
            },
            IdgReturnConditions {
                wing_tank_kg: 299.,
                ..conditions()
            },
            IdgReturnConditions {
                gravity_fed: true,
                ..conditions()
            },
            IdgReturnConditions {
                wing_tank_temperature_celsius: 53.,
                ..conditions()
            },
        ] {
            assert!(!idg_return_is_active(inhibited), "{:?}", inhibited);
        }
    }

    #[test]
    fn on_the_ground_a_hot_wing_tank_does_not_inhibit_the_idg_return() {
        assert!(idg_return_is_active(IdgReturnConditions {
            on_ground: true,
            wing_tank_temperature_celsius: 60.,
            ..conditions()
        }));
    }
}
