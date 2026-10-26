use systems::{
    navigation::{
        adirs::{AirDataReferenceBus, InertialReferenceBus},
        gnss::GpsReceiver,
        radio_altimeter::RadioAltimeter,
    },
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        LgciuGearExtension, LgciuWeightOnWheels,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulatorReader, UpdateContext, VariableIdentifier,
    },
    surveillance::{
        egpws::{
            predictive::{
                AircraftState, PredictiveInputs, PredictiveOutputs, PredictiveTerrainAlerting,
                ReferenceRunways, Runway, RunwayOrigin,
            },
            terrain_grid::{GridPosition, TerrainGrid, UnavailableTerrainGrid},
            EgpwsElectricalHarness,
        },
        taws::{
            TerrainAwarenessWarningSystemDiscreteInputs,
            TerrainAwarenessWarningSystemDiscreteOutput,
        },
    },
};
use uom::si::{
    angle::degree,
    f64::{Angle, Length, Velocity},
    length::{foot, nautical_mile},
    velocity::{foot_per_minute, knot},
};

pub struct A320EgpwsElectricalHarness {
    discrete_inputs: TerrainAwarenessWarningSystemDiscreteInputs,

    flaps_mode_off: bool,
    landing_flaps_3: bool,

    terr_off_id: VariableIdentifier,
    sys_off_id: VariableIdentifier,
    gs_mode_off_id: VariableIdentifier,
    flap_mode_off_id: VariableIdentifier,
    landing_flap_3_on_id: VariableIdentifier,
    gs_cancel_self_test_id: VariableIdentifier,

    sfcc_fap_1_id: VariableIdentifier,
    sfcc_fap_5_id: VariableIdentifier,

    ecam_cp_emer_canc_id: VariableIdentifier,

    slew_active_id: VariableIdentifier,
}

impl A320EgpwsElectricalHarness {
    const GPWS_TERR_OFF_KEY: &str = "GPWS_TERR_OFF";
    const GPWS_SYS_OFF_KEY: &str = "GPWS_SYS_OFF";
    const GPWS_GS_OFF_KEY: &str = "GPWS_GS_OFF";
    const GPWS_FLAP_OFF_KEY: &str = "GPWS_FLAP_OFF";
    const GPWS_FLAPS3_KEY: &str = "GPWS_FLAPS3";
    const GPWS_TEST_KEY: &str = "GPWS_TEST";
    const SFCC_1_FAP_1_KEY: &str = "SFCC_1_FAP_1";
    const SFCC_1_FAP_5_KEY: &str = "SFCC_1_FAP_5";
    const ECP_DISCRETE_OUT_EMER_CANC_KEY: &str = "ECP_DISCRETE_OUT_EMER_CANC";
    const IS_SLEW_ACTIVE_KEY: &str = "IS SLEW ACTIVE";

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            discrete_inputs: TerrainAwarenessWarningSystemDiscreteInputs::default(),

            flaps_mode_off: false,
            landing_flaps_3: false,

            terr_off_id: context.get_identifier(Self::GPWS_TERR_OFF_KEY.to_owned()),
            sys_off_id: context.get_identifier(Self::GPWS_SYS_OFF_KEY.to_owned()),
            gs_mode_off_id: context.get_identifier(Self::GPWS_GS_OFF_KEY.to_owned()),
            flap_mode_off_id: context.get_identifier(Self::GPWS_FLAP_OFF_KEY.to_owned()),
            landing_flap_3_on_id: context.get_identifier(Self::GPWS_FLAPS3_KEY.to_owned()),
            gs_cancel_self_test_id: context.get_identifier(Self::GPWS_TEST_KEY.to_owned()),

            sfcc_fap_1_id: context.get_identifier(Self::SFCC_1_FAP_1_KEY.to_owned()),
            sfcc_fap_5_id: context.get_identifier(Self::SFCC_1_FAP_5_KEY.to_owned()),

            ecam_cp_emer_canc_id: context
                .get_identifier(Self::ECP_DISCRETE_OUT_EMER_CANC_KEY.to_owned()),

