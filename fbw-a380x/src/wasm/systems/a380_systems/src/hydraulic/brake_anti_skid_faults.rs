//! Faults of the A380 braking control system (BCS) that act on one main gear group or one brake pair: the two BCS,
//! the channels A and B of the three remote data concentrators (RDC) that carry the anti-skid of one gear group each,
//! and the wheel tachometer and normal servo valve of each brake pair.
//!
//! The model keeps one NORM and one ALTN brake circuit for all the wheel groups (brake_steer_faults.rs), so these
//! faults act on the pressure that each brake pair receives from those circuits:
//! - a gear group without anti-skid brakes in emergency braking, with the EBCU pressure law, while the other groups
//!   keep the normal or alternate braking;
//! - a released brake pair receives no pedal or AUTO BRK pressure in normal and alternate braking (the anti-skid of
//!   the pair has lost its wheel speed); the EBCU, without anti-skid, still brakes it;
//! - a leaking normal servo valve keeps a residual pressure on its pair.

use super::brake_steer_faults::PedalBrakingMode;
use systems::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};
use uom::si::{f64::*, pressure::psi};

/// The main landing gear groups, each with the anti-skid of its own RDC
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BrakeGearGroup {
    /// Both wing landing gears (RDC 1)
    Wing,
    /// The right body landing gear (RDC 2)
    RightBody,
    /// The left body landing gear (RDC 3)
    LeftBody,
}
impl BrakeGearGroup {
    const ALL: [BrakeGearGroup; 3] = [
        BrakeGearGroup::Wing,
        BrakeGearGroup::RightBody,
        BrakeGearGroup::LeftBody,
    ];

    fn rdc_index(self) -> usize {
        match self {
            BrakeGearGroup::Wing => 0,
            BrakeGearGroup::RightBody => 1,
            BrakeGearGroup::LeftBody => 2,
        }
    }
}

/// Brake pairs 1/2 to 15/16, numbered as the brakes of the SD WHEEL page
pub const BRAKE_PAIR_COUNT: usize = 8;

/// The gear group of a brake pair (index 0 = brakes 1/2 to index 7 = brakes 15/16): brakes 1 to 8 are on the wing
/// gears, 9 to 16 on the body gears, and the pairs alternate left and right.
fn brake_pair_gear_group(pair_index: usize) -> BrakeGearGroup {
    if pair_index < 4 {
        BrakeGearGroup::Wing
    } else if brake_pair_is_on_left_side(pair_index) {
        BrakeGearGroup::LeftBody
    } else {
        BrakeGearGroup::RightBody
    }
}

/// Whether a brake pair (index 0 = brakes 1/2) is on the left side of the aircraft
pub fn brake_pair_is_on_left_side(pair_index: usize) -> bool {
    pair_index.is_multiple_of(2)
}

/// The pressure that one brake pair receives from the NORM and the ALTN brake circuits
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BrakePairPressures {
    pub normal: Pressure,
    pub alternate: Pressure,
}
impl BrakePairPressures {
    pub fn highest(&self) -> Pressure {
        self.normal.max(self.alternate)
    }
}

/// What the braking system does when the brake pair pressures are computed
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BrakingState {
    pub pedal_braking_mode: PedalBrakingMode,
    pub parking_brake_on: bool,
    /// The pressure limit of the EBCU law in force (take-off or landing law)
    pub emergency_pressure_limit: Pressure,
}

/// Design choice: no residual pressure is published. 300 psi, enough to drag the aircraft to one side and to heat the
/// brakes of the gear during a taxi, well below the full brake pressure of about 3 600 psi.
const RESIDUAL_BRAKE_PRESSURE_PSI: f64 = 300.;

fn anti_skid_braking_mode(mode: PedalBrakingMode) -> bool {
    matches!(mode, PedalBrakingMode::Normal | PedalBrakingMode::Alternate)
}

