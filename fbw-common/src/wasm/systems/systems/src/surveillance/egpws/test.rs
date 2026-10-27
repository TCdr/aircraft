use uom::si::{
    angle::degree,
    electric_potential::volt,
    f64::{
        Angle, AngularAcceleration, AngularVelocity, ElectricPotential, Frequency, Length,
        Pressure, Ratio, ThermodynamicTemperature, Velocity,
    },
    length::foot,
    ratio::ratio,
    velocity::{foot_per_minute, knot},
};

use crate::{
    electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        MachNumber, PotentialOrigin, PowerConsumptionReport,
    },
    simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, Read, SimulatorReader, StartState,
    },
};

use super::predictive::{
    GridCell, PredictiveVoice, TerrainAheadMessage, ThreatAreas, ThreatCell, ThreatLevel,
};
use super::terrain_grid::GridPosition;
use super::*;

struct TestRa {
    radio_altitude: Length,
    failed: bool,

    altitude_id: VariableIdentifier,
    terr_height_id: VariableIdentifier,
}
impl RadioAltimeter for TestRa {
    fn radio_altitude(&self) -> Arinc429Word<Length> {
        if self.failed {
            Arinc429Word::new(Length::default(), SignStatus::FailureWarning)
        } else if self.radio_altitude < Length::new::<foot>(-20.) {
            Arinc429Word::new(Length::new::<foot>(-20.), SignStatus::NoComputedData)
        } else if self.radio_altitude > Length::new::<foot>(8192.) {
            Arinc429Word::new(Length::new::<foot>(8192.), SignStatus::NoComputedData)
        } else {
            Arinc429Word::new(self.radio_altitude, SignStatus::NormalOperation)
        }
    }
}
impl TestRa {
    const ALTITUDE_KEY: &str = "TEST_RA_RADIO_ALTITUDE";
    const TERRAIN_HEIGHT_KEY: &str = "TEST_RA_TERRAIN_HEIGHT";

    fn new(context: &mut InitContext, radio_altitude: Length) -> Self {
        Self {
            radio_altitude,
            failed: false,

            altitude_id: context.get_identifier(Self::ALTITUDE_KEY.to_owned()),
            terr_height_id: context.get_identifier(Self::TERRAIN_HEIGHT_KEY.to_owned()),
        }
    }

    fn set_failed(&mut self, failed: bool) {
        self.failed = failed;
    }
}
impl SimulationElement for TestRa {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.radio_altitude = Read::<Length>::read(reader, &self.altitude_id)
            - Read::<Length>::read(reader, &self.terr_height_id);
    }
}

struct TestAdiru {
    computed_airspeed: Velocity,
    altitude: Length,
    vertical_speed: Velocity,
    pitch: Angle,
    adr_ssm: SignStatus,
    ir_ssm: SignStatus,

    altitude_id: VariableIdentifier,
    vertical_speed_id: VariableIdentifier,
    cas_id: VariableIdentifier,
    pitch_id: VariableIdentifier,
}
impl TestAdiru {
    const VERTICAL_SPEED_KEY: &str = "VERTICAL_SPEED";
    const CAS_KEY: &str = "COMPUTED_AIRSPEED";
    const PITCH_ANGLE_KEY: &str = "PITCH_ANGLE";

    fn new(context: &mut InitContext) -> Self {
        Self {
            computed_airspeed: Velocity::default(),
            altitude: Length::default(),
            vertical_speed: Velocity::default(),
            pitch: Angle::default(),
            ir_ssm: SignStatus::NormalOperation,
            adr_ssm: SignStatus::NormalOperation,

            altitude_id: context.get_identifier(TestRa::ALTITUDE_KEY.to_owned()),
            vertical_speed_id: context.get_identifier(Self::VERTICAL_SPEED_KEY.to_owned()),
            cas_id: context.get_identifier(Self::CAS_KEY.to_owned()),
            pitch_id: context.get_identifier(Self::PITCH_ANGLE_KEY.to_owned()),
        }
    }

    fn set_failed_ir(&mut self, failed: bool) {
        self.ir_ssm = if failed {
            SignStatus::FailureWarning
        } else {
            SignStatus::NormalOperation
        };
    }

    fn set_failed_adr(&mut self, failed: bool) {
        self.adr_ssm = if failed {
            SignStatus::FailureWarning
        } else {
            SignStatus::NormalOperation
        };
    }
}
impl AirDataReferenceBus for TestAdiru {
    fn standard_altitude(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(self.altitude, self.adr_ssm)
    }
    fn baro_corrected_altitude_1(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(self.altitude, self.adr_ssm)
    }
    fn mach(&self) -> Arinc429Word<MachNumber> {
        Arinc429Word::new(MachNumber::default(), self.adr_ssm)
    }
    fn computed_airspeed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.computed_airspeed, self.adr_ssm)
    }
    fn max_allowable_airspeed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(Velocity::default(), self.adr_ssm)
    }
    fn true_airspeed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.computed_airspeed, self.adr_ssm)
    }
    fn total_air_temperature(&self) -> Arinc429Word<ThermodynamicTemperature> {
        Arinc429Word::new(ThermodynamicTemperature::default(), self.adr_ssm)
    }
    fn vertical_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.vertical_speed, self.adr_ssm)
    }
    fn static_air_temperature(&self) -> Arinc429Word<ThermodynamicTemperature> {
        Arinc429Word::new(ThermodynamicTemperature::default(), self.adr_ssm)
    }
    fn baro_corrected_altitude_2(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(self.altitude, self.adr_ssm)
    }
    fn baro_correction_1(&self) -> Arinc429Word<Pressure> {
        Arinc429Word::new(Pressure::default(), self.adr_ssm)
    }
    fn baro_correction_2(&self) -> Arinc429Word<Pressure> {
        Arinc429Word::new(Pressure::default(), self.adr_ssm)
    }
    fn corrected_angle_of_attack(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.adr_ssm)
    }
}
impl InertialReferenceBus for TestAdiru {
    /// Label 052
    fn pitch_angular_acc(&self) -> Arinc429Word<AngularAcceleration> {
        Arinc429Word::new(AngularAcceleration::default(), self.ir_ssm)
    }
    /// Label 053
    fn roll_angular_acc(&self) -> Arinc429Word<AngularAcceleration> {
        Arinc429Word::new(AngularAcceleration::default(), self.ir_ssm)
    }
    /// Label 053
    fn yaw_angular_acc(&self) -> Arinc429Word<AngularAcceleration> {
        Arinc429Word::new(AngularAcceleration::default(), self.ir_ssm)
    }
    /// Label 310
    fn ppos_latitude(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 311
    fn ppos_longitude(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 312
    fn ground_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(Velocity::default(), self.ir_ssm)
    }
    /// Label 313
    fn true_heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 314
    fn true_track(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 315
    fn wind_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(Velocity::default(), self.ir_ssm)
    }
    /// Label 316
    fn wind_dir_true(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 317
    fn magnetic_track(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 320
    fn magnetic_heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 321
    fn drift_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 322
    fn flight_path_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 323
    fn flight_path_accel(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(Ratio::default(), self.ir_ssm)
    }
    /// Label 324
    fn pitch_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.pitch, self.ir_ssm)
    }
    /// Label 325
    fn roll_angle(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(Angle::default(), self.ir_ssm)
    }
    /// Label 326
    fn body_pitch_rate(&self) -> Arinc429Word<AngularVelocity> {
        Arinc429Word::new(AngularVelocity::default(), self.ir_ssm)
    }
    /// Label 327
    fn body_roll_rate(&self) -> Arinc429Word<AngularVelocity> {
        Arinc429Word::new(AngularVelocity::default(), self.ir_ssm)
    }
    /// Label 330
    fn body_yaw_rate(&self) -> Arinc429Word<AngularVelocity> {
        Arinc429Word::new(AngularVelocity::default(), self.ir_ssm)
    }
    /// Label 331
    fn body_long_acc(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(Ratio::default(), self.ir_ssm)
    }
    /// Label 332
    fn body_lat_acc(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(Ratio::default(), self.ir_ssm)
    }
    /// Label 333
    fn body_normal_acc(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(Ratio::default(), self.ir_ssm)
    }
    /// Label 361
    fn inertial_altitude(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(self.altitude, self.ir_ssm)
    }
    /// Label 365
    fn inertial_vertical_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.vertical_speed, self.ir_ssm)
    }

    /// Label 270
    fn discrete_word_1(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0u32, self.ir_ssm)
    }
    /// Label 275
    fn discrete_word_2(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0u32, self.ir_ssm)
    }
    /// Label 276
    fn discrete_word_3(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0u32, self.ir_ssm)
    }
}
impl SimulationElement for TestAdiru {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.altitude = reader.read(&self.altitude_id);
        self.vertical_speed = reader.read(&self.vertical_speed_id);
        self.computed_airspeed = reader.read(&self.cas_id);
        self.pitch = reader.read(&self.pitch_id);
    }
}

