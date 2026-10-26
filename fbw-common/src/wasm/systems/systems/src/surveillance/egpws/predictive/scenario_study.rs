//! Offline study of the terrain look-ahead against the real terrain grid: synthetic flights, one second steps, no pilot
//! reaction. It prints when the cautions and warnings come and how much clearance the flight has, so that the alert
//! timing and the nuisance alerts can be judged before a test in the simulator.
//!
//! Run with `TAWS_GRID_FILE=<terrain_grid.bin> cargo test -p systems scenario_study -- --ignored --nocapture`.

use super::{
    geometry::{bearing_deg, distance_nm, offset_position},
    runway::{Runway, RunwayGeometry, RunwayOrigin, StaticRunways},
    AircraftState, PredictiveInputs, PredictiveTerrainAlerting, PredictiveVoice,
};
use crate::surveillance::egpws::terrain_grid::{
    GridPosition, InMemoryBlockReader, TerrainElevationSource, TerrainGridCache, TerrainSample,
};
use std::time::Duration;

struct Turn {
    start_s: f64,
    end_s: f64,
    rate_deg_per_s: f64,
}

enum Guidance {
    Track { initial_deg: f64, turns: Vec<Turn> },
    Route(Vec<GridPosition>),
}

struct Flight {
    name: String,
    start: GridPosition,
    altitude_ft: f64,
    guidance: Guidance,
    /// Ground speed from the altitude and the elapsed time
    ground_speed_kt: Box<dyn Fn(f64, f64) -> f64>,
    /// Vertical speed from the elapsed time, unless the altitude law decides
    vertical_speed_fpm: Box<dyn Fn(f64) -> f64>,
    /// Altitude from the distance to the first runway
    altitude_law: Option<Box<dyn Fn(f64) -> f64>>,
    duration_s: f64,
    runways: Vec<Runway>,
    /// Gear and landing flaps from the distance to the first runway and the elapsed time
    landing_configuration: Box<dyn Fn(f64, f64) -> bool>,
    /// The takeoff roll ends here
    on_ground_until_s: f64,
    /// Radio altitude from the altitude, where the grid cells do not match the ground under the aircraft
    radio_altitude_ft: Option<Box<dyn Fn(f64) -> f64>>,
}

impl Flight {
    fn new(name: &str, start: GridPosition, altitude_ft: f64, guidance: Guidance) -> Self {
        Self {
            name: name.to_string(),
            start,
            altitude_ft,
            guidance,
            ground_speed_kt: Box::new(|_, _| 280.),
            vertical_speed_fpm: Box::new(|_| 0.),
            altitude_law: None,
            duration_s: 1_800.,
            runways: Vec::new(),
            landing_configuration: Box::new(|_, _| false),
            on_ground_until_s: 0.,
            radio_altitude_ft: None,
        }
    }

    fn speed(mut self, ground_speed_kt: f64) -> Self {
        self.ground_speed_kt = Box::new(move |_, _| ground_speed_kt);
        self
    }

    fn duration(mut self, duration_s: f64) -> Self {
        self.duration_s = duration_s;
        self
    }
}

#[derive(Clone, Copy)]
struct Step {
    time_s: f64,
    position: GridPosition,
    altitude_ft: f64,
    terrain_ft: f64,
}

/// What lies ahead on the track at the moment of an alert
struct Ahead {
    /// Distance to the first point of the track whose terrain is higher than the aircraft
    first_above_nm: Option<f64>,
    /// Highest terrain in the next 40 NM and where
    highest_ft: f64,
    highest_nm: f64,
}

struct Event {
    time_s: f64,
    flown_nm: f64,
    height_ft: f64,
    ahead: Ahead,
}

#[derive(Default)]
struct Events {
    first_caution_light: Option<Event>,
    first_warning_light: Option<Event>,
    first_word: Option<(f64, PredictiveVoice)>,
    first_pull_up: Option<f64>,
    first_avoid: Option<Event>,
    caution_seconds: usize,
    warning_seconds: usize,
}

fn load_terrain() -> TerrainGridCache<InMemoryBlockReader> {
    let path = std::env::var("TAWS_GRID_FILE").expect("TAWS_GRID_FILE not set");
    TerrainGridCache::new(InMemoryBlockReader::new(std::fs::read(path).unwrap(), 0))
}

