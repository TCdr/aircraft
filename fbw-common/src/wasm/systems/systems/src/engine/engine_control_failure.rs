//! FADEC, thrust lever and thrust reverser failures: the parts shared by the aircraft.
//!
//! The FADEC model of the flight computers (fbw_a320 / fbw_a380 `FadecComputer`) turns the thrust
//! lever angle (TLA) into an N1 target. The FADEC protections and the thrust lever failures change
//! the TLA that model uses: the aircraft computes that angle here, in Rust where it is tested, and
//! writes it with [`FadecThrustLeverAngle`]; the flight computer interface
//! (`FadecFailureInputs.h`) passes it to the FADEC model in place of the lever angle.
//!
//! - [`FadecChannels`]: the two channels of an engine FADEC and its high temperature (A320 ENG
//!   FADEC A(B) FAULT, FADEC FAULT, FADEC HI TEMP).
//! - [`limit_reverse_thrust_until_deployed`]: the reverse idle of a reverser deployment.
//! - [`apply_auto_idle`]: the FADEC idle protection.
//!
//! The rules of each aircraft (thrust lever failures, which reverser state sets the idle) are in
//! the aircraft crates, from their own FCOM.

use crate::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// The two channels of the FADEC of one engine, and its high temperature detection.
///
/// A320 FCOM DSC-70-20 (a320_fcom.txt l.62589-62590): "FADEC has two-channel redundancy, with one
/// channel active and one in standby. If one channel fails, the other automatically takes control."
/// ENG 1(2) FADEC A(B) FAULT "triggers when the associated FADEC channel is lost" (l.79552), ENG
/// 1(2) FADEC FAULT "when both FADEC channels are lost" (l.79626), ENG 1(2) FADEC HI TEMP "when high
/// temperature is detected by one or both channels" (l.79700).
pub struct FadecChannels {
    channel_a: Failure,
    channel_b: Failure,
    overheat: Failure,

    channel_a_fault_id: VariableIdentifier,
    channel_b_fault_id: VariableIdentifier,
    fadec_fault_id: VariableIdentifier,
    high_temperature_id: VariableIdentifier,
}
impl FadecChannels {
    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            channel_a: Failure::new(FailureType::FadecChannelA(engine_number)),
            channel_b: Failure::new(FailureType::FadecChannelB(engine_number)),
            overheat: Failure::new(FailureType::FadecOverheat(engine_number)),
            channel_a_fault_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_CHANNEL_A_FAULT", engine_number)),
            channel_b_fault_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_CHANNEL_B_FAULT", engine_number)),
            fadec_fault_id: context.get_identifier(format!("ENGINE_{}_FADEC_FAULT", engine_number)),
            high_temperature_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_HI_TEMP", engine_number)),
        }
    }

    pub fn channel_a_lost(&self) -> bool {
        self.channel_a.is_active()
    }

    pub fn channel_b_lost(&self) -> bool {
        self.channel_b.is_active()
    }

    /// Both channels are lost: the FADEC no longer works.
    pub fn both_channels_lost(&self) -> bool {
        self.channel_a_lost() && self.channel_b_lost()
    }

    pub fn high_temperature(&self) -> bool {
        self.overheat.is_active()
    }
}
impl SimulationElement for FadecChannels {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.channel_a.accept(visitor);
        self.channel_b.accept(visitor);
        self.overheat.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        // A single channel fault is shown only while the other channel works: with both lost, the
        // FADEC FAULT alert replaces them.
        let both_lost = self.both_channels_lost();
        writer.write(
            &self.channel_a_fault_id,
            self.channel_a_lost() && !both_lost,
        );
        writer.write(
            &self.channel_b_fault_id,
            self.channel_b_lost() && !both_lost,
        );
        writer.write(&self.fadec_fault_id, both_lost);
        writer.write(&self.high_temperature_id, self.high_temperature());
    }
}

/// The reverse idle of a reverser deployment, for a TLA in the reverse range (negative).
///
/// A320 FCOM DSC-70-70 ACTUATION LOGIC (a320_fcom.txt l.63304-63305): "Before deployment is
/// completed, the FADEC sets reverse idle thrust on the engine that is having its thrust
/// reversed." A380 FCOM DSC-70-70 DEPLOYMENT-STOWAGE SEQUENCE (a380_fcom.txt l.112117): "During
/// the thrust reverser deployment, the engine reverse thrust is limited to reverse idle."
///
/// `reverse_idle_tla_deg` is the TLA of reverse idle in the FADEC model (negative). A reverser
/// that does not deploy (failed, inhibited) keeps the engine at reverse idle.
pub fn limit_reverse_thrust_until_deployed(
    tla_deg: f64,
    reverser_fully_deployed: bool,
    reverse_idle_tla_deg: f64,
) -> f64 {
    if tla_deg < 0. && !reverser_fully_deployed {
        tla_deg.max(reverse_idle_tla_deg)
    } else {
        tla_deg
    }
}