struct TestIls {
    has_glideslope: bool,
    glideslope_deviation: Ratio,
    has_localizer: bool,
    localizer_deviation: Ratio,
    failed: bool,
}
impl TestIls {
    fn new() -> Self {
        Self {
            has_glideslope: false,
            glideslope_deviation: Ratio::default(),
            has_localizer: false,
            localizer_deviation: Ratio::default(),
            failed: false,
        }
    }

    fn set_failed(&mut self, failed: bool) {
        self.failed = failed;
    }

    fn set_gs_deviation(&mut self, deviation: Option<Ratio>) {
        if let Some(dev) = deviation {
            self.has_glideslope = true;
            self.glideslope_deviation = dev;
        } else {
            self.has_glideslope = false;
            self.glideslope_deviation = Ratio::default();
        }
    }

    /// A glideslope word that carries a deviation but is flagged no computed data
    fn set_gs_deviation_without_data(&mut self, deviation: Ratio) {
        self.has_glideslope = false;
        self.glideslope_deviation = deviation;
    }

    fn set_loc_deviation(&mut self, deviation: Option<Ratio>) {
        if let Some(dev) = deviation {
            self.has_localizer = true;
            self.localizer_deviation = dev;
        } else {
            self.has_localizer = false;
            self.localizer_deviation = Ratio::default();
        }
    }
}
impl InstrumentLandingSystemBus for TestIls {
    fn glideslope_deviation(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.glideslope_deviation,
            if self.failed {
                SignStatus::FailureWarning
            } else if self.has_glideslope {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            },
        )
    }
    fn localizer_deviation(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.localizer_deviation,
            if self.failed {
                SignStatus::FailureWarning
            } else if self.has_localizer {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            },
        )
    }
    fn runway_heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(
            Angle::default(),
            if self.failed {
                SignStatus::FailureWarning
            } else {
                SignStatus::NormalOperation
            },
        )
    }
    fn ils_frequency(&self) -> Arinc429Word<uom::si::f64::Frequency> {
        Arinc429Word::new(Frequency::default(), SignStatus::NormalOperation)
    }
    fn ground_station_ident_1(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0u32, SignStatus::NormalOperation)
    }
    fn ground_station_ident_2(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0u32, SignStatus::NormalOperation)
    }
}

struct TestElectricalHarness {
    discrete_inputs: TerrainAwarenessWarningSystemDiscreteInputs,
}
impl TestElectricalHarness {
    pub fn new() -> Self {
        Self {
            discrete_inputs: TerrainAwarenessWarningSystemDiscreteInputs::default(),
        }
    }

    fn set_sys_button_pressed(&mut self, pressed: bool) {
        self.discrete_inputs.gpws_inhibit = pressed;
    }

    fn set_gs_mode_button_pressed(&mut self, pressed: bool) {
        self.discrete_inputs.glideslope_inhibit = pressed;
    }

    fn set_gs_cancel_self_test_pressed(&mut self, pressed: bool) {
        self.discrete_inputs.gs_cancel = pressed;
        self.discrete_inputs.self_test = pressed;
    }

    fn set_landing_flaps_extended(&mut self, extended: bool) {
        self.discrete_inputs.landing_flaps = extended;
    }

    fn set_gear_extended(&mut self, extended: bool) {
        self.discrete_inputs.landing_gear_downlocked = extended;
    }
}
impl EgpwsElectricalHarness for TestElectricalHarness {
    fn discrete_inputs(&self) -> &TerrainAwarenessWarningSystemDiscreteInputs {
        &self.discrete_inputs
    }
}

struct TestAircraft {
    electricity_source: TestElectricitySource,
    ac_1_bus: ElectricalBus,
    ra: TestRa,
    adiru: TestAdiru,
    ils: TestIls,
    egpws_electrical_harness: TestElectricalHarness,
    egpwc: EnhancedGroundProximityWarningComputer,
    is_ac_1_powered: bool,
    power_consumption: Power,
}
impl TestAircraft {
    fn new_with_pin_programming(
        context: &mut InitContext,
        pin_programming: EnhancedGroundProximityWarningComputerPinProgramming,
    ) -> Self {
        Self {
            electricity_source: TestElectricitySource::powered(
                context,
                PotentialOrigin::EngineGenerator(1),
            ),
            ac_1_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
            ra: TestRa::new(context, Length::new::<foot>(0.0)),
            adiru: TestAdiru::new(context),
            ils: TestIls::new(),
            egpws_electrical_harness: TestElectricalHarness::new(),
            egpwc: EnhancedGroundProximityWarningComputer::new_with_pin_programming(
                context,
                ElectricalBusType::AlternatingCurrent(1),
                pin_programming,
            ),
            is_ac_1_powered: false,
            power_consumption: Power::new::<watt>(0.),
        }
    }

    fn set_ac_1_power(&mut self, is_powered: bool) {
        self.is_ac_1_powered = is_powered;
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

        if self.is_ac_1_powered {
            electricity.flow(&self.electricity_source, &self.ac_1_bus);
        }
    }

    fn update_after_power_distribution(&mut self, context: &UpdateContext) {
        self.egpwc.update(
            context,
            &self.egpws_electrical_harness,
            &self.ra,
            &self.ra,
            &self.adiru,
            &self.adiru,
            &self.ils,
        );
    }
}
impl SimulationElement for TestAircraft {
    fn process_power_consumption_report<T: PowerConsumptionReport>(
        &mut self,
        _: &UpdateContext,
        report: &T,
    ) {
        self.power_consumption = report.total_consumption_of(PotentialOrigin::EngineGenerator(1));
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.adiru.accept(visitor);
        self.ra.accept(visitor);
        self.egpwc.accept(visitor);

        visitor.visit(self);
    }
}

struct EgpwcTestBed {
    test_bed: SimulationTestBed<TestAircraft>,
}
impl EgpwcTestBed {
    fn new() -> Self {
        Self::new_with_pin_programming(
            EnhancedGroundProximityWarningComputerPinProgramming::default(),
        )
    }

    fn new_with_pin_programming(
        pin_programming: EnhancedGroundProximityWarningComputerPinProgramming,
    ) -> Self {
        let mut test_bed = Self {
            test_bed: SimulationTestBed::new_with_start_state(StartState::Cruise, |context| {
                TestAircraft::new_with_pin_programming(context, pin_programming)
            }),
        };
        test_bed = test_bed.on_ground().powered().flaps_extended(false);

        test_bed
    }

    fn and(self) -> Self {
        self
    }

    fn no_power(mut self) -> Self {
        self.command(|a| a.set_ac_1_power(false));
        self
    }

    fn powered(mut self) -> Self {
        self.command(|a| a.set_ac_1_power(true));
        self
    }

    fn on_ground(mut self) -> Self {
        let terr_height = ReadByName::<EgpwcTestBed, Length>::read_by_name(
            &mut self,
            EnhancedGroundProximityWarningComputer::AURAL_OUTPUT_KEY,
        );
        self.altitude_of(terr_height).gear_extended(true)
    }

    fn altitude_of(mut self, height: Length) -> Self {
        self.write_by_name(TestRa::ALTITUDE_KEY, height);
        self
    }

    fn terrain_height_of(mut self, height: Length) -> Self {
        self.write_by_name(TestRa::TERRAIN_HEIGHT_KEY, height);
        self
    }

    fn vertical_speed_of(mut self, vs: Velocity) -> Self {
        self.write_by_name(TestAdiru::VERTICAL_SPEED_KEY, vs);
        self
    }

