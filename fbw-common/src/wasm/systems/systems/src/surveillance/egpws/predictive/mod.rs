//! The predictive terrain functions of the EGPWS: the terrain look-ahead alerting (TAD) and the terrain clearance
//! floor (TCF), working from the terrain grid and the position of the aircraft.
//!
//! While these functions are operative the basic mode 2 of the EGPWS is inhibited (see [`PredictiveFunctionsStatus`]).
//! They are not operative without a position of sufficient accuracy, a geometric altitude, the terrain around the
//! aircraft, or with the TERR pushbutton OFF.

mod alert_logic;
mod geometry;
mod landing_tunnel;
mod manoeuvre;
mod mountainous_approach;
mod phase;
mod runway;
#[cfg(test)]
mod scenario_study;
mod tad_scan;
mod tcf;
mod terrain_margin;
#[cfg(test)]
mod test_support;
mod threat_areas;

pub use alert_logic::{PredictiveVoice, TerrainAheadMessage};
pub use runway::{
    DepartureRunwayLatch, ReferenceRunways, Runway, RunwayGeometry, RunwayOrigin, RunwaySource,
};
pub use threat_areas::{GridCell, ThreatAreas, ThreatCell, ThreatLevel};

use super::{
    runtime::PredictiveFunctionsStatus,
    terrain_grid::{GridPosition, TerrainElevationSource, TerrainSample},
};
use crate::shared::low_pass_filter::LowPassFilter;
use alert_logic::TadAlertLogic;
use geometry::signed_angle_difference_deg;
use mountainous_approach::MountainousApproachAreas;
use phase::TerrainPhase;
use runway::RunwayContext;
use std::time::Duration;
use tad_scan::{scan, TadScan, TadScanInput};
use tcf::{FloorEvaluation, TerrainClearanceFloor};
use terrain_margin::TerrainMargin;

/// What the aircraft is doing, from the best position, altitude and track data available.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AircraftState {
    pub position: GridPosition,
    /// Altitude above mean sea level from the satellite navigation, not the barometric altitude: a barometric altitude
    /// carries the error of the altimeter setting and the temperature, which is as large as the clearance margins.
    pub geometric_altitude_ft: f64,
    pub ground_speed_kt: f64,
    pub true_track_deg: f64,
    pub vertical_speed_fpm: f64,
}