            slew_active_id: context.get_identifier(Self::IS_SLEW_ACTIVE_KEY.to_owned()),
        }
    }

    pub fn update(&mut self, lgciu: &impl LgciuGearExtension) {
        self.discrete_inputs.landing_gear_downlocked = lgciu.left_down_and_locked();
        self.discrete_inputs.wx_radar_1_off = false; // TODO
        self.discrete_inputs.wx_radar_2_off = false; // TODO
        self.discrete_inputs.terrain_display_select_1 = false; // TODO
        self.discrete_inputs.terrain_display_select_2 = false; // TODO
        self.discrete_inputs.steep_approach_mode = false; // TODO
        self.discrete_inputs.audio_inhibit = false; // TODO: Comes from FWC during e.g. STALL STALL
    }

    /// The terrain awareness functions of the EGPWS work, for the terrain display on the NDs (the ND terrain picture
    /// of the enhanced_gpwc): the TERR pb-sw is not OFF and the TERR FAULT light is off (a failed or unpowered EGPWS
    /// lights it). A320 FCOM DSC-34-SURV-40-40, a320_fcom.txt:55447, 55467-55468, 55509-55511.
    pub fn terrain_functions_available(
        &self,
        egpws: &impl TerrainAwarenessWarningSystemDiscreteOutput,
    ) -> bool {
        terrain_functions_available(
            self.discrete_inputs.terrain_awareness_inhibit,
            egpws.discrete_outputs().terrain_inop,
        )
    }
}

/// `terr_pb_off`: the TERR pb-sw is OFF; `terr_fault`: the EGPWS TERR FAULT discrete (L:A32NX_GPWS_TERR_FAULT)
fn terrain_functions_available(terr_pb_off: bool, terr_fault: bool) -> bool {
    !terr_pb_off && !terr_fault
}
impl EgpwsElectricalHarness for A320EgpwsElectricalHarness {
    fn discrete_inputs(&self) -> &TerrainAwarenessWarningSystemDiscreteInputs {
        &self.discrete_inputs
    }
}
impl SimulationElement for A320EgpwsElectricalHarness {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.flaps_mode_off = reader.read(&self.flap_mode_off_id);
        self.landing_flaps_3 = reader.read(&self.landing_flap_3_on_id);

        self.discrete_inputs.glideslope_inhibit = reader.read(&self.gs_mode_off_id);
        self.discrete_inputs.gpws_inhibit = reader.read(&self.sys_off_id);
        self.discrete_inputs.momentary_audio_suppression = reader.read(&self.ecam_cp_emer_canc_id);
        self.discrete_inputs.self_test = reader.read(&self.gs_cancel_self_test_id);
        self.discrete_inputs.landing_flaps = if self.flaps_mode_off {
            true
        } else if self.landing_flaps_3 {
            // TODO the SFCC discrete outputs are not exposed directly, and I can't be bothered to implement this right now
            reader.read(&self.sfcc_fap_5_id)
        } else {
            reader.read(&self.sfcc_fap_1_id)
        };
        self.discrete_inputs.gs_cancel = reader.read(&self.gs_cancel_self_test_id);
        self.discrete_inputs.terrain_awareness_inhibit = reader.read(&self.terr_off_id);
        self.discrete_inputs.sim_reposition_active = reader.read(&self.slew_active_id);
    }
}

/// Where the predictive terrain functions (terrain ahead alerting, terrain clearance floor) of the A320 get their data
/// from: the GPS for the position and the geometric altitude, the inertial reference for the track, speed and
/// vertical speed, and the FMGC for the destination runway.
pub struct A320PredictiveTerrain {
    grid: Box<dyn TerrainGrid>,
    alerting: PredictiveTerrainAlerting,
    runways: ReferenceRunways,
    outputs: PredictiveOutputs,

    destination_latitude: Arinc429Word<Angle>,
    destination_longitude: Arinc429Word<Angle>,
    landing_elevation: Arinc429Word<Length>,
    destination_latitude_id: VariableIdentifier,
    destination_longitude_id: VariableIdentifier,
    landing_elevation_id: VariableIdentifier,
}

impl A320PredictiveTerrain {
    const DESTINATION_LATITUDE_KEY: &str = "FM1_DEST_LAT";
    const DESTINATION_LONGITUDE_KEY: &str = "FM1_DEST_LONG";
    const LANDING_ELEVATION_KEY: &str = "FM1_LANDING_ELEVATION";

