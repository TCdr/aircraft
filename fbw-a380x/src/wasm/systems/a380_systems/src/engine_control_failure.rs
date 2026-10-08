//! FADEC, thrust lever and thrust reverser failures of the A380 (engine failures stage B5): the
//! thrust lever angle the FADECs use, and the FADEC status the FWS reads.
//!
//! Per engine (1 to 4):
//! - FADEC avionics network link (A380 FCOM ENG 1(2)(3)(4) FADEC FAULT, a380_fcom.txt
//!   l.171542-171604): "The FADEC of the ENG 1(2)(3)(4) cannot communicate via the avionic networks
//!   ... The FADEC can still provide engine control, and transmits to the EWD the primary engine
//!   parameters ... The ENG 1(2)(3)(4) parameters on the ENG SD page are lost", INOP SYS ENG n A/THR
//!   (if the A/THR is engaged). The flight computer interface cuts the PRIM orders (A/THR) to that
//!   FADEC; the SD ENG page shows XX for that engine.
//! - FADEC system fault (FADEC SYS FAULT, l.171654-171667, "A FADEC failure affects the control of
//!   the engine", crew awareness) and FADEC overheat (FADEC TEMP HI, l.171683-171693, crew
//!   awareness): alerts only.
//! - Thrust lever resolvers (ENG 1(2)(3)(4) THR LEVER FAULT, l.173303-173335): [`A380ThrustLeverRating`].
//!
//! Per reverser (engines 2 and 3 only: "When the thrust lever of the engine 2(3) is set to the
//! reverse position", DSC-70-70 l.112148; FBW ThrottleAxisMapping disables reverse on engines 1
//! and 4): the reverse idle of a deployment ("During the thrust reverser deployment, the engine
//! reverse thrust is limited to reverse idle", l.112117) and the idle protection of an unlocked
//! reverser ("ENG 2(3) IDLE ONLY", l.173678).

use systems::{
    engine::engine_control_failure::{
        apply_auto_idle, limit_reverse_thrust_until_deployed, FadecThrustLeverAngle,
    },
    failures::{Failure, FailureType},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

use crate::reverser::A380ReverserMonitoring;

/// The thrust lever angles (degrees) of the FADEC model (fbw_a380 A380FadecComputer): IDLE 0, CL
/// 25; reverse idle is -6 (the model maps every TLA from 0 to -6 to reverse idle).
const IDLE_TLA_DEG: f64 = 0.;
const CLB_TLA_DEG: f64 = 25.;
const REVERSE_IDLE_TLA_DEG: f64 = -6.;

/// The engine rating the FADEC selects with a failed thrust lever, written as
/// `ENGINE_n_THR_LEVER_RATING` for the FWS.
///
/// ENG 1(2)(3)(4) THR LEVER FAULT, "the FADEC has lost the throttle lever position"
/// (l.173306): "On ground: ENG 1(2)(3)(4) IDLE ONLY ... The affected engine is automatically set
/// to idle. In flight: ENG 1(2)(3)(4) CLB ONLY ... THR LEVER CLB. The affected engine power is
/// automatically limited." (l.173316-173323). Design choice: limited to CLB = the FADEC uses the
/// CL detent, so the A/THR still manages the engine between idle and CLB.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum A380ThrustLeverRating {
    #[default]
    Normal = 0,
    Idle = 1,
    Climb = 3,
}
impl A380ThrustLeverRating {
    pub fn of(lever_lost: bool, on_ground: bool) -> Self {
        match (lever_lost, on_ground) {
            (false, _) => A380ThrustLeverRating::Normal,
            (true, true) => A380ThrustLeverRating::Idle,
            (true, false) => A380ThrustLeverRating::Climb,
        }
    }

    pub fn fadec_tla_deg(&self, lever_tla_deg: f64) -> f64 {
        match self {
            A380ThrustLeverRating::Normal => lever_tla_deg,
            A380ThrustLeverRating::Idle => IDLE_TLA_DEG,
            A380ThrustLeverRating::Climb => CLB_TLA_DEG,
        }
    }
}

/// The FADEC of one engine: its failures, its thrust lever and the TLA it uses.
struct A380EngineControl {
    network_link: Failure,
    system_fault: Failure,
    overheat: Failure,
    thrust_lever_resolvers: Failure,
    fadec_tla: FadecThrustLeverAngle,

    lever_tla_id: VariableIdentifier,
    fadec_fault_id: VariableIdentifier,
    fadec_system_fault_id: VariableIdentifier,
    fadec_high_temperature_id: VariableIdentifier,
    thrust_lever_fault_id: VariableIdentifier,
    thrust_lever_rating_id: VariableIdentifier,

