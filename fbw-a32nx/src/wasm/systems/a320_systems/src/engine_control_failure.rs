//! FADEC, thrust lever and thrust reverser failures of the A320 (engine failures stage A5): the
//! thrust lever angle the FADEC uses, and the FADEC status the FWC reads.
//!
//! Per engine:
//! - FADEC channels A and B, FADEC high temperature (shared `FadecChannels`). Both channels lost =
//!   ENG 1(2) FADEC FAULT: the engine indications are lost (A320 FCOM PRO-ABN-ENG, a320_fcom.txt
//!   l.79652-79653), the A/THR is lost ("Two FADECs operative" is an A/THR arming condition, DSC-22_30-90
//!   l.32672; the flight computer interface cuts the A/THR orders to that FADEC) and the reverser
//!   no longer deploys (DSC-70-70 l.63300: deployment "requires one FADEC channel"). Design choice:
//!   the engine keeps following its thrust lever, the FCOM gives no thrust change ("ENG (AFFECTED)
//!   PARAMETERS CHECK, IF ABN ENG OPERATION: ENG MASTER OFF", l.79640-79650).
//! - Thrust lever resolvers (ENG 1(2) THR LEVER FAULT, l.81792-81892) and resolver disagreement
//!   (ENG 1(2) THR LEVER DISAGREE, l.81668-81786): [`A320ThrustLeverFailure`].
//! - The reverse idle of a reverser deployment and the idle protection of an unlocked reverser
//!   (DSC-70-70 l.63304-63321, ENG 1(2) REVERSE UNLOCKED l.80888-80889).
//!
//! The result is the TLA the FADEC model uses (`ENGINE_n_FADEC_TLA_OVERRIDE*`, read by
//! fbw_a320 FlyByWireInterface through FadecFailureInputs.h).

use systems::{
    engine::engine_control_failure::{
        apply_auto_idle, limit_reverse_thrust_until_deployed, FadecChannels, FadecThrustLeverAngle,
    },
    failures::{Failure, FailureType},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

use crate::hydraulic::A320ReverserMonitoring;

/// The thrust lever angles (degrees) of the FADEC model (fbw_a320 FadecComputer): IDLE 0, CL 25,
/// FLX/MCT 35, TOGA 45; reverse idle is -6 (the model maps every TLA from 0 to -6 to reverse idle).
const IDLE_TLA_DEG: f64 = 0.;
const CLB_TLA_DEG: f64 = 25.;
const FLX_MCT_TLA_DEG: f64 = 35.;
const REVERSE_IDLE_TLA_DEG: f64 = -6.;
/// The FADEC model thrust limit type FLEX (A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE, athr_thrust_limit_type).
const THRUST_LIMIT_TYPE_FLEX: f64 = 3.;
/// A lever at or near a detent (the throttle mapping puts the lever exactly on the detent).
const DETENT_TOLERANCE_DEG: f64 = 0.5;

/// The engine rating the FADEC selects with a failed thrust lever, written as
/// `ENGINE_n_THR_LEVER_RATING` for the FWC.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum ThrustLeverRating {
    /// The lever works: the FADEC follows it.
    #[default]
    Normal = 0,
    /// Idle, definitively, "even for go around" (l.81858-81862).
    Idle = 1,
    /// TO or FLX TO frozen (l.81838-81840 FAULT, l.81693-81696 DISAGREE).
    TakeOff = 2,
    /// CLB in manual thrust, idle to CLB with the A/THR (l.81840-81845, l.81698-81704).
    Climb = 3,
}

/// What the FADEC knows about the flight when it detects a thrust lever failure.
#[derive(Clone, Copy, Debug)]
pub struct ThrustLeverConditions {
    /// The angle of the lever (the resolver that still works, for a disagreement).
    pub lever_tla_deg: f64,
    pub on_ground: bool,
    /// The slats are extended (FLAPS lever not at 0, as the FADEC model's approach idle input).
    pub slats_extended: bool,
    /// The FADEC selected FLX TO (a flexible takeoff temperature above TAT).
    pub flex_active: bool,
}

