use super::{
    ElectricalElement, ElectricalElementIdentifier, ElectricalElementIdentifierProvider,
    ElectricalStateWriter, ElectricitySource, EngineGeneratorPushButtons, Potential,
    PotentialOrigin, ProvideFrequency, ProvideLoad, ProvidePotential,
};
use crate::{
    engine::Engine,
    failures::{Failure, FailureType},
    shared::{calculate_towards_target_temperature, EngineFirePushButtons, PowerConsumptionReport},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use std::{ops::RangeInclusive, time::Duration};
use uom::si::{
    angular_velocity::revolution_per_minute,
    electric_potential::volt,
    f64::*,
    frequency::hertz,
    ratio::{percent, ratio},
    thermodynamic_temperature::degree_celsius,
};

pub const INTEGRATED_DRIVE_GENERATOR_STABILIZATION_TIME: Duration = Duration::from_millis(500);

pub type IntegratedDriveGenerator = EngineGenerator<ConstantSpeedDrive>;
pub type VariableFrequencyGenerator = EngineGenerator<DirectDrive>;

pub trait EngineGeneratorDrive: SimulationElement {
    fn new_drive(context: &mut InitContext, number: usize) -> Self;
    /// `generator_load` is the load of the generator at the previous update.
    fn update_drive(
        &mut self,
        context: &UpdateContext,
        engine: &impl Engine,
        generator_load: Ratio,
    );
    fn output_speed(&self) -> AngularVelocity;
    fn disconnect(&mut self);
    fn is_connected(&self) -> bool;
    /// The low oil pressure signal of the drive, as its GCU sends it to the FWC and to the IDG
    /// push button FAULT light. A drive without an oil model never reports it.
    fn oil_pressure_is_low(&self) -> bool {
        false
    }
    /// The oil outlet temperature of the drive is above its overheat threshold.
    fn oil_is_overheating(&self) -> bool {
        false
    }
    /// The low oil level signal of the drive. A drive without an oil level sensor never reports it.
    fn oil_level_is_low(&self) -> bool {
        false
    }
    /// The generator control unit switched the generator off because of the drive (as with the GEN pb-sw OFF).
    fn generator_switched_off_by_gcu(&self) -> bool {
        false
    }
}

pub struct EngineGenerator<Drive: EngineGeneratorDrive> {
    writer: ElectricalStateWriter,
    number: usize,
    max_true_power: Power,
    identifier: ElectricalElementIdentifier,
    drive: Drive,
    activated: bool,
    output_frequency: Frequency,
    normal_frequency: RangeInclusive<f64>,
    output_potential: ElectricPotential,
    load: Ratio,
    time_above_threshold: Duration,
    failure: Failure,
}
impl<Drive: EngineGeneratorDrive> EngineGenerator<Drive> {
    pub fn new(
        context: &mut InitContext,
        number: usize,
        max_true_power: Power,
        normal_frequency: RangeInclusive<f64>,
    ) -> Self {
        EngineGenerator {
            writer: ElectricalStateWriter::new(context, &format!("ENG_GEN_{}", number)),
            number,
            max_true_power,
            identifier: context.next_electrical_identifier(),
            drive: Drive::new_drive(context, number),
            activated: true,
            output_frequency: Frequency::new::<hertz>(0.),
            normal_frequency,
            output_potential: ElectricPotential::new::<volt>(0.),
            load: Ratio::new::<percent>(0.),
            time_above_threshold: INTEGRATED_DRIVE_GENERATOR_STABILIZATION_TIME,
            failure: Failure::new(FailureType::Generator(number)),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        engine: &impl Engine,
        generator_buttons: &impl EngineGeneratorPushButtons,
        fire_buttons: &impl EngineFirePushButtons,
    ) {
        if generator_buttons.idg_push_button_is_released(self.number) {
            // The drive cannot be reconnected.
            self.drive.disconnect();
        }
        self.drive.update_drive(context, engine, self.load);
        self.activated = generator_buttons.engine_gen_push_button_is_on(self.number)
            && !fire_buttons.is_released(self.number)
            && !self.drive.generator_switched_off_by_gcu();
        self.output_frequency = if self.activated {
            Frequency::new::<hertz>(
                self.drive.output_speed().get::<revolution_per_minute>() * 4. / 120.,
            )
        } else {
            Frequency::default()
        };
        self.update_stable_time(context);
    }

    // TODO: move to GCU when implemented
    fn update_stable_time(&mut self, context: &UpdateContext) {
        if !self.activated {
            self.time_above_threshold = Duration::ZERO;
            return;
        }

        let new_time = if self.frequency_normal() {
            self.time_above_threshold + context.delta()
        } else {
            Duration::ZERO
        };

        self.time_above_threshold = new_time.clamp(
            Duration::ZERO,
            INTEGRATED_DRIVE_GENERATOR_STABILIZATION_TIME,
        );
    }

    fn provides_stable_power_output(&self) -> bool {
        self.time_above_threshold == INTEGRATED_DRIVE_GENERATOR_STABILIZATION_TIME
    }

    /// Indicates if the provided electricity's potential and frequency
    /// are within normal parameters. Use this to decide if the
    /// generator contactor should close.
    /// Load shouldn't be taken into account, as overloading causes an
    /// overtemperature which over time will trigger a mechanical
    /// disconnect of the generator.
    pub fn output_within_normal_parameters(&self) -> bool {
        self.should_provide_output() && self.potential_normal()
    }

    fn should_provide_output(&self) -> bool {
        self.provides_stable_power_output()
            && self.activated
            && self.frequency_normal()
            && !self.failure.is_active()
    }

    pub fn is_drive_connected(&self) -> bool {
        self.drive.is_connected()
    }

    /// The low oil pressure signal of the drive (IDG LO PR), see `ConstantSpeedDrive`.
    pub fn drive_oil_pressure_is_low(&self) -> bool {
        self.drive.oil_pressure_is_low()
    }

    /// The oil outlet temperature of the drive is above its overheat threshold (IDG OVHT).
    pub fn drive_oil_is_overheating(&self) -> bool {
        self.drive.oil_is_overheating()
    }
}
impl<Drive: EngineGeneratorDrive> ElectricitySource for EngineGenerator<Drive> {
    fn output_potential(&self) -> Potential {
        if self.should_provide_output() {
            Potential::new(
                PotentialOrigin::EngineGenerator(self.number),
                self.output_potential,
            )
        } else {
            Potential::none()
        }
    }
}
// TODO: Move to GCU
impl<Drive: EngineGeneratorDrive> ProvidePotential for EngineGenerator<Drive> {
    fn potential(&self) -> ElectricPotential {
        self.output_potential
    }
    fn potential_normal(&self) -> bool {
        let volts = self.output_potential.get::<volt>();
        (110.0..=120.0).contains(&volts)
    }
}
// TODO: Move to GCU
impl<Drive: EngineGeneratorDrive> ProvideFrequency for EngineGenerator<Drive> {
    fn frequency(&self) -> Frequency {
        self.output_frequency
    }
    fn frequency_normal(&self) -> bool {
        let hz = self.output_frequency.get::<hertz>();
        self.normal_frequency.contains(&hz)
    }
}
// TODO: Move to GCU
impl<Drive: EngineGeneratorDrive> ProvideLoad for EngineGenerator<Drive> {
    fn load(&self) -> Ratio {
        self.load
    }
    fn load_normal(&self) -> bool {
        self.load <= Ratio::new::<percent>(100.)
    }
}
impl<Drive: EngineGeneratorDrive> ElectricalElement for EngineGenerator<Drive> {
    fn input_identifier(&self) -> super::ElectricalElementIdentifier {
        self.identifier
    }

    fn output_identifier(&self) -> super::ElectricalElementIdentifier {
        self.identifier
    }

    fn is_conductive(&self) -> bool {
        true
    }
}
impl<Drive: EngineGeneratorDrive> SimulationElement for EngineGenerator<Drive> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.drive.accept(visitor);
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn process_power_consumption_report<T: PowerConsumptionReport>(
        &mut self,
        _: &UpdateContext,
        report: &T,
    ) {
        const POWERFACTOR: f64 = 0.8;

        self.output_potential = if self.should_provide_output() {
            ElectricPotential::new::<volt>(115.)
        } else {
            ElectricPotential::new::<volt>(0.)
        };

        let power_consumption =
            report.total_consumption_of(PotentialOrigin::EngineGenerator(self.number));
        let power_factor_correction = Ratio::new::<ratio>(POWERFACTOR);
        self.load = power_consumption * power_factor_correction / self.max_true_power;
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        self.writer.write_alternating_with_load(self, writer);
    }
}

/// The constant speed drive of an integrated drive generator (IDG, A320).
///
/// Oil model: the IDG caution comes on when the oil outlet overheats (above 180 °C) or the oil
/// pressure is low (inhibited below N2 14 %), and goes off once the IDG is disconnected. The IDG
/// disconnects itself (thermal disconnection) at 200 °C.
///
/// The oil inlet temperature is written too: the SD ELEC page RISE is the difference between the IDG
/// inlet and outlet temperatures.
pub struct ConstantSpeedDrive {
    oil_outlet_temperature_id: VariableIdentifier,
    oil_outlet_temperature: ThermodynamicTemperature,
    oil_inlet_temperature_id: VariableIdentifier,
    oil_inlet_temperature: ThermodynamicTemperature,
    is_connected_id: VariableIdentifier,
    connected: bool,
    output_speed: AngularVelocity,
    oil_low_pressure_id: VariableIdentifier,
    /// The share of the normal oil quantity left in the drive (1 = full)
    oil_quantity: Ratio,
    oil_low_pressure: bool,
    oil_leak: Failure,
    oil_overheat: Failure,
}
impl ConstantSpeedDrive {
    // Threshold to reach target output speed = 58% of 16645 RPM
    pub const ENGINE_GEARBOX_POWER_UP_OUTPUT_THRESHOLD: f64 = 0.58 * 16645.;
    const OUTPUT_SPEED_RPM: f64 = 12000.;

    const M: f64 = Self::OUTPUT_SPEED_RPM / Self::ENGINE_GEARBOX_POWER_UP_OUTPUT_THRESHOLD;

    /// The IDG oil outlet overheat threshold
    pub const OIL_OVERHEAT_CELSIUS: f64 = 180.;
    /// The automatic thermal disconnection
    pub const THERMAL_DISCONNECT_CELSIUS: f64 = 200.;
    /// The low oil pressure signal is inhibited below N2 14 %
    const LOW_PRESSURE_INHIBITION_N2_PERCENT: f64 = 14.;

    /// Design choice (no published normal values): with the engine at idle or above, the oil
    /// comes back from its coolers at 55 °C plus 0.4 times the outside air temperature (limited to
    /// -20..50 °C), and gains 8 °C, plus 12 °C at full generator load, in the drive. The outlet
    /// temperature stays between about 50 °C and 95 °C, well below the 147 °C advisory of the SD
    /// ELEC page.
    const OIL_INLET_BASE_CELSIUS: f64 = 55.;
    const OIL_INLET_AMBIENT_FACTOR: f64 = 0.4;
    const OIL_TEMPERATURE_RISE_NO_LOAD_CELSIUS: f64 = 8.;
    const OIL_TEMPERATURE_RISE_FULL_LOAD_CELSIUS: f64 = 20.;
    /// The drive produces its full heat from N2 60 % (about idle).
    const FULL_HEAT_N2_PERCENT: f64 = 60.;
    const IDG_HEATING_COEFFICIENT: f64 = 1.4;
    const IDG_COOLING_COEFFICIENT: f64 = 0.4;

    /// Design choice: a drive losing its oil (`FailureType::IntegratedDriveGeneratorOilLeak`)
    /// loses 1 % of it each second while it turns. Its charge pump loses pressure (LO PR) below
    /// half of the oil, 50 s after the leak starts. Below 60 % of the oil the cooling degrades, up
    /// to 150 °C more at the inlet when the drive is dry.
    const OIL_LEAK_RATE_PER_SECOND: f64 = 0.01;
    const OIL_LOW_PRESSURE_QUANTITY: f64 = 0.5;
    const OIL_COOLING_DEGRADED_QUANTITY: f64 = 0.6;
    const DRY_DRIVE_EXTRA_INLET_CELSIUS: f64 = 150.;
    /// Design choice: a lost oil cooling (`FailureType::IntegratedDriveGeneratorOilOverheat`)
    /// adds 170 °C at the inlet. An abnormal heating goes at 0.5 °C/s, so the overheat comes about
    /// 3.5 min after the failure and the thermal disconnection 40 s later.
    const COOLING_LOST_EXTRA_INLET_CELSIUS: f64 = 170.;
    const ABNORMAL_HEATING_COEFFICIENT: f64 = 0.5;

    fn new(context: &mut InitContext, number: usize) -> ConstantSpeedDrive {
        ConstantSpeedDrive {
            oil_outlet_temperature_id: context.get_identifier(format!(
                "ELEC_ENG_GEN_{}_IDG_OIL_OUTLET_TEMPERATURE",
                number
            )),
            oil_outlet_temperature: ThermodynamicTemperature::new::<degree_celsius>(0.),
            oil_inlet_temperature_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_OIL_INLET_TEMPERATURE", number)),
            oil_inlet_temperature: ThermodynamicTemperature::new::<degree_celsius>(0.),
            is_connected_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_IS_CONNECTED", number)),
            connected: true,
            output_speed: AngularVelocity::default(),
            oil_low_pressure_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_OIL_LOW_PRESSURE", number)),
            oil_quantity: Ratio::new::<ratio>(1.),
            oil_low_pressure: false,
            oil_leak: Failure::new(FailureType::IntegratedDriveGeneratorOilLeak(number)),
            oil_overheat: Failure::new(FailureType::IntegratedDriveGeneratorOilOverheat(number)),
        }
    }

    pub fn update(&mut self, context: &UpdateContext, engine: &impl Engine, generator_load: Ratio) {
        let corrected_n2 = engine.corrected_n2();
        let turns = self.connected && corrected_n2 > Ratio::default();

        self.output_speed = if self.connected {
            (Self::M * engine.gearbox_speed()).min(AngularVelocity::new::<revolution_per_minute>(
                Self::OUTPUT_SPEED_RPM,
            ))
        } else {
            AngularVelocity::default()
        };

        if self.oil_leak.is_active() && turns {
            self.oil_quantity = (self.oil_quantity
                - Ratio::new::<ratio>(
                    Self::OIL_LEAK_RATE_PER_SECOND * context.delta_as_secs_f64(),
                ))
            .max(Ratio::default());
        }

        let (inlet_target, outlet_target) =
            self.get_target_temperatures(context, corrected_n2, generator_load);
        self.update_temperatures(context, inlet_target, outlet_target);

        if self.oil_outlet_temperature
            >= ThermodynamicTemperature::new::<degree_celsius>(Self::THERMAL_DISCONNECT_CELSIUS)
        {
            // The fusible device melts: the drive cannot be reconnected in flight.
            self.connected = false;
        }

        // The signal the GCU sends: inhibited below N2 14 % and once the drive is disconnected.
        // Design choice: it uses the corrected N2 the drive model already reads.
        self.oil_low_pressure = self.connected
            && corrected_n2.get::<percent>() >= Self::LOW_PRESSURE_INHIBITION_N2_PERCENT
            && self.oil_quantity < Ratio::new::<ratio>(Self::OIL_LOW_PRESSURE_QUANTITY);
    }

    fn abnormal_heating(&self) -> bool {
        self.oil_overheat.is_active() || self.oil_quantity < Ratio::new::<ratio>(1.)
    }

    /// Moves the inlet and outlet temperatures towards their targets. Design choice: both move at the rate chosen for
    /// the outlet, so that the RISE (outlet minus inlet) follows the generator load without a transient of its own.
    fn update_temperatures(
        &mut self,
        context: &UpdateContext,
        inlet_target: ThermodynamicTemperature,
        outlet_target: ThermodynamicTemperature,
    ) {
        let coefficient = if self.oil_outlet_temperature >= outlet_target {
            Self::IDG_COOLING_COEFFICIENT
        } else if self.abnormal_heating() {
            Self::ABNORMAL_HEATING_COEFFICIENT
        } else {
            Self::IDG_HEATING_COEFFICIENT
        };
        self.oil_outlet_temperature = calculate_towards_target_temperature(
            self.oil_outlet_temperature,
            outlet_target,
            coefficient,
            context.delta(),
        );
        self.oil_inlet_temperature = calculate_towards_target_temperature(
            self.oil_inlet_temperature,
            inlet_target,
            coefficient,
            context.delta(),
        );
    }

    /// The temperatures the oil tends to at the drive inlet (back from the coolers) and outlet, in that order
    fn get_target_temperatures(
        &self,
        context: &UpdateContext,
        corrected_n2: Ratio,
        generator_load: Ratio,
    ) -> (ThermodynamicTemperature, ThermodynamicTemperature) {
        if !self.connected {
            return (context.ambient_temperature(), context.ambient_temperature());
        }

        let ambient_temperature = context.ambient_temperature().get::<degree_celsius>();
        let mut inlet = Self::OIL_INLET_BASE_CELSIUS
            + Self::OIL_INLET_AMBIENT_FACTOR * ambient_temperature.clamp(-20., 50.);
        if self.oil_overheat.is_active() {
            inlet += Self::COOLING_LOST_EXTRA_INLET_CELSIUS;
        }
        let oil_missing = ((Self::OIL_COOLING_DEGRADED_QUANTITY
            - self.oil_quantity.get::<ratio>())
            / Self::OIL_COOLING_DEGRADED_QUANTITY)
            .clamp(0., 1.);
        inlet += Self::DRY_DRIVE_EXTRA_INLET_CELSIUS * oil_missing;

        let rise = Self::OIL_TEMPERATURE_RISE_NO_LOAD_CELSIUS
            + (Self::OIL_TEMPERATURE_RISE_FULL_LOAD_CELSIUS
                - Self::OIL_TEMPERATURE_RISE_NO_LOAD_CELSIUS)
                * generator_load.get::<ratio>().clamp(0., 1.);

        let heat = (corrected_n2.get::<percent>() / Self::FULL_HEAT_N2_PERCENT).clamp(0., 1.);

        (
            ThermodynamicTemperature::new::<degree_celsius>(
                ambient_temperature + (inlet - ambient_temperature) * heat,
            ),
            ThermodynamicTemperature::new::<degree_celsius>(
                ambient_temperature + (inlet + rise - ambient_temperature) * heat,
            ),
        )
    }
}
impl EngineGeneratorDrive for ConstantSpeedDrive {
    fn new_drive(context: &mut InitContext, number: usize) -> Self {
        Self::new(context, number)
    }

    fn update_drive(
        &mut self,
        context: &UpdateContext,
        engine: &impl Engine,
        generator_load: Ratio,
    ) {
        self.update(context, engine, generator_load);
    }

    fn output_speed(&self) -> AngularVelocity {
        self.output_speed
    }

    fn disconnect(&mut self) {
        self.connected = false;
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    fn oil_pressure_is_low(&self) -> bool {
        self.oil_low_pressure
    }

    fn oil_is_overheating(&self) -> bool {
        self.oil_outlet_temperature
            > ThermodynamicTemperature::new::<degree_celsius>(Self::OIL_OVERHEAT_CELSIUS)
    }
}
impl SimulationElement for ConstantSpeedDrive {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.oil_leak.accept(visitor);
        self.oil_overheat.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.oil_outlet_temperature_id, self.oil_outlet_temperature);
        writer.write(&self.oil_inlet_temperature_id, self.oil_inlet_temperature);
        writer.write(&self.is_connected_id, self.connected);
        writer.write(&self.oil_low_pressure_id, self.oil_low_pressure);
    }
}