    lever_tla_deg: f64,
    rating: A380ThrustLeverRating,
}
impl A380EngineControl {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            network_link: Failure::new(FailureType::FadecNetworkLink(engine_number)),
            system_fault: Failure::new(FailureType::FadecSystem(engine_number)),
            overheat: Failure::new(FailureType::FadecOverheat(engine_number)),
            thrust_lever_resolvers: Failure::new(FailureType::ThrustLeverResolvers(engine_number)),
            fadec_tla: FadecThrustLeverAngle::new(context, engine_number),
            lever_tla_id: context.get_identifier(format!("AUTOTHRUST_TLA:{}", engine_number)),
            fadec_fault_id: context.get_identifier(format!("ENGINE_{}_FADEC_FAULT", engine_number)),
            fadec_system_fault_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_SYS_FAULT", engine_number)),
            fadec_high_temperature_id: context
                .get_identifier(format!("ENGINE_{}_FADEC_HI_TEMP", engine_number)),
            thrust_lever_fault_id: context
                .get_identifier(format!("ENGINE_{}_THR_LEVER_FAULT", engine_number)),
            thrust_lever_rating_id: context
                .get_identifier(format!("ENGINE_{}_THR_LEVER_RATING", engine_number)),
            lever_tla_deg: 0.,
            rating: A380ThrustLeverRating::Normal,
        }
    }

    /// `reverser`: the reverser of this engine (engines 2 and 3), None for engines 1 and 4.
    fn update(&mut self, on_ground: bool, reverser: Option<&A380ReverserMonitoring>) {
        self.rating = A380ThrustLeverRating::of(self.thrust_lever_resolvers.is_active(), on_ground);
        let lever_rule_tla = self.rating.fadec_tla_deg(self.lever_tla_deg);

        let (fadec_tla, reverser_idle) = match reverser {
            Some(reverser) => (
                apply_auto_idle(
                    limit_reverse_thrust_until_deployed(
                        lever_rule_tla,
                        reverser.fully_deployed,
                        REVERSE_IDLE_TLA_DEG,
                    ),
                    reverser.unlocked,
                ),
                reverser.unlocked,
            ),
            None => (lever_rule_tla, false),
        };
        let auto_idle = reverser_idle || self.rating == A380ThrustLeverRating::Idle;

        self.fadec_tla.set(self.lever_tla_deg, fadec_tla, auto_idle);
    }

    fn lever_lost(&self) -> bool {
        self.thrust_lever_resolvers.is_active()
    }
}
impl SimulationElement for A380EngineControl {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.network_link.accept(visitor);
        self.system_fault.accept(visitor);
        self.overheat.accept(visitor);
        self.thrust_lever_resolvers.accept(visitor);
        self.fadec_tla.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.lever_tla_deg = reader.read(&self.lever_tla_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fadec_fault_id, self.network_link.is_active());
        writer.write(&self.fadec_system_fault_id, self.system_fault.is_active());
        writer.write(&self.fadec_high_temperature_id, self.overheat.is_active());
        writer.write(&self.thrust_lever_fault_id, self.lever_lost());
        writer.write(&self.thrust_lever_rating_id, self.rating as u8 as f64);
    }
}

