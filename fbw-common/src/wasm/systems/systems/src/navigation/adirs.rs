use crate::air_conditioning::AdirsToAirCondInterface;
use crate::failures::{Failure, FailureType};
use crate::payload::BoardingRate;
use crate::shared::InternationalStandardAtmosphere;
use crate::simulation::{InitContext, VariableIdentifier};
use crate::{
    overhead::{IndicationLight, OnOffFaultPushButton},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        low_pass_filter::LowPassFilter,
        AdirsDiscreteOutputs, AdirsMeasurementOutputs, ElectricalBusType, ElectricalBuses,
        MachNumber,
    },
    simulation::{
        Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, Write, Writer,
    },
};
use bitflags::bitflags;
use nalgebra::{Rotation2, Vector2};
use std::{fmt::Display, time::Duration};
use uom::si::{
    acceleration::meter_per_second_squared,
    angle::{degree, radian},
    angular_velocity::degree_per_second,
    f64::*,
    length::foot,
    pressure::{hectopascal, inch_of_mercury},
    ratio::ratio,
    time::second,
    velocity::{foot_per_minute, foot_per_second, knot},
};
use uom::ConstZero;

pub trait AirDataReferenceBus {
    /// Label 203
    fn standard_altitude(&self) -> Arinc429Word<Length>;
    /// Label 204
    fn baro_corrected_altitude_1(&self) -> Arinc429Word<Length>;
    /// Label 205
    fn mach(&self) -> Arinc429Word<MachNumber>;
    /// Label 206
    fn computed_airspeed(&self) -> Arinc429Word<Velocity>;
    /// Label 207
    fn max_allowable_airspeed(&self) -> Arinc429Word<Velocity>;
    /// Label 210
    fn true_airspeed(&self) -> Arinc429Word<Velocity>;
    /// Label 211
    fn total_air_temperature(&self) -> Arinc429Word<ThermodynamicTemperature>;
    /// Label 212
    fn vertical_speed(&self) -> Arinc429Word<Velocity>;
    /// Label 213
    fn static_air_temperature(&self) -> Arinc429Word<ThermodynamicTemperature>;
    /// Label 220
    fn baro_corrected_altitude_2(&self) -> Arinc429Word<Length>;
    /// Label 234
    fn baro_correction_1(&self) -> Arinc429Word<Pressure>;
    /// Label 236
    fn baro_correction_2(&self) -> Arinc429Word<Pressure>;
    /// Label 241
    fn corrected_angle_of_attack(&self) -> Arinc429Word<Angle>;
}

pub trait InertialReferenceBus {
    /// Label 052
    fn pitch_angular_acc(&self) -> Arinc429Word<AngularAcceleration>;
    /// Label 053
    fn roll_angular_acc(&self) -> Arinc429Word<AngularAcceleration>;
    /// Label 054
    fn yaw_angular_acc(&self) -> Arinc429Word<AngularAcceleration>;
    /// Label 310
    fn ppos_latitude(&self) -> Arinc429Word<Angle>;
    /// Label 311
    fn ppos_longitude(&self) -> Arinc429Word<Angle>;
    /// Label 312
    fn ground_speed(&self) -> Arinc429Word<Velocity>;
    /// Label 313
    fn true_heading(&self) -> Arinc429Word<Angle>;
    /// Label 314
    fn true_track(&self) -> Arinc429Word<Angle>;
    /// Label 315
    fn wind_speed(&self) -> Arinc429Word<Velocity>;
    /// Label 316
    fn wind_dir_true(&self) -> Arinc429Word<Angle>;
    /// Label 317
    fn magnetic_track(&self) -> Arinc429Word<Angle>;
    /// Label 320
    fn magnetic_heading(&self) -> Arinc429Word<Angle>;
    /// Label 321
    fn drift_angle(&self) -> Arinc429Word<Angle>;
    /// Label 322
    fn flight_path_angle(&self) -> Arinc429Word<Angle>;
    /// Label 323
    fn flight_path_accel(&self) -> Arinc429Word<Ratio>;
    /// Label 324
    fn pitch_angle(&self) -> Arinc429Word<Angle>;
    /// Label 325
    fn roll_angle(&self) -> Arinc429Word<Angle>;
    /// Label 326
    fn body_pitch_rate(&self) -> Arinc429Word<AngularVelocity>;
    /// Label 327
    fn body_roll_rate(&self) -> Arinc429Word<AngularVelocity>;
    /// Label 330
    fn body_yaw_rate(&self) -> Arinc429Word<AngularVelocity>;
    /// Label 331
    fn body_long_acc(&self) -> Arinc429Word<Ratio>;
    /// Label 332
    fn body_lat_acc(&self) -> Arinc429Word<Ratio>;
    /// Label 333
    fn body_normal_acc(&self) -> Arinc429Word<Ratio>;
    /// Label 361
    fn inertial_altitude(&self) -> Arinc429Word<Length>;
    /// Label 365
    fn inertial_vertical_speed(&self) -> Arinc429Word<Velocity>;

    /// Label 270
    fn discrete_word_1(&self) -> Arinc429Word<u32>;
    /// Label 275
    fn discrete_word_2(&self) -> Arinc429Word<u32>;
    /// Label 276
    fn discrete_word_3(&self) -> Arinc429Word<u32>;
}

pub struct AirDataInertialReferenceSystemOverheadPanel {
    ir: [OnOffFaultPushButton; 3],
    mode_selectors: [InertialReferenceModeSelector; 3],
    adr: [OnOffFaultPushButton; 3],
    on_bat: IndicationLight,
    external_horn_id: VariableIdentifier,
    external_horn: bool,
}
impl AirDataInertialReferenceSystemOverheadPanel {
    const ADIRS_ON_BAT_NAME: &'static str = "ADIRS_ON_BAT";
    const EXTERNAL_HORN_NAME: &'static str = "ADIRS_EXTERNAL_HORN";
    const DURATION_AFTER_WHICH_ON_BAT_ILLUMINATES: Duration = Duration::from_millis(10500);
    const ON_BAT_ILLUMINATION_DURATION: Duration = Duration::from_millis(5500);

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            ir: [
                OnOffFaultPushButton::new_on(context, "ADIRS_IR_1"),
                OnOffFaultPushButton::new_on(context, "ADIRS_IR_2"),
                OnOffFaultPushButton::new_on(context, "ADIRS_IR_3"),
            ],
            mode_selectors: [
                InertialReferenceModeSelector::new(context, 1),
                InertialReferenceModeSelector::new(context, 2),
                InertialReferenceModeSelector::new(context, 3),
            ],
            adr: [
                OnOffFaultPushButton::new_on(context, "ADIRS_ADR_1"),
                OnOffFaultPushButton::new_on(context, "ADIRS_ADR_2"),
                OnOffFaultPushButton::new_on(context, "ADIRS_ADR_3"),
            ],
            on_bat: IndicationLight::new(context, Self::ADIRS_ON_BAT_NAME),
            external_horn_id: context.get_identifier(Self::EXTERNAL_HORN_NAME.to_owned()),
            external_horn: false,
        }
    }

    pub fn update(&mut self, context: &UpdateContext, adirs: &AirDataInertialReferenceSystem) {
        self.mode_selectors.iter_mut().for_each(|mode_selector| {
            mode_selector.update(context);
        });

        // A320 FCOM DSC-34-NAV-10-20 ON BAT light (a320_fcom.txt l.52646-52648): "The ON BAT light comes on in amber
        // when the aircraft battery supplies at least one IRS. The ON BAT light also comes on for a few seconds at the
        // beginning of a complete IRS alignment. The light does not come on in the case of a fast alignment."
        let complete_alignment_battery_test =
            self.mode_selectors
                .iter()
                .enumerate()
                .any(|(index, mode_selector)| {
                    let duration = mode_selector.not_off_duration();
                    duration >= Self::DURATION_AFTER_WHICH_ON_BAT_ILLUMINATES
                        && duration
                            < Self::DURATION_AFTER_WHICH_ON_BAT_ILLUMINATES
                                + Self::ON_BAT_ILLUMINATION_DURATION
                        && !adirs.ir_is_fast_aligning(index + 1)
                });
        let any_ir_on_battery = adirs.any_ir_on_battery();
        self.on_bat
            .set_illuminated(any_ir_on_battery || complete_alignment_battery_test);
        // "When the aircraft is on ground and if at least one ADIRU is supplied by aircraft batteries: An external horn
        // sounds" (l.52650-52652). The ADIRU and AVNCS light of the EXTERNAL POWER panel is not modelled.
        self.external_horn = any_ir_on_battery && context.is_on_ground();

        self.ir
            .iter_mut()
            .enumerate()
            .for_each(|(index, ir)| ir.set_fault(adirs.ir_has_fault(index + 1)));
        // l.52605-52606: ADR FAULT light "comes on with an ECAM caution if a fault is detected in the air data
        // reference part"
        self.adr
            .iter_mut()
            .enumerate()
            .for_each(|(index, adr)| adr.set_fault(adirs.adr_has_fault(index + 1)));
    }

    fn mode_of(&self, number: usize) -> InertialReferenceMode {
        self.mode_selectors[number - 1].mode()
    }

    fn adr_is_on(&self, number: usize) -> bool {
        self.mode_of(number) != InertialReferenceMode::Off && self.adr[number - 1].is_on()
    }

    fn ir_is_on(&self, number: usize) -> bool {
        self.mode_of(number) != InertialReferenceMode::Off && self.ir[number - 1].is_on()
    }
}
impl SimulationElement for AirDataInertialReferenceSystemOverheadPanel {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.ir, visitor);
        accept_iterable!(self.mode_selectors, visitor);
        accept_iterable!(self.adr, visitor);
        self.on_bat.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.external_horn_id, self.external_horn);
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum InertialReferenceMode {
    Off = 0,
    Navigation = 1,
    Attitude = 2,
}

try_read_write_enum!(InertialReferenceMode);

impl TryFrom<f64> for InertialReferenceMode {
    type Error = u8;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        match value as u8 {
            0 => Ok(InertialReferenceMode::Off),
            1 => Ok(InertialReferenceMode::Navigation),
            2 => Ok(InertialReferenceMode::Attitude),
            i => Err(i),
        }
    }
}

struct InertialReferenceModeSelector {
    mode_id: VariableIdentifier,
    mode: InertialReferenceMode,
    not_off_duration: Duration,
}
impl InertialReferenceModeSelector {
    fn new(context: &mut InitContext, number: usize) -> Self {
        Self {
            mode_id: context.get_identifier(Self::mode_id(number)),
            // We start in an aligned state to support starting on the
            // runway or in the air.
            mode: InertialReferenceMode::Navigation,
            not_off_duration: Duration::from_secs(0),
        }
    }

    fn mode_id(number: usize) -> String {
        format!("OVHD_ADIRS_IR_{}_MODE_SELECTOR_KNOB", number)
    }

    fn mode(&self) -> InertialReferenceMode {
        self.mode
    }

    fn not_off_duration(&self) -> Duration {
        self.not_off_duration
    }

    fn update(&mut self, context: &UpdateContext) {
        if self.mode == InertialReferenceMode::Off {
            self.not_off_duration = Duration::from_secs(0)
        } else {
            self.not_off_duration += context.delta();
        }
    }
}
impl SimulationElement for InertialReferenceModeSelector {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.mode = reader.read_discrete_or_fallback(
            &self.mode_id,
            "InertialReferenceModeSelector",
            InertialReferenceMode::Off,
        );
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum AlignState {
    Off = 0,
    Aligning = 1,
    Aligned = 2,
}

try_read_write_enum!(AlignState);

impl TryFrom<f64> for AlignState {
    type Error = u8;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        match value as u8 {
            1 => Ok(AlignState::Aligning),
            2 => Ok(AlignState::Aligned),
            i => Err(i),
        }
    }
}

#[derive(Clone, Copy)]
struct AdirsSimulatorData {
    mach_id: VariableIdentifier,
    mach: MachNumber,

    vertical_speed_id: VariableIdentifier,
    vertical_speed: Velocity,

    true_airspeed_id: VariableIdentifier,
    true_airspeed: Velocity,

    latitude_id: VariableIdentifier,
    latitude: Angle,

    longitude_id: VariableIdentifier,
    longitude: Angle,

    pitch_id: VariableIdentifier,
    pitch: Angle,

    roll_id: VariableIdentifier,
    roll: Angle,

    body_rotation_rate_x_id: VariableIdentifier,
    body_rotation_rate_x: AngularVelocity,

    body_rotation_rate_y_id: VariableIdentifier,
    body_rotation_rate_y: AngularVelocity,

    body_rotation_rate_z_id: VariableIdentifier,
    body_rotation_rate_z: AngularVelocity,

    heading_id: VariableIdentifier,
    heading: Angle,

    true_heading_id: VariableIdentifier,
    true_heading: Angle,

    track_id: VariableIdentifier,
    track: Angle,

    true_track_id: VariableIdentifier,
    true_track: Angle,

    ground_speed_id: VariableIdentifier,
    ground_speed: Velocity,

    total_air_temperature_id: VariableIdentifier,
    total_air_temperature: ThermodynamicTemperature,

    angle_of_attack_id: VariableIdentifier,
    angle_of_attack: Angle,

    baro_correction_1_id: VariableIdentifier,
    /// Baro Correction for captain's side in hPa from the FCU
    baro_correction_1: Arinc429Word<f64>,

    baro_correction_2_id: VariableIdentifier,
    /// Baro correction for fo's side in hPa from the FCU
    baro_correction_2: Arinc429Word<f64>,

    is_boarding_started_by_user_id: VariableIdentifier,
    boarding_rate_id: VariableIdentifier,

    is_boarding_started_by_user: bool,
    boarding_rate: BoardingRate,
}
impl AdirsSimulatorData {
    const MACH: &'static str = "AIRSPEED MACH";
    const INERTIAL_VERTICAL_SPEED: &'static str = "VELOCITY WORLD Y";
    const TRUE_AIRSPEED: &'static str = "AIRSPEED TRUE";
    const LATITUDE: &'static str = "PLANE LATITUDE";
    const LONGITUDE: &'static str = "PLANE LONGITUDE";
    const PITCH: &'static str = "PLANE PITCH DEGREES";
    const ROLL: &'static str = "PLANE BANK DEGREES";
    const BODY_ROTATION_RATE_X: &'static str = "ROTATION VELOCITY BODY X";
    const BODY_ROTATION_RATE_Y: &'static str = "ROTATION VELOCITY BODY Y";
    const BODY_ROTATION_RATE_Z: &'static str = "ROTATION VELOCITY BODY Z";
    const HEADING: &'static str = "PLANE HEADING DEGREES MAGNETIC";
    const TRUE_HEADING: &'static str = "PLANE HEADING DEGREES TRUE";
    const TRACK: &'static str = "GPS GROUND MAGNETIC TRACK";
    const TRUE_TRACK: &'static str = "GPS GROUND TRUE TRACK";
    const GROUND_SPEED: &'static str = "GPS GROUND SPEED";
    const TOTAL_AIR_TEMPERATURE: &'static str = "TOTAL AIR TEMPERATURE";
    const ANGLE_OF_ATTACK: &'static str = "INCIDENCE ALPHA";
    const BARO_CORRECTION_1_HPA: &'static str = "FCU_LEFT_EIS_BARO_HPA";
    const BARO_CORRECTION_2_HPA: &'static str = "FCU_RIGHT_EIS_BARO_HPA";
    const BOARDING_STARTED_BY_USR: &'static str = "BOARDING_STARTED_BY_USR";
    const BOARDING_RATE: &'static str = "BOARDING_RATE";

    fn new(context: &mut InitContext) -> Self {
        Self {
            mach_id: context.get_identifier(Self::MACH.to_owned()),
            mach: Default::default(),

            vertical_speed_id: context.get_identifier(Self::INERTIAL_VERTICAL_SPEED.to_owned()),
            vertical_speed: Default::default(),

            true_airspeed_id: context.get_identifier(Self::TRUE_AIRSPEED.to_owned()),
            true_airspeed: Default::default(),

            latitude_id: context.get_identifier(Self::LATITUDE.to_owned()),
            latitude: Default::default(),

            longitude_id: context.get_identifier(Self::LONGITUDE.to_owned()),
            longitude: Default::default(),

            pitch_id: context.get_identifier(Self::PITCH.to_owned()),
            pitch: Default::default(),

            roll_id: context.get_identifier(Self::ROLL.to_owned()),
            roll: Default::default(),

            body_rotation_rate_x_id: context.get_identifier(Self::BODY_ROTATION_RATE_X.to_owned()),
            body_rotation_rate_x: Default::default(),

            body_rotation_rate_y_id: context.get_identifier(Self::BODY_ROTATION_RATE_Y.to_owned()),
            body_rotation_rate_y: Default::default(),

            body_rotation_rate_z_id: context.get_identifier(Self::BODY_ROTATION_RATE_Z.to_owned()),
            body_rotation_rate_z: Default::default(),

            heading_id: context.get_identifier(Self::HEADING.to_owned()),
            heading: Default::default(),

            true_heading_id: context.get_identifier(Self::TRUE_HEADING.to_owned()),
            true_heading: Default::default(),

            track_id: context.get_identifier(Self::TRACK.to_owned()),
            track: Default::default(),

            true_track_id: context.get_identifier(Self::TRUE_TRACK.to_owned()),
            true_track: Default::default(),

            ground_speed_id: context.get_identifier(Self::GROUND_SPEED.to_owned()),
            ground_speed: Default::default(),

            total_air_temperature_id: context
                .get_identifier(Self::TOTAL_AIR_TEMPERATURE.to_owned()),
            total_air_temperature: Default::default(),

            angle_of_attack_id: context.get_identifier(Self::ANGLE_OF_ATTACK.to_owned()),
            angle_of_attack: Default::default(),

            baro_correction_1_id: context.get_identifier(Self::BARO_CORRECTION_1_HPA.to_owned()),
            baro_correction_1: Arinc429Word::new(1013., SignStatus::FailureWarning),

            baro_correction_2_id: context.get_identifier(Self::BARO_CORRECTION_2_HPA.to_owned()),
            baro_correction_2: Arinc429Word::new(1013., SignStatus::FailureWarning),

            is_boarding_started_by_user_id: context
                .get_identifier(Self::BOARDING_STARTED_BY_USR.to_owned()),
            boarding_rate_id: context.get_identifier(Self::BOARDING_RATE.to_owned()),

            is_boarding_started_by_user: false,
            boarding_rate: BoardingRate::Instant,
        }
    }
}
impl SimulationElement for AdirsSimulatorData {
    fn read(&mut self, reader: &mut SimulatorReader) {
        // To reduce reads, we only read these values once and then share it with the underlying ADRs and IRs.
        self.mach = reader.read(&self.mach_id);
        let vertical_speed: f64 = reader.read(&self.vertical_speed_id);
        self.vertical_speed = Velocity::new::<foot_per_minute>(vertical_speed);
        self.true_airspeed = reader.read(&self.true_airspeed_id);
        self.latitude = reader.read(&self.latitude_id);
        self.longitude = reader.read(&self.longitude_id);
        self.pitch = reader.read(&self.pitch_id);
        self.roll = reader.read(&self.roll_id);
        let body_rotation_rate_x: f64 = reader.read(&self.body_rotation_rate_x_id);
        let body_rotation_rate_y: f64 = reader.read(&self.body_rotation_rate_y_id);
        let body_rotation_rate_z: f64 = reader.read(&self.body_rotation_rate_z_id);
        self.body_rotation_rate_x = AngularVelocity::new::<degree_per_second>(body_rotation_rate_x);
        self.body_rotation_rate_y = AngularVelocity::new::<degree_per_second>(body_rotation_rate_y);
        self.body_rotation_rate_z = AngularVelocity::new::<degree_per_second>(body_rotation_rate_z);
        self.heading = reader.read(&self.heading_id);
        self.true_heading = reader.read(&self.true_heading_id);
        self.track = reader.read(&self.track_id);
        self.true_track = reader.read(&self.true_track_id);
        self.ground_speed = reader.read(&self.ground_speed_id);
        self.total_air_temperature = reader.read(&self.total_air_temperature_id);
        self.angle_of_attack = reader.read(&self.angle_of_attack_id);
        self.baro_correction_1 = reader.read_arinc429(&self.baro_correction_1_id);
        self.baro_correction_2 = reader.read_arinc429(&self.baro_correction_2_id);
        self.is_boarding_started_by_user = reader.read(&self.is_boarding_started_by_user_id);
        self.boarding_rate = reader.read_discrete_or_fallback(
            &self.boarding_rate_id,
            "BoardingRate",
            BoardingRate::Instant,
        );
    }
}

#[derive(Clone)]
pub struct LowSpeedWarningThreshold {
    lower: Velocity,
    upper: Velocity,
}
impl LowSpeedWarningThreshold {
    pub fn new(lower: Velocity, upper: Velocity) -> Self {
        Self { lower, upper }
    }

    fn speed_is_below(&self, speed: Velocity) -> bool {
        speed < self.lower
    }

    fn speed_is_above(&self, speed: Velocity) -> bool {
        speed > self.upper
    }
}

/// The bus that keeps the inertial reference part of an ADIRU running when its main bus is lost.
#[derive(Clone, Copy, Debug)]
pub struct InertialReferenceBackupSupply {
    bus: ElectricalBusType,
    /// The bus is supplied by the aircraft batteries: the ON BAT light comes on while it supplies the IR
    is_battery: bool,
    /// The backup supply of the IR stops after this time without the main bus (A320 IR 2 and IR 3: 5 min)
    time_limit: Option<Duration>,
}
impl InertialReferenceBackupSupply {
    pub fn new(bus: ElectricalBusType, is_battery: bool, time_limit: Option<Duration>) -> Self {
        Self {
            bus,
            is_battery,
            time_limit,
        }
    }
}

/// The electrical supply of one ADIRU. The whole ADIRU needs its main bus; the ADR part may need a second bus, and the
/// IR part may keep running on a backup bus.
#[derive(Clone, Copy, Debug)]
pub struct AdiruElectricalSupply {
    main: ElectricalBusType,
    /// A second bus that the air data reference part also needs (A380: the DC busbar of the ADIRU)
    adr_second: Option<ElectricalBusType>,
    ir_backup: Option<InertialReferenceBackupSupply>,
}
impl AdiruElectricalSupply {
    pub fn new(main: ElectricalBusType) -> Self {
        Self {
            main,
            adr_second: None,
            ir_backup: None,
        }
    }

    pub fn with_adr_second_bus(mut self, bus: ElectricalBusType) -> Self {
        self.adr_second = Some(bus);
        self
    }

    pub fn with_ir_backup(mut self, backup: InertialReferenceBackupSupply) -> Self {
        self.ir_backup = Some(backup);
        self
    }
}

#[derive(Clone)]
pub struct AirDataInertialReferenceUnitProgramming {
    vmo: Velocity,
    mmo: MachNumber,
    low_speed_warning_thresholds: [LowSpeedWarningThreshold; 4],
    electrical_supplies: [AdiruElectricalSupply; 3],
}
impl AirDataInertialReferenceUnitProgramming {
    pub fn new(
        vmo: Velocity,
        mmo: MachNumber,
        low_speed_warning_thresholds: [LowSpeedWarningThreshold; 4],
        electrical_supplies: [AdiruElectricalSupply; 3],
    ) -> Self {
        Self {
            vmo,
            mmo,
            low_speed_warning_thresholds,
            electrical_supplies,
        }
    }
}

pub struct AirDataInertialReferenceSystem {
    remaining_alignment_time_id: VariableIdentifier,
    configured_align_time_id: VariableIdentifier,
    aircraft_preset_quick_mode_id: VariableIdentifier,

    adirus: [AirDataInertialReferenceUnit; 3],
    configured_align_time: AlignTime,
    aircraft_preset_quick_mode: bool,
    simulator_data: AdirsSimulatorData,
    /// The simulation time, up to the power settling time
    time_since_start: Duration,
}
impl AirDataInertialReferenceSystem {
    /// While a flight loads, the electrical network may need a moment to supply the buses, e.g. until the generators
    /// of the running engines are online. The ADIRUs start aligned and initialised for a flight loaded on the runway or
    /// in the air, so they ignore their supply for this time (design choice, as the settling time of the A380 PRIM air
    /// data monitoring). Afterwards a loss of supply stops them.
    const POWER_SETTLING_TIME: Duration = Duration::from_secs(5);
    // TODO remove when A380X FWC is fixed
    const REMAINING_ALIGNMENT_TIME_KEY: &'static str = "ADIRS_REMAINING_IR_ALIGNMENT_TIME";
    const CONFIGURED_ALIGN_TIME_KEY: &'static str = "CONFIG_ADIRS_IR_ALIGN_TIME";
    // A32NX_AIRCRAFT_PRESET_QUICK_MODE LVar is set by the Aircraft Presets to allow expedited presets without
    // changing the general  alignment time setting
    const AIRCRAFT_PRESET_QUICK_MODE_KEY: &'static str = "AIRCRAFT_PRESET_QUICK_MODE";

