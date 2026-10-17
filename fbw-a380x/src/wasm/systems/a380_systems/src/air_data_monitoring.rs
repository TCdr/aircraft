//! Air data monitoring by the PRIMs: ADR monitoring and its failure scenarios.
//!
//! The PRIMs compare the air data of the three ADRs and of the standby instruments (ISIS) and reject a source that
//! diverges from the coherent other ones, until the end of the flight. When they cannot tell which source is wrong,
//! they reject all of them. They do the same with the three angles of attack.
//!
//! The PRIM model of fbw.wasm only votes on the ARINC status of the ADR words, so an ADR that sends a wrong value
//! with a valid status (an erroneous pitot or AOA probe, see `FailureType::AdrAirspeedErroneous` and
//! `FailureType::AdrAngleOfAttackErroneous`) is never rejected there. This module does the value comparison in
//! systems.wasm and writes the result as L:vars. fbw.wasm then feeds a rejected ADR to the PRIM and SEC models with a
//! failure warning status, which gives the law reversions (two ADRs: alternate law, all: direct law), and the FWS
//! raises NAV AIR DATA DISAGREE, NAV ALL AIR DATA DISAGREE and NAV AOA DISAGREE.
//!
//! Design choices (no published values):
//! - the standby instruments are the sim air data (they have no failure);
//! - one confirmation time of 1 s for every rejection;
//! - the low angle of attack thresholds only (CAS 16 kt, Mach .04), not the high AOA/sideslip ones;
//! - the rejections are reset on the ground below 30 kt (the "end of the flight");
//! - no monitoring in the first 5 s of the simulation, while the static pressure filters of the ADRs settle (a
//!   flight loaded in the air would otherwise see the three ADRs below the standby altitude for a moment).

use std::time::Duration;

