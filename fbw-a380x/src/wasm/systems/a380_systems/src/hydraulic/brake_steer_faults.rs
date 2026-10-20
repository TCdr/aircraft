//! Braking and steering control faults of the A380: the Braking Control System (BCS), the Emergency Brake Control
//! Unit (EBCU) and the Steering Control System (SCS), with the nose wheel steering (NWS) hydraulic supply.
//!
//! Simplified model. The hydraulic model keeps one NORM brake circuit (GREEN) and one ALTN brake circuit (YELLOW and
//! one accumulator) for all the wheel groups, so a brake fault below acts on all the wheel groups at once (the aircraft
//! uses GREEN for the wing gears and YELLOW for the body gears in normal braking, and two LEHGS and four accumulators
//! in alternate braking).

use systems::{
    failures::{Failure, FailureType},
    shared::SectionPressure,
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};
use uom::si::{f64::*, pressure::psi};

/// The braking mode that the brake pedals command
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PedalBrakingMode {
    /// Normal braking: NORM circuit, A-SKID and AUTO BRK available
    Normal,
    /// Alternate braking under BCS control: ALTN circuit, A-SKID available
    Alternate,
    /// Emergency braking under EBCU control: ALTN circuit, no A-SKID, pressure limited
    Emergency,
    /// No pedal braking: the parking brake (ultimate braking) is the only braking (BRAKES PEDAL BRAKING FAULT)
    None,
}
impl From<PedalBrakingMode> for f64 {
    fn from(value: PedalBrakingMode) -> Self {
        match value {
            PedalBrakingMode::None => 0.,
            PedalBrakingMode::Normal => 1.,
            PedalBrakingMode::Alternate => 2.,
            PedalBrakingMode::Emergency => 3.,
        }
    }
}

/// The pressure law of the EBCU in emergency braking: 1 000 PSI at landing (landing brake law), 1 700 PSI for taxi-out
/// and take-off (take-off brake law).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EmergencyBrakeLaw {
    /// Taxi-out and take-off: 1 700 psi
    TakeOff,
    /// Landing (and the taxi-in after it): 1 000 psi
    Landing,
}
impl EmergencyBrakeLaw {
    const TAKE_OFF_LAW_PRESSURE_LIMIT_PSI: f64 = 1700.;
    const LANDING_LAW_PRESSURE_LIMIT_PSI: f64 = 1000.;

    /// The law at power-up: the landing law when the flight starts in the air, else the take-off law
    pub fn initial(starts_in_flight: bool) -> Self {
        if starts_in_flight {
            EmergencyBrakeLaw::Landing
        } else {
            EmergencyBrakeLaw::TakeOff
        }
    }

    /// The law after this update.
    /// - The PARK BRK handle ON on the ground reverts to the take-off law.
    /// - Design choice: the landing law is selected once the aircraft is airborne (main gears not compressed). No
    ///   switching point is published; after the lift-off the next braking is the landing.
    /// - Else the law does not change, so the landing law stays for the taxi-in until the PARK BRK handle is set ON.
    pub fn next(self, in_flight: bool, parking_brake_on: bool) -> Self {
        if in_flight {
            EmergencyBrakeLaw::Landing
        } else if parking_brake_on {
            EmergencyBrakeLaw::TakeOff
        } else {
            self
        }
    }

    pub fn pressure_limit(self) -> Pressure {
        Pressure::new::<psi>(match self {
            EmergencyBrakeLaw::TakeOff => Self::TAKE_OFF_LAW_PRESSURE_LIMIT_PSI,
            EmergencyBrakeLaw::Landing => Self::LANDING_LAW_PRESSURE_LIMIT_PSI,
        })
    }
}

/// Faults of the BCS normal braking, of the BCS alternate braking and of the EBCU (flyPad failures 32110-32112).
/// The BCS reports them to the FWS.
pub struct A380BrakingControlFaults {
    norm_brk_fault_id: VariableIdentifier,
    altn_brk_fault_id: VariableIdentifier,
    emer_brk_fault_id: VariableIdentifier,

