use super::{
    alternating_current::A380AlternatingCurrentElectrical, distribution::A380PowerDistribution,
    A380ElectricalOverheadPanel,
};
use systems::electrical::{AlternatingCurrentElectricalSystem, Electricity};

/// The cabin sides of the galleys, numbered as the COMMERCIAL pb-sw that sheds the commercial loads of the upper left
/// (1) or right (2) cabin supply centers.
const CABIN_SIDES: [usize; 2] = [1, 2];

/// The galleys of both cabin sides, each side with its main and secondary galleys.
/// - GALY AND CAB pb-sw OFF sheds all galleys.
/// - COMMERCIAL 1 (2) pb-sw OFF sheds the galleys of the left (right) cabin side; both OFF shed them all.
/// - The automatic load shedding (only one or two generators supply the network, generator overload risk) sheds the
///   main galleys only.
/// - A failed primary supply centre loses the galleys of its cabin side (ELEC PRIMARY SUPPLY CENTER 1(2) FAULT:
///   COMMERCIAL or PART COMMERCIAL lost).
/// - A failed ENMU sheds the galleys it controls (ELEC ELEC NETWORK MANAGEMENT 1(2) FAULT: PART GALLEY). Design choice:
///   the main galleys of its cabin side, ENMU 1 the left side and ENMU 2 the right side, as the power sources.
pub(super) struct Galleys {
    /// Main galleys of the left (index 0, COMMERCIAL 1) and right (index 1, COMMERCIAL 2) cabin sides
    main_is_shed: [bool; 2],
    /// Secondary galleys, same sides
    secondary_is_shed: [bool; 2],
}
impl Galleys {
    pub fn new() -> Self {
        Self {
            main_is_shed: [false; 2],
            secondary_is_shed: [false; 2],
        }
    }

    pub fn any_is_shed(&self) -> bool {
        self.main_is_shed
            .iter()
            .chain(self.secondary_is_shed.iter())
            .any(|&is_shed| is_shed)
    }

    pub fn all_are_shed(&self) -> bool {
        self.main_is_shed
            .iter()
            .chain(self.secondary_is_shed.iter())
            .all(|&is_shed| is_shed)
    }

    pub fn update(
        &mut self,
        electricity: &Electricity,
        alternating_current: &A380AlternatingCurrentElectrical,
        overhead: &A380ElectricalOverheadPanel,
        distribution: &A380PowerDistribution,
    ) {
        let no_main_ac_busbar_powered =
            !alternating_current.any_non_essential_bus_powered(electricity);
        let generator_overload =
            alternating_current.main_ac_buses_powered_by_two_generators_only(electricity);

        for (index, &side) in CABIN_SIDES.iter().enumerate() {
            let side_is_unpowered_or_manually_shed = no_main_ac_busbar_powered
                || overhead.galy_and_cab_is_off()
                || overhead.commercial_is_off(side)
                || distribution.primary_supply_centre_failed(side);

            self.secondary_is_shed[index] = side_is_unpowered_or_manually_shed;
            self.main_is_shed[index] = side_is_unpowered_or_manually_shed
                || generator_overload
                || distribution.network_management_unit_failed(side);
        }
    }
}
