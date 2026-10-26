use crate::{
    enhanced_gpwc::navigation_display::NavigationDisplay,
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        AdirsMeasurementOutputs, ElectricalBusType, ElectricalBuses, LgciuGearExtension,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, VariableIdentifier, Write,
    },
};
use std::vec::Vec;
use uom::si::{
    angle::degree,
    f64::{Angle, Length, Velocity},
    velocity::foot_per_minute,
};

pub mod navigation_display;

/// What the predictive terrain functions of the EGPWS tell the terrain display.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PredictiveFunctionsLink {
    /// The terrain database and the position data the predictive functions need are there. When they are not, the
    /// EGPWC is in terrain standby.
    pub inputs_available: bool,
    /// A caution or warning of the predictive functions shows the terrain on both NDs, whatever the TERR ON ND pb-sws
    /// say.
    pub automatic_terrain_display: bool,
}
impl Default for PredictiveFunctionsLink {
    fn default() -> Self {
        Self {
            inputs_available: true,
            automatic_terrain_display: false,
        }
    }
}

pub struct EnhancedGroundProximityWarningComputer {
    powered_by: ElectricalBusType,
    is_powered: bool,
    fm1_destination_longitude_ssm_id: VariableIdentifier,
    fm1_destination_longitude_id: VariableIdentifier,
    fm1_destination_latitude_ssm_id: VariableIdentifier,
    fm1_destination_latitude_id: VariableIdentifier,
    destination_longitude: Arinc429Word<Angle>,
    destination_latitude: Arinc429Word<Angle>,
    latitude: Arinc429Word<Angle>,
    longitude: Arinc429Word<Angle>,
    altitude: Arinc429Word<Length>,
    heading: Arinc429Word<Angle>,
    vertical_speed: Arinc429Word<Velocity>,
    navigation_display_range_lookup: Vec<Length>,
    navigation_displays: [NavigationDisplay; 2],
    gear_is_down: bool,
    terronnd_rendering_mode: u8,
    /// A required input of the predictive functions (TAD, TCF) is missing or invalid: the TERR STBY memo of the A320
    /// FWC (FCOM DSC-34-SURV-40-40, a320_fcom.txt l.55563-55566)
    terrain_standby: bool,
    /// The EGPWC sets the TERR ON ND pb-sws back to OFF while it is in terrain standby (the A320: "If selected, the
    /// terrain data display on the ND is automatically deselected when the TERR STBY memo is triggered", l.55565-55566)
    deselects_terrain_display_on_standby: bool,
    // output variables of the EGPWC
    egpwc_destination_longitude_id: VariableIdentifier,
    egpwc_destination_latitude_id: VariableIdentifier,
    egpwc_present_latitude_id: VariableIdentifier,
    egpwc_present_longitude_id: VariableIdentifier,
    egpwc_present_heading_id: VariableIdentifier,
    egpwc_present_altitude_id: VariableIdentifier,
    egpwc_present_vertical_speed_id: VariableIdentifier,
    egpwc_gear_is_down_id: VariableIdentifier,
    egpwc_terronnd_rendering_mode: VariableIdentifier,
    egpwc_terrain_standby_id: VariableIdentifier,
}

impl EnhancedGroundProximityWarningComputer {
    pub fn new(
        context: &mut InitContext,
        powered_by: ElectricalBusType,
        range_lookup: Vec<Length>,
        terronnd_rendering_mode: u8,
    ) -> Self {
        EnhancedGroundProximityWarningComputer {
            powered_by,
            is_powered: false,
            fm1_destination_longitude_ssm_id: context
                .get_identifier("FM1_DEST_LONG_SSM".to_owned()),
            fm1_destination_longitude_id: context.get_identifier("FM1_DEST_LONG".to_owned()),
            fm1_destination_latitude_ssm_id: context.get_identifier("FM1_DEST_LAT_SSM".to_owned()),
            fm1_destination_latitude_id: context.get_identifier("FM1_DEST_LAT".to_owned()),
            destination_longitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
            destination_latitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
            latitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
            longitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
            altitude: Arinc429Word::new(Length::default(), SignStatus::FailureWarning),
            heading: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
            vertical_speed: Arinc429Word::new(Velocity::default(), SignStatus::FailureWarning),
            navigation_display_range_lookup: range_lookup,
            navigation_displays: [
                NavigationDisplay::new(context, "L"),
                NavigationDisplay::new(context, "R"),
            ],
            gear_is_down: true,
            terronnd_rendering_mode,
            terrain_standby: false,
            deselects_terrain_display_on_standby: false,
            egpwc_destination_longitude_id: context.get_identifier("EGPWC_DEST_LONG".to_owned()),
            egpwc_destination_latitude_id: context.get_identifier("EGPWC_DEST_LAT".to_owned()),
            egpwc_present_latitude_id: context.get_identifier("EGPWC_PRESENT_LAT".to_owned()),
            egpwc_present_longitude_id: context.get_identifier("EGPWC_PRESENT_LONG".to_owned()),
            egpwc_present_heading_id: context.get_identifier("EGPWC_PRESENT_HEADING".to_owned()),
            egpwc_present_altitude_id: context.get_identifier("EGPWC_PRESENT_ALTITUDE".to_owned()),
            egpwc_present_vertical_speed_id: context
                .get_identifier("EGPWC_PRESENT_VERTICAL_SPEED".to_owned()),
            egpwc_gear_is_down_id: context.get_identifier("EGPWC_GEAR_IS_DOWN".to_owned()),
            egpwc_terronnd_rendering_mode: context
                .get_identifier("EGPWC_TERRONND_RENDERING_MODE".to_owned()),
            egpwc_terrain_standby_id: context.get_identifier("EGPWC_TERR_STBY".to_owned()),
        }
    }