/// The drive of a variable frequency generator (VFG, A380): the generator turns with the engine accessory gearbox and
/// gives 115 V AC at 360 to 800 Hz, depending on N2.
///
/// Oil system: an oil system lubricates and cools the generator, the ECAM monitors its oil level. The generator control
/// unit (GCU) sends three signals, the DRIVE pb FAULT light comes on with the last two:
/// - oil level low, ELEC DRIVE 1(2)(3)(4) OIL LEVEL LO: the generator disconnects automatically after 5 min if the crew
///   has not switched it off and the level stays low. Its procedure is GEN ... OFF: the GCU switches the generator off,
///   the drive stays connected.
/// - oil overheat, ELEC DRIVE 1(2)(3)(4) OIL OVHT: above 200 degrees C; above 250 degrees C the drive disconnects
///   automatically.
/// - oil pressure low, ELEC DRIVE 1(2)(3)(4) OIL PRESS LO: below 35 PSI; the drive disconnects automatically after
///   5 min if the pressure stays low. Its procedure is DRIVE ... DISC: the drive disconnects.
///
/// A disconnected drive cannot be reconnected in flight. Its signals then stop: the alerts make way for
/// ELEC DRIVE 1(2)(3)(4) DISCONNECTED.
pub struct DirectDrive {
    oil_outlet_temperature_id: VariableIdentifier,
    oil_outlet_temperature: ThermodynamicTemperature,
    is_connected_id: VariableIdentifier,
    connected: bool,
    output_speed: AngularVelocity,
    oil_level_low_id: VariableIdentifier,
    oil_low_pressure_id: VariableIdentifier,
    oil_overheat_id: VariableIdentifier,
    /// The share of the normal oil quantity left in the drive (1 = full)
    oil_quantity: Ratio,
    oil_level_low: bool,
    oil_low_pressure: bool,
    oil_level_low_duration: Duration,
    oil_low_pressure_duration: Duration,
    generator_switched_off_by_gcu: bool,
    oil_leak: Failure,
    oil_overheat: Failure,
}
impl DirectDrive {
    const TRANSMISSION_RATIO: f64 = 1.95;

