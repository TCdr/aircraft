use std::time::Duration;
use systems::navigation::adirs::{
    AdiruElectricalSupply, AirDataInertialReferenceSystem, AirDataInertialReferenceUnitProgramming,
    AttitudeModeHeading, CompleteAlignmentTime, InertialReferenceBackupSupply,
    LowSpeedWarningThreshold, MagneticReferenceArea,
};
use systems::navigation::ala52b::{
    Ala52BAircraftInstallationDelay, Ala52BRadioAltimeter, Ala52BTransceiverPair,
};
use systems::navigation::radio_altimeter::{AntennaInstallation, RadioAltimeter};
use systems::shared::{ElectricalBusType, MachNumber};
use systems::simulation::{
    InitContext, SimulationElement, SimulationElementVisitor, UpdateContext,
};
use uom::si::angle::degree;
use uom::si::f64::*;
use uom::si::length::{foot, meter};
use uom::si::velocity::knot;

pub(crate) struct A320AirDataInertialReferenceSystemBuilder;
impl A320AirDataInertialReferenceSystemBuilder {
    /// A320 FCOM DSC-22_20-20-40 ALIGNMENT OF INERTIAL REFERENCE SYSTEM (a320_fcom.txt
    /// l.12797-12798): "A normal alignment takes 10 min and a fast alignment takes 30 s", with the
    /// memo "IRS IN ALIGN X MN" counting the minutes left, 1 < X < 10 (l.52686-52688). Unlike the
    /// A380 FCOM, the A320 FCOM gives no latitude dependency (ground alignment only up to 73 deg,
    /// l.116718).
    const COMPLETE_ALIGNMENT_TIME: Duration = Duration::from_secs(10 * 60);

    /// A320 FCOM LIM-NAV IR GROUND ALIGNMENT (a320_fcom.txt l.116716-116718): "Ground alignment of the IRS is
    /// possible in latitudes between 73° North and 73° South." The magnetic heading and track are valid between
    /// 60 S and 73 N (l.116720-116726, MagneticReferenceArea::SixtySouthToSeventyThreeNorth).
    const MAX_ALIGNMENT_LATITUDE_DEGREES: f64 = 73.;

    /// A320 FCOM PRO-ABN-ELEC ELEC EMER CONFIG SYS REMAINING (a320_fcom.txt l.75317-75320, l.75390): IR "No 1 only (e)"
    /// and ADR "No 1 only" with the emergency generator, ADR "INOP" on batteries only; "(e) IR 2 and IR 3 are lost 5 min
    /// after failure of main generators". With AC, the ELEC busbar faults give the AC supplies (FWC/Logic/ElecBusAlerts):
    /// AC ESS BUS FAULT loses ADR 1, AC BUS 2 FAULT ADR 2, AC BUS 1 FAULT ADR 3.
    /// So the ADRs need their AC bus, and the IRs run on the batteries without it, IR 2 and IR 3 for 5 min.
    /// Design choices (the FCOM text gives no bus names for the battery supply): IR 1 on the hot bus 1, IR 2 and IR 3 on
    /// the hot bus 2. Not modelled: ADIRU 3 on the AC ESS bus with the ATT HDG selector on CAPT 3, which also keeps
    /// IR 3 on the batteries beyond the 5 min (note (e)).
    const IR_BATTERY_TIME_LIMIT: Duration = Duration::from_secs(5 * 60);

