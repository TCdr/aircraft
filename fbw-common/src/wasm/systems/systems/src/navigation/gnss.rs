//! GPS receivers: the GPS 1 receiver in MMR 1 and the GPS 2 receiver in MMR 2, and the satellites they track.
//!
//! A320 FCOM DSC-34 GPS: "Worldwide, 24 satellites broadcast accurate navigation data", the two independent receivers
//! process them and send their data to the ADIRUs. A320 FCOM DSC-22_20 MCDU GPS MONITOR and A380 FCOM DSC-34-10-40-10:
//! the receiver modes INIT (initialization at power up), ACQ (satellite acquisition, until at least four satellites are
//! tracked), NAV (four or more satellites tracked, data sent to the ADIRS) and FAULT.
//!
//! The simulator has no satellites: they are computed from the nominal 24-slot GPS constellation (six orbital planes,
//! four slots each) at the simulator's UTC time, and the receiver's figures (number of satellites, figure of merit,
//! integrity limit) follow from their geometry as seen from the aircraft. The antenna is on top of the fuselage: in a
//! turn or a steep climb, the satellites low on the far side of the aircraft are masked.
//!
//! The FCOMs only name the other modes: TEST (system test), ALTAID and AIDED ("degraded modes, GPS uses aircraft inputs
//! for computation purposes") and, on the A380, DIFF. What they do here is a design choice following ARINC 743A GNSS
//! sensors:
//! - TEST: the self test at power up, before INIT; the data words carry the functional test status.
//! - ALTAID: with three satellites, the receiver uses the ADR barometric altitude as a fourth measurement.
//! - AIDED: with fewer satellites, the receiver coasts on the IR velocities for up to two minutes; its accuracy degrades
//!   with time and it gives no integrity limit.
//! - DIFF (SBAS capable receivers, the A380): in NAV inside a satellite based augmentation service area (WAAS, EGNOS,
//!   MSAS, GAGAN), the corrections make the position several times more accurate.

use crate::{
    failures::{Failure, FailureType},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        random_from_normal_distribution, random_from_range, ConsumePower, ElectricalBusType,
        ElectricalBuses,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use nalgebra::{DMatrix, Vector3};
use std::time::Duration;
use uom::si::{
    angle::degree,
    f64::{Angle, Length, Power, Velocity},
    length::{foot, meter, nautical_mile},
    power::watt,
};

/// WGS 84 semi-major axis, in metres
const EARTH_SEMI_MAJOR_AXIS_M: f64 = 6_378_137.;
/// WGS 84 first eccentricity squared
const EARTH_ECCENTRICITY_SQUARED: f64 = 6.694_379_990_14e-3;

/// The nominal 24-slot GPS constellation: six orbital planes (A to F) 60 degrees apart, inclined 55 degrees, four
/// satellites per plane, on circular orbits of half a sidereal day (semi-major axis 26 559.7 km). The longitudes of the
/// ascending nodes and the arguments of latitude are the nominal slot values at the reference epoch of the GPS
/// Standard Positioning Service Performance Standard (0000 UTC, 1 July 1993).
pub struct GpsConstellation;

impl GpsConstellation {
    const SATELLITE_COUNT: usize = 24;
    const SEMI_MAJOR_AXIS_M: f64 = 26_559_700.;
    const INCLINATION_DEG: f64 = 55.;
    /// Earth's gravitational constant (WGS 84 value used by GPS), in m³/s²
    const GRAVITATIONAL_CONSTANT: f64 = 3.986_005e14;
    /// Earth's rotation rate, in rad/s
    const EARTH_ROTATION_RATE: f64 = 7.292_115_146_7e-5;
    /// Regression of the ascending nodes caused by Earth's oblateness, in rad/s (about -0.04 degree a day)
    const NODAL_REGRESSION_RATE: f64 = -8.0e-9;
    /// The reference epoch, 1 July 1993 0000 UTC, in seconds since 1 January 1970 0000 UTC
    const EPOCH_UNIX_SECONDS: f64 = 741_484_800.;
    /// The longitude of the ascending node of the planes A to F at the epoch, in degrees
    const ASCENDING_NODES_DEG: [f64; 6] = [272.847, 332.847, 32.847, 92.847, 152.847, 212.847];
    /// The argument of latitude of the four slots of the planes A to F at the epoch, in degrees
    const ARGUMENTS_OF_LATITUDE_DEG: [[f64; 4]; 6] = [
        [268.126, 161.786, 11.676, 41.806],
        [80.956, 173.336, 309.976, 204.376],
        [111.876, 11.796, 339.666, 241.556],
        [135.226, 265.446, 35.156, 167.356],
        [197.046, 302.596, 66.066, 333.686],
        [238.886, 345.226, 105.206, 135.346],
    ];

    /// The position of every satellite at the given time, in the Earth-centred Earth-fixed frame, in metres.
    pub fn satellite_positions(unix_seconds: f64) -> Vec<Vector3<f64>> {
        let elapsed = unix_seconds - Self::EPOCH_UNIX_SECONDS;
        let mean_motion = (Self::GRAVITATIONAL_CONSTANT / Self::SEMI_MAJOR_AXIS_M.powi(3)).sqrt();
        let inclination = Self::INCLINATION_DEG.to_radians();
        let (sin_i, cos_i) = inclination.sin_cos();
        let node_drift = (Self::NODAL_REGRESSION_RATE - Self::EARTH_ROTATION_RATE) * elapsed;

        let mut positions = Vec::with_capacity(Self::SATELLITE_COUNT);
        for (plane, slots) in Self::ARGUMENTS_OF_LATITUDE_DEG.iter().enumerate() {
            let ascending_node = Self::ASCENDING_NODES_DEG[plane].to_radians() + node_drift;
            let (sin_o, cos_o) = ascending_node.sin_cos();
            for argument in slots {
                let u = argument.to_radians() + mean_motion * elapsed;
                let (sin_u, cos_u) = u.sin_cos();
                positions.push(
                    Vector3::new(
                        cos_u * cos_o - sin_u * cos_i * sin_o,
                        cos_u * sin_o + sin_u * cos_i * cos_o,
                        sin_u * sin_i,
                    ) * Self::SEMI_MAJOR_AXIS_M,
                );
            }
        }
        positions
    }
}

/// A position on the WGS 84 ellipsoid in the Earth-centred Earth-fixed frame, in metres.
pub fn geodetic_to_ecef(latitude: Angle, longitude: Angle, height: Length) -> Vector3<f64> {
    let (sin_lat, cos_lat) = latitude.get::<uom::si::angle::radian>().sin_cos();
    let (sin_lon, cos_lon) = longitude.get::<uom::si::angle::radian>().sin_cos();
    let h = height.get::<meter>();
    let prime_vertical_radius =
        EARTH_SEMI_MAJOR_AXIS_M / (1. - EARTH_ECCENTRICITY_SQUARED * sin_lat * sin_lat).sqrt();
    Vector3::new(
        (prime_vertical_radius + h) * cos_lat * cos_lon,
        (prime_vertical_radius + h) * cos_lat * sin_lon,
        (prime_vertical_radius * (1. - EARTH_ECCENTRICITY_SQUARED) + h) * sin_lat,
    )
}

/// What the satellites above the horizon give a receiver at a position: how many it tracks, the dilution of precision
/// of their geometry, and from it the accuracy (figure of merit) and the integrity limit of the position.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SatelliteGeometry {
    tracked: usize,
    horizontal_dilution: Option<f64>,
    horizontal_integrity_limit: Option<Length>,
    /// The horizontal dilution with the barometric altitude as an extra measurement (altitude aiding), from three
    /// satellites
    altitude_aided_horizontal_dilution: Option<f64>,
}

