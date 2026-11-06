//! The runways of the airports around the aircraft, as the systems host finds them in the sim's airport database:
//! the hard surface runways of 3500 ft or more, one entry per runway, sent to the EGPWC as JSON.

use super::runway::{Runway, RunwayGeometry, RunwayOrigin};
use crate::surveillance::egpws::terrain_grid::GridPosition;
use serde::Deserialize;

/// Design choice: the host sends fewer; the list is cut here too, so that a faulty message cannot make the per-frame
/// runway search long.
const MAXIMUM_RUNWAYS: usize = 100;

/// Where the messages of the runway database come from.
pub trait RunwayDatabaseMessages {
    /// The latest message received since the previous call, if any
    fn take_latest_message(&mut self) -> Option<String>;
}

/// Without a runway database (tests, platforms without the systems host) only the flight plan runways and the
/// takeoff point are known.
pub struct NoRunwayDatabase;

impl RunwayDatabaseMessages for NoRunwayDatabase {
    fn take_latest_message(&mut self) -> Option<String> {
        None
    }
}

/// One runway of the message: its primary landing threshold, the true course from there, the length from the
/// threshold to the far end of the runway, and the threshold elevation.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseRunwayMessage {
    latitude: f64,
    longitude: f64,
    elevation_ft: f64,
    true_heading_deg: f64,
    length_ft: f64,
}

impl DatabaseRunwayMessage {
    /// None for a runway with values out of range
    fn to_runway(&self) -> Option<Runway> {
        let values_are_finite = [
            self.latitude,
            self.longitude,
            self.elevation_ft,
            self.true_heading_deg,
            self.length_ft,
        ]
        .iter()
        .all(|value| value.is_finite());
        let is_in_range = (-90.0..=90.).contains(&self.latitude)
            && (-180.0..=180.).contains(&self.longitude)
            && self.length_ft > 0.;
        (values_are_finite && is_in_range).then(|| Runway {
            reference_point: GridPosition::new(self.latitude, self.longitude),
            elevation_ft: self.elevation_ft,
            origin: RunwayOrigin::Database,
            geometry: Some(RunwayGeometry {
                true_heading_deg: self.true_heading_deg.rem_euclid(360.),
                length_ft: self.length_ft,
            }),
        })
    }
}

/// None when the message is not a list of runways: the caller then keeps the runways it has. An empty list is a valid
/// message (no airport around the aircraft).
pub fn database_runways_from_json(message: &str) -> Option<Vec<Runway>> {
    // The CommBus string can end with the NUL of the C string
    let message = message.trim_end_matches('\0');
    let runways: Vec<DatabaseRunwayMessage> = match serde_json::from_str(message) {
        Ok(runways) => runways,
        Err(error) => {
            if !message.is_empty() {
                eprintln!("SYSTEMS: Failed to parse runway database message: '{error}'");
            }
            return None;
        }
    };
    Some(
        runways
            .iter()
            .filter_map(DatabaseRunwayMessage::to_runway)
            .take(MAXIMUM_RUNWAYS)
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runway_json(latitude: f64, longitude: f64, true_heading_deg: f64, length_ft: f64) -> String {
        format!(
            "{{\"latitude\":{latitude},\"longitude\":{longitude},\"elevationFt\":1086,\
             \"trueHeadingDeg\":{true_heading_deg},\"lengthFt\":{length_ft}}}"
        )
    }

    #[test]
    fn a_runway_message_gives_a_database_runway_with_its_geometry() {
        let message = format!("[{}]", runway_json(34.43612, 132.93549, 279.8, 9_843.));
        let runways = database_runways_from_json(&message).unwrap();
        assert_eq!(
            runways,
            vec![Runway {
                reference_point: GridPosition::new(34.43612, 132.93549),
                elevation_ft: 1_086.,
                origin: RunwayOrigin::Database,
                geometry: Some(RunwayGeometry {
                    true_heading_deg: 279.8,
                    length_ft: 9_843.,
                }),
            }]
        );
    }

    #[test]
    fn a_message_followed_by_a_nul_character_is_read() {
        let message = format!("[{}]\0", runway_json(1., 2., 90., 5_000.));
        assert_eq!(database_runways_from_json(&message).unwrap().len(), 1);
    }

    // The TypeScript test "is the JSON list of the runways" writes this same message
    #[test]
    fn the_message_the_host_sends_is_read_with_its_values() {
        let message = "[{\"latitude\":0,\"longitude\":-0.01079,\"elevationFt\":33,\
                       \"trueHeadingDeg\":90,\"lengthFt\":8858}]";
        let runways = database_runways_from_json(message).unwrap();
        assert_eq!(
            runways,
            vec![Runway {
                reference_point: GridPosition::new(0., -0.01079),
                elevation_ft: 33.,
                origin: RunwayOrigin::Database,
                geometry: Some(RunwayGeometry {
                    true_heading_deg: 90.,
                    length_ft: 8_858.,
                }),
            }]
        );
    }

    #[test]
    fn the_heading_is_brought_into_0_to_360() {
        for (heading, expected) in [(370., 10.), (-10., 350.)] {
            let message = format!("[{}]", runway_json(1., 2., heading, 5_000.));
            let runways = database_runways_from_json(&message).unwrap();
            assert_eq!(runways[0].geometry.unwrap().true_heading_deg, expected);
        }
    }

    #[test]
    fn a_message_that_is_not_a_list_of_runways_is_none() {
        for message in ["", "{", "{}", "[{\"latitude\":1}]"] {
            assert!(database_runways_from_json(message).is_none(), "{message}");
        }
    }

    #[test]
    fn an_empty_list_is_a_valid_message() {
        assert_eq!(database_runways_from_json("[]"), Some(Vec::new()));
    }

    #[test]
    fn runways_out_of_range_are_left_out() {
        let message = format!(
            "[{},{},{},{}]",
            runway_json(91., 2., 90., 5_000.),
            runway_json(1., -181., 90., 5_000.),
            runway_json(1., 2., 90., 0.),
            runway_json(1., 2., 90., 5_000.),
        );
        let runways = database_runways_from_json(&message).unwrap();
        assert_eq!(runways.len(), 1);
        assert_eq!(runways[0].reference_point, GridPosition::new(1., 2.));
    }

    #[test]
    fn the_list_is_cut_at_the_maximum() {
        let entries = vec![runway_json(1., 2., 90., 5_000.); 150];
        let message = format!("[{}]", entries.join(","));
        let runways = database_runways_from_json(&message).unwrap();
        assert_eq!(runways.len(), MAXIMUM_RUNWAYS);
    }
}