fn elevation_ft(terrain: &dyn TerrainElevationSource, position: GridPosition) -> f64 {
    match terrain.max_elevation_at(position) {
        TerrainSample::ElevationFeet(feet) => feet,
        other => panic!("terrain not available at {position:?}: {other:?}"),
    }
}

fn look_ahead(
    terrain: &dyn TerrainElevationSource,
    position: GridPosition,
    track_deg: f64,
    altitude_ft: f64,
) -> Ahead {
    let mut ahead = Ahead {
        first_above_nm: None,
        highest_ft: f64::MIN,
        highest_nm: 0.,
    };
    for step in 0..=400 {
        let distance = step as f64 * 0.1;
        let feet = elevation_ft(terrain, offset_position(position, track_deg, distance));
        if feet > altitude_ft && ahead.first_above_nm.is_none() {
            ahead.first_above_nm = Some(distance);
        }
        if feet > ahead.highest_ft {
            ahead.highest_ft = feet;
            ahead.highest_nm = distance;
        }
    }
    ahead
}

fn run_flight(flight: &Flight, terrain: &mut TerrainGridCache<InMemoryBlockReader>) -> String {
    let mut alerting = PredictiveTerrainAlerting::new();
    let runways = StaticRunways(flight.runways.clone());

    let mut position = flight.start;
    let mut altitude_ft = flight.altitude_ft;
    let mut track_deg = match &flight.guidance {
        Guidance::Track { initial_deg, .. } => *initial_deg,
        Guidance::Route(points) => bearing_deg(position, points[0]),
    };
    let mut route_index = 0;
    let mut previous_altitude_ft = altitude_ft;
    let mut steps: Vec<Step> = Vec::new();
    let mut events = Events::default();
    let mut flown_nm = 0.;

    for _ in 0..40 {
        terrain.update(Duration::from_millis(250), position);
    }
    let one_second = Duration::from_secs(1);
    let mut time_s = 0.;
    while time_s < flight.duration_s {
        for _ in 0..4 {
            terrain.update(Duration::from_millis(250), position);
        }
        match &flight.guidance {
            Guidance::Track { turns, .. } => {
                for turn in turns {
                    if (turn.start_s..turn.end_s).contains(&time_s) {
                        track_deg = (track_deg + turn.rate_deg_per_s).rem_euclid(360.);
                    }
                }
            }
            Guidance::Route(points) => {
                while route_index < points.len() && distance_nm(position, points[route_index]) < 1.
                {
                    route_index += 1;
                }
                if route_index >= points.len() {
                    break;
                }
                track_deg = bearing_deg(position, points[route_index]);
            }
        }

        let distance_to_runway = flight
            .runways
            .first()
            .map(|runway| distance_nm(position, runway.reference_point))
            .unwrap_or(f64::MAX);
        if flight.altitude_law.is_some() && distance_to_runway < 0.5 {
            // The approach ends at the threshold, the landing itself is not part of the study
            break;
        }
        let ground_speed_kt = (flight.ground_speed_kt)(altitude_ft, time_s);
        if let Some(law) = &flight.altitude_law {
            altitude_ft = law(distance_to_runway);
        }
        let vertical_speed_fpm = if flight.altitude_law.is_some() {
            (altitude_ft - previous_altitude_ft) * 60.
        } else {
            (flight.vertical_speed_fpm)(time_s)
        };
        previous_altitude_ft = altitude_ft;

        let terrain_ft = elevation_ft(terrain, position);
        // The 1 arcminute cells of a valley airport hold the mountains next to the runway, so the first seconds of a
        // departure from there are below the cell
        if altitude_ft < terrain_ft - 250. && time_s > 20. {
            // The flight has hit the ground, nothing more to learn
            steps.push(Step {
                time_s,
                position,
                altitude_ft,
                terrain_ft,
            });
            break;
        }
        let configured = (flight.landing_configuration)(distance_to_runway, time_s);
        let inputs = PredictiveInputs {
            aircraft: Some(AircraftState {
                position,
                geometric_altitude_ft: altitude_ft,
                ground_speed_kt,
                true_track_deg: track_deg,
                vertical_speed_fpm,
            }),
            radio_altitude_ft: Some(match &flight.radio_altitude_ft {
                Some(radio_altitude) => radio_altitude(altitude_ft),
                None => (altitude_ft - terrain_ft).max(0.),
            }),
            position_accuracy_sufficient: true,
            on_ground: time_s < flight.on_ground_until_s,
            gear_downlocked: configured,
            landing_flaps: configured,
            terrain_off: false,
        };
        let outputs = alerting.update(one_second, &inputs, terrain, &runways);
        steps.push(Step {
            time_s,
            position,
            altitude_ft,
            terrain_ft,
        });

        let alerts = outputs.alerts;
        let event = |terrain: &TerrainGridCache<InMemoryBlockReader>| Event {
            time_s,
            flown_nm,
            height_ft: altitude_ft - terrain_ft,
            ahead: look_ahead(terrain, position, track_deg, altitude_ft),
        };
        if alerts.caution_light {
            events.caution_seconds += 1;
            if events.first_caution_light.is_none() {
                events.first_caution_light = Some(event(terrain));
            }
        }
        if alerts.warning_light {
            events.warning_seconds += 1;
            if events.first_warning_light.is_none() {
                events.first_warning_light = Some(event(terrain));
            }
        }
        if alerts.voice != PredictiveVoice::None && events.first_word.is_none() {
            events.first_word = Some((time_s, alerts.voice));
        }
        if alerts.voice == PredictiveVoice::PullUp && events.first_pull_up.is_none() {
            events.first_pull_up = Some(time_s);
        }
        if alerts.voice == PredictiveVoice::AvoidTerrain && events.first_avoid.is_none() {
            events.first_avoid = Some(event(terrain));
        }

        let step_nm = ground_speed_kt / 3600.;
        position = offset_position(position, track_deg, step_nm);
        flown_nm += step_nm;
        if flight.altitude_law.is_none() {
            altitude_ft += vertical_speed_fpm / 60.;
        }
        time_s += 1.;
    }

    report(flight, &steps, &events)
}