/// ENG 1(2) THR LEVER FAULT and ENG 1(2) THR LEVER DISAGREE: the engine rating the FADEC selects.
///
/// THR LEVER FAULT, "both resolvers on one thrust lever are failed" (l.81803):
/// - "Idle power is automatically selected by FADEC. If associated thrust reverser is already
///   deployed, FADEC commands restow." (l.81830-81831). Design choice: on the ground.
/// - In flight, from the lever position at the detection (l.81835-81845): "TO or FLEX: FADEC
///   freezes TO or FLEX TO thrust until slat retraction. At slat retraction it selects CLB thrust.
///   Between IDLE and MCT: in manual thrust setting mode, engine rating freezes at CLB, or IDLE
///   with slats extended" (the EIU Mach rule is not modelled: the EIU does not fail).
/// - "the FADEC will command idle thrust for the approach when slats are extended ... Thrust of
///   affected engine remains definitively at idle even for go around." (l.81856-81862).
///
/// THR LEVER DISAGREE, "a discrepancy between both resolvers of a thrust lever" (l.81679):
/// - On the ground, "ENG (AFFECTED) IDLE POWER ONLY", except "During take-off (if both TLA are
///   above IDLE): ... TO, FLX TO, or DRT TO thrust until thrust reduction, after which the maximum
///   available thrust is CLB" (l.81688-81696).
/// - In flight between idle and MCT with the slats retracted, "the FADEC selects the larger TLA
///   power limited to CLB" (l.81697-81700); idle for the approach, definitively (l.81714-81733).
///
/// Design choices (the sim has one lever, its two resolvers are not modelled):
/// - DISAGREE: the faulty resolver stays at the lever angle of the detection; the other one
///   follows the lever. "The larger TLA" is the larger of the two. "Thrust reduction" is the lever
///   set at or below the CL detent (on the ground: a rejected takeoff, the engine goes to idle).
/// - TO / FLX is a lever above the FLX/MCT detent, or in that detent with FLX TO selected.
/// - DISAGREE keeps reverse idle on the ground (its INOP SYS has no REVERSER, l.81769).
#[derive(Default)]
pub struct A320ThrustLeverFailure {
    lever_lost: bool,
    resolvers_disagree: bool,
    rating: ThrustLeverRating,
    /// The lever angle at the detection: the frozen TO/FLX angle, or the faulty resolver.
    tla_at_detection_deg: f64,
}
impl A320ThrustLeverFailure {
    /// Both resolvers failed: THR LEVER FAULT (it takes precedence over a disagreement).
    pub fn lever_lost(&self) -> bool {
        self.lever_lost
    }

    /// The resolvers disagree (and are not both failed): THR LEVER DISAGREE.
    pub fn resolvers_disagree(&self) -> bool {
        self.resolvers_disagree && !self.lever_lost
    }

    pub fn rating(&self) -> ThrustLeverRating {
        self.rating
    }

    fn is_takeoff_thrust(conditions: &ThrustLeverConditions) -> bool {
        conditions.lever_tla_deg > FLX_MCT_TLA_DEG + DETENT_TOLERANCE_DEG
            || (conditions.flex_active
                && conditions.lever_tla_deg >= FLX_MCT_TLA_DEG - DETENT_TOLERANCE_DEG)
    }

    fn is_thrust_reduction(conditions: &ThrustLeverConditions) -> bool {
        conditions.lever_tla_deg <= CLB_TLA_DEG + DETENT_TOLERANCE_DEG
    }

    fn rating_at_detection(&self, conditions: &ThrustLeverConditions) -> ThrustLeverRating {
        let takeoff = Self::is_takeoff_thrust(conditions);
        if conditions.on_ground {
            if self.resolvers_disagree() && takeoff {
                ThrustLeverRating::TakeOff
            } else {
                ThrustLeverRating::Idle
            }
        } else if takeoff {
            ThrustLeverRating::TakeOff
        } else if conditions.slats_extended {
            ThrustLeverRating::Idle
        } else {
            ThrustLeverRating::Climb
        }
    }