    /// Design choice: the predictive functions need a position that is better than half a terrain cell (1 NM), so that
    /// the cell the aircraft is over is the cell the grid is read at. The threshold of the FMGC position accuracy
    /// that deactivates them is not published.
    const MAXIMUM_POSITION_UNCERTAINTY_NM: f64 = 0.5;

    pub fn new(context: &mut InitContext, grid: Box<dyn TerrainGrid>) -> Self {
        Self {
            grid,
            alerting: PredictiveTerrainAlerting::new(),
            runways: ReferenceRunways::default(),
            outputs: PredictiveOutputs::default(),

            destination_latitude: Arinc429Word::new(Angle::default(), SignStatus::NoComputedData),
            destination_longitude: Arinc429Word::new(Angle::default(), SignStatus::NoComputedData),
            landing_elevation: Arinc429Word::new(Length::default(), SignStatus::NoComputedData),
            destination_latitude_id: context
                .get_identifier(Self::DESTINATION_LATITUDE_KEY.to_owned()),
            destination_longitude_id: context
                .get_identifier(Self::DESTINATION_LONGITUDE_KEY.to_owned()),
            landing_elevation_id: context.get_identifier(Self::LANDING_ELEVATION_KEY.to_owned()),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update(
        &mut self,
        context: &UpdateContext,
        gps: &GpsReceiver,
        inertial_reference: &impl InertialReferenceBus,
        air_data: &impl AirDataReferenceBus,
        lgciu: &impl LgciuWeightOnWheels,
        radio_altimeter_1: &impl RadioAltimeter,
        radio_altimeter_2: &impl RadioAltimeter,
        discrete_inputs: &TerrainAwarenessWarningSystemDiscreteInputs,
    ) {
        let on_ground = lgciu.left_and_right_gear_compressed(true);
        let aircraft = aircraft_state(
            &GpsData {
                latitude: gps.latitude(),
                longitude: gps.longitude(),
                altitude: gps.altitude(),
                ground_speed: gps.ground_speed(),
                true_track: gps.true_track(),
            },
            &InertialData {
                ground_speed: inertial_reference.ground_speed(),
                true_track: inertial_reference.true_track(),
                vertical_speed_fpm: inertial_reference
                    .inertial_vertical_speed()
                    .normal_value()
                    .or_else(|| air_data.vertical_speed().normal_value())
                    .map(|speed| speed.get::<foot_per_minute>()),
            },
        );

        if let Some(aircraft) = aircraft {
            self.grid.update(context.delta(), aircraft.position);
            self.runways.departure_latch_mut().update(
                on_ground,
                aircraft.ground_speed_kt,
                aircraft.position,
                aircraft.geometric_altitude_ft,
            );
        }
        self.runways.set_destination(destination_runway(
            self.destination_latitude,
            self.destination_longitude,
            self.landing_elevation,
        ));

        let inputs = PredictiveInputs {
            aircraft,
            radio_altitude_ft: radio_altitude_ft(radio_altimeter_1, radio_altimeter_2),
            position_accuracy_sufficient: position_accuracy_sufficient(
                gps.horizontal_figure_of_merit(),
            ),
            on_ground,
            gear_downlocked: discrete_inputs.landing_gear_downlocked,
            landing_flaps: discrete_inputs.landing_flaps,
            terrain_off: discrete_inputs.terrain_awareness_inhibit,
        };
        self.outputs = self
            .alerting
            .update(context.delta(), &inputs, &*self.grid, &self.runways);
    }

    pub fn outputs(&self) -> &PredictiveOutputs {
        &self.outputs
    }
}

impl SimulationElement for A320PredictiveTerrain {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.destination_latitude = reader.read_arinc429(&self.destination_latitude_id);
        self.destination_longitude = reader.read_arinc429(&self.destination_longitude_id);
        self.landing_elevation = reader.read_arinc429(&self.landing_elevation_id);
    }
}

struct GpsData {
    latitude: Arinc429Word<Angle>,
    longitude: Arinc429Word<Angle>,
    altitude: Arinc429Word<Length>,
    ground_speed: Arinc429Word<Velocity>,
    true_track: Arinc429Word<Angle>,
}

struct InertialData {
    ground_speed: Arinc429Word<Velocity>,
    true_track: Arinc429Word<Angle>,
    /// The inertial vertical speed, or the barometric one without it
    vertical_speed_fpm: Option<f64>,
}

/// The position and the geometric altitude are the GPS ones, which are the ones that compare with the terrain grid.
/// The track and the ground speed are the inertial ones, which are smoother, with the GPS ones as the replacement.
fn aircraft_state(gps: &GpsData, inertial: &InertialData) -> Option<AircraftState> {
    Some(AircraftState {
        position: GridPosition::new(
            gps.latitude.normal_value()?.get::<degree>(),
            gps.longitude.normal_value()?.get::<degree>(),
        ),
        geometric_altitude_ft: gps.altitude.normal_value()?.get::<foot>(),
        ground_speed_kt: inertial
            .ground_speed
            .normal_value()
            .or_else(|| gps.ground_speed.normal_value())?
            .get::<knot>(),
        true_track_deg: inertial
            .true_track
            .normal_value()
            .or_else(|| gps.true_track.normal_value())?
            .get::<degree>(),
        vertical_speed_fpm: inertial.vertical_speed_fpm?,
    })
}

fn position_accuracy_sufficient(horizontal_figure_of_merit: Arinc429Word<Length>) -> bool {
    horizontal_figure_of_merit
        .normal_value()
        .is_some_and(|accuracy| {
            accuracy.get::<nautical_mile>()
                <= A320PredictiveTerrain::MAXIMUM_POSITION_UNCERTAINTY_NM
        })
}

/// The runway threshold the FMGC sends to the EGPWC for its destination, with the landing elevation. The FMGC sends
/// the airport reference point when the flight plan has no destination runway.
fn destination_runway(
    latitude: Arinc429Word<Angle>,
    longitude: Arinc429Word<Angle>,
    landing_elevation: Arinc429Word<Length>,
) -> Option<Runway> {
    Some(Runway {
        reference_point: GridPosition::new(
            latitude.normal_value()?.get::<degree>(),
            longitude.normal_value()?.get::<degree>(),
        ),
        elevation_ft: landing_elevation.normal_value()?.get::<foot>(),
        origin: RunwayOrigin::Destination,
    })
}

fn radio_altitude_ft(
    radio_altimeter_1: &impl RadioAltimeter,
    radio_altimeter_2: &impl RadioAltimeter,
) -> Option<f64> {
    radio_altimeter_1
        .radio_altitude()
        .normal_value()
        .or_else(|| radio_altimeter_2.radio_altitude().normal_value())
        .map(|height| height.get::<foot>())
}

/// The terrain source of an aircraft without a grid file reader, for the tests and the platforms without the
/// simulator file access.
pub fn unavailable_terrain_grid() -> Box<dyn TerrainGrid> {
    Box::new(UnavailableTerrainGrid)
}

#[cfg(test)]
mod predictive_tests {
    use super::*;
    use systems::surveillance::egpws::predictive::RunwayOrigin;