    pub fn new(
        context: &mut InitContext,
        programming: AirDataInertialReferenceUnitProgramming,
    ) -> Self {
        Self {
            remaining_alignment_time_id: context
                .get_identifier(Self::REMAINING_ALIGNMENT_TIME_KEY.to_owned()),
            configured_align_time_id: context
                .get_identifier(Self::CONFIGURED_ALIGN_TIME_KEY.to_owned()),
            aircraft_preset_quick_mode_id: context
                .get_identifier(Self::AIRCRAFT_PRESET_QUICK_MODE_KEY.to_owned()),

            adirus: [1, 2, 3]
                .map(|n| AirDataInertialReferenceUnit::new(context, n, programming.clone())),
            configured_align_time: AlignTime::Realistic,
            aircraft_preset_quick_mode: false,
            simulator_data: AdirsSimulatorData::new(context),
            time_since_start: Duration::ZERO,
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        overhead: &AirDataInertialReferenceSystemOverheadPanel,
    ) {
        // adirs_quick_mode is set by the Aircraft Presets to allow expedited presets without
        // changing the alignment time setting
        let align_time = if self.aircraft_preset_quick_mode {
            AlignTime::Instant
        } else {
            self.configured_align_time
        };
        let simulator_data = self.simulator_data;
        self.time_since_start =
            (self.time_since_start + context.delta()).min(Self::POWER_SETTLING_TIME);
        let power_settling = self.time_since_start < Self::POWER_SETTLING_TIME;
        self.adirus.iter_mut().for_each(|adiru| {
            adiru.update(
                context,
                overhead,
                power_settling,
                align_time,
                self.aircraft_preset_quick_mode,
                simulator_data,
            )
        });
    }

    fn remaining_align_duration(&self) -> Duration {
        self.adirus
            .iter()
            .fold(None, |acc, x| match (acc, x.remaining_align_duration()) {
                (None, None) => None,
                (None, Some(remaining)) => Some(remaining),
                (Some(remaining), None) => Some(remaining),
                (Some(x), Some(y)) => Some(if x > y { x } else { y }),
            })
            .unwrap_or_else(|| Duration::from_secs(0))
    }

    fn ir_has_fault(&self, number: usize) -> bool {
        self.adirus[number - 1].ir_has_fault()
    }

    fn adr_has_fault(&self, number: usize) -> bool {
        self.adirus[number - 1].adr_has_fault()
    }

    fn ir_is_fast_aligning(&self, number: usize) -> bool {
        self.adirus[number - 1].ir.is_fast_aligning()
    }

    /// At least one IR is switched on and supplied by the aircraft batteries
    fn any_ir_on_battery(&self) -> bool {
        self.adirus.iter().any(|adiru| adiru.ir_on_battery)
    }

    pub fn adr_bus(&self, number: usize) -> &impl AirDataReferenceBus {
        &self.adirus[number - 1].adr
    }

    pub fn ir_bus(&self, number: usize) -> &impl InertialReferenceBus {
        &self.adirus[number - 1].ir
    }
}
impl SimulationElement for AirDataInertialReferenceSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.adirus, visitor);
        self.simulator_data.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.configured_align_time = reader.read_discrete_or_fallback(
            &self.configured_align_time_id,
            "AlignTime",
            AlignTime::Realistic,
        );
        self.aircraft_preset_quick_mode = reader.read(&self.aircraft_preset_quick_mode_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.remaining_alignment_time_id,
            self.remaining_align_duration(),
        );
    }
}
impl AdirsToAirCondInterface for AirDataInertialReferenceSystem {
    fn ground_speed(&self, adiru_number: usize) -> Arinc429Word<Velocity> {
        self.adirus[adiru_number - 1].ground_speed()
    }
    fn true_airspeed(&self, adiru_number: usize) -> Arinc429Word<Velocity> {
        self.adirus[adiru_number - 1].true_airspeed()
    }
    fn baro_correction(&self, adiru_number: usize) -> Arinc429Word<Pressure> {
        self.adirus[adiru_number - 1].baro_correction_1()
    }
    fn ambient_static_pressure(&self, adiru_number: usize) -> Arinc429Word<Pressure> {
        self.adirus[adiru_number - 1].ambient_static_pressure()
    }
}
impl AdirsDiscreteOutputs for AirDataInertialReferenceSystem {
    fn low_speed_warning_1(&self, adiru_number: usize) -> bool {
        self.adirus[adiru_number - 1].low_speed_warning_1()
    }

    fn low_speed_warning_2(&self, adiru_number: usize) -> bool {
        self.adirus[adiru_number - 1].low_speed_warning_2()
    }

    fn low_speed_warning_3(&self, adiru_number: usize) -> bool {
        self.adirus[adiru_number - 1].low_speed_warning_3()
    }

    fn low_speed_warning_4(&self, adiru_number: usize) -> bool {
        self.adirus[adiru_number - 1].low_speed_warning_4()
    }
}
impl AdirsMeasurementOutputs for AirDataInertialReferenceSystem {
    fn is_fully_aligned(&self, adiru_number: usize) -> bool {
        self.adirus[adiru_number - 1].is_fully_aligned()
    }

    fn latitude(&self, adiru_number: usize) -> Arinc429Word<Angle> {
        self.adirus[adiru_number - 1].latitude()
    }

    fn longitude(&self, adiru_number: usize) -> Arinc429Word<Angle> {
        self.adirus[adiru_number - 1].longitude()
    }

    fn heading(&self, adiru_number: usize) -> Arinc429Word<Angle> {
        self.adirus[adiru_number - 1].heading()
    }

    fn true_heading(&self, adiru_number: usize) -> Arinc429Word<Angle> {
        self.adirus[adiru_number - 1].true_heading()
    }

    fn vertical_speed(&self, adiru_number: usize) -> Arinc429Word<Velocity> {
        self.adirus[adiru_number - 1].vertical_speed()
    }

    fn altitude(&self, adiru_number: usize) -> Arinc429Word<Length> {
        self.adirus[adiru_number - 1].altitude()
    }

    fn angle_of_attack(&self, adiru_number: usize) -> Arinc429Word<Angle> {
        self.adirus[adiru_number - 1].angle_of_attack()
    }

    fn computed_airspeed(&self, adiru_number: usize) -> Arinc429Word<Velocity> {
        self.adirus[adiru_number - 1].computed_airspeed()
    }
}

struct AirDataInertialReferenceUnit {
    number: usize,
    state_id: VariableIdentifier,

    adr: AirDataReference,
    ir: InertialReference,

    supply: AdiruElectricalSupply,
    main_bus_powered: bool,
    adr_second_bus_powered: bool,
    ir_backup_bus_powered: bool,
    /// How long the ADR part has been without its supply, for the short power interruption tolerance
    adr_unpowered_duration: Duration,
    /// How long the IR part has been without any supply, for the short power interruption tolerance
    ir_unpowered_duration: Duration,
    /// How long the IR part has been running on its backup bus since the main bus was lost
    ir_duration_on_backup: Duration,
    /// The IR part is switched on and supplied by the aircraft batteries (ON BAT light)
    ir_on_battery: bool,

    // Discrete outputs
    low_speed_warning_thresholds: [LowSpeedWarningThreshold; 4],
    low_speed_warnings: [bool; 4],
}
impl AirDataInertialReferenceUnit {
    /// A short power interruption, e.g. a bus transfer, does not stop the ADIRU (design choice: the FCOM gives no
    /// value; 200 ms covers the bus transfers of the electrical models).
    const POWER_INTERRUPTION_TOLERANCE: Duration = Duration::from_millis(200);

    fn new(
        context: &mut InitContext,
        number: usize,
        programming: AirDataInertialReferenceUnitProgramming,
    ) -> Self {
        Self {
            number,
            state_id: context.get_identifier(Self::state_id(number)),
            adr: AirDataReference::new(context, number, programming.vmo, programming.mmo),
            ir: InertialReference::new(context, number),

            supply: programming.electrical_supplies[number - 1],
            main_bus_powered: false,
            adr_second_bus_powered: false,
            ir_backup_bus_powered: false,
            adr_unpowered_duration: Duration::ZERO,
            ir_unpowered_duration: Duration::ZERO,
            ir_duration_on_backup: Duration::ZERO,
            ir_on_battery: false,

            low_speed_warning_thresholds: programming.low_speed_warning_thresholds,
            low_speed_warnings: [false; 4],
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        overhead: &AirDataInertialReferenceSystemOverheadPanel,
        power_settling: bool,
        align_time: AlignTime,
        // TODO: this should be refactored (abstracted) away from the AirInertialReferenceUnit struct
        aircraft_preset_quick_mode: bool,
        simulator_data: AdirsSimulatorData,
    ) {
        self.update_power(context, overhead, power_settling);

        self.adr.update(
            context,
            overhead,
            self.adr_is_powered(),
            aircraft_preset_quick_mode,
            simulator_data,
        );
        self.ir.update(
            context,
            &self.adr,
            overhead,
            self.ir_is_powered(),
            align_time,
            aircraft_preset_quick_mode,
            simulator_data,
        );

        self.update_discrete_outputs();
    }

    /// Which parts of the ADIRU are supplied: the ADR part needs the main bus (and its second bus if it has one), the
    /// IR part needs the main bus or its backup bus, the latter for a limited time on some IRs.
    fn update_power(
        &mut self,
        context: &UpdateContext,
        overhead: &AirDataInertialReferenceSystemOverheadPanel,
        power_settling: bool,
    ) {
        if power_settling {
            self.adr_unpowered_duration = Duration::ZERO;
            self.ir_unpowered_duration = Duration::ZERO;
            self.ir_duration_on_backup = Duration::ZERO;
            self.ir_on_battery = false;
            return;
        }

        let adr_supplied = self.main_bus_powered
            && (self.supply.adr_second.is_none() || self.adr_second_bus_powered);

        if self.main_bus_powered {
            self.ir_duration_on_backup = Duration::ZERO;
        } else if self.ir_backup_bus_powered {
            self.ir_duration_on_backup += context.delta();
        }
        let ir_on_backup = !self.main_bus_powered
            && self.ir_backup_bus_powered
            && self.supply.ir_backup.is_some_and(|backup| {
                backup
                    .time_limit
                    .is_none_or(|limit| self.ir_duration_on_backup < limit)
            });
        let ir_supplied = self.main_bus_powered || ir_on_backup;

        self.adr_unpowered_duration = if adr_supplied {
            Duration::ZERO
        } else {
            self.adr_unpowered_duration + context.delta()
        };
        self.ir_unpowered_duration = if ir_supplied {
            Duration::ZERO
        } else {
            self.ir_unpowered_duration + context.delta()
        };

        // The mode selector OFF de-energises the ADIRU (FCOM l.52622), which then takes no battery power
        self.ir_on_battery = ir_on_backup
            && self
                .supply
                .ir_backup
                .is_some_and(|backup| backup.is_battery)
            && overhead.mode_of(self.number) != InertialReferenceMode::Off;
    }

    fn adr_is_powered(&self) -> bool {
        self.adr_unpowered_duration <= Self::POWER_INTERRUPTION_TOLERANCE
    }

    fn ir_is_powered(&self) -> bool {
        self.ir_unpowered_duration <= Self::POWER_INTERRUPTION_TOLERANCE
    }

    fn adr_has_fault(&self) -> bool {
        self.adr.has_fault()
    }

    fn is_fully_aligned(&self) -> bool {
        self.ir.is_fully_aligned()
    }

    fn remaining_align_duration(&self) -> Option<Duration> {
        self.ir.remaining_align_duration()
    }

    fn state(&self) -> AlignState {
        if self.is_fully_aligned() {
            AlignState::Aligned
        } else if self.ir.is_aligning() {
            AlignState::Aligning
        } else {
            AlignState::Off
        }
    }

    fn state_id(number: usize) -> String {
        format!("ADIRS_ADIRU_{}_STATE", number)
    }

    fn ir_has_fault(&self) -> bool {
        self.ir.has_fault()
    }

    // When the ADR is unpowered (i.e. knob is set to OFF), all discretes go to open circuit (false).
    // Discrete #4 is inverted, so ground when below 260kts, OC otherwise.
    // When CAS is invalid but the ADR is otherwise powered (currently only possible when ADR p/b is off),
    // 1-3 remain in their previous state, and 4 goes OC.
    fn update_discrete_outputs(&mut self) {
        let speed = self.adr.computed_airspeed_raw();

        if self.adr.is_on {
            for (low_speed_warning, threshold) in self
                .low_speed_warnings
                .iter_mut()
                .zip(&self.low_speed_warning_thresholds)
                .take(3)
            {
                if threshold.speed_is_below(speed) {
                    *low_speed_warning = false;
                } else if threshold.speed_is_above(speed) {
                    *low_speed_warning = true;
                }
            }
        }

        if self.low_speed_warning_thresholds[3].speed_is_below(speed) && self.adr.is_on {
            self.low_speed_warnings[3] = true;
        } else if self.low_speed_warning_thresholds[3].speed_is_above(speed) || !self.adr.is_on {
            self.low_speed_warnings[3] = false;
        }

        if !self.adr.is_initialised() {
            self.low_speed_warnings = [false; 4];
        }
    }

    fn low_speed_warning_1(&self) -> bool {
        self.low_speed_warnings[0]
    }

    fn low_speed_warning_2(&self) -> bool {
        self.low_speed_warnings[1]
    }

    fn low_speed_warning_3(&self) -> bool {
        self.low_speed_warnings[2]
    }

    fn low_speed_warning_4(&self) -> bool {
        self.low_speed_warnings[3]
    }

    fn latitude(&self) -> Arinc429Word<Angle> {
        self.ir.latitude()
    }

    fn longitude(&self) -> Arinc429Word<Angle> {
        self.ir.longitude()
    }

    fn heading(&self) -> Arinc429Word<Angle> {
        self.ir.heading()
    }

    fn true_heading(&self) -> Arinc429Word<Angle> {
        self.ir.true_heading()
    }

    fn vertical_speed(&self) -> Arinc429Word<Velocity> {
        self.ir.vertical_speed()
    }

    fn altitude(&self) -> Arinc429Word<Length> {
        self.adr.altitude()
    }

    fn ground_speed(&self) -> Arinc429Word<Velocity> {
        self.ir.ground_speed()
    }

    fn computed_airspeed(&self) -> Arinc429Word<Velocity> {
        self.adr.computed_airspeed()
    }

    fn true_airspeed(&self) -> Arinc429Word<Velocity> {
        self.adr.true_airspeed()
    }

    fn baro_correction_1(&self) -> Arinc429Word<Pressure> {
        self.adr.baro_correction_1()
    }

    fn ambient_static_pressure(&self) -> Arinc429Word<Pressure> {
        self.adr.corrected_average_static_pressure()
    }

    fn angle_of_attack(&self) -> Arinc429Word<Angle> {
        self.adr.angle_of_attack()
    }
}
impl SimulationElement for AirDataInertialReferenceUnit {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.adr.accept(visitor);
        self.ir.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.state_id, self.state())
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.main_bus_powered = buses.is_powered(self.supply.main);
        self.adr_second_bus_powered = self
            .supply
            .adr_second
            .is_some_and(|bus| buses.is_powered(bus));
        self.ir_backup_bus_powered = self
            .supply
            .ir_backup
            .is_some_and(|backup| buses.is_powered(backup.bus));
    }
}

struct AdirsDiscreteOutput<T> {
    id: VariableIdentifier,
    value: T,
}
impl<T: Copy + Default + PartialOrd> AdirsDiscreteOutput<T> {
    fn new_adr(context: &mut InitContext, number: usize, name: &str) -> Self {
        Self::new(context, OutputDataType::Adr, number, name)
    }

    fn new_ir(context: &mut InitContext, number: usize, name: &str) -> Self {
        Self::new(context, OutputDataType::Ir, number, name)
    }

    fn new(
        context: &mut InitContext,
        data_type: OutputDataType,
        number: usize,
        name: &str,
    ) -> Self {
        Self {
            id: context.get_identifier(output_data_id(data_type, number, name)),
            value: Default::default(),
        }
    }

    fn set_value(&mut self, value: T) {
        self.value = value;
    }

    fn write_to<U: Write<T> + Writer>(&self, writer: &mut U) {
        writer.write(&self.id, self.value);
    }
}

struct AdirsArinc429Data<T> {
    id: VariableIdentifier,
    value: T,
    ssm: SignStatus,
}
impl<T: Copy + Default + PartialOrd> AdirsArinc429Data<T> {
    fn new_adr(context: &mut InitContext, number: usize, name: &str) -> Self {
        Self::new(context, OutputDataType::Adr, number, name)
    }

    fn new_ir(context: &mut InitContext, number: usize, name: &str) -> Self {
        Self::new(context, OutputDataType::Ir, number, name)
    }

    fn new(
        context: &mut InitContext,
        data_type: OutputDataType,
        number: usize,
        name: &str,
    ) -> Self {
        Self {
            id: context.get_identifier(output_data_id(data_type, number, name)),
            value: Default::default(),
            ssm: SignStatus::NoComputedData,
        }
    }

    fn value(&self) -> T {
        self.value
    }

    fn ssm(&self) -> SignStatus {
        self.ssm
    }

    fn set_value(&mut self, value: T, ssm: SignStatus) {
        self.value = value;
        self.ssm = ssm;
    }

    fn set_from(&mut self, other: &AdirsArinc429Data<T>) {
        self.set_value(other.value, other.ssm);
    }

    /// Sets failure warning with the default (0.0) value.
    fn set_failure_warning(&mut self) {
        self.value = Default::default();
        self.ssm = SignStatus::FailureWarning;
    }

    /// Sets no computed data with the default (0.0) value.
    fn set_no_computed_data(&mut self) {
        self.value = Default::default();
        self.ssm = SignStatus::NoComputedData;
    }

    /// Sets normal operation with the given value.
    fn set_normal_operation_value(&mut self, value: T) {
        self.value = value;
        self.ssm = SignStatus::NormalOperation;
    }

    /// Sets normal operation with the given value when above the threshold,
    /// no computed data otherwise.
    fn normal_above_threshold_ncd_otherwise(&mut self, threshold: T, value: T) {
        if value < threshold {
            self.set_no_computed_data();
        } else {
            self.set_normal_operation_value(value);
        }
    }

    fn write_to<U: Write<T> + Writer>(&self, writer: &mut U) {
        writer.write_arinc429(&self.id, self.value, self.ssm);
    }

    fn write_to_converted<U: Write<f64> + Writer, V: Fn(T) -> f64>(
        &self,
        writer: &mut U,
        convert: V,
    ) {
        writer.write_arinc429(&self.id, convert(self.value), self.ssm);
    }
}

#[derive(Clone, Copy)]
enum OutputDataType {
    Adr,
    Ir,
}
impl Display for OutputDataType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputDataType::Adr => write!(f, "ADR"),
            OutputDataType::Ir => write!(f, "IR"),
        }
    }
}

fn output_data_id(data_type: OutputDataType, number: usize, name: &str) -> String {
    format!("ADIRS_{}_{}_{}", data_type, number, name)
}

bitflags! {
    #[derive(Default)]
    struct AdrDiscrete1Flags: u32 {
        const ICING_DETECTOR_HEAT = 1;
        const PITOT_HEAT = 1 << 1;
        const ADR_STATUS_FAIL = 1 << 2;
        const RIGHT_STATIC_HEAT = 1 << 3;
        const LEFT_STATIC_HEAT = 1 << 4;
        const TAT_HEAT = 1 << 5;
        const AOA_1_SENSOR_HEAT = 1 << 6;
        const AOA_2_SENSOR_HEAT = 1 << 7;
        const OVERSPEED_WARNING = 1 << 8;
        // spare bit
        const AOA_AVERAGE_UNIQUE = 1 << 10;
        const VMO_MMO_1 = 1 << 11;
        const VMO_MMO_2 = 1 << 12;
        const VMO_MMO_3 = 1 << 13;
        const VMO_MMO_4 = 1 << 14;
        const ALTERNATE_SSEC_A = 1 << 15;
        const ALTERNATE_SSEC_B = 1 << 16;
        const BARO_PORT_A = 1 << 17;
        const ZERO_MACH_SSEC = 1 << 18;
    }
}

struct AirDataReference {
    number: usize,
    vmo: Velocity,
    mmo: MachNumber,
    is_on: bool,
    is_overspeed: bool,

    /// label 234
    baro_correction_1_hpa: AdirsArinc429Data<Pressure>,
    /// label 235
    baro_correction_1_inhg: AdirsArinc429Data<Pressure>,
    /// label 236
    baro_correction_2_hpa: AdirsArinc429Data<Pressure>,
    /// label 237
    baro_correction_2_inhg: AdirsArinc429Data<Pressure>,
    corrected_average_static_pressure: AdirsArinc429Data<Pressure>,
    /// pressure altitude
    altitude: AdirsArinc429Data<Length>,
    /// baro corrected altitude for the captain's side
    baro_corrected_altitude_1: AdirsArinc429Data<Length>,
    /// baro corrected altitude for the fo's side
    baro_corrected_altitude_2: AdirsArinc429Data<Length>,
    /// label 206, computed airspeed in knots, NCD below 30 knots.
    computed_airspeed: AdirsArinc429Data<Velocity>,
    /// label 207, max allowable airspeed in knots (considering both VMO and MMO).
    max_airspeed: AdirsArinc429Data<Velocity>,
    /// label 205, computed mach number, NCD below mach 0.1.
    mach: AdirsArinc429Data<MachNumber>,
    barometric_vertical_speed: AdirsArinc429Data<f64>,
    true_airspeed: AdirsArinc429Data<Velocity>,
    static_air_temperature: AdirsArinc429Data<ThermodynamicTemperature>,
    total_air_temperature: AdirsArinc429Data<ThermodynamicTemperature>,
    angle_of_attack: AdirsArinc429Data<Angle>,
    discrete_word_1: AdirsArinc429Data<u32>,

    static_pressure_filter: LowPassFilter<Pressure>,
    vertical_speed_filter: LowPassFilter<f64>,

    remaining_initialisation_duration: Option<Duration>,

    /// Erroneous total pressure (pitot) input: airspeed, Mach and TAS read low with a valid status
    airspeed_erroneous_failure: Failure,
    /// Erroneous angle of attack probe: the angle of attack reads high with a valid status
    angle_of_attack_erroneous_failure: Failure,
    /// The air data reference part fails: no valid output, FAULT light
    fault_failure: Failure,
    /// The ADIRU is supplied and its mode selector is not OFF
    is_energised: bool,
    /// The ADR FAULT discrete (FAULT light and FWC)
    fault_warn_discrete: AdirsDiscreteOutput<bool>,
}
impl AirDataReference {
    const INITIALISATION_DURATION: Duration = Duration::from_secs(18);
    const INITIALISATION_QUICK_DURATION: Duration = Duration::from_secs(2);
    const BARO_CORRECTION_1_HPA: &'static str = "BARO_CORRECTION_1_HPA";
    const BARO_CORRECTION_1_INHG: &'static str = "BARO_CORRECTION_1_INHG";
    const BARO_CORRECTION_2_HPA: &'static str = "BARO_CORRECTION_2_HPA";
    const BARO_CORRECTION_2_INHG: &'static str = "BARO_CORRECTION_2_INHG";
    const CORRECTED_AVERAGE_STATIC_PRESSURE: &'static str = "CORRECTED_AVERAGE_STATIC_PRESSURE";
    const ALTITUDE: &'static str = "ALTITUDE";
    const BARO_CORRECTED_ALTITUDE_1: &'static str = "BARO_CORRECTED_ALTITUDE_1";
    const BARO_CORRECTED_ALTITUDE_2: &'static str = "BARO_CORRECTED_ALTITUDE_2";
    const COMPUTED_AIRSPEED: &'static str = "COMPUTED_AIRSPEED";
    const MAX_AIRSPEED: &'static str = "MAX_AIRSPEED";
    const MACH: &'static str = "MACH";
    const BAROMETRIC_VERTICAL_SPEED: &'static str = "BAROMETRIC_VERTICAL_SPEED";
    const TRUE_AIRSPEED: &'static str = "TRUE_AIRSPEED";
    const STATIC_AIR_TEMPERATURE: &'static str = "STATIC_AIR_TEMPERATURE";
    const TOTAL_AIR_TEMPERATURE: &'static str = "TOTAL_AIR_TEMPERATURE";
    const ANGLE_OF_ATTACK: &'static str = "ANGLE_OF_ATTACK";
    const DISCRETE_WORD_1: &'static str = "DISCRETE_WORD_1";
    const FAULT_WARN_DISCRETE: &'static str = "FAULT_WARN_DISCRETE";