    /// The TERR ON ND pb-sws go back to OFF while the EGPWC is in terrain standby (A320 FCOM DSC-34-SURV-40-40,
    /// l.55565-55566). Used by the A320, whose TERR ON ND pb-sws are latched L:vars of the cockpit.
    pub fn with_terrain_display_deselection_on_standby(mut self) -> Self {
        self.deselects_terrain_display_on_standby = true;
        self
    }

    /// The position data the predictive functions need are valid: the ADIRU 1 is aligned and the present position,
    /// altitude, heading and vertical speed words are in normal operation. Design choice (the FCOM does not list the
    /// inputs, "any required predictive function input is missing or considered invalid", l.55563-55564): the inputs
    /// are the words this EGPWC takes for its terrain picture.
    fn predictive_inputs_valid(&self, adirs_output: &impl AdirsMeasurementOutputs) -> bool {
        adirs_output.is_fully_aligned(1)
            && self.latitude.is_normal_operation()
            && self.longitude.is_normal_operation()
            && self.altitude.is_normal_operation()
            && self.heading.is_normal_operation()
            && self.vertical_speed.is_normal_operation()
    }

    fn update_position_data(&mut self, adirs_output: &impl AdirsMeasurementOutputs) {
        // documentation hints:
        //   - EGPWC has direct connection to GPS sensor && ADIRS_1
        //   - uses direct GPS data if ADIRS_1 is unavailable
        // TODO:
        //   - implement logic as soon as GPS sensor is available
        self.latitude = adirs_output.latitude(1);
        self.longitude = adirs_output.longitude(1);
        self.altitude = adirs_output.altitude(1);
        self.heading = adirs_output.true_heading(1);
        self.vertical_speed = adirs_output.vertical_speed(1);
    }

    pub fn update(
        &mut self,
        adirs_output: &impl AdirsMeasurementOutputs,
        lgcius: &impl LgciuGearExtension,
    ) {
        self.update_with_terrain_functions(adirs_output, lgcius, true);
    }

    /// `terrain_functions_available`: the terrain awareness functions of the EGPWS work, for the terrain display on
    /// the NDs. The A320 TERR ON ND pb-sw "ON : The terrain is displayed on the ND if the: TERR pb-sw is selected ON,
    /// and TERR FAULT light is not on, TERR STBY ECAM memo is not displayed" (FCOM DSC-34-SURV-40-40,
    /// a320_fcom.txt:55509-55512); TERR pb-sw "OFF : Inhibits the Terrain Awareness Display (TAD)" (l.55447) and
    /// "FAULT light : ... The terrain is not shown on the ND" (l.55467-55468).
    pub fn update_with_terrain_functions(
        &mut self,
        adirs_output: &impl AdirsMeasurementOutputs,
        lgcius: &impl LgciuGearExtension,
        terrain_functions_available: bool,
    ) {
        self.update_with_predictive_functions(
            adirs_output,
            lgcius,
            terrain_functions_available,
            PredictiveFunctionsLink::default(),
        );
    }