    fn electrical_supplies() -> [AdiruElectricalSupply; 3] {
        [
            AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrentEssential)
                .with_ir_backup(InertialReferenceBackupSupply::new(
                    ElectricalBusType::DirectCurrentHot(1),
                    true,
                    None,
                )),
            AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrent(2)).with_ir_backup(
                InertialReferenceBackupSupply::new(
                    ElectricalBusType::DirectCurrentHot(2),
                    true,
                    Some(Self::IR_BATTERY_TIME_LIMIT),
                ),
            ),
            AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrent(1)).with_ir_backup(
                InertialReferenceBackupSupply::new(
                    ElectricalBusType::DirectCurrentHot(2),
                    true,
                    Some(Self::IR_BATTERY_TIME_LIMIT),
                ),
            ),
        ]
    }

    pub(crate) fn build(context: &mut InitContext) -> AirDataInertialReferenceSystem {
        let adirs_programming = AirDataInertialReferenceUnitProgramming::new(
            Velocity::new::<knot>(350.),
            MachNumber(0.82),
            [
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(100.),
                    Velocity::new::<knot>(104.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(50.),
                    Velocity::new::<knot>(54.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(155.),
                    Velocity::new::<knot>(159.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(260.),
                    Velocity::new::<knot>(264.),
                ),
            ],
            Self::electrical_supplies(),
        )
        .with_complete_alignment_time(CompleteAlignmentTime::Fixed(Self::COMPLETE_ALIGNMENT_TIME))
        .with_latitude_limits(
            Angle::new::<degree>(Self::MAX_ALIGNMENT_LATITUDE_DEGREES),
            MagneticReferenceArea::SixtySouthToSeventyThreeNorth,
        )
        .with_attitude_mode_heading(AttitudeModeHeading::EnteredByCrew);
        AirDataInertialReferenceSystem::new(context, adirs_programming)
    }
}

pub struct A320RadioAltimeters {
    radio_altimeter_1: A320RadioAltimeter,
    radio_altimeter_2: A320RadioAltimeter,
}

impl A320RadioAltimeters {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            radio_altimeter_1: A320RadioAltimeter::new(
                context,
                1,
                ElectricalBusType::AlternatingCurrent(1),
                AntennaInstallation::new(
                    // Sim CG minus RA height over ground
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    // Aft distance from Sim CG
                    Length::new::<meter>(9.89),
                    // Electric length of the antennas and cable modeling some material variation
                    Length::new::<foot>(22.4),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    Length::new::<meter>(9.19),
                    Length::new::<foot>(22.4),
                ),
            ),
            radio_altimeter_2: A320RadioAltimeter::new(
                context,
                2,
                ElectricalBusType::AlternatingCurrent(2),
                AntennaInstallation::new(
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    Length::new::<meter>(11.27),
                    Length::new::<foot>(21.4),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    Length::new::<meter>(11.96),
                    Length::new::<foot>(21.4),
                ),
            ),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.radio_altimeter_1.update(context);
        self.radio_altimeter_2.update(context);
    }

    pub fn radio_altimeter_1(&self) -> &impl RadioAltimeter {
        &self.radio_altimeter_1.radio_altimeter
    }

    pub fn radio_altimeter_2(&self) -> &impl RadioAltimeter {
        &self.radio_altimeter_2.radio_altimeter
    }
}

impl SimulationElement for A320RadioAltimeters {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.radio_altimeter_1.accept(visitor);
        self.radio_altimeter_2.accept(visitor);

        visitor.visit(self);
    }
}

pub struct A320RadioAltimeter {
    radio_altimeter: Ala52BRadioAltimeter,
    transceivers: Ala52BTransceiverPair,
}

impl A320RadioAltimeter {
    fn new(
        context: &mut InitContext,
        number: usize,
        powered_by: ElectricalBusType,
        transmitter: AntennaInstallation,
        receiver: AntennaInstallation,
    ) -> Self {
        Self {
            radio_altimeter: Ala52BRadioAltimeter::new(
                context,
                number,
                Ala52BAircraftInstallationDelay::FiftySevenFeet,
                powered_by,
            ),
            transceivers: Ala52BTransceiverPair::new(context, number, transmitter, receiver),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        self.radio_altimeter.update(context, &self.transceivers);
    }
}

impl SimulationElement for A320RadioAltimeter {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.transceivers.accept(visitor);
        self.radio_altimeter.accept(visitor);

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::electrical::{test::TestElectricitySource, ElectricalBus, Electricity};
    use systems::navigation::adirs::AirDataInertialReferenceSystemOverheadPanel;
    use systems::shared::arinc429::{Arinc429Word, SignStatus};
    use systems::shared::PotentialOrigin;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };
    use uom::si::{angle::degree, electric_potential::volt};

