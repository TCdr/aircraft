//! GPIRS: the hybrid GPS/inertial position that each IR of the ADIRUs computes from the GPS receiver it selects.
//!
//! A320 FCOM DSC-22_20 (FMGS position computation): "Each IRS computes a mixed IRS/GPS position called the GPIRS
//! position. For this, each IRS can independently select their GPS source in order to maximize the availability of GPS
//! data." "In nominal case, ADIRU1 selects GPS1 and ADIRU2 selects GPS2. The GPS selection by ADIRU3 depends on the
//! position of the ATT HDG selector switch. If one of the GPS source is rejected by the ADIRUs, all ADIRUs will select
//! the same GPS source."
//!
//! A380 FCOM DSC-22-FMS-10-30-10: "Each ADIRS computes a hybrid position, composed of the GPS and IRS position"; it does
//! not detail the receiver selection, the A320 one is used for both aircraft.
//!
//! The ADIRU 3 rule is a design choice (the FCOM does not detail it): GPS 2 with ATT HDG on F/O 3 (ADIRU 3 replaces
//! ADIRU 2), else GPS 1. The inertial position of the simulated IRs does not drift, so the hybrid position is the GPS
//! position of the selected receiver, with its accuracy (figure of merit) and its integrity limit.

use crate::{
    shared::arinc429::{Arinc429Word, SignStatus},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, VariableIdentifier, Write,
    },
};
use uom::si::{angle::degree, f64::Angle};

/// What the GPIRS of one IR needs from a GPS receiver
#[derive(Clone, Copy, Default)]
struct GpsData {
    latitude: Arinc429Word<f64>,
    longitude: Arinc429Word<f64>,
    /// in nautical miles
    figure_of_merit: Arinc429Word<f64>,
    /// in nautical miles
    integrity_limit: Arinc429Word<f64>,
}

impl GpsData {
    /// A receiver an ADIRU can use: navigating, with a valid position
    fn is_usable(&self) -> bool {
        self.latitude.ssm() == SignStatus::NormalOperation
            && self.longitude.ssm() == SignStatus::NormalOperation
    }
}

struct GpsInputs {
    latitude_id: VariableIdentifier,
    longitude_id: VariableIdentifier,
    figure_of_merit_id: VariableIdentifier,
    integrity_limit_id: VariableIdentifier,
    data: GpsData,
}

impl GpsInputs {
    fn new(context: &mut InitContext, number: usize) -> Self {
        let name = |s: &str| format!("GPS_{}_{}", number, s);
        Self {
            latitude_id: context.get_identifier(name("LATITUDE")),
            longitude_id: context.get_identifier(name("LONGITUDE")),
            figure_of_merit_id: context.get_identifier(name("HORIZONTAL_FIGURE_OF_MERIT")),
            integrity_limit_id: context.get_identifier(name("HORIZONTAL_INTEGRITY_LIMIT")),
            data: GpsData::default(),
        }
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        let figure_of_merit_ft: Arinc429Word<f64> = reader.read_arinc429(&self.figure_of_merit_id);
        self.data = GpsData {
            latitude: reader.read_arinc429(&self.latitude_id),
            longitude: reader.read_arinc429(&self.longitude_id),
            figure_of_merit: Arinc429Word::new(
                figure_of_merit_ft.value() / Gpirs::FEET_PER_NAUTICAL_MILE,
                figure_of_merit_ft.ssm(),
            ),
            integrity_limit: reader.read_arinc429(&self.integrity_limit_id),
        };
    }
}

struct IrGpirs {
    number: usize,
    ir_latitude_id: VariableIdentifier,
    ir_latitude_ssm: SignStatus,
    /// The GPS receiver selected (1 or 2), none when no receiver is usable
    source: Option<usize>,
    output: Option<GpsData>,

    latitude_id: VariableIdentifier,
    longitude_id: VariableIdentifier,
    figure_of_merit_id: VariableIdentifier,
    integrity_limit_id: VariableIdentifier,
    source_id: VariableIdentifier,
}

impl IrGpirs {
    fn new(context: &mut InitContext, number: usize) -> Self {
        let name = |s: &str| format!("ADIRS_IR_{}_GPIRS_{}", number, s);
        Self {
            number,
            ir_latitude_id: context.get_identifier(format!("ADIRS_IR_{}_LATITUDE", number)),
            ir_latitude_ssm: SignStatus::FailureWarning,
            source: None,
            output: None,
            latitude_id: context.get_identifier(name("LATITUDE")),
            longitude_id: context.get_identifier(name("LONGITUDE")),
            figure_of_merit_id: context.get_identifier(name("FIGURE_OF_MERIT")),
            integrity_limit_id: context.get_identifier(name("INTEGRITY_LIMIT")),
            source_id: context.get_identifier(name("SOURCE")),
        }
    }