    const MINIMUM_TAS: f64 = 60.;
    const MINIMUM_CAS: f64 = 30.;
    const MINIMUM_MACH: f64 = 0.1;
    const MINIMUM_CAS_FOR_AOA: f64 = 60.;
    const MINIMUM_VALID_ALTITUDE: f64 = -2000.;
    const MAXIMUM_VALID_ALTITUDE: f64 = 50000.;

    // Approx 8 Hz filter
    const STATIC_PORT_TIME_CONSTANT: Duration = Duration::from_millis(125);
    // 1 second filter
    const VERTICAL_SPEED_TIME_CONSTANT: Duration = Duration::from_secs(1);

    /// Airspeed error of an erroneous pitot input (design choice: no published failure values; 40 kt is well above
    /// the 16 kt CAS threshold of the A380 PRIM air data monitoring).
    const ERRONEOUS_AIRSPEED_ERROR_KNOTS: f64 = -40.;
    /// Angle of attack error of an erroneous AOA probe (design choice: above the 3.6 deg in-flight and the 8 deg
    /// on-ground AOA thresholds of the A380 PRIM monitoring).
    const ERRONEOUS_ANGLE_OF_ATTACK_ERROR_DEGREES: f64 = 10.;

    fn new(context: &mut InitContext, number: usize, vmo: Velocity, mmo: MachNumber) -> Self {
        Self {
            number,
            vmo,
            mmo,
            is_on: true,
            is_overspeed: false,

            baro_correction_1_hpa: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BARO_CORRECTION_1_HPA,
            ),
            baro_correction_1_inhg: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BARO_CORRECTION_1_INHG,
            ),
            baro_correction_2_hpa: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BARO_CORRECTION_2_HPA,
            ),
            baro_correction_2_inhg: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BARO_CORRECTION_2_INHG,
            ),
            corrected_average_static_pressure: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::CORRECTED_AVERAGE_STATIC_PRESSURE,
            ),
            altitude: AdirsArinc429Data::new_adr(context, number, Self::ALTITUDE),
            baro_corrected_altitude_1: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BARO_CORRECTED_ALTITUDE_1,
            ),
            baro_corrected_altitude_2: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BARO_CORRECTED_ALTITUDE_2,
            ),
            computed_airspeed: AdirsArinc429Data::new_adr(context, number, Self::COMPUTED_AIRSPEED),
            max_airspeed: AdirsArinc429Data::new_adr(context, number, Self::MAX_AIRSPEED),
            mach: AdirsArinc429Data::new_adr(context, number, Self::MACH),
            barometric_vertical_speed: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::BAROMETRIC_VERTICAL_SPEED,
            ),
            true_airspeed: AdirsArinc429Data::new_adr(context, number, Self::TRUE_AIRSPEED),
            static_air_temperature: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::STATIC_AIR_TEMPERATURE,
            ),
            total_air_temperature: AdirsArinc429Data::new_adr(
                context,
                number,
                Self::TOTAL_AIR_TEMPERATURE,
            ),
            angle_of_attack: AdirsArinc429Data::new_adr(context, number, Self::ANGLE_OF_ATTACK),
            discrete_word_1: AdirsArinc429Data::new_adr(context, number, Self::DISCRETE_WORD_1),

            static_pressure_filter: LowPassFilter::new_with_init_value(
                Self::STATIC_PORT_TIME_CONSTANT,
                InternationalStandardAtmosphere::ground_pressure(),
            ),
            vertical_speed_filter: LowPassFilter::new(Self::VERTICAL_SPEED_TIME_CONSTANT),

            // Start fully initialised.
            remaining_initialisation_duration: Some(Duration::from_secs(0)),

            airspeed_erroneous_failure: Failure::new(FailureType::AdrAirspeedErroneous(number)),
            angle_of_attack_erroneous_failure: Failure::new(
                FailureType::AdrAngleOfAttackErroneous(number),
            ),
            fault_failure: Failure::new(FailureType::AdrFault(number)),
            is_energised: true,
            fault_warn_discrete: AdirsDiscreteOutput::new_adr(
                context,
                number,
                Self::FAULT_WARN_DISCRETE,
            ),
        }
    }

    /// The airspeed this ADR measures: the sim value, or a low value with an erroneous pitot input.
    /// Mach and TAS follow the same ratio, as they come from the same total pressure.
    fn measured_airspeed_ratio(&self, computed_airspeed: Velocity) -> f64 {
        if !self.airspeed_erroneous_failure.is_active() || computed_airspeed <= Velocity::ZERO {
            return 1.;
        }
        let airspeed_knots = computed_airspeed.get::<knot>();
        let erroneous = (airspeed_knots + Self::ERRONEOUS_AIRSPEED_ERROR_KNOTS).max(0.);
        erroneous / airspeed_knots
    }

    fn measured_angle_of_attack(&self, angle_of_attack: Angle) -> Angle {
        if self.angle_of_attack_erroneous_failure.is_active() {
            angle_of_attack + Angle::new::<degree>(Self::ERRONEOUS_ANGLE_OF_ATTACK_ERROR_DEGREES)
        } else {
            angle_of_attack
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        overhead: &AirDataInertialReferenceSystemOverheadPanel,
        is_powered: bool,
        aircraft_preset_quick_mode: bool,
        simulator_data: AdirsSimulatorData,
    ) {
        // Without power the ADR is off, as with the mode selector OFF: it initialises again when the power comes back
        let mode = if is_powered {
            overhead.mode_of(self.number)
        } else {
            InertialReferenceMode::Off
        };
        self.is_energised = mode != InertialReferenceMode::Off;
        self.is_on = is_powered && overhead.adr_is_on(self.number);
        self.update_remaining_initialisation_duration(context, aircraft_preset_quick_mode, mode);
        self.update_values(context, simulator_data);
        self.update_discrete_word_1();
        self.fault_warn_discrete.set_value(self.has_fault());
    }

    fn update_remaining_initialisation_duration(
        &mut self,
        context: &UpdateContext,
        aircraft_preset_quick_mode: bool,
        mode: InertialReferenceMode,
    ) {
        let initialisation_duration: Duration = if aircraft_preset_quick_mode {
            Self::INITIALISATION_QUICK_DURATION
        } else {
            Self::INITIALISATION_DURATION
        };
        self.remaining_initialisation_duration = remaining_initialisation_duration(
            context,
            initialisation_duration,
            mode,
            self.remaining_initialisation_duration,
        );
    }

    /// A fault is detected in the air data reference part: the ADR FAULT light and discrete (A320 FCOM
    /// l.52605-52606). An unsupplied or switched off ADIRU detects nothing.
    fn has_fault(&self) -> bool {
        self.fault_failure.is_active() && self.is_energised
    }

    fn calculate_baro_alt_correction(baro_correction: f64) -> Length {
        Length::new::<foot>(-145442.15 * (1. - (baro_correction / 1013.25).powf(0.192263)))
    }

    fn update_altitude_word(altitude: Length, output: &mut AdirsArinc429Data<Length>) {
        // the output is 17 bits with 1 foot resolution, and we're already clamping the value on the next line
        let rounded_alt = Length::new::<foot>(altitude.get::<foot>().round());
        if rounded_alt >= Length::new::<foot>(Self::MINIMUM_VALID_ALTITUDE)
            && rounded_alt <= Length::new::<foot>(Self::MAXIMUM_VALID_ALTITUDE)
        {
            output.set_normal_operation_value(rounded_alt);
        } else {
            output.set_value(Length::default(), SignStatus::FailureWarning);
        }
    }

    fn calculate_altitude_from_static_pressure(static_pressure: Pressure) -> Length {
        // Use the ADR formula to calculate altitude.
        // We do not use the InternationalStandardAtmosphere functions as they do not match,
        // and are only valid in the troposphere.
        Length::new::<foot>(if static_pressure.get::<hectopascal>() >= 226.323 {
            145442.156
                * (1.
                    - (static_pressure.get::<hectopascal>()
                        / InternationalStandardAtmosphere::ground_pressure().get::<hectopascal>())
                    .powf(0.190263))
        } else {
            148897.4 - 47907.18 * static_pressure.get::<hectopascal>().log10()
        })
    }

    fn update_values(&mut self, context: &UpdateContext, simulator_data: AdirsSimulatorData) {
        // For now some of the data will be read from the context. Later the context will no longer
        // contain this information (and instead all usages will be replaced by requests to the ADIRUs).

        // If the ADR is off or not initialized, output all labels as FW with value 0.
        if !self.is_valid() {
            self.baro_correction_1_hpa.set_failure_warning();
            self.baro_correction_1_inhg.set_failure_warning();
            self.baro_correction_2_hpa.set_failure_warning();
            self.baro_correction_2_inhg.set_failure_warning();
            self.corrected_average_static_pressure.set_failure_warning();
            self.altitude.set_failure_warning();
            self.baro_corrected_altitude_1.set_failure_warning();
            self.baro_corrected_altitude_2.set_failure_warning();
            self.barometric_vertical_speed.set_failure_warning();
            self.computed_airspeed.set_failure_warning();
            self.max_airspeed.set_failure_warning();
            self.true_airspeed.set_failure_warning();
            self.mach.set_failure_warning();
            self.total_air_temperature.set_failure_warning();
            self.static_air_temperature.set_failure_warning();
            self.angle_of_attack.set_failure_warning();
            self.is_overspeed = false;

            self.static_pressure_filter
                .reset(context.ambient_pressure());
            self.vertical_speed_filter.reset(0.);
        } else {
            // If it is on and initialized, output normal values.

            // This filter is not reset when invalid, as we want to keep the last valid value.
            let last_valid_static_pressure = self.static_pressure_filter.output();
            let static_pressure = self
                .static_pressure_filter
                .update(context.delta(), context.ambient_pressure());

            let pressure_altitude =
                AirDataReference::calculate_altitude_from_static_pressure(static_pressure);
            let last_valid_pressure_altitude =
                AirDataReference::calculate_altitude_from_static_pressure(
                    last_valid_static_pressure,
                );

            AirDataReference::update_altitude_word(pressure_altitude, &mut self.altitude);

            if simulator_data.baro_correction_1.is_normal_operation()
                || simulator_data.baro_correction_1.is_functional_test()
            {
                let correction_1 = AirDataReference::calculate_baro_alt_correction(
                    simulator_data.baro_correction_1.value(),
                );

                AirDataReference::update_altitude_word(
                    pressure_altitude + correction_1,
                    &mut self.baro_corrected_altitude_1,
                );

                self.baro_correction_1_hpa.set_value(
                    Pressure::new::<hectopascal>(simulator_data.baro_correction_1.value()),
                    simulator_data.baro_correction_1.ssm(),
                );
                self.baro_correction_1_inhg.set_value(
                    Pressure::new::<hectopascal>(simulator_data.baro_correction_1.value()),
                    simulator_data.baro_correction_1.ssm(),
                );
            } else {
                self.baro_corrected_altitude_1
                    .set_value(Default::default(), SignStatus::NoComputedData);
                self.baro_correction_1_hpa
                    .set_value(Default::default(), SignStatus::NoComputedData);
                self.baro_correction_1_inhg
                    .set_value(Default::default(), SignStatus::NoComputedData);
            }

            if simulator_data.baro_correction_2.is_normal_operation()
                || simulator_data.baro_correction_2.is_functional_test()
            {
                let correction_2 = AirDataReference::calculate_baro_alt_correction(
                    simulator_data.baro_correction_2.value(),
                );

                AirDataReference::update_altitude_word(
                    pressure_altitude + correction_2,
                    &mut self.baro_corrected_altitude_2,
                );

                self.baro_correction_2_hpa.set_value(
                    Pressure::new::<hectopascal>(simulator_data.baro_correction_2.value()),
                    simulator_data.baro_correction_2.ssm(),
                );
                self.baro_correction_2_inhg.set_value(
                    Pressure::new::<hectopascal>(simulator_data.baro_correction_2.value()),
                    simulator_data.baro_correction_2.ssm(),
                );
            } else {
                self.baro_corrected_altitude_2
                    .set_value(Default::default(), SignStatus::NoComputedData);
                self.baro_correction_2_hpa
                    .set_value(Default::default(), SignStatus::NoComputedData);
                self.baro_correction_2_inhg
                    .set_value(Default::default(), SignStatus::NoComputedData);
            }

            self.corrected_average_static_pressure
                .set_normal_operation_value(static_pressure);

            let delta_alt = pressure_altitude - last_valid_pressure_altitude;
            if context.delta() > Duration::default() {
                let raw_vs = (delta_alt / Time::new::<second>(context.delta_as_secs_f64()))
                    .get::<foot_per_minute>();
                self.vertical_speed_filter.update(context.delta(), raw_vs);
            }
            self.barometric_vertical_speed
                .set_normal_operation_value(self.vertical_speed_filter.output());

            // An erroneous pitot input scales the CAS, Mach and TAS of this ADR down
            let airspeed_ratio = self.measured_airspeed_ratio(context.indicated_airspeed());

            // If CAS is below 30kn, output as 0 with SSM = NCD
            let computed_airspeed = context.indicated_airspeed() * airspeed_ratio;
            self.computed_airspeed.normal_above_threshold_ncd_otherwise(
                Velocity::new::<knot>(Self::MINIMUM_CAS),
                computed_airspeed,
            );

            let max_airspeed = self.calculate_max_airspeed(context);
            self.max_airspeed
                .set_value(max_airspeed, SignStatus::NormalOperation);

            self.is_overspeed = computed_airspeed
                > (max_airspeed + Velocity::new::<knot>(if self.is_overspeed { 4. } else { 8. }));

            // If mach is below 0.1, output as 0 with SSM = NCD
            self.mach.normal_above_threshold_ncd_otherwise(
                MachNumber::from(Self::MINIMUM_MACH),
                MachNumber::from(f64::from(simulator_data.mach) * airspeed_ratio),
            );

            // If TAS is below 60 kts, output as 0 kt with SSM = NCD.
            self.true_airspeed.normal_above_threshold_ncd_otherwise(
                Velocity::new::<knot>(Self::MINIMUM_TAS),
                simulator_data.true_airspeed * airspeed_ratio,
            );

            self.angle_of_attack.set_value(
                self.measured_angle_of_attack(simulator_data.angle_of_attack),
                if computed_airspeed < Velocity::new::<knot>(Self::MINIMUM_CAS_FOR_AOA) {
                    SignStatus::NoComputedData
                } else {
                    SignStatus::NormalOperation
                },
            );

            self.total_air_temperature
                .set_normal_operation_value(simulator_data.total_air_temperature);
            self.static_air_temperature
                .set_normal_operation_value(context.ambient_temperature());
        }
    }

    fn update_discrete_word_1(&mut self) {
        let mut discrete_word = AdrDiscrete1Flags::default();

        if self.is_on {
            // FIXME implement icing detector heat
            // FIXME implement pitot heat

            if !self.is_valid() {
                discrete_word |= AdrDiscrete1Flags::ADR_STATUS_FAIL;
            }

            // FIXME implement right static heat
            // FIXME implement left static heat
            // FIXME implement TAT heat
            // FIXME implement NO1 AOA sensor heat
            // FIXME implement NO2 AOA sensor heat

            if self.is_overspeed {
                discrete_word |= AdrDiscrete1Flags::OVERSPEED_WARNING;
            }

            // FIXME implement AOA average/unique status
            // FIXME implement VMO/MMO bits 1-4
            // FIXME implement alternate SSEC A/B
            // FIXME implement baro port A
            // FIXME implement zero mach ssec
        }

        self.discrete_word_1.set_value(
            discrete_word.bits(),
            if self.is_on {
                SignStatus::NormalOperation
            } else {
                SignStatus::FailureWarning
            },
        );
    }

    fn is_initialised(&self) -> bool {
        self.remaining_initialisation_duration == Some(Duration::from_secs(0))
    }

    fn is_valid(&self) -> bool {
        self.is_on && self.is_initialised() && !self.fault_failure.is_active()
    }

    fn computed_airspeed_raw(&self) -> Velocity {
        self.computed_airspeed.value()
    }

    fn altitude(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(self.altitude.value(), self.altitude.ssm())
    }

    fn baro_correction_1(&self) -> Arinc429Word<Pressure> {
        Arinc429Word::new(
            self.baro_correction_1_hpa.value(),
            self.baro_correction_1_hpa.ssm(),
        )
    }

    fn corrected_average_static_pressure(&self) -> Arinc429Word<Pressure> {
        Arinc429Word::new(
            self.corrected_average_static_pressure.value(),
            self.corrected_average_static_pressure.ssm(),
        )
    }

    fn calculate_max_airspeed(&self, context: &UpdateContext) -> Velocity {
        if self.is_valid() {
            self.vmo.min(self.mmo.to_cas(context.ambient_pressure()))
        } else {
            self.vmo
        }
    }

    fn angle_of_attack(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.angle_of_attack.value(), self.angle_of_attack.ssm())
    }
}
impl AirDataReferenceBus for AirDataReference {
    fn standard_altitude(&self) -> Arinc429Word<Length> {
        self.altitude()
    }

    fn baro_corrected_altitude_1(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(
            self.baro_corrected_altitude_1.value(),
            self.baro_corrected_altitude_1.ssm(),
        )
    }

    fn mach(&self) -> Arinc429Word<MachNumber> {
        Arinc429Word::new(self.mach.value(), self.mach.ssm())
    }

    fn computed_airspeed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.computed_airspeed.value(), self.computed_airspeed.ssm())
    }

    fn max_allowable_airspeed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.max_airspeed.value(), self.max_airspeed.ssm())
    }

    fn true_airspeed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.true_airspeed.value(), self.true_airspeed.ssm())
    }

    fn total_air_temperature(&self) -> Arinc429Word<ThermodynamicTemperature> {
        Arinc429Word::new(
            self.total_air_temperature.value(),
            self.total_air_temperature.ssm(),
        )
    }

    fn vertical_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(
            Velocity::new::<foot_per_minute>(self.barometric_vertical_speed.value()),
            self.barometric_vertical_speed.ssm(),
        )
    }

    fn static_air_temperature(&self) -> Arinc429Word<ThermodynamicTemperature> {
        Arinc429Word::new(
            self.static_air_temperature.value(),
            self.static_air_temperature.ssm(),
        )
    }

    fn baro_corrected_altitude_2(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(
            self.baro_corrected_altitude_1.value(),
            self.baro_corrected_altitude_1.ssm(),
        )
    }

    fn baro_correction_1(&self) -> Arinc429Word<Pressure> {
        Arinc429Word::new(
            self.baro_correction_1_hpa.value(),
            self.baro_correction_1_hpa.ssm(),
        )
    }

    fn baro_correction_2(&self) -> Arinc429Word<Pressure> {
        Arinc429Word::new(
            self.baro_correction_2_hpa.value(),
            self.baro_correction_2_hpa.ssm(),
        )
    }

    fn corrected_angle_of_attack(&self) -> Arinc429Word<Angle> {
        self.angle_of_attack()
    }
}
impl SimulationElement for AirDataReference {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.airspeed_erroneous_failure.accept(visitor);
        self.angle_of_attack_erroneous_failure.accept(visitor);
        self.fault_failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        self.baro_correction_1_hpa
            .write_to_converted(writer, |value| value.get::<hectopascal>());
        self.baro_correction_1_inhg
            .write_to_converted(writer, |value| value.get::<inch_of_mercury>());
        self.baro_correction_2_hpa
            .write_to_converted(writer, |value| value.get::<hectopascal>());
        self.baro_correction_2_inhg
            .write_to_converted(writer, |value| value.get::<inch_of_mercury>());
        self.corrected_average_static_pressure
            .write_to_converted(writer, |value| value.get::<hectopascal>());
        self.altitude.write_to(writer);
        self.baro_corrected_altitude_1.write_to(writer);
        self.baro_corrected_altitude_2.write_to(writer);
        self.computed_airspeed.write_to(writer);
        self.max_airspeed.write_to(writer);
        self.mach.write_to(writer);
        self.barometric_vertical_speed.write_to(writer);
        self.true_airspeed.write_to(writer);
        self.static_air_temperature.write_to(writer);
        self.total_air_temperature.write_to(writer);
        self.angle_of_attack.write_to(writer);
        self.discrete_word_1.write_to(writer);
        self.fault_warn_discrete.write_to(writer);
    }
}

#[derive(Clone, Copy, Debug)]
enum AlignTime {
    Realistic = 0,
    Instant = 1,
    Fast = 2,
}

try_read_write_enum!(AlignTime);

impl TryFrom<f64> for AlignTime {
    type Error = u8;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        match value as u8 {
            0 => Ok(AlignTime::Realistic),
            1 => Ok(AlignTime::Instant),
            2 => Ok(AlignTime::Fast),
            i => Err(i),
        }
    }
}

bitflags! {
    #[derive(Default)]
    #[cfg_attr(test, derive(Debug, PartialEq))]
    struct IrMaintFlags: u32 {
        const ALIGNMENT_NOT_READY = 0b0000000000000000001;
        const REV_ATT_MODE = 0b0000000000000000010;
        const NAV_MODE = 0b0000000000000000100;
        const VALID_SET_HEADING = 0b0000000000000001000;
        const ATTITUDE_INVALID = 0b0000000000000010000;
        const DC_FAIL = 0b0000000000000100000;
        const ON_DC = 0b0000000000001000000;
        const ADR_FAULT = 0b0000000000010000000;
        const IR_FAULT = 0b0000000000100000000;
        const DC_FAIL_ON_DC = 0b0000000001000000000;
        const ALIGN_FAULT = 0b0000000010000000000;
        const NO_IRS_INITIAL = 0b0000000100000000000;
        const EXCESS_MOTION_ERROR = 0b0000001000000000000;
        const ADR_IR_FAULT = 0b0000010000000000000;
        const EXTREME_LATITUDE = 0b0000100000000000000;
        const ALIGN_7_10_MINUTES = 0b0111000000000000000;
        const ALIGN_6_MINUTES = 0b0110000000000000000;
        const ALIGN_5_MINUTES = 0b0101000000000000000;
        const ALIGN_4_MINUTES = 0b0100000000000000000;
        const ALIGN_3_MINUTES = 0b0011000000000000000;
        const ALIGN_2_MINUTES = 0b0010000000000000000;
        const ALIGN_1_MINUTES = 0b0001000000000000000;
        const COMPUTED_LATITUDE_MISCOMPARE = 0b1000000000000000000;
    }
}

struct InertialReference {
    number: usize,
    is_on: bool,
    /// The remaining time to align, where 0 indicates the IR system is aligned.
    /// None indicates the IR system isn't aligning nor aligned.
    remaining_align_duration: Option<Duration>,
    ir_fault_flash_duration: Option<Duration>,
    remaining_attitude_initialisation_duration: Option<Duration>,
    wind_velocity: LowPassFilter<Vector2<f64>>,
    extreme_latitude: bool,
    body_velocity_filter: LowPassFilter<Vector2<f64>>,
    excess_motion: bool,
    excess_motion_inhibit_time: Option<Duration>,
    quick_realign_remaining_available_time: Duration,
    alignment_failed: bool,
    /// The mode selector position, or OFF without power
    selected_mode: InertialReferenceMode,
    /// The current alignment is a fast one (no ON BAT light at its start)
    fast_alignment: bool,
    /// The inertial reference part fails: no valid output, FAULT light steady
    fault_failure: Failure,
    /// The heading reads wrong, with a valid status
    heading_erroneous_failure: Failure,