    /// The buses of the A320 ADIRUs (A320AirDataInertialReferenceSystemBuilder), all powered
    const ADIRU_BUSES: [ElectricalBusType; 5] = [
        ElectricalBusType::AlternatingCurrentEssential,
        ElectricalBusType::AlternatingCurrent(1),
        ElectricalBusType::AlternatingCurrent(2),
        ElectricalBusType::DirectCurrentHot(1),
        ElectricalBusType::DirectCurrentHot(2),
    ];

    struct TestAircraft {
        electricity_source: TestElectricitySource,
        buses: [ElectricalBus; 5],
        adirs: AirDataInertialReferenceSystem,
        overhead: AirDataInertialReferenceSystemOverheadPanel,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                electricity_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: ADIRU_BUSES.map(|bus| ElectricalBus::new(context, bus)),
                adirs: A320AirDataInertialReferenceSystemBuilder::build(context),
                overhead: AirDataInertialReferenceSystemOverheadPanel::new(context),
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
            for bus in self.buses.iter() {
                electricity.flow(&self.electricity_source, bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.adirs.update(context, &self.overhead);
            self.overhead.update(context, &self.adirs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.adirs.accept(visitor);
            self.overhead.accept(visitor);
            visitor.visit(self);
        }
    }

    fn set_all_ir_mode_selectors(test_bed: &mut SimulationTestBed<TestAircraft>, mode: f64) {
        for number in 1..=3 {
            test_bed.write_by_name(
                &format!("OVHD_ADIRS_IR_{}_MODE_SELECTOR_KNOB", number),
                mode,
            );
        }
    }

    #[test]
    fn a_complete_ir_alignment_takes_10_minutes_at_the_equator() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_on_ground(true);
        test_bed.write_by_name("PLANE LATITUDE", Angle::new::<degree>(0.));
        // OFF long enough to need a complete alignment, then NAV
        // (the first frame OFF arms the 5 s quick re-alignment, the next one lets it run out)
        set_all_ir_mode_selectors(&mut test_bed, 0.);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.run_with_delta(Duration::from_secs(30));
        set_all_ir_mode_selectors(&mut test_bed, 1.);
        test_bed.run_with_delta(Duration::ZERO);

        let remaining: Duration = test_bed.read_by_name("ADIRS_REMAINING_IR_ALIGNMENT_TIME");
        assert_eq!(remaining, Duration::from_secs(600));
    }

    /// IrMaintFlags of the IR maintenance word (docs/a320-simvars.md A32NX_ADIRS_IR_{number}_MAINT_WORD)
    const MAINT_WORD_VALID_SET_HEADING: u32 = 1 << 3;
    const MAINT_WORD_ALIGN_FAULT: u32 = 1 << 10;
    const MAINT_WORD_EXTREME_LATITUDE: u32 = 1 << 14;

    const IR_MODE_OFF: f64 = 0.;
    const IR_MODE_NAV: f64 = 1.;
    const IR_MODE_ATT: f64 = 2.;

    fn ir_1_maint_word(test_bed: &mut SimulationTestBed<TestAircraft>) -> u32 {
        let maint_word: Arinc429Word<u32> = test_bed.read_arinc429_by_name("ADIRS_IR_1_MAINT_WORD");
        maint_word.value()
    }

    fn ir_1_heading(test_bed: &mut SimulationTestBed<TestAircraft>) -> Arinc429Word<Angle> {
        test_bed.read_arinc429_by_name("ADIRS_IR_1_HEADING")
    }

    fn set_aircraft_heading(
        test_bed: &mut SimulationTestBed<TestAircraft>,
        true_heading: f64,
        magnetic_heading: f64,
    ) {
        test_bed.write_by_name(
            "PLANE HEADING DEGREES TRUE",
            Angle::new::<degree>(true_heading),
        );
        test_bed.write_by_name(
            "PLANE HEADING DEGREES MAGNETIC",
            Angle::new::<degree>(magnetic_heading),
        );
    }

    /// The FMGC sends a crew SET HDG entry: normal operation, as the MCDU does for a short time after the entry
    fn send_set_heading(test_bed: &mut SimulationTestBed<TestAircraft>, heading: f64) {
        test_bed.write_arinc429_by_name("FM_IRS_SET_HEADING", heading, SignStatus::NormalOperation);
    }

