//! Where the strut of a ram air turbine (RAT) is, and what extends or stows it. Shared by the A320 RAT (hydraulic
//! pump) and the A380 RAT (emergency generator).

use super::RamAirTurbineController;
use crate::simulation::{
    InitContext, Read, SimulationElement, SimulatorReader, SimulatorWriter, UpdateContext,
    VariableIdentifier, Write,
};
use std::time::Duration;

/// The RAT strut position: 0 = stowed, 1 = fully deployed (L:A32NX_RAT_STOW_POSITION).
///
/// Extension: once a controller commands it, the RAT stays commanded out: it is a drop-out RAT that the crew cannot
/// retract. A320 FCOM DSC-29-10-20 (a320_fcom.txt 43639-43653): "The RAT deploys automatically if AC BUS 1 and AC BUS
/// 2 are both lost. It can be deployed manually from the overhead panel. It can be stowed only when the aircraft is on
/// the ground." A380 FCOM DSC-29-10 (a380_fcom.txt 61250): "The green hydraulic system powers RAT retraction, on
/// ground."
///
/// Stowing is a ground maintenance action, requested with L:A32NX_RAT_STOW_REQUEST (the flyPad Services page). The
/// request is accepted only:
/// - on the ground (FCOM above), and
/// - while no extension is commanded (the deployment solenoids are not energised: emergency electrical configuration,
///   RAT MAN ON or EMER ELEC PWR MAN ON): a stowing command against an energised deployment solenoid would just put
///   the RAT back out.
///
/// The request is consumed when it is evaluated (written back to 0), so a request made in flight is dropped instead of
/// stowing the RAT after the landing. If an extension is commanded while the RAT stows, it goes back out.
///
/// Design choices (not in the FCOMs): the stow does not need hydraulic pressure (the ground crew powers it) and moves
/// at the same speed as the extension.
pub struct RamAirTurbineDeployment {
    position_id: VariableIdentifier,
    stow_request_id: VariableIdentifier,

    stow_requested: bool,
    deployment_commanded: bool,
    stowing: bool,
    position: f64,
}
impl RamAirTurbineDeployment {
    /// Strut travel per second: 1 means the RAT goes from stowed to fully deployed (or back) in 1 s
    const TRAVEL_PER_SECOND: f64 = 1.;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            position_id: context.get_identifier("RAT_STOW_POSITION".to_owned()),
            stow_request_id: context.get_identifier("RAT_STOW_REQUEST".to_owned()),

            stow_requested: false,
            deployment_commanded: false,
            stowing: false,
            position: 0.,
        }
    }

    /// Takes the extension command and the maintenance stow request into account
    pub fn update(&mut self, context: &UpdateContext, controller: &impl RamAirTurbineController) {
        if controller.should_deploy() {
            // Once commanded, stays commanded until a maintenance stow on the ground
            self.deployment_commanded = true;
            self.stowing = false;
        } else if self.stow_requested
            && context.is_on_ground()
            && (self.deployment_commanded || self.position > 0.)
        {
            self.deployment_commanded = false;
            self.stowing = true;
        }

        // The request is evaluated once: refused requests (in flight, extension commanded) are dropped
        self.stow_requested = false;
    }

    /// Moves the strut towards its commanded position
    pub fn update_position(&mut self, delta: Duration) {
        let travel = delta.as_secs_f64() * Self::TRAVEL_PER_SECOND;

        if self.deployment_commanded {
            self.position += travel;
        } else if self.stowing {
            self.position -= travel;
        }

        self.position = self.position.clamp(0., 1.);

        if self.position <= 0. {
            self.stowing = false;
        }
    }

    /// 0 = stowed, 1 = fully deployed
    pub fn position(&self) -> f64 {
        self.position
    }

    pub fn is_deployment_commanded(&self) -> bool {
        self.deployment_commanded
    }
}
impl SimulationElement for RamAirTurbineDeployment {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.stow_requested = reader.read(&self.stow_request_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.position_id, self.position);
        // Kept at 1 until evaluated (a frame without any update step must not lose it), then back to 0
        writer.write(&self.stow_request_id, self.stow_requested);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::test::{ReadByName, SimulationTestBed, TestBed, WriteByName};
    use crate::simulation::{Aircraft, SimulationElementVisitor};