impl SatelliteGeometry {
    /// Satellites lower than this above the horizon are not tracked
    const ELEVATION_MASK_DEG: f64 = 5.;
    /// The standard deviation of the range error of one satellite (user equivalent range error), in metres
    const RANGE_ERROR_STD_DEV_M: f64 = 5.;
    /// The figure of merit is the 95 % horizontal accuracy: twice the standard deviation of the horizontal error
    const FIGURE_OF_MERIT_FACTOR: f64 = 2.;
    /// The integrity limit (receiver autonomous integrity monitoring, slope method): the largest horizontal error a
    /// failed satellite can cause before the receiver detects it, at a fault detection probability of about 0.999
    const INTEGRITY_BIAS_FACTOR: f64 = 5.33;
    /// The standard deviation of the barometric altitude used for altitude aiding, in metres (design choice)
    const ALTITUDE_AIDING_STD_DEV_M: f64 = 10.;

    /// The geometry of the satellites above the elevation mask from the receiver position (ECEF metres), the antenna
    /// level.
    pub fn new(
        receiver: Vector3<f64>,
        latitude: Angle,
        longitude: Angle,
        satellites: &[Vector3<f64>],
    ) -> Self {
        Self::new_with_antenna(
            receiver,
            latitude,
            longitude,
            Vector3::new(0., 0., 1.),
            satellites,
        )
    }

    /// The geometry of the satellites above the elevation mask both from the local horizon and from the plane of the
    /// antenna, whose normal is `antenna_up` in the local east/north/up frame.
    pub fn new_with_antenna(
        receiver: Vector3<f64>,
        latitude: Angle,
        longitude: Angle,
        antenna_up: Vector3<f64>,
        satellites: &[Vector3<f64>],
    ) -> Self {
        let (sin_lat, cos_lat) = latitude.get::<uom::si::angle::radian>().sin_cos();
        let (sin_lon, cos_lon) = longitude.get::<uom::si::angle::radian>().sin_cos();
        let east = Vector3::new(-sin_lon, cos_lon, 0.);
        let north = Vector3::new(-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat);
        let up = Vector3::new(cos_lat * cos_lon, cos_lat * sin_lon, sin_lat);
        let mask = Self::ELEVATION_MASK_DEG.to_radians().sin();

        // The lines of sight to the visible satellites, in the local east/north/up frame
        let lines_of_sight: Vec<Vector3<f64>> = satellites
            .iter()
            .filter_map(|satellite| {
                let line = (satellite - receiver).normalize();
                let local = Vector3::new(line.dot(&east), line.dot(&north), line.dot(&up));
                (local.z > mask && local.dot(&antenna_up) > mask).then_some(local)
            })
            .collect();

        Self::from_lines_of_sight(&lines_of_sight)
    }

    /// The geometry of satellites given by their unit lines of sight in the local east/north/up frame.
    pub fn from_lines_of_sight(lines_of_sight: &[Vector3<f64>]) -> Self {
        let tracked = lines_of_sight.len();
        let altitude_aided_horizontal_dilution = if tracked >= 3 {
            Self::altitude_aided_dilution(lines_of_sight)
        } else {
            None
        };
        if tracked < 4 {
            // No position: four unknowns (3D position and the receiver clock)
            return Self {
                tracked,
                horizontal_dilution: None,
                horizontal_integrity_limit: None,
                altitude_aided_horizontal_dilution,
            };
        }

        // Least squares geometry matrix: one row per satellite, the unknowns east, north, up and clock
        let geometry = DMatrix::from_fn(tracked, 4, |row, column| {
            if column == 3 {
                1.
            } else {
                -lines_of_sight[row][column]
            }
        });
        let normal = geometry.transpose() * &geometry;
        let Some(covariance) = normal.try_inverse() else {
            return Self {
                tracked,
                horizontal_dilution: None,
                horizontal_integrity_limit: None,
                altitude_aided_horizontal_dilution,
            };
        };
        let horizontal_dilution = (covariance[(0, 0)] + covariance[(1, 1)]).sqrt();

        // Integrity needs a redundant satellite (five or more): the slope of each satellite is the horizontal error it
        // causes per unit of the test statistic; the largest one gives the protection level
        let horizontal_integrity_limit = if tracked >= 5 {
            let solution = &covariance * geometry.transpose();
            let residual = DMatrix::identity(tracked, tracked) - &geometry * &solution;
            (0..tracked)
                .filter_map(|satellite| {
                    let residual_gain = residual[(satellite, satellite)];
                    (residual_gain > 1e-9).then(|| {
                        (solution[(0, satellite)].powi(2) + solution[(1, satellite)].powi(2)).sqrt()
                            / residual_gain.sqrt()
                    })
                })
                .fold(None, |largest: Option<f64>, slope| {
                    Some(largest.map_or(slope, |l| l.max(slope)))
                })
                .map(|slope| {
                    Length::new::<meter>(
                        slope * Self::RANGE_ERROR_STD_DEV_M * Self::INTEGRITY_BIAS_FACTOR,
                    )
                })
        } else {
            None
        };

        Self {
            tracked,
            horizontal_dilution: Some(horizontal_dilution),
            horizontal_integrity_limit,
            altitude_aided_horizontal_dilution,
        }
    }

    /// The horizontal dilution of the satellites plus the barometric altitude, weighted by its larger error: the altitude
    /// measures the up unknown directly
    fn altitude_aided_dilution(lines_of_sight: &[Vector3<f64>]) -> Option<f64> {
        let rows = lines_of_sight.len() + 1;
        let altitude_weight = Self::RANGE_ERROR_STD_DEV_M / Self::ALTITUDE_AIDING_STD_DEV_M;
        let geometry = DMatrix::from_fn(rows, 4, |row, column| {
            if row == lines_of_sight.len() {
                if column == 2 {
                    altitude_weight
                } else {
                    0.
                }
            } else if column == 3 {
                1.
            } else {
                -lines_of_sight[row][column]
            }
        });
        let covariance = (geometry.transpose() * &geometry).try_inverse()?;
        Some((covariance[(0, 0)] + covariance[(1, 1)]).sqrt())
    }

    pub fn tracked(&self) -> usize {
        self.tracked
    }

    pub fn horizontal_dilution(&self) -> Option<f64> {
        self.horizontal_dilution
    }

    /// The 95 % horizontal accuracy of the position (HFOM, the MERIT of the MCDU GPS MONITOR page)
    pub fn horizontal_figure_of_merit(&self) -> Option<Length> {
        self.horizontal_dilution.map(|hdop| {
            Length::new::<meter>(hdop * Self::RANGE_ERROR_STD_DEV_M * Self::FIGURE_OF_MERIT_FACTOR)
        })
    }

    /// The horizontal integrity limit (HIL), none without a redundant satellite
    pub fn horizontal_integrity_limit(&self) -> Option<Length> {
        self.horizontal_integrity_limit
    }

    /// The 95 % horizontal accuracy of an altitude aided position (three satellites and the barometric altitude)
    pub fn altitude_aided_figure_of_merit(&self) -> Option<Length> {
        self.altitude_aided_horizontal_dilution.map(|hdop| {
            Length::new::<meter>(hdop * Self::RANGE_ERROR_STD_DEV_M * Self::FIGURE_OF_MERIT_FACTOR)
        })
    }

    /// The standard deviation of the horizontal position error along one axis, altitude aided or not
    fn axis_error_std_dev_m(&self, altitude_aided: bool) -> f64 {
        let dilution = if altitude_aided {
            self.altitude_aided_horizontal_dilution
        } else {
            self.horizontal_dilution
        };
        dilution.map_or(0., |hdop| hdop * Self::RANGE_ERROR_STD_DEV_M / 2f64.sqrt())
    }
}

/// The service areas of the satellite based augmentation systems, as latitude/longitude boxes in degrees (south, north,
/// west, east). A coarse design choice: WAAS (North America), EGNOS (Europe), MSAS (Japan), GAGAN (India).
const SBAS_SERVICE_AREAS: [(f64, f64, f64, f64); 4] = [
    (15., 72., -170., -50.),
    (30., 72., -30., 45.),
    (20., 48., 122., 150.),
    (0., 40., 60., 100.),
];

/// Whether a position is inside a satellite based augmentation service area
pub fn is_in_sbas_service_area(latitude: Angle, longitude: Angle) -> bool {
    let (lat, lon) = (latitude.get::<degree>(), longitude.get::<degree>());
    SBAS_SERVICE_AREAS.iter().any(|(south, north, west, east)| {
        (*south..=*north).contains(&lat) && (*west..=*east).contains(&lon)
    })
}