    /// OIL OVHT threshold and automatic disconnection
    const OIL_OVERHEAT_CELSIUS: f64 = 200.;
    const THERMAL_DISCONNECT_CELSIUS: f64 = 250.;
    /// The automatic disconnection after 5 min of low oil level or low oil pressure
    const AUTOMATIC_DISCONNECTION_DELAY: Duration = Duration::from_secs(5 * 60);
    /// The GCU monitors the oil pressure while the generator turns in its normal frequency band (360 to 800 Hz).
    /// Design choice: an engine below this speed (shut down, starting) gives no low pressure signal.
    const MIN_MONITORING_FREQUENCY_HZ: f64 = 360.;
    /// Four pole generator, as `EngineGenerator` computes its output frequency
    const POLE_PAIRS_FREQUENCY_FACTOR: f64 = 4. / 120.;

    /// Design choice (no published normal values): with the engine at idle or above, the oil comes back from its
    /// cooler at 55 degrees C plus 0.4 times the outside air temperature (limited to -20..50 degrees C), and gains
    /// 8 degrees C, plus 12 degrees C at full generator load, in the generator. The oil stays between about 50 and 95
    /// degrees C, well below the 185 degrees C generator overheat of the ELEC AC page and the 200 degrees C of OIL
    /// OVHT.
    const OIL_INLET_BASE_CELSIUS: f64 = 55.;
    const OIL_INLET_AMBIENT_FACTOR: f64 = 0.4;
    const OIL_TEMPERATURE_RISE_NO_LOAD_CELSIUS: f64 = 8.;
    const OIL_TEMPERATURE_RISE_FULL_LOAD_CELSIUS: f64 = 20.;
    /// The generator produces its full heat from N2 60 % (about idle).
    const FULL_HEAT_N2_PERCENT: f64 = 60.;
    const HEATING_COEFFICIENT: f64 = 1.4;
    const COOLING_COEFFICIENT: f64 = 0.4;