    fn cas_of(mut self, vs: Velocity) -> Self {
        self.write_by_name(TestAdiru::CAS_KEY, vs);
        self
    }

    fn pitch_of(mut self, pitch: Angle) -> Self {
        self.write_by_name(TestAdiru::PITCH_ANGLE_KEY, pitch);
        self
    }

    fn gs_deviation_without_data_of(mut self, deviation: Ratio) -> Self {
        self.command(|a| a.ils.set_gs_deviation_without_data(deviation));
        self
    }

    fn gs_deviation_of(mut self, deviation: Option<Ratio>) -> Self {
        self.command(|a| a.ils.set_gs_deviation(deviation));
        self
    }

    fn loc_deviation_of(mut self, deviation: Option<Ratio>) -> Self {
        self.command(|a| a.ils.set_loc_deviation(deviation));
        self
    }

    fn gear_extended(mut self, extended: bool) -> Self {
        self.command(|a| a.egpws_electrical_harness.set_gear_extended(extended));
        self
    }

    fn gs_mode_button_pressed(mut self, pressed: bool) -> Self {
        self.command(|a| {
            a.egpws_electrical_harness
                .set_gs_mode_button_pressed(pressed)
        });
        self
    }

    fn gpws_sys_button_pressed(mut self, pressed: bool) -> Self {
        self.command(|a| a.egpws_electrical_harness.set_sys_button_pressed(pressed));
        self
    }

    fn gpws_gs_cancel_self_test_pressed(mut self, pressed: bool) -> Self {
        self.command(|a| {
            a.egpws_electrical_harness
                .set_gs_cancel_self_test_pressed(pressed)
        });
        self
    }

    fn flaps_extended(mut self, extended: bool) -> Self {
        self.command(|a| {
            a.egpws_electrical_harness
                .set_landing_flaps_extended(extended)
        });
        self
    }

    fn predictive_functions(mut self, status: PredictiveFunctionsStatus) -> Self {
        self.command(|a| a.egpwc.set_predictive_functions_status(status));
        self
    }

    fn set_ra_failure(&mut self, failed: bool) {
        self.command(|a| a.ra.set_failed(failed));
    }

    fn set_ils_failure(&mut self, failed: bool) {
        self.command(|a| a.ils.set_failed(failed));
    }

    fn set_adr_failure(&mut self, failed: bool) {
        self.command(|a| a.adiru.set_failed_adr(failed));
    }

    fn set_ir_failure(&mut self, failed: bool) {
        self.command(|a| a.adiru.set_failed_ir(failed));
    }

    fn get_aural_warning(&mut self) -> u8 {
        ReadByName::<EgpwcTestBed, u8>::read_by_name(
            self,
            EnhancedGroundProximityWarningComputer::AURAL_OUTPUT_KEY,
        )
    }

    fn get_audio_on(&self) -> bool {
        self.query(|ac: &TestAircraft| ac.egpwc.discrete_outputs().audio_on)
    }

    fn is_warning_light_on(&mut self) -> bool {
        self.query(|ac: &TestAircraft| ac.egpwc.discrete_outputs().warning_lamp)
    }

    fn is_alert_light_on(&mut self) -> bool {
        self.query(|ac: &TestAircraft| ac.egpwc.discrete_outputs().alert_lamp)
    }

    fn egpws_sys_fault(&mut self) -> bool {
        self.query(|ac: &TestAircraft| ac.egpwc.discrete_outputs().gpws_inop)
    }

    #[allow(dead_code)]
    fn egpws_terr_fault(&mut self) -> bool {
        self.query(|ac: &TestAircraft| ac.egpwc.discrete_outputs().terrain_inop)
    }

    fn assert_no_warning_active(&mut self) {
        assert!(!self.get_audio_on());
        assert_eq!(self.get_aural_warning(), AuralWarning::None as u8);
        assert!(!self.is_warning_light_on());
        assert!(!self.is_alert_light_on());
    }
}
impl TestBed for EgpwcTestBed {
    type Aircraft = TestAircraft;

    fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
        &self.test_bed
    }

    fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
        &mut self.test_bed
    }
}

/// What the pilots see and hear at one step of an approach to the terrain.
struct Observation {
    radio_height_ft: f64,
    aural: u8,
    warning_lamp: bool,
    alert_lamp: bool,
}

/// Raises the terrain below an aircraft that stays at a constant altitude, so the radio height decreases at a
/// constant closure rate, in steps of 100 ms. The test bed starts the approach settled at the start radio height.
fn close_in_on_terrain(
    test_bed: &mut EgpwcTestBed,
    altitude_ft: f64,
    start_radio_height_ft: f64,
    closure_rate_fpm: f64,
    end_radio_height_ft: f64,
) -> Vec<Observation> {
    const STEP: Duration = Duration::from_millis(100);

    let set_radio_height = |test_bed: &mut EgpwcTestBed, radio_height_ft: f64| {
        test_bed.write_by_name(
            TestRa::TERRAIN_HEIGHT_KEY,
            Length::new::<foot>(altitude_ft - radio_height_ft),
        );
    };

    // The radio height the unit uses follows a jump of the terrain at a limited rate, give it the time to settle
    set_radio_height(test_bed, start_radio_height_ft);
    for _ in 0..60 {
        test_bed.run_with_delta(Duration::from_millis(1_000));
    }

    let feet_per_step = closure_rate_fpm / 60. * STEP.as_secs_f64();
    let mut radio_height_ft = start_radio_height_ft;
    let mut observations = Vec::new();
    while radio_height_ft > end_radio_height_ft {
        radio_height_ft -= feet_per_step;
        set_radio_height(test_bed, radio_height_ft);
        test_bed.run_with_delta(STEP);
        observations.push(Observation {
            radio_height_ft,
            aural: test_bed.get_aural_warning(),
            warning_lamp: test_bed.is_warning_light_on(),
            alert_lamp: test_bed.is_alert_light_on(),
        });
    }

    observations
}

fn first_radio_height_with_aural(observations: &[Observation], aural: AuralWarning) -> Option<f64> {
    observations
        .iter()
        .find(|observation| observation.aural == aural as u8)
        .map(|observation| observation.radio_height_ft)
}

/// The aural alerts in the order they were heard, each one once.
fn aural_sequence(observations: &[Observation]) -> Vec<u8> {
    let mut sequence: Vec<u8> = Vec::new();
    for observation in observations {
        if sequence.last() != Some(&observation.aural) {
            sequence.push(observation.aural);
        }
    }
    sequence
}

/// An airborne test bed in mode 2A (landing flaps not selected), long enough after takeoff for mode 2B to be off.
fn mode_2a_test_bed(altitude_ft: f64, airspeed_kt: f64) -> EgpwcTestBed {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(altitude_ft))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(airspeed_kt))
        .and()
        .powered();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.run_with_delta(Duration::from_millis(70_000));
    test_bed
}

/// An airborne test bed with the gear down and landing flaps: mode 2B with TERRAIN as the only alert.
fn mode_2b_landing_configuration_test_bed(altitude_ft: f64) -> EgpwcTestBed {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(altitude_ft))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(150.))
        .flaps_extended(true)
        .gear_extended(true)
        .and()
        .powered();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.run_with_delta(Duration::from_millis(70_000));
    test_bed
}

fn test_bed() -> EgpwcTestBed {
    EgpwcTestBed::new()
}

fn test_bed_with() -> EgpwcTestBed {
    test_bed()
}

#[test]
fn self_tests_after_power_loss_on_ground_and_emits_no_warnings() {
    let mut test_bed = test_bed_with().on_ground().and().powered();
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    let mut test_bed = test_bed.no_power();
    test_bed.run_with_delta(Duration::from_millis(500));
    assert!(test_bed.egpws_sys_fault());
    let mut test_bed = test_bed.powered();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.egpws_sys_fault());
    test_bed.run_with_delta(Duration::from_millis(20_000));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();
}