    /// `resolvers_lost`: both resolvers of the lever are failed; `resolvers_disagree`: they disagree.
    pub fn update(
        &mut self,
        resolvers_lost: bool,
        resolvers_disagree: bool,
        conditions: &ThrustLeverConditions,
    ) {
        self.lever_lost = resolvers_lost;
        self.resolvers_disagree = resolvers_disagree;
        if !self.lever_lost() && !self.resolvers_disagree() {
            self.rating = ThrustLeverRating::Normal;
            return;
        }

        self.rating = match self.rating {
            ThrustLeverRating::Normal => {
                self.tla_at_detection_deg = conditions.lever_tla_deg;
                self.rating_at_detection(conditions)
            }
            ThrustLeverRating::TakeOff => {
                let leaves_takeoff = if self.lever_lost() {
                    // "until slat retraction"
                    !conditions.on_ground && !conditions.slats_extended
                } else {
                    // "until thrust reduction"
                    Self::is_thrust_reduction(conditions)
                };
                if !leaves_takeoff {
                    ThrustLeverRating::TakeOff
                } else if conditions.on_ground {
                    ThrustLeverRating::Idle
                } else {
                    ThrustLeverRating::Climb
                }
            }
            ThrustLeverRating::Climb => {
                // "idle thrust for the approach when slats are extended"
                if !conditions.on_ground && conditions.slats_extended {
                    ThrustLeverRating::Idle
                } else {
                    ThrustLeverRating::Climb
                }
            }
            ThrustLeverRating::Idle => ThrustLeverRating::Idle,
        };
    }

    /// The TLA the FADEC uses for this lever.
    pub fn fadec_tla_deg(&self, lever_tla_deg: f64) -> f64 {
        match self.rating {
            ThrustLeverRating::Normal => lever_tla_deg,
            ThrustLeverRating::TakeOff => self.tla_at_detection_deg,
            ThrustLeverRating::Climb => {
                if self.lever_lost() {
                    CLB_TLA_DEG
                } else {
                    lever_tla_deg
                        .max(self.tla_at_detection_deg)
                        .clamp(IDLE_TLA_DEG, CLB_TLA_DEG)
                }
            }
            ThrustLeverRating::Idle => {
                if self.resolvers_disagree() && lever_tla_deg < 0. {
                    REVERSE_IDLE_TLA_DEG
                } else {
                    IDLE_TLA_DEG
                }
            }
        }
    }
}
/// The FADEC of one engine: its channels, its thrust lever and the TLA it uses.
struct A320EngineControl {
    fadec_channels: FadecChannels,
    /// flyPad "Thrust lever N resolvers (both)" and "Thrust lever N resolver disagree"
    thrust_lever_resolvers: Failure,
    thrust_lever_disagree: Failure,
    thrust_lever: A320ThrustLeverFailure,
    fadec_tla: FadecThrustLeverAngle,

    lever_tla_id: VariableIdentifier,
    thrust_lever_fault_id: VariableIdentifier,
    thrust_lever_disagree_id: VariableIdentifier,
    thrust_lever_rating_id: VariableIdentifier,