/// The pressure of one brake pair, from the pressure of the brake circuits on its side.
/// - Released pair (normal or alternate braking): no pressure, except the park brake (ultimate braking does not use
///   the anti-skid).
/// - Gear group without anti-skid (normal or alternate braking, park brake off): emergency braking on that group, the
///   pressure is limited by the EBCU law.
/// - Residual braking: the leaking normal servo valve keeps at least its residual pressure.
pub fn brake_pair_pressure(
    side_pressures: BrakePairPressures,
    state: BrakingState,
    released: bool,
    gear_group_anti_skid_lost: bool,
    residual_braking: bool,
) -> BrakePairPressures {
    let mut pressures = side_pressures;
    let anti_skid_braking = anti_skid_braking_mode(state.pedal_braking_mode);

    if released && anti_skid_braking {
        pressures.normal = Pressure::default();
        if !state.parking_brake_on {
            pressures.alternate = Pressure::default();
        }
    } else if gear_group_anti_skid_lost && anti_skid_braking && !state.parking_brake_on {
        pressures.normal = pressures.normal.min(state.emergency_pressure_limit);
        pressures.alternate = pressures.alternate.min(state.emergency_pressure_limit);
    }

    if residual_braking {
        pressures.normal = pressures
            .normal
            .max(Pressure::new::<psi>(RESIDUAL_BRAKE_PRESSURE_PSI));
    }

    pressures
}

/// The BCS, RDC channel and brake pair faults (flyPad failures 32120-32127, 32160-32167 and 32170-32177). The BCS
/// reports them to the FWS.
pub struct A380BrakeAntiSkidFaults {
    bcs_fault_ids: [VariableIdentifier; 2],
    rdc_channel_faults_id: VariableIdentifier,
    released_pairs_id: VariableIdentifier,
    residual_pairs_id: VariableIdentifier,

    bcs_failures: [Failure; 2],
    /// RDC 1 A, RDC 1 B, RDC 2 A, RDC 2 B, RDC 3 A, RDC 3 B
    rdc_channel_failures: [Failure; 6],
    tachometer_failures: [Failure; BRAKE_PAIR_COUNT],
    servo_valve_leak_failures: [Failure; BRAKE_PAIR_COUNT],

    released_pairs: [bool; BRAKE_PAIR_COUNT],
    residual_pairs: [bool; BRAKE_PAIR_COUNT],
}
impl A380BrakeAntiSkidFaults {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            bcs_fault_ids: [1, 2]
                .map(|number| context.get_identifier(format!("BRAKES_CTL_{}_FAULT", number))),
            rdc_channel_faults_id: context.get_identifier("BRAKES_RDC_CHANNEL_FAULTS".to_owned()),
            released_pairs_id: context.get_identifier("BRAKES_RELEASED_PAIRS".to_owned()),
            residual_pairs_id: context.get_identifier("BRAKES_RESIDUAL_PAIRS".to_owned()),

            bcs_failures: [1, 2]
                .map(|number| Failure::new(FailureType::BrakingControlSystem(number))),
            rdc_channel_failures: [(1, 1), (1, 2), (2, 1), (2, 2), (3, 1), (3, 2)].map(
                |(rdc, channel)| {
                    Failure::new(FailureType::BrakeRemoteDataConcentratorChannel(
                        rdc, channel,
                    ))
                },
            ),
            tachometer_failures: [1, 2, 3, 4, 5, 6, 7, 8]
                .map(|pair| Failure::new(FailureType::BrakePairTachometer(pair))),
            servo_valve_leak_failures: [1, 2, 3, 4, 5, 6, 7, 8]
                .map(|pair| Failure::new(FailureType::BrakePairServoValveLeak(pair))),