#[test]
fn emits_failure_when_ra_is_failed() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2500.0))
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1));

    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_ra_failure(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_ra_failure(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();
}

#[test]
fn emits_failure_when_adr_is_failed() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2500.0))
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1));

    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_adr_failure(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_adr_failure(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();
}

#[test]
fn emits_no_sys_failure_when_ir_is_failed() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2500.0))
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1));

    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_ir_failure(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_ir_failure(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();
}

#[test]
fn emits_no_failure_when_ils_is_failed_in_air() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2500.0))
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1));

    test_bed.set_ils_failure(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_ils_failure(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();
}

#[test]
fn emits_failure_when_ils_is_failed_on_ground() {
    let mut test_bed = test_bed_with().on_ground().and().powered();

    test_bed.run_with_delta(Duration::from_millis(1));

    test_bed.set_ils_failure(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();

    test_bed.set_ils_failure(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(!test_bed.egpws_sys_fault());
    test_bed.assert_no_warning_active();
}

#[test]
fn mode_1_test() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(1500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(250.))
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();

    // Inside of alert area
    test_bed = test_bed.vertical_speed_of(Velocity::new::<foot_per_minute>(-4000.0));
    test_bed.run_with_delta(Duration::from_millis(1));
    // Confirm time not elapsed
    test_bed.assert_no_warning_active();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::SinkRate as u8); // Emission pattern depends on audio declutter active
    assert!(test_bed.is_alert_light_on());
    assert!(!test_bed.is_warning_light_on());

    // Inside Warning area
    test_bed = test_bed.vertical_speed_of(Velocity::new::<foot_per_minute>(-5000.0));
    test_bed.run_with_delta(Duration::from_millis(1_700));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());

    // Warning immediately ceases with GPWS SYS OFF pressed
    test_bed = test_bed.gpws_sys_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();

    // Warning immediately restarts with GPWS SYS OFF no longer pressed
    test_bed = test_bed.gpws_sys_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());

    // Exiting warning area
    test_bed = test_bed.vertical_speed_of(Velocity::new::<foot_per_minute>(-1000.0));
    test_bed.run_with_delta(Duration::from_millis(100));

    // Confirm time not elapsed
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());

    test_bed.run_with_delta(Duration::from_millis(200));
    test_bed.assert_no_warning_active();
}

/// The PULL UP lamp lights for the second boundary of mode 1 only, the amber GPWS lamp for the first one (SINK RATE).
#[test]
fn mode_1_lamps_are_pull_up_for_second_boundary_and_amber_for_first() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(1500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(250.))
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.vertical_speed_of(Velocity::new::<foot_per_minute>(-4000.0));
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::SinkRate as u8);
    assert!(!test_bed.is_warning_light_on());
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.vertical_speed_of(Velocity::new::<foot_per_minute>(-5000.0));
    test_bed.run_with_delta(Duration::from_millis(1_700));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());
}

#[test]
fn mode_1_sink_rate_boundary_ends_at_2450_ft_radio_height() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2460.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-5100.0))
        .cas_of(Velocity::new::<knot>(250.))
        .and()
        .powered();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(2400.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::SinkRate as u8);
}

#[test]
fn mode_1_ignores_300_fpm_of_descent_above_the_beam_only_with_the_audio_declutter() {
    // 2900 fpm alerts at 1100 ft, 2600 fpm (the descent rate with the bias) does not
    let above_beam = Some(Ratio::new::<ratio>(0.175));
    let descent = Velocity::new::<foot_per_minute>(-2900.0);

    let mut with_declutter = test_bed_with()
        .altitude_of(Length::new::<foot>(1100.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(descent)
        .cas_of(Velocity::new::<knot>(250.))
        .gs_deviation_of(above_beam)
        .and()
        .powered();
    with_declutter.run_with_delta(Duration::from_millis(2_000));
    assert_eq!(with_declutter.get_aural_warning(), AuralWarning::None as u8);

    let mut without_declutter = EgpwcTestBed::new_with_pin_programming(
        EnhancedGroundProximityWarningComputerPinProgramming {
            audio_declutter_disable: true,
        },
    )
    .altitude_of(Length::new::<foot>(1100.0))
    .terrain_height_of(Length::new::<foot>(0.0))
    .vertical_speed_of(descent)
    .cas_of(Velocity::new::<knot>(250.))
    .gs_deviation_of(above_beam)
    .and()
    .powered();
    without_declutter.run_with_delta(Duration::from_millis(2_000));
    assert_eq!(
        without_declutter.get_aural_warning(),
        AuralWarning::SinkRate as u8
    );
}

#[test]
fn mode_1_does_not_ignore_descent_for_a_glideslope_deviation_that_is_not_valid() {
    // The word is flagged no computed data but still carries 2 dots above the beam: the bias must not use it
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(1100.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-2900.0))
        .cas_of(Velocity::new::<knot>(250.))
        .gs_deviation_without_data_of(Ratio::new::<ratio>(0.175))
        .and()
        .powered();
    test_bed.run_with_delta(Duration::from_millis(2_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::SinkRate as u8);
}

#[test]
fn mode_2_a_test() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(310.0))
        .and()
        .powered();

    // Step 71s, since Mode 4B is active for 60s after takeoff and flight mode is activated 10s after above 30ft RA
    // since pitch angle is not set above for immediate switching to occur.
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.run_with_delta(Duration::from_millis(70_000));
    test_bed.assert_no_warning_active();

    // Terrain rises
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1000.0));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8); // Emission pattern depends on audio declutter active
    assert!(test_bed.is_alert_light_on());

    // Warning immediately ceases with GPWS SYS OFF pressed
    test_bed = test_bed.gpws_sys_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();

    // Warning immediately restarts with GPWS SYS OFF no longer pressed
    test_bed = test_bed.gpws_sys_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8);
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.cas_of(Velocity::new::<knot>(230.0));
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1125.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));

    // Closure rate still 7500 ft/min, now at 1000 ft RA
    test_bed = test_bed.cas_of(Velocity::new::<knot>(230.0));
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1500.0));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8);
    assert!(test_bed.is_alert_light_on());

    // After two emissions of TERRAIN (ca. 2s), it will switch to PULL UP. Now closure rate is 2400 ft/min, at 800 ft RA
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1700.0));
    test_bed.run_with_delta(Duration::from_millis(5_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());

    // Exiting warning area due to lowering terrain. Now at 1000ft, since otherwise the Mode 4 warning would trigger.
    // FCOM DSC-34-SURV-40-20: after leaving the warning conditions "TERRAIN" is repeated and the PULL UP red lights
    // stay on (altitude gain hold).
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1500.0));
    test_bed.run_with_delta(Duration::from_millis(2_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8);
    assert!(test_bed.is_warning_light_on());

    // The hold ends once the aircraft has gained 300 ft.
    test_bed = test_bed.altitude_of(Length::new::<foot>(2_810.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();
}

#[test]
fn mode_2_a_terrain_hold_after_pull_up_ends_after_45_s_without_altitude_gain() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(2500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(310.0))
        .and()
        .powered();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.run_with_delta(Duration::from_millis(70_000));
    test_bed.assert_no_warning_active();

    // Closure rate into the envelope: TERRAIN TERRAIN, then PULL UP (same profile as mode_2_a_test).
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1000.0));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8);
    test_bed = test_bed.cas_of(Velocity::new::<knot>(230.0));
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1125.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1500.0));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1700.0));
    test_bed.run_with_delta(Duration::from_millis(5_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());

    // Out of the envelope, no altitude gain: TERRAIN and the PULL UP light are held...
    test_bed = test_bed.terrain_height_of(Length::new::<foot>(1500.0));
    for _ in 0..40 {
        test_bed.run_with_delta(Duration::from_millis(1_000));
    }
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8);
    assert!(test_bed.is_warning_light_on());

    // ...for at most 45 s.
    for _ in 0..7 {
        test_bed.run_with_delta(Duration::from_millis(1_000));
    }
    test_bed.assert_no_warning_active();
}

#[test]
fn mode_2_b_ceiling_falls_with_the_closure_rate() {
    let mut test_bed = mode_2b_landing_configuration_test_bed(3_000.);

    let observations = close_in_on_terrain(&mut test_bed, 3_000., 2_000., 10_000., 60.);

    // At the highest closure rate the envelope reaches only about 235 ft, plus the outline of the caution.
    let first_alert = first_radio_height_with_aural(&observations, AuralWarning::Terrain)
        .expect("TERRAIN is said");
    assert!((300.0..=345.0).contains(&first_alert), "{first_alert}");

    // Landing configuration: TERRAIN is the only alert, with the amber lamp
    assert!(observations
        .iter()
        .filter(|o| o.aural != AuralWarning::None as u8)
        .all(|o| o.aural == AuralWarning::Terrain as u8 && o.alert_lamp && !o.warning_lamp));
}