    struct TestController {
        should_deploy: bool,
    }
    impl RamAirTurbineController for TestController {
        fn should_deploy(&self) -> bool {
            self.should_deploy
        }
    }

    struct TestAircraft {
        controller: TestController,
        deployment: RamAirTurbineDeployment,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                controller: TestController {
                    should_deploy: false,
                },
                deployment: RamAirTurbineDeployment::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.deployment.update(context, &self.controller);
            self.deployment.update_position(context.delta());
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.deployment.accept(visitor);

            visitor.visit(self);
        }
    }

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        SimulationTestBed::new(TestAircraft::new)
    }

    fn command_deployment(test_bed: &mut SimulationTestBed<TestAircraft>, deploy: bool) {
        test_bed.command(|a| a.controller.should_deploy = deploy);
    }

    fn request_stow(test_bed: &mut SimulationTestBed<TestAircraft>) {
        test_bed.write_by_name("RAT_STOW_REQUEST", true);
    }

    fn position(test_bed: &mut SimulationTestBed<TestAircraft>) -> f64 {
        test_bed.read_by_name("RAT_STOW_POSITION")
    }

    fn deployed_in_flight() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = test_bed();
        test_bed.set_on_ground(false);
        command_deployment(&mut test_bed, true);
        test_bed.run_with_delta(Duration::from_secs(2));
        // The emergency condition is gone (e.g. engines relit or the RAT MAN ON pb released)
        command_deployment(&mut test_bed, false);
        test_bed.run_with_delta(Duration::from_secs(1));
        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);

        test_bed
    }

    #[test]
    fn stays_deployed_once_the_deployment_command_is_gone() {
        let mut test_bed = deployed_in_flight();

        test_bed.set_on_ground(true);
        test_bed.run_with_delta(Duration::from_secs(5));

        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);
    }

    #[test]
    fn stows_on_the_ground_on_a_maintenance_request() {
        let mut test_bed = deployed_in_flight();
        test_bed.set_on_ground(true);

        request_stow(&mut test_bed);
        test_bed.run_with_delta(Duration::from_millis(500));
        let half_way = position(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(1));

        assert!(half_way > 0. && half_way < 1.);
        assert!(position(&mut test_bed) <= 0.);
        assert!(!test_bed.query(|a| a.deployment.is_deployment_commanded()));
    }

    #[test]
    fn stow_request_is_consumed() {
        let mut test_bed = deployed_in_flight();
        test_bed.set_on_ground(true);

        request_stow(&mut test_bed);
        test_bed.run_with_delta(Duration::from_millis(100));

        let request: bool = test_bed.read_by_name("RAT_STOW_REQUEST");
        assert!(!request);
    }

    #[test]
    fn stow_request_is_ignored_in_flight_and_not_kept_for_the_landing() {
        let mut test_bed = deployed_in_flight();

        request_stow(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(2));
        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);

        test_bed.set_on_ground(true);
        test_bed.run_with_delta(Duration::from_secs(2));
        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);
    }

    #[test]
    fn stow_request_is_refused_while_deployment_is_commanded() {
        let mut test_bed = deployed_in_flight();
        test_bed.set_on_ground(true);
        command_deployment(&mut test_bed, true);

        request_stow(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(2));

        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);
    }

    #[test]
    fn redeploys_when_deployment_is_commanded_while_stowing() {
        let mut test_bed = deployed_in_flight();
        test_bed.set_on_ground(true);

        request_stow(&mut test_bed);
        test_bed.run_with_delta(Duration::from_millis(500));
        command_deployment(&mut test_bed, true);
        test_bed.run_with_delta(Duration::from_secs(1));

        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);
    }

    #[test]
    fn redeploys_after_a_stow_when_deployment_is_commanded_again() {
        let mut test_bed = deployed_in_flight();
        test_bed.set_on_ground(true);
        request_stow(&mut test_bed);
        test_bed.run_with_delta(Duration::from_secs(2));
        assert!(position(&mut test_bed) <= 0.);

        command_deployment(&mut test_bed, true);
        test_bed.run_with_delta(Duration::from_secs(2));

        assert!((position(&mut test_bed) - 1.).abs() < f64::EPSILON);
    }
}