    /// Normal hydraulic brake equipment failed on all the wheel groups (BRAKES NORM BRK FAULT)
    normal_braking_failure: Failure,
    /// Alternate braking failed on all the wheel groups (BRAKES ALTN BRK FAULT)
    alternate_braking_failure: Failure,
    /// EBCU failed (BRAKES EMER BRK FAULT)
    emergency_braking_failure: Failure,
}
impl A380BrakingControlFaults {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            norm_brk_fault_id: context.get_identifier("BRAKES_NORM_BRK_FAULT".to_owned()),
            altn_brk_fault_id: context.get_identifier("BRAKES_ALTN_BRK_FAULT".to_owned()),
            emer_brk_fault_id: context.get_identifier("BRAKES_EMER_BRK_FAULT".to_owned()),

            normal_braking_failure: Failure::new(FailureType::BrakeNormalBraking),
            alternate_braking_failure: Failure::new(FailureType::BrakeAlternateBraking),
            emergency_braking_failure: Failure::new(FailureType::BrakeEmergencyBraking),
        }
    }

    pub fn normal_braking_failed(&self) -> bool {
        self.normal_braking_failure.is_active()
    }

    /// The braking mode of the pedals, from the braking system reconfiguration:
    /// - A-SKID sw OFF: the EBCU takes over (emergency braking).
    ///   Design choice: the EBCU fault is not applied here; A-SKID OFF with the EBCU failed is not described, and the
    ///   model keeps the emergency pressure law instead of losing all pedal braking.
    /// - Normal braking while its hydraulic power is available and the normal equipment works.
    /// - Else alternate braking, if the BCS alternate braking works.
    /// - Else emergency braking, if the EBCU works (the normal and the alternate braking failed).
    /// - Else no pedal braking (normal, alternate and emergency braking all failed).
    ///
    /// Without anti-skid on all the landing gears (both BCS failed, or every gear group lost its anti-skid, see
    /// brake_anti_skid_faults.rs) the normal and the alternate braking are lost: the EBCU brakes.
    pub fn pedal_braking_mode(
        &self,
        normal_hydraulic_power_available: bool,
        anti_skid_on: bool,
        anti_skid_lost_on_all_gears: bool,
    ) -> PedalBrakingMode {
        Self::braking_mode(
            normal_hydraulic_power_available,
            anti_skid_on,
            self.normal_braking_failure.is_active() || anti_skid_lost_on_all_gears,
            self.alternate_braking_failure.is_active() || anti_skid_lost_on_all_gears,
            self.emergency_braking_failure.is_active(),
        )
    }

    fn braking_mode(
        normal_hydraulic_power_available: bool,
        anti_skid_on: bool,
        normal_failed: bool,
        alternate_failed: bool,
        emergency_failed: bool,
    ) -> PedalBrakingMode {
        if !anti_skid_on {
            PedalBrakingMode::Emergency
        } else if normal_hydraulic_power_available && !normal_failed {
            PedalBrakingMode::Normal
        } else if !alternate_failed {
            PedalBrakingMode::Alternate
        } else if !emergency_failed {
            PedalBrakingMode::Emergency
        } else {
            PedalBrakingMode::None
        }
    }
}
impl SimulationElement for A380BrakingControlFaults {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.normal_braking_failure.accept(visitor);
        self.alternate_braking_failure.accept(visitor);
        self.emergency_braking_failure.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.norm_brk_fault_id,
            self.normal_braking_failure.is_active(),
        );
        writer.write(
            &self.altn_brk_fault_id,
            self.alternate_braking_failure.is_active(),
        );
        writer.write(
            &self.emer_brk_fault_id,
            self.emergency_braking_failure.is_active(),
        );
    }
}

/// The hydraulic supply mode of the nose wheel steering
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoseWheelSteeringMode {
    /// No nose wheel steering: the nose wheels caster
    Off,
    /// Normal NWS: GREEN hydraulic system, 15 deg/s
    Normal,
    /// Alternate NWS: steering LEHGS and NWS accumulator, 10 deg/s
    Alternate,
}
impl From<NoseWheelSteeringMode> for f64 {
    fn from(value: NoseWheelSteeringMode) -> Self {
        match value {
            NoseWheelSteeringMode::Off => 0.,
            NoseWheelSteeringMode::Normal => 1.,
            NoseWheelSteeringMode::Alternate => 2.,
        }
    }
}