#[test]
fn mode_2_b_ceiling_peaks_near_3000_fpm() {
    let mut test_bed = mode_2b_landing_configuration_test_bed(3_000.);

    let observations = close_in_on_terrain(&mut test_bed, 3_000., 1_500., 3_000., 100.);

    // About 875 ft for the warning envelope plus the outline of the caution (previously a flat 789 ft)
    let first_alert = first_radio_height_with_aural(&observations, AuralWarning::Terrain)
        .expect("TERRAIN is said");
    assert!((930.0..=990.0).contains(&first_alert), "{first_alert}");
}

#[test]
fn mode_2_b_does_not_depend_on_the_descent_rate() {
    let mut test_bed = mode_2b_landing_configuration_test_bed(3_000.)
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-1000.));

    let observations = close_in_on_terrain(&mut test_bed, 3_000., 1_500., 3_500., 130.);

    // A descent rate does not raise the lower edge of the envelope (it used to, to 600 ft at 1000 fpm)
    let at_300_ft = observations
        .iter()
        .find(|o| o.radio_height_ft < 300.)
        .expect("reached 300 ft");
    assert_eq!(at_300_ft.aural, AuralWarning::Terrain as u8);
}

#[test]
fn mode_2_b_does_not_alert_below_its_floor() {
    let mut test_bed = mode_2b_landing_configuration_test_bed(3_000.);

    let observations = close_in_on_terrain(&mut test_bed, 3_000., 600., 4_000., 20.);

    let below_floor = observations
        .iter()
        .find(|o| o.radio_height_ft < 110.)
        .expect("reached 110 ft");
    assert_eq!(below_floor.aural, AuralWarning::None as u8);
}

#[test]
fn mode_2_a_caution_ceiling_grows_with_the_airspeed_but_not_the_warning_one() {
    for (airspeed_kt, expected_caution_ceiling_ft) in [(220., 1_650.), (310., 2_040.)] {
        let mut test_bed = mode_2a_test_bed(6_000., airspeed_kt);

        let observations = close_in_on_terrain(&mut test_bed, 6_000., 4_500., 10_000., 700.);

        let first_terrain = first_radio_height_with_aural(&observations, AuralWarning::Terrain)
            .expect("TERRAIN is said");
        assert!(
            (expected_caution_ceiling_ft - 40.0..=expected_caution_ceiling_ft + 10.0)
                .contains(&first_terrain),
            "{airspeed_kt} kt: {first_terrain}"
        );

        // PULL UP comes from the inner envelope, 1650 ft at every airspeed, after TERRAIN, TERRAIN
        let first_pull_up = first_radio_height_with_aural(&observations, AuralWarning::PullUp)
            .expect("PULL UP is said");
        assert!(first_pull_up < 1_650., "{airspeed_kt} kt: {first_pull_up}");
    }
}

#[test]
fn mode_2_a_says_terrain_terrain_with_the_amber_lamp_before_pull_up_with_the_red_lamp() {
    let mut test_bed = mode_2a_test_bed(6_000., 310.);

    let observations = close_in_on_terrain(&mut test_bed, 6_000., 4_500., 10_000., 700.);

    assert_eq!(
        aural_sequence(&observations),
        vec![
            AuralWarning::None as u8,
            AuralWarning::Terrain as u8,
            // between the two envelopes of mode 2A at 310 kt, TERRAIN, TERRAIN is not repeated
            AuralWarning::None as u8,
            AuralWarning::PullUp as u8
        ]
    );
    for observation in &observations {
        if observation.aural == AuralWarning::Terrain as u8 {
            assert!(observation.alert_lamp && !observation.warning_lamp);
        } else if observation.aural == AuralWarning::PullUp as u8 {
            assert!(observation.warning_lamp);
        }
    }
}

fn operative_predictive_functions(
    computed_height_above_terrain_ft: Option<f64>,
) -> PredictiveFunctionsStatus {
    PredictiveFunctionsStatus {
        operative: true,
        computed_height_above_terrain_ft,
    }
}

#[test]
fn mode_2_is_inhibited_while_the_predictive_functions_are_operative() {
    let mut without_predictive_functions = mode_2a_test_bed(6_000., 310.);
    let observations = close_in_on_terrain(
        &mut without_predictive_functions,
        6_000.,
        4_500.,
        10_000.,
        1_100.,
    );
    assert!(observations
        .iter()
        .any(|o| o.aural == AuralWarning::PullUp as u8));

    let mut inhibited =
        mode_2a_test_bed(6_000., 310.).predictive_functions(operative_predictive_functions(None));
    let observations = close_in_on_terrain(&mut inhibited, 6_000., 4_500., 10_000., 1_100.);
    assert!(observations
        .iter()
        .all(|o| o.aural == AuralWarning::None as u8 && !o.warning_lamp && !o.alert_lamp));
}

#[test]
fn mode_2_is_reactivated_when_the_predictive_functions_fail() {
    let mut test_bed =
        mode_2a_test_bed(6_000., 310.).predictive_functions(operative_predictive_functions(None));
    let observations = close_in_on_terrain(&mut test_bed, 6_000., 4_500., 10_000., 2_500.);
    assert!(observations
        .iter()
        .all(|o| o.aural == AuralWarning::None as u8));

    test_bed = test_bed.predictive_functions(PredictiveFunctionsStatus::default());
    let observations = close_in_on_terrain(&mut test_bed, 6_000., 2_500., 10_000., 1_100.);
    assert!(observations
        .iter()
        .any(|o| o.aural == AuralWarning::PullUp as u8));
}

#[test]
fn mode_2_is_reactivated_when_the_radio_height_differs_significantly_from_the_computed_height() {
    let mut agreeing = mode_2a_test_bed(6_000., 310.)
        .predictive_functions(operative_predictive_functions(Some(2_000.)));
    let observations = close_in_on_terrain(&mut agreeing, 6_000., 2_500., 10_000., 1_100.);
    assert!(observations
        .iter()
        .all(|o| o.aural == AuralWarning::None as u8));

    // The computed height is more than 2000 ft above the radio height
    let mut disagreeing = mode_2a_test_bed(6_000., 310.)
        .predictive_functions(operative_predictive_functions(Some(4_500.)));
    let observations = close_in_on_terrain(&mut disagreeing, 6_000., 2_500., 10_000., 1_100.);
    assert!(observations
        .iter()
        .any(|o| o.aural == AuralWarning::PullUp as u8));
}

#[test]
fn mode_2_envelopes_are_nested_for_every_closure_rate_and_airspeed() {
    for airspeed_kt in (150..=350).step_by(20) {
        for closure_rate_fpm in (0..=12_000).step_by(100) {
            let mode_2a = EnhancedGroundProximityWarningComputerRuntime::mode_2a_envelopes(
                closure_rate_fpm as f64,
                airspeed_kt as f64,
            );
            let mode_2b = EnhancedGroundProximityWarningComputerRuntime::mode_2b_envelopes(
                closure_rate_fpm as f64,
            );
            for envelopes in [mode_2a, mode_2b] {
                assert!(
                    envelopes.caution.ceiling_ft >= envelopes.warning.ceiling_ft,
                    "{airspeed_kt} kt {closure_rate_fpm} fpm"
                );
                assert!(envelopes.caution.floor_ft <= envelopes.warning.floor_ft);
                assert!(
                    envelopes.caution.minimum_closure_rate_fpm
                        <= envelopes.warning.minimum_closure_rate_fpm
                );
            }
        }
    }
}

#[test]
fn mode_2_a_warning_envelope_keeps_its_ceiling_over_the_whole_upper_range() {
    for closure_rate_fpm in [6_070., 8_000., 10_000., 12_000.] {
        let envelopes = EnhancedGroundProximityWarningComputerRuntime::mode_2a_envelopes(
            closure_rate_fpm,
            310.,
        );
        assert!(
            (1_640.0..=1_650.0).contains(&envelopes.warning.ceiling_ft),
            "{closure_rate_fpm}"
        );
    }
}

