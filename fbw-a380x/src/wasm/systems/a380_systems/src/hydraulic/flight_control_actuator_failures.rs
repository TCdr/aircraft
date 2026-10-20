//! Failures of the primary flight control actuators of the A380 (ailerons, elevators, rudders and trimmable horizontal
//! stabilizer).
//!
//! Each surface has two actuators: one is active and controls the surface, the other follows it in damping mode. When
//! the active actuator fails, the flight control computers lose it and give the control of the surface to its other
//! actuator, so the surface stays available. When both actuators of a surface fail, the surface is lost and floats.
//!
//! The flight control computer models do not know these failures, so they keep sending their orders to the failed
//! actuator: the monitoring and the reconfiguration to the other actuator are done here, on the orders of the
//! computers, before they reach the actuators.

use systems::{
    failures::{Failure, FailureType},
    shared::FlightControlSurface,
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// The orders of the flight control computers to the two actuators of one surface: whether each actuator is active
/// and its position order. A failed actuator loses its active mode. When it was active, the other actuator of the
/// surface takes over its position order, if that actuator is healthy and can take over.
pub fn reconfigure_actuator_pair<T: Copy>(
    active: &mut [bool; 2],
    position: &mut [T; 2],
    failed: [bool; 2],
    can_take_over: [bool; 2],
) {
    let active_before = *active;

    for actuator in 0..2 {
        let other = 1 - actuator;
        if failed[actuator] {
            active[actuator] = false;

            if active_before[actuator]
                && !active_before[other]
                && !failed[other]
                && can_take_over[other]
            {
                active[other] = true;
                position[other] = position[actuator];
            }
        }
    }
}

/// The orders to the two EBHAs of one rudder: each EBHA works as a conventional actuator (hydraulic mode) or, when its
/// hydraulic system is lost, as an EHA (electric mode). An EBHA whose electrical part is failed has no electric mode:
/// if it was active in electric mode only, it loses its active mode as a failed EBHA does.
pub fn reconfigure_ebha_pair<T: Copy>(
    hydraulic_mode: &mut [bool; 2],
    electric_mode: &mut [bool; 2],
    position: &mut [T; 2],
    failed: [bool; 2],
    electrical_part_failed: [bool; 2],
) {
    let hydraulic_mode_before = *hydraulic_mode;
    let electric_mode_before = *electric_mode;

    let active_before = [
        hydraulic_mode[0] || electric_mode[0],
        hydraulic_mode[1] || electric_mode[1],
    ];
    let mut active = active_before;
    let lost_active_mode = [
        failed[0] || (electrical_part_failed[0] && !hydraulic_mode[0]),
        failed[1] || (electrical_part_failed[1] && !hydraulic_mode[1]),
    ];

    reconfigure_actuator_pair(&mut active, position, lost_active_mode, [true, true]);

    for ebha in 0..2 {
        let other = 1 - ebha;
        let took_over = active[ebha] && !active_before[ebha];
        if took_over {
            hydraulic_mode[ebha] = hydraulic_mode_before[other];
            electric_mode[ebha] = electric_mode_before[other] && !electrical_part_failed[ebha];
        } else if !active[ebha] {
            hydraulic_mode[ebha] = false;
            electric_mode[ebha] = false;
        } else if electrical_part_failed[ebha] {
            electric_mode[ebha] = false;
        }
    }
}

/// The surface name in the actuator failure variables, as in the surface deflection variables
fn surface_variable_name(surface: FlightControlSurface) -> &'static str {
    use FlightControlSurface::*;
    match surface {
        LeftOuterAileron => "LEFT_OUTER_AILERON",
        LeftMidAileron => "LEFT_MIDDLE_AILERON",
        LeftInnerAileron => "LEFT_INNER_AILERON",
        RightInnerAileron => "RIGHT_INNER_AILERON",
        RightMidAileron => "RIGHT_MIDDLE_AILERON",
        RightOuterAileron => "RIGHT_OUTER_AILERON",
        LeftOuterElevator => "LEFT_OUTER_ELEVATOR",
        LeftInnerElevator => "LEFT_INNER_ELEVATOR",
        RightInnerElevator => "RIGHT_INNER_ELEVATOR",
        RightOuterElevator => "RIGHT_OUTER_ELEVATOR",
        UpperRudder => "UPPER_RUDDER",
        LowerRudder => "LOWER_RUDDER",
        Stabilizer => "STABILIZER",
    }
}

/// The two actuators of one surface, in the order of the surface controllers of the hydraulic system. Each failure is
/// published for the actuator indications of the F/CTL SD page.
struct SurfaceActuatorFailures {
    actuators: [Failure; 2],
    failed_ids: [VariableIdentifier; 2],
}
impl SurfaceActuatorFailures {
    fn new(context: &mut InitContext, surface: FlightControlSurface) -> Self {
        Self {
            actuators: [
                Failure::new(FailureType::FlightControlActuator(surface, 1)),
                Failure::new(FailureType::FlightControlActuator(surface, 2)),
            ],
            failed_ids: Self::failed_ids(context, surface, ""),
        }
    }