/// The two Steering Control Systems (SCS 1 and 2, one active and one backup) with the faults of the steering equipment
/// (flyPad failures 32200-32204). The SCS chooses the NWS mode and enables the body wheel steering (BWS); it reports
/// the faults to the FWS.
pub struct A380SteeringControlSystem {
    norm_nws_fault_id: VariableIdentifier,
    altn_nws_fault_id: VariableIdentifier,
    bws_fault_id: VariableIdentifier,
    scs_1_fault_id: VariableIdentifier,
    scs_2_fault_id: VariableIdentifier,
    nws_mode_id: VariableIdentifier,

    /// Normal NWS failed: the normal selector valve isolates the NWS from GREEN (STEER NORM N/W STEER FAULT)
    normal_nws_failure: Failure,
    /// Alternate NWS failed: the steering LEHGS failed (STEER ALTN N/W STEER FAULT)
    alternate_nws_failure: Failure,
    /// Body wheel steering failed in the centred and locked position (STEER B/W STEER FAULT)
    bws_failure: Failure,
    scs_1_failure: Failure,
    scs_2_failure: Failure,

    nose_wheel_steering_mode: NoseWheelSteeringMode,
}
impl A380SteeringControlSystem {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            norm_nws_fault_id: context.get_identifier("STEERING_NORM_NWS_FAULT".to_owned()),
            altn_nws_fault_id: context.get_identifier("STEERING_ALTN_NWS_FAULT".to_owned()),
            bws_fault_id: context.get_identifier("STEERING_BWS_FAULT".to_owned()),
            scs_1_fault_id: context.get_identifier("STEERING_SCS_1_FAULT".to_owned()),
            scs_2_fault_id: context.get_identifier("STEERING_SCS_2_FAULT".to_owned()),
            nws_mode_id: context.get_identifier("STEERING_NWS_MODE".to_owned()),

            normal_nws_failure: Failure::new(FailureType::NoseWheelSteeringNormal),
            alternate_nws_failure: Failure::new(FailureType::NoseWheelSteeringAlternate),
            bws_failure: Failure::new(FailureType::BodyWheelSteering),
            scs_1_failure: Failure::new(FailureType::SteeringControlSystem(1)),
            scs_2_failure: Failure::new(FailureType::SteeringControlSystem(2)),

            nose_wheel_steering_mode: NoseWheelSteeringMode::Off,
        }
    }

    /// Chooses the NWS mode.
    /// - No NWS with the engines shut down.
    /// - Normal NWS needs GREEN pressure; without it the alternate NWS takes over automatically.
    /// - Design choice: the steering LEHGS runs while an engine runs. It is documented as active with all engines
    ///   running, but the alternate NWS stays available with the GREEN system or the engines 1+2 lost (HYD G SYS PRESS
    ///   LO, TWO ENGS OUT).
    /// - Without both SCS, neither the NWS nor the BWS works (STEER N/W + B/W STEER FAULT).
    pub fn update(&mut self, green_pressurised: bool, any_engine_running: bool) {
        self.nose_wheel_steering_mode = Self::steering_mode(
            self.is_steering_controlled(),
            any_engine_running,
            green_pressurised,
            self.normal_nws_failure.is_active(),
            self.alternate_nws_failure.is_active(),
        );
    }

    fn steering_mode(
        steering_controlled: bool,
        any_engine_running: bool,
        green_pressurised: bool,
        normal_failed: bool,
        alternate_failed: bool,
    ) -> NoseWheelSteeringMode {
        if !steering_controlled || !any_engine_running {
            NoseWheelSteeringMode::Off
        } else if green_pressurised && !normal_failed {
            NoseWheelSteeringMode::Normal
        } else if !alternate_failed {
            NoseWheelSteeringMode::Alternate
        } else {
            NoseWheelSteeringMode::Off
        }
    }

    /// One SCS is enough: the backup SCS takes over when the active one fails
    fn is_steering_controlled(&self) -> bool {
        !(self.scs_1_failure.is_active() && self.scs_2_failure.is_active())
    }

    pub fn nose_wheel_steering_mode(&self) -> NoseWheelSteeringMode {
        self.nose_wheel_steering_mode
    }

    /// The BWS stays centred and locked when it is failed or not controlled
    pub fn is_body_wheel_steering_available(&self) -> bool {
        self.is_steering_controlled() && !self.bws_failure.is_active()
    }
}
impl SimulationElement for A380SteeringControlSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.normal_nws_failure.accept(visitor);
        self.alternate_nws_failure.accept(visitor);
        self.bws_failure.accept(visitor);
        self.scs_1_failure.accept(visitor);
        self.scs_2_failure.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.norm_nws_fault_id, self.normal_nws_failure.is_active());
        writer.write(
            &self.altn_nws_fault_id,
            self.alternate_nws_failure.is_active(),
        );
        writer.write(&self.bws_fault_id, self.bws_failure.is_active());
        writer.write(&self.scs_1_fault_id, self.scs_1_failure.is_active());
        writer.write(&self.scs_2_fault_id, self.scs_2_failure.is_active());
        writer.write(&self.nws_mode_id, f64::from(self.nose_wheel_steering_mode));
    }
}

