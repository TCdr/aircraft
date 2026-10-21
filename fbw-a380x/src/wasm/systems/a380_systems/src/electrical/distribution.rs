use systems::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter,
        VariableIdentifier, Write,
    },
};

/// The failures of the primary supply centres and of the units that manage the electrical network: the two
/// electrical network management units (ENMU 1 controls the left side power sources, ENMU 2 the right side) and the
/// electrical load management unit (ELMU, the shedding of the commercial loads).
pub(super) struct A380PowerDistribution {
    primary_supply_centre_failures: [Failure; 2],
    network_management_unit_failures: [Failure; 2],
    load_management_unit_failure: Failure,
    elmu_pb_has_fault_id: VariableIdentifier,
}
impl A380PowerDistribution {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            primary_supply_centre_failures: [1, 2]
                .map(|n| Failure::new(FailureType::ElectricalPrimarySupplyCentre(n))),
            network_management_unit_failures: [1, 2]
                .map(|n| Failure::new(FailureType::ElectricalNetworkManagementUnit(n))),
            load_management_unit_failure: Failure::new(FailureType::ElectricalLoadManagementUnit),
            elmu_pb_has_fault_id: context
                .get_unprefixed_identifier("A380X_OVHD_ELEC_ELMU_PB_HAS_FAULT".to_owned()),
        }
    }

    /// Primary supply centre 1 (2) distributes the high loads of the left (right) side, among them the commercial
    /// loads of cabin side 1 (2).
    pub fn primary_supply_centre_failed(&self, number: usize) -> bool {
        self.primary_supply_centre_failures[number - 1].is_active()
    }

    pub fn network_management_unit_failed(&self, number: usize) -> bool {
        self.network_management_unit_failures[number - 1].is_active()
    }

    /// The ENMU of each side, in the order of the APU generators (A, B) and of the external power units (1+2, 3+4)
    pub fn network_management_units_failed(&self) -> [bool; 2] {
        [1, 2].map(|n| self.network_management_unit_failed(n))
    }
}
impl SimulationElement for A380PowerDistribution {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.primary_supply_centre_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.network_management_unit_failures
            .iter_mut()
            .for_each(|failure| failure.accept(visitor));
        self.load_management_unit_failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.elmu_pb_has_fault_id,
            self.load_management_unit_failure.is_active(),
        );
    }
}
