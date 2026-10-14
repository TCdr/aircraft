use crate::{
    failures::{Failure, FailureType},
    shared::arinc429::{Arinc429Word, SignStatus},
    simulation::{Read, SimulationElement, SimulationElementVisitor, VariableIdentifier, Write},
};
use uom::si::{
    angle::degree,
    f64::{Angle, Frequency, Ratio},
};

pub trait InstrumentLandingSystemBus {
    /// Label 017
    fn runway_heading(&self) -> Arinc429Word<Angle>;
    /// Label 033
    fn ils_frequency(&self) -> Arinc429Word<Frequency>;
    /// Label 173, in DDM (difference in depth of modulation).
    /// 0.155DDM is full scale deflection (two dots) => one dot = 0.0775DDM
    /// One dot = 0.8° on the localizer scale according to FCOM, but the exact conversion depends on runway length.
    fn localizer_deviation(&self) -> Arinc429Word<Ratio>;
    /// Label 174, in DDM (difference in depth of modulation).
    /// 0.175DDM is full scale deflection (two dots) => one dot = 0.0875DDM
    /// One dot = 0.4° on the glideslope scale according to FCOM
    fn glideslope_deviation(&self) -> Arinc429Word<Ratio>;
    /// Label 263
    fn ground_station_ident_1(&self) -> Arinc429Word<u32>;
    /// Label 264
    fn ground_station_ident_2(&self) -> Arinc429Word<u32>;
}

/// This represents an interface to the ILS receiver of one MMR, which is implemented outside of the
/// rust systems. Currently, this implementation is done by MSFS.
///
/// The aircraft has two ILS receivers, ILS 1 in MMR 1 and ILS 2 in MMR 2: PFD 1 shows ILS 1 and
/// PFD 2 shows ILS 2 (A320 FCOM DSC-34-NAV-30-20, a320_fcom.txt l.53282-53289; A380 FCOM
/// DSC-34-10-20, a380_fcom.txt l.86580-86591). In the sim, MMR 1 is NAV 3 and MMR 2 is NAV 4
/// (systems.cfg [RADIOS]). Each shim writes the data of its own NAV radio to MMR_n_* variables,
/// read by the PFD of its side.
pub struct MultiModeReceiverShim {
    frequency: Frequency,
    nav_valid: bool,
    loc_valid: bool,
    localizer_course: Angle,
    localizer_deviation: Angle,
    glideslope_valid: bool,
    glideslope_deviation: Angle,
    /// The ILS receiver of this MMR fails: no localiser and glideslope. A320 FCOM PRO-ABN-NAV NAV ILS 1(2)(1+2)
    /// FAULT (a320_fcom.txt l.93273). The receiver of MMR 1 is also switched off in the sim by the systems host
    /// (NavigationReceiverFailures), as the FBW module reads NAV 3 directly.
    failure: Failure,

    frequency_id: VariableIdentifier,
    nav_valid_id: VariableIdentifier,
    loc_valid_id: VariableIdentifier,
    localizer_course_id: VariableIdentifier,
    localizer_deviation_id: VariableIdentifier,
    glideslope_valid_id: VariableIdentifier,
    glideslope_deviation_id: VariableIdentifier,

    localizer_valid_output_id: VariableIdentifier,
    localizer_deviation_output_id: VariableIdentifier,
    glideslope_valid_output_id: VariableIdentifier,
    glideslope_deviation_output_id: VariableIdentifier,
}
impl MultiModeReceiverShim {
    /// The sim NAV radio of MMR 1, MMR 2 has the next one.
    const MMR_1_SIM_NAV_INDEX: usize = 3;

    /// The ILS receiver of MMR `number` (1 or 2).
    pub fn new(context: &mut crate::simulation::InitContext, number: usize) -> Self {
        let nav_index = Self::sim_nav_index(number);

        Self {
            frequency: Frequency::default(),
            nav_valid: false,
            loc_valid: false,
            localizer_course: Angle::default(),
            localizer_deviation: Angle::default(),
            glideslope_valid: false,
            glideslope_deviation: Angle::default(),
            failure: Failure::new(FailureType::IlsReceiver(number)),

            frequency_id: context.get_identifier(format!("NAV FREQUENCY:{nav_index}")),
            nav_valid_id: context.get_identifier(format!("NAV HAS NAV:{nav_index}")),
            // the documented sim variable name, also read by the FBW module (fbw.wasm) for
            // A32NX_RADIO_RECEIVER_LOC_IS_VALID
            loc_valid_id: context.get_identifier(format!("NAV HAS LOCALIZER:{nav_index}")),
            localizer_course_id: context.get_identifier("FM_LS_COURSE".to_owned()),
            localizer_deviation_id: context.get_identifier(format!("NAV RADIAL ERROR:{nav_index}")),
            glideslope_valid_id: context.get_identifier(format!("NAV HAS GLIDE SLOPE:{nav_index}")),
            glideslope_deviation_id: context
                .get_identifier(format!("NAV GLIDE SLOPE ERROR:{nav_index}")),

            localizer_valid_output_id: context.get_identifier(format!("MMR_{number}_LOC_IS_VALID")),
            localizer_deviation_output_id: context
                .get_identifier(format!("MMR_{number}_LOC_DEVIATION")),
            glideslope_valid_output_id: context.get_identifier(format!("MMR_{number}_GS_IS_VALID")),
            glideslope_deviation_output_id: context
                .get_identifier(format!("MMR_{number}_GS_DEVIATION")),
        }
    }

