//! The phase of flight of the terrain look-ahead and the terrain clearance it must keep in each (TSO-C151c required
//! terrain clearance). The phase follows from the nearest known runway.

use super::runway::{RunwayContext, RunwayOrigin};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum TerrainPhase {
    EnRoute,
    Terminal,
    Approach,
    Departure,
}

/// How much clearance above the terrain the aircraft must keep, in level flight and while descending. The descending
/// values are lower to account for the pilot's response to the alert.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct RequiredClearance {
    pub(super) level_ft: f64,
    pub(super) descending_ft: f64,
}

impl TerrainPhase {
    const TERMINAL_RADIUS_NM: f64 = 15.;
    const APPROACH_RADIUS_NM: f64 = 5.;
    /// Height above the runway of the line that bounds the terminal area, at the terminal and approach radius.
    const TERMINAL_CEILING_AT_TERMINAL_RADIUS_FT: f64 = 3_500.;
    const APPROACH_CEILING_FT: f64 = 1_900.;
    const DEPARTURE_CEILING_FT: f64 = 1_500.;

    pub(super) fn determine(runway: Option<&RunwayContext>) -> Self {
        let Some(runway) = runway else {
            return Self::EnRoute;
        };
        let height = runway.height_above_runway_ft;
        let distance = runway.distance_nm;

        if runway.runway.origin == RunwayOrigin::Departure
            && distance <= Self::TERMINAL_RADIUS_NM
            && height <= Self::DEPARTURE_CEILING_FT
        {
            return Self::Departure;
        }
        if distance <= Self::APPROACH_RADIUS_NM && height <= Self::APPROACH_CEILING_FT {
            return Self::Approach;
        }
        // Design choice: the line that bounds the terminal area ends at 5 NM, so inside 5 NM and above the approach
        // ceiling the aircraft is still in the terminal area. The required clearance must not step up to the en route
        // value closer to the runway.
        if distance <= Self::APPROACH_RADIUS_NM
            || (distance <= Self::TERMINAL_RADIUS_NM
                && height <= Self::terminal_ceiling_ft(distance))
        {
            return Self::Terminal;
        }
        Self::EnRoute
    }

    /// The line from (15 NM, 3500 ft) to (5 NM, 1900 ft) above the runway.
    fn terminal_ceiling_ft(distance_nm: f64) -> f64 {
        let slope = (Self::TERMINAL_CEILING_AT_TERMINAL_RADIUS_FT - Self::APPROACH_CEILING_FT)
            / (Self::TERMINAL_RADIUS_NM - Self::APPROACH_RADIUS_NM);
        Self::APPROACH_CEILING_FT + slope * (distance_nm - Self::APPROACH_RADIUS_NM)
    }

    pub(super) fn required_clearance(&self) -> RequiredClearance {
        let (level_ft, descending_ft) = match self {
            Self::EnRoute => (700., 500.),
            Self::Terminal => (350., 300.),
            Self::Approach => (150., 100.),
            Self::Departure => (100., 100.),
        };
        RequiredClearance {
            level_ft,
            descending_ft,
        }
    }

    /// The assumed time the pilot needs to react, from the TSO test conditions.
    pub(super) fn pilot_delay_s(&self) -> f64 {
        match self {
            Self::EnRoute => 3.,
            _ => 1.,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surveillance::egpws::{predictive::runway::Runway, terrain_grid::GridPosition};
    use rstest::rstest;

    fn context(origin: RunwayOrigin, distance_nm: f64, height_ft: f64) -> RunwayContext {
        RunwayContext {
            runway: Runway {
                reference_point: GridPosition::new(0., 0.),
                elevation_ft: 0.,
                origin,
            },
            distance_nm,
            height_above_runway_ft: height_ft,
        }
    }

    #[test]
    fn without_a_runway_the_phase_is_en_route() {
        assert_eq!(TerrainPhase::determine(None), TerrainPhase::EnRoute);
    }

    #[rstest]
    #[case(4.9, 1_800., TerrainPhase::Approach)]
    #[case(4.9, 1_950., TerrainPhase::Terminal)]
    #[case(5.1, 1_900., TerrainPhase::Terminal)]
    #[case(10., 2_600., TerrainPhase::Terminal)]
    #[case(10., 2_800., TerrainPhase::EnRoute)]
    #[case(14.9, 3_400., TerrainPhase::Terminal)]
    #[case(15.1, 1_000., TerrainPhase::EnRoute)]
    fn the_destination_phase_follows_the_tso_terminal_line(
        #[case] distance_nm: f64,
        #[case] height_ft: f64,
        #[case] expected: TerrainPhase,
    ) {
        let runway = context(RunwayOrigin::Destination, distance_nm, height_ft);
        assert_eq!(TerrainPhase::determine(Some(&runway)), expected);
    }

    #[test]
    fn departure_lasts_until_1500_ft_above_the_departure_runway() {
        let low = context(RunwayOrigin::Departure, 3., 1_400.);
        let high = context(RunwayOrigin::Departure, 3., 1_600.);
        assert_eq!(TerrainPhase::determine(Some(&low)), TerrainPhase::Departure);
        assert_eq!(TerrainPhase::determine(Some(&high)), TerrainPhase::Approach);
    }

    #[rstest]
    #[case(TerrainPhase::EnRoute, 700., 500.)]
    #[case(TerrainPhase::Terminal, 350., 300.)]
    #[case(TerrainPhase::Approach, 150., 100.)]
    #[case(TerrainPhase::Departure, 100., 100.)]
    fn the_required_clearance_is_the_tso_one(
        #[case] phase: TerrainPhase,
        #[case] level_ft: f64,
        #[case] descending_ft: f64,
    ) {
        let clearance = phase.required_clearance();
        assert_eq!(clearance.level_ft, level_ft);
        assert_eq!(clearance.descending_ft, descending_ft);
    }

    #[test]
    fn the_pilot_is_slower_to_react_en_route() {
        assert_eq!(TerrainPhase::EnRoute.pilot_delay_s(), 3.);
        assert_eq!(TerrainPhase::Terminal.pilot_delay_s(), 1.);
    }
}
