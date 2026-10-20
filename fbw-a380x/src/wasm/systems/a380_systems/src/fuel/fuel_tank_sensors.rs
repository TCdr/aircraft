use super::A380FuelTankType;
use enum_map::Enum;
use systems::{
    failures::{Failure, FailureType},
    simulation::{SimulationElement, SimulationElementVisitor},
};

/// The fuel quantity indication (FQI) probes of the A380 tanks, read by both FQDCs. Each tank can lose its probes
/// (its quantity is lost) or have a degraded gauging (its quantity is less accurate, which the FQMS flags; the size of
/// the error is not simulated).
pub(super) struct FuelTankSensors {
    probes_lost: [Failure; A380FuelTankType::LENGTH],
    gauging_degraded: [Failure; A380FuelTankType::LENGTH],
}
impl FuelTankSensors {
    pub(super) fn new() -> Self {
        Self {
            probes_lost: std::array::from_fn(|tank| {
                Failure::new(FailureType::FuelQuantityIndication(tank))
            }),
            gauging_degraded: std::array::from_fn(|tank| {
                Failure::new(FailureType::FuelGaugingDegraded(tank))
            }),
        }
    }

    pub(super) fn is_quantity_lost(&self, tank: A380FuelTankType) -> bool {
        self.probes_lost[tank.into_usize()].is_active()
    }

    /// One bit per tank whose quantity is lost, bit n for the tank of index n of A380FuelTankType
    pub(super) fn quantity_lost_tanks(&self) -> u32 {
        Self::tank_bits(&self.probes_lost)
    }

    /// One bit per tank whose gauging is degraded, bit n for the tank of index n of A380FuelTankType
    pub(super) fn gauging_degraded_tanks(&self) -> u32 {
        Self::tank_bits(&self.gauging_degraded)
    }

    fn tank_bits(failures: &[Failure; A380FuelTankType::LENGTH]) -> u32 {
        failures
            .iter()
            .enumerate()
            .filter(|(_, failure)| failure.is_active())
            .fold(0, |bits, (tank, _)| bits | (1 << tank))
    }
}
impl SimulationElement for FuelTankSensors {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for failure in self
            .probes_lost
            .iter_mut()
            .chain(self.gauging_degraded.iter_mut())
        {
            failure.accept(visitor);
        }
        visitor.visit(self);
    }
}