#[test]
fn mode_3_test() {
    let mut test_bed = test_bed_with().on_ground().and().powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    // Take off
    test_bed = test_bed
        .altitude_of(Length::new::<foot>(100.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(100.))
        .gear_extended(false);
    test_bed.run_with_delta(Duration::from_millis(3_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed
        .altitude_of(Length::new::<foot>(500.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-100.));
    test_bed.run_with_delta(Duration::from_millis(6_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed
        .altitude_of(Length::new::<foot>(400.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-100.));
    test_bed.run_with_delta(Duration::from_millis(6_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::DontSink as u8);
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed
        .altitude_of(Length::new::<foot>(420.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(100.));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed
        .altitude_of(Length::new::<foot>(420.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-100.));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::DontSink as u8);
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.gpws_sys_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();
    test_bed = test_bed.gpws_sys_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::DontSink as u8);
    assert!(test_bed.is_alert_light_on());
}

#[test]
fn mode_3_disabled_in_approach_mode() {
    let mut test_bed = test_bed_with().on_ground().and().powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    // Take off
    test_bed = test_bed.altitude_of(Length::new::<foot>(100.0));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(1000.0));
    test_bed.run_with_delta(Duration::from_millis(20_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed
        .altitude_of(Length::new::<foot>(600.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-100.));
    test_bed.run_with_delta(Duration::from_millis(10_000));
    test_bed.assert_no_warning_active();
}

#[test]
fn mode_4_a_test() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(1500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(250.0))
        .flaps_extended(false)
        .gear_extended(false)
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(960.0));
    test_bed.run_with_delta(Duration::from_millis(10_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowTerrain as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.cas_of(Velocity::new::<knot>(180.0));
    test_bed.run_with_delta(Duration::from_millis(5_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(400.0));
    test_bed.run_with_delta(Duration::from_millis(15_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::TooLowGear as u8);
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.gpws_sys_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();
    test_bed = test_bed.gpws_sys_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::TooLowGear as u8);
    assert!(test_bed.is_alert_light_on());
}

#[test]
fn mode_4_b_test() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(1500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(250.0))
        .flaps_extended(false)
        .gear_extended(true)
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(400.0));
    test_bed.run_with_delta(Duration::from_millis(30_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowTerrain as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.cas_of(Velocity::new::<knot>(150.0));
    test_bed.run_with_delta(Duration::from_millis(5_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(246.0));
    test_bed.run_with_delta(Duration::from_millis(15_000));
    // Need a small step size here, otherwise takeoff mode would activate
    test_bed = test_bed.altitude_of(Length::new::<foot>(244.0));
    test_bed.run_with_delta(Duration::from_millis(100));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowFlaps as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.gpws_sys_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();
    test_bed = test_bed.gpws_sys_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowFlaps as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.flaps_extended(true);
    test_bed.run_with_delta(Duration::from_millis(50));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.flaps_extended(false);
    test_bed.run_with_delta(Duration::from_millis(50));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowFlaps as u8
    );
    assert!(test_bed.is_alert_light_on());
}

#[test]
fn mode_4_b_alternate_test() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(1500.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(250.0))
        .flaps_extended(true)
        .gear_extended(false)
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(246.0));
    test_bed.run_with_delta(Duration::from_millis(35_000));
    // Need a small step size here, otherwise takeoff mode would activate
    test_bed = test_bed.altitude_of(Length::new::<foot>(244.0));
    test_bed.run_with_delta(Duration::from_millis(100));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::TooLowGear as u8);
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed
        .cas_of(Velocity::new::<knot>(150.0))
        .altitude_of(Length::new::<foot>(300.0));
    test_bed.run_with_delta(Duration::from_millis(5_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(246.0));
    test_bed.run_with_delta(Duration::from_millis(15_000));
    // Need a small step size here, otherwise takeoff mode would activate
    test_bed = test_bed.altitude_of(Length::new::<foot>(244.0));
    test_bed.run_with_delta(Duration::from_millis(100));
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::TooLowGear as u8);
    assert!(test_bed.is_alert_light_on());
}

#[test]
fn mode_4_c_test() {
    let mut test_bed = test_bed_with().on_ground().and().powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    // Take off
    test_bed = test_bed
        .altitude_of(Length::new::<foot>(30.0))
        .cas_of(Velocity::new::<knot>(150.0))
        .pitch_of(Angle::new::<degree>(10.))
        .gear_extended(false);
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();
    test_bed = test_bed.altitude_of(Length::new::<foot>(100.0));
    test_bed.run_with_delta(Duration::from_millis(5_000));

    test_bed = test_bed.altitude_of(Length::new::<foot>(400.0));
    test_bed.run_with_delta(Duration::from_millis(15_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(210.0));
    test_bed.run_with_delta(Duration::from_millis(10_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowTerrain as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.cas_of(Velocity::new::<knot>(150.0));

    test_bed = test_bed.gpws_sys_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();
    test_bed = test_bed.gpws_sys_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowTerrain as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.altitude_of(Length::new::<foot>(400.0));
    test_bed.run_with_delta(Duration::from_millis(15_000));
    test_bed.assert_no_warning_active();
}

#[test]
fn mode_5_test() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(900.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(150.0))
        .gs_deviation_of(None)
        .loc_deviation_of(None)
        .gear_extended(true)
        .flaps_extended(true)
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.loc_deviation_of(Some(Ratio::new::<ratio>(0.3)));
    test_bed = test_bed.gs_deviation_of(Some(Ratio::new::<ratio>(-0.122)));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed
        .loc_deviation_of(Some(Ratio::new::<ratio>(0.0)))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-500.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeSoft as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.gs_deviation_of(Some(Ratio::new::<ratio>(-0.18)));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeSoft as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.altitude_of(Length::new::<foot>(200.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeHard as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.gs_mode_button_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();
    test_bed = test_bed.gs_mode_button_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeHard as u8
    );
    assert!(test_bed.is_alert_light_on());
}

#[test]
fn mode_5_gs_inhibit_button_cancels() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(900.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(150.0))
        .gs_deviation_of(None)
        .loc_deviation_of(None)
        .gear_extended(true)
        .flaps_extended(true)
        .and()
        .powered();

    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.loc_deviation_of(Some(Ratio::new::<ratio>(0.3)));
    test_bed = test_bed.gs_deviation_of(Some(Ratio::new::<ratio>(-0.122)));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed
        .loc_deviation_of(Some(Ratio::new::<ratio>(0.0)))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(-500.0));
    test_bed = test_bed.gs_deviation_of(Some(Ratio::new::<ratio>(-0.18)));
    test_bed = test_bed.altitude_of(Length::new::<foot>(200.0));
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeHard as u8
    );
    assert!(test_bed.is_alert_light_on());

    test_bed = test_bed.gpws_gs_cancel_self_test_pressed(true);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed = test_bed.gpws_gs_cancel_self_test_pressed(false);
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.altitude_of(Length::new::<foot>(2100.0));
    test_bed.run_with_delta(Duration::from_millis(1));
    test_bed = test_bed.altitude_of(Length::new::<foot>(200.0));
    test_bed.run_with_delta(Duration::from_millis(60_000));
    assert!(test_bed.get_audio_on());
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeHard as u8
    );
    assert!(test_bed.is_alert_light_on());
}

impl EgpwcTestBed {
    /// Runs the computer for the given time in 50 ms steps.
    fn run_for(&mut self, duration: Duration) {
        let step = Duration::from_millis(50);
        let mut elapsed = Duration::ZERO;
        while elapsed < duration {
            self.run_with_delta(step);
            elapsed += step;
        }
    }

    /// One short press of the GPWS test pushbutton (the same pushbutton as the mode 5 G/S cancel).
    fn press_gpws_test_pushbutton(mut self) -> Self {
        self = self.gpws_gs_cancel_self_test_pressed(true);
        self.run_with_delta(Duration::from_millis(50));
        self = self.gpws_gs_cancel_self_test_pressed(false);
        self
    }

    fn is_terrain_test_pattern_shown(&mut self) -> bool {
        ReadByName::<EgpwcTestBed, bool>::read_by_name(
            self,
            EnhancedGroundProximityWarningComputer::TERRAIN_TEST_PATTERN_KEY,
        )
    }
}

/// A320 FCOM DSC-34-SURV-40-40 (a320_fcom.txt:55491): the GPWS can be tested by pressing the GPWS pushbutton on the
/// ground. The sequence (GLIDESLOPE, PULL UP, terrain test pattern with TERRAIN TERRAIN PULL UP) is the Honeywell EGPWS
/// short self-test.
#[test]
fn self_test_on_ground_runs_glideslope_pull_up_and_terrain_steps() {
    let mut test_bed = test_bed_with().on_ground().and().powered();
    test_bed.run_for(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();
    assert!(!test_bed.is_terrain_test_pattern_shown());

    test_bed = test_bed.press_gpws_test_pushbutton();
    test_bed.run_with_delta(Duration::from_millis(50));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::GlideslopeSoft as u8
    );
    assert!(test_bed.is_alert_light_on());
    assert!(!test_bed.is_warning_light_on());

    // GLIDESLOPE lasts 1.6 s
    test_bed.run_for(Duration::from_millis(1_600));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());
    assert!(!test_bed.is_alert_light_on());
    assert!(!test_bed.is_terrain_test_pattern_shown());

    // PULL UP lasts 1.1 s, then the terrain test pattern with TERRAIN TERRAIN (2 x 0.7 s)
    test_bed.run_for(Duration::from_millis(1_100));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::Terrain as u8);
    assert!(test_bed.is_warning_light_on());
    assert!(test_bed.is_terrain_test_pattern_shown());

    test_bed.run_for(Duration::from_millis(1_400));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());
    assert!(test_bed.is_terrain_test_pattern_shown());

    // End of the test after the last PULL UP
    test_bed.run_for(Duration::from_millis(1_200));
    test_bed.assert_no_warning_active();
    assert!(!test_bed.is_terrain_test_pattern_shown());
}