    /// Whether the IR gives an inertial position (aligned, in NAV)
    fn is_navigating(&self) -> bool {
        self.ir_latitude_ssm == SignStatus::NormalOperation
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let (data, ssm) = match (self.is_navigating(), self.output) {
            (true, Some(data)) => (data, SignStatus::NormalOperation),
            (true, None) => (GpsData::default(), SignStatus::NoComputedData),
            (false, _) => (GpsData::default(), SignStatus::FailureWarning),
        };
        writer.write_arinc429(
            &self.latitude_id,
            Angle::new::<degree>(data.latitude.value()),
            ssm,
        );
        writer.write_arinc429(
            &self.longitude_id,
            Angle::new::<degree>(data.longitude.value()),
            ssm,
        );
        writer.write_arinc429(&self.figure_of_merit_id, data.figure_of_merit.value(), ssm);
        // No integrity limit (fewer than five satellites): the hybrid position has none either
        let integrity_ssm = if ssm == SignStatus::NormalOperation {
            match data.integrity_limit.ssm() {
                SignStatus::NormalOperation => SignStatus::NormalOperation,
                _ => SignStatus::NoComputedData,
            }
        } else {
            ssm
        };
        writer.write_arinc429(
            &self.integrity_limit_id,
            data.integrity_limit.value(),
            integrity_ssm,
        );
        writer.write(
            &self.source_id,
            if self.is_navigating() {
                self.source.unwrap_or(0) as f64
            } else {
                0.
            },
        );
    }
}

/// The GPIRS of the three IRs.
pub struct Gpirs {
    att_hdg_knob_id: VariableIdentifier,
    /// ATT HDG selector: 0 CAPT 3, 1 NORM, 2 F/O 3
    att_hdg_knob: f64,
    gps: [GpsInputs; 2],
    irs: [IrGpirs; 3],
}

impl Gpirs {
    const ATT_HDG_SWITCHING_KNOB: &'static str = "ATT_HDG_SWITCHING_KNOB";
    const ATT_HDG_FO_ON_3: f64 = 2.;
    const FEET_PER_NAUTICAL_MILE: f64 = 6076.115;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            att_hdg_knob_id: context.get_identifier(Self::ATT_HDG_SWITCHING_KNOB.to_owned()),
            att_hdg_knob: 1.,
            gps: [GpsInputs::new(context, 1), GpsInputs::new(context, 2)],
            irs: [
                IrGpirs::new(context, 1),
                IrGpirs::new(context, 2),
                IrGpirs::new(context, 3),
            ],
        }
    }

    /// The receiver an ADIRU selects when both can be used
    fn nominal_source(&self, adiru: usize) -> usize {
        match adiru {
            1 => 1,
            2 => 2,
            _ => {
                if (self.att_hdg_knob - Self::ATT_HDG_FO_ON_3).abs() < 0.5 {
                    2
                } else {
                    1
                }
            }
        }
    }

    pub fn update(&mut self) {
        let usable = [self.gps[0].data.is_usable(), self.gps[1].data.is_usable()];
        for i in 0..self.irs.len() {
            let nominal = self.nominal_source(self.irs[i].number);
            // A rejected receiver: every ADIRU selects the other one
            let source = if usable[nominal - 1] {
                Some(nominal)
            } else if usable[2 - nominal] {
                Some(3 - nominal)
            } else {
                None
            };
            self.irs[i].source = source;
            self.irs[i].output = source.map(|gps| self.gps[gps - 1].data);
        }
    }

    /// The GPS receiver an IR has selected, none when neither can be used
    pub fn source(&self, ir: usize) -> Option<usize> {
        self.irs[ir - 1].source
    }
}