/// The hydraulic pressure that reaches the NWS actuators: GREEN in normal NWS, the steering LEHGS in alternate NWS.
pub struct NoseWheelSteeringSupply {
    mode: NoseWheelSteeringMode,
    pressure: Pressure,
    pressure_downstream_leak_valve: Pressure,
    pressure_downstream_priority_valve: Pressure,
    pressure_switch_pressurised: bool,
}
impl NoseWheelSteeringSupply {
    /// Design choice: the steering LEHGS is modelled as a constant pressure. The NWS actuator speed scales with the
    /// square root of the pressure (15 deg/s at 4 000 psi and above, SteeringActuator), so 1 778 psi gives the maximum
    /// alternate NWS rate of 10 deg/s: 15 x sqrt(1 778 / 4 000) = 10.0 deg/s.
    const ALTERNATE_NWS_PRESSURE_PSI: f64 = 1778.;

    pub fn new() -> Self {
        Self {
            mode: NoseWheelSteeringMode::Off,
            pressure: Pressure::default(),
            pressure_downstream_leak_valve: Pressure::default(),
            pressure_downstream_priority_valve: Pressure::default(),
            pressure_switch_pressurised: false,
        }
    }

    pub fn update(&mut self, mode: NoseWheelSteeringMode, green_section: &impl SectionPressure) {
        self.mode = mode;
        match mode {
            NoseWheelSteeringMode::Normal => {
                self.pressure = green_section.pressure();
                self.pressure_downstream_leak_valve =
                    green_section.pressure_downstream_leak_valve();
                self.pressure_downstream_priority_valve =
                    green_section.pressure_downstream_priority_valve();
                self.pressure_switch_pressurised = green_section.is_pressure_switch_pressurised();
            }
            NoseWheelSteeringMode::Alternate => {
                let lehgs_pressure = Pressure::new::<psi>(Self::ALTERNATE_NWS_PRESSURE_PSI);
                self.pressure = lehgs_pressure;
                self.pressure_downstream_leak_valve = lehgs_pressure;
                self.pressure_downstream_priority_valve = lehgs_pressure;
                self.pressure_switch_pressurised = true;
            }
            NoseWheelSteeringMode::Off => {
                self.pressure = Pressure::default();
                self.pressure_downstream_leak_valve = Pressure::default();
                self.pressure_downstream_priority_valve = Pressure::default();
                self.pressure_switch_pressurised = false;
            }
        }
    }

    /// The NWS actuators take their fluid from GREEN only in normal NWS; the LEHGS has its own reservoir
    pub fn is_supplied_by_green(&self) -> bool {
        self.mode == NoseWheelSteeringMode::Normal
    }
}
impl SectionPressure for NoseWheelSteeringSupply {
    fn pressure(&self) -> Pressure {
        self.pressure
    }

    fn pressure_downstream_leak_valve(&self) -> Pressure {
        self.pressure_downstream_leak_valve
    }

    fn pressure_downstream_priority_valve(&self) -> Pressure {
        self.pressure_downstream_priority_valve
    }