/// The normal to the top of the fuselage (the GPS antenna) in the local east/north/up frame, from the attitude: pitch
/// positive nose up, roll positive right wing down, true heading.
pub fn antenna_normal(pitch: Angle, roll: Angle, true_heading: Angle) -> Vector3<f64> {
    let (sin_p, cos_p) = pitch.get::<uom::si::angle::radian>().sin_cos();
    let (sin_r, cos_r) = roll.get::<uom::si::angle::radian>().sin_cos();
    let (sin_h, cos_h) = true_heading.get::<uom::si::angle::radian>().sin_cos();
    Vector3::new(
        sin_r * cos_h - cos_r * sin_p * sin_h,
        -cos_r * sin_p * cos_h - sin_r * sin_h,
        cos_r * cos_p,
    )
}

/// The mode of a GPS receiver (A320 FCOM DSC-22_20 MCDU GPS MONITOR, A380 FCOM DSC-34-10-40-10), as written to
/// `GPS_n_MODE`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GpsReceiverMode {
    /// Not powered
    Off = 0,
    /// Initialization at power up
    Init = 1,
    /// Satellite acquisition: after power up, or after a long loss of the satellite signals
    Acquisition = 2,
    /// Four or more satellites tracked: the data goes to the ADIRS
    Navigation = 3,
    /// A failure prevents the receiver from transmitting valid data
    Fault = 4,
    /// The self test at power up
    Test = 5,
    /// Three satellites and the barometric altitude
    AltitudeAiding = 6,
    /// Coasting on the inertial data with too few satellites
    Aided = 7,
    /// Navigation with satellite based augmentation corrections
    Differential = 8,
}

impl GpsReceiverMode {
    /// Whether the receiver computes a position (NAV and the degraded and augmented navigation modes)
    pub fn is_navigating(&self) -> bool {
        matches!(
            self,
            GpsReceiverMode::Navigation
                | GpsReceiverMode::AltitudeAiding
                | GpsReceiverMode::Aided
                | GpsReceiverMode::Differential
        )
    }
}

/// What a navigating receiver does next, from the satellites in view and the aircraft inputs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NavigationStep {
    /// Four or more satellites: NAV (or DIFF)
    Satellites,
    /// Three satellites and the barometric altitude: ALTAID
    AltitudeAiding,
    /// Too few satellites, the inertial data valid and not coasting for too long: AIDED
    Coasting,
    /// Back to ACQ
    Reacquisition,
}

impl NavigationStep {
    /// `coasting_for` is the time already spent in AIDED, none when not coasting
    fn next(
        tracked: usize,
        has_altitude_aiding: bool,
        has_inertial_aiding: bool,
        coasting_for: Option<Duration>,
    ) -> Self {
        if tracked >= 4 {
            Self::Satellites
        } else if tracked == 3 && has_altitude_aiding {
            Self::AltitudeAiding
        } else if has_inertial_aiding
            && coasting_for.is_none_or(|time| time < GpsReceiver::AIDED_MAX)
        {
            Self::Coasting
        } else {
            Self::Reacquisition
        }
    }
}

/// The GPS receiver of one MMR.
pub struct GpsReceiver {
    number: usize,
    failure: Failure,
    powered_by: ElectricalBusType,
    is_powered: bool,
    /// Whether the receiver uses satellite based augmentation (DIFF mode)
    sbas_capable: bool,

    mode: GpsReceiverMode,
    /// The time left in INIT or ACQ before the next mode
    time_to_next_mode: Duration,
    unpowered_for: Duration,
    /// Whether this acquisition is a warm start (the receiver was powered not long ago and still has the satellite
    /// data), else a cold start helped by the ADIRS position and time
    warm_start: bool,
    since_geometry_update: Duration,
    geometry: SatelliteGeometry,
    /// The slowly wandering error of the position, east and north, in metres (first order Gauss-Markov)
    position_error_m: (f64, f64),
    /// The figure of merit of the last position computed from the satellites, where AIDED starts from
    last_figure_of_merit: Length,
    /// In AIDED: how long the receiver has been coasting and the drift of its position, east and north, in m/s
    aided_for: Duration,
    aided_drift_m_s: (f64, f64),

    latitude_id: VariableIdentifier,
    longitude_id: VariableIdentifier,
    altitude_id: VariableIdentifier,
    ground_speed_id: VariableIdentifier,
    true_track_id: VariableIdentifier,
    utc_id: VariableIdentifier,
    pitch_id: VariableIdentifier,
    roll_id: VariableIdentifier,
    true_heading_id: VariableIdentifier,
    adr_altitude_id: VariableIdentifier,
    ir_latitude_ids: [VariableIdentifier; 2],
    latitude: Angle,
    longitude: Angle,
    altitude: Length,
    ground_speed: Velocity,
    true_track: Angle,
    utc_unix_seconds: f64,
    pitch: Angle,
    roll: Angle,
    true_heading: Angle,
    /// Whether the ADR gives a valid barometric altitude for altitude aiding
    has_altitude_aiding: bool,
    /// Whether an IR gives valid inertial data for inertial aiding
    has_inertial_aiding: bool,

    gps_latitude_id: VariableIdentifier,
    gps_longitude_id: VariableIdentifier,
    gps_altitude_id: VariableIdentifier,
    gps_ground_speed_id: VariableIdentifier,
    gps_true_track_id: VariableIdentifier,
    gps_figure_of_merit_id: VariableIdentifier,
    gps_integrity_limit_id: VariableIdentifier,
    gps_satellites_id: VariableIdentifier,
    gps_mode_id: VariableIdentifier,
}

impl GpsReceiver {
    pub const UTC_UNIX_SECONDS: &'static str = "GNSS_UTC_UNIX_SECONDS";
    const LATITUDE: &'static str = "PLANE LATITUDE";
    const LONGITUDE: &'static str = "PLANE LONGITUDE";
    const ALTITUDE: &'static str = "PLANE ALTITUDE";
    const GROUND_SPEED: &'static str = "GPS GROUND SPEED";
    const TRUE_TRACK: &'static str = "GPS GROUND TRUE TRACK";
    const PITCH: &'static str = "PLANE PITCH DEGREES";
    const ROLL: &'static str = "PLANE BANK DEGREES";
    const TRUE_HEADING: &'static str = "PLANE HEADING DEGREES TRUE";

    // The times below are design choices (the FCOMs give no duration): a few seconds of self test and initialization,
    // then the acquisition of the satellites; with the satellite data kept (powered again within WARM_START_MAX) it is
    // quick, else the receiver starts from the ADIRS position and time (A380 FCOM DSC-34-10-40-10) and needs about two
    // minutes.
    const TEST_TIME_S: (f64, f64) = (1.5, 2.5);
    const INIT_TIME_S: (f64, f64) = (2.5, 4.5);
    const WARM_ACQUISITION_TIME_S: (f64, f64) = (15., 30.);
    const COLD_ACQUISITION_TIME_S: (f64, f64) = (80., 130.);
    const REACQUISITION_TIME_S: (f64, f64) = (5., 15.);
    const WARM_START_MAX: Duration = Duration::from_secs(15 * 60);
    /// The satellite geometry is computed again at this interval
    const GEOMETRY_UPDATE_INTERVAL: Duration = Duration::from_secs(1);
    /// Correlation time of the position error, in seconds
    const POSITION_ERROR_CORRELATION_TIME_S: f64 = 300.;
    /// The longest time the receiver coasts on the inertial data (AIDED) before it acquires the satellites again
    const AIDED_MAX: Duration = Duration::from_secs(120);
    /// The standard deviation of the drift of the coasting position along one axis, in m/s; the figure of merit grows
    /// by twice as much (95 %)
    const AIDED_DRIFT_STD_DEV_M_S: f64 = 0.5;
    /// The range error of a satellite with the augmentation corrections over the one without (about 1.2 m over 5 m)
    const DIFFERENTIAL_ERROR_RATIO: f64 = 0.25;

    /// The receiver of an MMR that does not use satellite based augmentation (no DIFF mode)
    pub fn new(context: &mut InitContext, number: usize, powered_by: ElectricalBusType) -> Self {
        Self::new_with_augmentation(context, number, powered_by, false)
    }