/// The FADEC idle protection: the engine is set to (forward) idle whatever the lever position
/// above idle. A320 FCOM DSC-70-70 PROTECTION (l.63311-63321), A380 FCOM DSC-70-70 IDLE
/// PROTECTION (l.112243-112249).
pub fn apply_auto_idle(tla_deg: f64, auto_idle: bool) -> f64 {
    if auto_idle && tla_deg > 0. {
        0.
    } else {
        tla_deg
    }
}

/// The thrust lever angle the FADEC model of the flight computers uses, and whether the FADEC idle
/// protection holds the engine at idle.
///
/// Written as `ENGINE_n_FADEC_TLA_OVERRIDE_ACTIVE` (the FADEC uses `ENGINE_n_FADEC_TLA_OVERRIDE`
/// in place of the lever angle) and `ENGINE_n_FADEC_AUTO_IDLE`. While the override is not active,
/// the FADEC model uses the lever, as before: a missing or zero variable changes nothing.
pub struct FadecThrustLeverAngle {
    override_active_id: VariableIdentifier,
    override_tla_id: VariableIdentifier,
    auto_idle_id: VariableIdentifier,

    lever_tla_deg: f64,
    fadec_tla_deg: f64,
    auto_idle: bool,
}
impl FadecThrustLeverAngle {
    /// Below this difference the FADEC uses the lever angle itself (float noise).
    const OVERRIDE_TOLERANCE_DEG: f64 = 1e-6;

    pub fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            override_active_id: context.get_identifier(format!(
                "ENGINE_{}_FADEC_TLA_OVERRIDE_ACTIVE",
                engine_number
            )),
            override_tla_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_TLA_OVERRIDE", engine_number)),
            auto_idle_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_AUTO_IDLE", engine_number)),
            lever_tla_deg: 0.,
            fadec_tla_deg: 0.,
            auto_idle: false,
        }
    }

    pub fn set(&mut self, lever_tla_deg: f64, fadec_tla_deg: f64, auto_idle: bool) {
        self.lever_tla_deg = lever_tla_deg;
        self.fadec_tla_deg = fadec_tla_deg;
        self.auto_idle = auto_idle;
    }

    pub fn fadec_tla_deg(&self) -> f64 {
        self.fadec_tla_deg
    }

    pub fn override_is_active(&self) -> bool {
        (self.fadec_tla_deg - self.lever_tla_deg).abs() > Self::OVERRIDE_TOLERANCE_DEG
    }

    pub fn auto_idle(&self) -> bool {
        self.auto_idle
    }
}
impl SimulationElement for FadecThrustLeverAngle {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.override_active_id, self.override_is_active());
        writer.write(&self.override_tla_id, self.fadec_tla_deg);
        writer.write(&self.auto_idle_id, self.auto_idle);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft, UpdateContext,
    };

    struct TestAircraft {
        channels: FadecChannels,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                channels: FadecChannels::new(context, 1),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, _: &UpdateContext) {}
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.channels.accept(visitor);
            visitor.visit(self);
        }
    }

    fn read_bool(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    #[allow(dead_code)]
    fn read_f64(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> f64 {
        test_bed.read_by_name(name)
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        SimulationTestBed::new(TestAircraft::new)
    }

    #[test]
    fn no_fadec_fault_without_failure() {
        let mut test_bed = test_bed();
        test_bed.run();
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_CHANNEL_A_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_CHANNEL_B_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_HI_TEMP"));
    }

    #[test]
    fn one_channel_lost_is_a_channel_fault() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::FadecChannelB(1));
        test_bed.run();
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_CHANNEL_A_FAULT"));
        assert!(read_bool(&mut test_bed, "ENGINE_1_FADEC_CHANNEL_B_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_FAULT"));
        assert!(!test_bed.query(|a| a.channels.both_channels_lost()));
    }

    #[test]
    fn both_channels_lost_is_a_fadec_fault_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::FadecChannelA(1));
        test_bed.fail(FailureType::FadecChannelB(1));
        test_bed.run();
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_CHANNEL_A_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_CHANNEL_B_FAULT"));
        assert!(read_bool(&mut test_bed, "ENGINE_1_FADEC_FAULT"));
        assert!(test_bed.query(|a| a.channels.both_channels_lost()));
    }

    #[test]
    fn overheat_is_a_high_temperature() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::FadecOverheat(1));
        test_bed.run();
        assert!(read_bool(&mut test_bed, "ENGINE_1_FADEC_HI_TEMP"));
    }

    #[test]
    fn reverse_thrust_is_reverse_idle_until_the_reverser_is_deployed() {
        assert_eq!(limit_reverse_thrust_until_deployed(-20., false, -6.), -6.);
        assert_eq!(limit_reverse_thrust_until_deployed(-20., true, -6.), -20.);
    }

    #[test]
    fn reverse_idle_and_forward_thrust_are_not_limited_by_the_reverser() {
        assert_eq!(limit_reverse_thrust_until_deployed(-3., false, -6.), -3.);
        assert_eq!(limit_reverse_thrust_until_deployed(25., false, -6.), 25.);
    }

    #[test]
    fn auto_idle_sets_forward_thrust_to_idle() {
        assert_eq!(apply_auto_idle(45., true), 0.);
        assert_eq!(apply_auto_idle(45., false), 45.);
        assert_eq!(apply_auto_idle(-6., true), -6.);
    }
}
