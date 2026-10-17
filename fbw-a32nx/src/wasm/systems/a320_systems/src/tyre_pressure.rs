//! ATA 32 tyre pressure indicating system (TPIS, an option of the A320): the pressure of the six tyres, as the
//! source of the WHEEL page tyre pressures and of the WHEEL TYRE LO PR alert of the FWC (both in TypeScript,
//! shared/TyrePressures.ts, with the flyPad option "TPIS installed").
//!
//! A320 FCOM PRO-ABN-WHEEL WHEEL TYRE LO PR (a320_fcom.txt:96406-96414): the alert triggers when "One tire pressure is
//! below: 74% of nominal pressure between liftoff and engines shutdown, or 89% of nominal pressure in other cases", or
//! when the difference between the two wheels of the same axle is "above: 21% of nominal pressure between liftoff and
//! engines shutdown, or 15% of nominal pressure in other cases". The TPIS is lost with ELEC DC BUS 1 FAULT (INOP list,
//! a320_fcom.txt:76400).
//!
//! The FCOM gives no tyre figures. Design choices:
//! - The nominal pressures (A320 main 46x17R20 and nose 30x8.8R15 tyres): main 200 PSI, nose 180 PSI, the inflation
//!   pressures of the Airbus A320 Aircraft Characteristics document to be checked.
//! - The tyres are inflated to their nominal pressure at the outside air temperature of the start of the session.
//!   The pressure then follows the gas temperature (Gay-Lussac: the absolute pressure is proportional to the absolute
//!   temperature). The gas temperature tends to the outside air temperature with a 2 h time constant (the wheel wells
//!   are not heated), and the main wheel tyres take a part of the brake heat (15 % of the brake temperature above the
//!   outside air temperature).
//! - A deflated tyre (flyPad failure) loses its pressure with a 20 s time constant. Removing the failure gives a
//!   re-inflated tyre.

use std::time::Duration;