    /// The receiver of an MMR, `sbas_capable` when it uses satellite based augmentation (DIFF mode)
    pub fn new_with_augmentation(
        context: &mut InitContext,
        number: usize,
        powered_by: ElectricalBusType,
        sbas_capable: bool,
    ) -> Self {
        let running = context.has_engines_running();
        Self {
            number,
            failure: Failure::new(FailureType::Gps(number)),
            powered_by,
            is_powered: false,
            sbas_capable,
            // A flight started in the air or with the engines running starts with the receivers in NAV
            mode: if running {
                GpsReceiverMode::Navigation
            } else {
                GpsReceiverMode::Off
            },
            time_to_next_mode: Duration::ZERO,
            unpowered_for: if running {
                Duration::ZERO
            } else {
                Self::WARM_START_MAX * 2
            },
            warm_start: false,
            // Compute the geometry at the first update
            since_geometry_update: Self::GEOMETRY_UPDATE_INTERVAL,
            geometry: SatelliteGeometry::from_lines_of_sight(&[]),
            position_error_m: (0., 0.),
            last_figure_of_merit: Length::default(),
            aided_for: Duration::ZERO,
            aided_drift_m_s: (0., 0.),

            latitude_id: context.get_identifier(Self::LATITUDE.to_owned()),
            longitude_id: context.get_identifier(Self::LONGITUDE.to_owned()),
            altitude_id: context.get_identifier(Self::ALTITUDE.to_owned()),
            ground_speed_id: context.get_identifier(Self::GROUND_SPEED.to_owned()),
            true_track_id: context.get_identifier(Self::TRUE_TRACK.to_owned()),
            utc_id: context.get_identifier(Self::UTC_UNIX_SECONDS.to_owned()),
            pitch_id: context.get_identifier(Self::PITCH.to_owned()),
            roll_id: context.get_identifier(Self::ROLL.to_owned()),
            true_heading_id: context.get_identifier(Self::TRUE_HEADING.to_owned()),
            // MMR n uses the altitude of ADR n and the inertial data of IR n, else IR 3
            adr_altitude_id: context.get_identifier(format!("ADIRS_ADR_{}_ALTITUDE", number)),
            ir_latitude_ids: [
                context.get_identifier(format!("ADIRS_IR_{}_LATITUDE", number)),
                context.get_identifier("ADIRS_IR_3_LATITUDE".to_owned()),
            ],
            latitude: Angle::default(),
            longitude: Angle::default(),
            altitude: Length::default(),
            ground_speed: Velocity::default(),
            true_track: Angle::default(),
            utc_unix_seconds: 0.,
            pitch: Angle::default(),
            roll: Angle::default(),
            true_heading: Angle::default(),
            has_altitude_aiding: false,
            has_inertial_aiding: false,

            gps_latitude_id: context.get_identifier(Self::output_name(number, "LATITUDE")),
            gps_longitude_id: context.get_identifier(Self::output_name(number, "LONGITUDE")),
            gps_altitude_id: context.get_identifier(Self::output_name(number, "ALTITUDE")),
            gps_ground_speed_id: context.get_identifier(Self::output_name(number, "GROUND_SPEED")),
            gps_true_track_id: context.get_identifier(Self::output_name(number, "TRUE_TRACK")),
            gps_figure_of_merit_id: context
                .get_identifier(Self::output_name(number, "HORIZONTAL_FIGURE_OF_MERIT")),
            gps_integrity_limit_id: context
                .get_identifier(Self::output_name(number, "HORIZONTAL_INTEGRITY_LIMIT")),
            gps_satellites_id: context.get_identifier(Self::output_name(number, "SATELLITES")),
            gps_mode_id: context.get_identifier(Self::output_name(number, "MODE")),
        }
    }

    fn output_name(number: usize, name: &str) -> String {
        format!("GPS_{}_{}", number, name)
    }

    pub fn update(&mut self, context: &UpdateContext) {
        if !self.is_powered {
            self.unpowered_for += context.delta();
            self.mode = GpsReceiverMode::Off;
            return;
        }

        if self.failure.is_active() {
            self.mode = GpsReceiverMode::Fault;
            return;
        }

        self.since_geometry_update += context.delta();
        if self.since_geometry_update >= Self::GEOMETRY_UPDATE_INTERVAL {
            self.since_geometry_update = Duration::ZERO;
            self.update_geometry();
        }

        match self.mode {
            GpsReceiverMode::Off | GpsReceiverMode::Fault => {
                // Power up, or the failure has cleared: start again with the self test
                self.warm_start = self.unpowered_for <= Self::WARM_START_MAX;
                self.enter(GpsReceiverMode::Test, Self::TEST_TIME_S);
            }
            GpsReceiverMode::Test => {
                if self.count_down(context) {
                    self.enter(GpsReceiverMode::Init, Self::INIT_TIME_S);
                }
            }
            GpsReceiverMode::Init => {
                if self.count_down(context) {
                    let time = if self.warm_start {
                        Self::WARM_ACQUISITION_TIME_S
                    } else {
                        Self::COLD_ACQUISITION_TIME_S
                    };
                    self.enter(GpsReceiverMode::Acquisition, time);
                }
            }
            GpsReceiverMode::Acquisition => {
                // A380 FCOM DSC-34-10-40-10: in ACQ "until it is able to track at least four satellites"
                if self.count_down(context) && self.geometry.tracked() >= 4 {
                    self.mode = self.full_navigation_mode();
                    self.restart_position_error();
                }
            }
            GpsReceiverMode::Navigation
            | GpsReceiverMode::Differential
            | GpsReceiverMode::AltitudeAiding
            | GpsReceiverMode::Aided => self.update_navigation_mode(context),
        }
        self.unpowered_for = Duration::ZERO;

        self.update_position_error(context);
        if self.mode.is_navigating() && self.mode != GpsReceiverMode::Aided {
            if let Some(figure_of_merit) = self.navigation_figure_of_merit() {
                self.last_figure_of_merit = figure_of_merit;
            }
        }
    }

    /// NAV, or DIFF inside an augmentation service area for a receiver that uses it
    fn full_navigation_mode(&self) -> GpsReceiverMode {
        if self.sbas_capable && is_in_sbas_service_area(self.latitude, self.longitude) {
            GpsReceiverMode::Differential
        } else {
            GpsReceiverMode::Navigation
        }
    }

    /// The navigation mode the satellites in view and the aircraft inputs allow
    fn update_navigation_mode(&mut self, context: &UpdateContext) {
        let was_aided = self.mode == GpsReceiverMode::Aided;
        let step = NavigationStep::next(
            self.geometry.tracked(),
            self.has_altitude_aiding,
            self.has_inertial_aiding,
            was_aided.then_some(self.aided_for),
        );
        match step {
            NavigationStep::Satellites | NavigationStep::AltitudeAiding => {
                self.mode = if step == NavigationStep::Satellites {
                    self.full_navigation_mode()
                } else {
                    GpsReceiverMode::AltitudeAiding
                };
                if was_aided {
                    // The satellites are back: the coasting error is gone
                    self.restart_position_error();
                }
            }
            NavigationStep::Coasting => {
                if !was_aided {
                    self.start_coasting();
                }
                self.mode = GpsReceiverMode::Aided;
                self.aided_for += context.delta();
            }
            NavigationStep::Reacquisition => {
                self.enter(GpsReceiverMode::Acquisition, Self::REACQUISITION_TIME_S);
            }
        }
    }

    fn start_coasting(&mut self) {
        self.aided_for = Duration::ZERO;
        self.aided_drift_m_s = (
            random_from_normal_distribution(0., Self::AIDED_DRIFT_STD_DEV_M_S),
            random_from_normal_distribution(0., Self::AIDED_DRIFT_STD_DEV_M_S),
        );
    }

    /// A fresh position error drawn from the current geometry
    fn restart_position_error(&mut self) {
        let std_dev = self.axis_error_std_dev_m();
        self.position_error_m = if std_dev > 0. {
            (
                random_from_normal_distribution(0., std_dev),
                random_from_normal_distribution(0., std_dev),
            )
        } else {
            (0., 0.)
        };
    }

