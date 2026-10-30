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
//!   (DSC-70-70 l.63304-63321, ENG 1(2) REVERSE UNLOCKED l.80888-80889), and the idle protection
//!   for the reverser feedback position (15 % / 78 %, [`ReverserIdleProtection`]).
//! - The loss of the Engine Interface Unit (ENG 1(2) EIU FAULT, `engine_interface_unit`): no
//!   reverser, and the slats position replaced by the Mach number ([`FadecApproachConfiguration`]).
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
    /// The FLAPS lever position (0 to 4).
    pub flaps_lever_position: f64,
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
///   with slats extended" (below M 0.47 without the EIU, see [`FadecApproachConfiguration`]).
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
    /// The least FLAPS lever position flown since the detection: the slats extend for the approach
    /// only beyond it, not for the configuration of the takeoff.
    least_flaps_lever_in_flight: f64,
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
            self.least_flaps_lever_in_flight = 0.;
            return;
        }
        let detected_now = self.rating == ThrustLeverRating::Normal;
        if detected_now {
            self.least_flaps_lever_in_flight = conditions.flaps_lever_position;
        } else if !conditions.on_ground {
            self.least_flaps_lever_in_flight = self
                .least_flaps_lever_in_flight
                .min(conditions.flaps_lever_position);
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
                // ground is idle power only; in flight the slats extending beyond the flown configuration
                // are the approach
                let extends_for_approach = conditions.slats_extended
                    && conditions.flaps_lever_position > self.least_flaps_lever_in_flight + 0.5;
                if conditions.on_ground || extends_for_approach {
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

/// The idle protection of the FADEC for the thrust reverser position. A320 FCOM DSC-70-70 PROTECTION
/// (a320_fcom.txt l.63311-63318): "The FADEC will automatically select the thrust to idle:
/// - In case of inadvertent thrust reverser deployment (while thrust reversers are commanded stowed),
///   as soon as the thrust reverser feedback position is above 15 % deployed (thrust decreasing
///   toward idle, when the detected position is between 10 % and 15 %).
/// - In case of inadvertent thrust reverser stowage (while thrust reversers are commanded deployed),
///   as soon as the thrust reverser feedback position is below 78 % deployed (thrust decreasing toward
///   idle between 90 % and 78 %)."
///
/// "Before deployment is completed, the FADEC sets reverse idle thrust" (l.63302-63303,
/// `limit_reverse_thrust_until_deployed`): the stowage protection applies to a completed deployment
/// (all doors deployed once under the deploy order), until the deploy order ends. Design choice: the
/// thrust decreases linearly with the thrust lever angle between the two positions.
#[derive(Default)]
struct ReverserIdleProtection {
    /// The reverser has been fully deployed since its deploy order.
    deployment_completed: bool,
}
impl ReverserIdleProtection {
    /// Commanded stowed: full thrust up to 10 % deployed, idle from 15 %.
    const STOWED_FULL_THRUST_MAX_POSITION: f64 = 0.10;
    const STOWED_IDLE_POSITION: f64 = 0.15;
    /// Commanded deployed: full reverse thrust from 90 % deployed, reverse idle below 78 %.
    const DEPLOYED_FULL_THRUST_MIN_POSITION: f64 = 0.90;
    const DEPLOYED_IDLE_POSITION: f64 = 0.78;

    fn update(&mut self, reverser: &A320ReverserMonitoring) {
        self.deployment_completed =
            reverser.deploy_commanded && (self.deployment_completed || reverser.fully_deployed);
    }

    fn deployment_completed(&self) -> bool {
        self.deployment_completed
    }

    /// From 0 at `start` to 1 at `end`, clamped.
    fn ramp(value: f64, start: f64, end: f64) -> f64 {
        ((value - start) / (end - start)).clamp(0., 1.)
    }

    /// The share of the lever thrust the FADEC allows: 1 the full lever thrust, 0 (reverse) idle.
    fn thrust_ratio(&self, reverser: &A320ReverserMonitoring) -> f64 {
        if !reverser.deploy_commanded {
            1. - Self::ramp(
                reverser.position,
                Self::STOWED_FULL_THRUST_MAX_POSITION,
                Self::STOWED_IDLE_POSITION,
            )
        } else if self.deployment_completed {
            Self::ramp(
                reverser.position,
                Self::DEPLOYED_IDLE_POSITION,
                Self::DEPLOYED_FULL_THRUST_MIN_POSITION,
            )
        } else {
            // the deployment is not completed: reverse idle, see limit_reverse_thrust_until_deployed
            1.
        }
    }

    /// The TLA the FADEC uses: forward thrust (commanded stowed) toward idle, reverse thrust
    /// (commanded deployed) toward reverse idle.
    fn limit_tla(&self, tla_deg: f64, reverser: &A320ReverserMonitoring) -> f64 {
        let ratio = self.thrust_ratio(reverser);
        if !reverser.deploy_commanded && tla_deg > IDLE_TLA_DEG {
            IDLE_TLA_DEG + (tla_deg - IDLE_TLA_DEG) * ratio
        } else if reverser.deploy_commanded && tla_deg < REVERSE_IDLE_TLA_DEG {
            REVERSE_IDLE_TLA_DEG + (tla_deg - REVERSE_IDLE_TLA_DEG) * ratio
        } else {
            tla_deg
        }
    }
}

/// The approach configuration the thrust lever failure rules of the FADEC use: the slats position,
/// which the FADEC receives through its EIU. Without the EIU the FADEC uses the Mach number: the
/// approach below M 0.47, the slats retracted above M 0.55, the last state in between.
#[derive(Default)]
struct FadecApproachConfiguration {
    below_approach_mach: bool,
}
impl FadecApproachConfiguration {
    const APPROACH_BELOW_MACH: f64 = 0.47;
    const SLATS_RETRACTED_ABOVE_MACH: f64 = 0.55;

    fn update(&mut self, mach: f64) {
        if mach < Self::APPROACH_BELOW_MACH {
            self.below_approach_mach = true;
        } else if mach > Self::SLATS_RETRACTED_ABOVE_MACH {
            self.below_approach_mach = false;
        }
    }

    fn slats_extended(&self, eiu_operative: bool, slats_extended: bool) -> bool {
        if eiu_operative {
            slats_extended
        } else {
            self.below_approach_mach
        }
    }
}

/// The FADEC of one engine: its channels, its thrust lever and the TLA it uses.
struct A320EngineControl {
    fadec_channels: FadecChannels,
    /// The idle protection for the reverser position
    reverser_idle_protection: ReverserIdleProtection,
    /// flyPad "Thrust lever N resolvers (both)" and "Thrust lever N resolver disagree"
    thrust_lever_resolvers: Failure,
    thrust_lever_disagree: Failure,
    thrust_lever: A320ThrustLeverFailure,
    fadec_tla: FadecThrustLeverAngle,
    approach_configuration: FadecApproachConfiguration,
    eiu_operative: bool,

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
            reverser_idle_protection: ReverserIdleProtection::default(),
            thrust_lever_resolvers: Failure::new(FailureType::ThrustLeverResolvers(engine_number)),
            thrust_lever_disagree: Failure::new(FailureType::ThrustLeverResolverDisagree(
                engine_number,
            )),
            thrust_lever: A320ThrustLeverFailure::default(),
            fadec_tla: FadecThrustLeverAngle::new(context, engine_number),
            approach_configuration: FadecApproachConfiguration::default(),
            eiu_operative: true,
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
        flaps_lever_position: f64,
        mach: f64,
        flex_active: bool,
        eiu_operative: bool,
        reverser: &A320ReverserMonitoring,
    ) {
        self.eiu_operative = eiu_operative;
        self.approach_configuration.update(mach);
        let slats_extended = self
            .approach_configuration
            .slats_extended(eiu_operative, flaps_lever_position > 0.5);
        // Without the EIU the Mach substitute stands for the slats, which the lever alone does not show.
        let flaps_lever_position = if slats_extended {
            flaps_lever_position.max(1.)
        } else {
            flaps_lever_position
        };
        self.thrust_lever.update(
            self.thrust_lever_resolvers.is_active(),
            self.thrust_lever_disagree.is_active(),
            &ThrustLeverConditions {
                lever_tla_deg: self.lever_tla_deg,
                on_ground,
                slats_extended,
                flaps_lever_position,
                flex_active,
            },
        );

        let lever_rule_tla = self.thrust_lever.fadec_tla_deg(self.lever_tla_deg);
        self.reverser_idle_protection.update(reverser);
        // Reverse idle until the deployment is completed; afterwards the position protection.
        let reverse_limited_tla = limit_reverse_thrust_until_deployed(
            lever_rule_tla,
            reverser.fully_deployed || self.reverser_idle_protection.deployment_completed(),
            REVERSE_IDLE_TLA_DEG,
        );
        let reverse_limited_tla = self
            .reverser_idle_protection
            .limit_tla(reverse_limited_tla, reverser);
        // ENG 1(2) REVERSE UNLOCKED: "ENG 1(2) AT IDLE ... Only displayed, if the FADEC
        // automatically sets the engine at idle (i.e. when 4 reverser doors are not stowed ...)"
        // (l.80887-80889): the unlocked failure unlocks the four doors.
        let reverser_idle = reverser.unlocked;
        let fadec_tla = apply_auto_idle(reverse_limited_tla, reverser_idle);
        let auto_idle = reverser_idle || self.thrust_lever.rating() == ThrustLeverRating::Idle;

        self.fadec_tla.set(self.lever_tla_deg, fadec_tla, auto_idle);
    }

    /// The FADEC no longer commands the reverser: thrust lever fault, both channels lost or the EIU
    /// lost.
    fn reverser_deployment_inhibited(&self) -> bool {
        self.thrust_lever.lever_lost()
            || self.fadec_channels.both_channels_lost()
            || !self.eiu_operative
    }

    /// A malfunction of the thrust control, for the ENG FAULT light (FCOM DSC-70-90-20,
    /// l.63949-63950: "There is a malfunction of the thrust control"). Design choice: the loss of
    /// both FADEC channels (ENG 1(2) FADEC FAULT) or of both thrust lever resolvers (ENG 1(2) THR
    /// LEVER FAULT); a resolver disagree, which the FADEC manages, is none.
    fn thrust_control_malfunction(&self) -> bool {
        self.thrust_lever_resolvers.is_active() || self.fadec_channels.both_channels_lost()
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

    /// After the hydraulic system, whose reversers the FADECs monitor. `eius_operative`: per
    /// engine, the EIU sends the aircraft data to the FADEC.
    pub fn update(
        &mut self,
        context: &UpdateContext,
        on_ground: bool,
        reversers: [A320ReverserMonitoring; 2],
        eius_operative: [bool; 2],
    ) {
        let flex_active = (self.thrust_limit_type - THRUST_LIMIT_TYPE_FLEX).abs() < 0.5;
        let mach = context.mach_number().0;
        for ((engine, reverser), eiu_operative) in self
            .engines
            .iter_mut()
            .zip(reversers.iter())
            .zip(eius_operative)
        {
            engine.update(
                on_ground,
                self.flaps_handle_index,
                mach,
                flex_active,
                eiu_operative,
                reverser,
            );
        }
    }

    /// Per engine, a malfunction of the thrust control (ENG FAULT light).
    pub fn thrust_control_malfunctions(&self) -> [bool; 2] {
        [
            self.engines[0].thrust_control_malfunction(),
            self.engines[1].thrust_control_malfunction(),
        ]
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
            flaps_lever_position: 0.,
            flex_active: false,
        }
    }

    fn takeoff_roll(lever_tla_deg: f64, flex_active: bool) -> ThrustLeverConditions {
        ThrustLeverConditions {
            lever_tla_deg,
            on_ground: true,
            slats_extended: true,
            flaps_lever_position: 1.,
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
            flaps_lever_position: 3.,
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
        // the slats are still out after the takeoff: not the approach
        lever.update(&initial_climb(25., false));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        assert_eq!(lever.fadec_tla_deg(25.), CLB_TLA_DEG);
    }

    #[test]
    fn disagree_after_takeoff_goes_to_idle_when_the_slats_extend_for_the_approach() {
        let mut lever = lever_disagree();
        lever.update(&takeoff_roll(45., false));
        lever.update(&initial_climb(45., false));
        lever.update(&initial_climb(25., false));
        lever.update(&cruise(25.));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        lever.update(&approach(25.));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        // definitive, even for a go-around
        lever.update(&cruise(45.));
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        assert_eq!(lever.fadec_tla_deg(45.), IDLE_TLA_DEG);
    }

    #[test]
    fn disagree_at_takeoff_goes_to_idle_when_the_flaps_extend_for_the_immediate_return() {
        let mut lever = lever_disagree();
        lever.update(&takeoff_roll(45., false));
        lever.update(&initial_climb(45., false));
        lever.update(&initial_climb(25., false));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        lever.update(&ThrustLeverConditions {
            slats_extended: true,
            flaps_lever_position: 2.,
            ..initial_climb(25., false)
        });
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
        assert_eq!(lever.fadec_tla_deg(0.), IDLE_TLA_DEG);
    }

    #[test]
    fn disagree_in_climb_goes_to_idle_at_touchdown() {
        let mut lever = lever_disagree();
        lever.update(&cruise(25.));
        assert_eq!(lever.rating(), ThrustLeverRating::Climb);
        lever.update(&ThrustLeverConditions {
            on_ground: true,
            ..cruise(25.)
        });
        assert_eq!(lever.rating(), ThrustLeverRating::Idle);
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
        eius_operative: [bool; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                engine_control: A320EngineControlFailures::new(context),
                on_ground: false,
                reversers: [A320ReverserMonitoring::default(); 2],
                eius_operative: [true; 2],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.engine_control.update(
                context,
                self.on_ground,
                self.reversers,
                self.eius_operative,
            );
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

    /// Sim test 2026-10-06 (s8_main1.log): reverser 1 failed (stays stowed), reverser 2 deployed.
    /// Each engine's reverse thrust waits for its own reverser only.
    #[test]
    fn each_engine_waits_for_its_own_reverser_only() {
        let mut test_bed = test_bed(true, -20.);
        test_bed.command(|a| a.reversers[1].fully_deployed = true);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), Some(REVERSE_IDLE_TLA_DEG));
        let engine_2_override: bool = test_bed.read_by_name("ENGINE_2_FADEC_TLA_OVERRIDE_ACTIVE");
        assert!(!engine_2_override, "engine 2 gets the full reverse lever");
    }

    /// Normal landing: both reversers deployed, both engines get the full reverse lever.
    #[test]
    fn normal_reverse_with_both_reversers_deployed_is_not_limited() {
        let mut test_bed = test_bed(true, -20.);
        test_bed.command(|a| {
            a.reversers[0].fully_deployed = true;
            a.reversers[1].fully_deployed = true;
        });
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);
        let engine_2_override: bool = test_bed.read_by_name("ENGINE_2_FADEC_TLA_OVERRIDE_ACTIVE");
        assert!(!engine_2_override);
    }

    fn assert_override_tla(test_bed: &mut SimulationTestBed<TestAircraft>, expected_deg: f64) {
        let tla = override_tla(test_bed).expect("the FADEC overrides the lever");
        assert!(
            (tla - expected_deg).abs() < 1e-6,
            "FADEC TLA {} instead of {}",
            tla,
            expected_deg
        );
    }

    /// FCOM DSC-70-70 IDLE PROTECTION (l.63313-63316): commanded stowed, idle above 15 % deployed, the
    /// thrust decreasing toward idle between 10 % and 15 %.
    #[test]
    fn forward_thrust_goes_to_idle_while_a_stowed_reverser_is_more_than_15_percent_deployed() {
        let mut test_bed = test_bed(false, 25.);
        test_bed.command(|a| a.reversers[0].position = 0.05);
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);

        test_bed.command(|a| a.reversers[0].position = 0.125);
        test_bed.run();
        assert_override_tla(&mut test_bed, 12.5);

        test_bed.command(|a| a.reversers[0].position = 0.2);
        test_bed.run();
        assert_override_tla(&mut test_bed, IDLE_TLA_DEG);
        let engine_2_override: bool = test_bed.read_by_name("ENGINE_2_FADEC_TLA_OVERRIDE_ACTIVE");
        assert!(!engine_2_override, "engine 2 keeps its lever");
    }

    /// FCOM DSC-70-70 IDLE PROTECTION (l.63317-63318): commanded deployed, idle below 78 % deployed, the
    /// thrust decreasing toward idle between 90 % and 78 %, once the deployment is completed (before it,
    /// reverse idle, l.63302-63303).
    #[test]
    fn reverse_thrust_goes_to_reverse_idle_when_a_deployed_reverser_stows_below_78_percent() {
        let mut test_bed = test_bed(true, -20.);
        test_bed.command(|a| {
            a.reversers[0].deploy_commanded = true;
            a.reversers[0].position = 0.5;
        });
        test_bed.run();
        assert_override_tla(&mut test_bed, REVERSE_IDLE_TLA_DEG);

        test_bed.command(|a| {
            a.reversers[0].fully_deployed = true;
            a.reversers[0].position = 1.;
        });
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);

        // the deployed reverser moves toward stowed while still commanded deployed
        test_bed.command(|a| {
            a.reversers[0].fully_deployed = false;
            a.reversers[0].position = 0.92;
        });
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);

        test_bed.command(|a| a.reversers[0].position = 0.84);
        test_bed.run();
        assert_override_tla(&mut test_bed, -13.);

        test_bed.command(|a| a.reversers[0].position = 0.75);
        test_bed.run();
        assert_override_tla(&mut test_bed, REVERSE_IDLE_TLA_DEG);
    }

    /// A normal stow after the landing (commanded stowed, lever at idle) is not limited; a lever set
    /// forward while the reverser is still stowing gets idle until it is almost stowed.
    #[test]
    fn a_new_deployment_waits_again_for_its_completion() {
        let mut test_bed = test_bed(true, -20.);
        test_bed.command(|a| {
            a.reversers[0].deploy_commanded = true;
            a.reversers[0].fully_deployed = true;
            a.reversers[0].position = 1.;
        });
        test_bed.run();
        // stow order: forward idle lever, the reverser stows
        test_bed.write_by_name("AUTOTHRUST_TLA:1", IDLE_TLA_DEG);
        test_bed.command(|a| {
            a.reversers[0].deploy_commanded = false;
            a.reversers[0].fully_deployed = false;
            a.reversers[0].position = 0.6;
        });
        test_bed.run();
        assert_eq!(override_tla(&mut test_bed), None);
        test_bed.write_by_name("AUTOTHRUST_TLA:1", 25.);
        test_bed.run();
        assert_override_tla(&mut test_bed, IDLE_TLA_DEG);

        // reverse again before the end of the stow, the reverser back at 92 %: reverse idle until the
        // new deployment is completed (all doors deployed)
        test_bed.write_by_name("AUTOTHRUST_TLA:1", -20.);
        test_bed.command(|a| {
            a.reversers[0].deploy_commanded = true;
            a.reversers[0].position = 0.92;
        });
        test_bed.run();
        assert_override_tla(&mut test_bed, REVERSE_IDLE_TLA_DEG);
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
    fn the_eiu_loss_inhibits_the_reverser_of_its_engine() {
        let mut test_bed = test_bed(true, 0.);
        test_bed.command(|a| a.eius_operative = [true, false]);
        test_bed.run();
        assert_eq!(
            test_bed.query(|a| a.engine_control.reversers_deployment_inhibited()),
            [false, true]
        );
    }

    #[test]
    fn without_its_eiu_the_fadec_takes_the_approach_from_the_mach_number() {
        let mut test_bed = test_bed(false, 10.);
        test_bed.command(|a| a.eius_operative = [false, true]);
        test_bed.write_by_name("AIRSPEED MACH", 0.78);
        test_bed.fail(FailureType::ThrustLeverResolvers(1));
        test_bed.run();
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 3.);

        // between M 0.55 and M 0.47 the FADEC keeps the slats retracted state
        test_bed.write_by_name("AIRSPEED MACH", 0.50);
        test_bed.run();
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 3.);

        // below M 0.47, the approach although the slats are retracted: idle
        test_bed.write_by_name("AIRSPEED MACH", 0.45);
        test_bed.run();
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 1.);
    }

    #[test]
    fn with_its_eiu_the_fadec_takes_the_approach_from_the_slats() {
        let mut test_bed = test_bed(false, 10.);
        test_bed.write_by_name("AIRSPEED MACH", 0.45);
        test_bed.fail(FailureType::ThrustLeverResolvers(1));
        test_bed.run();
        assert_eq!(read_f64(&mut test_bed, "ENGINE_1_THR_LEVER_RATING"), 3.);
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