            released_pairs: [false; BRAKE_PAIR_COUNT],
            residual_pairs: [false; BRAKE_PAIR_COUNT],
        }
    }

    /// BCS 1 and BCS 2 failed: no normal or alternate braking, the EBCU brakes without anti-skid
    fn both_bcs_failed(&self) -> bool {
        self.bcs_failures.iter().all(Failure::is_active)
    }

    /// The gear group lost its anti-skid: both channels of its RDC failed
    fn gear_group_anti_skid_lost(&self, group: BrakeGearGroup) -> bool {
        let first_channel = group.rdc_index() * 2;
        self.rdc_channel_failures[first_channel].is_active()
            && self.rdc_channel_failures[first_channel + 1].is_active()
    }

    pub fn any_gear_group_anti_skid_lost(&self) -> bool {
        BrakeGearGroup::ALL
            .iter()
            .any(|&group| self.gear_group_anti_skid_lost(group))
    }

    /// The anti-skid is lost on all the landing gears: the braking system changes to emergency braking
    pub fn anti_skid_lost_on_all_gears(&self) -> bool {
        self.both_bcs_failed()
            || BrakeGearGroup::ALL
                .iter()
                .all(|&group| self.gear_group_anti_skid_lost(group))
    }

    /// Updates which brake pairs are released and which keep a residual pressure.
    /// `normal_supply_pressurised`: the normal brake circuit is pressurised up to the servo valves (GREEN available,
    /// gear down or on the ground).
    pub fn update(
        &mut self,
        pedal_braking_mode: PedalBrakingMode,
        normal_supply_pressurised: bool,
    ) {
        let anti_skid_braking = anti_skid_braking_mode(pedal_braking_mode);
        for pair in 0..BRAKE_PAIR_COUNT {
            // A gear group without anti-skid brakes under the EBCU, which needs no wheel speed
            self.released_pairs[pair] = anti_skid_braking
                && self.tachometer_failures[pair].is_active()
                && !self.gear_group_anti_skid_lost(brake_pair_gear_group(pair));
            self.residual_pairs[pair] =
                normal_supply_pressurised && self.servo_valve_leak_failures[pair].is_active();
        }
    }

    /// The pressure of each brake pair (index 0 = brakes 1/2), from the left and right pressures of the circuits
    pub fn brake_pair_pressures(
        &self,
        left: BrakePairPressures,
        right: BrakePairPressures,
        state: BrakingState,
    ) -> [BrakePairPressures; BRAKE_PAIR_COUNT] {
        let mut pressures = [BrakePairPressures::default(); BRAKE_PAIR_COUNT];
        for (pair, pressure) in pressures.iter_mut().enumerate() {
            let side_pressures = if brake_pair_is_on_left_side(pair) {
                left
            } else {
                right
            };
            *pressure = brake_pair_pressure(
                side_pressures,
                state,
                self.released_pairs[pair],
                self.gear_group_anti_skid_lost(brake_pair_gear_group(pair)),
                self.residual_pairs[pair],
            );
        }
        pressures
    }

    fn bitmask(flags: impl Iterator<Item = bool>) -> f64 {
        flags
            .enumerate()
            .filter(|(_, set)| *set)
            .map(|(bit, _)| (1u32 << bit) as f64)
            .sum()
    }
}
impl SimulationElement for A380BrakeAntiSkidFaults {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.bcs_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.rdc_channel_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.tachometer_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.servo_valve_leak_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (id, failure) in self.bcs_fault_ids.iter().zip(self.bcs_failures.iter()) {
            writer.write(id, failure.is_active());
        }
        writer.write(
            &self.rdc_channel_faults_id,
            Self::bitmask(self.rdc_channel_failures.iter().map(Failure::is_active)),
        );
        // Bit n: brake pair n (bit 0 brakes 1/2 ... bit 7 brakes 15/16)
        writer.write(
            &self.released_pairs_id,
            Self::bitmask(self.released_pairs.iter().copied()),
        );
        writer.write(
            &self.residual_pairs_id,
            Self::bitmask(self.residual_pairs.iter().copied()),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pressures(normal_psi: f64, alternate_psi: f64) -> BrakePairPressures {
        BrakePairPressures {
            normal: Pressure::new::<psi>(normal_psi),
            alternate: Pressure::new::<psi>(alternate_psi),
        }
    }

    fn state(mode: PedalBrakingMode, parking_brake_on: bool) -> BrakingState {
        BrakingState {
            pedal_braking_mode: mode,
            parking_brake_on,
            emergency_pressure_limit: Pressure::new::<psi>(1000.),
        }
    }

    #[test]
    fn brake_pairs_follow_the_sd_wheel_numbering() {
        let groups: Vec<_> = (0..BRAKE_PAIR_COUNT).map(brake_pair_gear_group).collect();
        assert_eq!(
            groups,
            vec![
                BrakeGearGroup::Wing,
                BrakeGearGroup::Wing,
                BrakeGearGroup::Wing,
                BrakeGearGroup::Wing,
                BrakeGearGroup::LeftBody,
                BrakeGearGroup::RightBody,
                BrakeGearGroup::LeftBody,
                BrakeGearGroup::RightBody,
            ]
        );
        assert!(brake_pair_is_on_left_side(0));
        assert!(!brake_pair_is_on_left_side(1));
    }

    #[test]
    fn a_healthy_pair_receives_the_circuit_pressures() {
        let side = pressures(3000., 0.);
        assert_eq!(
            brake_pair_pressure(
                side,
                state(PedalBrakingMode::Normal, false),
                false,
                false,
                false
            ),
            side
        );
    }

    #[test]
    fn a_gear_group_without_anti_skid_is_limited_by_the_ebcu_law() {
        let limited = brake_pair_pressure(
            pressures(3000., 2500.),
            state(PedalBrakingMode::Normal, false),
            false,
            true,
            false,
        );
        assert_eq!(limited, pressures(1000., 1000.));
    }

    #[test]
    fn the_park_brake_is_not_limited_on_a_gear_group_without_anti_skid() {
        let side = pressures(0., 3600.);
        assert_eq!(
            brake_pair_pressure(
                side,
                state(PedalBrakingMode::Normal, true),
                false,
                true,
                false
            ),
            side
        );
    }

    #[test]
    fn a_released_pair_gets_no_pedal_pressure_in_normal_and_alternate_braking() {
        for mode in [PedalBrakingMode::Normal, PedalBrakingMode::Alternate] {
            assert_eq!(
                brake_pair_pressure(
                    pressures(3000., 3000.),
                    state(mode, false),
                    true,
                    false,
                    false
                ),
                pressures(0., 0.)
            );
        }
    }

    #[test]
    fn a_released_pair_keeps_the_park_brake_and_the_emergency_braking() {
        assert_eq!(
            brake_pair_pressure(
                pressures(2000., 3600.),
                state(PedalBrakingMode::Normal, true),
                true,
                false,
                false
            ),
            pressures(0., 3600.)
        );
        let emergency = pressures(0., 1000.);
        assert_eq!(
            brake_pair_pressure(
                emergency,
                state(PedalBrakingMode::Emergency, false),
                true,
                false,
                false
            ),
            emergency
        );
    }

    #[test]
    fn residual_braking_keeps_a_pressure_without_braking_command() {
        let residual = brake_pair_pressure(
            pressures(0., 0.),
            state(PedalBrakingMode::Normal, false),
            false,
            false,
            true,
        );
        assert_eq!(
            residual.normal,
            Pressure::new::<psi>(RESIDUAL_BRAKE_PRESSURE_PSI)
        );
        assert_eq!(residual.alternate, Pressure::default());
    }

    #[test]
    fn bitmask_sets_one_bit_per_flag() {
        assert_eq!(
            A380BrakeAntiSkidFaults::bitmask([true, false, true].into_iter()),
            5.
        );
    }
}