    /// The standard deviation of the position error along one axis in the current mode, none while coasting
    fn axis_error_std_dev_m(&self) -> f64 {
        match self.mode {
            GpsReceiverMode::Navigation => self.geometry.axis_error_std_dev_m(false),
            GpsReceiverMode::Differential => {
                self.geometry.axis_error_std_dev_m(false) * Self::DIFFERENTIAL_ERROR_RATIO
            }
            GpsReceiverMode::AltitudeAiding => self.geometry.axis_error_std_dev_m(true),
            _ => 0.,
        }
    }

    /// The 95 % horizontal accuracy of the position in the current mode
    fn navigation_figure_of_merit(&self) -> Option<Length> {
        match self.mode {
            GpsReceiverMode::Navigation => self.geometry.horizontal_figure_of_merit(),
            GpsReceiverMode::Differential => self
                .geometry
                .horizontal_figure_of_merit()
                .map(|hfom| hfom * Self::DIFFERENTIAL_ERROR_RATIO),
            GpsReceiverMode::AltitudeAiding => self.geometry.altitude_aided_figure_of_merit(),
            GpsReceiverMode::Aided => Some(
                self.last_figure_of_merit
                    + Length::new::<meter>(
                        2. * Self::AIDED_DRIFT_STD_DEV_M_S * self.aided_for.as_secs_f64(),
                    ),
            ),
            _ => None,
        }
    }

    fn enter(&mut self, mode: GpsReceiverMode, time_range_s: (f64, f64)) {
        self.mode = mode;
        self.time_to_next_mode =
            Duration::from_secs_f64(random_from_range(time_range_s.0, time_range_s.1));
    }

    /// Counts the time left in the mode down, true once it has elapsed
    fn count_down(&mut self, context: &UpdateContext) -> bool {
        self.time_to_next_mode = self.time_to_next_mode.saturating_sub(context.delta());
        self.time_to_next_mode.is_zero()
    }

    fn update_geometry(&mut self) {
        let receiver = geodetic_to_ecef(self.latitude, self.longitude, self.altitude);
        let satellites = GpsConstellation::satellite_positions(self.utc_unix_seconds);
        self.geometry = SatelliteGeometry::new_with_antenna(
            receiver,
            self.latitude,
            self.longitude,
            antenna_normal(self.pitch, self.roll, self.true_heading),
            &satellites,
        );
    }

    fn update_position_error(&mut self, context: &UpdateContext) {
        let dt = context.delta().as_secs_f64();
        if self.mode == GpsReceiverMode::Aided {
            // Coasting: the position drifts away
            self.position_error_m.0 += self.aided_drift_m_s.0 * dt;
            self.position_error_m.1 += self.aided_drift_m_s.1 * dt;
            return;
        }
        let std_dev = self.axis_error_std_dev_m();
        if dt <= 0. || std_dev <= 0. {
            return;
        }
        let tau = Self::POSITION_ERROR_CORRELATION_TIME_S;
        let decay = (-dt / tau).exp();
        let noise = std_dev * (1. - decay * decay).sqrt();
        self.position_error_m = (
            self.position_error_m.0 * decay + random_from_normal_distribution(0., noise.max(1e-9)),
            self.position_error_m.1 * decay + random_from_normal_distribution(0., noise.max(1e-9)),
        );
    }

    pub fn mode(&self) -> GpsReceiverMode {
        self.mode
    }

    pub fn number(&self) -> usize {
        self.number
    }

    pub fn has_failed(&self) -> bool {
        self.failure.is_active()
    }

    /// The status of the data words: valid in the navigation modes, functional test during the self test, no computed
    /// data while initializing or acquiring, failure warning when unpowered or failed
    fn data_status(&self) -> SignStatus {
        match self.mode {
            mode if mode.is_navigating() => SignStatus::NormalOperation,
            GpsReceiverMode::Test => SignStatus::FunctionalTest,
            GpsReceiverMode::Off | GpsReceiverMode::Fault => SignStatus::FailureWarning,
            _ => SignStatus::NoComputedData,
        }
    }

    pub fn latitude(&self) -> Arinc429Word<Angle> {
        let error_deg = (self.position_error_m.1 / 111_320.).clamp(-0.01, 0.01);
        Arinc429Word::new(
            self.latitude + Angle::new::<degree>(error_deg),
            self.data_status(),
        )
    }

    pub fn longitude(&self) -> Arinc429Word<Angle> {
        let metres_per_degree =
            (111_320. * self.latitude.get::<uom::si::angle::radian>().cos()).max(1_000.);
        let error_deg = (self.position_error_m.0 / metres_per_degree).clamp(-0.01, 0.01);
        let mut longitude = self.longitude.get::<degree>() + error_deg;
        if longitude > 180. {
            longitude -= 360.;
        } else if longitude < -180. {
            longitude += 360.;
        }
        Arinc429Word::new(Angle::new::<degree>(longitude), self.data_status())
    }

    pub fn altitude(&self) -> Arinc429Word<Length> {
        Arinc429Word::new(self.altitude, self.data_status())
    }

    pub fn ground_speed(&self) -> Arinc429Word<Velocity> {
        Arinc429Word::new(self.ground_speed, self.data_status())
    }

    pub fn true_track(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(self.true_track, self.data_status())
    }

    /// The horizontal figure of merit (95 % accuracy)
    pub fn horizontal_figure_of_merit(&self) -> Arinc429Word<Length> {
        match self.navigation_figure_of_merit() {
            Some(hfom) => Arinc429Word::new(hfom, SignStatus::NormalOperation),
            None if self.mode.is_navigating() => {
                Arinc429Word::new(Length::default(), SignStatus::NoComputedData)
            }
            None => Arinc429Word::new(Length::default(), self.data_status()),
        }
    }

    /// The horizontal integrity limit: no computed data without a redundant satellite, so none when altitude aided or
    /// coasting
    pub fn horizontal_integrity_limit(&self) -> Arinc429Word<Length> {
        let integrity_limit = match self.mode {
            GpsReceiverMode::Navigation => self.geometry.horizontal_integrity_limit(),
            GpsReceiverMode::Differential => self
                .geometry
                .horizontal_integrity_limit()
                .map(|hil| hil * Self::DIFFERENTIAL_ERROR_RATIO),
            _ => None,
        };
        match integrity_limit {
            Some(hil) => Arinc429Word::new(hil, SignStatus::NormalOperation),
            None if self.mode.is_navigating() => {
                Arinc429Word::new(Length::default(), SignStatus::NoComputedData)
            }
            None => Arinc429Word::new(Length::default(), self.data_status()),
        }
    }

    /// The number of satellites tracked (also during the acquisition)
    pub fn satellites(&self) -> Arinc429Word<u32> {
        match self.mode {
            mode if mode.is_navigating() || mode == GpsReceiverMode::Acquisition => {
                Arinc429Word::new(self.geometry.tracked() as u32, SignStatus::NormalOperation)
            }
            _ => Arinc429Word::new(0, self.data_status()),
        }
    }
}