    fn word<T: Copy>(value: T, status: SignStatus) -> Arinc429Word<T> {
        Arinc429Word::new(value, status)
    }

    fn valid_gps() -> GpsData {
        GpsData {
            latitude: word(Angle::new::<degree>(46.), SignStatus::NormalOperation),
            longitude: word(Angle::new::<degree>(8.), SignStatus::NormalOperation),
            altitude: word(Length::new::<foot>(9_000.), SignStatus::NormalOperation),
            ground_speed: word(Velocity::new::<knot>(240.), SignStatus::NormalOperation),
            true_track: word(Angle::new::<degree>(10.), SignStatus::NormalOperation),
        }
    }

    fn valid_inertial() -> InertialData {
        InertialData {
            ground_speed: word(Velocity::new::<knot>(250.), SignStatus::NormalOperation),
            true_track: word(Angle::new::<degree>(12.), SignStatus::NormalOperation),
            vertical_speed_fpm: Some(-500.),
        }
    }

    #[test]
    fn the_position_and_altitude_are_the_gps_ones_and_the_track_and_speed_the_inertial_ones() {
        let state = aircraft_state(&valid_gps(), &valid_inertial()).unwrap();
        assert_eq!(state.position, GridPosition::new(46., 8.));
        assert_eq!(state.geometric_altitude_ft, 9_000.);
        assert!((state.ground_speed_kt - 250.).abs() < 0.001);
        assert!((state.true_track_deg - 12.).abs() < 0.001);
        assert_eq!(state.vertical_speed_fpm, -500.);
    }