fn describe_event(label: &str, event: &Option<Event>, steps: &[Step]) -> String {
    let Some(event) = event else {
        return format!("  {label}: none\n");
    };
    let first_above = steps
        .iter()
        .find(|step| step.terrain_ft > step.altitude_ft)
        .map(|step| step.time_s);
    let closest = steps
        .iter()
        .min_by(|a, b| (a.altitude_ft - a.terrain_ft).total_cmp(&(b.altitude_ft - b.terrain_ft)))
        .map(|step| step.time_s);
    let ahead = &event.ahead;
    format!(
        "  {label}: t={:.0}s flown={:.1}NM h={:.0}ft | ahead: first above aircraft {} , highest {:.0}ft at {:.1}NM | lead to closest approach {} , to terrain above aircraft {}\n",
        event.time_s,
        event.flown_nm,
        event.height_ft,
        ahead
            .first_above_nm
            .map(|nm| format!("{nm:.1}NM"))
            .unwrap_or("none".into()),
        ahead.highest_ft,
        ahead.highest_nm,
        closest
            .map(|t| format!("{:.0}s", t - event.time_s))
            .unwrap_or("-".into()),
        first_above
            .map(|t| format!("{:.0}s", t - event.time_s))
            .unwrap_or("-".into()),
    )
}

fn report(flight: &Flight, steps: &[Step], events: &Events) -> String {
    let closest = steps
        .iter()
        .min_by(|a, b| (a.altitude_ft - a.terrain_ft).total_cmp(&(b.altitude_ft - b.terrain_ft)));
    let highest = steps
        .iter()
        .max_by(|a, b| a.terrain_ft.total_cmp(&b.terrain_ft));
    let mut text = format!("[{}] {} s flown\n", flight.name, steps.len());
    if let (Some(closest), Some(highest)) = (closest, highest) {
        text += &format!(
            "  under track: min clearance {:.0}ft at t={:.0}s ({:.3},{:.3}) ; highest cell {:.0}ft ; alt at end {:.0}ft\n",
            closest.altitude_ft - closest.terrain_ft,
            closest.time_s,
            closest.position.latitude_degrees,
            closest.position.longitude_degrees,
            highest.terrain_ft,
            steps.last().map(|step| step.altitude_ft).unwrap_or(0.),
        );
    }
    if let Some(runway) = flight
        .runways
        .first()
        .filter(|_| flight.altitude_law.is_some())
    {
        text += "  profile (NM to runway: alt/terrain):";
        for step in steps.iter().step_by(15) {
            text += &format!(
                " {:.1}: {:.0}/{:.0}",
                distance_nm(step.position, runway.reference_point),
                step.altitude_ft,
                step.terrain_ft
            );
        }
        text += "
";
    }
    text += &describe_event("caution light", &events.first_caution_light, steps);
    text += &describe_event("warning light", &events.first_warning_light, steps);
    text += &describe_event("AVOID TERRAIN", &events.first_avoid, steps);
    text += &format!(
        "  first word: {:?} ; PULL UP at {:?} ; seconds with caution {} warning {}\n",
        events.first_word, events.first_pull_up, events.caution_seconds, events.warning_seconds
    );
    text
}