    /// As [`Self::update_with_terrain_functions`], with the state of the predictive terrain functions of the EGPWS.
    pub fn update_with_predictive_functions(
        &mut self,
        adirs_output: &impl AdirsMeasurementOutputs,
        lgcius: &impl LgciuGearExtension,
        terrain_functions_available: bool,
        predictive_functions: PredictiveFunctionsLink,
    ) {
        if !self.is_powered {
            self.destination_longitude =
                Arinc429Word::new(Angle::default(), SignStatus::FailureWarning);
            self.destination_latitude =
                Arinc429Word::new(Angle::default(), SignStatus::FailureWarning);
            self.latitude = Arinc429Word::new(Angle::default(), SignStatus::FailureWarning);
            self.longitude = Arinc429Word::new(Angle::default(), SignStatus::FailureWarning);
            self.altitude = Arinc429Word::new(Length::default(), SignStatus::FailureWarning);
            self.heading = Arinc429Word::new(Angle::default(), SignStatus::FailureWarning);
            self.vertical_speed =
                Arinc429Word::new(Velocity::default(), SignStatus::FailureWarning);

            self.gear_is_down = false;
        } else {
            self.update_position_data(adirs_output);
            self.gear_is_down = lgcius.main_down_and_locked();
        }

        // TERR STBY needs a working EGPWC: an unpowered one is the TERR FAULT of the EGPWS instead
        let predictive_inputs_valid = self.is_powered
            && self.predictive_inputs_valid(adirs_output)
            && predictive_functions.inputs_available;
        self.terrain_standby = self.is_powered && !predictive_inputs_valid;
        let deselect_terrain_display =
            self.deselects_terrain_display_on_standby && self.terrain_standby;
        // TERR pb-sw OFF or TERR FAULT: no terrain on the NDs, the TERR ON ND pb-sws stay as selected
        let terrain_display_available = predictive_inputs_valid && terrain_functions_available;

        self.navigation_displays.iter_mut().for_each(|display| {
            display.update(
                self.is_powered,
                &self.navigation_display_range_lookup,
                terrain_display_available,
                deselect_terrain_display,
                predictive_functions.automatic_terrain_display,
            )
        });
    }
}