pub struct PredictiveInputs {
    /// None when the position, the geometric altitude, the track or the speed is not valid
    pub aircraft: Option<AircraftState>,
    /// None when the radio altimeter is not valid
    pub radio_altitude_ft: Option<f64>,
    /// The position is accurate enough for the predictive functions
    pub position_accuracy_sufficient: bool,
    pub on_ground: bool,
    pub gear_downlocked: bool,
    pub landing_flaps: bool,
    /// The TERR pushbutton is OFF
    pub terrain_off: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PredictiveAlertOutputs {
    pub voice: PredictiveVoice,
    /// The red PULL UP light
    pub warning_light: bool,
    /// The amber GPWS light
    pub caution_light: bool,
    /// The terrain is shown on both NDs
    pub automatic_terrain_display: bool,
    pub nd_message: TerrainAheadMessage,
    /// The terrain of the alert, shown on the NDs while TERR AHEAD is on
    pub threat_areas: ThreatAreas,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PredictiveOutputs {
    pub functions: PredictiveFunctionsStatus,
    /// Everything the functions need is there. When it is not, the TERR STBY memo is shown. Different from
    /// `functions.operative`, which is also off with the TERR pushbutton OFF.
    pub inputs_available: bool,
    pub alerts: PredictiveAlertOutputs,
}

/// Turn rate of the track, filtered. The direction of the turn comes from the track itself, so it does not depend on
/// the sign convention of a roll angle.
struct TrackRate {
    previous_track_deg: Option<f64>,
    rate: LowPassFilter<f64>,
}

impl TrackRate {
    /// Design choice: long enough to smooth the steps of the track data, short enough to follow a turn entry.
    const FILTER_TIME_CONSTANT: Duration = Duration::from_secs(2);

    fn new() -> Self {
        Self {
            previous_track_deg: None,
            rate: LowPassFilter::new(Self::FILTER_TIME_CONSTANT),
        }
    }

    fn update(&mut self, delta: Duration, track_deg: Option<f64>) -> f64 {
        let Some(track_deg) = track_deg else {
            self.previous_track_deg = None;
            self.rate.reset(0.);
            return 0.;
        };
        if let Some(previous) = self.previous_track_deg {
            if !delta.is_zero() {
                let change = signed_angle_difference_deg(previous, track_deg);
                self.rate.update(delta, change / delta.as_secs_f64());
            }
        }
        self.previous_track_deg = Some(track_deg);
        self.rate.output()
    }
}

/// Whether everything the functions need is there, held steady: the terrain of a block that is still being read, or a
/// position that drops out for a moment, must not make the TERR STBY memo flicker and the EGPWC reset the crew's
/// TERR ON ND pushbuttons over and over.
struct InputsAvailability {
    /// None until the first update, which takes the value as it is
    state: Option<bool>,
    disagreeing_for: Duration,
}

impl InputsAvailability {
    /// Design choice: the standby comes after the inputs have been missing for this long. The blocks around the aircraft
    /// are read one at a time, so a block that comes into the window takes a moment.
    const STANDBY_DELAY: Duration = Duration::from_secs(3);
    /// Design choice: the functions come back after the inputs have been there for this long.
    const RECOVERY_DELAY: Duration = Duration::from_secs(1);

    fn new() -> Self {
        Self {
            state: None,
            disagreeing_for: Duration::ZERO,
        }
    }

    fn update(&mut self, delta: Duration, inputs_present: bool) -> bool {
        let Some(state) = self.state else {
            self.state = Some(inputs_present);
            return inputs_present;
        };
        if inputs_present == state {
            self.disagreeing_for = Duration::ZERO;
            return state;
        }
        self.disagreeing_for += delta;
        let delay = if inputs_present {
            Self::RECOVERY_DELAY
        } else {
            Self::STANDBY_DELAY
        };
        if self.disagreeing_for >= delay {
            self.state = Some(inputs_present);
            self.disagreeing_for = Duration::ZERO;
            return inputs_present;
        }
        state
    }
}

pub struct PredictiveTerrainAlerting {
    margin: TerrainMargin,
    availability: InputsAvailability,
    track_rate: TrackRate,
    mountainous_areas: MountainousApproachAreas,
    tad_logic: TadAlertLogic,
    terrain_clearance_floor: TerrainClearanceFloor,
    time_since_scan: Duration,
    last_scan: TadScan,
    /// The scans since the alerts went off were made on the ground or with the functions inhibited, so the next one,
    /// when the alerts can come on, has to be made at once. A scan from the roll of a takeoff would still hold the
    /// threat of the level flight on the runway when the aircraft lifts off.
    fresh_scan_needed: bool,
}

impl Default for PredictiveTerrainAlerting {
    fn default() -> Self {
        Self::new()
    }
}

impl PredictiveTerrainAlerting {
    /// Design choice: alerts are updated at least once per second (TSO-C151c), the scan is done twice as often.
    const SCAN_INTERVAL: Duration = Duration::from_millis(500);

    pub fn new() -> Self {
        Self::with_margin(TerrainMargin::for_grid_peak_error())
    }

    fn with_margin(margin: TerrainMargin) -> Self {
        Self {
            margin,
            availability: InputsAvailability::new(),
            track_rate: TrackRate::new(),
            mountainous_areas: MountainousApproachAreas::default(),
            tad_logic: TadAlertLogic::new(),
            terrain_clearance_floor: TerrainClearanceFloor::default(),
            time_since_scan: Self::SCAN_INTERVAL,
            last_scan: TadScan::default(),
            fresh_scan_needed: true,
        }
    }

    pub fn update(
        &mut self,
        delta: Duration,
        inputs: &PredictiveInputs,
        terrain: &dyn TerrainElevationSource,
        runways: &dyn RunwaySource,
    ) -> PredictiveOutputs {
        let aircraft = inputs
            .aircraft
            .filter(|_| inputs.position_accuracy_sufficient);
        let turn_rate = self
            .track_rate
            .update(delta, aircraft.map(|aircraft| aircraft.true_track_deg));

        let terrain_below_aircraft =
            aircraft.and_then(
                |aircraft| match terrain.max_elevation_at(aircraft.position) {
                    TerrainSample::ElevationFeet(elevation_ft) => Some(elevation_ft),
                    _ => None,
                },
            );
        let runway = aircraft.and_then(|aircraft| {
            RunwayContext::nearest(
                &runways.runways(),
                aircraft.position,
                aircraft.geometric_altitude_ft,
            )
        });
        // The terrain is scanned whenever there is terrain to scan, also while the functions are not operative: how
        // much of the ribbon is missing from the grid decides whether they can become operative
        if self.fresh_scan_needed && !inputs.on_ground && !inputs.terrain_off {
            self.fresh_scan_needed = false;
            self.time_since_scan = Self::SCAN_INTERVAL;
        }
        self.refresh_scan(
            delta,
            aircraft.filter(|_| terrain_below_aircraft.is_some()),
            turn_rate,
            terrain,
            runway.as_ref(),
        );
        let inputs_available = self.availability.update(
            delta,
            terrain_below_aircraft.is_some() && !self.last_scan.data_missing,
        );
        let operative = inputs_available && !inputs.terrain_off;
        let computed_height_above_terrain_ft = aircraft
            .zip(terrain_below_aircraft)
            .map(|(aircraft, elevation_ft)| aircraft.geometric_altitude_ft - elevation_ft);

        let functions = PredictiveFunctionsStatus {
            operative,
            computed_height_above_terrain_ft,
        };

        let alerts = match aircraft {
            Some(aircraft) if operative && !inputs.on_ground => {
                self.alert(delta, inputs, &aircraft, runway)
            }
            _ => self.reset_alerts(inputs),
        };

        PredictiveOutputs {
            functions,
            inputs_available,
            alerts,
        }
    }

    fn alert(
        &mut self,
        delta: Duration,
        inputs: &PredictiveInputs,
        aircraft: &AircraftState,
        runway: Option<RunwayContext>,
    ) -> PredictiveAlertOutputs {
        let inside_landing_tunnel = runway.as_ref().is_some_and(|runway| {
            landing_tunnel::is_inhibiting(
                runway,
                &landing_tunnel::LandingTunnelInputs {
                    aircraft_position: aircraft.position,
                    true_track_deg: aircraft.true_track_deg,
                    gear_downlocked: inputs.gear_downlocked,
                    landing_flaps: inputs.landing_flaps,
                },
            )
        });

        let no_threats = TadScan::default();
        let threats = if inside_landing_tunnel {
            &no_threats
        } else {
            &self.last_scan
        };
        let tad = self.tad_logic.update(delta, threats);
        let threat_areas = match tad.nd_message {
            TerrainAheadMessage::None => ThreatAreas::default(),
            _ => ThreatAreas::of(aircraft.position, &threats.threat_cells, tad.avoid_terrain),
        };

        let floor_evaluation = runway
            .filter(|runway| !inside_landing_tunnel && !runway.is_in_departure_runway_area())
            .map(|runway| FloorEvaluation {
                radio_altitude_ft: inputs.radio_altitude_ft,
                height_above_runway_ft: runway.height_above_runway_ft,
                distance_to_runway_nm: runway.distance_nm,
                is_destination_runway: runway.runway.origin == RunwayOrigin::Destination,
            });
        self.terrain_clearance_floor
            .update(delta, floor_evaluation.as_ref());

        let floor_voice = if self.terrain_clearance_floor.is_saying_too_low_terrain() {
            PredictiveVoice::TooLowTerrain
        } else {
            PredictiveVoice::None
        };
        PredictiveAlertOutputs {
            // A word of the look-ahead goes before the word of the floor
            voice: if tad.voice != PredictiveVoice::None {
                tad.voice
            } else {
                floor_voice
            },
            warning_light: tad.warning_light,
            caution_light: tad.caution_light || self.terrain_clearance_floor.is_alerting(),
            automatic_terrain_display: tad.automatic_terrain_display,
            nd_message: tad.nd_message,
            threat_areas,
        }
    }

    /// Scans the terrain twice a second. Without an aircraft over known terrain there is nothing to scan, and the next
    /// scan comes at once when there is.
    fn refresh_scan(
        &mut self,
        delta: Duration,
        aircraft: Option<AircraftState>,
        turn_rate_deg_per_s: f64,
        terrain: &dyn TerrainElevationSource,
        runway: Option<&RunwayContext>,
    ) {
        let Some(aircraft) = aircraft else {
            self.last_scan = TadScan::default();
            self.time_since_scan = Self::SCAN_INTERVAL;
            return;
        };
        self.time_since_scan += delta;
        if self.time_since_scan >= Self::SCAN_INTERVAL {
            self.time_since_scan = Duration::ZERO;
            self.last_scan = self.scan_terrain(&aircraft, turn_rate_deg_per_s, terrain, runway);
        }
    }

    fn scan_terrain(
        &mut self,
        aircraft: &AircraftState,
        turn_rate_deg_per_s: f64,
        terrain: &dyn TerrainElevationSource,
        runway: Option<&RunwayContext>,
    ) -> TadScan {
        let mountainous = runway
            .and_then(|runway| {
                self.mountainous_areas
                    .is_mountainous(terrain, &runway.runway)
            })
            .unwrap_or(false);
        scan(
            &TadScanInput {
                aircraft,
                turn_rate_deg_per_s,
                phase: TerrainPhase::determine(runway),
                warning_look_ahead_s: mountainous_approach::warning_look_ahead_s(
                    mountainous,
                    runway,
                ),
                margin: self.margin,
                runway,
            },
            terrain,
        )
    }

    /// The functions are off: no alert at all, not even the hold that keeps an alert on for a moment.
    fn reset_alerts(&mut self, inputs: &PredictiveInputs) -> PredictiveAlertOutputs {
        // Scans made in the air are as good as any, the ones on the ground are not
        if inputs.on_ground || inputs.terrain_off {
            self.fresh_scan_needed = true;
        }
        self.tad_logic.reset();
        self.terrain_clearance_floor = TerrainClearanceFloor::default();
        PredictiveAlertOutputs::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use geometry::offset_position;
    use runway::StaticRunways;
    use std::{cell::Cell, rc::Rc};
    use test_support::TestTerrain;

    const STEP: Duration = Duration::from_millis(100);
    const START: GridPosition = GridPosition {
        latitude_degrees: 46.,
        longitude_degrees: 8.,
    };

    fn flying(altitude_ft: f64) -> PredictiveInputs {
        PredictiveInputs {
            aircraft: Some(AircraftState {
                position: START,
                geometric_altitude_ft: altitude_ft,
                ground_speed_kt: 250.,
                true_track_deg: 0.,
                vertical_speed_fpm: 0.,
            }),
            radio_altitude_ft: Some(altitude_ft),
            position_accuracy_sufficient: true,
            on_ground: false,
            gear_downlocked: false,
            landing_flaps: false,
            terrain_off: false,
        }
    }

    fn no_runways() -> StaticRunways {
        StaticRunways(Vec::new())
    }

    fn alerting() -> PredictiveTerrainAlerting {
        PredictiveTerrainAlerting::with_margin(TerrainMargin::none())
    }

    fn run(
        alerting: &mut PredictiveTerrainAlerting,
        inputs: &PredictiveInputs,
        terrain: &TestTerrain,
        runways: &StaticRunways,
        seconds: f64,
    ) -> PredictiveOutputs {
        let mut outputs = PredictiveOutputs::default();
        for _ in 0..(seconds / STEP.as_secs_f64()) as usize {
            outputs = alerting.update(STEP, inputs, terrain, runways);
        }
        outputs
    }

    fn wall_ahead(distance_nm: f64, wall_ft: f64) -> TestTerrain {
        TestTerrain::wall_north_of(START.latitude_degrees + distance_nm / 60., 0., wall_ft)
    }

    #[test]
    fn the_functions_are_operative_with_a_position_an_altitude_and_the_grid() {
        let outputs = run(
            &mut alerting(),
            &flying(10_000.),
            &TestTerrain::flat(0.),
            &no_runways(),
            1.,
        );
        assert!(outputs.functions.operative);
        assert!(outputs.inputs_available);
        assert_eq!(
            outputs.functions.computed_height_above_terrain_ft,
            Some(10_000.)
        );
    }

    #[test]
    fn without_valid_aircraft_data_the_functions_are_not_operative() {
        let mut inputs = flying(10_000.);
        inputs.aircraft = None;
        let outputs = run(
            &mut alerting(),
            &inputs,
            &TestTerrain::flat(0.),
            &no_runways(),
            1.,
        );
        assert!(!outputs.functions.operative);
        assert!(!outputs.inputs_available);
        assert_eq!(outputs.functions.computed_height_above_terrain_ft, None);
    }

    #[test]
    fn a_position_that_is_not_accurate_enough_stops_the_functions() {
        let mut inputs = flying(10_000.);
        inputs.position_accuracy_sufficient = false;
        let outputs = run(
            &mut alerting(),
            &inputs,
            &TestTerrain::flat(0.),
            &no_runways(),
            1.,
        );
        assert!(!outputs.functions.operative);
        assert!(!outputs.inputs_available);
    }

    #[test]
    fn a_grid_that_is_not_loaded_stops_the_functions_and_raises_the_terr_stby_condition() {
        let terrain = TestTerrain::new(|_| TerrainSample::NotLoaded);
        let outputs = run(
            &mut alerting(),
            &flying(10_000.),
            &terrain,
            &no_runways(),
            1.,
        );
        assert!(!outputs.functions.operative);
        assert!(!outputs.inputs_available);
    }

    #[test]
    fn a_failed_grid_is_not_taken_for_flat_ground() {
        let terrain = TestTerrain::new(|_| TerrainSample::Failed);
        let outputs = run(&mut alerting(), &flying(100.), &terrain, &no_runways(), 5.);
        assert!(!outputs.functions.operative);
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    /// Flat terrain, except that the part 3 NM and more north of the start is the given sample until `loaded` is set.
    fn terrain_ahead_unavailable_until(
        loaded: &Rc<Cell<bool>>,
        unavailable: TerrainSample,
    ) -> TestTerrain {
        let loaded = Rc::clone(loaded);
        let edge_latitude = START.latitude_degrees + 3. / 60.;
        TestTerrain::new(move |position| {
            if position.latitude_degrees >= edge_latitude && !loaded.get() {
                unavailable
            } else {
                TerrainSample::ElevationFeet(0.)
            }
        })
    }

    #[test]
    fn a_grid_that_is_partly_missing_gives_a_steady_state_not_one_that_flips_every_update() {
        for unavailable in [TerrainSample::NotLoaded, TerrainSample::Failed] {
            let terrain = terrain_ahead_unavailable_until(&Rc::new(Cell::new(false)), unavailable);
            let mut alerting = alerting();
            let inputs = flying(10_000.);
            let mut states = Vec::new();
            for _ in 0..200 {
                let outputs = alerting.update(STEP, &inputs, &terrain, &no_runways());
                states.push((outputs.inputs_available, outputs.functions.operative));
            }
            assert!(
                states.iter().all(|state| *state == states[0]),
                "{unavailable:?}: the state changes: {states:?}"
            );
            assert_eq!(states[0], (false, false));
        }
    }

    #[test]
    fn the_functions_come_back_when_the_missing_blocks_are_loaded() {
        let loaded = Rc::new(Cell::new(false));
        let terrain = terrain_ahead_unavailable_until(&loaded, TerrainSample::NotLoaded);
        let mut alerting = alerting();
        let inputs = flying(10_000.);
        let outputs = run(&mut alerting, &inputs, &terrain, &no_runways(), 10.);
        assert!(!outputs.inputs_available);

        loaded.set(true);
        let outputs = run(&mut alerting, &inputs, &terrain, &no_runways(), 3.);
        assert!(outputs.inputs_available);
        assert!(outputs.functions.operative);
    }

    #[test]
    fn a_block_that_takes_a_moment_to_load_does_not_cause_a_standby() {
        let loaded = Rc::new(Cell::new(true));
        let terrain = terrain_ahead_unavailable_until(&loaded, TerrainSample::NotLoaded);
        let mut alerting = alerting();
        let inputs = flying(10_000.);
        assert!(run(&mut alerting, &inputs, &terrain, &no_runways(), 5.).inputs_available);

        loaded.set(false);
        for _ in 0..20 {
            let outputs = alerting.update(STEP, &inputs, &terrain, &no_runways());
            assert!(outputs.inputs_available, "standby after less than 2 s");
        }
        loaded.set(true);
        assert!(run(&mut alerting, &inputs, &terrain, &no_runways(), 5.).inputs_available);

        loaded.set(false);
        assert!(
            !run(&mut alerting, &inputs, &terrain, &no_runways(), 6.).inputs_available,
            "terrain that stays missing is a standby"
        );
    }

    #[test]
    fn the_alerts_end_at_once_when_the_functions_stop() {
        let mut alerting = alerting();
        let terrain = wall_ahead(2., 8_600.);
        let alerted = run(&mut alerting, &flying(8_000.), &terrain, &no_runways(), 3.);
        assert!(alerted.alerts.warning_light);

        let mut inputs = flying(8_000.);
        inputs.terrain_off = true;
        let outputs = alerting.update(STEP, &inputs, &terrain, &no_runways());
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    #[test]
    fn a_position_outside_the_grid_coverage_stops_the_functions() {
        let terrain = TestTerrain::new(|_| TerrainSample::OutsideCoverage);
        let outputs = run(
            &mut alerting(),
            &flying(10_000.),
            &terrain,
            &no_runways(),
            1.,
        );
        assert!(!outputs.functions.operative);
    }

    #[test]
    fn the_terr_pushbutton_off_inhibits_the_alerts_but_the_inputs_stay_available() {
        let mut inputs = flying(8_000.);
        inputs.terrain_off = true;
        let outputs = run(
            &mut alerting(),
            &inputs,
            &wall_ahead(2., 8_600.),
            &no_runways(),
            5.,
        );
        assert!(!outputs.functions.operative);
        assert!(outputs.inputs_available);
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    #[test]
    fn no_alerts_on_the_ground() {
        let mut inputs = flying(8_000.);
        inputs.on_ground = true;
        let outputs = run(
            &mut alerting(),
            &inputs,
            &wall_ahead(2., 8_600.),
            &no_runways(),
            5.,
        );
        assert!(outputs.functions.operative);
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    #[test]
    fn a_wall_ahead_gives_terrain_ahead_pull_up_with_the_red_light_and_the_terrain_display() {
        let terrain = wall_ahead(2., 8_600.);
        let mut alerting = alerting();
        let outputs = run(&mut alerting, &flying(8_000.), &terrain, &no_runways(), 0.6);
        assert!(outputs.alerts.warning_light);
        assert!(outputs.alerts.automatic_terrain_display);
        assert_eq!(outputs.alerts.voice, PredictiveVoice::TerrainAhead);
        assert_eq!(outputs.alerts.nd_message, TerrainAheadMessage::Warning);
        let runs = outputs.alerts.threat_areas.runs();
        assert!(runs.iter().any(|run| run.level == 2));

        // PULL UP comes in pulses: one of the seconds after TERRAIN AHEAD has the word on the output
        let said_pull_up = (0..6).any(|_| {
            let later = run(&mut alerting, &flying(8_000.), &terrain, &no_runways(), 0.5);
            later.alerts.voice.is_warning()
        });
        assert!(said_pull_up);
    }

    #[test]
    fn a_wall_farther_away_gives_the_caution_first() {
        let terrain = wall_ahead(8., 9_000.);
        let outputs = run(
            &mut alerting(),
            &flying(8_000.),
            &terrain,
            &no_runways(),
            1.,
        );
        assert!(outputs.alerts.caution_light);
        assert!(!outputs.alerts.warning_light);
        assert_eq!(outputs.alerts.voice, PredictiveVoice::TerrainAhead);
        let runs = outputs.alerts.threat_areas.runs();
        assert!(!runs.is_empty());
        assert!(runs.iter().all(|run| run.level == 1));
    }

    #[test]
    fn the_alerts_end_when_the_terrain_is_no_longer_ahead() {
        let mut alerting = alerting();
        run(
            &mut alerting,
            &flying(8_000.),
            &wall_ahead(2., 8_600.),
            &no_runways(),
            3.,
        );
        let outputs = run(
            &mut alerting,
            &flying(12_000.),
            &wall_ahead(2., 8_600.),
            &no_runways(),
            4.,
        );
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    #[test]
    fn the_functions_that_come_on_scan_at_once() {
        let mut inputs = flying(8_000.);
        inputs.on_ground = true;
        let mut alerting = alerting();
        let terrain = wall_ahead(2., 8_600.);
        run(&mut alerting, &inputs, &terrain, &no_runways(), 2.);
        inputs.on_ground = false;
        let outputs = alerting.update(STEP, &inputs, &terrain, &no_runways());
        assert!(outputs.alerts.warning_light);
    }

    /// A destination runway 2 NM ahead of the aircraft, which is descending on the final approach.
    fn final_approach() -> (PredictiveInputs, StaticRunways, TestTerrain) {
        let mut inputs = flying(800.);
        inputs.gear_downlocked = true;
        inputs.landing_flaps = true;
        inputs.radio_altitude_ft = Some(800.);
        let runway = Runway {
            reference_point: offset_position(START, 0., 2.),
            elevation_ft: 0.,
            origin: RunwayOrigin::Destination,
            geometry: None,
        };
        // A hill 800 ft high short of the runway, as on a valley approach
        let hill = wall_ahead(1., 700.);
        (inputs, StaticRunways(vec![runway]), hill)
    }

    #[test]
    fn the_landing_tunnel_inhibits_the_alerts_on_final() {
        let (inputs, runways, hill) = final_approach();
        let outputs = run(&mut alerting(), &inputs, &hill, &runways, 3.);
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    #[test]
    fn without_the_landing_configuration_the_same_final_is_alerted() {
        let (mut inputs, runways, hill) = final_approach();
        inputs.landing_flaps = false;
        let outputs = run(&mut alerting(), &inputs, &hill, &runways, 3.);
        assert!(outputs.alerts.warning_light || outputs.alerts.caution_light);
    }

    #[test]
    fn the_mountainous_approach_area_shortens_the_warning_look_ahead() {
        // A wall 6 NM ahead (86 s at 250 kt) that a pull-up from 9000 ft cannot clear in time. The runway 3 NM ahead
        // is within 6 NM of the wall, so its approach area is mountainous and the warning only looks
        // 30 s + 90 s * 3/6 = 75 s ahead. With the runway far away the same wall is warned about.
        let runway = Runway {
            reference_point: offset_position(START, 0., 3.),
            elevation_ft: 0.,
            origin: RunwayOrigin::Destination,
            geometry: None,
        };
        let terrain = wall_ahead(6., 12_400.);
        let mut high_aircraft = flying(9_000.);
        high_aircraft.gear_downlocked = false;
        let with_runway = run(
            &mut alerting(),
            &high_aircraft,
            &terrain,
            &StaticRunways(vec![runway]),
            2.,
        );
        let far_runway = Runway {
            reference_point: offset_position(START, 180., 60.),
            ..runway
        };
        let without = run(
            &mut alerting(),
            &high_aircraft,
            &terrain,
            &StaticRunways(vec![far_runway]),
            2.,
        );
        assert!(!with_runway.alerts.warning_light);
        assert!(without.alerts.warning_light);
    }

    #[test]
    fn too_low_terrain_comes_from_the_floor_near_a_runway() {
        let runway = Runway {
            reference_point: offset_position(START, 180., 6.),
            elevation_ft: 0.,
            origin: RunwayOrigin::Departure,
            geometry: None,
        };
        // 350 ft is below the floor 6 NM from the runway (400 ft) but above what the look-ahead asks for after a
        // takeoff (100 ft), so the word can only come from the floor
        let mut inputs = flying(350.);
        inputs.radio_altitude_ft = Some(350.);
        let outputs = alerting().update(
            STEP,
            &inputs,
            &TestTerrain::flat(0.),
            &StaticRunways(vec![runway]),
        );
        assert!(outputs.alerts.caution_light);
        assert!(!outputs.alerts.warning_light);
        assert_eq!(outputs.alerts.voice, PredictiveVoice::TooLowTerrain);
        assert!(!outputs.alerts.automatic_terrain_display);
        assert_eq!(outputs.alerts.nd_message, TerrainAheadMessage::None);
        assert_eq!(outputs.alerts.threat_areas, ThreatAreas::default());
    }

    #[test]
    fn above_the_floor_the_same_flight_is_quiet() {
        let runway = Runway {
            reference_point: offset_position(START, 180., 6.),
            elevation_ft: 0.,
            origin: RunwayOrigin::Departure,
            geometry: None,
        };
        let mut inputs = flying(450.);
        inputs.radio_altitude_ft = Some(450.);
        let outputs = alerting().update(
            STEP,
            &inputs,
            &TestTerrain::flat(0.),
            &StaticRunways(vec![runway]),
        );
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    struct Takeoff {
        roll_length_nm: f64,
        climb_rate_fpm: f64,
        /// The departure runway is the whole runway, as long as the roll; without it the point where the roll started
        runway_known: bool,
    }

    impl Takeoff {
        fn normal(roll_length_nm: f64) -> Self {
            Self {
                roll_length_nm,
                climb_rate_fpm: 2_500.,
                runway_known: false,
            }
        }

        fn departure_runway(&self) -> Runway {
            Runway {
                reference_point: START,
                elevation_ft: 0.,
                origin: RunwayOrigin::Departure,
                geometry: self.runway_known.then_some(RunwayGeometry {
                    true_heading_deg: 0.,
                    length_ft: self.roll_length_nm * runway::FEET_PER_NAUTICAL_MILE,
                }),
            }
        }
    }

    /// The aircraft accelerates to 150 kt over the roll, lifts off at its end and climbs at a constant rate.
    fn takeoff_is_alert_free(takeoff: Takeoff) {
        const LIFTOFF_SPEED_KT: f64 = 150.;
        let runways = StaticRunways(vec![takeoff.departure_runway()]);
        let terrain = TestTerrain::flat(0.);
        let mut alerting = alerting();

        let roll_length_nm = takeoff.roll_length_nm;
        let roll_duration_s = 2. * roll_length_nm / (LIFTOFF_SPEED_KT / 3600.);
        let mut elapsed_s = 0.;
        while elapsed_s < roll_duration_s + 150. {
            let rolling = elapsed_s < roll_duration_s;
            let (distance_nm, altitude_ft) = if rolling {
                (roll_length_nm * (elapsed_s / roll_duration_s).powi(2), 0.)
            } else {
                let airborne_s: f64 = elapsed_s - roll_duration_s;
                (
                    roll_length_nm + LIFTOFF_SPEED_KT / 3600. * airborne_s,
                    takeoff.climb_rate_fpm / 60. * airborne_s,
                )
            };
            let mut inputs = flying(altitude_ft);
            inputs.on_ground = rolling;
            inputs.aircraft = inputs.aircraft.map(|aircraft| AircraftState {
                position: offset_position(START, 0., distance_nm),
                ground_speed_kt: LIFTOFF_SPEED_KT,
                vertical_speed_fpm: if rolling { 0. } else { takeoff.climb_rate_fpm },
                ..aircraft
            });
            let outputs = alerting.update(STEP, &inputs, &terrain, &runways);
            assert_eq!(
                outputs.alerts,
                PredictiveAlertOutputs::default(),
                "alert {:.1} s into the takeoff, {altitude_ft:.0} ft",
                elapsed_s
            );
            elapsed_s += STEP.as_secs_f64();
        }
    }

    #[test]
    fn a_normal_takeoff_does_not_trigger_the_floor_when_leaving_the_runway() {
        takeoff_is_alert_free(Takeoff::normal(2.4 / 1.852));
    }

    #[test]
    fn a_takeoff_from_a_short_runway_does_not_trigger_the_floor_either() {
        // The look-ahead is not in play this close to the departure point, so this one is about the floor alone
        takeoff_is_alert_free(Takeoff::normal(1.0));
    }

    #[test]
    fn a_takeoff_from_a_long_runway_does_not_trigger_the_floor_either() {
        takeoff_is_alert_free(Takeoff::normal(3.6 / 1.852));
    }

    #[test]
    fn a_takeoff_from_a_known_runway_does_not_trigger_the_floor() {
        for roll_length_nm in [1.0, 2.4 / 1.852, 3.6 / 1.852] {
            takeoff_is_alert_free(Takeoff {
                runway_known: true,
                ..Takeoff::normal(roll_length_nm)
            });
        }
    }

    #[test]
    fn the_lift_off_from_a_known_runway_does_not_trigger_the_floor() {
        // As recorded in the sim at RJAA: on the runway, the radio altimeter still a little below zero at the lift-off,
        // the grid cells around the airfield 130 ft below the runway
        let mut inputs = flying(15.);
        inputs.radio_altitude_ft = Some(-0.12);
        inputs.aircraft = inputs.aircraft.map(|aircraft| AircraftState {
            position: offset_position(START, 0., 1.),
            ground_speed_kt: 160.,
            ..aircraft
        });
        let runway = Takeoff {
            runway_known: true,
            ..Takeoff::normal(2.)
        }
        .departure_runway();
        let outputs = alerting().update(
            STEP,
            &inputs,
            &TestTerrain::flat(-130.),
            &StaticRunways(vec![runway]),
        );
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    /// The moment of lift-off halfway down a 2 NM runway towards the north: still level with the runway, at 150 kt, over
    /// water or low ground 50 ft below the runway beyond the airfield, as at Haneda.
    fn at_lift_off(runway_known: bool) -> (PredictiveInputs, StaticRunways) {
        let mut inputs = flying(0.);
        inputs.radio_altitude_ft = Some(10.);
        inputs.aircraft = inputs.aircraft.map(|aircraft| AircraftState {
            position: offset_position(START, 0., 1.),
            ground_speed_kt: 150.,
            ..aircraft
        });
        let runways = StaticRunways(vec![Takeoff {
            runway_known,
            ..Takeoff::normal(2.)
        }
        .departure_runway()]);
        (inputs, runways)
    }

    #[test]
    fn the_lift_off_over_ground_lower_than_the_runway_is_alert_free() {
        let low_ground = TestTerrain::flat(-50.);
        for runway_known in [true, false] {
            let (inputs, runways) = at_lift_off(runway_known);
            let outputs = run(&mut alerting(), &inputs, &low_ground, &runways, 1.);
            assert_eq!(
                outputs.alerts,
                PredictiveAlertOutputs::default(),
                "runway known: {runway_known}"
            );
        }
    }

    #[test]
    fn a_roll_latched_only_once_fast_still_makes_the_lift_off_a_departure() {
        // The GPS position became valid 0.4 NM before the lift-off point, during the roll
        let (inputs, _) = at_lift_off(false);
        let latched_in_the_roll = StaticRunways(vec![Runway {
            reference_point: offset_position(START, 0., 0.6),
            elevation_ft: 0.,
            origin: RunwayOrigin::Departure,
            geometry: None,
        }]);
        let low_ground = TestTerrain::flat(-50.);
        let outputs = run(
            &mut alerting(),
            &inputs,
            &low_ground,
            &latched_in_the_roll,
            1.,
        );
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());

        // Without any departure runway the lift-off is en route, where 50 ft over the ground is a warning
        let outputs = run(&mut alerting(), &inputs, &low_ground, &no_runways(), 1.);
        assert!(outputs.alerts.warning_light);
    }

    #[test]
    fn terrain_above_the_lift_off_path_is_still_alerted() {
        // A ridge 300 ft above the runway 3 NM ahead of the lift-off point, 72 s away
        let ridge = TestTerrain::wall_north_of(START.latitude_degrees + 4. / 60., -50., 300.);
        for runway_known in [true, false] {
            let (inputs, runways) = at_lift_off(runway_known);
            let outputs = run(&mut alerting(), &inputs, &ridge, &runways, 1.);
            assert!(outputs.alerts.caution_light, "runway known: {runway_known}");
        }
    }

    #[test]
    fn an_engine_out_climb_from_a_known_runway_does_not_trigger_the_floor() {
        // 2.4 % climb gradient at 150 kt
        takeoff_is_alert_free(Takeoff {
            roll_length_nm: 1.3,
            climb_rate_fpm: 365.,
            runway_known: true,
        });
    }

    #[test]
    fn the_floor_protects_the_climb_out_past_a_known_departure_runway() {
        // 1.5 NM past the end of a 0.8 NM runway at 50 ft, under the floor there (145 ft). The roll start latch is
        // only 2.3 NM away and holds the departure runway area, the known runway does not.
        let mut inputs = flying(50.);
        inputs.aircraft = inputs.aircraft.map(|aircraft| AircraftState {
            position: offset_position(START, 0., 2.3),
            ..aircraft
        });
        let short_runway = Takeoff {
            runway_known: true,
            ..Takeoff::normal(0.8)
        };
        // The look-ahead alerts as well this low: the floor is checked on its own
        let mut known = alerting();
        known.update(
            STEP,
            &inputs,
            &TestTerrain::flat(0.),
            &StaticRunways(vec![short_runway.departure_runway()]),
        );
        assert!(known.terrain_clearance_floor.is_alerting());

        let mut latched = alerting();
        latched.update(
            STEP,
            &inputs,
            &TestTerrain::flat(0.),
            &StaticRunways(vec![Takeoff::normal(0.8).departure_runway()]),
        );
        assert!(!latched.terrain_clearance_floor.is_alerting());
    }

    #[test]
    fn the_floor_is_inhibited_with_the_terr_pushbutton_off() {
        let runway = Runway {
            reference_point: offset_position(START, 180., 6.),
            elevation_ft: 0.,
            origin: RunwayOrigin::Departure,
            geometry: None,
        };
        let mut inputs = flying(300.);
        inputs.radio_altitude_ft = Some(300.);
        inputs.terrain_off = true;
        let outputs = alerting().update(
            STEP,
            &inputs,
            &TestTerrain::flat(0.),
            &StaticRunways(vec![runway]),
        );
        assert_eq!(outputs.alerts, PredictiveAlertOutputs::default());
    }

    #[test]
    fn the_turn_rate_follows_the_track_with_its_sign() {
        let mut rate = TrackRate::new();
        let mut track = 90.;
        let mut value = 0.;
        for _ in 0..200 {
            track = (track + 0.3) % 360.;
            value = rate.update(STEP, Some(track));
        }
        assert!((value - 3.).abs() < 0.2, "{value}");

        let mut left = TrackRate::new();
        let mut track = 5.;
        for _ in 0..200 {
            track = (track - 0.3 + 360.) % 360.;
            value = left.update(STEP, Some(track));
        }
        assert!((value + 3.).abs() < 0.2, "{value}");
    }
}