    lever_tla_deg: f64,
}
impl A320EngineControl {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            fadec_channels: FadecChannels::new(context, engine_number),
            thrust_lever_resolvers: Failure::new(FailureType::ThrustLeverResolvers(engine_number)),
            thrust_lever_disagree: Failure::new(FailureType::ThrustLeverResolverDisagree(
                engine_number,
            )),
            thrust_lever: A320ThrustLeverFailure::default(),
            fadec_tla: FadecThrustLeverAngle::new(context, engine_number),
            lever_tla_id: context.get_identifier(format!("AUTOTHRUST_TLA:{}", engine_number)),
            thrust_lever_fault_id: context
                .get_identifier(format!("ENGINE_{}_THR_LEVER_FAULT", engine_number)),
            thrust_lever_disagree_id: context
                .get_identifier(format!("ENGINE_{}_THR_LEVER_DISAGREE", engine_number)),
            thrust_lever_rating_id: context
                .get_identifier(format!("ENGINE_{}_THR_LEVER_RATING", engine_number)),
            lever_tla_deg: 0.,
        }
    }

    fn update(
        &mut self,
        on_ground: bool,
        slats_extended: bool,
        flex_active: bool,
        reverser: &A320ReverserMonitoring,
    ) {
        self.thrust_lever.update(
            self.thrust_lever_resolvers.is_active(),
            self.thrust_lever_disagree.is_active(),
            &ThrustLeverConditions {
                lever_tla_deg: self.lever_tla_deg,
                on_ground,
                slats_extended,
                flex_active,
            },
        );

        let lever_rule_tla = self.thrust_lever.fadec_tla_deg(self.lever_tla_deg);
        let reverse_limited_tla = limit_reverse_thrust_until_deployed(
            lever_rule_tla,
            reverser.fully_deployed,
            REVERSE_IDLE_TLA_DEG,
        );
        // ENG 1(2) REVERSE UNLOCKED: "ENG 1(2) AT IDLE ... Only displayed, if the FADEC
        // automatically sets the engine at idle (i.e. when 4 reverser doors are not stowed ...)"
        // (l.80887-80889): the unlocked failure unlocks the four doors.
        let reverser_idle = reverser.unlocked;
        let fadec_tla = apply_auto_idle(reverse_limited_tla, reverser_idle);
        let auto_idle = reverser_idle || self.thrust_lever.rating() == ThrustLeverRating::Idle;

        self.fadec_tla.set(self.lever_tla_deg, fadec_tla, auto_idle);
    }

    /// The FADEC no longer commands the reverser: thrust lever fault or both channels lost.
    fn reverser_deployment_inhibited(&self) -> bool {
        self.thrust_lever.lever_lost() || self.fadec_channels.both_channels_lost()
    }
}
impl SimulationElement for A320EngineControl {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fadec_channels.accept(visitor);
        self.thrust_lever_resolvers.accept(visitor);
        self.thrust_lever_disagree.accept(visitor);
        self.fadec_tla.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.lever_tla_deg = reader.read(&self.lever_tla_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.thrust_lever_fault_id, self.thrust_lever.lever_lost());
        writer.write(
            &self.thrust_lever_disagree_id,
            self.thrust_lever.resolvers_disagree(),
        );
        writer.write(
            &self.thrust_lever_rating_id,
            self.thrust_lever.rating() as u8 as f64,
        );
    }
}

/// The FADEC, thrust lever and reverser failures of both engines.
pub struct A320EngineControlFailures {
    engines: [A320EngineControl; 2],

    flaps_handle_index_id: VariableIdentifier,
    thrust_limit_type_id: VariableIdentifier,

    flaps_handle_index: f64,
    thrust_limit_type: f64,
}
impl A320EngineControlFailures {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2].map(|number| A320EngineControl::new(context, number)),
            flaps_handle_index_id: context.get_identifier("FLAPS_HANDLE_INDEX".to_owned()),
            thrust_limit_type_id: context.get_identifier("AUTOTHRUST_THRUST_LIMIT_TYPE".to_owned()),
            flaps_handle_index: 0.,
            thrust_limit_type: 0.,
        }
    }

    /// After the hydraulic system, whose reversers the FADECs monitor.
    pub fn update(
        &mut self,
        _context: &UpdateContext,
        on_ground: bool,
        reversers: [A320ReverserMonitoring; 2],
    ) {
        let slats_extended = self.flaps_handle_index > 0.5;
        let flex_active = (self.thrust_limit_type - THRUST_LIMIT_TYPE_FLEX).abs() < 0.5;
        for (engine, reverser) in self.engines.iter_mut().zip(reversers.iter()) {
            engine.update(on_ground, slats_extended, flex_active, reverser);
        }
    }

    /// Per engine, the FADEC no longer commands a reverser deployment.
    pub fn reversers_deployment_inhibited(&self) -> [bool; 2] {
        [
            self.engines[0].reverser_deployment_inhibited(),
            self.engines[1].reverser_deployment_inhibited(),
        ]
    }
}
impl SimulationElement for A320EngineControlFailures {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.flaps_handle_index = reader.read(&self.flaps_handle_index_id);
        self.thrust_limit_type = reader.read(&self.thrust_limit_type_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };

    fn cruise(lever_tla_deg: f64) -> ThrustLeverConditions {
        ThrustLeverConditions {
            lever_tla_deg,
            on_ground: false,
            slats_extended: false,
            flex_active: false,
        }
    }

    fn takeoff_roll(lever_tla_deg: f64, flex_active: bool) -> ThrustLeverConditions {
        ThrustLeverConditions {
            lever_tla_deg,
            on_ground: true,
            slats_extended: true,
            flex_active,
        }
    }

    fn initial_climb(lever_tla_deg: f64, flex_active: bool) -> ThrustLeverConditions {
        ThrustLeverConditions {
            on_ground: false,
            ..takeoff_roll(lever_tla_deg, flex_active)
        }
    }

    fn approach(lever_tla_deg: f64) -> ThrustLeverConditions {
        ThrustLeverConditions {
            slats_extended: true,
            ..cruise(lever_tla_deg)
        }
    }

    /// A thrust lever with both resolvers lost (FAULT) or disagreeing (DISAGREE).
    struct FailedLever {
        lever: A320ThrustLeverFailure,
        lost: bool,
        disagree: bool,
    }
    impl FailedLever {
        fn update(&mut self, conditions: &ThrustLeverConditions) {
            self.lever.update(self.lost, self.disagree, conditions);
        }

        fn rating(&self) -> ThrustLeverRating {
            self.lever.rating()
        }

        fn fadec_tla_deg(&self, lever_tla_deg: f64) -> f64 {
            self.lever.fadec_tla_deg(lever_tla_deg)
        }
    }

    fn lever_fault() -> FailedLever {
        FailedLever {
            lever: A320ThrustLeverFailure::default(),
            lost: true,
            disagree: false,
        }
    }

    fn lever_disagree() -> FailedLever {
        FailedLever {
            lever: A320ThrustLeverFailure::default(),
            lost: false,
            disagree: true,
        }
    }

    #[test]
    fn a_working_lever_drives_the_fadec() {
        let mut lever = FailedLever {
            lever: A320ThrustLeverFailure::default(),
            lost: false,
            disagree: false,
        };
        lever.update(&cruise(18.));
        assert_eq!(lever.rating(), ThrustLeverRating::Normal);
        assert_eq!(lever.fadec_tla_deg(18.), 18.);
    }

    #[test]
    fn fault_in_cruise_freezes_clb_whatever_the_lever() {
        let mut lever = lever_fault();
        lever.update(&cruise(10.));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        assert_eq!(lever.fadec_tla_deg(0.), CLB_TLA_DEG);
        assert_eq!(lever.fadec_tla_deg(45.), CLB_TLA_DEG);
    }

    #[test]
    fn fault_at_takeoff_freezes_toga_until_slat_retraction_then_clb() {
        let mut lever = lever_fault();
        lever.update(&initial_climb(45., false));
        assert_eq!(lever.rating(), ThrustLeverRating::TakeOff);
        assert_eq!(lever.fadec_tla_deg(0.), 45.);
        lever.update(&initial_climb(25., false));
        assert_eq!(lever.fadec_tla_deg(25.), 45.);
        lever.update(&cruise(25.));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        assert_eq!(lever.fadec_tla_deg(25.), CLB_TLA_DEG);
    }

    #[test]
    fn fault_at_flex_takeoff_freezes_flex() {
        let mut lever = lever_fault();
        lever.update(&initial_climb(35., true));
        assert_eq!(lever.rating(), ThrustLeverRating::TakeOff);
        assert_eq!(lever.fadec_tla_deg(0.), 35.);
    }

    #[test]
    fn fault_at_mct_with_slats_retracted_is_clb() {
        let mut lever = lever_fault();
        lever.update(&cruise(35.));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
    }

    #[test]
    fn fault_with_slats_extended_is_idle() {
        let mut lever = lever_fault();
        lever.update(&approach(20.));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        assert_eq!(lever.fadec_tla_deg(45.), IDLE_TLA_DEG);
    }