    /// Design choice: a drive losing its oil (`FailureType::IntegratedDriveGeneratorOilLeak`, flyPad DRIVE n Oil Leak)
    /// loses 1 % of it each second while it turns. The level is low below 75 % of the oil (25 s after the start of the
    /// leak), the pressure below half of it (50 s). Below 60 % of the oil the cooling degrades, up to 200 degrees C more
    /// at the inlet when the drive is dry.
    const OIL_LEAK_RATE_PER_SECOND: f64 = 0.01;
    const OIL_LEVEL_LOW_QUANTITY: f64 = 0.75;
    const OIL_LOW_PRESSURE_QUANTITY: f64 = 0.5;
    const OIL_COOLING_DEGRADED_QUANTITY: f64 = 0.6;
    const DRY_DRIVE_EXTRA_INLET_CELSIUS: f64 = 200.;
    /// Design choice: a lost oil cooling (`FailureType::IntegratedDriveGeneratorOilOverheat`, flyPad DRIVE n Oil Cooling
    /// Lost) adds 200 degrees C at the inlet. An abnormal heating goes at 0.5 degrees C/s: OIL OVHT about 4 min after the
    /// failure, the automatic disconnection at 250 degrees C 100 s later.
    const COOLING_LOST_EXTRA_INLET_CELSIUS: f64 = 200.;
    const ABNORMAL_HEATING_COEFFICIENT: f64 = 0.5;

    fn new(context: &mut InitContext, number: usize) -> Self {
        Self {
            oil_outlet_temperature_id: context.get_identifier(format!(
                "ELEC_ENG_GEN_{}_IDG_OIL_OUTLET_TEMPERATURE",
                number
            )),
            oil_outlet_temperature: ThermodynamicTemperature::new::<degree_celsius>(0.),
            is_connected_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_IS_CONNECTED", number)),
            connected: true,
            output_speed: AngularVelocity::default(),
            oil_level_low_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_OIL_LEVEL_LOW", number)),
            oil_low_pressure_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_OIL_LOW_PRESSURE", number)),
            oil_overheat_id: context
                .get_identifier(format!("ELEC_ENG_GEN_{}_IDG_OIL_OVERHEAT", number)),
            oil_quantity: Ratio::new::<ratio>(1.),
            oil_level_low: false,
            oil_low_pressure: false,
            oil_level_low_duration: Duration::ZERO,
            oil_low_pressure_duration: Duration::ZERO,
            generator_switched_off_by_gcu: false,
            oil_leak: Failure::new(FailureType::IntegratedDriveGeneratorOilLeak(number)),
            oil_overheat: Failure::new(FailureType::IntegratedDriveGeneratorOilOverheat(number)),
        }
    }

    fn turns_in_normal_frequency_band(&self) -> bool {
        self.output_speed.get::<revolution_per_minute>() * Self::POLE_PAIRS_FREQUENCY_FACTOR
            >= Self::MIN_MONITORING_FREQUENCY_HZ
    }

    fn update_oil_quantity(&mut self, context: &UpdateContext) {
        if self.oil_leak.is_active() && self.output_speed > AngularVelocity::default() {
            self.oil_quantity = (self.oil_quantity
                - Ratio::new::<ratio>(
                    Self::OIL_LEAK_RATE_PER_SECOND * context.delta_as_secs_f64(),
                ))
            .max(Ratio::default());
        }
    }

    fn update_monitoring(&mut self, context: &UpdateContext) {
        self.oil_level_low =
            self.connected && self.oil_quantity < Ratio::new::<ratio>(Self::OIL_LEVEL_LOW_QUANTITY);
        self.oil_low_pressure = self.connected
            && self.turns_in_normal_frequency_band()
            && self.oil_quantity < Ratio::new::<ratio>(Self::OIL_LOW_PRESSURE_QUANTITY);

        self.oil_level_low_duration = if self.oil_level_low {
            self.oil_level_low_duration + context.delta()
        } else {
            Duration::ZERO
        };
        self.oil_low_pressure_duration = if self.oil_low_pressure {
            self.oil_low_pressure_duration + context.delta()
        } else {
            Duration::ZERO
        };

        if self.oil_level_low_duration >= Self::AUTOMATIC_DISCONNECTION_DELAY {
            self.generator_switched_off_by_gcu = true;
        }
        if self.oil_low_pressure_duration >= Self::AUTOMATIC_DISCONNECTION_DELAY
            || self.oil_outlet_temperature
                > ThermodynamicTemperature::new::<degree_celsius>(Self::THERMAL_DISCONNECT_CELSIUS)
        {
            self.connected = false;
            self.oil_level_low = false;
            self.oil_low_pressure = false;
        }
    }

    fn abnormal_heating(&self) -> bool {
        self.oil_overheat.is_active() || self.oil_quantity < Ratio::new::<ratio>(1.)
    }

    fn update_temperature(&mut self, context: &UpdateContext, target: ThermodynamicTemperature) {
        self.oil_outlet_temperature = calculate_towards_target_temperature(
            self.oil_outlet_temperature,
            target,
            if self.oil_outlet_temperature >= target {
                Self::COOLING_COEFFICIENT
            } else if self.abnormal_heating() {
                Self::ABNORMAL_HEATING_COEFFICIENT
            } else {
                Self::HEATING_COEFFICIENT
            },
            context.delta(),
        );
    }

    fn get_target_temperature(
        &self,
        context: &UpdateContext,
        corrected_n2: Ratio,
        generator_load: Ratio,
    ) -> ThermodynamicTemperature {
        if !self.connected {
            return context.ambient_temperature();
        }

        let ambient_temperature = context.ambient_temperature().get::<degree_celsius>();
        let mut inlet = Self::OIL_INLET_BASE_CELSIUS
            + Self::OIL_INLET_AMBIENT_FACTOR * ambient_temperature.clamp(-20., 50.);
        if self.oil_overheat.is_active() {
            inlet += Self::COOLING_LOST_EXTRA_INLET_CELSIUS;
        }
        let oil_missing = ((Self::OIL_COOLING_DEGRADED_QUANTITY
            - self.oil_quantity.get::<ratio>())
            / Self::OIL_COOLING_DEGRADED_QUANTITY)
            .clamp(0., 1.);
        inlet += Self::DRY_DRIVE_EXTRA_INLET_CELSIUS * oil_missing;

        let rise = Self::OIL_TEMPERATURE_RISE_NO_LOAD_CELSIUS
            + (Self::OIL_TEMPERATURE_RISE_FULL_LOAD_CELSIUS
                - Self::OIL_TEMPERATURE_RISE_NO_LOAD_CELSIUS)
                * generator_load.get::<ratio>().clamp(0., 1.);

        let heat = (corrected_n2.get::<percent>() / Self::FULL_HEAT_N2_PERCENT).clamp(0., 1.);

        ThermodynamicTemperature::new::<degree_celsius>(
            ambient_temperature + (inlet + rise - ambient_temperature) * heat,
        )
    }
}
impl EngineGeneratorDrive for DirectDrive {
    fn new_drive(context: &mut InitContext, number: usize) -> Self {
        Self::new(context, number)
    }

    fn update_drive(
        &mut self,
        context: &UpdateContext,
        engine: &impl Engine,
        generator_load: Ratio,
    ) {
        self.output_speed = if self.connected {
            engine.gearbox_speed() * Self::TRANSMISSION_RATIO
        } else {
            AngularVelocity::default()
        };

        self.update_oil_quantity(context);
        let target = self.get_target_temperature(context, engine.corrected_n2(), generator_load);
        self.update_temperature(context, target);
        self.update_monitoring(context);
    }

    fn output_speed(&self) -> AngularVelocity {
        self.output_speed
    }

    fn disconnect(&mut self) {
        self.connected = false;
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    fn oil_pressure_is_low(&self) -> bool {
        self.oil_low_pressure
    }

    fn oil_is_overheating(&self) -> bool {
        self.connected
            && self.oil_outlet_temperature
                > ThermodynamicTemperature::new::<degree_celsius>(Self::OIL_OVERHEAT_CELSIUS)
    }

    fn oil_level_is_low(&self) -> bool {
        self.oil_level_low
    }

    fn generator_switched_off_by_gcu(&self) -> bool {
        self.generator_switched_off_by_gcu
    }
}
impl SimulationElement for DirectDrive {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.oil_leak.accept(visitor);
        self.oil_overheat.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.oil_outlet_temperature_id, self.oil_outlet_temperature);
        writer.write(&self.is_connected_id, self.connected);
        writer.write(&self.oil_level_low_id, self.oil_level_is_low());
        writer.write(&self.oil_low_pressure_id, self.oil_pressure_is_low());
        writer.write(&self.oil_overheat_id, self.oil_is_overheating());
    }
}