    pitch: AdirsArinc429Data<Angle>,
    roll: AdirsArinc429Data<Angle>,
    heading: AdirsArinc429Data<Angle>,
    true_heading: AdirsArinc429Data<Angle>,
    track: AdirsArinc429Data<Angle>,
    true_track: AdirsArinc429Data<Angle>,
    drift_angle: AdirsArinc429Data<Angle>,
    flight_path_angle: AdirsArinc429Data<Angle>,
    body_pitch_rate: AdirsArinc429Data<AngularVelocity>,
    body_roll_rate: AdirsArinc429Data<AngularVelocity>,
    body_yaw_rate: AdirsArinc429Data<AngularVelocity>,
    body_longitudinal_acc: AdirsArinc429Data<Ratio>,
    body_lateral_acc: AdirsArinc429Data<Ratio>,
    body_normal_acc: AdirsArinc429Data<Ratio>,
    heading_rate: AdirsArinc429Data<AngularVelocity>,
    pitch_att_rate: AdirsArinc429Data<AngularVelocity>,
    roll_att_rate: AdirsArinc429Data<AngularVelocity>,
    vertical_speed: AdirsArinc429Data<f64>,
    ground_speed: AdirsArinc429Data<Velocity>,
    /// Label 016, 2 Hz [0, 256)
    wind_speed: AdirsArinc429Data<Velocity>,
    /// label 015, 2 Hz, [0, 359]
    wind_direction: AdirsArinc429Data<Angle>,
    /// Label 316, 10 Hz [0, 256)
    wind_speed_bnr: AdirsArinc429Data<Velocity>,
    /// Label 315, 10 Hz (-180, 180]
    wind_direction_bnr: AdirsArinc429Data<Angle>,
    latitude: AdirsArinc429Data<Angle>,
    longitude: AdirsArinc429Data<Angle>,
    /// label 270
    maint_word: AdirsArinc429Data<u32>,
    align_discrete: AdirsDiscreteOutput<bool>,
    fault_warn_discrete: AdirsDiscreteOutput<bool>,
}
impl InertialReference {
    const EXCESS_MOTION_INHIBIT_TIME: Duration = Duration::from_secs(2);
    const FAST_ALIGNMENT_TIME_IN_SECS: f64 = 90.;
    const IR_FAULT_FLASH_DURATION: Duration = Duration::from_millis(50);
    const ATTITUDE_INITIALISATION_DURATION: Duration = Duration::from_secs(28);
    const ATTITUDE_INITIALISATION_QUICK_DURATION: Duration = Duration::from_secs(2);
    const PITCH: &'static str = "PITCH";
    const ROLL: &'static str = "ROLL";
    const HEADING: &'static str = "HEADING";
    const TRUE_HEADING: &'static str = "TRUE_HEADING";
    const TRACK: &'static str = "TRACK";
    const TRUE_TRACK: &'static str = "TRUE_TRACK";
    const DRIFT_ANGLE: &'static str = "DRIFT_ANGLE";
    const FLIGHT_PATH_ANGLE: &'static str = "FLIGHT_PATH_ANGLE";
    const BODY_PITCH_RATE: &'static str = "BODY_PITCH_RATE";
    const BODY_ROLL_RATE: &'static str = "BODY_ROLL_RATE";
    const BODY_YAW_RATE: &'static str = "BODY_YAW_RATE";
    const BODY_LONGITUDINAL_ACC: &'static str = "BODY_LONGITUDINAL_ACC";
    const BODY_LATERAL_ACC: &'static str = "BODY_LATERAL_ACC";
    const BODY_NORMAL_ACC: &'static str = "BODY_NORMAL_ACC";
    const HEADING_RATE: &'static str = "HEADING_RATE";
    const PITCH_ATT_RATE: &'static str = "PITCH_ATT_RATE";
    const ROLL_ATT_RATE: &'static str = "ROLL_ATT_RATE";
    const VERTICAL_SPEED: &'static str = "VERTICAL_SPEED";
    const GROUND_SPEED: &'static str = "GROUND_SPEED";
    const WIND_DIRECTION: &'static str = "WIND_DIRECTION";
    const WIND_DIRECTION_BNR: &'static str = "WIND_DIRECTION_BNR";
    const WIND_SPEED: &'static str = "WIND_SPEED";
    const WIND_SPEED_BNR: &'static str = "WIND_SPEED_BNR";
    const LATITUDE: &'static str = "LATITUDE";
    const LONGITUDE: &'static str = "LONGITUDE";
    const MAINT_WORD: &'static str = "MAINT_WORD";
    const ALIGN_DISCRETE: &'static str = "ALIGN_DISCRETE";
    const FAULT_WARN_DISCRETE: &'static str = "FAULT_WARN_DISCRETE";
    const MINIMUM_TRUE_AIRSPEED_FOR_WIND_DETERMINATION_KNOTS: f64 = 100.;
    const MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS: f64 = 50.;

    const WIND_VELOCITY_TIME_CONSTANT: Duration = Duration::from_millis(100);
    const QUICK_REALIGN_AVAILABLE_TIME: Duration = Duration::from_secs(5);
    // Fast alignment (mode selector OFF then NAV within 5 s): "A fast alignment takes 30 s"
    // (A320 FCOM DSC-22_20-20-40, A380 FCOM DSC-34-10-30-30 "It takes about 30 s").
    const QUICK_REALIGN_ALIGN_TIME: Duration = Duration::from_secs(30);
    const ALIGNMENT_VELOCITY_TIME_CONSTANT: Duration = Duration::from_millis(500);
    const MAX_ALIGNMENT_VELOCITY_FPS: f64 = 0.011;
    const MAX_LATITUDE_FOR_ALIGNMENT: f64 = 82.;
    /// Heading error of an erroneous IR (design choice: the FCOM gives no failure values; 10 deg is well above the
    /// heading difference that the FWC IR DISAGREE monitoring of the A320 takes as a disagreement)
    const ERRONEOUS_HEADING_ERROR_DEGREES: f64 = 10.;

    fn new(context: &mut InitContext, number: usize) -> Self {
        Self {
            number,
            is_on: true,
            // We start in an aligned state to support starting on the
            // runway or in the air.
            remaining_align_duration: Some(Duration::from_secs(0)),
            ir_fault_flash_duration: None,
            // Start fully initialised.
            remaining_attitude_initialisation_duration: Some(Duration::from_secs(0)),
            wind_velocity: LowPassFilter::new(Self::WIND_VELOCITY_TIME_CONSTANT),
            extreme_latitude: false,
            body_velocity_filter: LowPassFilter::new(Self::ALIGNMENT_VELOCITY_TIME_CONSTANT),
            excess_motion: false,
            excess_motion_inhibit_time: None,
            quick_realign_remaining_available_time: Duration::default(),
            alignment_failed: false,
            selected_mode: InertialReferenceMode::Navigation,
            fast_alignment: false,
            fault_failure: Failure::new(FailureType::IrFault(number)),
            heading_erroneous_failure: Failure::new(FailureType::IrHeadingErroneous(number)),

            pitch: AdirsArinc429Data::new_ir(context, number, Self::PITCH),
            roll: AdirsArinc429Data::new_ir(context, number, Self::ROLL),
            heading: AdirsArinc429Data::new_ir(context, number, Self::HEADING),
            true_heading: AdirsArinc429Data::new_ir(context, number, Self::TRUE_HEADING),
            track: AdirsArinc429Data::new_ir(context, number, Self::TRACK),
            true_track: AdirsArinc429Data::new_ir(context, number, Self::TRUE_TRACK),
            drift_angle: AdirsArinc429Data::new_ir(context, number, Self::DRIFT_ANGLE),
            flight_path_angle: AdirsArinc429Data::new_ir(context, number, Self::FLIGHT_PATH_ANGLE),
            body_pitch_rate: AdirsArinc429Data::new_ir(context, number, Self::BODY_PITCH_RATE),
            body_roll_rate: AdirsArinc429Data::new_ir(context, number, Self::BODY_ROLL_RATE),
            body_yaw_rate: AdirsArinc429Data::new_ir(context, number, Self::BODY_YAW_RATE),
            body_longitudinal_acc: AdirsArinc429Data::new_ir(
                context,
                number,
                Self::BODY_LONGITUDINAL_ACC,
            ),
            body_lateral_acc: AdirsArinc429Data::new_ir(context, number, Self::BODY_LATERAL_ACC),
            body_normal_acc: AdirsArinc429Data::new_ir(context, number, Self::BODY_NORMAL_ACC),
            heading_rate: AdirsArinc429Data::new_ir(context, number, Self::HEADING_RATE),
            pitch_att_rate: AdirsArinc429Data::new_ir(context, number, Self::PITCH_ATT_RATE),
            roll_att_rate: AdirsArinc429Data::new_ir(context, number, Self::ROLL_ATT_RATE),
            vertical_speed: AdirsArinc429Data::new_ir(context, number, Self::VERTICAL_SPEED),
            ground_speed: AdirsArinc429Data::new_ir(context, number, Self::GROUND_SPEED),
            wind_direction: AdirsArinc429Data::new_ir(context, number, Self::WIND_DIRECTION),
            wind_direction_bnr: AdirsArinc429Data::new_ir(
                context,
                number,
                Self::WIND_DIRECTION_BNR,
            ),
            wind_speed: AdirsArinc429Data::new_ir(context, number, Self::WIND_SPEED),
            wind_speed_bnr: AdirsArinc429Data::new_ir(context, number, Self::WIND_SPEED_BNR),
            latitude: AdirsArinc429Data::new_ir(context, number, Self::LATITUDE),
            longitude: AdirsArinc429Data::new_ir(context, number, Self::LONGITUDE),
            maint_word: AdirsArinc429Data::new_ir(context, number, Self::MAINT_WORD),
            align_discrete: AdirsDiscreteOutput::new_ir(context, number, Self::ALIGN_DISCRETE),
            fault_warn_discrete: AdirsDiscreteOutput::new_ir(
                context,
                number,
                Self::FAULT_WARN_DISCRETE,
            ),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        true_airspeed_source: &impl AirDataReferenceBus,
        overhead: &AirDataInertialReferenceSystemOverheadPanel,
        is_powered: bool,
        configured_align_time: AlignTime,
        aircraft_preset_quick_mode: bool,
        simulator_data: AdirsSimulatorData,
    ) {
        // Without power the IR is off, as with the mode selector OFF: it loses its alignment
        self.selected_mode = if is_powered {
            overhead.mode_of(self.number)
        } else {
            InertialReferenceMode::Off
        };
        self.is_on = is_powered && overhead.ir_is_on(self.number);

        self.update_body_velocity(context);

        self.update_fault_flash_duration(context);
        self.update_remaining_attitude_align_duration(context, aircraft_preset_quick_mode);
        self.update_remaining_align_duration(context, configured_align_time, simulator_data);

        self.update_latitude(simulator_data);
        self.update_attitude_values(context, simulator_data);
        self.update_heading_values(simulator_data);
        self.update_non_attitude_values(context, true_airspeed_source, simulator_data);
        if self.has_failed() {
            self.set_all_outputs_failure_warning();
        }
        self.update_maint_word();
        self.update_discrete_outputs();
    }

    /// The IR part has failed (A320 FCOM l.52611-52615: IR FAULT light steady, "the respective IR is lost"). An
    /// unsupplied or switched off ADIRU detects nothing.
    fn has_failed(&self) -> bool {
        self.fault_failure.is_active() && self.selected_mode != InertialReferenceMode::Off
    }

    /// A failed IR gives no valid inertial data
    fn set_all_outputs_failure_warning(&mut self) {
        [
            &mut self.pitch,
            &mut self.roll,
            &mut self.heading,
            &mut self.true_heading,
            &mut self.track,
            &mut self.true_track,
            &mut self.drift_angle,
            &mut self.flight_path_angle,
            &mut self.wind_direction,
            &mut self.wind_direction_bnr,
            &mut self.latitude,
            &mut self.longitude,
        ]
        .into_iter()
        .for_each(|word| word.set_failure_warning());
        [
            &mut self.body_pitch_rate,
            &mut self.body_roll_rate,
            &mut self.body_yaw_rate,
            &mut self.heading_rate,
            &mut self.pitch_att_rate,
            &mut self.roll_att_rate,
        ]
        .into_iter()
        .for_each(|word| word.set_failure_warning());
        [
            &mut self.body_longitudinal_acc,
            &mut self.body_lateral_acc,
            &mut self.body_normal_acc,
        ]
        .into_iter()
        .for_each(|word| word.set_failure_warning());
        [
            &mut self.ground_speed,
            &mut self.wind_speed,
            &mut self.wind_speed_bnr,
        ]
        .into_iter()
        .for_each(|word| word.set_failure_warning());
        self.vertical_speed.set_failure_warning();
    }

    /// The heading this IR gives: the sim heading, offset with an erroneous heading
    fn measured_heading(&self, heading: Angle) -> Angle {
        if self.heading_erroneous_failure.is_active() {
            (heading + Angle::new::<degree>(Self::ERRONEOUS_HEADING_ERROR_DEGREES)).normalised()
        } else {
            heading
        }
    }

    fn update_fault_flash_duration(&mut self, context: &UpdateContext) {
        if self.alignment_starting(self.selected_mode) {
            self.ir_fault_flash_duration = Some(Self::IR_FAULT_FLASH_DURATION);
        } else if let Some(flash_duration) = self.ir_fault_flash_duration {
            let remaining = subtract_delta_from_duration(context, flash_duration);
            self.ir_fault_flash_duration = if remaining > Duration::from_secs(0) {
                Some(remaining)
            } else {
                None
            };
        }
    }

    fn update_remaining_attitude_align_duration(
        &mut self,
        context: &UpdateContext,
        aircraft_preset_quick_mode: bool,
    ) {
        let initialisation_duration: Duration = if aircraft_preset_quick_mode {
            Self::ATTITUDE_INITIALISATION_QUICK_DURATION
        } else {
            Self::ATTITUDE_INITIALISATION_DURATION
        };
        self.remaining_attitude_initialisation_duration = remaining_initialisation_duration(
            context,
            initialisation_duration,
            self.selected_mode,
            self.remaining_attitude_initialisation_duration,
        );
    }

    fn can_align(simulator_data: AdirsSimulatorData) -> bool {
        simulator_data.latitude.abs().get::<degree>() <= Self::MAX_LATITUDE_FOR_ALIGNMENT
    }

    fn is_instant_or_fast_boarding_in_progress(simulator_data: AdirsSimulatorData) -> bool {
        match simulator_data.boarding_rate {
            BoardingRate::Instant | BoardingRate::Fast => {
                simulator_data.is_boarding_started_by_user
            }
            _ => false,
        }
    }

    fn update_remaining_align_duration(
        &mut self,
        context: &UpdateContext,
        configured_align_time: AlignTime,
        simulator_data: AdirsSimulatorData,
    ) {
        // If the knob is moved out of NAV and back within 5 seconds while aligned, a quick re-alignment
        // is performed. This just zeros the velocities etc.
        if self.is_fully_aligned() && self.selected_mode != InertialReferenceMode::Navigation {
            self.quick_realign_remaining_available_time = Self::QUICK_REALIGN_AVAILABLE_TIME;
        } else if !self.quick_realign_remaining_available_time.is_zero() {
            self.quick_realign_remaining_available_time = self
                .quick_realign_remaining_available_time
                .saturating_sub(context.delta());
        }

        // work around instant/fast boarding upsetting the body velocity and interrupting IR alignment
        if InertialReference::is_instant_or_fast_boarding_in_progress(simulator_data) {
            self.excess_motion_inhibit_time = Some(InertialReference::EXCESS_MOTION_INHIBIT_TIME);
        } else if let Some(excess_motion_inhibit_time) = self.excess_motion_inhibit_time {
            self.excess_motion_inhibit_time =
                excess_motion_inhibit_time.checked_sub(context.delta());
        }

        // If the  align time setting has been changed to instant during alignment,
        // then set remaining time to 0. This allows to implement a "Instant Align" button in the EFB
        // for users who want to align the ADIRS instantly but do not want to change the default
        // setting and restart the flight.
        if let AlignTime::Instant = configured_align_time {
            self.remaining_align_duration = Some(Duration::from_secs_f64(0.));
        } else {
            // If we exceeded the max alignment velocity, the alignment is restarted
            if self.is_aligning()
                && self.body_velocity_filter.output().max() > Self::MAX_ALIGNMENT_VELOCITY_FPS
                && self.excess_motion_inhibit_time.is_none()
            {
                self.remaining_align_duration = None;
                self.excess_motion = true;
            }

            self.remaining_align_duration =
                match self.selected_mode {
                    InertialReferenceMode::Navigation => match self.remaining_align_duration {
                        Some(remaining) => {
                            if Self::can_align(simulator_data) {
                                Some(subtract_delta_from_duration(context, remaining))
                            } else {
                                Some(remaining)
                            }
                        }
                        None => Some(self.total_alignment_duration(
                            configured_align_time,
                            simulator_data.latitude,
                        )),
                    },
                    InertialReferenceMode::Off | InertialReferenceMode::Attitude => None,
                };
        }
        if !self.is_aligning() {
            self.fast_alignment = false;
        }

        self.alignment_failed = self.is_aligning() && !Self::can_align(simulator_data);

        if self.is_fully_aligned() || self.selected_mode != InertialReferenceMode::Navigation {
            self.excess_motion = false;
        }
    }

    fn update_latitude(&mut self, simulator_data: AdirsSimulatorData) {
        let latitude = simulator_data.latitude.get::<degree>();
        let longitude = simulator_data.longitude.get::<degree>();

        let hysteresis_sign = if self.extreme_latitude { 1. } else { -1. };

        self.extreme_latitude = !((-60. + hysteresis_sign * 0.5) <= latitude
            && (latitude <= (73. - hysteresis_sign * 0.5)
                || (latitude <= (82. - hysteresis_sign * 0.5)
                    && latitude >= 0.
                    && (longitude <= (-120. - hysteresis_sign * 2.5)
                        || longitude >= (-90. + hysteresis_sign * 2.5)))))
    }

    fn update_attitude_values(
        &mut self,
        context: &UpdateContext,
        simulator_data: AdirsSimulatorData,
    ) {
        let ssm = if self.is_on && self.is_attitude_aligned() {
            SignStatus::NormalOperation
        } else {
            SignStatus::NoComputedData
        };
        // Calculate the attitudes and body rotation rates.
        // Correct the signs so that they conform to standard aeronautical norms.
        let pitch = -simulator_data.pitch;
        let roll = -simulator_data.roll;
        self.pitch.set_value(pitch, ssm);
        self.roll.set_value(roll, ssm);

        let p = -simulator_data.body_rotation_rate_z;
        let q = -simulator_data.body_rotation_rate_x;
        let r = simulator_data.body_rotation_rate_y;
        self.body_roll_rate.set_value(p, ssm);
        self.body_pitch_rate.set_value(q, ssm);
        self.body_yaw_rate.set_value(r, ssm);

        // Calculate attitude rates, by applying the inverse body coordinate transformation matrix.
        self.heading_rate.set_value(
            (r * V::from(roll.cos()) + q * V::from(roll.sin())) / V::from(pitch.cos()),
            ssm,
        );
        self.pitch_att_rate
            .set_value(q * V::from(roll.cos()) - r * V::from(roll.sin()), ssm);
        self.roll_att_rate.set_value(
            p + (q * V::from(roll.sin()) + r * V::from(roll.cos())) * V::from(pitch.tan()),
            ssm,
        );

        // Calculate the body accelerations as measured by the IRS accelerometers.
        // The sim only gives the acceleration vector without gravity, so we have to calculate and add the gravity vector
        // based on Theta and Phi.
        let g = Acceleration::new::<meter_per_second_squared>(9.81);
        self.body_longitudinal_acc
            .set_value(context.long_accel() / g + pitch.sin(), ssm);
        self.body_lateral_acc
            .set_value(context.lat_accel() / g - pitch.cos() * roll.sin(), ssm);
        self.body_normal_acc
            .set_value(context.vert_accel() / g + pitch.cos() * roll.cos(), ssm);
    }

    fn update_heading_values(&mut self, simulator_data: AdirsSimulatorData) {
        // TODO BNR labels (that most things use) are actually +/- 180

        // TODO tests for when should be mag or true in mag labels

        let heading_available = self.is_on
            && (self.is_fully_aligned()
                || (self.selected_mode == InertialReferenceMode::Navigation
                    && self
                        .remaining_align_duration
                        .is_some_and(|duration| duration.as_secs() < 120)));

        let true_heading_ssm = if heading_available {
            SignStatus::NormalOperation
        } else {
            SignStatus::NoComputedData
        };
        self.true_heading.set_value(
            self.measured_heading(simulator_data.true_heading),
            true_heading_ssm,
        );

        // TODO in ATT mode NCD until heading initialised on MCDU
        let magnetic_heading_ssm = if self.is_on
            && (heading_available
                || (self.selected_mode == InertialReferenceMode::Attitude
                    && self.is_attitude_aligned()))
        {
            SignStatus::NormalOperation
        } else {
            SignStatus::NoComputedData
        };
        self.heading.set_value(
            self.measured_heading(if self.has_magnetic_data() {
                simulator_data.heading
            } else {
                simulator_data.true_heading
            }),
            magnetic_heading_ssm,
        );
    }

    fn update_body_velocity(&mut self, context: &UpdateContext) {
        let body_velocity = Vector2::new(
            context
                .local_velocity()
                .lat_velocity()
                .get::<foot_per_second>(),
            context
                .local_velocity()
                .long_velocity()
                .get::<foot_per_second>(),
        );
        self.body_velocity_filter
            .update(context.delta(), body_velocity);
    }

    fn update_wind_velocity(
        &mut self,
        context: &UpdateContext,
        true_airspeed_source: &impl AirDataReferenceBus,
        simulator_data: AdirsSimulatorData,
    ) {
        // In ATT mode these labels are not even transmitted
        // In Align, NCD prior to NAV

        let no_transmission = match self.selected_mode {
            InertialReferenceMode::Navigation => false,
            InertialReferenceMode::Off | InertialReferenceMode::Attitude => true,
        } || !self.is_on;

        // The IR does not compute the wind if the TAS is less than 100 knots or NCD
        let true_airspeed_above_minimum_threshold = true_airspeed_source
            .true_airspeed()
            .is_normal_operation()
            && true_airspeed_source.true_airspeed().value()
                >= Velocity::new::<knot>(Self::MINIMUM_TRUE_AIRSPEED_FOR_WIND_DETERMINATION_KNOTS);

        let ssm = if no_transmission {
            SignStatus::FailureWarning // TODO should be no transmission
        } else if true_airspeed_above_minimum_threshold && self.is_fully_aligned() {
            SignStatus::NormalOperation
        } else {
            SignStatus::NoComputedData
        };

        // if conditions are valid to calculate wind, we do so, otherwise we send zero
        let mut wind_direction: f64 = 0.;
        let mut wind_speed: f64 = 0.;

        if true_airspeed_above_minimum_threshold && !no_transmission && self.is_fully_aligned() {
            // should be label 324 from IR
            let pitch_angle = simulator_data.pitch;

            // should be tas label xx from ADR, hdg label 314 from IR, pitch angle label 324 from IR
            let tas_vector = Vector2::new(
                simulator_data.true_airspeed.get::<knot>()
                    * simulator_data.true_heading.sin().get::<ratio>(),
                simulator_data.true_airspeed.get::<knot>()
                    * simulator_data.true_heading.cos().get::<ratio>(),
            ) * pitch_angle.cos().get::<ratio>();

            // should be label 367/366 from ADR
            let gs_vector = Vector2::new(
                simulator_data.ground_speed.get::<knot>()
                    * simulator_data.true_track.sin().get::<ratio>(),
                simulator_data.ground_speed.get::<knot>()
                    * simulator_data.true_track.cos().get::<ratio>(),
            );

            self.wind_velocity
                .update(context.delta(), gs_vector - tas_vector);

            wind_speed = self
                .wind_velocity
                .output()
                .magnitude()
                .clamp(0., 255.)
                .round();

            let direction =
                Rotation2::rotation_between(&self.wind_velocity.output(), &Vector2::y());
            wind_direction = (Angle::new::<radian>(direction.angle()).normalised()
                + Angle::HALF_TURN)
                .normalised()
                .get::<degree>();
        } else {
            self.wind_velocity.reset(Vector2::default());
        }

        // set all the labels...
        // TODO build out bus implementation for correct period, bnr/bcd encoding and no transmission state
        self.wind_direction
            .set_value(Angle::new::<degree>(wind_direction.round()), ssm);

        self.wind_direction_bnr.set_value(
            Angle::new::<degree>(
                (if wind_direction > 180. {
                    wind_direction - 360.
                } else {
                    wind_direction
                } / 0.05)
                    .round()
                    * 0.05,
            ),
            ssm,
        );

        self.wind_speed
            .set_value(Velocity::new::<knot>(wind_speed), ssm);

        self.wind_speed_bnr
            .set_value(Velocity::new::<knot>(wind_speed), ssm);
    }

    fn update_non_attitude_values(
        &mut self,
        context: &UpdateContext,
        true_airspeed_source: &impl AirDataReferenceBus,
        simulator_data: AdirsSimulatorData,
    ) {
        let ssm = if self.is_on && self.is_fully_aligned() {
            SignStatus::NormalOperation
        } else {
            SignStatus::NoComputedData
        };

        let ground_speed_above_minimum_threshold = simulator_data.ground_speed
            >= Velocity::new::<knot>(Self::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS);

        let track = if self.has_magnetic_data() {
            simulator_data.track
        } else {
            simulator_data.true_track
        };

        let heading = self.measured_heading(if self.has_magnetic_data() {
            simulator_data.heading
        } else {
            simulator_data.true_heading
        });

        self.track.set_value(
            if ground_speed_above_minimum_threshold {
                track
            } else {
                heading
            },
            ssm,
        );

        if ground_speed_above_minimum_threshold {
            self.true_track.set_value(simulator_data.true_track, ssm);
        } else {
            self.true_track.set_from(&self.true_heading);
        }

        self.drift_angle.set_value(
            if ground_speed_above_minimum_threshold {
                let diff = simulator_data.track - simulator_data.heading;
                if diff > Angle::new::<degree>(180.) {
                    diff - Angle::new::<degree>(360.)
                } else if diff < Angle::new::<degree>(-180.) {
                    diff + Angle::new::<degree>(360.)
                } else {
                    diff
                }
            } else {
                Angle::new::<degree>(0.)
            },
            ssm,
        );
        self.flight_path_angle.set_value(
            if ground_speed_above_minimum_threshold {
                simulator_data
                    .vertical_speed
                    .atan2(simulator_data.ground_speed)
            } else {
                Angle::new::<degree>(0.)
            },
            ssm,
        );

        self.vertical_speed
            .set_value(simulator_data.vertical_speed.get::<foot_per_minute>(), ssm);
        self.ground_speed
            .set_value(simulator_data.ground_speed, ssm);

        self.latitude.set_value(simulator_data.latitude, ssm);
        self.longitude.set_value(simulator_data.longitude, ssm);

        self.update_wind_velocity(context, true_airspeed_source, simulator_data);
    }

    fn update_maint_word(&mut self) {
        // TODO check status of these during mode transitions (first need to implement mode FSM)
        let mut maint_word: IrMaintFlags = IrMaintFlags::default();

        if !self.is_on {
            // FIXME should be no transmission (can we just do this at a higher level...)
            self.maint_word
                .set_value(maint_word.bits(), SignStatus::FailureWarning);
            return;
        }

        if self.is_aligning() {
            maint_word |= IrMaintFlags::ALIGNMENT_NOT_READY;
        }

        if self.selected_mode == InertialReferenceMode::Attitude {
            maint_word |= IrMaintFlags::REV_ATT_MODE;
        }

        if self.selected_mode == InertialReferenceMode::Navigation {
            maint_word |= IrMaintFlags::NAV_MODE;
        }

        // TODO request heading setting in att mode if not set

        // TODO attitude invalid fault

        // TODO dc < 18 V

        // TODO on DC (re-implement ON BAT light properly at the same time)

        // TODO ADR input data fault

        // TODO unimportant nav fault

        // TODO DC fault during DC operation last power up

        if self.has_failed() {
            maint_word |= IrMaintFlags::IR_FAULT;
        }

        if self.alignment_failed {
            maint_word |= IrMaintFlags::ALIGN_FAULT;
        }

        // TODO No IRS initial pos

        if self.excess_motion {
            maint_word |= IrMaintFlags::EXCESS_MOTION_ERROR;
        }

        // TODO ADR data not received or parity error

        if self.extreme_latitude {
            maint_word |= IrMaintFlags::EXTREME_LATITUDE;
        }

        maint_word |= match self
            .remaining_align_duration()
            .map(|duration| duration.as_secs())
        {
            Some(1..=60) => IrMaintFlags::ALIGN_1_MINUTES,
            Some(61..=120) => IrMaintFlags::ALIGN_2_MINUTES,
            Some(121..=180) => IrMaintFlags::ALIGN_3_MINUTES,
            Some(181..=240) => IrMaintFlags::ALIGN_4_MINUTES,
            Some(241..=300) => IrMaintFlags::ALIGN_5_MINUTES,
            Some(301..=360) => IrMaintFlags::ALIGN_6_MINUTES,
            Some(361..) => IrMaintFlags::ALIGN_7_10_MINUTES,
            Some(0) | None => IrMaintFlags::default(),
        };

        // TODO sin/cos test discrepancy

        self.maint_word
            .set_value(maint_word.bits(), SignStatus::NormalOperation);

        // TODO tests!
    }

    fn update_discrete_outputs(&mut self) {
        self.align_discrete.set_value(self.is_aligning());
        self.fault_warn_discrete.set_value(self.has_fault());
    }

    fn alignment_starting(&self, selected_mode: InertialReferenceMode) -> bool {
        selected_mode != InertialReferenceMode::Off
            && self.remaining_attitude_initialisation_duration.is_none()
    }

    fn total_alignment_duration_from_configuration(
        configured_align_time: AlignTime,
        latitude: Angle,
    ) -> Duration {
        let abs_lat = latitude.get::<degree>().abs();
        Duration::from_secs_f64(match configured_align_time {
            AlignTime::Realistic => {
                if abs_lat > 73. {
                    1020.
                } else if abs_lat > 60. {
                    600.
                } else {
                    (300. / latitude.get::<radian>().cos()).abs()
                }
            }
            AlignTime::Instant => 0.,
            AlignTime::Fast => Self::FAST_ALIGNMENT_TIME_IN_SECS,
        })
    }

    fn total_alignment_duration(
        &mut self,
        configured_align_time: AlignTime,
        latitude: Angle,
    ) -> Duration {
        let mut alignment_duration =
            Self::total_alignment_duration_from_configuration(configured_align_time, latitude);

        if !self.quick_realign_remaining_available_time.is_zero() {
            self.quick_realign_remaining_available_time = Duration::default();
            alignment_duration = Self::QUICK_REALIGN_ALIGN_TIME.min(alignment_duration);
            self.fast_alignment = true;
        }

        alignment_duration
    }

    /// A fast alignment (mode selector OFF then NAV within 5 s) is in progress
    fn is_fast_aligning(&self) -> bool {
        self.fast_alignment
    }

    fn is_fully_aligned(&self) -> bool {
        self.remaining_align_duration == Some(Duration::ZERO)
    }

    fn is_aligning(&self) -> bool {
        match self.remaining_align_duration.as_ref() {
            Some(remaining) => *remaining > Duration::from_secs(0),
            None => false,
        }
    }

    fn remaining_align_duration(&self) -> Option<Duration> {
        self.remaining_align_duration
    }

    fn is_attitude_aligned(&self) -> bool {
        self.remaining_attitude_initialisation_duration == Some(Duration::from_secs(0))
    }

    /// The IR FAULT light and discrete: the short flash at the start of an alignment, or steady when the IR has failed
    fn has_fault(&self) -> bool {
        self.ir_fault_flash_duration.is_some() || self.has_failed()
    }

    fn has_magnetic_data(&self) -> bool {
        !self.extreme_latitude
    }

    fn latitude(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.latitude.value(), self.latitude.ssm())
    }