    fn is_pressure_switch_pressurised(&self) -> bool {
        self.pressure_switch_pressurised
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pedals_use_normal_braking_with_normal_hydraulic_power() {
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, true, false, false, false),
            PedalBrakingMode::Normal
        );
    }

    #[test]
    fn normal_braking_fault_reverts_to_alternate_braking() {
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, true, true, false, false),
            PedalBrakingMode::Alternate
        );
    }

    #[test]
    fn normal_and_alternate_braking_faults_revert_to_emergency_braking() {
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, true, true, true, false),
            PedalBrakingMode::Emergency
        );
        // Without normal hydraulic power the same applies
        assert_eq!(
            A380BrakingControlFaults::braking_mode(false, true, false, true, false),
            PedalBrakingMode::Emergency
        );
    }

    #[test]
    fn all_three_braking_modes_failed_leave_no_pedal_braking() {
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, true, true, true, true),
            PedalBrakingMode::None
        );
    }

    #[test]
    fn a_skid_off_selects_emergency_braking() {
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, false, false, false, false),
            PedalBrakingMode::Emergency
        );
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, false, false, false, true),
            PedalBrakingMode::Emergency
        );
    }

    #[test]
    fn alternate_or_emergency_fault_alone_keeps_normal_braking() {
        assert_eq!(
            A380BrakingControlFaults::braking_mode(true, true, false, true, true),
            PedalBrakingMode::Normal
        );
    }

    #[test]
    fn emergency_brake_law_starts_with_take_off_law_on_the_ground_and_landing_law_in_flight() {
        assert_eq!(
            EmergencyBrakeLaw::initial(false),
            EmergencyBrakeLaw::TakeOff
        );
        assert_eq!(EmergencyBrakeLaw::initial(true), EmergencyBrakeLaw::Landing);
    }

    #[test]
    fn emergency_brake_law_switches_to_landing_law_in_flight_and_keeps_it_after_touchdown() {
        let law = EmergencyBrakeLaw::TakeOff.next(true, false);
        assert_eq!(law, EmergencyBrakeLaw::Landing);
        // Taxi-in after the landing, PARK BRK handle OFF
        assert_eq!(law.next(false, false), EmergencyBrakeLaw::Landing);
    }

    #[test]
    fn parking_brake_on_reverts_emergency_brake_law_to_take_off_law() {
        assert_eq!(
            EmergencyBrakeLaw::Landing.next(false, true),
            EmergencyBrakeLaw::TakeOff
        );
        // The take-off law stays after the PARK BRK handle is set OFF for the taxi-out
        assert_eq!(
            EmergencyBrakeLaw::TakeOff.next(false, false),
            EmergencyBrakeLaw::TakeOff
        );
    }

    #[test]
    fn emergency_brake_law_limits_are_1000_psi_landing_and_1700_psi_take_off() {
        assert_eq!(
            EmergencyBrakeLaw::TakeOff.pressure_limit(),
            Pressure::new::<psi>(1700.)
        );
        assert_eq!(
            EmergencyBrakeLaw::Landing.pressure_limit(),
            Pressure::new::<psi>(1000.)
        );
    }

    #[test]
    fn nws_is_normal_with_green_and_an_engine_running() {
        assert_eq!(
            A380SteeringControlSystem::steering_mode(true, true, true, false, false),
            NoseWheelSteeringMode::Normal
        );
    }

    #[test]
    fn nws_is_off_with_all_engines_shut_down() {
        assert_eq!(
            A380SteeringControlSystem::steering_mode(true, false, true, false, false),
            NoseWheelSteeringMode::Off
        );
    }

    #[test]
    fn nws_reverts_to_alternate_without_green_or_with_normal_fault() {
        assert_eq!(
            A380SteeringControlSystem::steering_mode(true, true, false, false, false),
            NoseWheelSteeringMode::Alternate
        );
        assert_eq!(
            A380SteeringControlSystem::steering_mode(true, true, true, true, false),
            NoseWheelSteeringMode::Alternate
        );
    }

    #[test]
    fn nws_is_off_with_both_modes_failed_or_both_scs_failed() {
        assert_eq!(
            A380SteeringControlSystem::steering_mode(true, true, true, true, true),
            NoseWheelSteeringMode::Off
        );
        assert_eq!(
            A380SteeringControlSystem::steering_mode(false, true, true, false, false),
            NoseWheelSteeringMode::Off
        );
    }
}