    fn end_set_heading(test_bed: &mut SimulationTestBed<TestAircraft>) {
        test_bed.write_arinc429_by_name("FM_IRS_SET_HEADING", 0., SignStatus::NoComputedData);
    }

    /// The IRs aligned in NAV mode (they start aligned) past the power settling time of the ADIRS, at a latitude
    fn aligned_test_bed_at(latitude: f64, longitude: f64) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_on_ground(true);
        test_bed.write_by_name("PLANE LATITUDE", Angle::new::<degree>(latitude));
        test_bed.write_by_name("PLANE LONGITUDE", Angle::new::<degree>(longitude));
        set_aircraft_heading(&mut test_bed, 100., 95.);
        set_all_ir_mode_selectors(&mut test_bed, IR_MODE_NAV);
        test_bed.run_with_delta(Duration::from_secs(3));
        test_bed.run_with_delta(Duration::from_secs(3));
        test_bed
    }

    /// The aligned IRs, IR 1 then set to ATT (its attitude stays initialised)
    fn ir_1_in_att_mode_test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = aligned_test_bed_at(45., 0.);
        assert!(ir_1_heading(&mut test_bed).is_normal_operation());
        test_bed.write_by_name("OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB", IR_MODE_ATT);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed
    }

    #[test]
    fn in_att_mode_the_heading_is_no_computed_data_until_the_crew_enters_it() {
        let mut test_bed = ir_1_in_att_mode_test_bed();

        assert!(!ir_1_heading(&mut test_bed).is_normal_operation());
        assert_eq!(
            ir_1_maint_word(&mut test_bed) & MAINT_WORD_VALID_SET_HEADING,
            0
        );
    }

    #[test]
    fn in_att_mode_the_ir_runs_from_the_heading_the_crew_entered() {
        let mut test_bed = ir_1_in_att_mode_test_bed();

        send_set_heading(&mut test_bed, 120.);
        test_bed.run_with_delta(Duration::from_millis(500));
        test_bed.run_with_delta(Duration::from_millis(500));
        end_set_heading(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(1));

        let heading = ir_1_heading(&mut test_bed);
        assert!(heading.is_normal_operation());
        assert!((heading.value().get::<degree>() - 120.).abs() < 1e-6);
        assert_eq!(
            ir_1_maint_word(&mut test_bed) & MAINT_WORD_VALID_SET_HEADING,
            MAINT_WORD_VALID_SET_HEADING
        );

        // The aircraft turns right by 30 deg: the IR heading follows from the entered heading
        set_aircraft_heading(&mut test_bed, 130., 125.);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.run_with_delta(Duration::from_secs(1));
        let heading = ir_1_heading(&mut test_bed);
        assert!(heading.is_normal_operation());
        assert!((heading.value().get::<degree>() - 150.).abs() < 1e-6);
    }

    #[test]
    fn a_new_entry_of_the_same_heading_resets_the_att_mode_heading() {
        let mut test_bed = ir_1_in_att_mode_test_bed();

        send_set_heading(&mut test_bed, 120.);
        test_bed.run_with_delta(Duration::from_secs(1));
        end_set_heading(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(1));
        set_aircraft_heading(&mut test_bed, 110., 105.);
        test_bed.run_with_delta(Duration::from_secs(1));

        // The crew enters 120 again: the IR heading is 120 again, not 130
        send_set_heading(&mut test_bed, 120.);
        test_bed.run_with_delta(Duration::from_secs(1));
        end_set_heading(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(1));

        let heading = ir_1_heading(&mut test_bed);
        assert!((heading.value().get::<degree>() - 120.).abs() < 1e-6);
    }

    #[test]
    fn the_att_mode_heading_is_lost_when_the_ir_leaves_att_mode() {
        let mut test_bed = ir_1_in_att_mode_test_bed();
        send_set_heading(&mut test_bed, 120.);
        test_bed.run_with_delta(Duration::from_secs(1));
        end_set_heading(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(1));

        // OFF and back to ATT: the attitude initialises again, then the heading needs a new entry
        test_bed.write_by_name("OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB", IR_MODE_OFF);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.write_by_name("OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB", IR_MODE_ATT);
        for _ in 0..3 {
            test_bed.run_with_delta(Duration::from_secs(15));
        }

        let pitch: Arinc429Word<Angle> = test_bed.read_arinc429_by_name("ADIRS_IR_1_PITCH");
        assert!(pitch.is_normal_operation());
        assert!(!ir_1_heading(&mut test_bed).is_normal_operation());
    }

    #[test]
    fn a_heading_entry_outside_att_mode_is_not_taken() {
        let mut test_bed = aligned_test_bed_at(45., 0.);

        // In NAV mode the IR gives the magnetic heading and ignores the entry
        send_set_heading(&mut test_bed, 200.);
        test_bed.run_with_delta(Duration::from_secs(1));
        let heading = ir_1_heading(&mut test_bed);
        assert!(heading.is_normal_operation());
        assert!((heading.value().get::<degree>() - 95.).abs() < 1e-6);

        // ATT selected while the old entry is still sent: no new entry, so no heading
        test_bed.write_by_name("OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB", IR_MODE_ATT);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.run_with_delta(Duration::from_secs(1));
        assert!(!ir_1_heading(&mut test_bed).is_normal_operation());
    }

    /// OFF long enough to need a complete alignment, then NAV, at a latitude
    fn complete_alignment_started_at(latitude: f64) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_on_ground(true);
        test_bed.write_by_name("PLANE LATITUDE", Angle::new::<degree>(latitude));
        set_all_ir_mode_selectors(&mut test_bed, IR_MODE_OFF);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.run_with_delta(Duration::from_secs(30));
        set_all_ir_mode_selectors(&mut test_bed, IR_MODE_NAV);
        test_bed.run_with_delta(Duration::ZERO);
        test_bed
    }

    #[test]
    fn ground_alignment_is_not_possible_north_of_73_degrees() {
        let mut test_bed = complete_alignment_started_at(74.);
        test_bed.run_with_delta(Duration::from_secs(30));
        test_bed.run_with_delta(Duration::from_secs(30));

        let remaining: Duration = test_bed.read_by_name("ADIRS_REMAINING_IR_ALIGNMENT_TIME");
        assert_eq!(remaining, Duration::from_secs(600));
        assert_eq!(
            ir_1_maint_word(&mut test_bed) & MAINT_WORD_ALIGN_FAULT,
            MAINT_WORD_ALIGN_FAULT
        );
    }

    #[test]
    fn ground_alignment_is_possible_up_to_73_degrees_south() {
        let mut test_bed = complete_alignment_started_at(-72.9);
        test_bed.run_with_delta(Duration::from_secs(30));
        test_bed.run_with_delta(Duration::from_secs(30));

        let remaining: Duration = test_bed.read_by_name("ADIRS_REMAINING_IR_ALIGNMENT_TIME");
        assert_eq!(remaining, Duration::from_secs(540));
        assert_eq!(ir_1_maint_word(&mut test_bed) & MAINT_WORD_ALIGN_FAULT, 0);
    }

    #[test]
    fn the_magnetic_heading_is_not_valid_north_of_73_degrees_at_any_longitude() {
        // Outside the 120 W - 90 W band around the magnetic pole
        let mut test_bed = aligned_test_bed_at(78., 20.);

        assert_eq!(
            ir_1_maint_word(&mut test_bed) & MAINT_WORD_EXTREME_LATITUDE,
            MAINT_WORD_EXTREME_LATITUDE
        );
        // The magnetic heading label then carries the true heading
        let heading = ir_1_heading(&mut test_bed);
        assert!(heading.is_normal_operation());
        assert!((heading.value().get::<degree>() - 100.).abs() < 1e-6);
    }

    #[test]
    fn the_magnetic_heading_is_valid_up_to_73_degrees_north() {
        let mut test_bed = aligned_test_bed_at(72., 20.);

        assert_eq!(
            ir_1_maint_word(&mut test_bed) & MAINT_WORD_EXTREME_LATITUDE,
            0
        );
        let heading = ir_1_heading(&mut test_bed);
        assert!(heading.is_normal_operation());
        assert!((heading.value().get::<degree>() - 95.).abs() < 1e-6);
    }
}