    fn longitude(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.longitude.value(), self.longitude.ssm())
    }

    fn heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.heading.value(), self.heading.ssm())
    }

    fn vertical_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(
            Velocity::new::<foot_per_minute>(self.vertical_speed.value()),
            self.vertical_speed.ssm(),
        )
    }
}
impl InertialReferenceBus for InertialReference {
    fn pitch_angular_acc(&self) -> Arinc429Word<AngularAcceleration> {
        Arinc429Word::new(AngularAcceleration::ZERO, SignStatus::NoComputedData)
    }

    fn roll_angular_acc(&self) -> Arinc429Word<AngularAcceleration> {
        Arinc429Word::new(AngularAcceleration::ZERO, SignStatus::NoComputedData)
    }

    fn yaw_angular_acc(&self) -> Arinc429Word<AngularAcceleration> {
        Arinc429Word::new(AngularAcceleration::ZERO, SignStatus::NoComputedData)
    }

    fn ppos_latitude(&self) -> Arinc429Word<Angle> {
        self.latitude()
    }

    fn ppos_longitude(&self) -> Arinc429Word<Angle> {
        self.longitude()
    }

    fn ground_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.ground_speed.value(), self.ground_speed.ssm())
    }

    fn true_heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.true_heading.value(), self.true_heading.ssm())
    }

    fn true_track(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.true_track.value(), self.true_track.ssm())
    }

    fn wind_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.wind_speed_bnr.value(), self.wind_speed_bnr.ssm())
    }

    fn wind_dir_true(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(
            self.wind_direction_bnr.value(),
            self.wind_direction_bnr.ssm(),
        )
    }

    fn magnetic_track(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.track.value(), self.track.ssm())
    }

    fn magnetic_heading(&self) -> Arinc429Word<Angle> {
        self.heading()
    }

    fn drift_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.drift_angle.value(), self.drift_angle.ssm())
    }

    fn flight_path_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.flight_path_angle.value(), self.flight_path_angle.ssm())
    }

    fn flight_path_accel(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(Ratio::ZERO, SignStatus::NoComputedData)
    }

    fn pitch_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.pitch.value(), self.pitch.ssm())
    }

    fn roll_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.roll.value(), self.roll.ssm())
    }

    fn body_pitch_rate(&self) -> Arinc429Word<AngularVelocity> {
        Arinc429Word::new(self.body_pitch_rate.value(), self.body_pitch_rate.ssm())
    }

    fn body_roll_rate(&self) -> Arinc429Word<AngularVelocity> {
        Arinc429Word::new(self.body_roll_rate.value(), self.body_roll_rate.ssm())
    }

    fn body_yaw_rate(&self) -> Arinc429Word<AngularVelocity> {
        Arinc429Word::new(self.body_yaw_rate.value(), self.body_yaw_rate.ssm())
    }

    fn body_long_acc(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.body_longitudinal_acc.value(),
            self.body_longitudinal_acc.ssm(),
        )
    }

    fn body_lat_acc(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(self.body_lateral_acc.value(), self.body_lateral_acc.ssm())
    }

    fn body_normal_acc(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(self.body_normal_acc.value(), self.body_normal_acc.ssm())
    }

    fn inertial_altitude(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(Length::ZERO, SignStatus::NoComputedData)
    }

    fn inertial_vertical_speed(&self) -> Arinc429Word<Velocity> {
        self.vertical_speed()
    }

    fn discrete_word_1(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(self.maint_word.value(), self.maint_word.ssm())
    }

    fn discrete_word_2(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0, SignStatus::NoComputedData)
    }
    fn discrete_word_3(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0, SignStatus::NoComputedData)
    }
}
impl SimulationElement for InertialReference {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fault_failure.accept(visitor);
        self.heading_erroneous_failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        self.pitch.write_to(writer);
        self.roll.write_to(writer);

        self.heading.write_to(writer);
        self.true_heading.write_to(writer);
        self.track.write_to(writer);
        self.true_track.write_to(writer);
        self.drift_angle.write_to(writer);
        self.flight_path_angle.write_to(writer);
        self.body_pitch_rate
            .write_to_converted(writer, |value| value.get::<degree_per_second>());
        self.body_roll_rate
            .write_to_converted(writer, |value| value.get::<degree_per_second>());
        self.body_yaw_rate
            .write_to_converted(writer, |value| value.get::<degree_per_second>());
        self.body_longitudinal_acc
            .write_to_converted(writer, |value| value.get::<ratio>());
        self.body_lateral_acc
            .write_to_converted(writer, |value| value.get::<ratio>());
        self.body_normal_acc
            .write_to_converted(writer, |value| value.get::<ratio>());
        self.heading_rate
            .write_to_converted(writer, |value| value.get::<degree_per_second>());
        self.pitch_att_rate
            .write_to_converted(writer, |value| value.get::<degree_per_second>());
        self.roll_att_rate
            .write_to_converted(writer, |value| value.get::<degree_per_second>());
        self.vertical_speed.write_to(writer);
        self.ground_speed.write_to(writer);
        self.wind_direction.write_to(writer);
        self.wind_direction_bnr.write_to(writer);
        self.wind_speed.write_to(writer);
        self.wind_speed_bnr.write_to(writer);
        self.latitude.write_to(writer);
        self.longitude.write_to(writer);
        self.maint_word.write_to(writer);
        self.align_discrete.write_to(writer);
        self.fault_warn_discrete.write_to(writer);
    }
}

fn remaining_initialisation_duration(
    context: &UpdateContext,
    starting_initialisation_duration: Duration,
    mode: InertialReferenceMode,
    remaining: Option<Duration>,
) -> Option<Duration> {
    match mode {
        InertialReferenceMode::Navigation | InertialReferenceMode::Attitude => match remaining {
            Some(remaining) => Some(subtract_delta_from_duration(context, remaining)),
            None => Some(starting_initialisation_duration),
        },
        InertialReferenceMode::Off => None,
    }
}

fn subtract_delta_from_duration(context: &UpdateContext, duration: Duration) -> Duration {
    Duration::from_secs_f64((duration.as_secs_f64() - context.delta_as_secs_f64()).max(0.))
}

trait NormaliseAngleExt {
    fn normalised(self) -> Angle;
    #[allow(dead_code)]
    fn normalised_180(self) -> Angle;
}

impl NormaliseAngleExt for Angle {
    /// Create a new angle by normalizing the value into the range of
    /// [0, 2π) rad.
    #[inline]
    fn normalised(self) -> Angle {
        if self < Angle::FULL_TURN && self >= Angle::default() {
            self
        } else {
            let v = self % Angle::FULL_TURN;

            if v >= Angle::default() {
                v
            } else {
                v + Angle::FULL_TURN
            }
        }
    }

    /// Create a new angle by normalizing the value into the range of
    /// [-π, π) rad.
    #[inline]
    fn normalised_180(self) -> Angle {
        if self < Angle::HALF_TURN && self >= -Angle::HALF_TURN {
            self
        } else {
            let v = self % Angle::FULL_TURN;

            if v < Angle::HALF_TURN {
                v
            } else {
                v - Angle::FULL_TURN
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::electrical::test::TestElectricitySource;
    use crate::electrical::{ElectricalBus, Electricity};
    use crate::shared::PotentialOrigin;
    use crate::simulation::test::{ReadByName, WriteByName};
    use crate::{
        shared::arinc429::Arinc429Word,
        simulation::{
            test::{SimulationTestBed, TestBed},
            Aircraft, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        },
    };
    use ntest::{assert_about_eq, timeout};
    use rstest::rstest;
    use std::time::Duration;
    use uom::si::{
        angle::degree,
        angular_velocity::radian_per_second,
        electric_potential::volt,
        length::foot,
        ratio::percent,
        thermodynamic_temperature::degree_celsius,
        velocity::{foot_per_minute, knot},
    };

    /// The buses of the test aircraft: ADIRU 1 and 2 are supplied as on the A320 (IR backup on a battery bus, limited
    /// in time for ADIRU 2), ADIRU 3 as on the A380 (the ADR also needs a DC bus, which is the IR backup).
    const TEST_BUSES: [ElectricalBusType; 6] = [
        ElectricalBusType::AlternatingCurrentEssential,
        ElectricalBusType::AlternatingCurrent(1),
        ElectricalBusType::AlternatingCurrent(2),
        ElectricalBusType::DirectCurrent(1),
        ElectricalBusType::DirectCurrentHot(1),
        ElectricalBusType::DirectCurrentHot(2),
    ];
    const TEST_IR_2_BACKUP_TIME_LIMIT: Duration = Duration::from_secs(5 * 60);

    struct TestAircraft {
        electricity_source: TestElectricitySource,
        buses: [ElectricalBus; 6],
        bus_powered: [bool; 6],
        adirs: AirDataInertialReferenceSystem,
        overhead: AirDataInertialReferenceSystemOverheadPanel,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            let electrical_supplies = [
                AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrentEssential)
                    .with_ir_backup(InertialReferenceBackupSupply::new(
                        ElectricalBusType::DirectCurrentHot(1),
                        true,
                        None,
                    )),
                AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrent(2))
                    .with_ir_backup(InertialReferenceBackupSupply::new(
                        ElectricalBusType::DirectCurrentHot(2),
                        true,
                        Some(TEST_IR_2_BACKUP_TIME_LIMIT),
                    )),
                AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrent(1))
                    .with_adr_second_bus(ElectricalBusType::DirectCurrent(1))
                    .with_ir_backup(InertialReferenceBackupSupply::new(
                        ElectricalBusType::DirectCurrent(1),
                        false,
                        None,
                    )),
            ];
            let adirs_programming = AirDataInertialReferenceUnitProgramming::new(
                Velocity::new::<knot>(340.),
                MachNumber(0.82),
                [
                    LowSpeedWarningThreshold::new(
                        Velocity::new::<knot>(100.),
                        Velocity::new::<knot>(104.),
                    ),
                    LowSpeedWarningThreshold::new(
                        Velocity::new::<knot>(50.),
                        Velocity::new::<knot>(54.),
                    ),
                    LowSpeedWarningThreshold::new(
                        Velocity::new::<knot>(155.),
                        Velocity::new::<knot>(159.),
                    ),
                    LowSpeedWarningThreshold::new(
                        Velocity::new::<knot>(260.),
                        Velocity::new::<knot>(264.),
                    ),
                ],
                electrical_supplies,
            );
            Self {
                electricity_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: TEST_BUSES.map(|bus| ElectricalBus::new(context, bus)),
                bus_powered: [true; 6],
                adirs: AirDataInertialReferenceSystem::new(context, adirs_programming),
                overhead: AirDataInertialReferenceSystemOverheadPanel::new(context),
            }
        }

        fn set_bus_powered(&mut self, bus: ElectricalBusType, powered: bool) {
            let index = TEST_BUSES
                .iter()
                .position(|test_bus| *test_bus == bus)
                .unwrap();
            self.bus_powered[index] = powered;
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.electricity_source
                .power_with_potential(ElectricPotential::new::<volt>(115.));
            electricity.supplied_by(&self.electricity_source);

            for (bus, powered) in self.buses.iter().zip(self.bus_powered) {
                if powered {
                    electricity.flow(&self.electricity_source, bus);
                }
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.adirs.update(context, &self.overhead);
            self.overhead.update(context, &self.adirs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.adirs.accept(visitor);
            self.overhead.accept(visitor);

            visitor.visit(self);
        }

        fn read(&mut self, _reader: &mut SimulatorReader) {}

        fn write(&self, _writer: &mut SimulatorWriter) {}
    }

    struct AdirsTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl AdirsTestBed {
        fn new() -> Self {
            let mut adirs_test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            adirs_test_bed.move_all_mode_selectors_to(InertialReferenceMode::Navigation);
            adirs_test_bed.altimeter_setting_of(Pressure::new::<hectopascal>(1013.25))
        }

        fn and(self) -> Self {
            self
        }

        fn then_continue_with(self) -> Self {
            self
        }

        fn latitude_of(mut self, latitude: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::LATITUDE, latitude);
            self
        }

        fn longitude_of(mut self, longitude: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::LONGITUDE, longitude);
            self
        }

        fn mach_of(mut self, mach: MachNumber) -> Self {
            self.write_by_name(AdirsSimulatorData::MACH, mach);
            self
        }

        fn inertial_vertical_speed_of(mut self, velocity: Velocity) -> Self {
            self.write_by_name(
                AdirsSimulatorData::INERTIAL_VERTICAL_SPEED,
                velocity.get::<foot_per_minute>(),
            );
            self
        }

        fn true_airspeed_of(mut self, velocity: Velocity) -> Self {
            self.write_by_name(AdirsSimulatorData::TRUE_AIRSPEED, velocity);
            self
        }

        fn total_air_temperature_of(mut self, temperature: ThermodynamicTemperature) -> Self {
            self.write_by_name(AdirsSimulatorData::TOTAL_AIR_TEMPERATURE, temperature);
            self
        }