    #[test]
    fn fault_goes_definitively_to_idle_at_slat_extension_even_for_go_around() {
        let mut lever = lever_fault();
        lever.update(&cruise(25.));
        lever.update(&approach(25.));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        // go around: lever TOGA, slats retracted later on
        lever.update(&approach(45.));
        lever.update(&cruise(45.));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        assert_eq!(lever.fadec_tla_deg(45.), IDLE_TLA_DEG);
    }

    #[test]
    fn fault_on_the_ground_is_idle_even_in_reverse() {
        let mut lever = lever_fault();
        lever.update(&takeoff_roll(45., false));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        assert_eq!(lever.fadec_tla_deg(-20.), IDLE_TLA_DEG);
    }

    #[test]
    fn clearing_the_failure_gives_the_lever_back() {
        let mut lever = lever_fault();
        lever.update(&approach(25.));
        lever.lost = false;
        lever.update(&approach(25.));
        assert_eq!(lever.rating(), ThrustLeverRating::Normal);
        assert_eq!(lever.fadec_tla_deg(25.), 25.);
    }

    #[test]
    fn disagree_in_cruise_takes_the_larger_resolver_limited_to_clb() {
        let mut lever = lever_disagree();
        lever.update(&cruise(15.));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        // the faulty resolver stays at 15 degrees
        assert_eq!(lever.fadec_tla_deg(5.), 15.);
        assert_eq!(lever.fadec_tla_deg(20.), 20.);
        assert_eq!(lever.fadec_tla_deg(45.), CLB_TLA_DEG);
    }

    #[test]
    fn disagree_during_takeoff_keeps_takeoff_thrust_until_thrust_reduction() {
        let mut lever = lever_disagree();
        lever.update(&takeoff_roll(45., false));
        assert_eq!(lever.rating(), ThrustLeverRating::TakeOff);
        lever.update(&initial_climb(45., false));
        assert_eq!(lever.fadec_tla_deg(45.), 45.);
        lever.update(&initial_climb(25., false));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
    }

    #[test]
    fn disagree_rejected_takeoff_goes_to_idle() {
        let mut lever = lever_disagree();
        lever.update(&takeoff_roll(35., true));
        assert_eq!(lever.rating(), ThrustLeverRating::TakeOff);
        lever.update(&takeoff_roll(0., true));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        // reverse idle stays available (no REVERSER in its INOP SYS)
        assert_eq!(lever.fadec_tla_deg(-20.), REVERSE_IDLE_TLA_DEG);
    }

    #[test]
    fn disagree_on_the_ground_at_taxi_thrust_is_idle_only() {
        let mut lever = lever_disagree();
        lever.update(&takeoff_roll(10., false));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
    }

    #[test]
    fn fault_takes_precedence_over_disagree() {
        let mut lever = lever_disagree();
        lever.lost = true;
        lever.update(&cruise(10.));
        assert!(lever.lever.lever_lost());
        assert!(!lever.lever.resolvers_disagree());
    }

    // Element level: the variables the FWC and the flight computer interface read.

    struct TestAircraft {
        engine_control: A320EngineControlFailures,
        on_ground: bool,
        reversers: [A320ReverserMonitoring; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_control: A320EngineControlFailures::new(context),
                on_ground: false,
                reversers: [A320ReverserMonitoring::default(); 2],
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

    #[allow(dead_code)]
    fn read_f64(test_bed: &mut SimulationTestBed<TestAircraft>, name: &str) -> f64 {
        test_bed.read_by_name(name)
    }

    fn test_bed(on_ground: bool, lever_tla_deg: f64) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| a.on_ground = on_ground);
        test_bed.write_by_name("AUTOTHRUST_TLA:1", lever_tla_deg);
        test_bed.write_by_name("AUTOTHRUST_TLA:2", lever_tla_deg);
        test_bed
    }