    #[test]
    fn the_gps_track_and_speed_replace_lost_inertial_ones() {
        let mut inertial = valid_inertial();
        inertial.ground_speed = word(Velocity::default(), SignStatus::FailureWarning);
        inertial.true_track = word(Angle::default(), SignStatus::NoComputedData);
        let state = aircraft_state(&valid_gps(), &inertial).unwrap();
        assert!((state.ground_speed_kt - 240.).abs() < 0.001);
        assert!((state.true_track_deg - 10.).abs() < 0.001);
    }

    #[test]
    fn without_a_gps_position_or_altitude_there_is_no_aircraft_state() {
        let mut gps = valid_gps();
        gps.latitude = word(Angle::default(), SignStatus::NoComputedData);
        assert!(aircraft_state(&gps, &valid_inertial()).is_none());

        let mut gps = valid_gps();
        gps.altitude = word(Length::default(), SignStatus::FailureWarning);
        assert!(aircraft_state(&gps, &valid_inertial()).is_none());
    }

    #[test]
    fn without_a_vertical_speed_there_is_no_aircraft_state() {
        let mut inertial = valid_inertial();
        inertial.vertical_speed_fpm = None;
        assert!(aircraft_state(&valid_gps(), &inertial).is_none());
    }

    #[test]
    fn the_position_is_accurate_enough_up_to_half_a_nautical_mile() {
        let accuracy = |nm: f64, status| word(Length::new::<nautical_mile>(nm), status);
        assert!(position_accuracy_sufficient(accuracy(
            0.01,
            SignStatus::NormalOperation
        )));
        assert!(position_accuracy_sufficient(accuracy(
            0.5,
            SignStatus::NormalOperation
        )));
        assert!(!position_accuracy_sufficient(accuracy(
            0.6,
            SignStatus::NormalOperation
        )));
        assert!(!position_accuracy_sufficient(accuracy(
            0.01,
            SignStatus::NoComputedData
        )));
    }

    #[test]
    fn the_destination_runway_needs_the_position_and_the_elevation() {
        let latitude = word(Angle::new::<degree>(47.), SignStatus::NormalOperation);
        let longitude = word(Angle::new::<degree>(8.5), SignStatus::NormalOperation);
        let elevation = word(Length::new::<foot>(1_200.), SignStatus::NormalOperation);

        let runway = destination_runway(latitude, longitude, elevation).unwrap();
        assert_eq!(runway.reference_point, GridPosition::new(47., 8.5));
        assert!((runway.elevation_ft - 1_200.).abs() < 1e-6);
        assert_eq!(runway.origin, RunwayOrigin::Destination);

        let missing = word(Length::default(), SignStatus::NoComputedData);
        assert!(destination_runway(latitude, longitude, missing).is_none());
        let no_longitude = word(Angle::default(), SignStatus::NoComputedData);
        assert!(destination_runway(latitude, no_longitude, elevation).is_none());
    }

    struct FixedRadioAltimeter(Arinc429Word<Length>);
    impl RadioAltimeter for FixedRadioAltimeter {
        fn radio_altitude(&self) -> Arinc429Word<Length> {
            self.0
        }
    }

    #[test]
    fn the_radio_altitude_comes_from_radio_altimeter_1_or_else_2() {
        let valid = |feet| {
            FixedRadioAltimeter(word(Length::new::<foot>(feet), SignStatus::NormalOperation))
        };
        let failed = FixedRadioAltimeter(word(Length::default(), SignStatus::FailureWarning));

        assert_eq!(
            radio_altitude_ft(&valid(100.), &valid(200.)).map(f64::round),
            Some(100.)
        );
        assert_eq!(
            radio_altitude_ft(&failed, &valid(200.)).map(f64::round),
            Some(200.)
        );
        assert_eq!(radio_altitude_ft(&failed, &failed), None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terrain_functions_need_the_terr_pb_on_and_no_terr_fault() {
        assert!(terrain_functions_available(false, false));
        assert!(!terrain_functions_available(true, false));
        assert!(!terrain_functions_available(false, true));
        assert!(!terrain_functions_available(true, true));
    }
}