#[test]
fn self_test_does_not_start_in_flight() {
    let mut test_bed = test_bed_with()
        .altitude_of(Length::new::<foot>(3_000.0))
        .terrain_height_of(Length::new::<foot>(0.0))
        .vertical_speed_of(Velocity::new::<foot_per_minute>(0.0))
        .cas_of(Velocity::new::<knot>(250.0))
        .gear_extended(false)
        .and()
        .powered();
    test_bed.run_for(Duration::from_millis(1_000));
    test_bed.assert_no_warning_active();

    test_bed = test_bed.press_gpws_test_pushbutton();
    test_bed.run_for(Duration::from_millis(500));
    test_bed.assert_no_warning_active();
    assert!(!test_bed.is_terrain_test_pattern_shown());
}

#[test]
fn self_test_does_not_start_with_gpws_sys_off() {
    let mut test_bed = test_bed_with()
        .on_ground()
        .gpws_sys_button_pressed(true)
        .and()
        .powered();
    test_bed.run_for(Duration::from_millis(1_000));

    test_bed = test_bed.press_gpws_test_pushbutton();
    test_bed.run_for(Duration::from_millis(500));
    test_bed.assert_no_warning_active();
}

// The alerts of the predictive terrain functions: lamps, aural words and the automatic terrain display.

fn predictive_alerts_of(voice: PredictiveVoice, warning: bool, caution: bool) -> PredictiveOutputs {
    PredictiveOutputs {
        functions: PredictiveFunctionsStatus::default(),
        inputs_available: true,
        alerts: PredictiveAlertOutputs {
            voice,
            warning_light: warning,
            caution_light: caution,
            automatic_terrain_display: warning || voice == PredictiveVoice::TerrainAhead,
            nd_message: TerrainAheadMessage::None,
            obstacle_ahead: false,
            threat_areas: ThreatAreas::default(),
        },
    }
}

impl EgpwcTestBed {
    fn predictive_outputs(mut self, outputs: PredictiveOutputs) -> Self {
        self.command(|a| a.egpwc.set_predictive_outputs(outputs));
        self.run_with_delta(Duration::from_millis(100));
        self
    }

    fn audio_inhibited(mut self, inhibited: bool) -> Self {
        self.command(|a| a.egpws_electrical_harness.discrete_inputs.audio_inhibit = inhibited);
        self
    }

    fn emer_canc_pressed(mut self, pressed: bool) -> Self {
        self.command(|a| {
            a.egpws_electrical_harness
                .discrete_inputs
                .momentary_audio_suppression = pressed
        });
        self
    }

    fn terrain_displayed_automatically(&self) -> (bool, bool) {
        self.query(|ac: &TestAircraft| {
            let outputs = ac.egpwc.discrete_outputs();
            (
                outputs.capt_terrain_display_active,
                outputs.fo_terrain_display_active,
            )
        })
    }

    fn terr_area(&mut self, name: &str) -> f64 {
        ReadByName::<EgpwcTestBed, f64>::read_by_name(self, name)
    }

    fn obst_ahead_message(&mut self) -> u8 {
        ReadByName::<EgpwcTestBed, u8>::read_by_name(
            self,
            EnhancedGroundProximityWarningComputer::OBST_AHEAD_KEY,
        )
    }

    fn terr_ahead_message(&mut self) -> u8 {
        ReadByName::<EgpwcTestBed, u8>::read_by_name(
            self,
            EnhancedGroundProximityWarningComputer::TERR_AHEAD_KEY,
        )
    }

    fn bus_bit(&self, bit: u8) -> bool {
        self.query(|ac: &TestAircraft| ac.egpwc.bus_outputs().alert_discrete_1.get_bit(bit))
    }
}

#[test]
fn a_terrain_ahead_pull_up_warning_gives_pull_up_the_red_light_and_the_terrain_display() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(predictive_alerts_of(
        PredictiveVoice::PullUp,
        true,
        false,
    ));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());
    assert!(!test_bed.is_alert_light_on());
    assert!(test_bed.get_audio_on());
    assert_eq!(test_bed.terrain_displayed_automatically(), (true, true));
}

#[test]
fn a_terrain_ahead_caution_gives_terrain_ahead_and_the_amber_light() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(predictive_alerts_of(
        PredictiveVoice::TerrainAhead,
        false,
        true,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TerrainAhead as u8
    );
    assert!(test_bed.is_alert_light_on());
    assert!(!test_bed.is_warning_light_on());
    assert_eq!(test_bed.terrain_displayed_automatically(), (true, true));
    assert!(test_bed.bus_bit(19));
}

#[test]
fn the_terr_ahead_level_for_the_nds_follows_the_predictive_alert() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.);
    assert_eq!(
        test_bed.terr_ahead_message(),
        TerrainAheadMessage::None as u8
    );

    let mut caution = predictive_alerts_of(PredictiveVoice::TerrainAhead, false, true);
    caution.alerts.nd_message = TerrainAheadMessage::Caution;
    test_bed = test_bed.predictive_outputs(caution);
    assert_eq!(
        test_bed.terr_ahead_message(),
        TerrainAheadMessage::Caution as u8
    );

    // No word on the output between two PULL UPs: the message stays
    let mut warning = predictive_alerts_of(PredictiveVoice::None, true, false);
    warning.alerts.nd_message = TerrainAheadMessage::Warning;
    test_bed = test_bed.predictive_outputs(warning);
    assert_eq!(
        test_bed.terr_ahead_message(),
        TerrainAheadMessage::Warning as u8
    );
}

#[test]
fn the_threat_areas_for_the_nds_are_written_while_the_alert_lasts() {
    let position = GridPosition::new(35.25, 138.91);
    let threat = ThreatCell {
        cell: GridCell::of(GridPosition::new(35.3, 138.91)),
        level: ThreatLevel::Warning,
    };
    let mut warning = predictive_alerts_of(PredictiveVoice::PullUp, true, false);
    warning.alerts.nd_message = TerrainAheadMessage::Warning;
    warning.alerts.threat_areas = ThreatAreas::of(position, &[threat], false);
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(warning);
    assert_eq!(
        test_bed.terr_area(EnhancedGroundProximityWarningComputer::TERR_AREA_REF_LAT_KEY),
        2115.
    );
    assert_eq!(
        test_bed.terr_area(EnhancedGroundProximityWarningComputer::TERR_AREA_REF_LON_KEY),
        8334.
    );
    assert_eq!(
        test_bed.terr_area("GPWS_TERR_AREA_0"),
        warning.alerts.threat_areas.slots[0]
    );
    assert!(test_bed.terr_area("GPWS_TERR_AREA_0") > 0.);

    test_bed = test_bed.no_power();
    test_bed.run_for(Duration::from_millis(1_000));
    assert_eq!(test_bed.terr_area("GPWS_TERR_AREA_0"), 0.);
}