impl SimulationElement for GpsReceiver {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.latitude = reader.read(&self.latitude_id);
        self.longitude = reader.read(&self.longitude_id);
        self.altitude = reader.read(&self.altitude_id);
        self.ground_speed = reader.read(&self.ground_speed_id);
        self.true_track = reader.read(&self.true_track_id);
        self.utc_unix_seconds = reader.read(&self.utc_id);
        // The simulator's pitch is positive nose down and its bank positive left wing down
        let pitch: Angle = reader.read(&self.pitch_id);
        let roll: Angle = reader.read(&self.roll_id);
        self.pitch = -pitch;
        self.roll = -roll;
        self.true_heading = reader.read(&self.true_heading_id);
        let adr_altitude: Arinc429Word<f64> = reader.read_arinc429(&self.adr_altitude_id);
        self.has_altitude_aiding = adr_altitude.is_normal_operation();
        self.has_inertial_aiding = self.ir_latitude_ids.iter().any(|id| {
            let latitude: Arinc429Word<f64> = reader.read_arinc429(id);
            latitude.is_normal_operation()
        });
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let latitude = self.latitude();
        writer.write_arinc429(&self.gps_latitude_id, latitude.value(), latitude.ssm());
        let longitude = self.longitude();
        writer.write_arinc429(&self.gps_longitude_id, longitude.value(), longitude.ssm());
        let altitude = self.altitude();
        writer.write_arinc429(&self.gps_altitude_id, altitude.value(), altitude.ssm());
        let ground_speed = self.ground_speed();
        writer.write_arinc429(
            &self.gps_ground_speed_id,
            ground_speed.value(),
            ground_speed.ssm(),
        );
        let true_track = self.true_track();
        writer.write_arinc429(
            &self.gps_true_track_id,
            true_track.value(),
            true_track.ssm(),
        );
        // Figure of merit in feet (the MCDU GPS MONITOR MERIT), integrity limit in nautical miles (as the RNP)
        let figure_of_merit = self.horizontal_figure_of_merit();
        writer.write_arinc429(
            &self.gps_figure_of_merit_id,
            figure_of_merit.value().get::<foot>(),
            figure_of_merit.ssm(),
        );
        let integrity_limit = self.horizontal_integrity_limit();
        writer.write_arinc429(
            &self.gps_integrity_limit_id,
            integrity_limit.value().get::<nautical_mile>(),
            integrity_limit.ssm(),
        );
        let satellites = self.satellites();
        writer.write_arinc429(
            &self.gps_satellites_id,
            satellites.value() as f64,
            satellites.ssm(),
        );
        writer.write(&self.gps_mode_id, self.mode as u8 as f64);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }

    fn consume_power<T: ConsumePower>(&mut self, _: &UpdateContext, consumption: &mut T) {
        if self.is_powered {
            consumption.consume_from_bus(self.powered_by, Power::new::<watt>(15.));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::electrical::test::TestElectricitySource;
    use crate::electrical::{ElectricalBus, Electricity};
    use crate::shared::PotentialOrigin;
    use crate::simulation::test::{ReadByName, SimulationTestBed, TestBed, WriteByName};
    use crate::simulation::{Aircraft, StartState};
    use uom::si::velocity::knot;

    /// 1 October 2026 1200 UTC
    const UTC_2026_10_01_NOON: f64 = 1_790_856_000.;

    fn degrees(value: f64) -> Angle {
        Angle::new::<degree>(value)
    }

    /// The geometry seen from a place at a time
    fn geometry_at(latitude: f64, longitude: f64, height_ft: f64, unix: f64) -> SatelliteGeometry {
        let receiver = geodetic_to_ecef(
            degrees(latitude),
            degrees(longitude),
            Length::new::<foot>(height_ft),
        );
        SatelliteGeometry::new(
            receiver,
            degrees(latitude),
            degrees(longitude),
            &GpsConstellation::satellite_positions(unix),
        )
    }

    #[test]
    fn the_constellation_has_24_satellites_on_their_orbits() {
        let positions = GpsConstellation::satellite_positions(UTC_2026_10_01_NOON);
        assert_eq!(positions.len(), 24);
        for position in positions {
            assert!((position.norm() - 26_559_700.).abs() < 1.);
            // inclination 55 degrees: no satellite above 55 degrees of latitude
            assert!((position.z / position.norm()).asin().to_degrees().abs() <= 55.001);
        }
    }

    #[test]
    fn the_satellites_move_on_half_sidereal_day_orbits() {
        // After one orbit (43 082 s) the same satellite is back above the same latitude
        let now = GpsConstellation::satellite_positions(UTC_2026_10_01_NOON);
        let later = GpsConstellation::satellite_positions(UTC_2026_10_01_NOON + 43_082.);
        for (a, b) in now.iter().zip(later.iter()) {
            assert!((a.z - b.z).abs() < 50_000.);
        }
        let quarter = GpsConstellation::satellite_positions(UTC_2026_10_01_NOON + 10_800.);
        assert!(now
            .iter()
            .zip(quarter.iter())
            .all(|(a, b)| (a - b).norm() > 1_000_000.));
    }

    #[test]
    fn the_ecef_position_of_a_point_on_the_equator_and_of_the_pole() {
        let equator = geodetic_to_ecef(degrees(0.), degrees(0.), Length::default());
        assert!(
            (equator.x - 6_378_137.).abs() < 0.01
                && equator.y.abs() < 0.01
                && equator.z.abs() < 0.01
        );
        let pole = geodetic_to_ecef(degrees(90.), degrees(0.), Length::default());
        assert!((pole.z - 6_356_752.3).abs() < 0.1);
    }

    #[test]
    fn between_four_and_twelve_satellites_are_tracked_everywhere_and_at_any_time() {
        let mut total = 0;
        let mut samples = 0;
        for latitude in [-80., -45., -10., 0., 25., 45., 51.5, 70., 89.] {
            for longitude in [-150., -73., 0., 30., 120.] {
                for hour in 0..24 {
                    let geometry = geometry_at(
                        latitude,
                        longitude,
                        35_000.,
                        UTC_2026_10_01_NOON + hour as f64 * 3_600.,
                    );
                    assert!(
                        (4..=12).contains(&geometry.tracked()),
                        "{} satellites at {} {} hour {}",
                        geometry.tracked(),
                        latitude,
                        longitude,
                        hour
                    );
                    total += geometry.tracked();
                    samples += 1;
                }
            }
        }
        let mean = total as f64 / samples as f64;
        assert!((7.0..=10.0).contains(&mean), "mean {}", mean);
    }

    #[test]
    fn the_accuracy_and_integrity_figures_are_those_of_a_gps_receiver() {
        let geometry = geometry_at(45.47, -73.74, 118., UTC_2026_10_01_NOON);
        let hdop = geometry.horizontal_dilution().unwrap();
        assert!((0.5..3.).contains(&hdop), "HDOP {}", hdop);
        // MERIT of about 30 to 100 ft
        let merit = geometry.horizontal_figure_of_merit().unwrap().get::<foot>();
        assert!((15. ..150.).contains(&merit), "HFOM {} ft", merit);
        // HIL well inside an RNP APCH of 0.3 NM with a good geometry
        let hil = geometry
            .horizontal_integrity_limit()
            .unwrap()
            .get::<nautical_mile>();
        assert!(hil > 0. && hil < 0.3, "HIL {} NM", hil);
    }

    /// Unit lines of sight from azimuth/elevation pairs in degrees
    fn lines_of_sight(satellites: &[(f64, f64)]) -> Vec<Vector3<f64>> {
        satellites
            .iter()
            .map(|(azimuth, elevation)| {
                let (az, el) = (azimuth.to_radians(), elevation.to_radians());
                Vector3::new(el.cos() * az.sin(), el.cos() * az.cos(), el.sin())
            })
            .collect()
    }

    #[test]
    fn no_position_with_fewer_than_four_satellites_and_no_integrity_with_four() {
        let three = SatelliteGeometry::from_lines_of_sight(&lines_of_sight(&[
            (0., 30.),
            (120., 30.),
            (240., 30.),
        ]));
        assert_eq!(three.horizontal_dilution(), None);
        assert_eq!(three.horizontal_figure_of_merit(), None);

        let four = SatelliteGeometry::from_lines_of_sight(&lines_of_sight(&[
            (0., 30.),
            (120., 30.),
            (240., 30.),
            (0., 90.),
        ]));
        assert!(four.horizontal_dilution().is_some());
        assert_eq!(four.horizontal_integrity_limit(), None);
    }

    #[test]
    fn the_integrity_limit_grows_when_the_geometry_gets_poor() {
        let good = SatelliteGeometry::from_lines_of_sight(&lines_of_sight(&[
            (0., 20.),
            (72., 25.),
            (144., 30.),
            (216., 20.),
            (288., 35.),
            (30., 80.),
            (200., 60.),
            (100., 50.),
        ]));
        // Five satellites bunched in one part of the sky
        let poor = SatelliteGeometry::from_lines_of_sight(&lines_of_sight(&[
            (0., 20.),
            (20., 30.),
            (40., 25.),
            (10., 60.),
            (30., 45.),
        ]));
        let good_hil = good.horizontal_integrity_limit().unwrap().get::<meter>();
        let poor_hil = poor.horizontal_integrity_limit().unwrap().get::<meter>();
        assert!(
            poor_hil > good_hil * 3.,
            "good {} m poor {} m",
            good_hil,
            poor_hil
        );
        assert!(poor.horizontal_dilution().unwrap() > good.horizontal_dilution().unwrap());
    }

    #[test]
    fn three_satellites_give_a_position_only_with_the_altitude() {
        let three = SatelliteGeometry::from_lines_of_sight(&lines_of_sight(&[
            (0., 30.),
            (120., 30.),
            (240., 30.),
        ]));
        assert_eq!(three.horizontal_figure_of_merit(), None);
        let aided = three
            .altitude_aided_figure_of_merit()
            .unwrap()
            .get::<foot>();
        assert!((15. ..300.).contains(&aided), "ALTAID HFOM {} ft", aided);

        let two =
            SatelliteGeometry::from_lines_of_sight(&lines_of_sight(&[(0., 30.), (120., 30.)]));
        assert_eq!(two.altitude_aided_figure_of_merit(), None);
    }

    #[test]
    fn the_antenna_normal_follows_the_attitude() {
        let level = antenna_normal(degrees(0.), degrees(0.), degrees(0.));
        assert!((level - Vector3::new(0., 0., 1.)).norm() < 1e-9);
        // Heading north, right wing down: the top of the fuselage faces east
        let right_bank = antenna_normal(degrees(0.), degrees(30.), degrees(0.));
        assert!(right_bank.x > 0.49 && right_bank.y.abs() < 1e-9);
        // Heading east, nose up: the top of the fuselage faces west
        let climb = antenna_normal(degrees(20.), degrees(0.), degrees(90.));
        assert!(climb.x < -0.34 && climb.y.abs() < 1e-9);
    }

    #[test]
    fn a_steep_bank_masks_the_satellites_low_on_the_far_side() {
        let (latitude, longitude) = (45.47, -73.74);
        let receiver = geodetic_to_ecef(
            degrees(latitude),
            degrees(longitude),
            Length::new::<foot>(35_000.),
        );
        let banked = antenna_normal(degrees(0.), degrees(45.), degrees(0.));
        let inverted = antenna_normal(degrees(0.), degrees(180.), degrees(0.));
        let mut level_total = 0;
        let mut banked_total = 0;
        for hour in 0..24 {
            let satellites =
                GpsConstellation::satellite_positions(UTC_2026_10_01_NOON + hour as f64 * 3_600.);
            let level = SatelliteGeometry::new(
                receiver,
                degrees(latitude),
                degrees(longitude),
                &satellites,
            );
            let at_bank = SatelliteGeometry::new_with_antenna(
                receiver,
                degrees(latitude),
                degrees(longitude),
                banked,
                &satellites,
            );
            assert!(at_bank.tracked() <= level.tracked());
            level_total += level.tracked();
            banked_total += at_bank.tracked();
            let upside_down = SatelliteGeometry::new_with_antenna(
                receiver,
                degrees(latitude),
                degrees(longitude),
                inverted,
                &satellites,
            );
            assert_eq!(upside_down.tracked(), 0);
        }
        assert!(
            banked_total < level_total,
            "level {} banked {}",
            level_total,
            banked_total
        );
    }

    #[test]
    fn the_navigation_mode_follows_the_satellites_and_the_aircraft_inputs() {
        let coasting = |seconds| Some(Duration::from_secs(seconds));
        assert_eq!(
            NavigationStep::next(4, false, false, None),
            NavigationStep::Satellites
        );
        assert_eq!(
            NavigationStep::next(7, true, true, coasting(30)),
            NavigationStep::Satellites
        );
        // ALTAID needs exactly three satellites and the ADR altitude
        assert_eq!(
            NavigationStep::next(3, true, true, None),
            NavigationStep::AltitudeAiding
        );
        assert_eq!(
            NavigationStep::next(3, false, true, None),
            NavigationStep::Coasting
        );
        assert_eq!(
            NavigationStep::next(2, true, true, None),
            NavigationStep::Coasting
        );
        // AIDED needs the IR data and lasts two minutes at most
        assert_eq!(
            NavigationStep::next(2, true, false, None),
            NavigationStep::Reacquisition
        );
        assert_eq!(
            NavigationStep::next(0, false, true, coasting(119)),
            NavigationStep::Coasting
        );
        assert_eq!(
            NavigationStep::next(0, false, true, coasting(120)),
            NavigationStep::Reacquisition
        );
    }

    #[test]
    fn the_augmentation_service_areas() {
        // Montreal (WAAS), Toulouse (EGNOS), Tokyo (MSAS), Delhi (GAGAN)
        for (latitude, longitude) in [
            (45.47, -73.74),
            (43.63, 1.37),
            (35.55, 139.78),
            (28.57, 77.1),
        ] {
            assert!(is_in_sbas_service_area(
                degrees(latitude),
                degrees(longitude)
            ));
        }
        // Sydney, Johannesburg, the middle of the Pacific
        for (latitude, longitude) in [(-33.95, 151.18), (-26.14, 28.24), (10., -150.)] {
            assert!(!is_in_sbas_service_area(
                degrees(latitude),
                degrees(longitude)
            ));
        }
    }

    struct TestAircraft {
        electricity_source: TestElectricitySource,
        ac_1_bus: ElectricalBus,
        receiver: GpsReceiver,
        is_ac_1_powered: bool,
    }

    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                electricity_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                ac_1_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                receiver: GpsReceiver::new(context, 1, ElectricalBusType::AlternatingCurrent(1)),
                is_ac_1_powered: true,
            }
        }

        /// With the receiver of an MMR that uses satellite based augmentation
        fn new_with_augmentation(context: &mut InitContext) -> Self {
            let mut aircraft = Self::new(context);
            aircraft.receiver = GpsReceiver::new_with_augmentation(
                context,
                1,
                ElectricalBusType::AlternatingCurrent(1),
                true,
            );
            aircraft
        }
    }

    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.electricity_source
                .power_with_potential(uom::si::f64::ElectricPotential::new::<
                    uom::si::electric_potential::volt,
                >(115.));
            electricity.supplied_by(&self.electricity_source);
            if self.is_ac_1_powered {
                electricity.flow(&self.electricity_source, &self.ac_1_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.receiver.update(context);
        }
    }

    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.receiver.accept(visitor);
            visitor.visit(self);
        }
    }

    struct GpsTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }

    impl GpsTestBed {
        fn new(start: StartState) -> Self {
            Self::with_aircraft(start, TestAircraft::new)
        }

        fn with_augmentation(start: StartState) -> Self {
            Self::with_aircraft(start, TestAircraft::new_with_augmentation)
        }

        fn with_aircraft(
            start: StartState,
            aircraft: fn(&mut InitContext) -> TestAircraft,
        ) -> Self {
            let mut bed = Self {
                test_bed: SimulationTestBed::new_with_start_state(start, aircraft),
            };
            bed.write_by_name(GpsReceiver::LATITUDE, degrees(45.47));
            bed.write_by_name(GpsReceiver::LONGITUDE, degrees(-73.74));
            bed.write_by_name(GpsReceiver::ALTITUDE, Length::new::<foot>(118.));
            bed.write_by_name(GpsReceiver::GROUND_SPEED, Velocity::new::<knot>(0.));
            bed.write_by_name(GpsReceiver::TRUE_TRACK, degrees(240.));
            bed.write_by_name(GpsReceiver::UTC_UNIX_SECONDS, UTC_2026_10_01_NOON);
            bed
        }

        fn at(mut self, latitude: f64, longitude: f64) -> Self {
            self.write_by_name(GpsReceiver::LATITUDE, degrees(latitude));
            self.write_by_name(GpsReceiver::LONGITUDE, degrees(longitude));
            self
        }

        /// The simulator's bank, positive left wing down
        fn bank(mut self, simulator_bank: f64) -> Self {
            self.write_by_name(GpsReceiver::ROLL, degrees(simulator_bank));
            self
        }

        fn inertial_data(mut self, valid: bool) -> Self {
            let ssm = if valid {
                SignStatus::NormalOperation
            } else {
                SignStatus::FailureWarning
            };
            self.write_arinc429_by_name("ADIRS_IR_1_LATITUDE", 45.47, ssm);
            self
        }

        fn figure_of_merit(&mut self) -> Arinc429Word<f64> {
            self.read_arinc429_by_name("GPS_1_HORIZONTAL_FIGURE_OF_MERIT")
        }

        fn power(mut self, powered: bool) -> Self {
            self.command(|a| a.is_ac_1_powered = powered);
            self
        }

        fn run_for(mut self, seconds: u64) -> Self {
            // in steps of 100 ms, as the sim
            for _ in 0..seconds * 10 {
                self.run_with_delta(Duration::from_millis(100));
            }
            self
        }

        fn mode(&self) -> GpsReceiverMode {
            self.query(|a| a.receiver.mode())
        }

        fn written_mode(&mut self) -> f64 {
            self.read_by_name("GPS_1_MODE")
        }

        fn latitude(&mut self) -> Arinc429Word<Angle> {
            self.read_arinc429_by_name("GPS_1_LATITUDE")
        }

        fn integrity_limit(&mut self) -> Arinc429Word<f64> {
            self.read_arinc429_by_name("GPS_1_HORIZONTAL_INTEGRITY_LIMIT")
        }

        fn satellites(&mut self) -> Arinc429Word<f64> {
            self.read_arinc429_by_name("GPS_1_SATELLITES")
        }
    }

    impl TestBed for GpsTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn in_flight_the_receiver_navigates_at_once() {
        let mut bed = GpsTestBed::new(StartState::Cruise).run_for(1);
        assert_eq!(bed.mode(), GpsReceiverMode::Navigation);
        assert_eq!(bed.written_mode(), 3.);
        assert_eq!(bed.latitude().ssm(), SignStatus::NormalOperation);
        assert!((bed.latitude().value().get::<degree>() - 45.47).abs() < 0.001);
        let satellites = bed.satellites();
        assert_eq!(satellites.ssm(), SignStatus::NormalOperation);
        assert!(satellites.value() >= 4.);
        assert_eq!(bed.integrity_limit().ssm(), SignStatus::NormalOperation);
    }

    #[test]
    fn after_a_cold_power_up_it_initializes_then_acquires_before_navigating() {
        let mut bed = GpsTestBed::new(StartState::Apron).power(false).run_for(1);
        assert_eq!(bed.mode(), GpsReceiverMode::Off);
        assert_eq!(bed.latitude().ssm(), SignStatus::FailureWarning);

        // The self test first, then the initialization
        bed = bed.power(true).run_for(1);
        assert_eq!(bed.mode(), GpsReceiverMode::Test);
        assert_eq!(bed.written_mode(), 5.);
        assert_eq!(bed.latitude().ssm(), SignStatus::FunctionalTest);

        bed = bed.run_for(2);
        assert_eq!(bed.mode(), GpsReceiverMode::Init);
        assert_eq!(bed.latitude().ssm(), SignStatus::NoComputedData);

        bed = bed.run_for(10);
        assert_eq!(bed.mode(), GpsReceiverMode::Acquisition);
        assert_eq!(bed.satellites().ssm(), SignStatus::NormalOperation);

        // a cold acquisition takes at least 80 s
        bed = bed.run_for(60);
        assert_eq!(bed.mode(), GpsReceiverMode::Acquisition);
        bed = bed.run_for(90);
        assert_eq!(bed.mode(), GpsReceiverMode::Navigation);
        assert_eq!(bed.latitude().ssm(), SignStatus::NormalOperation);
    }

    #[test]
    fn a_short_power_cut_gives_a_warm_start() {
        let bed = GpsTestBed::new(StartState::Cruise).run_for(1);
        let mut bed = bed.power(false).run_for(60).power(true).run_for(45);
        assert_eq!(bed.mode(), GpsReceiverMode::Navigation);
        assert_eq!(bed.latitude().ssm(), SignStatus::NormalOperation);
    }

    #[test]
    fn a_failed_receiver_is_in_fault_mode_and_sends_no_valid_data() {
        let mut bed = GpsTestBed::new(StartState::Cruise).run_for(1);
        bed.fail(FailureType::Gps(1));
        bed = bed.run_for(1);
        assert_eq!(bed.mode(), GpsReceiverMode::Fault);
        assert_eq!(bed.written_mode(), 4.);
        assert_eq!(bed.latitude().ssm(), SignStatus::FailureWarning);
        assert_eq!(bed.integrity_limit().ssm(), SignStatus::FailureWarning);

        // repaired: it starts again with the self test
        bed.unfail(FailureType::Gps(1));
        bed = bed.run_for(1);
        assert_eq!(bed.mode(), GpsReceiverMode::Test);
    }

    #[test]
    fn upside_down_it_coasts_on_the_inertial_data_then_acquires_again() {
        let mut bed = GpsTestBed::new(StartState::Cruise)
            .inertial_data(true)
            .run_for(1);
        let navigating_merit = bed.figure_of_merit().value();

        bed = bed.bank(180.).run_for(2);
        assert_eq!(bed.mode(), GpsReceiverMode::Aided);
        assert_eq!(bed.written_mode(), 7.);
        assert_eq!(bed.latitude().ssm(), SignStatus::NormalOperation);
        // no integrity while coasting, and an accuracy that degrades with time
        assert_eq!(bed.integrity_limit().ssm(), SignStatus::NoComputedData);
        bed = bed.run_for(60);
        let coasting_merit = bed.figure_of_merit().value();
        assert!(
            coasting_merit > navigating_merit + 100.,
            "{} ft then {} ft",
            navigating_merit,
            coasting_merit
        );

        // after two minutes it gives up and acquires the satellites again
        bed = bed.run_for(60);
        assert_eq!(bed.mode(), GpsReceiverMode::Acquisition);
    }

    #[test]
    fn the_satellites_back_it_navigates_again() {
        let mut bed = GpsTestBed::new(StartState::Cruise)
            .inertial_data(true)
            .run_for(1)
            .bank(180.)
            .run_for(10);
        assert_eq!(bed.mode(), GpsReceiverMode::Aided);
        bed = bed.bank(0.).run_for(2);
        assert_eq!(bed.mode(), GpsReceiverMode::Navigation);
        assert_eq!(bed.integrity_limit().ssm(), SignStatus::NormalOperation);
    }

    #[test]
    fn without_the_inertial_data_it_acquires_again_at_once() {
        let bed = GpsTestBed::new(StartState::Cruise)
            .inertial_data(false)
            .run_for(1)
            .bank(180.)
            .run_for(2);
        assert_eq!(bed.mode(), GpsReceiverMode::Acquisition);
    }

    #[test]
    fn a_receiver_with_augmentation_is_in_diff_inside_a_service_area() {
        let mut plain = GpsTestBed::new(StartState::Cruise).run_for(1);
        let mut augmented = GpsTestBed::with_augmentation(StartState::Cruise).run_for(1);
        assert_eq!(plain.mode(), GpsReceiverMode::Navigation);
        assert_eq!(augmented.mode(), GpsReceiverMode::Differential);
        assert_eq!(augmented.written_mode(), 8.);
        assert!(augmented.figure_of_merit().value() < plain.figure_of_merit().value() / 2.);
        assert_eq!(
            augmented.integrity_limit().ssm(),
            SignStatus::NormalOperation
        );

        // Over Sydney there is no service: NAV
        augmented = augmented.at(-33.95, 151.18).run_for(2);
        assert_eq!(augmented.mode(), GpsReceiverMode::Navigation);
    }

    #[test]
    fn the_position_stays_within_the_figure_of_merit() {
        let mut bed = GpsTestBed::new(StartState::Cruise);
        for _ in 0..20 {
            bed = bed.run_for(30);
            let error_deg = bed.latitude().value().get::<degree>() - 45.47;
            // 95 % accuracy of tens of metres: never more than about 100 m
            assert!(
                error_deg.abs() * 111_320. < 100.,
                "{} m",
                error_deg * 111_320.
            );
        }
    }
}