use systems::{
    failures::{Failure, FailureType},
    shared::{arinc429::SignStatus, ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use uom::si::{
    f64::{Pressure, ThermodynamicTemperature},
    pressure::psi,
    thermodynamic_temperature::{degree_celsius, kelvin},
};

/// One tyre: the main wheels 1 to 4 (left to right, the brake numbering) and the nose wheels 1 (left) and 2 (right)
struct Tyre {
    pressure_id: VariableIdentifier,
    brake_temperature_id: Option<VariableIdentifier>,

    nominal_pressure: Pressure,
    deflation_failure: Failure,

    /// The temperature of the gas, None until the first update (it starts at the outside air temperature)
    gas_temperature: Option<ThermodynamicTemperature>,
    /// The temperature at which the tyre was inflated to its nominal pressure
    inflation_temperature: Option<ThermodynamicTemperature>,
    /// The brake temperature of a main wheel (degrees Celsius, REPORTED_BRAKE_TEMPERATURE_n)
    brake_temperature_celsius: Option<f64>,
    /// The part of the inflation gas left in the tyre (1 inflated, 0 deflated)
    inflation_ratio: f64,
}
impl Tyre {
    const GAS_TEMPERATURE_TIME_CONSTANT: Duration = Duration::from_secs(2 * 3600);
    const BRAKE_HEAT_RATIO: f64 = 0.15;
    const DEFLATION_TIME_CONSTANT: Duration = Duration::from_secs(20);

    fn new_main(context: &mut InitContext, number: usize, nominal_pressure: Pressure) -> Self {
        let brake_temperature_id =
            context.get_identifier(format!("REPORTED_BRAKE_TEMPERATURE_{number}"));
        Self::new(
            context,
            format!("TPIS_MAIN_{number}_TYRE_PRESSURE"),
            Some(brake_temperature_id),
            nominal_pressure,
            FailureType::TyreDeflated(number),
        )
    }

    fn new_nose(context: &mut InitContext, number: usize, nominal_pressure: Pressure) -> Self {
        Self::new(
            context,
            format!("TPIS_NOSE_{number}_TYRE_PRESSURE"),
            None,
            nominal_pressure,
            FailureType::TyreDeflated(4 + number),
        )
    }

    fn new(
        context: &mut InitContext,
        pressure_name: String,
        brake_temperature_id: Option<VariableIdentifier>,
        nominal_pressure: Pressure,
        failure_type: FailureType,
    ) -> Self {
        Self {
            pressure_id: context.get_identifier(pressure_name),
            brake_temperature_id,
            nominal_pressure,
            deflation_failure: Failure::new(failure_type),
            gas_temperature: None,
            inflation_temperature: None,
            brake_temperature_celsius: None,
            inflation_ratio: 1.,
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        let ambient = context.ambient_temperature();
        self.inflation_temperature.get_or_insert(ambient);
        let gas_temperature = self.gas_temperature.unwrap_or(ambient);

        // The gas temperature tends to the outside air temperature, plus a part of the brake heat on a main wheel
        let brake_heat_kelvin = self
            .brake_temperature_celsius
            .map(|brake| (brake - ambient.get::<degree_celsius>()).max(0.) * Self::BRAKE_HEAT_RATIO)
            .unwrap_or(0.);
        let target_kelvin = ambient.get::<kelvin>() + brake_heat_kelvin;
        let gas_kelvin = Self::first_order_step(
            gas_temperature.get::<kelvin>(),
            target_kelvin,
            context.delta(),
            Self::GAS_TEMPERATURE_TIME_CONSTANT,
        );
        self.gas_temperature = Some(ThermodynamicTemperature::new::<kelvin>(gas_kelvin));

        self.inflation_ratio = if self.deflation_failure.is_active() {
            Self::first_order_step(
                self.inflation_ratio,
                0.,
                context.delta(),
                Self::DEFLATION_TIME_CONSTANT,
            )
        } else {
            1.
        };
    }

    /// The gauge pressure: the absolute inflation pressure scaled by the gas temperature ratio (Gay-Lussac) and by the
    /// gas left in the tyre, minus the outside pressure
    fn pressure(&self, context: &UpdateContext) -> Pressure {
        let (Some(gas), Some(inflation)) = (self.gas_temperature, self.inflation_temperature)
        else {
            return self.nominal_pressure;
        };
        let ambient_pressure = context.ambient_pressure();
        let inflated_absolute = (self.nominal_pressure + ambient_pressure)
            * (gas.get::<kelvin>() / inflation.get::<kelvin>());
        (inflated_absolute * self.inflation_ratio - ambient_pressure).max(Pressure::new::<psi>(0.))
    }

    /// One step of a first order lag from `value` to `target`
    fn first_order_step(value: f64, target: f64, delta: Duration, time_constant: Duration) -> f64 {
        let ratio = (-delta.as_secs_f64() / time_constant.as_secs_f64()).exp();
        target + (value - target) * ratio
    }
}
impl SimulationElement for Tyre {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.deflation_failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        if let Some(id) = &self.brake_temperature_id {
            self.brake_temperature_celsius = Some(reader.read(id));
        }
    }
}

pub struct A320TyrePressureIndicatingSystem {
    main_nominal_pressure_id: VariableIdentifier,
    nose_nominal_pressure_id: VariableIdentifier,

    powered_by: ElectricalBusType,
    is_powered: bool,
    tyres: Vec<Tyre>,
    /// The pressures of the last update, in the order of `tyres`
    pressures: Vec<Pressure>,
}
impl A320TyrePressureIndicatingSystem {
    const MAIN_NOMINAL_PRESSURE_PSI: f64 = 200.;
    const NOSE_NOMINAL_PRESSURE_PSI: f64 = 180.;

    pub fn new(context: &mut InitContext) -> Self {
        let main = Pressure::new::<psi>(Self::MAIN_NOMINAL_PRESSURE_PSI);
        let nose = Pressure::new::<psi>(Self::NOSE_NOMINAL_PRESSURE_PSI);
        let mut tyres: Vec<Tyre> = (1..=4)
            .map(|number| Tyre::new_main(context, number, main))
            .collect();
        tyres.extend((1..=2).map(|number| Tyre::new_nose(context, number, nose)));
        let pressures = tyres.iter().map(|tyre| tyre.nominal_pressure).collect();

        Self {
            main_nominal_pressure_id: context
                .get_identifier("TPIS_MAIN_NOMINAL_TYRE_PRESSURE".to_owned()),
            nose_nominal_pressure_id: context
                .get_identifier("TPIS_NOSE_NOMINAL_TYRE_PRESSURE".to_owned()),
            // ELEC DC BUS 1 FAULT INOP SYS "TPIS" (a320_fcom.txt:76400)
            powered_by: ElectricalBusType::DirectCurrent(1),
            is_powered: false,
            tyres,
            pressures,
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.tyres.iter_mut().for_each(|tyre| tyre.update(context));
        self.pressures = self
            .tyres
            .iter()
            .map(|tyre| tyre.pressure(context))
            .collect();
    }
}
impl SimulationElement for A320TyrePressureIndicatingSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.tyres.iter_mut().for_each(|tyre| tyre.accept(visitor));
        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let ssm = if self.is_powered {
            SignStatus::NormalOperation
        } else {
            SignStatus::FailureWarning
        };
        self.tyres
            .iter()
            .zip(self.pressures.iter())
            .for_each(|(tyre, pressure)| {
                writer.write_arinc429(&tyre.pressure_id, pressure.get::<psi>(), ssm);
            });
        writer.write(
            &self.main_nominal_pressure_id,
            Self::MAIN_NOMINAL_PRESSURE_PSI,
        );
        writer.write(
            &self.nose_nominal_pressure_id,
            Self::NOSE_NOMINAL_PRESSURE_PSI,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ntest::assert_about_eq;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::{arinc429::Arinc429Word, PotentialOrigin},
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };

    struct TestAircraft {
        tpis: A320TyrePressureIndicatingSystem,
        dc_source: TestElectricitySource,
        dc_1_bus: ElectricalBus,
        dc_1_powered: bool,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                tpis: A320TyrePressureIndicatingSystem::new(context),
                dc_source: TestElectricitySource::powered(context, PotentialOrigin::Battery(1)),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                dc_1_powered: true,
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
            if self.dc_1_powered {
                electricity.flow(&self.dc_source, &self.dc_1_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.tpis.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.tpis.accept(visitor);
            self.dc_1_bus.accept(visitor);
            visitor.visit(self);
        }
    }

    fn pressure_word(
        test_bed: &mut SimulationTestBed<TestAircraft>,
        name: &str,
    ) -> Arinc429Word<f64> {
        test_bed.read_arinc429_by_name(&format!("TPIS_{name}_TYRE_PRESSURE"))
    }

    fn pressure_psi(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> f64 {
        pressure_word(test_bed, name).value()
    }

    /// Runs `minutes` minutes of simulation in one minute steps (a bounded loop)
    fn run_minutes(test_bed: &mut SimulationTestBed<TestAircraft>, minutes: u64) {
        for _ in 0..minutes {
            test_bed.run_with_delta(Duration::from_secs(60));
        }
    }

    /// The brakes at the given temperature (degrees Celsius), REPORTED_BRAKE_TEMPERATURE_1 to 4
    fn set_brake_temperatures(test_bed: &mut SimulationTestBed<TestAircraft>, celsius: [f64; 4]) {
        for (index, temperature) in celsius.iter().enumerate() {
            test_bed.write_by_name(
                &format!("REPORTED_BRAKE_TEMPERATURE_{}", index + 1),
                *temperature,
            );
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(15.));
        set_brake_temperatures(&mut test_bed, [15.; 4]);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed
    }

    #[test]
    fn the_tyres_start_at_their_nominal_pressure() {
        let mut test_bed = test_bed();
        run_minutes(&mut test_bed, 1);

        for main in ["MAIN_1", "MAIN_2", "MAIN_3", "MAIN_4"] {
            assert!(pressure_word(&mut test_bed, main).is_normal_operation());
            assert_about_eq!(pressure_psi(&mut test_bed, main), 200., 0.5);
        }
        for nose in ["NOSE_1", "NOSE_2"] {
            assert_about_eq!(pressure_psi(&mut test_bed, nose), 180., 0.5);
        }
        let main_nominal: f64 = test_bed.read_by_name("TPIS_MAIN_NOMINAL_TYRE_PRESSURE");
        let nose_nominal: f64 = test_bed.read_by_name("TPIS_NOSE_NOMINAL_TYRE_PRESSURE");
        assert_about_eq!(main_nominal, 200.);
        assert_about_eq!(nose_nominal, 180.);
    }

    /// The tyres are inflated at the outside air temperature of the start: a cold start is no low pressure
    #[test]
    fn the_tyres_are_inflated_at_the_starting_temperature() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(-20.));
        set_brake_temperatures(&mut test_bed, [-20.; 4]);
        run_minutes(&mut test_bed, 30);

        assert_about_eq!(pressure_psi(&mut test_bed, "MAIN_1"), 200., 0.5);
    }

    /// ELEC DC BUS 1 FAULT: TPIS lost (a320_fcom.txt:76400)
    #[test]
    fn the_pressures_are_lost_without_dc_bus_1() {
        let mut test_bed = test_bed();
        test_bed.command(|a| a.dc_1_powered = false);
        test_bed.run_with_delta(Duration::from_secs(1));

        assert!(pressure_word(&mut test_bed, "MAIN_1").is_failure_warning());
        assert!(pressure_word(&mut test_bed, "NOSE_2").is_failure_warning());
    }

    /// The cold soak of a long cruise lowers the pressure (gas law), less than the 74 % in-flight threshold of WHEEL
    /// TYRE LO PR (a320_fcom.txt:96410)
    #[test]
    fn a_cold_cruise_lowers_the_pressure() {
        let mut test_bed = test_bed();
        test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(-40.));
        set_brake_temperatures(&mut test_bed, [-40.; 4]);
        run_minutes(&mut test_bed, 240);

        let main = pressure_psi(&mut test_bed, "MAIN_1");
        let nose = pressure_psi(&mut test_bed, "NOSE_1");
        assert!(main < 175. && main > 0.74 * 200., "main tyre {main} psi");
        assert!(nose < 160. && nose > 0.74 * 180., "nose tyre {nose} psi");
    }

    #[test]
    fn hot_brakes_raise_the_pressure_of_their_tyre() {
        let mut test_bed = test_bed();
        set_brake_temperatures(&mut test_bed, [300., 15., 15., 15.]);
        run_minutes(&mut test_bed, 60);

        let hot = pressure_psi(&mut test_bed, "MAIN_1");
        assert!(hot > 205., "main tyre 1 {hot} psi");
        assert_about_eq!(pressure_psi(&mut test_bed, "MAIN_2"), 200., 0.5);
        assert_about_eq!(pressure_psi(&mut test_bed, "NOSE_1"), 180., 0.5);
    }

    #[test]
    fn a_deflated_tyre_loses_its_pressure_and_comes_back_when_repaired() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::TyreDeflated(2));
        test_bed.fail(FailureType::TyreDeflated(6));
        run_minutes(&mut test_bed, 2);

        assert!(pressure_psi(&mut test_bed, "MAIN_2") < 5.);
        assert!(pressure_psi(&mut test_bed, "NOSE_2") < 5.);
        assert_about_eq!(pressure_psi(&mut test_bed, "MAIN_1"), 200., 0.5);
        assert_about_eq!(pressure_psi(&mut test_bed, "NOSE_1"), 180., 0.5);

        test_bed.unfail(FailureType::TyreDeflated(2));
        test_bed.run_with_delta(Duration::from_secs(1));
        assert_about_eq!(pressure_psi(&mut test_bed, "MAIN_2"), 200., 0.5);
    }
}