#[cfg(test)]
mod tests {
    use more_asserts::*;

    use super::*;
    use crate::shared::{EngineCorrectedN1, EngineCorrectedN2, EngineUncorrectedN2};

    struct TestEngine {
        corrected_n2: Ratio,
    }
    impl TestEngine {
        fn new(engine_corrected_n2: Ratio) -> Self {
            Self {
                corrected_n2: engine_corrected_n2,
            }
        }
    }
    impl EngineCorrectedN1 for TestEngine {
        fn corrected_n1(&self) -> Ratio {
            unimplemented!()
        }
    }
    impl EngineCorrectedN2 for TestEngine {
        fn corrected_n2(&self) -> Ratio {
            self.corrected_n2
        }
    }
    impl EngineUncorrectedN2 for TestEngine {
        fn uncorrected_n2(&self) -> Ratio {
            unimplemented!()
        }
    }
    impl Engine for TestEngine {
        fn hydraulic_pump_output_speed(&self) -> AngularVelocity {
            unimplemented!()
        }

        fn oil_pressure_is_low(&self) -> bool {
            unimplemented!()
        }

        fn is_above_minimum_idle(&self) -> bool {
            unimplemented!()
        }

        fn net_thrust(&self) -> Mass {
            unimplemented!()
        }

        fn gearbox_speed(&self) -> AngularVelocity {
            AngularVelocity::new::<revolution_per_minute>(self.corrected_n2.get::<ratio>() * 16000.)
        }
    }

    struct TestOverhead {
        engine_gen_push_button_is_on: bool,
        idg_push_button_is_released: bool,
    }
    impl TestOverhead {
        fn new(engine_gen_push_button_is_on: bool, idg_push_button_is_released: bool) -> Self {
            Self {
                engine_gen_push_button_is_on,
                idg_push_button_is_released,
            }
        }
    }
    impl EngineGeneratorPushButtons for TestOverhead {
        fn engine_gen_push_button_is_on(&self, _: usize) -> bool {
            self.engine_gen_push_button_is_on
        }

        fn idg_push_button_is_released(&self, _: usize) -> bool {
            self.idg_push_button_is_released
        }
    }

    struct TestFireOverhead {
        engine_fire_push_button_is_released: bool,
    }
    impl TestFireOverhead {
        fn new(engine_fire_push_button_is_released: bool) -> Self {
            Self {
                engine_fire_push_button_is_released,
            }
        }
    }
    impl EngineFirePushButtons for TestFireOverhead {
        fn is_released(&self, _: usize) -> bool {
            self.engine_fire_push_button_is_released
        }
    }

    #[cfg(test)]
    mod engine_generator_tests {
        use super::*;
        use crate::{
            electrical::{
                consumption::PowerConsumer, ElectricalBus, ElectricalBusType, Electricity,
            },
            simulation::{
                test::{ReadByName, SimulationTestBed, TestBed},
                Aircraft, InitContext,
            },
        };
        use ntest::assert_about_eq;
        use uom::si::power::{kilowatt, watt};

        struct EngineGeneratorTestBed {
            test_bed: SimulationTestBed<TestAircraft>,
        }
        impl EngineGeneratorTestBed {
            fn with_running_engine() -> Self {
                Self {
                    test_bed: SimulationTestBed::new(TestAircraft::with_running_engine),
                }
            }

            fn with_shutdown_engine() -> Self {
                Self {
                    test_bed: SimulationTestBed::new(TestAircraft::with_shutdown_engine),
                }
            }

            fn frequency_is_normal(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_FREQUENCY_NORMAL")
            }

            fn potential_is_normal(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_POTENTIAL_NORMAL")
            }

            fn load_is_normal(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_LOAD_NORMAL")
            }

            fn load(&mut self) -> Ratio {
                self.read_by_name("ELEC_ENG_GEN_1_LOAD")
            }

            fn generator_is_powered(&mut self) -> bool {
                self.query_elec(|a, elec| a.generator_is_powered(elec))
            }

            fn generator_provides_stable_power_output(&self) -> bool {
                self.query(|a| a.generator_output_within_normal_parameters())
            }

            fn run_for_seconds(&mut self, seconds: u64) {
                for _ in 0..seconds {
                    self.run_with_delta(Duration::from_secs(1));
                }
            }

            fn idg_oil_outlet_temperature(&mut self) -> ThermodynamicTemperature {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE")
            }

            fn idg_oil_low_pressure(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_LOW_PRESSURE")
            }

            fn idg_is_connected(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_IS_CONNECTED")
            }

            fn idg_oil_is_overheating(&self) -> bool {
                self.query(|a| a.engine_gen.drive_oil_is_overheating())
            }

            /// The SD ELEC page RISE: outlet minus inlet temperature, in °C
            fn idg_oil_temperature_rise(&mut self) -> f64 {
                let inlet: ThermodynamicTemperature =
                    self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_INLET_TEMPERATURE");
                self.idg_oil_outlet_temperature().get::<degree_celsius>()
                    - inlet.get::<degree_celsius>()
            }
        }
        impl TestBed for EngineGeneratorTestBed {
            type Aircraft = TestAircraft;

            fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
                &self.test_bed
            }

            fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
                &mut self.test_bed
            }
        }

        struct TestAircraft {
            engine_gen: IntegratedDriveGenerator,
            bus: ElectricalBus,
            running: bool,
            gen_push_button_on: bool,
            idg_push_button_released: bool,
            fire_push_button_released: bool,
            consumer: PowerConsumer,
            generator_output_within_normal_parameters_before_processing_power_consumption_report:
                bool,
        }
        impl TestAircraft {
            fn new(running: bool, context: &mut InitContext) -> Self {
                Self {
                    engine_gen: IntegratedDriveGenerator::new(context, 1, Power::new::<kilowatt>(90.), 390.0..=410.0),
                    bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                    running,
                    gen_push_button_on: true,
                    idg_push_button_released: false,
                    fire_push_button_released: false,
                    consumer: PowerConsumer::from(ElectricalBusType::AlternatingCurrent(1)),
                    generator_output_within_normal_parameters_before_processing_power_consumption_report: false
                }
            }

            fn with_shutdown_engine(context: &mut InitContext) -> Self {
                TestAircraft::new(false, context)
            }

            fn with_running_engine(context: &mut InitContext) -> Self {
                TestAircraft::new(true, context)
            }

            fn disconnect_idg(&mut self) {
                self.idg_push_button_released = true;
            }

            fn gen_push_button_off(&mut self) {
                self.gen_push_button_on = false;
            }

            fn release_fire_push_button(&mut self) {
                self.fire_push_button_released = true;
            }

            fn generator_is_powered(&self, electricity: &Electricity) -> bool {
                electricity.is_powered(&self.engine_gen)
            }

            fn power_demand(&mut self, power: Power) {
                self.consumer.demand(power);
            }

            fn generator_output_within_normal_parameters_after_processing_power_consumption_report(
                &self,
            ) -> bool {
                self.generator_output_within_normal_parameters()
            }

            fn shutdown_engine(&mut self) {
                self.running = false;
            }

            fn start_engine(&mut self) {
                self.running = true;
            }

            fn generator_output_within_normal_parameters_before_processing_power_consumption_report(
                &self,
            ) -> bool {
                self.generator_output_within_normal_parameters_before_processing_power_consumption_report
            }

            fn generator_output_within_normal_parameters(&self) -> bool {
                self.engine_gen.output_within_normal_parameters()
            }
        }
        impl Aircraft for TestAircraft {
            fn update_before_power_distribution(
                &mut self,
                context: &UpdateContext,
                electricity: &mut Electricity,
            ) {
                self.engine_gen.update(
                    context,
                    &TestEngine::new(Ratio::new::<percent>(if self.running { 80. } else { 0. })),
                    &TestOverhead::new(self.gen_push_button_on, self.idg_push_button_released),
                    &TestFireOverhead::new(self.fire_push_button_released),
                );
                electricity.supplied_by(&self.engine_gen);
                electricity.flow(&self.engine_gen, &self.bus);

                self.generator_output_within_normal_parameters_before_processing_power_consumption_report = self.engine_gen.output_within_normal_parameters();
            }
        }
        impl SimulationElement for TestAircraft {
            fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
                self.engine_gen.accept(visitor);
                self.consumer.accept(visitor);

                visitor.visit(self);
            }
        }

        #[test]
        fn idg_oil_stays_below_the_advisory_temperature_at_full_load_on_a_hot_day() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(45.));
            test_bed.command(|a| a.power_demand(Power::new::<kilowatt>(110.)));

            test_bed.run_for_seconds(600);

            // The SD ELEC page flashes from 147 °C
            assert_lt!(
                test_bed.idg_oil_outlet_temperature(),
                ThermodynamicTemperature::new::<degree_celsius>(147.)
            );
            assert_gt!(
                test_bed.idg_oil_outlet_temperature(),
                ThermodynamicTemperature::new::<degree_celsius>(60.)
            );
            assert!(!test_bed.idg_oil_is_overheating());
            assert!(!test_bed.idg_oil_low_pressure());
        }

        #[test]
        fn idg_oil_temperature_rise_grows_with_the_generator_load() {
            // The RISE is the inlet to outlet difference
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(15.));
            test_bed.run_for_seconds(900);
            let no_load_rise = test_bed.idg_oil_temperature_rise();

            // The generator load is the demand times the 0.8 power factor over its 90 kW
            test_bed.command(|a| a.power_demand(Power::new::<kilowatt>(112.5)));
            test_bed.run_for_seconds(900);
            let full_load_rise = test_bed.idg_oil_temperature_rise();

            assert_about_eq!(no_load_rise, 8., 0.5);
            assert_about_eq!(full_load_rise, 20., 0.5);
        }

        #[test]
        fn idg_oil_temperature_rise_is_zero_with_the_engine_stopped() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run_for_seconds(300);
            test_bed.command(|a| a.shutdown_engine());

            test_bed.run_for_seconds(900);

            assert_about_eq!(test_bed.idg_oil_temperature_rise(), 0., 0.5);
        }

        #[test]
        fn idg_oil_cools_down_to_ambient_with_the_engine_stopped() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(15.));
            test_bed.run_for_seconds(300);
            test_bed.command(|a| a.shutdown_engine());

            test_bed.run_for_seconds(600);

            assert_about_eq!(
                test_bed
                    .idg_oil_outlet_temperature()
                    .get::<degree_celsius>(),
                15.,
                0.5
            );
        }

        #[test]
        fn an_idg_oil_leak_gives_a_low_oil_pressure() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run_for_seconds(60);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));

            test_bed.run_for_seconds(40);
            assert!(!test_bed.idg_oil_low_pressure());

            test_bed.run_for_seconds(15);
            assert!(test_bed.idg_oil_low_pressure());
        }

        #[test]
        fn the_idg_low_oil_pressure_is_inhibited_with_the_engine_stopped() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));
            test_bed.run_for_seconds(60);
            assert!(test_bed.idg_oil_low_pressure());

            test_bed.command(|a| a.shutdown_engine());
            test_bed.run_for_seconds(1);

            assert!(!test_bed.idg_oil_low_pressure());
        }

        #[test]
        fn the_idg_low_oil_pressure_goes_off_once_the_idg_is_disconnected() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));
            test_bed.run_for_seconds(60);

            test_bed.command(|a| a.disconnect_idg());
            test_bed.run_for_seconds(1);

            assert!(!test_bed.idg_oil_low_pressure());
        }

        #[test]
        fn an_idg_oil_leak_ends_in_an_overheat_then_a_thermal_disconnection() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run_for_seconds(300);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));

            test_bed.run_for_seconds(280);
            assert!(test_bed.idg_oil_is_overheating());
            assert!(test_bed.idg_is_connected());

            test_bed.run_for_seconds(120);
            assert!(!test_bed.idg_is_connected());
            assert!(!test_bed.generator_provides_stable_power_output());
        }

        #[test]
        fn a_lost_idg_oil_cooling_overheats_the_oil_then_disconnects_the_idg_at_200_c() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(15.));
            test_bed.run_for_seconds(300);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilOverheat(1));

            test_bed.run_for_seconds(180);
            assert!(!test_bed.idg_oil_is_overheating());

            test_bed.run_for_seconds(60);
            assert!(test_bed.idg_oil_is_overheating());
            assert!(test_bed.idg_is_connected());
            assert!(!test_bed.idg_oil_low_pressure());

            test_bed.run_for_seconds(60);
            assert!(!test_bed.idg_is_connected());
        }

        #[test]
        fn starts_unstable_with_engines_off() {
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run_without_delta();

            assert!(!test_bed.generator_provides_stable_power_output());
        }

        #[test]
        fn starts_stable_with_engines_on() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run_without_delta();

            assert!(test_bed.generator_provides_stable_power_output());
        }

        #[test]
        fn becomes_stable_once_engine_above_threshold_for_500_milliseconds() {
            // First enforcing engine in off state
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run_without_delta();

            test_bed.command(|a| a.start_engine());
            test_bed.run_with_delta(Duration::from_millis(500));

            assert!(test_bed.generator_provides_stable_power_output());
        }

        #[test]
        fn does_not_become_stable_before_engine_above_threshold_for_500_milliseconds() {
            // First enforcing engine in off state
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run_without_delta();

            test_bed.command(|a| a.start_engine());
            test_bed.run_with_delta(Duration::from_millis(499));

            assert!(!test_bed.generator_provides_stable_power_output());
        }

        #[test]
        fn when_engine_running_provides_output() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            assert!(test_bed.generator_is_powered());
        }

        #[test]
        fn when_engine_shutdown_provides_no_output() {
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run();

            assert!(!test_bed.generator_is_powered());
        }

        #[test]
        fn when_engine_running_but_idg_disconnected_provides_no_output() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.disconnect_idg());
            test_bed.run();

            assert!(!test_bed.generator_is_powered());
        }

        #[test]
        fn when_engine_running_but_generator_off_provides_no_output() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.gen_push_button_off());
            test_bed.run();

            assert!(!test_bed.generator_is_powered());
        }

        #[test]
        fn when_engine_running_but_fire_push_button_released_provides_no_output() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.release_fire_push_button());
            test_bed.run();

            assert!(!test_bed.generator_is_powered());
        }

        #[test]
        fn when_engine_shutdown_frequency_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run();

            assert!(!test_bed.frequency_is_normal());
        }

        #[test]
        fn when_engine_running_but_idg_disconnected_frequency_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.disconnect_idg());
            test_bed.run();

            assert!(!test_bed.frequency_is_normal());
        }

        #[test]
        fn when_engine_running_but_generator_off_frequency_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.gen_push_button_off());
            test_bed.run();

            assert!(!test_bed.frequency_is_normal());
        }

        #[test]
        fn when_engine_running_but_fire_push_button_released_frequency_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.release_fire_push_button());
            test_bed.run();

            assert!(!test_bed.frequency_is_normal());
        }

        #[test]
        fn when_engine_running_frequency_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            assert!(test_bed.frequency_is_normal());
        }

        #[test]
        fn when_engine_shutdown_potential_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run();

            assert!(!test_bed.potential_is_normal());
        }

        #[test]
        fn when_engine_running_but_idg_disconnected_potential_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.disconnect_idg());
            test_bed.run();

            assert!(!test_bed.potential_is_normal());
        }

        #[test]
        fn when_engine_running_but_generator_off_provides_potential_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.gen_push_button_off());
            test_bed.run();

            assert!(!test_bed.potential_is_normal());
        }

        #[test]
        fn when_engine_running_but_fire_push_button_released_potential_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.release_fire_push_button());
            test_bed.run();

            assert!(!test_bed.potential_is_normal());
        }

        #[test]
        fn when_engine_running_potential_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            assert!(test_bed.potential_is_normal());
        }

        #[test]
        fn when_engine_shutdown_has_no_load() {
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run();

            assert_eq!(test_bed.load(), Ratio::new::<percent>(0.));
        }

        #[test]
        fn when_engine_running_but_idg_disconnected_has_no_load() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.disconnect_idg());
            test_bed.run();

            assert_eq!(test_bed.load(), Ratio::new::<percent>(0.));
        }

        #[test]
        fn when_engine_running_but_generator_off_has_no_load() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.gen_push_button_off());
            test_bed.run();

            assert_eq!(test_bed.load(), Ratio::new::<percent>(0.));
        }

        #[test]
        fn when_engine_running_but_fire_push_button_released_has_no_load() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.release_fire_push_button());
            test_bed.run();

            assert_eq!(test_bed.load(), Ratio::new::<percent>(0.));
        }

        #[test]
        fn when_engine_running_but_potential_unused_has_no_load() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            assert_eq!(test_bed.load(), Ratio::new::<percent>(0.));
        }

        #[test]
        fn when_engine_running_and_potential_used_has_load() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.power_demand(Power::new::<watt>(50000.)));
            test_bed.run();

            assert_gt!(test_bed.load(), Ratio::new::<percent>(0.));
        }

        #[test]
        fn when_load_below_maximum_it_is_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.power_demand(Power::new::<watt>(90000. / 0.8)));
            test_bed.run();

            assert!(test_bed.load_is_normal());
        }

        #[test]
        fn when_load_exceeds_maximum_not_normal() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.power_demand(Power::new::<watt>((90000. / 0.8) + 1.)));
            test_bed.run();

            assert!(!test_bed.load_is_normal());
        }

        #[test]
        fn output_within_normal_parameters_when_load_exceeds_maximum() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();

            test_bed.command(|a| a.power_demand(Power::new::<watt>((90000. / 0.8) + 1.)));

            test_bed.run();

            assert!(test_bed.query(|a| a.generator_output_within_normal_parameters_after_processing_power_consumption_report()));
        }

        #[test]
        fn output_not_within_normal_parameters_when_engine_not_running() {
            let mut test_bed = EngineGeneratorTestBed::with_shutdown_engine();
            test_bed.run();

            assert!(!test_bed.query(|a| a.generator_output_within_normal_parameters_after_processing_power_consumption_report()));
        }

        #[test]
        fn output_within_normal_parameters_when_engine_running() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            assert!(test_bed.query(|a| a.generator_output_within_normal_parameters_after_processing_power_consumption_report()));
        }

        #[test]
        fn output_within_normal_parameters_adapts_to_shutting_down_idg_instantaneously() {
            // The frequency and potential of the generator are only known at the end of a tick,
            // due to them being directly related to the power consumption (large changes can cause
            // spikes and dips). However, the decision if a generator can supply power is made much
            // earlier in the tick. This is especially of great consequence when the IDG no longer
            // supplies potential but the previous tick's frequency and potential are still normal.
            // With this test we ensure that an IDG which is no longer supplying power is
            // immediately noticed and doesn't require another tick.
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            test_bed.command(|a| a.shutdown_engine());

            test_bed.run();

            assert!(!test_bed.query(|a| a.generator_output_within_normal_parameters_before_processing_power_consumption_report()));
        }

        #[test]
        fn writes_its_state() {
            let mut test_bed = EngineGeneratorTestBed::with_running_engine();
            test_bed.run();

            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_POTENTIAL"));
            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_POTENTIAL_NORMAL"));
            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_FREQUENCY"));
            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_FREQUENCY_NORMAL"));
            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_LOAD"));
            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_LOAD_NORMAL"));
        }
    }

    #[cfg(test)]
    mod engine_generator_drive_tests {
        use super::*;
        use crate::simulation::test::{ElementCtorFn, SimulationTestBed, TestBed};
        use rstest::rstest;
        use std::time::Duration;

        trait OilOutletTemperature {
            fn get_oil_outlet_temperature(&self) -> ThermodynamicTemperature;
        }
        impl OilOutletTemperature for ConstantSpeedDrive {
            fn get_oil_outlet_temperature(&self) -> ThermodynamicTemperature {
                self.oil_outlet_temperature
            }
        }
        impl OilOutletTemperature for DirectDrive {
            fn get_oil_outlet_temperature(&self) -> ThermodynamicTemperature {
                self.oil_outlet_temperature
            }
        }

        fn idg(context: &mut InitContext) -> ConstantSpeedDrive {
            ConstantSpeedDrive::new(context, 1)
        }

        fn vfg(context: &mut InitContext) -> DirectDrive {
            DirectDrive::new(context, 1)
        }

        #[rstest]
        #[case(idg)]
        #[case(vfg)]
        fn writes_its_state<T: SimulationElement>(#[case] drive: fn(&mut InitContext) -> T) {
            let mut test_bed = SimulationTestBed::from(ElementCtorFn(drive));
            test_bed.run();

            assert!(
                test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE")
            );
            assert!(test_bed.contains_variable_with_name("ELEC_ENG_GEN_1_IDG_IS_CONNECTED"));
        }

        #[rstest]
        #[case(idg)]
        #[case(vfg)]
        fn running_engine_warms_up_drive<
            T: SimulationElement + EngineGeneratorDrive + OilOutletTemperature + 'static,
        >(
            #[case] drive: fn(&mut InitContext) -> T,
        ) {
            let mut test_bed = SimulationTestBed::from(ElementCtorFn(drive))
                .with_update_after_power_distribution(engine_running_above_threshold(false));

            let starting_temperature = test_bed.query_element(|e| e.get_oil_outlet_temperature());

            test_bed.run_with_delta(Duration::from_secs(10));

            assert!(
                test_bed.query_element(|e| e.get_oil_outlet_temperature()) > starting_temperature
            );
        }

        #[rstest]
        #[case(idg)]
        #[case(vfg)]
        fn running_engine_does_not_warm_up_drive_when_disconnected<
            T: SimulationElement + EngineGeneratorDrive + OilOutletTemperature + 'static,
        >(
            #[case] drive: fn(&mut InitContext) -> T,
        ) {
            let mut test_bed = SimulationTestBed::from(ElementCtorFn(drive))
                .with_update_after_power_distribution(engine_running_above_threshold(true));

            let starting_temperature = test_bed.query_element(|e| e.get_oil_outlet_temperature());

            test_bed.run_with_delta(Duration::from_secs(10));

            assert_eq!(
                test_bed.query_element(|e| e.get_oil_outlet_temperature()),
                starting_temperature
            );
        }

        #[rstest]
        #[case(idg)]
        #[case(vfg)]
        fn shutdown_engine_cools_down_drive<
            T: SimulationElement + EngineGeneratorDrive + OilOutletTemperature + 'static,
        >(
            #[case] drive: fn(&mut InitContext) -> T,
        ) {
            let mut test_bed = SimulationTestBed::from(ElementCtorFn(drive))
                .with_update_after_power_distribution(engine_running_above_threshold(false));
            test_bed.run_with_delta(Duration::from_secs(10));

            let starting_temperature = test_bed.query_element(|e| e.get_oil_outlet_temperature());

            test_bed.set_update_after_power_distribution(engine_not_running);
            test_bed.run_with_delta(Duration::from_secs(10));

            assert!(
                test_bed.query_element(|e| e.get_oil_outlet_temperature()) < starting_temperature
            );
        }

        #[rstest]
        #[case(idg)]
        #[case(vfg)]
        fn cannot_reconnect_once_disconnected<
            T: SimulationElement + EngineGeneratorDrive + 'static,
        >(
            #[case] drive: fn(&mut InitContext) -> T,
        ) {
            let mut test_bed = SimulationTestBed::from(ElementCtorFn(drive))
                .with_update_after_power_distribution(engine_running_above_threshold(true));
            test_bed.run_with_delta(Duration::from_millis(500));

            test_bed.set_update_after_power_distribution(engine_running_above_threshold(false));
            test_bed.run_with_delta(Duration::from_millis(500));

            assert!(!test_bed.query_element(|e| e.is_connected()));
        }

        fn engine_not_running(drive: &mut impl EngineGeneratorDrive, context: &UpdateContext) {
            drive.update_drive(
                context,
                &TestEngine::new(Ratio::new::<percent>(0.)),
                Ratio::default(),
            )
        }

        fn engine_running_above_threshold<T: EngineGeneratorDrive>(
            idg_push_button_is_released: bool,
        ) -> impl Fn(&mut T, &UpdateContext) {
            move |drive: &mut T, context: &UpdateContext| {
                if idg_push_button_is_released {
                    drive.disconnect()
                }
                drive.update_drive(
                    context,
                    &TestEngine::new(Ratio::new::<percent>(80.)),
                    Ratio::default(),
                )
            }
        }
    }

    /// The variable frequency generator of the A380 and the oil system of its direct drive.
    #[cfg(test)]
    mod direct_drive_tests {
        use super::*;
        use crate::{
            electrical::{ElectricalBus, ElectricalBusType, Electricity},
            simulation::{
                test::{ReadByName, SimulationTestBed, TestBed},
                Aircraft, InitContext,
            },
        };
        use uom::si::power::kilowatt;

        struct DirectDriveTestAircraft {
            engine_gen: VariableFrequencyGenerator,
            bus: ElectricalBus,
            engine_corrected_n2: Ratio,
        }
        impl DirectDriveTestAircraft {
            fn new(context: &mut InitContext) -> Self {
                Self {
                    engine_gen: VariableFrequencyGenerator::new(
                        context,
                        1,
                        Power::new::<kilowatt>(150.),
                        360.0..=800.0,
                    ),
                    bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                    // The test engine turns the generator at N2 x 1040 Hz: 70 % gives 728 Hz, in the
                    // 360-800 Hz band
                    engine_corrected_n2: Ratio::new::<percent>(70.),
                }
            }
        }
        impl Aircraft for DirectDriveTestAircraft {
            fn update_before_power_distribution(
                &mut self,
                context: &UpdateContext,
                electricity: &mut Electricity,
            ) {
                self.engine_gen.update(
                    context,
                    &TestEngine::new(self.engine_corrected_n2),
                    &TestOverhead::new(true, false),
                    &TestFireOverhead::new(false),
                );
                electricity.supplied_by(&self.engine_gen);
                electricity.flow(&self.engine_gen, &self.bus);
            }
        }
        impl SimulationElement for DirectDriveTestAircraft {
            fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
                self.engine_gen.accept(visitor);
                self.bus.accept(visitor);
                visitor.visit(self);
            }
        }

        struct DirectDriveTestBed {
            test_bed: SimulationTestBed<DirectDriveTestAircraft>,
        }
        impl DirectDriveTestBed {
            fn new() -> Self {
                let mut test_bed = Self {
                    test_bed: SimulationTestBed::new(DirectDriveTestAircraft::new),
                };
                test_bed
                    .set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(15.));
                test_bed
            }

            fn run_for_seconds(&mut self, seconds: u64) {
                for _ in 0..seconds {
                    self.run_with_delta(Duration::from_secs(1));
                }
            }

            fn engine_corrected_n2(&mut self, n2_percent: f64) {
                self.command(|a| a.engine_corrected_n2 = Ratio::new::<percent>(n2_percent));
            }

            fn oil_outlet_temperature(&mut self) -> ThermodynamicTemperature {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE")
            }

            fn oil_level_low(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_LEVEL_LOW")
            }

            fn oil_low_pressure(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_LOW_PRESSURE")
            }

            fn oil_overheat(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_OIL_OVERHEAT")
            }

            fn drive_is_connected(&mut self) -> bool {
                self.read_by_name("ELEC_ENG_GEN_1_IDG_IS_CONNECTED")
            }

            fn generator_output_normal(&self) -> bool {
                self.query(|a| a.engine_gen.output_within_normal_parameters())
            }
        }
        impl TestBed for DirectDriveTestBed {
            type Aircraft = DirectDriveTestAircraft;

            fn test_bed(&self) -> &SimulationTestBed<DirectDriveTestAircraft> {
                &self.test_bed
            }

            fn test_bed_mut(&mut self) -> &mut SimulationTestBed<DirectDriveTestAircraft> {
                &mut self.test_bed
            }
        }

        #[test]
        fn vfg_oil_stays_below_the_generator_overheat_indication_at_high_n2_on_a_hot_day() {
            let mut test_bed = DirectDriveTestBed::new();
            test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(50.));
            // The highest N2 of the test engine in the 360-800 Hz band (the oil heat is full from N2 60 %)
            test_bed.engine_corrected_n2(76.);

            test_bed.run_for_seconds(600);

            // A380 ELEC AC page: the generator overheats above 185 degrees C
            assert_lt!(
                test_bed.oil_outlet_temperature(),
                ThermodynamicTemperature::new::<degree_celsius>(185.)
            );
            assert!(!test_bed.oil_overheat());
            assert!(!test_bed.oil_level_low());
            assert!(!test_bed.oil_low_pressure());
            assert!(test_bed.generator_output_normal());
        }

        #[test]
        fn a_vfg_oil_leak_gives_a_low_oil_level_then_a_low_oil_pressure() {
            let mut test_bed = DirectDriveTestBed::new();
            test_bed.run_for_seconds(60);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));

            test_bed.run_for_seconds(20);
            assert!(!test_bed.oil_level_low());

            test_bed.run_for_seconds(10);
            assert!(test_bed.oil_level_low());
            assert!(!test_bed.oil_low_pressure());

            test_bed.run_for_seconds(25);
            assert!(test_bed.oil_low_pressure());
            assert!(test_bed.drive_is_connected());
        }

        #[test]
        fn a_low_vfg_oil_level_for_5_min_switches_the_generator_off() {
            let mut test_bed = DirectDriveTestBed::new();
            test_bed.run_for_seconds(10);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));
            // The level is low from 25 s after the start of the leak
            test_bed.run_for_seconds(25 + 290);
            assert!(test_bed.generator_output_normal());

            test_bed.run_for_seconds(15);
            assert!(!test_bed.generator_output_normal());
            assert!(test_bed.drive_is_connected());
        }

        #[test]
        fn a_low_vfg_oil_pressure_for_5_min_disconnects_the_drive() {
            let mut test_bed = DirectDriveTestBed::new();
            test_bed.run_for_seconds(10);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));
            // The pressure is low from 50 s after the start of the leak
            test_bed.run_for_seconds(50 + 290);
            assert!(test_bed.drive_is_connected());

            test_bed.run_for_seconds(15);
            assert!(!test_bed.drive_is_connected());
            assert!(!test_bed.oil_low_pressure());
        }

        #[test]
        fn the_vfg_low_oil_pressure_is_inhibited_when_the_generator_does_not_turn() {
            let mut test_bed = DirectDriveTestBed::new();
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilLeak(1));
            test_bed.run_for_seconds(60);
            assert!(test_bed.oil_low_pressure());

            test_bed.engine_corrected_n2(0.);
            test_bed.run_for_seconds(1);

            assert!(!test_bed.oil_low_pressure());
            assert!(test_bed.oil_level_low());
        }

        #[test]
        fn a_lost_vfg_oil_cooling_overheats_the_oil_then_disconnects_the_drive_above_250_c() {
            let mut test_bed = DirectDriveTestBed::new();
            test_bed.run_for_seconds(300);
            test_bed.fail(FailureType::IntegratedDriveGeneratorOilOverheat(1));

            test_bed.run_for_seconds(200);
            assert!(!test_bed.oil_overheat());

            test_bed.run_for_seconds(80);
            assert!(test_bed.oil_overheat());
            assert!(test_bed.drive_is_connected());
            assert!(!test_bed.oil_low_pressure());

            test_bed.run_for_seconds(120);
            assert!(!test_bed.drive_is_connected());
            assert!(!test_bed.oil_overheat());
            assert!(!test_bed.generator_output_normal());
        }
    }
}