fn runway(latitude: f64, longitude: f64, elevation_ft: f64, origin: RunwayOrigin) -> Runway {
    Runway {
        reference_point: GridPosition::new(latitude, longitude),
        elevation_ft,
        origin,
        geometry: None,
    }
}

/// The same flight with its first runway known from the flight plan: direction and length, not only its first point.
fn with_known_runway(mut flight: Flight, true_heading_deg: f64, length_m: f64) -> Flight {
    flight.name += " (known rwy)";
    flight.runways[0].geometry = Some(RunwayGeometry {
        true_heading_deg,
        length_ft: length_m / 0.3048,
    });
    flight
}

const RJAA: (f64, f64) = (35.765, 140.386);
const RJOA: (f64, f64) = (34.436, 132.919);
const FUJI: (f64, f64) = (35.3606, 138.7274);
const KITA_DAKE: (f64, f64) = (35.674, 138.239);

fn point(position: (f64, f64)) -> GridPosition {
    GridPosition::new(position.0, position.1)
}

fn japan_flights(altitude_ft: f64) -> Vec<Flight> {
    let rjaa = point(RJAA);
    let rjoa = point(RJOA);
    let runways = vec![
        runway(RJOA.0, RJOA.1, 1_088., RunwayOrigin::Destination),
        runway(RJAA.0, RJAA.1, 141., RunwayOrigin::Departure),
    ];
    let level = altitude_ft / 100.;
    // 30 NM from the airports, so that the terminal area of neither is involved
    let great_circle_start = offset_position(rjaa, bearing_deg(rjaa, rjoa), 30.);
    let great_circle_end = offset_position(rjoa, bearing_deg(rjoa, rjaa), 30.);
    let fuji_start = offset_position(rjaa, bearing_deg(rjaa, point(FUJI)), 30.);

    let mut great_circle = Flight::new(
        &format!("A great circle RJAA-RJOA FL{level:.0}"),
        great_circle_start,
        altitude_ft,
        Guidance::Route(vec![great_circle_end]),
    )
    .duration(9_000.);
    great_circle.runways = runways.clone();

    let mut fuji = Flight::new(
        &format!("A Fuji + southern Alps FL{level:.0}"),
        fuji_start,
        altitude_ft,
        Guidance::Route(vec![
            point(FUJI),
            point(KITA_DAKE),
            GridPosition::new(35.9, 137.5),
            GridPosition::new(35.9, 136.0),
        ]),
    )
    .duration(9_000.);
    fuji.runways = runways;
    vec![great_circle, fuji]
}

fn turning_flight() -> Flight {
    // North along the east side of the southern Alps at FL100, then a standard rate turn to the right into the range
    let mut flight = Flight::new(
        "A turning: north at FL100 west of Fuji, right turn 3 deg/s at t=330 s for 30 s towards Fuji",
        GridPosition::new(34.9, 138.55),
        10_000.,
        Guidance::Track {
            initial_deg: 0.,
            turns: vec![Turn {
                start_s: 330.,
                end_s: 360.,
                rate_deg_per_s: 3.,
            }],
        },
    )
    .duration(700.);
    flight.runways = vec![runway(RJOA.0, RJOA.1, 1_088., RunwayOrigin::Destination)];
    flight
}