    fn electrical_parts(context: &mut InitContext, surface: FlightControlSurface) -> Self {
        Self {
            actuators: [
                Failure::new(FailureType::FlightControlActuatorElectricalPart(surface, 1)),
                Failure::new(FailureType::FlightControlActuatorElectricalPart(surface, 2)),
            ],
            failed_ids: Self::failed_ids(context, surface, "_ELEC_PART"),
        }
    }

    fn failed_ids(
        context: &mut InitContext,
        surface: FlightControlSurface,
        part: &str,
    ) -> [VariableIdentifier; 2] {
        let surface = surface_variable_name(surface);
        [1, 2].map(|actuator| {
            context.get_identifier(format!("FCTL_{surface}_ACTUATOR_{actuator}{part}_FAILED"))
        })
    }

    fn failed(&self) -> [bool; 2] {
        [self.actuators[0].is_active(), self.actuators[1].is_active()]
    }
}
impl SimulationElement for SurfaceActuatorFailures {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.actuators[0].accept(visitor);
        self.actuators[1].accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let failed = self.failed();
        writer.write(&self.failed_ids[0], failed[0]);
        writer.write(&self.failed_ids[1], failed[1]);
    }
}

/// The flyPad failures of the actuators. Actuator 1 and 2 of each surface:
/// - outer ailerons: GREEN and YELLOW actuators
/// - mid ailerons: YELLOW actuator and EHA
/// - inner ailerons: GREEN actuator and EHA
/// - elevators: hydraulic actuator (GREEN on the left, YELLOW on the right) and EHA
/// - upper rudder: YELLOW and GREEN EBHAs; lower rudder: GREEN and YELLOW EBHAs
/// - stabilizer: GREEN and YELLOW hydraulic motors
pub struct A380FlightControlActuatorFailures {
    /// Outer, mid and inner aileron
    left_ailerons: [SurfaceActuatorFailures; 3],
    right_ailerons: [SurfaceActuatorFailures; 3],
    /// Outer and inner elevator
    left_elevators: [SurfaceActuatorFailures; 2],
    right_elevators: [SurfaceActuatorFailures; 2],
    /// Upper and lower rudder
    rudders: [SurfaceActuatorFailures; 2],
    rudder_electrical_parts: [SurfaceActuatorFailures; 2],
    stabilizer_motors: SurfaceActuatorFailures,
    stabilizer_jam: Failure,
    stabilizer_jammed_id: VariableIdentifier,
}
impl A380FlightControlActuatorFailures {
    pub fn new(context: &mut InitContext) -> Self {
        use FlightControlSurface::*;
        Self {
            left_ailerons: [
                SurfaceActuatorFailures::new(context, LeftOuterAileron),
                SurfaceActuatorFailures::new(context, LeftMidAileron),
                SurfaceActuatorFailures::new(context, LeftInnerAileron),
            ],
            right_ailerons: [
                SurfaceActuatorFailures::new(context, RightOuterAileron),
                SurfaceActuatorFailures::new(context, RightMidAileron),
                SurfaceActuatorFailures::new(context, RightInnerAileron),
            ],
            left_elevators: [
                SurfaceActuatorFailures::new(context, LeftOuterElevator),
                SurfaceActuatorFailures::new(context, LeftInnerElevator),
            ],
            right_elevators: [
                SurfaceActuatorFailures::new(context, RightOuterElevator),
                SurfaceActuatorFailures::new(context, RightInnerElevator),
            ],
            rudders: [
                SurfaceActuatorFailures::new(context, UpperRudder),
                SurfaceActuatorFailures::new(context, LowerRudder),
            ],
            rudder_electrical_parts: [
                SurfaceActuatorFailures::electrical_parts(context, UpperRudder),
                SurfaceActuatorFailures::electrical_parts(context, LowerRudder),
            ],
            stabilizer_motors: SurfaceActuatorFailures::new(context, Stabilizer),
            stabilizer_jam: Failure::new(FailureType::StabilizerJammed),
            stabilizer_jammed_id: context.get_identifier("FCTL_STABILIZER_JAMMED".to_owned()),
        }
    }

    /// The failed actuators of the left aileron of a panel (0 outer, 1 mid, 2 inner)
    pub fn left_aileron_failed(&self, panel: usize) -> [bool; 2] {
        self.left_ailerons[panel].failed()
    }

    pub fn right_aileron_failed(&self, panel: usize) -> [bool; 2] {
        self.right_ailerons[panel].failed()
    }