        fn angle_of_attack_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::ANGLE_OF_ATTACK, angle);
            self
        }

        fn pitch_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::PITCH, angle);
            self
        }

        fn roll_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::ROLL, angle);
            self
        }

        fn body_roll_rate_of(mut self, rate: AngularVelocity) -> Self {
            self.write_by_name(AdirsSimulatorData::BODY_ROTATION_RATE_Z, rate);
            self
        }

        fn body_pitch_rate_of(mut self, rate: AngularVelocity) -> Self {
            self.write_by_name(AdirsSimulatorData::BODY_ROTATION_RATE_X, rate);
            self
        }

        fn body_yaw_rate_of(mut self, rate: AngularVelocity) -> Self {
            self.write_by_name(AdirsSimulatorData::BODY_ROTATION_RATE_Y, rate);
            self
        }

        fn body_lateral_velocity_of(mut self, velocity: Velocity) -> Self {
            self.write_by_name(UpdateContext::LOCAL_LATERAL_SPEED_KEY, velocity);
            self
        }

        fn heading_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::HEADING, angle);
            self
        }

        fn true_heading_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::TRUE_HEADING, angle);
            self
        }

        fn track_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::TRACK, angle);
            self
        }

        fn true_track_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::TRUE_TRACK, angle);
            self
        }

        fn ground_speed_of(mut self, velocity: Velocity) -> Self {
            self.write_by_name(AdirsSimulatorData::GROUND_SPEED, velocity);
            self
        }

        /// caution: sets tas, true heading, gs, true track, and pitch angle
        fn wind_of(self, angle: Angle, velocity: Velocity) -> Self {
            let tas = Velocity::new::<knot>(
                InertialReference::MINIMUM_TRUE_AIRSPEED_FOR_WIND_DETERMINATION_KNOTS + 10.,
            );
            let heading = Angle::new::<degree>(0.);

            let gs = Velocity::new::<knot>(
                ((velocity.get::<knot>() * (angle + Angle::HALF_TURN).sin().get::<ratio>())
                    .powi(2)
                    + (tas.get::<knot>()
                        + velocity.get::<knot>()
                            * (angle + Angle::HALF_TURN).cos().get::<ratio>())
                    .powi(2))
                .sqrt(),
            );
            let track = (tas / gs).acos();

            self.true_airspeed_of(tas)
                .true_heading_of(heading)
                .ground_speed_of(gs)
                .true_track_of(track)
                .pitch_angle_of(Angle::default())
        }

        fn pitch_angle_of(mut self, angle: Angle) -> Self {
            self.write_by_name(AdirsSimulatorData::PITCH, angle);
            self
        }

        fn altimeter_setting_of(mut self, altimeter: Pressure) -> Self {
            self.write_arinc429_by_name(
                AdirsSimulatorData::BARO_CORRECTION_1_HPA,
                altimeter.get::<hectopascal>(),
                SignStatus::NormalOperation,
            );
            self.write_arinc429_by_name(
                AdirsSimulatorData::BARO_CORRECTION_2_HPA,
                altimeter.get::<hectopascal>(),
                SignStatus::NormalOperation,
            );
            self
        }

        fn align_time_configured_as(mut self, align_time: AlignTime) -> Self {
            WriteByName::<AdirsTestBed, f64>::write_by_name(
                &mut self,
                AirDataInertialReferenceSystem::CONFIGURED_ALIGN_TIME_KEY,
                align_time.into(),
            );
            self
        }

        fn ir_mode_selector_set_to(mut self, number: usize, mode: InertialReferenceMode) -> Self {
            WriteByName::<AdirsTestBed, f64>::write_by_name(
                &mut self,
                &InertialReferenceModeSelector::mode_id(number),
                mode.into(),
            );
            self
        }

        fn adr_push_button_off(mut self, number: usize) -> Self {
            self.write_by_name(
                &OnOffFaultPushButton::is_on_id(&format!("ADIRS_ADR_{}", number)),
                false,
            );

            self
        }

        fn ir_push_button_off(mut self, number: usize) -> Self {
            self.write_by_name(
                &OnOffFaultPushButton::is_on_id(&format!("ADIRS_IR_{}", number)),
                false,
            );

            self
        }

        fn boarding_rate_of(mut self, rate: BoardingRate) -> Self {
            self.write_by_name(AdirsSimulatorData::BOARDING_RATE, rate);

            self
        }

        fn boarding_started_of(mut self, started: bool) -> Self {
            self.write_by_name(AdirsSimulatorData::BOARDING_STARTED_BY_USR, started);

            self
        }

        fn ir_fault_light_illuminated(&mut self, number: usize) -> bool {
            self.read_by_name(&OnOffFaultPushButton::has_fault_id(&format!(
                "ADIRS_IR_{}",
                number
            )))
        }

        fn adr_fault_light_illuminated(&mut self, number: usize) -> bool {
            self.read_by_name(&OnOffFaultPushButton::has_fault_id(&format!(
                "ADIRS_ADR_{}",
                number
            )))
        }

        fn adr_fault_discrete(&mut self, number: usize) -> bool {
            self.read_by_name(&output_data_id(
                OutputDataType::Adr,
                number,
                AirDataReference::FAULT_WARN_DISCRETE,
            ))
        }

        fn ir_fault_discrete(&mut self, number: usize) -> bool {
            self.read_by_name(&output_data_id(
                OutputDataType::Ir,
                number,
                InertialReference::FAULT_WARN_DISCRETE,
            ))
        }

        fn external_horn_sounds(&mut self) -> bool {
            self.read_by_name(AirDataInertialReferenceSystemOverheadPanel::EXTERNAL_HORN_NAME)
        }

        /// Runs past the power settling time of the start of the simulation, all buses powered
        fn after_the_power_settling_time(mut self) -> Self {
            self.run_with_delta(AirDataInertialReferenceSystem::POWER_SETTLING_TIME);
            self
        }

        fn bus_powered(mut self, bus: ElectricalBusType, powered: bool) -> Self {
            self.command(|a| a.set_bus_powered(bus, powered));
            self
        }

        fn on_ground(mut self, on_ground: bool) -> Self {
            self.set_on_ground(on_ground);
            self
        }

        fn is_aligned(&mut self, adiru_number: usize) -> bool {
            self.align_state(adiru_number) == AlignState::Aligned
        }

        fn is_aligning(&mut self, adiru_number: usize) -> bool {
            self.align_state(adiru_number) == AlignState::Aligning
        }

        fn align_state(&mut self, adiru_number: usize) -> AlignState {
            let state: Result<AlignState, _> =
                self.read_by_name(&AirDataInertialReferenceUnit::state_id(adiru_number));
            state.unwrap_or(AlignState::Off)
        }

        fn remaining_alignment_time(&mut self) -> Duration {
            self.read_by_name(AirDataInertialReferenceSystem::REMAINING_ALIGNMENT_TIME_KEY)
        }

        fn all_mode_selectors_off(mut self) -> Self {
            self.move_all_mode_selectors_to(InertialReferenceMode::Off);
            self.run_without_delta();
            self
        }

        fn move_all_mode_selectors_to(&mut self, mode: InertialReferenceMode) {
            for number in 1..=3 {
                self.write_by_name(&InertialReferenceModeSelector::mode_id(number), mode);
            }
        }

        fn on_bat_light_illuminated(&mut self) -> bool {
            self.read_by_name(&IndicationLight::is_illuminated_id(
                AirDataInertialReferenceSystemOverheadPanel::ADIRS_ON_BAT_NAME,
            ))
        }

        fn corrected_average_static_pressure(&mut self, adiru_number: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::CORRECTED_AVERAGE_STATIC_PRESSURE,
            ))
        }

        fn baro_correction_1_hpa(&mut self, adiru_number: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BARO_CORRECTION_1_HPA,
            ))
        }

        fn baro_correction_1_inhg(&mut self, adiru_number: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BARO_CORRECTION_1_INHG,
            ))
        }

        fn baro_correction_2_hpa(&mut self, adiru_number: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BARO_CORRECTION_2_HPA,
            ))
        }

        fn baro_correction_2_inhg(&mut self, adiru_number: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BARO_CORRECTION_2_INHG,
            ))
        }

        /// pressure altitude
        fn altitude(&mut self, adiru_number: usize) -> Arinc429Word<Length> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::ALTITUDE,
            ))
        }

        /// baro corrected altitude for captain's side
        fn baro_corrected_altitude_1(&mut self, adiru_number: usize) -> Arinc429Word<Length> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BARO_CORRECTED_ALTITUDE_1,
            ))
        }

        /// baro corrected altitude for fo's side
        fn baro_corrected_altitude_2(&mut self, adiru_number: usize) -> Arinc429Word<Length> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BARO_CORRECTED_ALTITUDE_2,
            ))
        }

        fn computed_airspeed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::COMPUTED_AIRSPEED,
            ))
        }

        fn max_airspeed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::MAX_AIRSPEED,
            ))
        }

        fn mach(&mut self, adiru_number: usize) -> Arinc429Word<MachNumber> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::MACH,
            ))
        }

        fn barometric_vertical_speed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            let vertical_speed: Arinc429Word<f64> = self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::BAROMETRIC_VERTICAL_SPEED,
            ));
            Arinc429Word::new(
                Velocity::new::<foot_per_minute>(vertical_speed.value()),
                vertical_speed.ssm(),
            )
        }

        fn true_airspeed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::TRUE_AIRSPEED,
            ))
        }

        fn static_air_temperature(
            &mut self,
            adiru_number: usize,
        ) -> Arinc429Word<ThermodynamicTemperature> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::STATIC_AIR_TEMPERATURE,
            ))
        }

        fn total_air_temperature(
            &mut self,
            adiru_number: usize,
        ) -> Arinc429Word<ThermodynamicTemperature> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::TOTAL_AIR_TEMPERATURE,
            ))
        }

        fn angle_of_attack(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::ANGLE_OF_ATTACK,
            ))
        }

        fn adr_discrete_word_1(&mut self, adiru_number: usize) -> Arinc429Word<u32> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Adr,
                adiru_number,
                AirDataReference::DISCRETE_WORD_1,
            ))
        }

        fn pitch(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::PITCH,
            ))
        }

        fn roll(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::ROLL,
            ))
        }

        fn heading(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::HEADING,
            ))
        }

        fn true_heading(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::TRUE_HEADING,
            ))
        }

        fn track(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::TRACK,
            ))
        }

        fn true_track(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::TRUE_TRACK,
            ))
        }

        fn drift_angle(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::DRIFT_ANGLE,
            ))
        }

        fn flight_path_angle(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::FLIGHT_PATH_ANGLE,
            ))
        }

        fn body_pitch_rate(&mut self, adiru_number: usize) -> Arinc429Word<AngularVelocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::BODY_PITCH_RATE,
            ))
        }

        fn body_roll_rate(&mut self, adiru_number: usize) -> Arinc429Word<AngularVelocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::BODY_ROLL_RATE,
            ))
        }

        fn body_yaw_rate(&mut self, adiru_number: usize) -> Arinc429Word<AngularVelocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::BODY_YAW_RATE,
            ))
        }

        fn body_long_acc(&mut self, adiru_number: usize) -> Arinc429Word<Ratio> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::BODY_LONGITUDINAL_ACC,
            ))
        }

        fn body_lat_acc(&mut self, adiru_number: usize) -> Arinc429Word<Ratio> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::BODY_LATERAL_ACC,
            ))
        }

        fn body_normal_acc(&mut self, adiru_number: usize) -> Arinc429Word<Ratio> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::BODY_NORMAL_ACC,
            ))
        }

        fn pitch_att_rate(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::PITCH_ATT_RATE,
            ))
        }

        fn roll_att_rate(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::ROLL_ATT_RATE,
            ))
        }

        fn heading_rate(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::HEADING_RATE,
            ))
        }

        fn ground_speed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::GROUND_SPEED,
            ))
        }

        fn wind_direction(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::WIND_DIRECTION,
            ))
        }

        fn wind_direction_bnr(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::WIND_DIRECTION_BNR,
            ))
        }

        fn wind_speed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::WIND_SPEED,
            ))
        }

        fn wind_speed_bnr(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::WIND_SPEED_BNR,
            ))
        }

        fn inertial_vertical_speed(&mut self, adiru_number: usize) -> Arinc429Word<Velocity> {
            let vertical_speed: Arinc429Word<f64> = self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::VERTICAL_SPEED,
            ));
            Arinc429Word::new(
                Velocity::new::<foot_per_minute>(vertical_speed.value()),
                vertical_speed.ssm(),
            )
        }

        fn longitude(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::LONGITUDE,
            ))
        }

        fn latitude(&mut self, adiru_number: usize) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::LATITUDE,
            ))
        }

        fn maint_word(&mut self, adiru_number: usize) -> Arinc429Word<u32> {
            self.read_arinc429_by_name(&output_data_id(
                OutputDataType::Ir,
                adiru_number,
                InertialReference::MAINT_WORD,
            ))
        }

        fn assert_adr_data_valid(&mut self, valid: bool, adiru_number: usize) {
            assert_eq!(
                !self
                    .corrected_average_static_pressure(adiru_number)
                    .is_failure_warning(),
                valid
            );
            assert_eq!(!self.altitude(adiru_number).is_failure_warning(), valid);
            assert_eq!(
                !self
                    .baro_corrected_altitude_1(adiru_number)
                    .is_failure_warning(),
                valid
            );
            assert_eq!(
                !self
                    .baro_corrected_altitude_2(adiru_number)
                    .is_failure_warning(),
                valid
            );
            assert_eq!(
                !self.computed_airspeed(adiru_number).is_failure_warning(),
                valid
            );
            assert_eq!(!self.max_airspeed(adiru_number).is_failure_warning(), valid);
            assert_eq!(!self.mach(adiru_number).is_failure_warning(), valid);
            assert_eq!(
                !self
                    .barometric_vertical_speed(adiru_number)
                    .is_failure_warning(),
                valid
            );
            assert_eq!(
                !self.true_airspeed(adiru_number).is_failure_warning(),
                valid
            );
            assert_eq!(
                !self
                    .static_air_temperature(adiru_number)
                    .is_failure_warning(),
                valid
            );
            assert_eq!(
                !self
                    .total_air_temperature(adiru_number)
                    .is_failure_warning(),
                valid
            );
            assert_eq!(
                !self.angle_of_attack(adiru_number).is_failure_warning(),
                valid
            );

            let discrete_word_flags =
                AdrDiscrete1Flags::from_bits(self.adr_discrete_word_1(adiru_number).value());
            assert_eq!(
                !(discrete_word_flags
                    .unwrap()
                    .contains(AdrDiscrete1Flags::ADR_STATUS_FAIL)
                    || self.adr_discrete_word_1(adiru_number).is_failure_warning()),
                valid
            );
        }

        fn assert_ir_heading_data_available(&mut self, available: bool, adiru_number: usize) {
            assert_eq!(self.heading(adiru_number).is_normal_operation(), available);
        }

        fn assert_ir_non_attitude_data_available(&mut self, available: bool, adiru_number: usize) {
            assert_eq!(self.track(adiru_number).is_normal_operation(), available);
            assert_eq!(
                self.drift_angle(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.flight_path_angle(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.inertial_vertical_speed(adiru_number)
                    .is_normal_operation(),
                available
            );
            assert_eq!(
                self.ground_speed(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.wind_direction(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.wind_direction_bnr(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.wind_speed(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.wind_speed_bnr(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(self.latitude(adiru_number).is_normal_operation(), available);
            assert_eq!(
                self.longitude(adiru_number).is_normal_operation(),
                available
            );
        }

        fn assert_ir_attitude_data_available(&mut self, available: bool, adiru_number: usize) {
            assert_eq!(self.pitch(adiru_number).is_normal_operation(), available);
            assert_eq!(self.roll(adiru_number).is_normal_operation(), available);
            assert_eq!(
                self.body_pitch_rate(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.body_roll_rate(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.body_yaw_rate(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.body_long_acc(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.body_lat_acc(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.body_normal_acc(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.pitch_att_rate(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.roll_att_rate(adiru_number).is_normal_operation(),
                available
            );
            assert_eq!(
                self.heading_rate(adiru_number).is_normal_operation(),
                available
            );
        }

        fn assert_all_ir_data_available(&mut self, available: bool, adiru_number: usize) {
            self.assert_ir_attitude_data_available(available, adiru_number);
            self.assert_ir_heading_data_available(available, adiru_number);
            self.assert_ir_non_attitude_data_available(available, adiru_number);
            assert_eq!(
                self.maint_word(adiru_number).is_normal_operation(),
                available
            );
        }

        fn assert_wind_direction_and_velocity_zero(&mut self, adiru_number: usize) {
            assert_about_eq!(
                self.wind_direction(adiru_number).value().get::<degree>(),
                0.
            );
            assert_about_eq!(
                self.wind_direction_bnr(adiru_number)
                    .value()
                    .get::<degree>(),
                0.
            );
            assert_about_eq!(self.wind_speed(adiru_number).value().get::<knot>(), 0.);
            assert_about_eq!(self.wind_speed_bnr(adiru_number).value().get::<knot>(), 0.);
        }

        fn realistic_navigation_align_until(
            mut self,
            adiru_number: usize,
            duration: Duration,
        ) -> Self {
            self = self
                .align_time_configured_as(AlignTime::Realistic)
                .and()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Navigation);

            // Run once to let the simulation write the remaining alignment time.
            self.run_with_delta(Duration::from_secs(0));

            let remaining_alignment_time = self.remaining_alignment_time();
            self.run_with_delta(remaining_alignment_time - duration);

            println!("{:?}", self.remaining_alignment_time());
            self
        }
    }
    impl TestBed for AdirsTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed_with() -> AdirsTestBed {
        test_bed()
    }

    fn test_bed() -> AdirsTestBed {
        // Nearly all tests require mode selectors to be off, therefore it is the default.
        all_adirus_aligned_test_bed().all_mode_selectors_off()
    }

    fn all_adirus_aligned_test_bed_with() -> AdirsTestBed {
        all_adirus_aligned_test_bed()
    }

    fn all_adirus_unaligned_test_bed_with() -> AdirsTestBed {
        let mut bed = all_adirus_aligned_test_bed().all_mode_selectors_off();
        // run long enough to bypass quick align
        bed.run_with_delta(Duration::from_secs(10));
        bed
    }

    fn all_adirus_aligned_test_bed() -> AdirsTestBed {
        AdirsTestBed::new()
    }

    #[rstest]
    #[case(1)]
    #[case(2)]
    #[case(3)]
    fn starts_aligned(#[case] adiru_number: usize) {
        // The structs start in an aligned state to support starting a flight
        // on the runway or in the air with the mode selectors in the NAV position.
        let mut test_bed = all_adirus_aligned_test_bed();
        test_bed.run();

        assert!(test_bed.is_aligned(adiru_number));
        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::NAV_MODE,
            IrMaintFlags::NAV_MODE
        );
    }

    #[rstest]
    #[case(1)]
    #[case(2)]
    #[case(3)]
    fn adiru_is_not_aligning_nor_aligned_when_ir_mode_selector_off(#[case] adiru_number: usize) {
        let mut test_bed =
            test_bed_with().ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Off);

        test_bed.run_with_delta(Duration::from_secs(0));

        assert!(!test_bed.is_aligned(adiru_number));
        assert!(!test_bed.is_aligning(adiru_number));
        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
        assert_eq!(
            maint_word_flags.unwrap()
                & (IrMaintFlags::ALIGNMENT_NOT_READY | IrMaintFlags::NAV_MODE),
            IrMaintFlags::empty()
        );
    }

    #[rstest]
    #[case(1)]
    #[case(2)]
    #[case(3)]
    fn adiru_instantly_aligns_when_configured_align_time_is_instant(#[case] adiru_number: usize) {
        // TODO: Once the ADIRUs are split, this unit test needs to be modified to test all
        // ADIRUs individually.
        let mut test_bed = test_bed_with()
            .align_time_configured_as(AlignTime::Instant)
            .and()
            .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Navigation);

        test_bed.run_with_delta(Duration::from_secs(0));

        assert!(test_bed.is_aligned(adiru_number));
        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::NAV_MODE,
            IrMaintFlags::NAV_MODE
        );
    }

    #[rstest]
    #[case(1)]
    #[case(2)]
    #[case(3)]
    fn adirs_aligns_in_90_seconds_when_configured_align_time_is_fast(#[case] adiru_number: usize) {
        // TODO: Once the ADIRUs are split, this unit test needs to be modified to test all
        // ADIRUs individually.
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .align_time_configured_as(AlignTime::Fast)
            .and()
            .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Navigation);

        // Set the state without any time passing to be able to measure exact time afterward.
        test_bed.run_with_delta(Duration::from_secs(0));

        test_bed.run_with_delta(Duration::from_secs_f64(
            InertialReference::FAST_ALIGNMENT_TIME_IN_SECS - 1.,
        ));
        assert!(test_bed.is_aligning(adiru_number));
        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::ALIGNMENT_NOT_READY,
            IrMaintFlags::ALIGNMENT_NOT_READY
        );

        test_bed.run_with_delta(Duration::from_secs(1));
        assert!(test_bed.is_aligned(adiru_number));
        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::NAV_MODE,
            IrMaintFlags::NAV_MODE
        );
    }

    #[rstest]
    #[case(Angle::new::<degree>(85.))]
    #[case(Angle::new::<degree>(-85.))]
    fn adirs_does_not_align_near_the_poles(#[case] polar_latitude: Angle) {
        let mut test_bed = start_align_at_latitude(polar_latitude);
        test_bed.run();
        test_bed.run_with_delta(Duration::from_secs(20 * 60)); // run for 20 minutes, enough for any alignment

        assert!(!test_bed.is_aligned(1));
    }

    #[rstest]
    #[case(Angle::new::<degree>(85.))]
    #[case(Angle::new::<degree>(-85.))]
    fn adirs_stays_aligned_near_the_poles(#[case] polar_latitude: Angle) {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation)
            .and()
            .latitude_of(polar_latitude);
        test_bed.run();

        assert!(test_bed.is_aligned(1));
    }

    #[rstest]
    fn adirs_detects_excess_motion_during_alignment() {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .body_lateral_velocity_of(Velocity::new::<foot_per_second>(0.1))
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run();
        test_bed.run();

        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(1).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::EXCESS_MOTION_ERROR,
            IrMaintFlags::EXCESS_MOTION_ERROR
        );
    }

    #[rstest]
    fn adirs_detects_excess_motion_during_alignment_with_instant_boarding_selected() {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .boarding_rate_of(BoardingRate::Instant)
            .body_lateral_velocity_of(Velocity::new::<foot_per_second>(0.1))
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run();
        test_bed.run();

        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(1).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::EXCESS_MOTION_ERROR,
            IrMaintFlags::EXCESS_MOTION_ERROR
        );
    }

    #[rstest]
    fn adirs_detects_excess_motion_during_alignment_with_fast_boarding_selected() {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .boarding_rate_of(BoardingRate::Fast)
            .body_lateral_velocity_of(Velocity::new::<foot_per_second>(0.1))
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run();
        test_bed.run();

        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(1).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::EXCESS_MOTION_ERROR,
            IrMaintFlags::EXCESS_MOTION_ERROR
        );
    }

    #[rstest]
    fn adirs_does_not_detect_excess_motion_during_instant_boarding() {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .boarding_rate_of(BoardingRate::Instant)
            .boarding_started_of(true)
            .body_lateral_velocity_of(Velocity::new::<foot_per_second>(0.1))
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run();
        test_bed.run();

        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(1).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::EXCESS_MOTION_ERROR,
            IrMaintFlags::empty()
        );
    }

    #[rstest]
    fn adirs_does_not_detect_excess_motion_during_fast_boarding() {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .boarding_rate_of(BoardingRate::Fast)
            .boarding_started_of(true)
            .body_lateral_velocity_of(Velocity::new::<foot_per_second>(0.1))
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run();
        test_bed.run();

        let maint_word_flags = IrMaintFlags::from_bits(test_bed.maint_word(1).value());
        assert_eq!(
            maint_word_flags.unwrap() & IrMaintFlags::EXCESS_MOTION_ERROR,
            IrMaintFlags::empty()
        );
    }

    #[rstest]
    #[case(Angle::new::<degree>(80.))]
    #[case(Angle::new::<degree>(-80.))]
    fn adirs_aligns_quicker_near_equator_than_near_the_poles_when_configured_align_time_is_realistic(
        #[case] polar_latitude: Angle,
    ) {
        let mut test_bed = start_align_at_latitude(Angle::new::<degree>(0.));
        let equator_alignment_time = test_bed.remaining_alignment_time();

        let mut test_bed = start_align_at_latitude(polar_latitude);
        let south_pole_alignment_time = test_bed.remaining_alignment_time();

        assert!(equator_alignment_time < south_pole_alignment_time);
    }

    fn start_align_at_latitude(latitude: Angle) -> AdirsTestBed {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .align_time_configured_as(AlignTime::Realistic)
            .latitude_of(latitude)
            .and()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);

        test_bed.run();
        test_bed
    }

    #[rstest]
    #[case(Angle::new::<degree>(0.))]
    #[case(Angle::new::<degree>(63.))]
    #[case(Angle::new::<degree>(-63.))]
    fn adirs_aligns_quick_when_mode_selector_off_for_3_secs(#[case] latitude: Angle) {
        // Create the conditions for a quick align (aligned, then less than 5 secs off)
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .align_time_configured_as(AlignTime::Realistic)
            .latitude_of(latitude)
            .and()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Off);
        test_bed.run_with_delta(Duration::from_secs(2));

        // Perform the quick align
        test_bed = test_bed
            .then_continue_with()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run();

        let alignment_time = test_bed.remaining_alignment_time();

        // FCOM: a fast alignment takes 30 s.
        assert!(alignment_time <= Duration::from_secs(30));
    }

    #[rstest]
    #[case(InertialReferenceMode::Navigation)]
    #[case(InertialReferenceMode::Attitude)]
    fn ir_fault_light_briefly_flashes_when_moving_mode_selector_from_off_to(
        #[case] mode: InertialReferenceMode,
    ) {
        let mut test_bed = test_bed_with().ir_mode_selector_set_to(1, mode);

        test_bed.run_without_delta();
        assert!(test_bed.ir_fault_light_illuminated(1));

        test_bed
            .run_with_delta(InertialReference::IR_FAULT_FLASH_DURATION - Duration::from_millis(1));
        assert!(test_bed.ir_fault_light_illuminated(1));

        test_bed.run_with_delta(Duration::from_millis(1));
        assert!(!test_bed.ir_fault_light_illuminated(1));
    }

    #[test]
    fn ir_fault_light_doesnt_briefly_flash_when_moving_mode_selector_between_nav_and_att() {
        let mut test_bed =
            test_bed_with().ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();
        test_bed.run();

        test_bed = test_bed
            .then_continue_with()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Attitude);
        test_bed.run_with_delta(Duration::from_millis(1));

        assert!(!test_bed.ir_fault_light_illuminated(1));
    }

    #[rstest]
    #[case(InertialReferenceMode::Navigation)]
    #[case(InertialReferenceMode::Attitude)]
    fn ten_and_a_half_seconds_after_moving_the_mode_selector_the_on_bat_light_illuminates_for_5_and_a_half_seconds(
        #[case] mode: InertialReferenceMode,
    ) {
        // A complete alignment: a fast alignment has no ON BAT light (FCOM l.52646-52648)
        let mut test_bed = all_adirus_unaligned_test_bed_with().ir_mode_selector_set_to(1, mode);
        test_bed.run_without_delta();

        test_bed.run_with_delta(
            AirDataInertialReferenceSystemOverheadPanel::DURATION_AFTER_WHICH_ON_BAT_ILLUMINATES
                - Duration::from_millis(1),
        );
        assert!(!test_bed.on_bat_light_illuminated());

        test_bed.run_with_delta(Duration::from_millis(1));
        assert!(test_bed.on_bat_light_illuminated());

        test_bed.run_with_delta(
            AirDataInertialReferenceSystemOverheadPanel::ON_BAT_ILLUMINATION_DURATION
                - Duration::from_millis(1),
        );
        assert!(test_bed.on_bat_light_illuminated());

        test_bed.run_with_delta(Duration::from_millis(1));
        assert!(!test_bed.on_bat_light_illuminated());
    }

    #[test]
    fn on_bat_illuminates_for_longer_than_5_and_a_half_seconds_when_selectors_move_to_nav_at_different_times(
    ) {
        // The duration after which we turn the second selector to NAV, and therefore
        // the additional duration we would expect the ON BAT light to be illuminated.
        let additional_duration = Duration::from_secs(1);

        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();
        test_bed.run_with_delta(additional_duration);

        test_bed = test_bed
            .then_continue_with()
            .ir_mode_selector_set_to(2, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();
        test_bed.run_with_delta(
            AirDataInertialReferenceSystemOverheadPanel::DURATION_AFTER_WHICH_ON_BAT_ILLUMINATES
                - additional_duration
                - Duration::from_millis(1),
        );
        assert!(!test_bed.on_bat_light_illuminated());

        test_bed.run_with_delta(Duration::from_millis(1));
        assert!(test_bed.on_bat_light_illuminated());

        test_bed.run_with_delta(
            AirDataInertialReferenceSystemOverheadPanel::ON_BAT_ILLUMINATION_DURATION
                + additional_duration
                - Duration::from_millis(1),
        );
        assert!(test_bed.on_bat_light_illuminated());

        test_bed.run_with_delta(Duration::from_millis(1));
        assert!(!test_bed.on_bat_light_illuminated());
    }

    #[test]
    fn switching_between_nav_and_att_doesnt_affect_the_on_bat_light_illumination() {
        let mut test_bed = all_adirus_unaligned_test_bed_with()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();
        test_bed.run_with_delta(
            AirDataInertialReferenceSystemOverheadPanel::DURATION_AFTER_WHICH_ON_BAT_ILLUMINATES,
        );

        assert!(test_bed.on_bat_light_illuminated());

        test_bed = test_bed
            .then_continue_with()
            .ir_mode_selector_set_to(1, InertialReferenceMode::Attitude);
        test_bed.run();

        assert!(test_bed.on_bat_light_illuminated());
    }

    #[test]
    fn a_fast_alignment_does_not_illuminate_the_on_bat_light() {
        // Aligned, then OFF and back to NAV within 5 s: a fast alignment (FCOM l.52646-52648)
        let mut test_bed =
            test_bed_with().ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();

        for _ in 0..16 {
            test_bed.run_with_delta(Duration::from_secs(1));
            assert!(!test_bed.on_bat_light_illuminated());
        }
    }

    #[rstest]
    #[case(1)]
    #[case(2)]
    #[case(3)]
    fn adr_fault_failure_loses_the_air_data_and_illuminates_the_fault_light(
        #[case] adiru_number: usize,
    ) {
        let mut test_bed = all_adirus_aligned_test_bed();
        test_bed.run();
        test_bed.fail(FailureType::AdrFault(adiru_number));
        test_bed.run();

        test_bed.assert_adr_data_valid(false, adiru_number);
        assert!(test_bed.adr_fault_light_illuminated(adiru_number));
        assert!(test_bed.adr_fault_discrete(adiru_number));
        let discrete_word = test_bed.adr_discrete_word_1(adiru_number);
        assert!(discrete_word.is_normal_operation());
        assert!(AdrDiscrete1Flags::from_bits_truncate(discrete_word.value())
            .contains(AdrDiscrete1Flags::ADR_STATUS_FAIL));

        // The other ADRs and the IR of the same ADIRU are not affected
        for other in (1..=3).filter(|&number| number != adiru_number) {
            test_bed.assert_adr_data_valid(true, other);
            assert!(!test_bed.adr_fault_light_illuminated(other));
        }
        test_bed.assert_ir_attitude_data_available(true, adiru_number);
    }

    #[test]
    fn adr_fault_light_stays_with_the_adr_push_button_off_and_goes_out_when_the_fault_clears() {
        let mut test_bed = all_adirus_aligned_test_bed();
        test_bed.fail(FailureType::AdrFault(1));
        test_bed = test_bed.adr_push_button_off(1);
        test_bed.run();
        assert!(test_bed.adr_fault_light_illuminated(1));
        assert!(test_bed.adr_fault_discrete(1));

        test_bed.unfail(FailureType::AdrFault(1));
        test_bed.run();
        assert!(!test_bed.adr_fault_light_illuminated(1));
        assert!(!test_bed.adr_fault_discrete(1));
    }

    #[test]
    fn adr_fault_light_is_off_with_the_adiru_switched_off() {
        let mut test_bed = all_adirus_aligned_test_bed();
        test_bed.fail(FailureType::AdrFault(1));
        test_bed = test_bed.ir_mode_selector_set_to(1, InertialReferenceMode::Off);
        test_bed.run();

        assert!(!test_bed.adr_fault_light_illuminated(1));
    }

    #[rstest]
    #[case(1)]
    #[case(2)]
    #[case(3)]
    fn ir_fault_failure_loses_the_inertial_data_and_illuminates_the_fault_light_steady(
        #[case] adiru_number: usize,
    ) {
        let mut test_bed = all_adirus_aligned_test_bed();
        test_bed.run();
        test_bed.fail(FailureType::IrFault(adiru_number));
        test_bed.run_with_delta(Duration::from_secs(10));

        assert!(test_bed.pitch(adiru_number).is_failure_warning());
        assert!(test_bed.roll(adiru_number).is_failure_warning());
        assert!(test_bed.heading(adiru_number).is_failure_warning());
        assert!(test_bed.latitude(adiru_number).is_failure_warning());
        assert!(test_bed.ground_speed(adiru_number).is_failure_warning());
        assert!(test_bed.ir_fault_light_illuminated(adiru_number));
        assert!(test_bed.ir_fault_discrete(adiru_number));
        let maint_word = test_bed.maint_word(adiru_number);
        assert!(maint_word.is_normal_operation());
        assert!(
            IrMaintFlags::from_bits_truncate(maint_word.value()).contains(IrMaintFlags::IR_FAULT)
        );

        // The ADR of the same ADIRU and the other IRs are not affected
        test_bed.assert_adr_data_valid(true, adiru_number);
        for other in (1..=3).filter(|&number| number != adiru_number) {
            test_bed.assert_ir_attitude_data_available(true, other);
            assert!(!test_bed.ir_fault_light_illuminated(other));
        }
    }

    #[test]
    fn ir_fault_light_stays_with_the_ir_push_button_off() {
        let mut test_bed = all_adirus_aligned_test_bed();
        test_bed.fail(FailureType::IrFault(2));
        test_bed = test_bed.ir_push_button_off(2);
        test_bed.run();

        assert!(test_bed.ir_fault_light_illuminated(2));
        assert!(test_bed.ir_fault_discrete(2));
    }

    #[test]
    fn ir_heading_erroneous_failure_offsets_the_heading_with_a_valid_status() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .heading_of(Angle::new::<degree>(100.))
            .true_heading_of(Angle::new::<degree>(105.));
        test_bed.fail(FailureType::IrHeadingErroneous(1));
        test_bed.run();

        let heading_1 = test_bed.heading(1);
        assert!(heading_1.is_normal_operation());
        assert_about_eq!(heading_1.value().get::<degree>(), 110.);
        assert_about_eq!(test_bed.true_heading(1).value().get::<degree>(), 115.);
        assert_about_eq!(test_bed.heading(2).value().get::<degree>(), 100.);
        assert!(!test_bed.ir_fault_light_illuminated(1));
    }

    #[test]
    fn without_its_main_bus_the_adr_is_lost_and_the_ir_runs_on_the_battery() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .on_ground(true)
            .bus_powered(ElectricalBusType::AlternatingCurrent(2), false);
        test_bed.run_with_delta(Duration::from_secs(1));

        test_bed.assert_adr_data_valid(false, 2);
        test_bed.assert_ir_attitude_data_available(true, 2);
        assert!(test_bed.is_aligned(2));
        // FCOM l.52645-52652: ON BAT light, and the external horn on the ground
        assert!(test_bed.on_bat_light_illuminated());
        assert!(test_bed.external_horn_sounds());
        test_bed.assert_adr_data_valid(true, 1);
    }

    #[test]
    fn the_external_horn_does_not_sound_in_flight() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .on_ground(false)
            .bus_powered(ElectricalBusType::AlternatingCurrentEssential, false);
        test_bed.run_with_delta(Duration::from_secs(1));

        assert!(test_bed.on_bat_light_illuminated());
        assert!(!test_bed.external_horn_sounds());
    }

    #[test]
    fn with_all_buses_powered_the_on_bat_light_and_the_horn_are_off() {
        let mut test_bed = all_adirus_aligned_test_bed_with().on_ground(true);
        test_bed.run_with_delta(Duration::from_secs(1));

        assert!(!test_bed.on_bat_light_illuminated());
        assert!(!test_bed.external_horn_sounds());
    }

    #[test]
    fn a_switched_off_adiru_takes_no_battery_power() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .on_ground(true)
            .bus_powered(ElectricalBusType::AlternatingCurrent(2), false)
            .ir_mode_selector_set_to(2, InertialReferenceMode::Off);
        test_bed.run_with_delta(Duration::from_secs(1));

        assert!(!test_bed.on_bat_light_illuminated());
        assert!(!test_bed.external_horn_sounds());
    }

    #[test]
    fn the_battery_supplies_an_ir_with_a_time_limit_only_for_that_time() {
        // A320 FCOM PRO-ABN-ELEC note (e) (l.75390): "IR 2 and IR 3 are lost 5 min after failure of main generators"
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .bus_powered(ElectricalBusType::AlternatingCurrent(2), false);
        test_bed.run_with_delta(TEST_IR_2_BACKUP_TIME_LIMIT - Duration::from_secs(1));
        test_bed.assert_ir_attitude_data_available(true, 2);

        test_bed.run_with_delta(Duration::from_secs(2));
        test_bed.assert_ir_attitude_data_available(false, 2);
        assert!(!test_bed.is_aligned(2));
        assert!(!test_bed.on_bat_light_illuminated());
    }

    #[test]
    fn without_its_main_and_backup_buses_the_ir_is_lost() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .bus_powered(ElectricalBusType::AlternatingCurrentEssential, false)
            .bus_powered(ElectricalBusType::DirectCurrentHot(1), false);
        test_bed.run_with_delta(Duration::from_secs(1));

        test_bed.assert_ir_attitude_data_available(false, 1);
        test_bed.assert_adr_data_valid(false, 1);
        assert!(!test_bed.is_aligned(1));
        test_bed.assert_ir_attitude_data_available(true, 2);
    }

    #[test]
    fn an_unpowered_network_while_the_flight_loads_does_not_stop_the_adirus() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .bus_powered(ElectricalBusType::AlternatingCurrent(2), false)
            .bus_powered(ElectricalBusType::DirectCurrentHot(2), false);
        test_bed.run_with_delta(
            AirDataInertialReferenceSystem::POWER_SETTLING_TIME - Duration::from_millis(100),
        );
        test_bed.assert_adr_data_valid(true, 2);
        assert!(test_bed.is_aligned(2));

        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.assert_adr_data_valid(false, 2);
        assert!(!test_bed.is_aligned(2));
    }

    #[test]
    fn a_short_power_interruption_does_not_stop_the_adiru() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .bus_powered(ElectricalBusType::AlternatingCurrent(2), false);
        test_bed.run_with_delta(AirDataInertialReferenceUnit::POWER_INTERRUPTION_TOLERANCE / 2);
        test_bed = test_bed.bus_powered(ElectricalBusType::AlternatingCurrent(2), true);
        test_bed.run_with_delta(Duration::from_millis(50));

        test_bed.assert_adr_data_valid(true, 2);
    }

    #[test]
    fn the_adr_initialises_again_when_its_power_comes_back() {
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .bus_powered(ElectricalBusType::AlternatingCurrent(2), false);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed = test_bed.bus_powered(ElectricalBusType::AlternatingCurrent(2), true);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.assert_adr_data_valid(false, 2);

        test_bed.run_with_delta(AirDataReference::INITIALISATION_DURATION);
        test_bed.assert_adr_data_valid(true, 2);
    }

    #[test]
    fn an_adr_with_a_second_bus_needs_both_buses_and_its_ir_does_not_run_on_the_battery() {
        // ADIRU 3 of the test aircraft is supplied as an A380 ADIRU: AC bus, and a DC bus for the ADR and as IR backup
        let mut test_bed = all_adirus_aligned_test_bed_with()
            .after_the_power_settling_time()
            .bus_powered(ElectricalBusType::DirectCurrent(1), false);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.assert_adr_data_valid(false, 3);
        test_bed.assert_ir_attitude_data_available(true, 3);

        test_bed = test_bed
            .bus_powered(ElectricalBusType::DirectCurrent(1), true)
            .bus_powered(ElectricalBusType::AlternatingCurrent(1), false);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.assert_adr_data_valid(false, 3);
        test_bed.assert_ir_attitude_data_available(true, 3);
        assert!(test_bed.is_aligned(3));
        assert!(!test_bed.on_bat_light_illuminated());
    }

    #[test]
    #[timeout(500)]
    fn remaining_alignment_time_counts_down_to_0_seconds() {
        let mut test_bed =
            test_bed_with().ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();

        assert!(
            test_bed.remaining_alignment_time() > Duration::from_secs(0),
            "Test precondition: alignment time should be greater than 0 seconds."
        );

        while test_bed.remaining_alignment_time() > Duration::from_secs(0) {
            test_bed.run();
        }
    }

    #[test]
    fn remaining_alignment_time_is_0_seconds_when_nothing_is_aligning() {
        let mut test_bed = test_bed_with().all_mode_selectors_off();
        test_bed.run();

        assert_eq!(test_bed.remaining_alignment_time(), Duration::from_secs(0));
    }

    #[test]
    fn remaining_alignment_time_is_the_longest_out_of_all_aligning_adirus() {
        let mut test_bed =
            test_bed_with().ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();
        test_bed.run_with_delta(Duration::from_secs(60));
        let single_adiru_remaining_alignment_time = test_bed.remaining_alignment_time();

        test_bed = test_bed
            .then_continue_with()
            .ir_mode_selector_set_to(2, InertialReferenceMode::Navigation);
        test_bed.run();

        assert!(test_bed.remaining_alignment_time() > single_adiru_remaining_alignment_time);
    }

    #[test]
    fn remaining_alignment_time_is_greater_than_zero_when_a_single_adiru_is_aligned_but_another_is_still_aligning(
    ) {
        let mut test_bed =
            test_bed_with().ir_mode_selector_set_to(1, InertialReferenceMode::Navigation);
        test_bed.run_without_delta();

        while test_bed.remaining_alignment_time() > Duration::from_secs(0) {
            test_bed.run();
        }

        test_bed = test_bed
            .then_continue_with()
            .ir_mode_selector_set_to(2, InertialReferenceMode::Navigation);
        test_bed.run();

        assert!(test_bed.remaining_alignment_time() > Duration::from_secs(0));
    }

    mod adr {
        use ntest::{assert_false, assert_true};

        use crate::shared::InternationalStandardAtmosphere;

        use super::*;

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn data_is_valid_18_seconds_after_alignment_began(#[case] adiru_number: usize) {
            let mut test_bed = test_bed_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Navigation);
            test_bed.run_without_delta();

            test_bed.run_with_delta(
                AirDataReference::INITIALISATION_DURATION - Duration::from_millis(1),
            );
            test_bed.assert_adr_data_valid(false, adiru_number);

            test_bed.run_with_delta(Duration::from_millis(1));
            test_bed.assert_adr_data_valid(true, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn data_is_no_longer_valid_when_adiru_mode_selector_off(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.run();
            test_bed.assert_adr_data_valid(true, adiru_number);

            test_bed = test_bed
                .then_continue_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Off);
            test_bed.run();
            test_bed.assert_adr_data_valid(false, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn when_adr_push_button_off_data_is_not_valid(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed_with().adr_push_button_off(adiru_number);
            test_bed.run();

            test_bed.assert_adr_data_valid(false, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn corrected_average_static_pressure_is_supplied_by_adr(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_ambient_pressure(Pressure::new::<hectopascal>(1013.));

            // let the filter run a bit
            test_bed.run_iterations_with_delta(5, Duration::from_millis(250));

            assert_about_eq!(
                test_bed
                    .corrected_average_static_pressure(adiru_number)
                    .normal_value()
                    .unwrap(),
                1013.
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn baro_correction_is_supplied_by_adr(#[case] adiru_number: usize) {
            let mut test_bed =
                all_adirus_aligned_test_bed()
                    .altimeter_setting_of(Pressure::new::<hectopascal>(1020.));

            test_bed.run();

            assert_about_eq!(
                test_bed
                    .baro_correction_1_hpa(adiru_number)
                    .normal_value()
                    .unwrap(),
                1020.
            );
            assert_about_eq!(
                test_bed
                    .baro_correction_2_hpa(adiru_number)
                    .normal_value()
                    .unwrap(),
                1020.
            );

            test_bed = test_bed.altimeter_setting_of(Pressure::new::<inch_of_mercury>(29.80));

            test_bed.run();

            assert_about_eq!(
                test_bed
                    .baro_correction_1_inhg(adiru_number)
                    .normal_value()
                    .unwrap(),
                29.80
            );
            assert_about_eq!(
                test_bed
                    .baro_correction_2_inhg(adiru_number)
                    .normal_value()
                    .unwrap(),
                29.80
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn altitude_is_supplied_by_adr(#[case] adiru_number: usize) {
            use uom::si::pressure::pascal;

            let mut test_bed = all_adirus_aligned_test_bed();
            // set_pressure_altitude is only valid in the troposhere (due to InternationalStandardAtmosphere::pressure_at_altitude)
            // test_bed.set_pressure_altitude(Length::new::<foot>(41000.));
            test_bed.set_ambient_pressure(Pressure::new::<pascal>(17874.)); // 41000 feet

            test_bed.run_iterations_with_delta(10, Duration::from_millis(250));

            assert_about_eq!(
                test_bed
                    .altitude(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<foot>(),
                41000.,
                2.,
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn baro_corrected_altitude_1_is_supplied_by_adr(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_pressure_altitude(Length::new::<foot>(10000.));

            test_bed.run_iterations_with_delta(10, Duration::from_millis(250));

            assert_about_eq!(
                test_bed
                    .baro_corrected_altitude_1(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<foot>(),
                10000.,
                2.,
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn baro_corrected_altitude_2_is_supplied_by_adr(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_pressure_altitude(Length::new::<foot>(10000.));

            test_bed.run_iterations_with_delta(10, Duration::from_millis(250));

            assert_about_eq!(
                test_bed
                    .baro_corrected_altitude_2(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<foot>(),
                10000.,
                2.,
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn computed_airspeed_is_supplied_by_adr_when_greater_than_or_equal_to_30_knots(
            #[case] adiru_number: usize,
        ) {
            let velocity = Velocity::new::<knot>(AirDataReference::MINIMUM_CAS);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(velocity);
            test_bed.run();

            assert_eq!(
                test_bed
                    .computed_airspeed(adiru_number)
                    .normal_value()
                    .unwrap(),
                velocity
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn computed_airspeed_is_ncd_and_zero_when_less_than_30_knots(#[case] adiru_number: usize) {
            let velocity = Velocity::new::<knot>(AirDataReference::MINIMUM_CAS - 0.01);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(velocity);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .computed_airspeed(adiru_number)
                    .value()
                    .get::<knot>(),
                0.
            );
            assert_eq!(
                test_bed.computed_airspeed(adiru_number).ssm(),
                SignStatus::NoComputedData
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn max_airspeed_is_provided_at_sea_level(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_ambient_pressure(InternationalStandardAtmosphere::ground_pressure());
            test_bed.run();

            assert_true!(test_bed.max_airspeed(adiru_number).value().get::<knot>() > 330.);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn max_airspeed_is_limited_by_mmo(#[case] adiru_number: usize) {
            use ntest::assert_true;

            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_ambient_pressure(InternationalStandardAtmosphere::pressure_at_altitude(
                Length::new::<foot>(39_000.),
            ));
            test_bed.run();

            assert_true!(test_bed.max_airspeed(adiru_number).value().get::<knot>() < 300.);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn overspeed_warning_is_inactive_at_normal_speed_at_sea_level(#[case] adiru_number: usize) {
            // check a value that's below VMO, but above MMO at higher altitudes
            let velocity = Velocity::new::<knot>(330.);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(velocity);
            test_bed.set_ambient_pressure(InternationalStandardAtmosphere::ground_pressure());
            test_bed.run();

            let discrete_word_flags =
                AdrDiscrete1Flags::from_bits(test_bed.adr_discrete_word_1(adiru_number).value());
            assert_false!(discrete_word_flags
                .unwrap()
                .contains(AdrDiscrete1Flags::OVERSPEED_WARNING));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn overspeed_warning_is_inactive_at_normal_speed_at_high_level(
            #[case] adiru_number: usize,
        ) {
            let fl390_pressure =
                InternationalStandardAtmosphere::pressure_at_altitude(Length::new::<foot>(39_000.));
            let velocity = MachNumber(0.78).to_cas(fl390_pressure);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(velocity);
            test_bed.set_ambient_pressure(fl390_pressure);
            test_bed.run();

            let discrete_word_flags =
                AdrDiscrete1Flags::from_bits(test_bed.adr_discrete_word_1(adiru_number).value());
            assert_false!(discrete_word_flags
                .unwrap()
                .contains(AdrDiscrete1Flags::OVERSPEED_WARNING));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn overspeed_warning_is_active_above_vmo(#[case] adiru_number: usize) {
            let velocity = Velocity::new::<knot>(400.);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(velocity);
            test_bed.set_ambient_pressure(InternationalStandardAtmosphere::ground_pressure());
            test_bed.run();

            let discrete_word_flags =
                AdrDiscrete1Flags::from_bits(test_bed.adr_discrete_word_1(adiru_number).value());
            assert_true!(discrete_word_flags
                .unwrap()
                .contains(AdrDiscrete1Flags::OVERSPEED_WARNING));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn overspeed_warning_is_active_above_mmo(#[case] adiru_number: usize) {
            let fl390_pressure =
                InternationalStandardAtmosphere::pressure_at_altitude(Length::new::<foot>(39_000.));
            // This speed will be above MMO, but below VMO, so we ensure MMO gets tested.
            let velocity = MachNumber(0.9).to_cas(fl390_pressure);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(velocity);
            test_bed.set_ambient_pressure(fl390_pressure);
            test_bed.run();

            let discrete_word_flags =
                AdrDiscrete1Flags::from_bits(test_bed.adr_discrete_word_1(adiru_number).value());
            assert_true!(discrete_word_flags
                .unwrap()
                .contains(AdrDiscrete1Flags::OVERSPEED_WARNING));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn mach_is_supplied_by_adr_when_greater_than_or_equal_to_zero_point_1(
            #[case] adiru_number: usize,
        ) {
            let mach = MachNumber::from(AirDataReference::MINIMUM_MACH);
            let mut test_bed = all_adirus_aligned_test_bed_with().mach_of(mach);
            test_bed.run();

            assert_about_eq!(
                f64::from(test_bed.mach(adiru_number).normal_value().unwrap()),
                f64::from(mach)
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn mach_is_ncd_and_zero_when_less_than_zero_point_1(#[case] adiru_number: usize) {
            let mach = MachNumber::from(AirDataReference::MINIMUM_MACH - 0.01);
            let mut test_bed = all_adirus_aligned_test_bed_with().mach_of(mach);
            test_bed.run();

            assert_about_eq!(f64::from(test_bed.mach(adiru_number).value()), 0.);
            assert_eq!(
                test_bed.mach(adiru_number).ssm(),
                SignStatus::NoComputedData
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn barometric_vertical_speed_is_supplied_by_adr(#[case] adiru_number: usize) {
            let vertical_speed = Velocity::new::<foot_per_minute>(300.);
            let mut test_bed = all_adirus_aligned_test_bed_with();
            let mut altitude = Length::new::<foot>(0.);
            for _ in 0..5 {
                test_bed.set_pressure_altitude(altitude);
                test_bed.run();

                altitude += vertical_speed * Time::new::<second>(1.);
            }

            assert_about_eq!(
                test_bed
                    .barometric_vertical_speed(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<foot_per_minute>(),
                vertical_speed.get::<foot_per_minute>(),
                10.
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_airspeed_is_supplied_by_adr_when_greater_than_or_equal_to_60_knots(
            #[case] adiru_number: usize,
        ) {
            let velocity = Velocity::new::<knot>(AirDataReference::MINIMUM_TAS);
            let mut test_bed = all_adirus_aligned_test_bed_with().true_airspeed_of(velocity);
            test_bed.run();

            assert_eq!(
                test_bed.true_airspeed(adiru_number).normal_value().unwrap(),
                velocity
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_airspeed_is_ncd_and_zero_when_less_than_60_knots(#[case] adiru_number: usize) {
            let velocity = Velocity::new::<knot>(AirDataReference::MINIMUM_TAS - 0.01);
            let mut test_bed = all_adirus_aligned_test_bed_with().true_airspeed_of(velocity);
            test_bed.run();

            assert_about_eq!(
                test_bed.true_airspeed(adiru_number).value().get::<knot>(),
                0.
            );
            assert_eq!(
                test_bed.true_airspeed(adiru_number).ssm(),
                SignStatus::NoComputedData
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn static_air_temperature_is_supplied_by_adr(#[case] adiru_number: usize) {
            let sat = ThermodynamicTemperature::new::<degree_celsius>(15.);
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_ambient_temperature(sat);
            test_bed.run();

            assert_eq!(
                test_bed
                    .static_air_temperature(adiru_number)
                    .normal_value()
                    .unwrap(),
                sat
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn total_air_temperature_is_supplied_by_adr(#[case] adiru_number: usize) {
            let tat = ThermodynamicTemperature::new::<degree_celsius>(15.);
            let mut test_bed = all_adirus_aligned_test_bed_with().total_air_temperature_of(tat);
            test_bed.run();

            assert_eq!(
                test_bed
                    .total_air_temperature(adiru_number)
                    .normal_value()
                    .unwrap(),
                tat
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn angle_of_attack_is_supplied_by_adr_when_greater_than_or_equal_to_60_knots(
            #[case] adiru_number: usize,
        ) {
            let angle = Angle::new::<degree>(1.);
            let mut test_bed = all_adirus_aligned_test_bed_with().angle_of_attack_of(angle);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(
                AirDataReference::MINIMUM_CAS_FOR_AOA,
            ));
            test_bed.run();

            assert_eq!(
                test_bed
                    .angle_of_attack(adiru_number)
                    .normal_value()
                    .unwrap(),
                angle
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn angle_of_attack_is_ncd_when_less_than_60_knots(#[case] adiru_number: usize) {
            let angle = Angle::new::<degree>(1.);
            let mut test_bed = all_adirus_aligned_test_bed_with().angle_of_attack_of(angle);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(
                AirDataReference::MINIMUM_CAS_FOR_AOA - 0.01,
            ));
            test_bed.run();

            assert_eq!(test_bed.angle_of_attack(adiru_number).value(), angle);
            assert_eq!(
                test_bed.angle_of_attack(adiru_number).ssm(),
                SignStatus::NoComputedData
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn erroneous_airspeed_reads_low_with_a_valid_status_on_the_failed_adr_only(
            #[case] adiru_number: usize,
        ) {
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .mach_of(MachNumber(0.5))
                .and()
                .true_airspeed_of(Velocity::new::<knot>(300.));
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(250.));
            test_bed.fail(FailureType::AdrAirspeedErroneous(adiru_number));
            test_bed.run();

            for number in 1..=3 {
                let expected_ratio = if number == adiru_number {
                    210. / 250.
                } else {
                    1.
                };
                let cas = test_bed.computed_airspeed(number);
                assert_eq!(cas.ssm(), SignStatus::NormalOperation);
                assert_about_eq!(cas.value().get::<knot>(), 250. * expected_ratio, 0.01);
                let mach = test_bed.mach(number);
                assert_eq!(mach.ssm(), SignStatus::NormalOperation);
                assert_about_eq!(f64::from(mach.value()), 0.5 * expected_ratio, 0.0001);
                assert_about_eq!(
                    test_bed.true_airspeed(number).value().get::<knot>(),
                    300. * expected_ratio,
                    0.01
                );
            }
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn erroneous_angle_of_attack_reads_high_with_a_valid_status_on_the_failed_adr_only(
            #[case] adiru_number: usize,
        ) {
            let angle = Angle::new::<degree>(3.);
            let mut test_bed = all_adirus_aligned_test_bed_with().angle_of_attack_of(angle);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
            test_bed.fail(FailureType::AdrAngleOfAttackErroneous(adiru_number));
            test_bed.run();

            for number in 1..=3 {
                let aoa = test_bed.angle_of_attack(number);
                assert_eq!(aoa.ssm(), SignStatus::NormalOperation);
                assert_about_eq!(
                    aoa.value().get::<degree>(),
                    if number == adiru_number { 13. } else { 3. },
                    0.0001
                );
            }
        }

        #[test]
        fn erroneous_airspeed_ends_when_the_failure_is_removed() {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(250.));
            test_bed.fail(FailureType::AdrAirspeedErroneous(1));
            test_bed.run();
            test_bed.unfail(FailureType::AdrAirspeedErroneous(1));
            test_bed.run();

            assert_about_eq!(
                test_bed.computed_airspeed(1).value().get::<knot>(),
                250.,
                0.01
            );
        }
    }

    mod ir {
        use super::*;
        use uom::si::angular_velocity::revolution_per_minute;

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn all_data_is_available_after_full_alignment_completed(#[case] adiru_number: usize) {
            let mut test_bed = test_bed_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Navigation);

            while test_bed.align_state(adiru_number) != AlignState::Aligned {
                // As the attitude and heading data will become available at some point, we're not checking it here.
                test_bed.assert_ir_non_attitude_data_available(false, adiru_number);
                test_bed.run();
            }

            test_bed = test_bed
                .then_continue_with()
                .true_airspeed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_TRUE_AIRSPEED_FOR_WIND_DETERMINATION_KNOTS + 0.01,
                ));
            test_bed.run();

            test_bed.assert_all_ir_data_available(true, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn data_is_no_longer_available_when_adiru_mode_selector_off(#[case] adiru_number: usize) {
            let mut test_bed =
                all_adirus_aligned_test_bed_with().true_airspeed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_TRUE_AIRSPEED_FOR_WIND_DETERMINATION_KNOTS + 0.01,
                ));
            test_bed.run();
            test_bed.assert_all_ir_data_available(true, adiru_number);

            test_bed = test_bed
                .then_continue_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Off);
            test_bed.run();
            test_bed.assert_all_ir_data_available(false, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn only_attitude_and_heading_data_is_available_when_adir_mode_selector_att(
            #[case] adiru_number: usize,
        ) {
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Attitude);
            test_bed.run();

            test_bed.assert_ir_attitude_data_available(true, adiru_number);
            test_bed.assert_ir_heading_data_available(true, adiru_number);
            test_bed.assert_ir_non_attitude_data_available(false, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn in_nav_mode_attitude_is_available_28_seconds_after_alignment_began(
            #[case] adiru_number: usize,
        ) {
            let mut test_bed = all_adirus_unaligned_test_bed_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Navigation);
            test_bed.run_without_delta();

            test_bed.run_with_delta(
                InertialReference::ATTITUDE_INITIALISATION_DURATION - Duration::from_millis(1),
            );
            test_bed.assert_ir_attitude_data_available(false, adiru_number);
            test_bed.assert_ir_heading_data_available(false, adiru_number);

            test_bed.run_with_delta(Duration::from_millis(1));
            test_bed.assert_ir_attitude_data_available(true, adiru_number);
            test_bed.assert_ir_heading_data_available(false, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn in_att_mode_attitude_and_heading_are_available_28_seconds_after_alignment_began(
            #[case] adiru_number: usize,
        ) {
            // Note that in reality the HDG part needs HDG entry through the MCDU. As we haven't implemented
            // that feature yet, for now we'll just make it available after 28 seconds in ATT mode.
            let mut test_bed = test_bed_with()
                .ir_mode_selector_set_to(adiru_number, InertialReferenceMode::Attitude);
            test_bed.run_without_delta();

            test_bed.run_with_delta(
                InertialReference::ATTITUDE_INITIALISATION_DURATION - Duration::from_millis(1),
            );
            test_bed.assert_ir_attitude_data_available(false, adiru_number);
            test_bed.assert_ir_heading_data_available(false, adiru_number);

            test_bed.run_with_delta(Duration::from_millis(1));
            test_bed.assert_ir_attitude_data_available(true, adiru_number);
            test_bed.assert_ir_heading_data_available(true, adiru_number);

            let maint_word_flags =
                IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
            assert_eq!(
                maint_word_flags.unwrap() & IrMaintFlags::REV_ATT_MODE,
                IrMaintFlags::REV_ATT_MODE
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn when_ir_push_button_off_data_is_not_available(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed_with().ir_push_button_off(adiru_number);
            test_bed.run();

            test_bed.assert_all_ir_data_available(false, adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn pitch_is_supplied_by_ir(#[case] adiru_number: usize) {
            let angle = Angle::new::<degree>(5.);
            let mut test_bed = all_adirus_aligned_test_bed_with().pitch_of(angle);
            test_bed.run();

            assert_eq!(test_bed.pitch(adiru_number).normal_value().unwrap(), -angle);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn roll_is_supplied_by_ir(#[case] adiru_number: usize) {
            let angle = Angle::new::<degree>(5.);
            let mut test_bed = all_adirus_aligned_test_bed_with().roll_of(angle);
            test_bed.run();

            assert_eq!(test_bed.roll(adiru_number).normal_value().unwrap(), -angle);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn body_roll_rate_is_supplied_by_ir(#[case] adiru_number: usize) {
            let rate = AngularVelocity::new::<revolution_per_minute>(5.);
            let mut test_bed = all_adirus_aligned_test_bed_with().body_roll_rate_of(rate);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .body_roll_rate(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<degree_per_second>(),
                -rate.get::<degree_per_second>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn body_pitch_rate_is_supplied_by_ir(#[case] adiru_number: usize) {
            let rate = AngularVelocity::new::<revolution_per_minute>(5.);
            let mut test_bed = all_adirus_aligned_test_bed_with().body_pitch_rate_of(rate);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .body_pitch_rate(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<radian_per_second>(),
                -rate.get::<radian_per_second>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn body_yaw_rate_is_supplied_by_ir(#[case] adiru_number: usize) {
            let rate = AngularVelocity::new::<revolution_per_minute>(5.);
            let mut test_bed = all_adirus_aligned_test_bed_with().body_yaw_rate_of(rate);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .body_yaw_rate(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<degree_per_second>(),
                rate.get::<degree_per_second>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn body_long_acc_is_supplied_by_ir(#[case] adiru_number: usize) {
            let acc = Acceleration::new::<meter_per_second_squared>(1.);
            let g = Acceleration::new::<meter_per_second_squared>(9.81);
            let pitch = Angle::new::<degree>(5.);
            let roll = Angle::new::<degree>(5.);
            let mut test_bed = all_adirus_aligned_test_bed().pitch_of(pitch).roll_of(roll);
            test_bed.set_long_acc(acc);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .body_long_acc(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<percent>(),
                (acc / g + test_bed.pitch(adiru_number).normal_value().unwrap().sin())
                    .get::<ratio>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn body_lat_acc_is_supplied_by_ir(#[case] adiru_number: usize) {
            let acc = Acceleration::new::<meter_per_second_squared>(1.);
            let g = Acceleration::new::<meter_per_second_squared>(9.81);
            let pitch = Angle::new::<degree>(5.);
            let roll = Angle::new::<degree>(5.);
            let mut test_bed = all_adirus_aligned_test_bed().pitch_of(pitch).roll_of(roll);
            test_bed.set_lat_acc(acc);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .body_lat_acc(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<percent>(),
                (acc / g
                    - test_bed.pitch(adiru_number).normal_value().unwrap().cos()
                        * test_bed.roll(adiru_number).normal_value().unwrap().sin())
                .get::<ratio>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn body_norm_acc_is_supplied_by_ir(#[case] adiru_number: usize) {
            let acc = Acceleration::new::<meter_per_second_squared>(1.);
            let g = Acceleration::new::<meter_per_second_squared>(9.81);
            let pitch = Angle::new::<degree>(5.);
            let roll = Angle::new::<degree>(5.);
            let mut test_bed = all_adirus_aligned_test_bed().pitch_of(pitch).roll_of(roll);
            test_bed.set_norm_acc(acc);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .body_normal_acc(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<percent>(),
                (acc / g
                    + test_bed.pitch(adiru_number).normal_value().unwrap().cos()
                        * test_bed.roll(adiru_number).normal_value().unwrap().cos())
                .get::<ratio>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn heading_is_supplied_by_ir(#[case] adiru_number: usize) {
            let angle = Angle::new::<degree>(160.);
            let mut test_bed = all_adirus_aligned_test_bed_with().heading_of(angle);
            test_bed.run();

            assert_eq!(
                test_bed.heading(adiru_number).normal_value().unwrap(),
                angle
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_heading_is_supplied_by_ir(#[case] adiru_number: usize) {
            let angle = Angle::new::<degree>(160.);
            let mut test_bed = all_adirus_aligned_test_bed_with().true_heading_of(angle);
            test_bed.run();

            assert_eq!(
                test_bed.true_heading(adiru_number).normal_value().unwrap(),
                angle
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_heading_is_normal_when_remaining_align_is_less_than_two_minutes(
            #[case] adiru_number: usize,
        ) {
            let mut test_bed = all_adirus_unaligned_test_bed_with()
                .realistic_navigation_align_until(adiru_number, Duration::from_millis(119999));

            assert!(test_bed.true_heading(adiru_number).is_normal_operation());
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_heading_is_not_normal_when_remaining_align_is_equal_to_two_minutes(
            #[case] adiru_number: usize,
        ) {
            let mut test_bed = all_adirus_unaligned_test_bed_with()
                .realistic_navigation_align_until(adiru_number, Duration::from_millis(120000));

            assert!(!test_bed.true_heading(adiru_number).is_normal_operation());
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn magnetic_heading_is_supplied_and_equal_to_true_heading_when_in_polar_region(
            #[case] adiru_number: usize,
        ) {
            let true_heading = Angle::new::<degree>(160.);
            let mag_heading = Angle::new::<degree>(142.);
            let polar_latitude = Angle::new::<degree>(83.);

            let mut test_bed = all_adirus_aligned_test_bed_with()
                .true_heading_of(true_heading)
                .heading_of(mag_heading)
                .latitude_of(polar_latitude);
            test_bed.run();

            assert!(test_bed.true_heading(adiru_number).is_normal_operation());
            assert!(test_bed.heading(adiru_number).is_normal_operation());
            assert_about_eq!(
                test_bed.true_heading(adiru_number).value().get::<degree>(),
                test_bed.heading(adiru_number).value().get::<degree>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn magnetic_heading_is_supplied_and_not_equal_to_true_heading_when_left_polar_region(
            #[case] adiru_number: usize,
        ) {
            let true_heading = Angle::new::<degree>(160.);
            let mag_heading = Angle::new::<degree>(142.);
            let polar_latitude = Angle::new::<degree>(83.);
            let non_polar_latitude = Angle::new::<degree>(80.);

            let mut test_bed = all_adirus_aligned_test_bed_with()
                .true_heading_of(true_heading)
                .heading_of(mag_heading)
                .latitude_of(polar_latitude);
            test_bed.run();

            test_bed.set_latitude(non_polar_latitude);
            test_bed.run();

            assert!(test_bed.true_heading(adiru_number).is_normal_operation());
            assert!(test_bed.heading(adiru_number).is_normal_operation());
            assert_about_eq!(
                test_bed.true_heading(adiru_number).value().get::<degree>(),
                true_heading.get::<degree>()
            );
            assert_about_eq!(
                test_bed.heading(adiru_number).value().get::<degree>(),
                mag_heading.get::<degree>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn extreme_latitude_flag_is_set_in_polar_region(#[case] adiru_number: usize) {
            let polar_latitude = Angle::new::<degree>(83.);

            let mut test_bed = all_adirus_aligned_test_bed_with().latitude_of(polar_latitude);
            test_bed.run();

            assert!(test_bed.maint_word(adiru_number).is_normal_operation());
            let maint_word_flags =
                IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
            assert_eq!(
                maint_word_flags.unwrap() & IrMaintFlags::EXTREME_LATITUDE,
                IrMaintFlags::EXTREME_LATITUDE
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn extreme_latitude_flag_is_unset_when_left_polar_region(#[case] adiru_number: usize) {
            let polar_latitude = Angle::new::<degree>(83.);
            let non_polar_latitude = Angle::new::<degree>(80.);

            let mut test_bed = all_adirus_aligned_test_bed_with().latitude_of(polar_latitude);
            test_bed.run();

            test_bed.set_latitude(non_polar_latitude);
            test_bed.run();

            assert!(test_bed.maint_word(adiru_number).is_normal_operation());
            let maint_word_flags =
                IrMaintFlags::from_bits(test_bed.maint_word(adiru_number).value());
            assert_eq!(
                maint_word_flags.unwrap() & IrMaintFlags::EXTREME_LATITUDE,
                IrMaintFlags::default()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn track_is_supplied_when_ground_speed_greater_than_or_equal_to_50_knots(
            #[case] adiru_number: usize,
        ) {
            let angle = Angle::new::<degree>(160.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .track_of(angle)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS,
                ));
            test_bed.run();

            assert_eq!(test_bed.track(adiru_number).normal_value().unwrap(), angle);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_track_is_supplied_when_ground_speed_greater_than_or_equal_to_50_knots(
            #[case] adiru_number: usize,
        ) {
            let angle = Angle::new::<degree>(160.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .true_track_of(angle)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS,
                ));
            test_bed.run();

            assert_eq!(
                test_bed.true_track(adiru_number).normal_value().unwrap(),
                angle
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn track_is_heading_when_ground_speed_less_than_50_knots(#[case] adiru_number: usize) {
            let angle = Angle::new::<degree>(160.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .heading_of(angle)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS - 0.01,
                ));
            test_bed.run();

            assert_eq!(test_bed.track(adiru_number).normal_value().unwrap(), angle);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn true_track_is_true_heading_when_ground_speed_less_than_50_knots(
            #[case] adiru_number: usize,
        ) {
            let angle = Angle::new::<degree>(160.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .true_heading_of(angle)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS - 0.01,
                ));
            test_bed.run();

            assert_eq!(
                test_bed.true_track(adiru_number).normal_value().unwrap(),
                angle
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn magnetic_track_is_supplied_and_equal_to_true_track_when_in_polar_region(
            #[case] adiru_number: usize,
        ) {
            let true_track = Angle::new::<degree>(160.);
            let mag_track = Angle::new::<degree>(142.);
            let polar_latitude = Angle::new::<degree>(83.);

            let mut test_bed = all_adirus_aligned_test_bed_with()
                .true_track_of(true_track)
                .track_of(mag_track)
                .latitude_of(polar_latitude);
            test_bed.run();

            assert!(test_bed.true_track(adiru_number).is_normal_operation());
            assert!(test_bed.track(adiru_number).is_normal_operation());
            assert_about_eq!(
                test_bed.true_track(adiru_number).value().get::<degree>(),
                test_bed.track(adiru_number).value().get::<degree>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn magnetic_track_is_supplied_and_not_equal_to_true_track_when_left_polar_region(
            #[case] adiru_number: usize,
        ) {
            let true_track = Angle::new::<degree>(160.);
            let mag_track = Angle::new::<degree>(142.);
            let polar_latitude = Angle::new::<degree>(83.);
            let non_polar_latitude = Angle::new::<degree>(80.);

            let mut test_bed = all_adirus_aligned_test_bed_with()
                .true_heading_of(true_track)
                .heading_of(mag_track)
                .latitude_of(polar_latitude);
            test_bed.run();

            test_bed.set_latitude(non_polar_latitude);
            test_bed.run();

            assert!(test_bed.true_track(adiru_number).is_normal_operation());
            assert!(test_bed.track(adiru_number).is_normal_operation());
            assert_about_eq!(
                test_bed.true_track(adiru_number).value().get::<degree>(),
                true_track.get::<degree>()
            );
            assert_about_eq!(
                test_bed.track(adiru_number).value().get::<degree>(),
                mag_track.get::<degree>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn drift_angle_is_supplied_when_ground_speed_greater_than_or_equal_to_50_knots(
            #[case] adiru_number: usize,
        ) {
            let heading = Angle::new::<degree>(160.);
            let track = Angle::new::<degree>(180.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .track_of(track)
                .heading_of(heading)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS,
                ));
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .drift_angle(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<degree>(),
                (track - heading).get::<degree>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn drift_angle_is_zero_when_ground_speed_less_than_50_knots(#[case] adiru_number: usize) {
            let heading = Angle::new::<degree>(160.);
            let track = Angle::new::<degree>(180.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .track_of(track)
                .and()
                .heading_of(heading)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS - 0.01,
                ));
            test_bed.run();

            assert_eq!(
                test_bed.drift_angle(adiru_number).normal_value().unwrap(),
                Angle::new::<degree>(0.)
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn flight_path_angle_is_supplied_when_ground_speed_greater_than_or_equal_to_50_knots(
            #[case] adiru_number: usize,
        ) {
            let vs = Velocity::new::<foot_per_minute>(500.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .inertial_vertical_speed_of(vs)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS,
                ));
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .flight_path_angle(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<degree>(),
                vs.atan2(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS,
                ))
                .get::<degree>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn flight_path_angle_is_zero_when_ground_speed_less_than_50_knots(
            #[case] adiru_number: usize,
        ) {
            let vs = Velocity::new::<foot_per_minute>(500.);
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .inertial_vertical_speed_of(vs)
                .and()
                .ground_speed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_GROUND_SPEED_FOR_TRACK_KNOTS - 0.01,
                ));
            test_bed.run();

            assert_eq!(
                test_bed.drift_angle(adiru_number).normal_value().unwrap(),
                Angle::new::<degree>(0.)
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn vertical_speed_is_supplied_by_ir(#[case] adiru_number: usize) {
            let vertical_speed = Velocity::new::<foot_per_minute>(300.);
            let mut test_bed =
                all_adirus_aligned_test_bed_with().inertial_vertical_speed_of(vertical_speed);
            test_bed.run();

            assert_eq!(
                test_bed
                    .inertial_vertical_speed(adiru_number)
                    .normal_value()
                    .unwrap(),
                vertical_speed
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn ground_speed_is_supplied_by_ir(#[case] adiru_number: usize) {
            let gs = Velocity::new::<knot>(200.);
            let mut test_bed = all_adirus_aligned_test_bed_with().ground_speed_of(gs);
            test_bed.run();

            assert_eq!(
                test_bed.ground_speed(adiru_number).normal_value().unwrap(),
                gs
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn wind_is_supplied_when_true_airspeed_greater_than_or_equal_to_100_knots(
            #[case] adiru_number: usize,
        ) {
            let wind_angle = Angle::new::<degree>(270.);
            let wind_speed = Velocity::new::<knot>(40.);

            let mut test_bed = all_adirus_aligned_test_bed_with().wind_of(wind_angle, wind_speed);
            test_bed.run();

            assert_about_eq!(
                test_bed
                    .wind_direction(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<degree>(),
                wind_angle.get::<degree>()
            );
            assert_about_eq!(
                test_bed
                    .wind_direction_bnr(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<degree>(),
                wind_angle.normalised_180().get::<degree>()
            );
            assert_about_eq!(
                test_bed
                    .wind_speed(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<knot>(),
                wind_speed.get::<knot>()
            );
            assert_about_eq!(
                test_bed
                    .wind_speed_bnr(adiru_number)
                    .normal_value()
                    .unwrap()
                    .get::<knot>(),
                wind_speed.get::<knot>()
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn wind_is_zero_when_true_airspeed_less_than_100_knots(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .wind_of(Angle::new::<degree>(150.), Velocity::new::<knot>(40.))
                .and()
                .true_airspeed_of(Velocity::new::<knot>(
                    InertialReference::MINIMUM_TRUE_AIRSPEED_FOR_WIND_DETERMINATION_KNOTS - 0.01,
                ));
            test_bed.run();

            test_bed.assert_wind_direction_and_velocity_zero(adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn wind_is_zero_when_true_airspeed_is_unavailable(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed_with()
                .wind_of(Angle::new::<degree>(150.), Velocity::new::<knot>(40.))
                .and()
                .adr_push_button_off(adiru_number);

            test_bed.run();

            test_bed.assert_wind_direction_and_velocity_zero(adiru_number);
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn latitude_is_supplied_by_ir(#[case] adiru_number: usize) {
            let latitude = Angle::new::<degree>(10.);
            let mut test_bed = all_adirus_aligned_test_bed_with().latitude_of(latitude);
            test_bed.run();

            assert_eq!(
                test_bed.latitude(adiru_number).normal_value().unwrap(),
                latitude
            );
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn longitude_is_supplied_by_ir(#[case] adiru_number: usize) {
            let longitude = Angle::new::<degree>(10.);
            let mut test_bed = all_adirus_aligned_test_bed_with().longitude_of(longitude);
            test_bed.run();

            assert_eq!(
                test_bed.longitude(adiru_number).normal_value().unwrap(),
                longitude
            );
        }
    }

    mod gps {
        use super::*;

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn discrete_output_speed_warning_1(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(95.));
            test_bed.run();

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_1()));

            test_bed.set_indicated_airspeed(Velocity::new::<knot>(105.));
            test_bed.run();
            assert!(test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_1()));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn discrete_output_speed_warning_2(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(45.));
            test_bed.run();

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_2()));

            test_bed.set_indicated_airspeed(Velocity::new::<knot>(55.));
            test_bed.run();
            assert!(test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_2()));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn discrete_output_speed_warning_3(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(150.));
            test_bed.run();

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_3()));

            test_bed.set_indicated_airspeed(Velocity::new::<knot>(160.));
            test_bed.run();
            assert!(test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_3()));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn discrete_output_speed_warning_4(#[case] adiru_number: usize) {
            let mut test_bed = all_adirus_aligned_test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(255.));
            test_bed.run();

            assert!(test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_4()));

            test_bed.set_indicated_airspeed(Velocity::new::<knot>(265.));
            test_bed.run();
            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_4()));
        }

        #[rstest]
        #[case(1)]
        #[case(2)]
        #[case(3)]
        fn discrete_output_speed_warnings_with_off_adir(#[case] adiru_number: usize) {
            let mut test_bed = test_bed();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(5.));
            test_bed.run();

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_1()));

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_2()));

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_3()));

            assert!(!test_bed.query(|a| a.adirs.adirus[adiru_number - 1].low_speed_warning_4()));
        }
    }
}