use systems::{
    navigation::adirs::{AirDataInertialReferenceSystem, AirDataReferenceBus},
    shared::{arinc429::Arinc429Word, InternationalStandardAtmosphere},
    simulation::{
        InitContext, Read, SimulationElement, SimulatorReader, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use uom::si::{angle::degree, f64::*, length::foot, pressure::hectopascal, velocity::knot};

/// The result of the comparison of one parameter between the available sources
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AirDataVote {
    /// All available sources agree, or the disagreement is not yet clear
    NoConflict,
    /// This source disagrees with all the others, which agree among themselves
    Outlier(usize),
    /// The sources disagree, without a coherent majority: two sources, or two pairs, or all isolated
    Ambiguous,
}

/// Compares one parameter of the available sources (`None` = not available: not valid, or already rejected).
pub(crate) fn vote(values: &[Option<f64>], threshold: f64) -> AirDataVote {
    let available: Vec<(usize, f64)> = values
        .iter()
        .enumerate()
        .filter_map(|(index, value)| value.map(|v| (index, v)))
        .collect();
    let disagree = |a: f64, b: f64| (a - b).abs() > threshold;

    let any_disagreement = available
        .iter()
        .enumerate()
        .any(|(i, &(_, a))| available.iter().skip(i + 1).any(|&(_, b)| disagree(a, b)));
    if available.len() < 2 || !any_disagreement {
        return AirDataVote::NoConflict;
    }
    if available.len() == 2 {
        // Two sources already invalid and a conflict between the two remaining ones
        return AirDataVote::Ambiguous;
    }

    // A source that disagrees with every other available source
    let isolated: Vec<usize> = available
        .iter()
        .filter(|&&(index, value)| {
            available
                .iter()
                .filter(|&&(other, _)| other != index)
                .all(|&(_, other_value)| disagree(value, other_value))
        })
        .map(|&(index, _)| index)
        .collect();

    match isolated.len() {
        1 => {
            let outlier = isolated[0];
            let others: Vec<f64> = available
                .iter()
                .filter(|&&(index, _)| index != outlier)
                .map(|&(_, value)| value)
                .collect();
            let others_coherent = others
                .iter()
                .enumerate()
                .all(|(i, &a)| others.iter().skip(i + 1).all(|&b| !disagree(a, b)));
            if others_coherent {
                AirDataVote::Outlier(outlier)
            } else {
                AirDataVote::NoConflict
            }
        }
        0 => {
            // Two sources in conflict with two other sources: two coherent pairs that disagree
            if available.len() == 4 {
                let (a, b, c, d) = (
                    available[0].1,
                    available[1].1,
                    available[2].1,
                    available[3].1,
                );
                let split = |p: (f64, f64), q: (f64, f64)| {
                    !disagree(p.0, p.1)
                        && !disagree(q.0, q.1)
                        && disagree(p.0, q.0)
                        && disagree(p.0, q.1)
                        && disagree(p.1, q.0)
                        && disagree(p.1, q.1)
                };
                if split((a, b), (c, d)) || split((a, c), (b, d)) || split((a, d), (b, c)) {
                    return AirDataVote::Ambiguous;
                }
            }
            AirDataVote::NoConflict
        }
        _ => AirDataVote::Ambiguous,
    }
}

/// A latch set when its condition stays true for the confirmation time
#[derive(Default)]
struct ConfirmedLatch {
    duration: Duration,
    latched: bool,
}
impl ConfirmedLatch {
    fn update(&mut self, delta: Duration, condition: bool) {
        if condition {
            self.duration += delta;
            if self.duration >= A380PrimAirDataMonitoring::CONFIRMATION_TIME {
                self.latched = true;
            }
        } else {
            self.duration = Duration::ZERO;
        }
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

/// The source index of the standby instruments (ISIS) after ADR 1, 2 and 3
const STBY: usize = 3;

pub struct A380PrimAirDataMonitoring {
    prim_healthy_ids: [VariableIdentifier; 3],
    adr_rejected_ids: [VariableIdentifier; 3],
    stby_rejected_id: VariableIdentifier,
    all_rejected_id: VariableIdentifier,
    aoa_rejected_ids: [VariableIdentifier; 3],

    prims_healthy: [bool; 3],
    /// ADR 1, ADR 2, ADR 3, standby instruments
    source_rejected: [ConfirmedLatch; 4],
    all_rejected: ConfirmedLatch,
    aoa_rejected: [ConfirmedLatch; 3],
    time_since_start: Duration,
}
impl A380PrimAirDataMonitoring {
    const CONFIRMATION_TIME: Duration = Duration::from_secs(1);
    const SETTLING_TIME: Duration = Duration::from_secs(5);

    /// Low AOA / sideslip values
    const CAS_THRESHOLD_KNOTS: f64 = 16.;
    const MACH_THRESHOLD: f64 = 0.04;
    const ALTITUDE_THRESHOLD_FEET: f64 = 400.;
    /// Low sideslip, and on ground during the takeoff roll
    const AOA_THRESHOLD_IN_FLIGHT_DEGREES: f64 = 3.6;
    const AOA_THRESHOLD_ON_GROUND_DEGREES: f64 = 8.;

    /// Below this CAS on the ground the flight is over: the latched rejections are reset
    const END_OF_FLIGHT_CAS_KNOTS: f64 = 30.;
    /// The standby instruments, like the ADRs, give no CAS below 30 kt and no Mach below .1
    const MINIMUM_CAS_KNOTS: f64 = 30.;
    const MINIMUM_MACH: f64 = 0.1;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            prim_healthy_ids: [1, 2, 3]
                .map(|n| context.get_identifier(format!("PRIM_{}_HEALTHY", n))),
            adr_rejected_ids: [1, 2, 3]
                .map(|n| context.get_identifier(format!("PRIM_ADR_{}_REJECTED", n))),
            stby_rejected_id: context.get_identifier("PRIM_STBY_AIR_DATA_REJECTED".to_owned()),
            all_rejected_id: context.get_identifier("PRIM_ALL_AIR_DATA_REJECTED".to_owned()),
            aoa_rejected_ids: [1, 2, 3]
                .map(|n| context.get_identifier(format!("PRIM_AOA_{}_REJECTED", n))),

            prims_healthy: [false; 3],
            source_rejected: Default::default(),
            all_rejected: Default::default(),
            aoa_rejected: Default::default(),
            time_since_start: Duration::ZERO,
        }
    }

    pub fn update(&mut self, context: &UpdateContext, adirs: &AirDataInertialReferenceSystem) {
        if self.time_since_start < Self::SETTLING_TIME {
            self.time_since_start += context.delta();
            return;
        }
        if context.is_on_ground()
            && context.indicated_airspeed() < Velocity::new::<knot>(Self::END_OF_FLIGHT_CAS_KNOTS)
        {
            self.reset();
            return;
        }
        // Without a PRIM there is no monitoring: the latches keep their state for when a PRIM comes back
        if !self.any_prim_healthy() {
            return;
        }

        self.update_air_data(context, adirs);
        self.update_angle_of_attack(context, adirs);
    }

    fn reset(&mut self) {
        self.source_rejected
            .iter_mut()
            .for_each(ConfirmedLatch::reset);
        self.all_rejected.reset();
        self.aoa_rejected.iter_mut().for_each(ConfirmedLatch::reset);
    }

    fn any_prim_healthy(&self) -> bool {
        self.prims_healthy.iter().any(|&healthy| healthy)
    }

    fn normal_value<T: Copy + Default>(word: Arinc429Word<T>) -> Option<T> {
        word.normal_value()
    }

    fn update_air_data(&mut self, context: &UpdateContext, adirs: &AirDataInertialReferenceSystem) {
        let all_rejected = self.all_rejected.latched;
        let available = |index: usize, rejected: &[ConfirmedLatch; 4]| {
            !all_rejected && !rejected[index].latched
        };

        let mut cas: [Option<f64>; 4] = [None; 4];
        let mut mach: [Option<f64>; 4] = [None; 4];
        let mut altitude: [Option<f64>; 4] = [None; 4];
        for number in 1..=3 {
            let index = number - 1;
            if !available(index, &self.source_rejected) {
                continue;
            }
            let adr = adirs.adr_bus(number);
            cas[index] = Self::normal_value(adr.computed_airspeed()).map(|v| v.get::<knot>());
            mach[index] = Self::normal_value(adr.mach()).map(f64::from);
            altitude[index] = Self::normal_value(adr.standard_altitude()).map(|v| v.get::<foot>());
        }
        if available(STBY, &self.source_rejected) {
            let stby_cas = context.indicated_airspeed().get::<knot>();
            let stby_mach = f64::from(context.mach_number());
            cas[STBY] = (stby_cas >= Self::MINIMUM_CAS_KNOTS).then_some(stby_cas);
            mach[STBY] = (stby_mach >= Self::MINIMUM_MACH).then_some(stby_mach);
            altitude[STBY] = Some(Self::pressure_altitude_feet(context.ambient_pressure()));
        }

        let votes = [
            vote(&cas, Self::CAS_THRESHOLD_KNOTS),
            vote(&mach, Self::MACH_THRESHOLD),
            vote(&altitude, Self::ALTITUDE_THRESHOLD_FEET),
        ];

        let delta = context.delta();
        self.all_rejected
            .update(delta, votes.contains(&AirDataVote::Ambiguous));
        for (index, latch) in self.source_rejected.iter_mut().enumerate() {
            latch.update(delta, votes.contains(&AirDataVote::Outlier(index)));
        }
    }

    fn update_angle_of_attack(
        &mut self,
        context: &UpdateContext,
        adirs: &AirDataInertialReferenceSystem,
    ) {
        let mut aoa: [Option<f64>; 3] = [None; 3];
        for number in 1..=3 {
            let index = number - 1;
            // A source rejected for its CAS, Mach or altitude is rejected with all its parameters
            let adr_rejected = self.source_rejected[index].latched || self.all_rejected.latched;
            if adr_rejected || self.aoa_rejected[index].latched {
                continue;
            }
            aoa[index] = Self::normal_value(adirs.adr_bus(number).corrected_angle_of_attack())
                .map(|v| v.get::<degree>());
        }

        let threshold = if context.is_on_ground() {
            Self::AOA_THRESHOLD_ON_GROUND_DEGREES
        } else {
            Self::AOA_THRESHOLD_IN_FLIGHT_DEGREES
        };
        let result = vote(&aoa, threshold);

        let delta = context.delta();
        for (index, latch) in self.aoa_rejected.iter_mut().enumerate() {
            let rejected_now = match result {
                AirDataVote::Outlier(outlier) => outlier == index,
                // No coherent majority: every AOA still in use is rejected
                AirDataVote::Ambiguous => aoa[index].is_some(),
                AirDataVote::NoConflict => false,
            };
            latch.update(delta, rejected_now);
        }
    }

    /// The pressure altitude of the standby instruments, with the ISA formula of the ADRs (troposphere and above)
    fn pressure_altitude_feet(static_pressure: Pressure) -> f64 {
        let pressure_hpa = static_pressure.get::<hectopascal>();
        if pressure_hpa >= 226.323 {
            145442.156
                * (1.
                    - (pressure_hpa
                        / InternationalStandardAtmosphere::ground_pressure().get::<hectopascal>())
                    .powf(0.190263))
        } else {
            148897.4 - 47907.18 * pressure_hpa.log10()
        }
    }

    fn adr_rejected(&self, index: usize) -> bool {
        self.any_prim_healthy()
            && (self.source_rejected[index].latched || self.all_rejected.latched)
    }
}
impl SimulationElement for A380PrimAirDataMonitoring {
    fn read(&mut self, reader: &mut SimulatorReader) {
        for (healthy, id) in self
            .prims_healthy
            .iter_mut()
            .zip(self.prim_healthy_ids.iter())
        {
            let value: f64 = reader.read(id);
            *healthy = value > 0.5;
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let monitoring = self.any_prim_healthy();
        for (index, id) in self.adr_rejected_ids.iter().enumerate() {
            writer.write(id, self.adr_rejected(index));
        }
        writer.write(
            &self.stby_rejected_id,
            monitoring && (self.source_rejected[STBY].latched || self.all_rejected.latched),
        );
        writer.write(
            &self.all_rejected_id,
            monitoring && self.all_rejected.latched,
        );
        for (index, id) in self.aoa_rejected_ids.iter().enumerate() {
            writer.write(id, monitoring && self.aoa_rejected[index].latched);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::navigation::A380AirDataInertialReferenceSystemBuilder;
    use systems::{
        failures::FailureType,
        navigation::adirs::AirDataInertialReferenceSystemOverheadPanel,
        shared::MachNumber,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, SimulationElementVisitor,
        },
    };

    #[test]
    fn vote_finds_the_source_that_disagrees_with_three_coherent_ones() {
        assert_eq!(
            vote(&[Some(210.), Some(250.), Some(251.), Some(249.)], 16.),
            AirDataVote::Outlier(0)
        );
    }

    #[test]
    fn vote_finds_the_source_that_disagrees_with_two_coherent_ones() {
        assert_eq!(
            vote(&[None, Some(250.), Some(210.), Some(249.)], 16.),
            AirDataVote::Outlier(2)
        );
    }

    #[test]
    fn vote_is_ambiguous_with_two_disagreeing_sources() {
        assert_eq!(
            vote(&[None, None, Some(210.), Some(250.)], 16.),
            AirDataVote::Ambiguous
        );
    }

    #[test]
    fn vote_is_ambiguous_with_two_pairs_in_conflict() {
        assert_eq!(
            vote(&[Some(210.), Some(210.), Some(250.), Some(250.)], 16.),
            AirDataVote::Ambiguous
        );
    }

    #[test]
    fn vote_finds_no_conflict_within_the_threshold() {
        assert_eq!(
            vote(&[Some(240.), Some(250.), Some(255.), Some(250.)], 16.),
            AirDataVote::NoConflict
        );
    }

    struct TestAircraft {
        adirs: AirDataInertialReferenceSystem,
        overhead: AirDataInertialReferenceSystemOverheadPanel,
        monitoring: A380PrimAirDataMonitoring,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                adirs: A380AirDataInertialReferenceSystemBuilder::build(context),
                overhead: AirDataInertialReferenceSystemOverheadPanel::new(context),
                monitoring: A380PrimAirDataMonitoring::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.adirs.update(context, &self.overhead);
            self.overhead.update(context, &self.adirs);
            self.monitoring.update(context, &self.adirs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.adirs.accept(visitor);
            self.overhead.accept(visitor);
            self.monitoring.accept(visitor);
            visitor.visit(self);
        }
    }

    struct MonitoringTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl MonitoringTestBed {
        /// In cruise at FL 350 (standard pressure 238.4 hPa), 280 kt, M .82, AOA 2.5 deg, PRIMs healthy
        fn in_cruise() -> Self {
            let mut bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            for number in 1..=3 {
                bed.write_by_name(&format!("OVHD_ADIRS_IR_{}_MODE_SELECTOR_KNOB", number), 1.);
                bed.write_by_name(&format!("PRIM_{}_HEALTHY", number), true);
            }
            bed.set_on_ground(false);
            bed.set_indicated_airspeed(Velocity::new::<knot>(280.));
            bed.set_ambient_pressure(Pressure::new::<hectopascal>(238.4));
            bed.write_by_name("AIRSPEED MACH", MachNumber(0.82));
            bed.write_by_name("INCIDENCE ALPHA", Angle::new::<degree>(2.5));
            // Past the start-up settling time
            bed.run_for(6);
            bed
        }

        fn run_for(&mut self, seconds: u64) {
            for _ in 0..(seconds * 10) {
                self.run_with_delta(Duration::from_millis(100));
            }
        }

        fn adr_rejected(&mut self, number: usize) -> bool {
            self.read_by_name(&format!("PRIM_ADR_{}_REJECTED", number))
        }

        fn stby_rejected(&mut self) -> bool {
            self.read_by_name("PRIM_STBY_AIR_DATA_REJECTED")
        }

        fn all_rejected(&mut self) -> bool {
            self.read_by_name("PRIM_ALL_AIR_DATA_REJECTED")
        }

        fn aoa_rejected(&mut self, number: usize) -> bool {
            self.read_by_name(&format!("PRIM_AOA_{}_REJECTED", number))
        }

        fn rejections(&mut self) -> [bool; 5] {
            [
                self.adr_rejected(1),
                self.adr_rejected(2),
                self.adr_rejected(3),
                self.stby_rejected(),
                self.all_rejected(),
            ]
        }
    }
    impl TestBed for MonitoringTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    #[test]
    fn nothing_is_rejected_in_normal_flight() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.run_for(5);

        assert_eq!(bed.rejections(), [false; 5]);
        assert!(!bed.aoa_rejected(1) && !bed.aoa_rejected(2) && !bed.aoa_rejected(3));
    }

    #[test]
    fn one_erroneous_airspeed_rejects_that_adr_after_the_confirmation_time() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.run_for(1);
        bed.fail(FailureType::AdrAirspeedErroneous(2));
        bed.run_with_delta(Duration::from_millis(500));
        assert!(!bed.adr_rejected(2), "not before the confirmation time");

        bed.run_for(2);
        assert_eq!(bed.rejections(), [false, true, false, false, false]);
    }

    #[test]
    fn the_rejection_stays_until_the_end_of_the_flight() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.fail(FailureType::AdrAirspeedErroneous(1));
        bed.run_for(2);
        bed.unfail(FailureType::AdrAirspeedErroneous(1));
        bed.run_for(2);
        assert!(bed.adr_rejected(1), "latched in flight");

        bed.set_on_ground(true);
        bed.set_indicated_airspeed(Velocity::new::<knot>(20.));
        bed.run_for(1);
        assert!(!bed.adr_rejected(1), "reset at the end of the flight");
    }

    #[test]
    fn two_adrs_failed_in_sequence_are_both_rejected() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.fail(FailureType::AdrAirspeedErroneous(1));
        bed.run_for(2);
        bed.fail(FailureType::AdrAirspeedErroneous(2));
        bed.run_for(2);

        assert_eq!(bed.rejections(), [true, true, false, false, false]);
    }

    #[test]
    fn a_conflict_between_the_two_remaining_sources_rejects_all_air_data() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.fail(FailureType::AdrAirspeedErroneous(1));
        bed.run_for(2);
        bed.fail(FailureType::AdrAirspeedErroneous(2));
        bed.run_for(2);
        bed.fail(FailureType::AdrAirspeedErroneous(3));
        bed.run_for(2);

        assert_eq!(bed.rejections(), [true, true, true, true, true]);
    }

    #[test]
    fn two_adrs_failed_together_conflict_with_the_two_others() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.fail(FailureType::AdrAirspeedErroneous(1));
        bed.fail(FailureType::AdrAirspeedErroneous(3));
        bed.run_for(2);

        assert!(bed.all_rejected());
    }

    #[test]
    fn no_monitoring_without_a_prim() {
        let mut bed = MonitoringTestBed::in_cruise();
        for number in 1..=3 {
            bed.write_by_name(&format!("PRIM_{}_HEALTHY", number), false);
        }
        bed.fail(FailureType::AdrAirspeedErroneous(1));
        bed.run_for(2);

        assert_eq!(bed.rejections(), [false; 5]);
    }

    #[test]
    fn one_erroneous_angle_of_attack_rejects_only_that_angle_of_attack() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.fail(FailureType::AdrAngleOfAttackErroneous(3));
        bed.run_for(2);

        assert!(!bed.aoa_rejected(1) && !bed.aoa_rejected(2) && bed.aoa_rejected(3));
        assert_eq!(
            bed.rejections(),
            [false; 5],
            "the other ADR parameters stay in use"
        );
    }

    #[test]
    fn a_second_erroneous_angle_of_attack_rejects_the_two_remaining_ones() {
        let mut bed = MonitoringTestBed::in_cruise();
        bed.fail(FailureType::AdrAngleOfAttackErroneous(1));
        bed.run_for(2);
        bed.fail(FailureType::AdrAngleOfAttackErroneous(2));
        bed.run_for(2);

        assert!(bed.aoa_rejected(1) && bed.aoa_rejected(2) && bed.aoa_rejected(3));
    }
}