fn cruise_flights() -> Vec<Flight> {
    let regions = [
        ("Alps", 46., 8.),
        ("Himalaya", 28., 87.),
        ("Rockies", 40., -106.),
        ("Andes", -33., -70.),
        ("Japan", 35.5, 138.),
    ];
    let mut flights = Vec::new();
    for (name, latitude, longitude) in regions {
        for altitude_ft in [35_000., 25_000.] {
            for track in [0., 90., 180., 270., 45., 225.] {
                flights.push(
                    Flight::new(
                        &format!("C {name} FL{:.0} track {track:.0}", altitude_ft / 100.),
                        GridPosition::new(latitude, longitude),
                        altitude_ft,
                        Guidance::Track {
                            initial_deg: track,
                            turns: Vec::new(),
                        },
                    )
                    .speed(450.)
                    .duration(1_200.),
                );
            }
        }
    }
    let flat_places = [
        ("Kansas", 38.5, -98.),
        ("North Sea", 56., 3.),
        ("Netherlands", 52., 5.),
        ("Pacific", 20., -150.),
        ("Sahara", 25., 10.),
        ("Siberia", 60., 80.),
    ];
    for (name, latitude, longitude) in flat_places {
        for track in [0., 90.] {
            flights.push(
                Flight::new(
                    &format!("C flat {name} FL100 track {track:.0}"),
                    GridPosition::new(latitude, longitude),
                    10_000.,
                    Guidance::Track {
                        initial_deg: track,
                        turns: Vec::new(),
                    },
                )
                .speed(280.)
                .duration(1_800.),
            );
        }
    }
    flights
}

/// A three degree final to the runway, `offset_ft` above (+) or below (-) the glide path
fn approach(
    name: &str,
    threshold: (f64, f64),
    elevation_ft: f64,
    final_track_deg: f64,
    offset_ft: f64,
    start_nm: f64,
) -> Flight {
    let reference = point(threshold);
    let start = offset_position(reference, (final_track_deg + 180.) % 360., start_nm);
    let mut flight = Flight::new(
        name,
        start,
        elevation_ft + 50. + 318. * start_nm + offset_ft,
        Guidance::Track {
            initial_deg: final_track_deg,
            turns: Vec::new(),
        },
    )
    .speed(140.)
    .duration(3_000.);
    flight.runways = vec![runway(
        threshold.0,
        threshold.1,
        elevation_ft,
        RunwayOrigin::Destination,
    )];
    flight.altitude_law = Some(Box::new(move |distance_nm| {
        elevation_ft + 50. + 318. * distance_nm + offset_ft
    }));
    flight.landing_configuration = Box::new(|distance_nm, _| distance_nm < 8.);
    flight
}

fn departure(name: &str, start: (f64, f64), elevation_ft: f64, track_deg: f64) -> Flight {
    let mut flight = Flight::new(
        name,
        point(start),
        elevation_ft + 50.,
        Guidance::Track {
            initial_deg: track_deg,
            turns: Vec::new(),
        },
    )
    .duration(240.);
    flight.ground_speed_kt = Box::new(|_, time_s| 160. + 90. * (time_s / 60.).min(1.));
    flight.vertical_speed_fpm = Box::new(|_| 1_500.);
    flight.runways = vec![runway(
        start.0,
        start.1,
        elevation_ft,
        RunwayOrigin::Departure,
    )];
    flight.landing_configuration = Box::new(|_, _| false);
    flight
}

/// A takeoff from the start of the runway: 40 s of roll to 160 kt, lift-off, the climb building up to 2500 fpm over
/// 6 s.
fn takeoff_roll(
    name: &str,
    start: (f64, f64),
    elevation_ft: f64,
    aircraft_height_ft: f64,
    true_heading_deg: f64,
    known_length_m: Option<f64>,
) -> Flight {
    const ROLL_S: f64 = 40.;
    const ROTATION_S: f64 = 6.;
    let mut flight = Flight::new(
        name,
        point(start),
        elevation_ft + aircraft_height_ft,
        Guidance::Track {
            initial_deg: true_heading_deg,
            turns: Vec::new(),
        },
    )
    .duration(150.);
    flight.ground_speed_kt = Box::new(|_, time_s| 160. * (time_s / ROLL_S).min(1.));
    flight.vertical_speed_fpm =
        Box::new(|time_s| 2_500. * ((time_s - ROLL_S) / ROTATION_S).clamp(0., 1.));
    flight.on_ground_until_s = ROLL_S;
    // The radio altimeter measures the runway, not the grid cell
    let runway_altitude_ft = elevation_ft + aircraft_height_ft;
    flight.radio_altitude_ft = Some(Box::new(move |altitude_ft| {
        (altitude_ft - runway_altitude_ft).max(0.)
    }));
    flight.runways = vec![runway(
        start.0,
        start.1,
        elevation_ft,
        RunwayOrigin::Departure,
    )];
    match known_length_m {
        Some(length_m) => with_known_runway(flight, true_heading_deg, length_m),
        None => flight,
    }
}