    /// The failed actuators of the left elevator of a panel (0 outer, 1 inner)
    pub fn left_elevator_failed(&self, panel: usize) -> [bool; 2] {
        self.left_elevators[panel].failed()
    }

    pub fn right_elevator_failed(&self, panel: usize) -> [bool; 2] {
        self.right_elevators[panel].failed()
    }

    /// The failed EBHAs of a rudder (0 upper, 1 lower)
    pub fn rudder_failed(&self, rudder: usize) -> [bool; 2] {
        self.rudders[rudder].failed()
    }

    pub fn rudder_electrical_part_failed(&self, rudder: usize) -> [bool; 2] {
        self.rudder_electrical_parts[rudder].failed()
    }

    /// The failed hydraulic motors of the stabilizer. A jammed stabilizer can be moved by none of them.
    pub fn stabilizer_motor_failed(&self) -> [bool; 2] {
        let jammed = self.stabilizer_jam.is_active();
        let failed = self.stabilizer_motors.failed();
        [failed[0] || jammed, failed[1] || jammed]
    }
}
impl SimulationElement for A380FlightControlActuatorFailures {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for surface in self
            .left_ailerons
            .iter_mut()
            .chain(self.right_ailerons.iter_mut())
            .chain(self.left_elevators.iter_mut())
            .chain(self.right_elevators.iter_mut())
            .chain(self.rudders.iter_mut())
            .chain(self.rudder_electrical_parts.iter_mut())
        {
            surface.accept(visitor);
        }
        self.stabilizer_motors.accept(visitor);
        self.stabilizer_jam.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.stabilizer_jammed_id, self.stabilizer_jam.is_active());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEALTHY: [bool; 2] = [false, false];
    const BOTH_CAN_TAKE_OVER: [bool; 2] = [true, true];

    #[test]
    fn healthy_actuators_keep_the_orders() {
        let mut active = [true, false];
        let mut position = [0.3, 0.];
        reconfigure_actuator_pair(&mut active, &mut position, HEALTHY, BOTH_CAN_TAKE_OVER);

        assert_eq!(active, [true, false]);
        assert_eq!(position, [0.3, 0.]);
    }

    #[test]
    fn the_other_actuator_takes_over_the_order_of_a_failed_active_actuator() {
        let mut active = [true, false];
        let mut position = [0.3, 0.];
        reconfigure_actuator_pair(
            &mut active,
            &mut position,
            [true, false],
            BOTH_CAN_TAKE_OVER,
        );

        assert_eq!(active, [false, true]);
        assert_eq!(position[1], 0.3);
    }

    #[test]
    fn a_failed_damping_actuator_changes_nothing_for_the_active_one() {
        let mut active = [true, false];
        let mut position = [0.3, 0.];
        reconfigure_actuator_pair(
            &mut active,
            &mut position,
            [false, true],
            BOTH_CAN_TAKE_OVER,
        );

        assert_eq!(active, [true, false]);
        assert_eq!(position, [0.3, 0.]);
    }

    #[test]
    fn an_eha_that_cannot_take_over_leaves_the_surface_without_active_actuator() {
        let mut active = [true, false];
        let mut position = [0.3, 0.];
        reconfigure_actuator_pair(&mut active, &mut position, [true, false], [true, false]);

        assert_eq!(active, [false, false]);
    }

    #[test]
    fn a_surface_with_both_actuators_failed_has_no_active_actuator() {
        let mut active = [true, true];
        let mut position = [0.3, 0.3];
        reconfigure_actuator_pair(&mut active, &mut position, [true, true], BOTH_CAN_TAKE_OVER);

        assert_eq!(active, [false, false]);
    }

    #[test]
    fn a_failed_ebha_hands_its_hydraulic_order_to_the_other_ebha() {
        let mut hydraulic_mode = [true, false];
        let mut electric_mode = [false, false];
        let mut position = [0.4, 0.5];
        reconfigure_ebha_pair(
            &mut hydraulic_mode,
            &mut electric_mode,
            &mut position,
            [true, false],
            HEALTHY,
        );

        assert_eq!(hydraulic_mode, [false, true]);
        assert_eq!(electric_mode, [false, false]);
        assert_eq!(position[1], 0.4);
    }

    #[test]
    fn an_ebha_working_as_eha_with_its_electrical_part_failed_hands_over_its_order() {
        let mut hydraulic_mode = [false, false];
        let mut electric_mode = [true, false];
        let mut position = [0.4, 0.5];
        reconfigure_ebha_pair(
            &mut hydraulic_mode,
            &mut electric_mode,
            &mut position,
            HEALTHY,
            [true, false],
        );

        assert_eq!(hydraulic_mode, [false, false]);
        assert_eq!(electric_mode, [false, true]);
        assert_eq!(position[1], 0.4);
    }

    #[test]
    fn an_ebha_in_hydraulic_mode_keeps_working_with_its_electrical_part_failed() {
        let mut hydraulic_mode = [true, false];
        let mut electric_mode = [false, false];
        let mut position = [0.4, 0.5];
        reconfigure_ebha_pair(
            &mut hydraulic_mode,
            &mut electric_mode,
            &mut position,
            HEALTHY,
            [true, false],
        );

        assert_eq!(hydraulic_mode, [true, false]);
        assert_eq!(electric_mode, [false, false]);
        assert_eq!(position, [0.4, 0.5]);
    }

    #[test]
    fn both_ebhas_active_together_lose_only_the_failed_one() {
        let mut hydraulic_mode = [true, true];
        let mut electric_mode = [false, false];
        let mut position = [0.4, 0.4];
        reconfigure_ebha_pair(
            &mut hydraulic_mode,
            &mut electric_mode,
            &mut position,
            [false, true],
            HEALTHY,
        );

        assert_eq!(hydraulic_mode, [true, false]);
    }

    mod published_failures {
        use super::*;
        use systems::simulation::test::{
            ElementCtorFn, ReadByName, SimulationTestBed, TestAircraft, TestBed,
        };

        fn failed(
            test_bed: &mut SimulationTestBed<TestAircraft<A380FlightControlActuatorFailures>>,
            name: &str,
        ) -> bool {
            test_bed.read_by_name(name)
        }

        #[test]
        fn healthy_actuators_are_published_as_not_failed() {
            let mut test_bed =
                SimulationTestBed::from(ElementCtorFn(A380FlightControlActuatorFailures::new));
            test_bed.run();

            assert!(!failed(
                &mut test_bed,
                "FCTL_LEFT_INNER_AILERON_ACTUATOR_1_FAILED"
            ));
            assert!(!failed(&mut test_bed, "FCTL_STABILIZER_JAMMED"));
        }

        #[test]
        fn each_failed_actuator_is_published_for_its_surface() {
            let mut test_bed =
                SimulationTestBed::from(ElementCtorFn(A380FlightControlActuatorFailures::new));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::LeftInnerAileron,
                1,
            ));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::LeftInnerAileron,
                2,
            ));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::RightMidAileron,
                2,
            ));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::RightOuterElevator,
                1,
            ));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::LowerRudder,
                2,
            ));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::Stabilizer,
                1,
            ));
            test_bed.run();

            for name in [
                "FCTL_LEFT_INNER_AILERON_ACTUATOR_1_FAILED",
                "FCTL_LEFT_INNER_AILERON_ACTUATOR_2_FAILED",
                "FCTL_RIGHT_MIDDLE_AILERON_ACTUATOR_2_FAILED",
                "FCTL_RIGHT_OUTER_ELEVATOR_ACTUATOR_1_FAILED",
                "FCTL_LOWER_RUDDER_ACTUATOR_2_FAILED",
                "FCTL_STABILIZER_ACTUATOR_1_FAILED",
            ] {
                assert!(failed(&mut test_bed, name), "{name}");
            }
            for name in [
                "FCTL_RIGHT_INNER_AILERON_ACTUATOR_1_FAILED",
                "FCTL_RIGHT_MIDDLE_AILERON_ACTUATOR_1_FAILED",
                "FCTL_RIGHT_OUTER_ELEVATOR_ACTUATOR_2_FAILED",
                "FCTL_LOWER_RUDDER_ACTUATOR_2_ELEC_PART_FAILED",
                "FCTL_STABILIZER_ACTUATOR_2_FAILED",
                "FCTL_STABILIZER_JAMMED",
            ] {
                assert!(!failed(&mut test_bed, name), "{name}");
            }
        }

        #[test]
        fn rudder_electrical_parts_and_stabilizer_jam_are_published_on_their_own() {
            let mut test_bed =
                SimulationTestBed::from(ElementCtorFn(A380FlightControlActuatorFailures::new));
            test_bed.fail(FailureType::FlightControlActuatorElectricalPart(
                FlightControlSurface::UpperRudder,
                1,
            ));
            test_bed.fail(FailureType::StabilizerJammed);
            test_bed.run();

            assert!(failed(
                &mut test_bed,
                "FCTL_UPPER_RUDDER_ACTUATOR_1_ELEC_PART_FAILED"
            ));
            assert!(!failed(
                &mut test_bed,
                "FCTL_UPPER_RUDDER_ACTUATOR_1_FAILED"
            ));
            assert!(failed(&mut test_bed, "FCTL_STABILIZER_JAMMED"));
            // The jam stops the stabilizer, but its motors are not failed.
            assert!(!failed(&mut test_bed, "FCTL_STABILIZER_ACTUATOR_1_FAILED"));
        }
    }
}