    /// The sim NAV radio index of MMR `number`: NAV 3 for MMR 1, NAV 4 for MMR 2.
    fn sim_nav_index(number: usize) -> usize {
        assert!(
            (1..=2).contains(&number),
            "There are two MMRs, numbered 1 and 2"
        );
        Self::MMR_1_SIM_NAV_INDEX + number - 1
    }
}
impl MultiModeReceiverShim {
    /// Corrects an MSFS localiser radial error to give the correct deviations on the back beam.
    fn get_corrected_localizer_deviation(&self) -> Angle {
        let normalized_error = Self::normalize_180(self.localizer_deviation);

        if normalized_error < Angle::new::<degree>(-90.0) {
            Angle::new::<degree>(-180.0) - normalized_error
        } else if normalized_error > Angle::new::<degree>(90.0) {
            Angle::new::<degree>(180.0) - normalized_error
        } else {
            normalized_error
        }
    }

    /// Normalises an angle into the range [-180; 180).
    fn normalize_180(angle: Angle) -> Angle {
        let normalized_360 = Self::normalize_360(angle);

        if normalized_360 >= Angle::new::<degree>(180.0) {
            normalized_360 - Angle::new::<degree>(360.0)
        } else {
            normalized_360
        }
    }

    /// Normalises an angle into the range [0; 360).
    fn normalize_360(angle: Angle) -> Angle {
        let angle = angle % Angle::new::<degree>(360.0);

        (angle + Angle::new::<degree>(360.0)) % Angle::new::<degree>(360.0)
    }
}
impl InstrumentLandingSystemBus for MultiModeReceiverShim {
    fn runway_heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(
            self.localizer_course,
            if self.loc_valid {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            },
        )
    }
    fn ils_frequency(&self) -> Arinc429Word<Frequency> {
        Arinc429Word::new(
            self.frequency,
            if self.nav_valid {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            },
        )
    }
    fn localizer_deviation(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.get_corrected_localizer_deviation() / Angle::new::<degree>(0.8) * 0.0775,
            if self.loc_valid {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            },
        )
    }
    fn glideslope_deviation(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.glideslope_deviation / Angle::new::<degree>(0.4) * 0.0875,
            if self.glideslope_valid {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            },
        )
    }
    fn ground_station_ident_1(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0, SignStatus::NoComputedData) // Placeholder implementation
    }
    fn ground_station_ident_2(&self) -> Arinc429Word<u32> {
        Arinc429Word::new(0, SignStatus::NoComputedData) // Placeholder implementation
    }
}
impl SimulationElement for MultiModeReceiverShim {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut crate::simulation::SimulatorReader) {
        // A failed receiver receives nothing
        let receives = !self.failure.is_active();
        self.frequency = reader.read(&self.frequency_id);
        let nav_valid: bool = reader.read(&self.nav_valid_id);
        let loc_valid: bool = reader.read(&self.loc_valid_id);
        let glideslope_valid: bool = reader.read(&self.glideslope_valid_id);
        self.nav_valid = nav_valid && receives;
        self.loc_valid = loc_valid && receives;
        self.localizer_course = reader.read(&self.localizer_course_id);
        self.localizer_deviation = reader.read(&self.localizer_deviation_id);
        self.glideslope_valid = glideslope_valid && receives;
        self.glideslope_deviation = reader.read(&self.glideslope_deviation_id);
    }

    fn write(&self, writer: &mut crate::simulation::SimulatorWriter) {
        // Same contract as the A32NX_RADIO_RECEIVER_* variables of the FBW module with the sim
        // signals: valid flags, raw sim deviations in degrees (the localiser error is not corrected
        // for the back beam, the PFD does that).
        writer.write(&self.localizer_valid_output_id, self.loc_valid);
        writer.write(
            &self.localizer_deviation_output_id,
            self.localizer_deviation,
        );
        writer.write(&self.glideslope_valid_output_id, self.glideslope_valid);
        writer.write(
            &self.glideslope_deviation_output_id,
            self.glideslope_deviation,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::test::{ReadByName, SimulationTestBed, TestBed, WriteByName};
    use crate::simulation::{Aircraft, InitContext, SimulationElementVisitor};
    use uom::si::ratio::ratio;

    struct TestAircraft {
        mmr_1: MultiModeReceiverShim,
        mmr_2: MultiModeReceiverShim,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                mmr_1: MultiModeReceiverShim::new(context, 1),
                mmr_2: MultiModeReceiverShim::new(context, 2),
            }
        }
    }
    impl Aircraft for TestAircraft {}
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.mmr_1.accept(visitor);
            self.mmr_2.accept(visitor);
            visitor.visit(self);
        }
    }

    /// NAV 3 (MMR 1) and NAV 4 (MMR 2) tuned to one ILS, each receiver with its own signal
    fn test_bed_with_both_receivers_on_an_ils() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        for (nav_index, localizer_error, glideslope_error) in [(3, 0.4, -0.2), (4, -0.6, 0.3)] {
            test_bed.write_by_name(&format!("NAV FREQUENCY:{nav_index}"), 109_500_000.);
            test_bed.write_by_name(&format!("NAV HAS NAV:{nav_index}"), true);
            test_bed.write_by_name(&format!("NAV HAS LOCALIZER:{nav_index}"), true);
            test_bed.write_by_name(&format!("NAV RADIAL ERROR:{nav_index}"), localizer_error);
            test_bed.write_by_name(&format!("NAV HAS GLIDE SLOPE:{nav_index}"), true);
            test_bed.write_by_name(
                &format!("NAV GLIDE SLOPE ERROR:{nav_index}"),
                glideslope_error,
            );
        }
        test_bed.run();
        test_bed
    }

    fn read_number(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> f64 {
        test_bed.read_by_name(name)
    }

    fn read_flag(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    #[test]
    fn mmr_1_reads_nav_3_and_mmr_2_reads_nav_4() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();

        assert!((read_number(&mut test_bed, "MMR_1_LOC_DEVIATION") - 0.4).abs() < 1e-9);
        assert!((read_number(&mut test_bed, "MMR_1_GS_DEVIATION") + 0.2).abs() < 1e-9);
        assert!((read_number(&mut test_bed, "MMR_2_LOC_DEVIATION") + 0.6).abs() < 1e-9);
        assert!((read_number(&mut test_bed, "MMR_2_GS_DEVIATION") - 0.3).abs() < 1e-9);
    }

    #[test]
    fn a_signal_lost_on_mmr_2_leaves_mmr_1_valid() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.write_by_name("NAV HAS LOCALIZER:4", false);
        test_bed.write_by_name("NAV HAS GLIDE SLOPE:4", false);
        test_bed.run();

        assert!(read_flag(&mut test_bed, "MMR_1_LOC_IS_VALID"));
        assert!(read_flag(&mut test_bed, "MMR_1_GS_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));

        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_normal_operation()));
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_2.glideslope_deviation().is_no_computed_data()));
    }

    #[test]
    fn the_ils_bus_of_each_mmr_carries_its_own_deviation() {
        let test_bed = test_bed_with_both_receivers_on_an_ils();

        // one dot of localiser deviation: 0.8 degree = 0.0775 DDM
        let mmr_1_localizer =
            test_bed.query(|a| a.mmr_1.localizer_deviation().value().get::<ratio>());
        let mmr_2_localizer =
            test_bed.query(|a| a.mmr_2.localizer_deviation().value().get::<ratio>());
        assert!((mmr_1_localizer - 0.4 / 0.8 * 0.0775).abs() < 1e-9);
        assert!((mmr_2_localizer + 0.6 / 0.8 * 0.0775).abs() < 1e-9);
    }

    #[test]
    fn a_failed_ils_receiver_gives_no_localiser_and_glideslope() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.fail(FailureType::IlsReceiver(2));
        test_bed.run();
        test_bed.run();

        assert!(!read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_2.glideslope_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_2.ils_frequency().is_no_computed_data()));
        // The other receiver still works
        assert!(read_flag(&mut test_bed, "MMR_1_LOC_IS_VALID"));
        assert!(read_flag(&mut test_bed, "MMR_1_GS_IS_VALID"));

        test_bed.unfail(FailureType::IlsReceiver(2));
        test_bed.run();
        test_bed.run();
        assert!(read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));
    }

    struct SingleMmrAircraft {
        mmr: MultiModeReceiverShim,
    }
    impl Aircraft for SingleMmrAircraft {}
    impl SimulationElement for SingleMmrAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.mmr.accept(visitor);
            visitor.visit(self);
        }
    }

    #[test]
    #[should_panic(expected = "There are two MMRs")]
    fn there_is_no_third_mmr() {
        SimulationTestBed::new(|context| SingleMmrAircraft {
            mmr: MultiModeReceiverShim::new(context, 3),
        });
    }
}
