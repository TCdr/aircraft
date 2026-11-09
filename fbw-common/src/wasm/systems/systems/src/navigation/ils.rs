use crate::{
    failures::{Failure, FailureType},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        ConsumePower, ElectricalBusType, ElectricalBuses,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        UpdateContext, VariableIdentifier, Write,
    },
};
use uom::si::{
    angle::degree,
    f64::{Angle, Frequency, Power, Ratio},
    power::watt,
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
/// PFD 2 shows ILS 2 (both aircraft). In the sim, MMR 1 is NAV 3 and MMR 2 is NAV 4
/// (systems.cfg [RADIOS]). Each shim writes the data of its own NAV radio to MMR_n_* variables,
/// read by the PFD of its side.
///
/// An unpowered MMR is a dead box: it receives nothing, and its bus words carry failure warning
/// where a receiver without a signal sends no computed data. The flight guidance flies the bus of
/// the other MMR only for failure warning.
///
/// The ILS bus (`InstrumentLandingSystemBus`) carries the active mode of the MMR: the GLS while the MMR is set to a GLS
/// channel, else the ILS. The MMR_n_* variables stay the ILS receiver, as the A32NX_RADIO_RECEIVER_* variables
/// they mirror, because the PFD has its own GLS topics and would otherwise show the GLS twice.
pub struct MultiModeReceiverShim {
    powered_by: ElectricalBusType,
    is_powered: bool,
    frequency: Frequency,
    nav_valid: bool,
    loc_valid: bool,
    localizer_course: Angle,
    localizer_deviation: Angle,
    glideslope_valid: bool,
    glideslope_deviation: Angle,
    /// The ILS receiver of this MMR fails: no localiser and glideslope (NAV ILS 1(2)(1+2) FAULT). The receiver of
    /// MMR 1 is also switched off in the sim by the systems host
    /// (NavigationReceiverFailures), as the FBW module reads NAV 3 directly.
    failure: Failure,
    /// The whole MMR fails, its ILS receiver with it (NAV LS 1(2)(1+2) FAULT on the A380)
    mmr_failure: Failure,
    gls: GlsSignals,

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
    is_powered_output_id: VariableIdentifier,
}
impl MultiModeReceiverShim {
    /// The sim NAV radio of MMR 1, MMR 2 has the next one.
    const MMR_1_SIM_NAV_INDEX: usize = 3;

    /// The MMR draws as much as the GPS receiver inside the same box
    const POWER_CONSUMPTION_WATT: f64 = 15.;

    /// The ILS receiver of MMR `number` (1 or 2), powered by `powered_by`.
    pub fn new(
        context: &mut crate::simulation::InitContext,
        number: usize,
        powered_by: ElectricalBusType,
    ) -> Self {
        let nav_index = Self::sim_nav_index(number);

        Self {
            powered_by,
            is_powered: false,
            frequency: Frequency::default(),
            nav_valid: false,
            loc_valid: false,
            localizer_course: Angle::default(),
            localizer_deviation: Angle::default(),
            glideslope_valid: false,
            glideslope_deviation: Angle::default(),
            failure: Failure::new(FailureType::IlsReceiver(number)),
            mmr_failure: Failure::new(FailureType::MultiModeReceiver(number)),
            gls: GlsSignals::new(context, number),

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
            is_powered_output_id: context.get_identifier(format!("MMR_{number}_IS_POWERED")),
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
    /// The box works: it has power and neither the ILS receiver nor the whole MMR is failed
    fn is_working(&self) -> bool {
        self.is_powered && !self.failure.is_active() && !self.mmr_failure.is_active()
    }

    /// Failure warning when the box is dead, no computed data when it only has no signal
    fn invalid_status(&self) -> SignStatus {
        if self.active_mode(self.is_working(), self.gls_is_operative()) {
            SignStatus::NoComputedData
        } else {
            SignStatus::FailureWarning
        }
    }

    // The flags are read before the power of the frame is known, so a box that just lost its power
    // must not send what it received a frame ago.
    fn localizer_is_valid(&self) -> bool {
        self.loc_valid && self.is_working()
    }
    fn glideslope_is_valid(&self) -> bool {
        self.glideslope_valid && self.is_working()
    }
    fn frequency_is_valid(&self) -> bool {
        self.nav_valid && self.is_working()
    }

    /// Corrects an MSFS localiser radial error to give the correct deviations on the back beam.
    fn get_corrected_localizer_deviation(&self) -> Angle {
        let normalized_error = Self::normalize_180(self.bus_localizer_error());

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
impl MultiModeReceiverShim {
    /// The MMR is set to a GLS channel, so its bus carries the GLS instead of the ILS
    fn in_gls_mode(&self) -> bool {
        self.gls.channel > 0.
    }

    /// The GLS is a function of the box, not of its ILS receiver: it needs power and no MMR failure
    fn gls_is_operative(&self) -> bool {
        self.is_powered && !self.mmr_failure.is_active()
    }

    fn active_mode<T>(&self, ils: T, gls: T) -> T {
        if self.in_gls_mode() {
            gls
        } else {
            ils
        }
    }

    fn bus_loc_valid(&self) -> bool {
        self.active_mode(
            self.localizer_is_valid(),
            self.gls.loc_valid && self.gls_is_operative(),
        )
    }

    fn bus_glideslope_valid(&self) -> bool {
        self.active_mode(
            self.glideslope_is_valid(),
            self.gls.glideslope_valid && self.gls_is_operative(),
        )
    }

    fn bus_localizer_error(&self) -> Angle {
        self.active_mode(self.localizer_deviation, self.gls.localizer_deviation)
    }

    fn bus_glideslope_error(&self) -> Angle {
        self.active_mode(self.glideslope_deviation, self.gls.glideslope_deviation)
    }
}
impl InstrumentLandingSystemBus for MultiModeReceiverShim {
    fn runway_heading(&self) -> Arinc429Word<Angle> {
        Arinc429Word::new(
            self.localizer_course,
            if self.bus_loc_valid() {
                SignStatus::NormalOperation
            } else {
                self.invalid_status()
            },
        )
    }
    fn ils_frequency(&self) -> Arinc429Word<Frequency> {
        Arinc429Word::new(
            self.frequency,
            if self.frequency_is_valid() {
                SignStatus::NormalOperation
            } else {
                self.invalid_status()
            },
        )
    }
    fn localizer_deviation(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.get_corrected_localizer_deviation() / Angle::new::<degree>(0.8) * 0.0775,
            if self.bus_loc_valid() {
                SignStatus::NormalOperation
            } else {
                self.invalid_status()
            },
        )
    }
    fn glideslope_deviation(&self) -> Arinc429Word<Ratio> {
        Arinc429Word::new(
            self.bus_glideslope_error() / Angle::new::<degree>(0.4) * 0.0875,
            if self.bus_glideslope_valid() {
                SignStatus::NormalOperation
            } else {
                self.invalid_status()
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
        self.mmr_failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        // A failed or unpowered receiver receives nothing
        let receives = self.is_working();
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
        self.gls.read(reader);
    }

    fn write(&self, writer: &mut crate::simulation::SimulatorWriter) {
        // Same contract as the A32NX_RADIO_RECEIVER_* variables of the FBW module with the sim
        // signals: valid flags, raw sim deviations in degrees (the localiser error is not corrected
        // for the back beam, the PFD does that).
        writer.write(&self.localizer_valid_output_id, self.localizer_is_valid());
        writer.write(
            &self.localizer_deviation_output_id,
            self.localizer_deviation,
        );
        writer.write(&self.glideslope_valid_output_id, self.glideslope_is_valid());
        writer.write(
            &self.glideslope_deviation_output_id,
            self.glideslope_deviation,
        );
        writer.write(&self.is_powered_output_id, self.is_powered);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }

    fn consume_power<T: ConsumePower>(&mut self, _: &UpdateContext, consumption: &mut T) {
        if self.is_powered {
            consumption.consume_from_bus(
                self.powered_by,
                Power::new::<watt>(Self::POWER_CONSUMPTION_WATT),
            );
        }
    }
}

/// The GLS data of one MMR, written by the FBW module (fbw.wasm) with the same sign and scale as the ILS receiver
/// variables. The deviations are shared by both MMRs, the valid flags are per MMR.
struct GlsSignals {
    /// The FMS writes a channel of 0 for ILS mode
    channel: f64,
    loc_valid: bool,
    glideslope_valid: bool,
    localizer_deviation: Angle,
    glideslope_deviation: Angle,

    channel_id: VariableIdentifier,
    loc_valid_id: VariableIdentifier,
    glideslope_valid_id: VariableIdentifier,
    localizer_deviation_id: VariableIdentifier,
    glideslope_deviation_id: VariableIdentifier,
}
impl GlsSignals {
    fn new(context: &mut InitContext, number: usize) -> Self {
        Self {
            channel: 0.,
            loc_valid: false,
            glideslope_valid: false,
            localizer_deviation: Angle::default(),
            glideslope_deviation: Angle::default(),

            channel_id: context.get_identifier(format!("MMR_{number}_GLS_CHANNEL")),
            loc_valid_id: context.get_identifier(format!("GLS_{number}_LOC_IS_VALID")),
            glideslope_valid_id: context.get_identifier(format!("GLS_{number}_GS_IS_VALID")),
            localizer_deviation_id: context.get_identifier("GLS_LOC_DEVIATION".to_owned()),
            glideslope_deviation_id: context.get_identifier("GLS_GS_DEVIATION".to_owned()),
        }
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.channel = reader.read(&self.channel_id);
        self.loc_valid = reader.read(&self.loc_valid_id);
        self.glideslope_valid = reader.read(&self.glideslope_valid_id);
        self.localizer_deviation = reader.read(&self.localizer_deviation_id);
        self.glideslope_deviation = reader.read(&self.glideslope_deviation_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::electrical::test::TestElectricitySource;
    use crate::electrical::{ElectricalBus, Electricity};
    use crate::shared::PotentialOrigin;
    use crate::simulation::test::{ReadByName, SimulationTestBed, TestBed, WriteByName};
    use crate::simulation::{Aircraft, InitContext, SimulationElementVisitor};
    use std::time::Duration;
    use uom::si::{electric_potential::volt, f64::ElectricPotential, ratio::ratio};

    struct TestAircraft {
        electricity_source: TestElectricitySource,
        ac_1_bus: ElectricalBus,
        ac_2_bus: ElectricalBus,
        is_ac_1_powered: bool,
        is_ac_2_powered: bool,
        mmr_1: MultiModeReceiverShim,
        mmr_2: MultiModeReceiverShim,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                electricity_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                ac_1_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                ac_2_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),
                is_ac_1_powered: true,
                is_ac_2_powered: true,
                mmr_1: MultiModeReceiverShim::new(
                    context,
                    1,
                    ElectricalBusType::AlternatingCurrent(1),
                ),
                mmr_2: MultiModeReceiverShim::new(
                    context,
                    2,
                    ElectricalBusType::AlternatingCurrent(2),
                ),
            }
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
            if self.is_ac_2_powered {
                electricity.flow(&self.electricity_source, &self.ac_2_bus);
            }
        }
    }
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
        // The first frame powers the receivers, the second one lets them receive
        test_bed.run();
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
    fn a_failed_ils_receiver_gives_failure_warning_on_all_words() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.fail(FailureType::IlsReceiver(2));
        test_bed.run();
        test_bed.run();

        assert!(!read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_2.glideslope_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_2.ils_frequency().is_failure_warning()));
        // The other receiver still works
        assert!(read_flag(&mut test_bed, "MMR_1_LOC_IS_VALID"));
        assert!(read_flag(&mut test_bed, "MMR_1_GS_IS_VALID"));

        test_bed.unfail(FailureType::IlsReceiver(2));
        test_bed.run();
        test_bed.run();
        assert!(read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));
    }

    #[test]
    fn a_failed_mmr_gives_no_localiser_and_glideslope() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.fail(FailureType::MultiModeReceiver(1));
        test_bed.run();
        test_bed.run();

        assert!(!read_flag(&mut test_bed, "MMR_1_LOC_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_1_GS_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_failure_warning()));
        assert!(read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));

        test_bed.unfail(FailureType::MultiModeReceiver(1));
        test_bed.run();
        test_bed.run();
        assert!(read_flag(&mut test_bed, "MMR_1_LOC_IS_VALID"));
    }

    /// MMR `number` set to a GLS channel and receiving the given GLS deviations (degrees)
    fn put_mmr_on_a_gls(
        test_bed: &mut SimulationTestBed<TestAircraft>,
        number: usize,
        localizer_deviation: f64,
        glideslope_deviation: f64,
    ) {
        test_bed.write_by_name(&format!("MMR_{number}_GLS_CHANNEL"), 40123.);
        test_bed.write_by_name(&format!("GLS_{number}_LOC_IS_VALID"), true);
        test_bed.write_by_name(&format!("GLS_{number}_GS_IS_VALID"), true);
        test_bed.write_by_name("GLS_LOC_DEVIATION", localizer_deviation);
        test_bed.write_by_name("GLS_GS_DEVIATION", glideslope_deviation);
        test_bed.run();
    }

    #[test]
    fn an_mmr_in_gls_mode_puts_the_gls_deviations_on_its_bus() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        // the FMS detunes NAV 3 in GLS mode
        test_bed.write_by_name("NAV HAS LOCALIZER:3", false);
        test_bed.write_by_name("NAV HAS GLIDE SLOPE:3", false);
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);

        let glideslope = test_bed.query(|a| a.mmr_1.glideslope_deviation());
        assert!(glideslope.is_normal_operation());
        assert!((glideslope.value().get::<ratio>() - (-0.6 / 0.4 * 0.0875)).abs() < 1e-9);
        let localizer = test_bed.query(|a| a.mmr_1.localizer_deviation());
        assert!(localizer.is_normal_operation());
        assert!((localizer.value().get::<ratio>() - (0.4 / 0.8 * 0.0775)).abs() < 1e-9);
    }

    #[test]
    fn an_mmr_in_gls_mode_ignores_its_ils_signal() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.write_by_name("MMR_1_GLS_CHANNEL", 40123.);
        test_bed.write_by_name("GLS_1_LOC_IS_VALID", false);
        test_bed.write_by_name("GLS_1_GS_IS_VALID", false);
        test_bed.run();

        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_1.runway_heading().is_no_computed_data()));
    }

    #[test]
    fn only_the_mmr_in_gls_mode_uses_the_gls() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);

        let mmr_2_glideslope = test_bed.query(|a| a.mmr_2.glideslope_deviation());
        assert!(mmr_2_glideslope.is_normal_operation());
        assert!((mmr_2_glideslope.value().get::<ratio>() - 0.3 / 0.4 * 0.0875).abs() < 1e-9);
    }

    #[test]
    fn a_failed_mmr_gives_no_gls() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);
        test_bed.fail(FailureType::MultiModeReceiver(1));
        test_bed.run();
        test_bed.run();

        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_failure_warning()));
    }

    #[test]
    fn an_unpowered_mmr_in_gls_mode_gives_no_gls_and_failure_warning() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.write_by_name("FM_LS_COURSE", 270.);
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);
        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_normal_operation()));

        test_bed.command(|a| a.is_ac_1_powered = false);
        test_bed.run();
        test_bed.run();
        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_1.runway_heading().is_failure_warning()));

        test_bed.command(|a| a.is_ac_1_powered = true);
        test_bed.run();
        test_bed.run();
        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_normal_operation()));
    }

    #[test]
    fn an_mmr_that_loses_its_power_in_gls_mode_sends_nothing_valid_in_the_same_frame() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);
        test_bed.run();

        test_bed.command(|a| a.is_ac_1_powered = false);
        test_bed.run_with_delta(Duration::from_millis(1));

        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_failure_warning()));
    }

    #[test]
    fn a_failed_ils_receiver_leaves_the_gls() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);
        test_bed.fail(FailureType::IlsReceiver(1));
        test_bed.run();
        test_bed.run();

        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_normal_operation()));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_normal_operation()));
    }

    #[test]
    fn the_runway_heading_follows_the_gls_localizer_validity() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.write_by_name("FM_LS_COURSE", 270.);
        put_mmr_on_a_gls(&mut test_bed, 1, 0.4, -0.6);
        assert!(test_bed.query(|a| a.mmr_1.runway_heading().is_normal_operation()));

        test_bed.write_by_name("GLS_1_LOC_IS_VALID", false);
        test_bed.run();
        assert!(test_bed.query(|a| a.mmr_1.runway_heading().is_no_computed_data()));
    }

    #[test]
    fn the_mmr_variables_stay_the_ils_receiver_in_gls_mode() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        put_mmr_on_a_gls(&mut test_bed, 1, 0.9, -0.6);

        assert!((read_number(&mut test_bed, "MMR_1_LOC_DEVIATION") - 0.4).abs() < 1e-9);
        assert!((read_number(&mut test_bed, "MMR_1_GS_DEVIATION") + 0.2).abs() < 1e-9);
        assert!(read_flag(&mut test_bed, "MMR_1_GS_IS_VALID"));
    }

    #[test]
    fn an_unpowered_mmr_is_a_dead_box() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.command(|a| a.is_ac_2_powered = false);
        test_bed.run();
        test_bed.run();

        assert!(!read_flag(&mut test_bed, "MMR_2_IS_POWERED"));
        assert!(!read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_2.runway_heading().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_2.ils_frequency().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_2.glideslope_deviation().is_failure_warning()));

        // The other MMR, on the other bus, is not affected
        assert!(read_flag(&mut test_bed, "MMR_1_IS_POWERED"));
        assert!(read_flag(&mut test_bed, "MMR_1_LOC_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_normal_operation()));

        test_bed.command(|a| a.is_ac_2_powered = true);
        test_bed.run();
        test_bed.run();
        assert!(read_flag(&mut test_bed, "MMR_2_IS_POWERED"));
        assert!(read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_normal_operation()));
    }

    #[test]
    fn a_powered_mmr_without_signal_sends_no_computed_data() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.write_by_name("NAV HAS LOCALIZER:3", false);
        test_bed.write_by_name("NAV HAS GLIDE SLOPE:3", false);
        test_bed.run();
        test_bed.run();

        assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_1.glideslope_deviation().is_no_computed_data()));
        assert!(test_bed.query(|a| a.mmr_1.runway_heading().is_no_computed_data()));
        // The other MMR still receives its signal
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_normal_operation()));
    }

    #[test]
    fn a_failed_mmr_sends_failure_warning_so_that_the_flight_guidance_flies_the_other_one() {
        for failure in [
            FailureType::MultiModeReceiver(2),
            FailureType::IlsReceiver(2),
        ] {
            let mut test_bed = test_bed_with_both_receivers_on_an_ils();
            test_bed.fail(failure);
            test_bed.run();
            test_bed.run();

            assert!(read_flag(&mut test_bed, "MMR_2_IS_POWERED"));
            assert!(!read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
            assert!(test_bed.query(|a| a.mmr_2.runway_heading().is_failure_warning()));
            assert!(test_bed.query(|a| a.mmr_2.ils_frequency().is_failure_warning()));
            assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_failure_warning()));
            assert!(test_bed.query(|a| a.mmr_2.glideslope_deviation().is_failure_warning()));
            assert!(test_bed.query(|a| a.mmr_1.localizer_deviation().is_normal_operation()));
        }
    }

    #[test]
    fn a_box_that_loses_its_power_sends_nothing_valid_in_the_same_frame() {
        let mut test_bed = test_bed_with_both_receivers_on_an_ils();
        test_bed.run();
        test_bed.run();
        assert!(read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));

        test_bed.command(|a| a.is_ac_2_powered = false);
        test_bed.run_with_delta(Duration::from_millis(1));

        assert!(!read_flag(&mut test_bed, "MMR_2_LOC_IS_VALID"));
        assert!(!read_flag(&mut test_bed, "MMR_2_GS_IS_VALID"));
        assert!(test_bed.query(|a| a.mmr_2.localizer_deviation().is_failure_warning()));
        assert!(test_bed.query(|a| a.mmr_2.glideslope_deviation().is_failure_warning()));
    }

    #[test]
    fn two_powered_healthy_mmrs_send_the_words_they_always_did() {
        let test_bed = test_bed_with_both_receivers_on_an_ils();

        for ils in [
            test_bed.query(|a| {
                (
                    a.mmr_1.runway_heading(),
                    a.mmr_1.ils_frequency(),
                    a.mmr_1.localizer_deviation(),
                    a.mmr_1.glideslope_deviation(),
                )
            }),
            test_bed.query(|a| {
                (
                    a.mmr_2.runway_heading(),
                    a.mmr_2.ils_frequency(),
                    a.mmr_2.localizer_deviation(),
                    a.mmr_2.glideslope_deviation(),
                )
            }),
        ] {
            assert!(ils.0.is_normal_operation());
            assert!(ils.1.is_normal_operation());
            assert!(ils.2.is_normal_operation());
            assert!(ils.3.is_normal_operation());
        }
        assert!(
            (test_bed.query(|a| a.mmr_1.localizer_deviation().value().get::<ratio>())
                - 0.4 / 0.8 * 0.0775)
                .abs()
                < 1e-9
        );
        assert!(
            (test_bed.query(|a| a.mmr_2.glideslope_deviation().value().get::<ratio>())
                - 0.3 / 0.4 * 0.0875)
                .abs()
                < 1e-9
        );
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
            mmr: MultiModeReceiverShim::new(context, 3, ElectricalBusType::AlternatingCurrent(1)),
        });
    }
}