/// The FADEC, thrust lever and reverser failures of the four engines.
pub struct A380EngineControlFailures {
    engines: [A380EngineControl; 4],
}
impl A380EngineControlFailures {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2, 3, 4].map(|number| A380EngineControl::new(context, number)),
        }
    }

    /// After the reversers, whose status the FADECs of engines 2 and 3 monitor.
    pub fn update(
        &mut self,
        _context: &UpdateContext,
        on_ground: bool,
        reversers: [A380ReverserMonitoring; 2],
    ) {
        for (index, engine) in self.engines.iter_mut().enumerate() {
            let reverser = match index {
                1 => Some(&reversers[0]),
                2 => Some(&reversers[1]),
                _ => None,
            };
            engine.update(on_ground, reverser);
        }
    }

    /// The FADECs of engines 2 and 3 no longer command their reverser (thrust lever fault).
    pub fn reversers_deployment_inhibited(&self) -> [bool; 2] {
        [self.engines[1].lever_lost(), self.engines[2].lever_lost()]
    }
}
impl SimulationElement for A380EngineControlFailures {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };

    struct TestAircraft {
        engine_control: A380EngineControlFailures,
        on_ground: bool,
        reversers: [A380ReverserMonitoring; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_control: A380EngineControlFailures::new(context),
                on_ground: false,
                reversers: [A380ReverserMonitoring::default(); 2],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.engine_control
                .update(context, self.on_ground, self.reversers);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.engine_control.accept(visitor);
            visitor.visit(self);
        }
    }

    fn read_bool(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    fn read_f64(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> f64 {
        test_bed.read_by_name(name)
    }

    fn test_bed(on_ground: bool, lever_tla_deg: f64) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| a.on_ground = on_ground);
        for engine in 1..=4 {
            test_bed.write_by_name(&format!("AUTOTHRUST_TLA:{}", engine), lever_tla_deg);
        }
        test_bed
    }

    /// The TLA the FADEC of the engine uses when it overrides the lever
    fn override_tla(test_bed: &mut SimulationTestBed<TestAircraft>, engine: usize) -> Option<f64> {
        if read_bool(
            test_bed,
            &format!("ENGINE_{}_FADEC_TLA_OVERRIDE_ACTIVE", engine),
        ) {
            Some(read_f64(
                test_bed,
                &format!("ENGINE_{}_FADEC_TLA_OVERRIDE", engine),
            ))
        } else {
            None
        }
    }

    #[test]
    fn no_override_without_failure() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.run();
        for engine in 1..=4 {
            assert_eq!(override_tla(&mut test_bed, engine), None);
        }
    }

    #[test]
    fn thrust_lever_fault_is_clb_only_in_flight_and_idle_only_on_ground() {
        let mut test_bed = test_bed(false, 45.);
        test_bed.fail(FailureType::ThrustLeverResolvers(4));
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed, 4), Some(CLB_TLA_DEG));
        assert_eq!(read_f64(&mut test_bed, "ENGINE_4_THR_LEVER_RATING"), 3.);
        assert!(read_bool(&mut test_bed, "ENGINE_4_THR_LEVER_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_4_FADEC_AUTO_IDLE"));

        test_bed.command(|a| a.on_ground = true);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed, 4), Some(IDLE_TLA_DEG));
        assert_eq!(read_f64(&mut test_bed, "ENGINE_4_THR_LEVER_RATING"), 1.);
        assert!(read_bool(&mut test_bed, "ENGINE_4_FADEC_AUTO_IDLE"));
    }

    #[test]
    fn thrust_lever_fault_of_engine_2_or_3_inhibits_its_reverser() {
        let mut test_bed = test_bed(true, 0.);
        test_bed.fail(FailureType::ThrustLeverResolvers(3));
        test_bed.run();
        assert_eq!(
            test_bed.query(|a| a.engine_control.reversers_deployment_inhibited()),
            [false, true]
        );
        test_bed.fail(FailureType::ThrustLeverResolvers(1));
        test_bed.run();
        assert_eq!(
            test_bed.query(|a| a.engine_control.reversers_deployment_inhibited()),
            [false, true]
        );
    }

    #[test]
    fn reverse_thrust_of_engines_2_and_3_waits_for_the_deployed_reverser() {
        let mut test_bed = test_bed(true, -20.);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed, 2), Some(REVERSE_IDLE_TLA_DEG));
        assert_eq!(override_tla(&mut test_bed, 3), Some(REVERSE_IDLE_TLA_DEG));
        test_bed.command(|a| a.reversers[1].fully_deployed = true);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed, 2), Some(REVERSE_IDLE_TLA_DEG));
        assert_eq!(override_tla(&mut test_bed, 3), None);
    }

    #[test]
    fn unlocked_reverser_sets_its_engine_at_idle() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.command(|a| a.reversers[0].unlocked = true);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed, 2), Some(IDLE_TLA_DEG));
        assert!(read_bool(&mut test_bed, "ENGINE_2_FADEC_AUTO_IDLE"));
        assert_eq!(override_tla(&mut test_bed, 3), None);
        assert!(!read_bool(&mut test_bed, "ENGINE_3_FADEC_AUTO_IDLE"));
    }

    #[test]
    fn fadec_failures_are_written() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.fail(FailureType::FadecNetworkLink(1));
        test_bed.fail(FailureType::FadecSystem(2));
        test_bed.fail(FailureType::FadecOverheat(4));
        test_bed.run();
        assert!(read_bool(&mut test_bed, "ENGINE_1_FADEC_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_2_FADEC_FAULT"));
        assert!(read_bool(&mut test_bed, "ENGINE_2_FADEC_SYS_FAULT"));
        assert!(read_bool(&mut test_bed, "ENGINE_4_FADEC_HI_TEMP"));
        // a FADEC that cannot communicate still controls its engine from the lever
        assert_eq!(override_tla(&mut test_bed, 1), None);
    }
}