impl SimulationElement for EnhancedGroundProximityWarningComputer {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by)
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        let destination_long: f64 = reader.read(&self.fm1_destination_longitude_id);
        let destination_lat: f64 = reader.read(&self.fm1_destination_latitude_id);
        let destination_long_ssm: u32 = reader.read(&self.fm1_destination_longitude_ssm_id);
        let destination_lat_ssm: u32 = reader.read(&self.fm1_destination_latitude_ssm_id);

        self.destination_longitude = Arinc429Word::new(
            Angle::new::<degree>(destination_long),
            SignStatus::from(destination_long_ssm),
        );
        self.destination_latitude = Arinc429Word::new(
            Angle::new::<degree>(destination_lat),
            SignStatus::from(destination_lat_ssm),
        );
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.egpwc_destination_longitude_id,
            self.destination_longitude,
        );
        writer.write(
            &self.egpwc_destination_latitude_id,
            self.destination_latitude,
        );
        writer.write(&self.egpwc_present_latitude_id, self.latitude);
        writer.write(&self.egpwc_present_longitude_id, self.longitude);
        writer.write(&self.egpwc_present_heading_id, self.heading);
        writer.write(&self.egpwc_present_altitude_id, self.altitude);
        writer.write_arinc429(
            &self.egpwc_present_vertical_speed_id,
            self.vertical_speed.value().get::<foot_per_minute>(),
            self.vertical_speed.ssm(),
        );
        writer.write(&self.egpwc_gear_is_down_id, self.gear_is_down);
        writer.write(
            &self.egpwc_terronnd_rendering_mode,
            self.terronnd_rendering_mode,
        );
        writer.write(&self.egpwc_terrain_standby_id, self.terrain_standby);
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.navigation_displays, visitor);
        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, InitContext, SimulationElement, SimulationElementVisitor, UpdateContext,
        },
    };
    use ntest::assert_about_eq;
    use uom::si::{
        angle::degree,
        electric_potential::volt,
        f64::*,
        length::{foot, nautical_mile},
        velocity::{foot_per_minute, knot},
    };

    struct TestAdirs {
        is_aligned: bool,
        latitude: Arinc429Word<Angle>,
        longitude: Arinc429Word<Angle>,
        heading: Arinc429Word<Angle>,
        vertical_speed: Arinc429Word<Velocity>,
        altitude: Arinc429Word<Length>,
        angle_of_attack: Arinc429Word<Angle>,
        computed_airspeed: Arinc429Word<Velocity>,
    }
    impl TestAdirs {
        fn new() -> Self {
            Self {
                is_aligned: false,
                latitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                longitude: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                heading: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                vertical_speed: Arinc429Word::new(Velocity::default(), SignStatus::FailureWarning),
                altitude: Arinc429Word::new(Length::default(), SignStatus::FailureWarning),
                angle_of_attack: Arinc429Word::new(Angle::default(), SignStatus::FailureWarning),
                computed_airspeed: Arinc429Word::new(
                    Velocity::default(),
                    SignStatus::FailureWarning,
                ),
            }
        }

        fn initialize(&mut self) {
            self.is_aligned = true;
            self.latitude =
                Arinc429Word::new(Angle::new::<degree>(20.3), SignStatus::NormalOperation);
            self.longitude =
                Arinc429Word::new(Angle::new::<degree>(30.3), SignStatus::NormalOperation);
            self.heading =
                Arinc429Word::new(Angle::new::<degree>(310.0), SignStatus::NormalOperation);
            self.vertical_speed = Arinc429Word::new(
                Velocity::new::<foot_per_minute>(1300.0),
                SignStatus::NormalOperation,
            );
            self.altitude =
                Arinc429Word::new(Length::new::<foot>(15000.0), SignStatus::NormalOperation);
            self.angle_of_attack =
                Arinc429Word::new(Angle::new::<degree>(0.0), SignStatus::NormalOperation);
            self.computed_airspeed =
                Arinc429Word::new(Velocity::new::<knot>(280.0), SignStatus::NormalOperation);
        }
    }
    impl AdirsMeasurementOutputs for TestAdirs {
        fn is_fully_aligned(&self, _adiru_number: usize) -> bool {
            self.is_aligned
        }

        fn latitude(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.latitude
        }

        fn longitude(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.longitude
        }

        fn heading(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.heading
        }

        fn true_heading(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.heading
        }

        fn vertical_speed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
            self.vertical_speed
        }

        fn altitude(&self, _adiru_number: usize) -> Arinc429Word<Length> {
            self.altitude
        }

        fn angle_of_attack(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
            self.angle_of_attack
        }

        fn computed_airspeed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
            self.computed_airspeed
        }
    }

    struct TestLgciu {
        gear_down: bool,
    }
    impl TestLgciu {
        fn new() -> Self {
            Self { gear_down: false }
        }

        fn set_gear_down(&mut self, is_down: bool) {
            self.gear_down = is_down;
        }
    }

    impl LgciuGearExtension for TestLgciu {
        fn all_down_and_locked(&self) -> bool {
            self.gear_down
        }

        fn all_up_and_locked(&self) -> bool {
            !self.gear_down
        }

        fn main_down_and_locked(&self) -> bool {
            self.gear_down
        }

        fn main_up_and_locked(&self) -> bool {
            !self.gear_down
        }

        fn nose_down_and_locked(&self) -> bool {
            self.gear_down
        }

        fn nose_up_and_locked(&self) -> bool {
            !self.gear_down
        }

        fn left_down_and_locked(&self) -> bool {
            self.gear_down
        }
    }

    struct EgpwcTestAircraft {
        adirs: TestAdirs,
        lgciu: TestLgciu,
        egpwc: EnhancedGroundProximityWarningComputer,
        powered_source_dc: TestElectricitySource,
        dc_1_bus: ElectricalBus,
        is_elec_powered: bool,
        terrain_functions_available: bool,
        predictive_functions: PredictiveFunctionsLink,
    }
    impl EgpwcTestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                adirs: TestAdirs::new(),
                lgciu: TestLgciu::new(),
                egpwc: EnhancedGroundProximityWarningComputer::new(
                    context,
                    ElectricalBusType::DirectCurrent(1),
                    vec![
                        Length::new::<nautical_mile>(10.0),
                        Length::new::<nautical_mile>(20.0),
                        Length::new::<nautical_mile>(40.0),
                        Length::new::<nautical_mile>(80.0),
                        Length::new::<nautical_mile>(160.0),
                        Length::new::<nautical_mile>(320.0),
                    ],
                    0,
                ),
                powered_source_dc: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::Battery(2),
                ),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                is_elec_powered: false,
                terrain_functions_available: true,
                predictive_functions: PredictiveFunctionsLink::default(),
            }
        }

        fn update(&mut self) {
            self.egpwc.update_with_predictive_functions(
                &self.adirs,
                &self.lgciu,
                self.terrain_functions_available,
                self.predictive_functions,
            );
        }

        /// TERR pb-sw OFF, TERR FAULT or a failed EGPWS
        fn set_terrain_functions_available(&mut self, available: bool) {
            self.terrain_functions_available = available;
        }

        fn set_predictive_functions(&mut self, link: PredictiveFunctionsLink) {
            self.predictive_functions = link;
        }

        fn initialize_adiru(&mut self) {
            self.adirs.initialize();
        }

        /// The A320 EGPWC, which deselects the TERR ON ND pb-sws in terrain standby
        fn new_with_terrain_display_deselection(context: &mut InitContext) -> Self {
            let mut aircraft = Self::new(context);
            aircraft.egpwc = aircraft.egpwc.with_terrain_display_deselection_on_standby();
            aircraft
        }

        fn fail_adiru_altitude(&mut self) {
            self.adirs.altitude = Arinc429Word::new(Length::default(), SignStatus::FailureWarning);
        }

        fn gear_down(&mut self) {
            self.lgciu.set_gear_down(true);
        }

        fn set_elec_powered(&mut self, is_powered: bool) {
            self.is_elec_powered = is_powered;
        }
    }
    impl Aircraft for EgpwcTestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.powered_source_dc
                .power_with_potential(ElectricPotential::new::<volt>(24.));
            electricity.supplied_by(&self.powered_source_dc);

            if self.is_elec_powered {
                electricity.flow(&self.powered_source_dc, &self.dc_1_bus);
            }
        }

        fn update_after_power_distribution(&mut self, _: &UpdateContext) {
            self.update();
        }
    }
    impl SimulationElement for EgpwcTestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.egpwc.accept(visitor);
            visitor.visit(self);
        }
    }

    #[test]
    fn not_power_up() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);

        test_bed.write_by_name("EFIS_L_ND_RANGE", 1);
        test_bed.write_by_name("EFIS_L_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_L_ACTIVE", 1);

        test_bed.write_by_name("EFIS_R_ND_RANGE", 0);
        test_bed.write_by_name("EFIS_R_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_R_ACTIVE", 1);

        test_bed.run();

        let destination_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_DEST_LAT");
        assert!(destination_lat.is_failure_warning());
        let destination_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_DEST_LONG");
        assert!(destination_long.is_failure_warning());
        let present_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_PRESENT_LAT");
        assert!(present_lat.is_failure_warning());
        let present_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_LONG");
        assert!(present_long.is_failure_warning());
        let present_heading: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_HEADING");
        assert!(present_heading.is_failure_warning());
        let present_altitude: Arinc429Word<Length> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_ALTITUDE");
        assert!(present_altitude.is_failure_warning());
        let present_vertical_speed: Arinc429Word<Velocity> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_VERTICAL_SPEED");
        assert!(present_vertical_speed.is_failure_warning());
        let gear_down: bool = test_bed.read_by_name("EGPWC_GEAR_IS_DOWN");
        assert!(!gear_down);
        let rendering_mode: u32 = test_bed.read_by_name("EGPWC_TERRONND_RENDERING_MODE");
        assert_eq!(rendering_mode, 0);

        let nd_range_capt: f64 = test_bed.read_by_name("EGPWC_ND_L_RANGE");
        assert_eq!(nd_range_capt, 20.0);
        let nd_terr_activate_capt: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(!nd_terr_activate_capt);
        let nd_range_fo: f64 = test_bed.read_by_name("EGPWC_ND_R_RANGE");
        assert_eq!(nd_range_fo, 10.0);
        let nd_terr_activate_fo: bool = test_bed.read_by_name("EGPWC_ND_R_TERRAIN_ACTIVE");
        assert!(!nd_terr_activate_fo);
    }

    #[test]
    fn powered_up_no_sensor_data() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);

        test_bed.write_by_name("FM1_DEST_LONG_SSM", 0);
        test_bed.write_by_name("FM1_DEST_LONG", 25.3);
        test_bed.write_by_name("FM1_DEST_LAT_SSM", 0);
        test_bed.write_by_name("FM1_DEST_LAT", 60.4);

        test_bed.write_by_name("EFIS_L_ND_RANGE", 1);
        test_bed.write_by_name("EFIS_L_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_L_ACTIVE", 1);

        test_bed.write_by_name("EFIS_R_ND_RANGE", 0);
        test_bed.write_by_name("EFIS_R_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_R_ACTIVE", 1);

        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.run();

        let destination_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_DEST_LAT");
        assert!(destination_lat.is_failure_warning());
        let destination_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_DEST_LONG");
        assert!(destination_long.is_failure_warning());
        let present_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_PRESENT_LAT");
        assert!(present_lat.is_failure_warning());
        let present_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_LONG");
        assert!(present_long.is_failure_warning());
        let present_heading: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_HEADING");
        assert!(present_heading.is_failure_warning());
        let present_altitude: Arinc429Word<Length> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_ALTITUDE");
        assert!(present_altitude.is_failure_warning());
        let present_vertical_speed: Arinc429Word<Velocity> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_VERTICAL_SPEED");
        assert!(present_vertical_speed.is_failure_warning());
        let gear_down: bool = test_bed.read_by_name("EGPWC_GEAR_IS_DOWN");
        assert!(!gear_down);
        let rendering_mode: u32 = test_bed.read_by_name("EGPWC_TERRONND_RENDERING_MODE");
        assert_eq!(rendering_mode, 0);

        let nd_range_capt: f64 = test_bed.read_by_name("EGPWC_ND_L_RANGE");
        assert_eq!(nd_range_capt, 20.0);
        let nd_terr_activate_capt: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(!nd_terr_activate_capt);
        let nd_range_fo: f64 = test_bed.read_by_name("EGPWC_ND_R_RANGE");
        assert_eq!(nd_range_fo, 10.0);
        let nd_terr_activate_fo: bool = test_bed.read_by_name("EGPWC_ND_R_TERRAIN_ACTIVE");
        assert!(!nd_terr_activate_fo);
    }

    #[test]
    fn powered_up_no_destination() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);

        test_bed.write_by_name("FM1_DEST_LONG_SSM", 0);
        test_bed.write_by_name("FM1_DEST_LONG", 25.3);
        test_bed.write_by_name("FM1_DEST_LAT_SSM", 0);
        test_bed.write_by_name("FM1_DEST_LAT", 60.4);

        test_bed.write_by_name("EFIS_L_ND_RANGE", 1);
        test_bed.write_by_name("EFIS_L_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_L_ACTIVE", 1);

        test_bed.write_by_name("EFIS_R_ND_RANGE", 0);
        test_bed.write_by_name("EFIS_R_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_R_ACTIVE", 1);

        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.command(|a| a.gear_down());
        test_bed.command(|a| a.initialize_adiru());
        test_bed.run();

        let destination_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_DEST_LAT");
        assert!(destination_lat.is_failure_warning());
        let destination_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_DEST_LONG");
        assert!(destination_long.is_failure_warning());
        let present_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_PRESENT_LAT");
        assert!(present_lat.is_normal_operation());
        assert_about_eq!(present_lat.value().get::<degree>(), 20.3);
        let present_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_LONG");
        assert!(present_long.is_normal_operation());
        assert_about_eq!(present_long.value().get::<degree>(), 30.3);
        let present_heading: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_HEADING");
        assert!(present_heading.is_normal_operation());
        assert_about_eq!(present_heading.value().get::<degree>(), 310.0);
        let present_altitude: Arinc429Word<Length> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_ALTITUDE");
        assert!(present_altitude.is_normal_operation());
        assert_about_eq!(present_altitude.value().get::<foot>(), 15000.0);
        let present_vertical_speed: Arinc429Word<f64> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_VERTICAL_SPEED");
        assert!(present_vertical_speed.is_normal_operation());
        assert_about_eq!(present_vertical_speed.value(), 1300.0, 1e-4);
        let gear_down: bool = test_bed.read_by_name("EGPWC_GEAR_IS_DOWN");
        assert!(gear_down);
        let rendering_mode: u32 = test_bed.read_by_name("EGPWC_TERRONND_RENDERING_MODE");
        assert_eq!(rendering_mode, 0);

        let nd_range_capt: f64 = test_bed.read_by_name("EGPWC_ND_L_RANGE");
        assert_eq!(nd_range_capt, 20.0);
        let nd_terr_activate_capt: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(nd_terr_activate_capt);
        let nd_range_fo: f64 = test_bed.read_by_name("EGPWC_ND_R_RANGE");
        assert_eq!(nd_range_fo, 10.0);
        let nd_terr_activate_fo: bool = test_bed.read_by_name("EGPWC_ND_R_TERRAIN_ACTIVE");
        assert!(nd_terr_activate_fo);
    }

    #[test]
    fn powered_up_with_destination() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);

        test_bed.write_by_name("FM1_DEST_LONG_SSM", 3);
        test_bed.write_by_name("FM1_DEST_LONG", 25.3);
        test_bed.write_by_name("FM1_DEST_LAT_SSM", 3);
        test_bed.write_by_name("FM1_DEST_LAT", 60.4);

        test_bed.write_by_name("EFIS_L_ND_RANGE", 1);
        test_bed.write_by_name("EFIS_L_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_L_ACTIVE", 1);

        test_bed.write_by_name("EFIS_R_ND_RANGE", 0);
        test_bed.write_by_name("EFIS_R_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_R_ACTIVE", 0);

        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.command(|a| a.gear_down());
        test_bed.command(|a| a.initialize_adiru());
        test_bed.run();

        let destination_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_DEST_LAT");
        assert!(destination_lat.is_normal_operation());
        assert_about_eq!(destination_lat.value().get::<degree>(), 60.4, 1e-4);
        let destination_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_DEST_LONG");
        assert!(destination_long.is_normal_operation());
        assert_about_eq!(destination_long.value().get::<degree>(), 25.3);
        let present_lat: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("EGPWC_PRESENT_LAT");
        assert!(present_lat.is_normal_operation());
        assert_about_eq!(present_lat.value().get::<degree>(), 20.3);
        let present_long: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_LONG");
        assert!(present_long.is_normal_operation());
        assert_about_eq!(present_long.value().get::<degree>(), 30.3);
        let present_heading: Arinc429Word<Angle> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_HEADING");
        assert!(present_heading.is_normal_operation());
        assert_about_eq!(present_heading.value().get::<degree>(), 310.0);
        let present_altitude: Arinc429Word<Length> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_ALTITUDE");
        assert!(present_altitude.is_normal_operation());
        assert_about_eq!(present_altitude.value().get::<foot>(), 15000.0);
        let present_vertical_speed: Arinc429Word<f64> =
            test_bed.read_arinc429_by_name("EGPWC_PRESENT_VERTICAL_SPEED");
        assert!(present_vertical_speed.is_normal_operation());
        assert_about_eq!(present_vertical_speed.value(), 1300.0, 1e-4);
        let gear_down: bool = test_bed.read_by_name("EGPWC_GEAR_IS_DOWN");
        assert!(gear_down);
        let rendering_mode: u32 = test_bed.read_by_name("EGPWC_TERRONND_RENDERING_MODE");
        assert_eq!(rendering_mode, 0);

        let nd_range_capt: f64 = test_bed.read_by_name("EGPWC_ND_L_RANGE");
        assert_eq!(nd_range_capt, 20.0);
        let nd_terr_activate_capt: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(nd_terr_activate_capt);
        let nd_range_fo: f64 = test_bed.read_by_name("EGPWC_ND_R_RANGE");
        assert_eq!(nd_range_fo, 10.0);
        let nd_terr_activate_fo: bool = test_bed.read_by_name("EGPWC_ND_R_TERRAIN_ACTIVE");
        assert!(!nd_terr_activate_fo);
    }

    fn terrain_standby(test_bed: &mut SimulationTestBed<EgpwcTestAircraft>) -> bool {
        test_bed.read_by_name("EGPWC_TERR_STBY")
    }

    fn select_terrain_on_both_nds(test_bed: &mut SimulationTestBed<EgpwcTestAircraft>) {
        test_bed.write_by_name("EFIS_L_ND_RANGE", 1);
        test_bed.write_by_name("EFIS_L_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_L_ACTIVE", 1);
        test_bed.write_by_name("EFIS_R_ND_RANGE", 1);
        test_bed.write_by_name("EFIS_R_ND_MODE", 3);
        test_bed.write_by_name("EFIS_TERR_R_ACTIVE", 1);
    }

    #[test]
    // A320 FCOM DSC-34-SURV-40-40 (a320_fcom.txt l.55563-55564): TERR STBY "when any required predictive function input
    // is missing or considered invalid"
    fn terrain_standby_while_the_position_data_are_invalid() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);
        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.run();
        // ADIRU 1 not aligned, no position
        assert!(terrain_standby(&mut test_bed));

        test_bed.command(|a| a.initialize_adiru());
        test_bed.run();
        assert!(!terrain_standby(&mut test_bed));

        // one input lost: the ADR 1 altitude
        test_bed.command(|a| a.fail_adiru_altitude());
        test_bed.run();
        assert!(terrain_standby(&mut test_bed));
    }

    #[test]
    fn no_terrain_standby_without_power() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);
        test_bed.run();
        assert!(!terrain_standby(&mut test_bed));
    }

    #[test]
    // TERR ON ND "ON: The terrain is displayed on the ND if the: ... TERR STBY ECAM memo is not displayed"
    // (l.55509-55512)
    fn no_terrain_on_nd_in_terrain_standby() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);
        select_terrain_on_both_nds(&mut test_bed);
        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.command(|a| a.initialize_adiru());
        test_bed.run();
        let terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(terrain_active);

        test_bed.command(|a| a.fail_adiru_altitude());
        test_bed.run();
        let terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(!terrain_active);
    }

    #[test]
    // "If selected, the terrain data display on the ND is automatically deselected when the TERR STBY memo is
    // triggered" (l.55565-55566)
    fn terrain_standby_deselects_the_terr_on_nd_pbs_when_enabled() {
        let mut test_bed =
            SimulationTestBed::new(EgpwcTestAircraft::new_with_terrain_display_deselection);
        select_terrain_on_both_nds(&mut test_bed);
        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.command(|a| a.initialize_adiru());
        test_bed.run();
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        assert!(capt_pb);

        test_bed.command(|a| a.fail_adiru_altitude());
        test_bed.run();
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        let fo_pb: bool = test_bed.read_by_name("EFIS_TERR_R_ACTIVE");
        assert!(!capt_pb);
        assert!(!fo_pb);
    }

    #[test]
    // TERR ON ND "ON: The terrain is displayed on the ND if the: TERR pb-sw is selected ON, and TERR FAULT light is not
    // on" (a320_fcom.txt:55509-55511); TERR FAULT light: "The terrain is not shown on the ND" (l.55467-55468)
    fn no_terrain_on_nd_without_the_terrain_functions() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);
        select_terrain_on_both_nds(&mut test_bed);
        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.command(|a| a.initialize_adiru());
        test_bed.run();
        let terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(terrain_active);

        test_bed.command(|a| a.set_terrain_functions_available(false));
        test_bed.run();
        let capt_terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        let fo_terrain_active: bool = test_bed.read_by_name("EGPWC_ND_R_TERRAIN_ACTIVE");
        assert!(!capt_terrain_active);
        assert!(!fo_terrain_active);
        // Not a terrain standby: the TERR ON ND pb-sws stay selected and come back with the terrain functions
        assert!(!terrain_standby(&mut test_bed));
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        assert!(capt_pb);

        test_bed.command(|a| a.set_terrain_functions_available(true));
        test_bed.run();
        let terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(terrain_active);
    }

    #[test]
    fn terrain_standby_keeps_the_terr_on_nd_pbs_without_the_deselection() {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);
        select_terrain_on_both_nds(&mut test_bed);
        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.run();
        assert!(terrain_standby(&mut test_bed));
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        assert!(capt_pb);
    }
    fn powered_with_aligned_adiru() -> SimulationTestBed<EgpwcTestAircraft> {
        let mut test_bed = SimulationTestBed::new(EgpwcTestAircraft::new);
        test_bed.command(|a| a.set_elec_powered(true));
        test_bed.command(|a| a.initialize_adiru());
        test_bed
    }

    #[test]
    // A caution or warning of the predictive functions shows the terrain on both NDs and lights the ON light of the
    // TERR ON ND pbs, which were OFF
    fn an_alert_of_the_predictive_functions_shows_the_terrain_automatically() {
        let mut test_bed = powered_with_aligned_adiru();
        test_bed.run();
        let terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(!terrain_active);

        test_bed.command(|a| {
            a.set_predictive_functions(PredictiveFunctionsLink {
                automatic_terrain_display: true,
                ..Default::default()
            })
        });
        test_bed.run();
        let capt_terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        let fo_terrain_active: bool = test_bed.read_by_name("EGPWC_ND_R_TERRAIN_ACTIVE");
        assert!(capt_terrain_active);
        assert!(fo_terrain_active);
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        let fo_pb: bool = test_bed.read_by_name("EFIS_TERR_R_ACTIVE");
        assert!(capt_pb);
        assert!(fo_pb);
    }

    #[test]
    fn the_crew_can_switch_the_automatic_terrain_display_off_during_the_alert() {
        let mut test_bed = powered_with_aligned_adiru();
        test_bed.command(|a| {
            a.set_predictive_functions(PredictiveFunctionsLink {
                automatic_terrain_display: true,
                ..Default::default()
            })
        });
        test_bed.run();
        test_bed.write_by_name("EFIS_TERR_L_ACTIVE", false);
        test_bed.run();
        test_bed.run();
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        assert!(!capt_pb);
    }

    #[test]
    fn the_automatic_terrain_display_needs_the_terrain_functions() {
        let mut test_bed = powered_with_aligned_adiru();
        test_bed.command(|a| {
            a.set_terrain_functions_available(false);
            a.set_predictive_functions(PredictiveFunctionsLink {
                automatic_terrain_display: true,
                ..Default::default()
            })
        });
        test_bed.run();
        let terrain_active: bool = test_bed.read_by_name("EGPWC_ND_L_TERRAIN_ACTIVE");
        assert!(!terrain_active);
        let capt_pb: bool = test_bed.read_by_name("EFIS_TERR_L_ACTIVE");
        assert!(!capt_pb);
    }

    #[test]
    // The terrain database is an input of the predictive functions: without it the EGPWC is in terrain standby
    fn terrain_standby_while_the_predictive_functions_lack_an_input() {
        let mut test_bed = powered_with_aligned_adiru();
        test_bed.run();
        assert!(!terrain_standby(&mut test_bed));

        test_bed.command(|a| {
            a.set_predictive_functions(PredictiveFunctionsLink {
                inputs_available: false,
                ..Default::default()
            })
        });
        test_bed.run();
        assert!(terrain_standby(&mut test_bed));
    }
}