    fn override_tla(test_bed: &mut SimulationTestBed<TestAircraft>) -> Option<f64> {
        if read_bool(test_bed, "ENGINE_1_FADEC_TLA_OVERRIDE_ACTIVE") {
            Some(read_f64(test_bed, "ENGINE_1_FADEC_TLA_OVERRIDE"))
        } else {
            None
        }
    }

    #[test]
    fn no_override_without_failure() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);
        assert!(!read_bool(&mut test_bed, "ENGINE_1_FADEC_AUTO_IDLE"));
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 0.);
    }

    #[test]
    fn reverse_thrust_waits_for_the_deployed_reverser() {
        let mut test_bed = test_bed(true, -20.);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), Some(REVERSE_IDLE_TLA_DEG));
        test_bed.command(|a| a.reversers[0].fully_deployed = true);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);
    }

    #[test]
    fn unlocked_reverser_sets_the_engine_at_idle() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.command(|a| a.reversers[0].unlocked = true);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), Some(IDLE_TLA_DEG));
        assert!(read_bool(&mut test_bed, "ENGINE_1_FADEC_AUTO_IDLE"));
        assert!(!read_bool(&mut test_bed, "ENGINE_2_FADEC_AUTO_IDLE"));
    }

    #[test]
    fn thrust_lever_fault_in_cruise_writes_clb_and_inhibits_the_reverser() {
        let mut test_bed = test_bed(false, 10.);
        test_bed.fail(FailureType::ThrustLeverResolvers(1));
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), Some(CLB_TLA_DEG));
        assert!(read_bool(&mut test_bed, "ENGINE_1_THR_LEVER_FAULT"));
        assert!(!read_bool(&mut test_bed, "ENGINE_1_THR_LEVER_DISAGREE"));
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 3.);
        assert_eq!(
            test_bed.query(|a| a.engine_control.reversers_deployment_inhibited()),
            [true, false]
        );
    }

    #[test]
    fn thrust_lever_fault_at_slat_extension_is_auto_idle() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.fail(FailureType::ThrustLeverResolvers(2));
        test_bed.write_by_name("FLAPS_HANDLE_INDEX", 1.);
        test_bed.run();
        assert!(read_bool(&mut test_bed, "ENGINE_2_FADEC_AUTO_IDLE"));
        assert_eq!(read_f64(&mut test_bed, "ENGINE_2_THR_LEVER_RATING"), 1.);
    }

    #[test]
    fn thrust_lever_disagree_is_written() {
        let mut test_bed = test_bed(false, 10.);
        test_bed.fail(FailureType::ThrustLeverResolverDisagree(2));
        test_bed.run();
        assert!(read_bool(&mut test_bed, "ENGINE_2_THR_LEVER_DISAGREE"));
        assert!(!read_bool(&mut test_bed, "ENGINE_2_THR_LEVER_FAULT"));
    }

    #[test]
    fn both_fadec_channels_lost_inhibit_the_reverser() {
        let mut test_bed = test_bed(true, 0.);
        test_bed.fail(FailureType::FadecChannelA(2));
        test_bed.run();
        assert_eq!(
            test_bed.query(|a| a.engine_control.reversers_deployment_inhibited()),
            [false, false]
        );
        test_bed.fail(FailureType::FadecChannelB(2));
        test_bed.run();
        assert_eq!(
            test_bed.query(|a| a.engine_control.reversers_deployment_inhibited()),
            [false, true]
        );
        assert!(read_bool(&mut test_bed, "ENGINE_2_FADEC_FAULT"));
    }

    #[test]
    fn flex_detent_at_takeoff_is_flex_with_flex_selected() {
        let mut test_bed = test_bed(false, 35.);
        test_bed.write_by_name("AUTOTHRUST_THRUST_LIMIT_TYPE", THRUST_LIMIT_TYPE_FLEX);
        test_bed.write_by_name("FLAPS_HANDLE_INDEX", 1.);
        test_bed.fail(FailureType::ThrustLeverResolvers(1));
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None); // frozen at the lever angle: 35
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 2.);
        test_bed.write_by_name("AUTOTHRUST_TLA:1", 0.);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), Some(FLX_MCT_TLA_DEG));
    }
}