#[test]
#[ignore]
fn scenario_study_real_grid() {
    let mut terrain = load_terrain();
    let mut flights: Vec<Flight> = Vec::new();
    flights.extend(japan_flights(10_000.));
    flights.push(turning_flight());
    for altitude_ft in [
        10_500., 11_000., 12_000., 12_500., 13_000., 13_500., 14_000., 20_000.,
    ] {
        flights.extend(japan_flights(altitude_ft));
    }
    flights.extend(cruise_flights());
    flights.push(approach(
        "D RJAA 34L stable 3 deg",
        (35.747, 140.387),
        135.,
        343.,
        0.,
        20.,
    ));
    flights.push(approach(
        "D RJAA 34L 1000 ft low",
        (35.747, 140.387),
        135.,
        343.,
        -1_000.,
        20.,
    ));
    flights.push(approach(
        "D RJOA 28 stable 3 deg",
        (34.4385, 132.9355),
        1_088.,
        280.,
        0.,
        20.,
    ));
    flights.push(approach(
        "D RJOA 28 1000 ft low",
        (34.4385, 132.9355),
        1_088.,
        280.,
        -1_000.,
        20.,
    ));
    flights.push(approach(
        "D LOWI 26 stable 3 deg",
        (47.2618, 11.3573),
        1_906.,
        260.,
        0.,
        20.,
    ));
    flights.push(approach(
        "D LOWI 26 1000 ft low",
        (47.2618, 11.3573),
        1_906.,
        260.,
        -1_000.,
        20.,
    ));
    flights.push(departure("E LOWI rwy 26", (47.2618, 11.3573), 1_906., 260.));
    flights.push(departure("E LOWI rwy 08", (47.2575, 11.3322), 1_906., 80.));
    flights.push(departure("E LFMN rwy 04", (43.6485, 7.1975), 12., 40.));
    flights.push(departure("E VNKT rwy 02", (27.6945, 85.355), 4_390., 20.));
    flights.push(departure("E RJAA rwy 34L", (35.747, 140.387), 135., 343.));

    for (name, threshold, elevation_ft, true_heading_deg, length_m) in [
        ("RJAA 34L", (35.747, 140.387), 135., 343., 4_000.),
        ("RJOA 28", (34.4385, 132.9355), 1_088., 280., 3_000.),
        ("LOWI 26", (47.2618, 11.3573), 1_906., 260., 2_000.),
    ] {
        for offset_ft in [0., -1_000.] {
            flights.push(with_known_runway(
                approach(
                    &format!("D {name} offset {offset_ft:.0} ft"),
                    threshold,
                    elevation_ft,
                    true_heading_deg,
                    offset_ft,
                    20.,
                ),
                true_heading_deg,
                length_m,
            ));
        }
    }
    for (name, start, elevation_ft, true_heading_deg, length_m) in [
        ("LOWI rwy 26", (47.2618, 11.3573), 1_906., 260., 2_000.),
        ("LOWI rwy 08", (47.2575, 11.3322), 1_906., 80., 2_000.),
        ("LFMN rwy 04", (43.6485, 7.1975), 12., 40., 2_960.),
        ("VNKT rwy 02", (27.6945, 85.355), 4_390., 20., 3_350.),
        ("RJAA rwy 34L", (35.747, 140.387), 135., 343., 4_000.),
    ] {
        flights.push(with_known_runway(
            departure(&format!("E {name}"), start, elevation_ft, true_heading_deg),
            true_heading_deg,
            length_m,
        ));
    }

    // RJAA 34L as the FMGC sent it in the sim: start of the runway, elevation, true direction
    // Take-offs recorded in the sim: the runway as the FMGC sent it (start, elevation, true direction, length) and the
    // geometric altitude on the ground. Haneda 22 lifts off over the bay.
    for (name, start, elevation_ft, aircraft_height_ft, true_heading_deg, length_m) in [
        ("RJAA 34L", (35.7433, 140.3909), 127., 15., 329.5, 4_006.),
        ("RJTT 22", (35.56755, 139.77699), -10., 36., 214.9, 2_489.),
    ] {
        for known_length_m in [None, Some(length_m)] {
            flights.push(takeoff_roll(
                &format!("F {name} roll"),
                start,
                elevation_ft,
                aircraft_height_ft,
                true_heading_deg,
                known_length_m,
            ));
        }
    }

    let filter = std::env::var("TAWS_STUDY_FILTER").unwrap_or_default();
    for flight in flights.iter().filter(|f| f.name.contains(&filter)) {
        print!("{}", run_flight(flight, &mut terrain));
    }
}