impl SimulationElement for Gpirs {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.att_hdg_knob = reader.read(&self.att_hdg_knob_id);
        for gps in self.gps.iter_mut() {
            gps.read(reader);
        }
        for ir in self.irs.iter_mut() {
            let latitude: Arinc429Word<f64> = reader.read_arinc429(&ir.ir_latitude_id);
            ir.ir_latitude_ssm = latitude.ssm();
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for ir in self.irs.iter() {
            ir.write(writer);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::test::{ReadByName, SimulationTestBed, TestBed, WriteByName};
    use crate::simulation::{Aircraft, UpdateContext};

    struct TestAircraft {
        gpirs: Gpirs,
    }

    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                gpirs: Gpirs::new(context),
            }
        }
    }

    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, _: &UpdateContext) {
            self.gpirs.update();
        }
    }

    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.gpirs.accept(visitor);
            visitor.visit(self);
        }
    }

    struct GpirsTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }

    impl TestBed for GpirsTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    impl GpirsTestBed {
        fn new() -> Self {
            let mut bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            for ir in 1..=3 {
                bed = bed.ir_navigating(ir, true);
            }
            bed.gps_navigating(1, true)
                .gps_navigating(2, true)
                .att_hdg(1.)
        }

        fn ir_navigating(mut self, ir: usize, navigating: bool) -> Self {
            let ssm = if navigating {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            };
            self.write_arinc429_by_name(&format!("ADIRS_IR_{}_LATITUDE", ir), 45.47, ssm);
            self
        }

        /// A receiver in NAV (its own position, figure of merit 40 ft, integrity limit 0.05 NM) or not
        fn gps_navigating(mut self, gps: usize, navigating: bool) -> Self {
            let ssm = if navigating {
                SignStatus::NormalOperation
            } else {
                SignStatus::NoComputedData
            };
            let position = 45. + gps as f64;
            self.write_arinc429_by_name(&format!("GPS_{}_LATITUDE", gps), position, ssm);
            self.write_arinc429_by_name(&format!("GPS_{}_LONGITUDE", gps), -73.74, ssm);
            self.write_arinc429_by_name(
                &format!("GPS_{}_HORIZONTAL_FIGURE_OF_MERIT", gps),
                40.,
                ssm,
            );
            self.write_arinc429_by_name(
                &format!("GPS_{}_HORIZONTAL_INTEGRITY_LIMIT", gps),
                0.05 * gps as f64,
                ssm,
            );
            self
        }

        fn att_hdg(mut self, knob: f64) -> Self {
            self.write_by_name(Gpirs::ATT_HDG_SWITCHING_KNOB, knob);
            self
        }

        fn run(mut self) -> Self {
            self.run_with_delta(std::time::Duration::from_millis(100));
            // the outputs of a tick are read at the next one
            self.run_with_delta(std::time::Duration::from_millis(100));
            self
        }

        fn source(&mut self, ir: usize) -> f64 {
            self.read_by_name(&format!("ADIRS_IR_{}_GPIRS_SOURCE", ir))
        }

        fn latitude(&mut self, ir: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&format!("ADIRS_IR_{}_GPIRS_LATITUDE", ir))
        }

        fn integrity_limit(&mut self, ir: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&format!("ADIRS_IR_{}_GPIRS_INTEGRITY_LIMIT", ir))
        }

        fn figure_of_merit(&mut self, ir: usize) -> Arinc429Word<f64> {
            self.read_arinc429_by_name(&format!("ADIRS_IR_{}_GPIRS_FIGURE_OF_MERIT", ir))
        }
    }

    #[test]
    fn nominally_adiru_1_selects_gps_1_and_adiru_2_gps_2() {
        let mut bed = GpirsTestBed::new().run();
        assert_eq!(bed.source(1), 1.);
        assert_eq!(bed.source(2), 2.);
        assert_eq!(bed.latitude(1).value(), 46.);
        assert_eq!(bed.latitude(2).value(), 47.);
        assert_eq!(bed.latitude(1).ssm(), SignStatus::NormalOperation);
        assert!((bed.integrity_limit(2).value() - 0.1).abs() < 1e-6);
        // 40 ft in nautical miles
        assert!((bed.figure_of_merit(1).value() - 40. / 6076.115).abs() < 1e-6);
    }

    #[test]
    fn adiru_3_selects_gps_2_with_att_hdg_on_fo_3_and_gps_1_otherwise() {
        let mut bed = GpirsTestBed::new().run();
        assert_eq!(bed.source(3), 1.);
        bed = bed.att_hdg(0.).run();
        assert_eq!(bed.source(3), 1.);
        bed = bed.att_hdg(2.).run();
        assert_eq!(bed.source(3), 2.);
    }

    #[test]
    fn when_a_receiver_is_rejected_all_adirus_select_the_other_one() {
        let mut bed = GpirsTestBed::new().gps_navigating(1, false).run();
        for ir in 1..=3 {
            assert_eq!(bed.source(ir), 2.);
            assert_eq!(bed.latitude(ir).value(), 47.);
        }
        bed = bed.gps_navigating(1, true).gps_navigating(2, false).run();
        for ir in 1..=3 {
            assert_eq!(bed.source(ir), 1.);
        }
    }

    #[test]
    fn no_gpirs_position_without_a_receiver_or_without_the_ir() {
        let mut bed = GpirsTestBed::new()
            .gps_navigating(1, false)
            .gps_navigating(2, false)
            .run();
        assert_eq!(bed.source(1), 0.);
        assert_eq!(bed.latitude(1).ssm(), SignStatus::NoComputedData);

        bed = bed.gps_navigating(1, true).ir_navigating(2, false).run();
        assert_eq!(bed.latitude(2).ssm(), SignStatus::FailureWarning);
        assert_eq!(bed.source(2), 0.);
        assert_eq!(bed.latitude(1).ssm(), SignStatus::NormalOperation);
    }

    #[test]
    fn no_integrity_limit_when_the_receiver_has_none() {
        let mut bed = GpirsTestBed::new();
        bed.write_arinc429_by_name(
            "GPS_1_HORIZONTAL_INTEGRITY_LIMIT",
            0.,
            SignStatus::NoComputedData,
        );
        bed = bed.run();
        assert_eq!(bed.integrity_limit(1).ssm(), SignStatus::NoComputedData);
        assert_eq!(bed.latitude(1).ssm(), SignStatus::NormalOperation);
    }
}