#[test]
fn the_aural_outputs_of_the_predictive_words_keep_their_values() {
    assert_eq!(AuralWarning::TerrainAhead as u8, 10);
    assert_eq!(AuralWarning::ObstacleAhead as u8, 11);
    assert_eq!(AuralWarning::AvoidTerrain as u8, 12);
    assert_eq!(AuralWarning::AvoidObstacle as u8, 13);
}

#[test]
fn avoid_obstacle_is_its_own_aural_with_the_red_light() {
    let mut avoid = predictive_alerts_of(PredictiveVoice::AvoidObstacle, true, false);
    avoid.alerts.obstacle_ahead = true;
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(avoid);
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::AvoidObstacle as u8
    );
    assert!(test_bed.is_warning_light_on());
}

#[test]
fn obstacle_ahead_is_an_aural_with_the_amber_light() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(predictive_alerts_of(
        PredictiveVoice::ObstacleAhead,
        false,
        true,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::ObstacleAhead as u8
    );
    assert!(!test_bed.is_warning_light_on());
}

#[test]
fn the_obst_ahead_message_follows_the_alert_and_needs_power() {
    let mut caution = predictive_alerts_of(PredictiveVoice::ObstacleAhead, false, true);
    caution.alerts.nd_message = TerrainAheadMessage::Caution;
    caution.alerts.obstacle_ahead = true;
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(caution);
    assert_eq!(test_bed.obst_ahead_message(), 1);
    assert_eq!(
        test_bed.terr_ahead_message(),
        TerrainAheadMessage::Caution as u8
    );

    test_bed = test_bed.no_power();
    test_bed.run_for(Duration::from_millis(1_000));
    assert_eq!(test_bed.obst_ahead_message(), 0);
}

#[test]
fn no_terr_ahead_message_without_power() {
    let mut warning = predictive_alerts_of(PredictiveVoice::PullUp, true, false);
    warning.alerts.nd_message = TerrainAheadMessage::Warning;
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(warning);
    test_bed = test_bed.no_power();
    test_bed.run_for(Duration::from_millis(1_000));
    assert_eq!(
        test_bed.terr_ahead_message(),
        TerrainAheadMessage::None as u8
    );
}

#[test]
fn avoid_terrain_is_its_own_aural_with_the_red_light() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(predictive_alerts_of(
        PredictiveVoice::AvoidTerrain,
        true,
        false,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::AvoidTerrain as u8
    );
    assert!(test_bed.is_warning_light_on());
    assert!(test_bed.bus_bit(20));
    assert!(!test_bed.bus_bit(19));
}

#[test]
fn too_low_terrain_from_the_predictive_functions_has_the_amber_light_and_no_terrain_display() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(predictive_alerts_of(
        PredictiveVoice::TooLowTerrain,
        false,
        true,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TooLowTerrain as u8
    );
    assert!(test_bed.is_alert_light_on());
    assert_eq!(test_bed.terrain_displayed_automatically(), (false, false));
    assert!(test_bed.bus_bit(17));
}

#[test]
fn no_alerts_of_the_predictive_functions_leaves_the_outputs_quiet() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(predictive_alerts_of(
        PredictiveVoice::None,
        false,
        false,
    ));
    test_bed.assert_no_warning_active();
    assert_eq!(test_bed.terrain_displayed_automatically(), (false, false));
}

#[test]
fn the_pull_up_of_mode_1_goes_before_a_caution_of_the_predictive_functions() {
    let mut test_bed =
        mode_2a_test_bed(1_000., 160.).vertical_speed_of(Velocity::new::<foot_per_minute>(-6_000.));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);

    let mut test_bed = test_bed.predictive_outputs(predictive_alerts_of(
        PredictiveVoice::TerrainAhead,
        false,
        true,
    ));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
}

#[test]
fn a_warning_of_the_predictive_functions_goes_before_sink_rate() {
    let mut test_bed =
        mode_2a_test_bed(1_000., 160.).vertical_speed_of(Velocity::new::<foot_per_minute>(-3_000.));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::SinkRate as u8);

    let mut test_bed = test_bed.predictive_outputs(predictive_alerts_of(
        PredictiveVoice::AvoidTerrain,
        true,
        false,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::AvoidTerrain as u8
    );
}

#[test]
fn a_caution_of_the_predictive_functions_goes_before_sink_rate() {
    let mut test_bed =
        mode_2a_test_bed(1_000., 160.).vertical_speed_of(Velocity::new::<foot_per_minute>(-3_000.));
    test_bed.run_with_delta(Duration::from_millis(3_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::SinkRate as u8);
    let mut test_bed = test_bed.predictive_outputs(predictive_alerts_of(
        PredictiveVoice::TerrainAhead,
        false,
        true,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::TerrainAhead as u8
    );
}

#[test]
fn the_aural_output_drops_to_none_between_the_pulses_of_a_predictive_warning_and_the_light_stays_on(
) {
    let pull_up = predictive_alerts_of(PredictiveVoice::PullUp, true, false);
    let gap = predictive_alerts_of(PredictiveVoice::None, true, false);
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(pull_up);
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    test_bed = test_bed.predictive_outputs(gap);
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::None as u8);
    assert!(test_bed.is_warning_light_on());
    test_bed = test_bed.predictive_outputs(predictive_alerts_of(
        PredictiveVoice::AvoidTerrain,
        true,
        false,
    ));
    assert_eq!(
        test_bed.get_aural_warning(),
        AuralWarning::AvoidTerrain as u8
    );
}

#[test]
fn the_momentary_audio_suppression_silences_the_predictive_words_but_not_the_lights() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.)
        .audio_inhibited(true)
        .predictive_outputs(predictive_alerts_of(PredictiveVoice::PullUp, true, false));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::None as u8);
    assert!(test_bed.is_warning_light_on());
}

#[test]
fn emer_canc_silences_the_predictive_words_until_the_alert_is_over() {
    let pull_up = predictive_alerts_of(PredictiveVoice::PullUp, true, false);
    let mut test_bed = mode_2a_test_bed(6_000., 250.).predictive_outputs(pull_up);
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);

    test_bed = test_bed.emer_canc_pressed(true).predictive_outputs(pull_up);
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::None as u8);
    assert!(
        test_bed.is_warning_light_on(),
        "EMER CANC does not put out the light"
    );

    // The key is released, the alert goes on: the repeats stay silent
    test_bed = test_bed
        .emer_canc_pressed(false)
        .predictive_outputs(pull_up);
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::None as u8);

    // A new alert is announced again
    test_bed =
        test_bed.predictive_outputs(predictive_alerts_of(PredictiveVoice::None, false, false));
    test_bed = test_bed.predictive_outputs(pull_up);
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
}

#[test]
fn emer_canc_without_a_predictive_alert_does_not_silence_the_next_one() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.)
        .emer_canc_pressed(true)
        .predictive_outputs(predictive_alerts_of(PredictiveVoice::None, false, false))
        .emer_canc_pressed(false);
    test_bed =
        test_bed.predictive_outputs(predictive_alerts_of(PredictiveVoice::PullUp, true, false));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
}

#[test]
fn the_gpws_sys_pushbutton_does_not_inhibit_the_predictive_functions() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.)
        .gpws_sys_button_pressed(true)
        .predictive_outputs(predictive_alerts_of(PredictiveVoice::PullUp, true, false));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::PullUp as u8);
    assert!(test_bed.is_warning_light_on());
}

#[test]
fn the_predictive_alerts_are_gone_when_the_computer_loses_power() {
    let mut test_bed = mode_2a_test_bed(6_000., 250.)
        .predictive_outputs(predictive_alerts_of(PredictiveVoice::PullUp, true, false))
        .no_power();
    test_bed.run_with_delta(Duration::from_millis(1_000));
    assert_eq!(test_bed.get_aural_warning(), AuralWarning::None as u8);
    assert!(!test_bed.is_warning_light_on());
    assert_eq!(test_bed.terrain_displayed_automatically(), (false, false));
}
