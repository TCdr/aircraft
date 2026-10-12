use super::{
    A320AlternatingCurrentElectricalSystem, A320DirectCurrentElectricalSystem,
    A320ElectricalOverheadPanel,
};
use systems::shared::AdirsDiscreteOutputs;
use systems::simulation::InitContext;
use systems::{
    electrical::{
        Battery, BatteryChargeLimiter, Contactor, ElectricalBus, ElectricalElement, Electricity,
        EmergencyElectrical, EmergencyGenerator, StaticInverter,
    },
    shared::{
        ApuMaster, ApuStart, AuxiliaryPowerUnitElectrical, ContactorSignal, ElectricalBusType,
        LgciuWeightOnWheels,
    },
    simulation::{SimulationElement, SimulationElementVisitor, UpdateContext},
};

pub(crate) const APU_START_MOTOR_BUS_TYPE: ElectricalBusType = ElectricalBusType::Sub("49-42-00");

pub(super) struct A320DirectCurrentElectrical {
    dc_bus_1: ElectricalBus,
    dc_bus_2: ElectricalBus,
    dc_bus_1_tie_contactor: Contactor,
    dc_bus_2_tie_contactor: Contactor,
    dc_bat_bus: ElectricalBus,
    dc_ess_bus: ElectricalBus,
    dc_bat_bus_to_dc_ess_bus_contactor: Contactor,
    dc_ess_shed_bus: ElectricalBus,
    dc_ess_shed_contactor: Contactor,
    battery_1: Battery,
    battery_1_contactor: Contactor,
    battery_1_charge_limiter: BatteryChargeLimiter,
    battery_2: Battery,
    battery_2_contactor: Contactor,
    battery_2_charge_limiter: BatteryChargeLimiter,
    hot_bus_2_to_dc_ess_bus_contactor: Contactor,
    hot_bus_1_to_static_inv_contactor: Contactor,
    static_inverter: StaticInverter,
    hot_bus_1: ElectricalBus,
    hot_bus_2: ElectricalBus,
    tr_1_contactor: Contactor,
    tr_2_contactor: Contactor,
    tr_ess_contactor: Contactor,
    apu_start_contactors: Contactor,
    apu_start_motor_bus: ElectricalBus,
    dc_gnd_flt_service_bus: ElectricalBus,
    tr_2_to_dc_gnd_flt_service_bus_contactor: Contactor,
    dc_bus_2_to_dc_gnd_flt_service_bus_contactor: Contactor,
}
impl A320DirectCurrentElectrical {
    pub fn new(context: &mut InitContext) -> Self {
        A320DirectCurrentElectrical {
            dc_bus_1: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
            dc_bus_1_tie_contactor: Contactor::new(context, "1PC1"),
            dc_bus_2: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
            dc_bus_2_tie_contactor: Contactor::new(context, "1PC2"),
            dc_bat_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentBattery),
            dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
            dc_bat_bus_to_dc_ess_bus_contactor: Contactor::new(context, "4PC"),
            dc_ess_shed_bus: ElectricalBus::new(
                context,
                ElectricalBusType::DirectCurrentEssentialShed,
            ),
            dc_ess_shed_contactor: Contactor::new(context, "8PH"),
            battery_1: Battery::full(context, 1),
            battery_1_contactor: Contactor::new(context, "6PB1"),
            battery_1_charge_limiter: BatteryChargeLimiter::new(context, 1, "6PB1"),
            battery_2: Battery::full(context, 2),
            battery_2_contactor: Contactor::new(context, "6PB2"),
            battery_2_charge_limiter: BatteryChargeLimiter::new(context, 2, "6PB2"),
            hot_bus_2_to_dc_ess_bus_contactor: Contactor::new(context, "2XB2"),
            hot_bus_1_to_static_inv_contactor: Contactor::new(context, "2XB1"),
            static_inverter: StaticInverter::new(context),
            hot_bus_1: ElectricalBus::new(context, ElectricalBusType::DirectCurrentHot(1)),
            hot_bus_2: ElectricalBus::new(context, ElectricalBusType::DirectCurrentHot(2)),
            tr_1_contactor: Contactor::new(context, "5PU1"),
            tr_2_contactor: Contactor::new(context, "5PU2"),
            tr_ess_contactor: Contactor::new(context, "3PE"),
            apu_start_contactors: Contactor::new(context, "10KA_AND_5KA"),
            apu_start_motor_bus: ElectricalBus::new(context, APU_START_MOTOR_BUS_TYPE),
            dc_gnd_flt_service_bus: ElectricalBus::new(
                context,
                ElectricalBusType::DirectCurrentGndFltService,
            ),
            tr_2_to_dc_gnd_flt_service_bus_contactor: Contactor::new(context, "3PX"),
            dc_bus_2_to_dc_gnd_flt_service_bus_contactor: Contactor::new(context, "8PN"),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        electricity: &mut Electricity,
        overhead: &A320ElectricalOverheadPanel,
        ac_state: &impl A320AlternatingCurrentElectricalSystem,
        emergency_elec: &EmergencyElectrical,
        emergency_generator: &EmergencyGenerator,
        apu: &mut impl AuxiliaryPowerUnitElectrical,
        apu_overhead: &(impl ApuMaster + ApuStart),
        lgciu1: &impl LgciuWeightOnWheels,
        adirs: &impl AdirsDiscreteOutputs,
        spd_cond: bool,
    ) {
        self.tr_1_contactor
            .close_when(electricity.is_powered(ac_state.tr_1()));
        electricity.flow(ac_state.tr_1(), &self.tr_1_contactor);

        self.tr_2_contactor.close_when(
            electricity.is_powered(ac_state.tr_2()) && ac_state.ac_bus_2_powered(electricity),
        );
        electricity.flow(ac_state.tr_2(), &self.tr_2_contactor);

        self.tr_2_to_dc_gnd_flt_service_bus_contactor.close_when(
            electricity.is_powered(ac_state.tr_2()) && !ac_state.ac_bus_2_powered(electricity),
        );
        electricity.flow(
            ac_state.tr_2(),
            &self.tr_2_to_dc_gnd_flt_service_bus_contactor,
        );

        electricity.flow(&self.tr_1_contactor, &self.dc_bus_1);
        electricity.flow(&self.tr_2_contactor, &self.dc_bus_2);

        self.dc_bus_2_to_dc_gnd_flt_service_bus_contactor
            .close_when(
                electricity.is_powered(ac_state.tr_2()) && ac_state.ac_bus_2_powered(electricity),
            );
        electricity.flow(
            &self.dc_bus_2,
            &self.dc_bus_2_to_dc_gnd_flt_service_bus_contactor,
        );

        electricity.flow(
            &self.tr_2_to_dc_gnd_flt_service_bus_contactor,
            &self.dc_gnd_flt_service_bus,
        );
        electricity.flow(
            &self.dc_bus_2_to_dc_gnd_flt_service_bus_contactor,
            &self.dc_gnd_flt_service_bus,
        );

        let dc_bus_1_is_powered = electricity.is_powered(&self.dc_bus_1);
        let dc_bus_2_is_powered = electricity.is_powered(&self.dc_bus_2);
        self.dc_bus_1_tie_contactor
            .close_when(dc_bus_1_is_powered || dc_bus_2_is_powered);
        self.dc_bus_2_tie_contactor.close_when(
            (!dc_bus_1_is_powered && dc_bus_2_is_powered)
                || (!dc_bus_2_is_powered && dc_bus_1_is_powered),
        );
        // The DC buses flow into their tie contactors only once these are set for this update: a
        // flow through a contactor still open from the previous update left the DC BAT BUS, and the
        // DC ESS BUS behind it, unpowered for one update each time a DC bus was lost or came back
        // (the computers on the DC ESS / DC ESS SHED BUS restarted, the FCU dropped the AP).
        electricity.flow(&self.dc_bus_1, &self.dc_bus_1_tie_contactor);
        electricity.flow(&self.dc_bus_2, &self.dc_bus_2_tie_contactor);

        // The ESS TR takes over the DC ESS BUS when its normal supply (DC BAT BUS, from DC BUS 1 or 2)
        // is lost, see normal_dc_ess_supply_lost()
        let normal_dc_ess_supply_lost = Self::normal_dc_ess_supply_lost(
            ac_state.tr_1_and_2_available(electricity),
            self.dc_bus_1_and_2_busbars_lost(),
        );
        self.tr_ess_contactor
            .close_when(normal_dc_ess_supply_lost && electricity.is_powered(ac_state.tr_ess()));
        electricity.flow(ac_state.tr_ess(), &self.tr_ess_contactor);

        electricity.flow(&self.dc_bus_1_tie_contactor, &self.dc_bat_bus);
        electricity.flow(&self.dc_bus_2_tie_contactor, &self.dc_bat_bus);

        electricity.supplied_by(&self.battery_1);
        self.battery_1_charge_limiter.update(
            context,
            electricity,
            emergency_elec,
            emergency_generator,
            &self.battery_1,
            &self.dc_bat_bus,
            lgciu1,
            overhead,
            apu,
            apu_overhead,
            ac_state,
            adirs,
        );
        self.battery_1_contactor
            .close_when(self.battery_1_charge_limiter.should_close_contactor());
        electricity.flow(&self.dc_bat_bus, &self.battery_1_contactor);
        electricity.flow(&self.battery_1_contactor, &self.hot_bus_1);
        electricity.flow(&self.hot_bus_1, &self.battery_1);
        // Design choice: the monitoring of the static inverter is supplied by the DC HOT BUS 1,
        // which BAT 1 always supplies. The inverter then reports its failure also while it does
        // not convert (ELEC STAT INV FAULT, A320 FCOM PRO-ABN-ELEC l.78211: "The alert triggers
        // when the static inverter is failed.").
        self.static_inverter
            .update_monitoring(electricity.is_powered(&self.hot_bus_1));

        electricity.supplied_by(&self.battery_2);
        self.battery_2_charge_limiter.update(
            context,
            electricity,
            emergency_elec,
            emergency_generator,
            &self.battery_2,
            &self.dc_bat_bus,
            lgciu1,
            overhead,
            apu,
            apu_overhead,
            ac_state,
            adirs,
        );
        self.battery_2_contactor
            .close_when(self.battery_2_charge_limiter.should_close_contactor());
        electricity.flow(&self.dc_bat_bus, &self.battery_2_contactor);
        electricity.flow(&self.battery_2_contactor, &self.hot_bus_2);
        electricity.flow(&self.hot_bus_2, &self.battery_2);

        self.apu_start_contactors.close_when(
            self.battery_1_contactor.is_closed()
                && self.battery_2_contactor.is_closed()
                && matches!(apu.signal(), Some(ContactorSignal::Close)),
        );
        electricity.flow(&self.dc_bat_bus, &self.apu_start_contactors);
        electricity.flow(&self.apu_start_contactors, &self.apu_start_motor_bus);

        let should_close_2xb_contactor =
            self.should_close_2xb_contactors(electricity, emergency_generator, ac_state, spd_cond);
        self.hot_bus_1_to_static_inv_contactor
            .close_when(should_close_2xb_contactor);
        electricity.flow(&self.hot_bus_1, &self.hot_bus_1_to_static_inv_contactor);
        electricity.flow(
            &self.hot_bus_1_to_static_inv_contactor,
            &self.static_inverter,
        );
        electricity.transform_in(&self.static_inverter);

        self.hot_bus_2_to_dc_ess_bus_contactor
            .close_when(should_close_2xb_contactor);
        electricity.flow(&self.hot_bus_2, &self.hot_bus_2_to_dc_ess_bus_contactor);

        // Opens whenever the ESS TR supplies the DC ESS BUS (never two sources on one bus)
        self.dc_bat_bus_to_dc_ess_bus_contactor
            .close_when(!normal_dc_ess_supply_lost);
        electricity.flow(&self.dc_bat_bus, &self.dc_bat_bus_to_dc_ess_bus_contactor);

        electricity.flow(&self.dc_bat_bus_to_dc_ess_bus_contactor, &self.dc_ess_bus);
        electricity.flow(&self.tr_ess_contactor, &self.dc_ess_bus);
        electricity.flow(&self.hot_bus_2_to_dc_ess_bus_contactor, &self.dc_ess_bus);

        self.dc_ess_shed_contactor
            .close_when(self.hot_bus_2_to_dc_ess_bus_contactor.is_open());
        electricity.flow(&self.dc_ess_bus, &self.dc_ess_shed_contactor);

        electricity.flow(&self.dc_ess_shed_contactor, &self.dc_ess_shed_bus);
    }

    /// The DC ESS BUS normally comes from the DC BAT BUS, which DC BUS 1 or DC BUS 2 feeds. The ESS TR
    /// takes over when:
    /// - TR 1 and TR 2 are lost (FCOM DSC-24-10-30-30, a320_fcom.txt l.36766: "If TR 1 and TR 2 are
    ///   lost, DC BUS 1, DC BUS 2, and DC BAT BUS are lost. The DC ESS BUS is supplied by the ESS TR."),
    /// - or the DC BUS 1 and DC BUS 2 busbars themselves are lost while their TRs still work. ELEC DC
    ///   BUS 1+2 FAULT (FCOM PRO-ABN-ELEC, l.76800-76906) loses the DC BAT BUS (associated procedure
    ///   ELEC DC BAT BUS FAULT) but keeps FAC 1, AP 1, FCDC 1 and CAB PR 1, all DC ESS BUS users, out
    ///   of its INOP SYS, and its STATUS shows "BOTH PFD ON SAME FAC": the DC ESS BUS stays supplied.
    ///   Design choice: the FCOM does not say how this loss is detected; it is modelled on the busbar
    ///   failures, the only way to lose both DC buses while TR 1 and TR 2 are available.
    pub fn normal_dc_ess_supply_lost(
        tr_1_and_2_available: bool,
        dc_bus_1_and_2_busbars_lost: bool,
    ) -> bool {
        !tr_1_and_2_available || dc_bus_1_and_2_busbars_lost
    }

    /// True when both the DC BUS 1 and DC BUS 2 busbars have failed (they no longer conduct)
    pub fn dc_bus_1_and_2_busbars_lost(&self) -> bool {
        !self.dc_bus_1.is_conductive() && !self.dc_bus_2.is_conductive()
    }

    /// Determines if the 2XB contactors should be closed. 2XB are the two contactors
    /// which connect BAT2 to DC ESS BUS; and BAT 1 to the static inverter.
    fn should_close_2xb_contactors(
        &self,
        electricity: &Electricity,
        emergency_generator: &EmergencyGenerator,
        ac_state: &impl A320AlternatingCurrentElectricalSystem,
        spd_cond: bool,
    ) -> bool {
        !ac_state.any_non_essential_bus_powered(electricity)
            && !electricity.is_powered(emergency_generator)
            && (spd_cond || self.batteries_connected_to_bat_bus())
    }

    fn batteries_connected_to_bat_bus(&self) -> bool {
        self.battery_1_contactor.is_closed() && self.battery_2_contactor.is_closed()
    }

    pub fn debug_assert_invariants(&self) {
        debug_assert!(self.battery_never_powers_dc_ess_shed());
        debug_assert!(self.max_one_source_powers_dc_ess_bus());
        debug_assert!(
            self.batteries_power_both_static_inv_and_dc_ess_bus_at_the_same_time_or_not_at_all()
        );
    }

    fn battery_never_powers_dc_ess_shed(&self) -> bool {
        !(self.hot_bus_2_to_dc_ess_bus_contactor.is_closed()
            && self.dc_ess_shed_contactor.is_closed())
    }

    fn max_one_source_powers_dc_ess_bus(&self) -> bool {
        (!self.hot_bus_2_to_dc_ess_bus_contactor.is_closed()
            && !self.dc_bat_bus_to_dc_ess_bus_contactor.is_closed()
            && !self.tr_ess_contactor.is_closed())
            || (self.hot_bus_2_to_dc_ess_bus_contactor.is_closed()
                ^ self.dc_bat_bus_to_dc_ess_bus_contactor.is_closed()
                ^ self.tr_ess_contactor.is_closed())
    }

    fn batteries_power_both_static_inv_and_dc_ess_bus_at_the_same_time_or_not_at_all(
        &self,
    ) -> bool {
        self.hot_bus_1_to_static_inv_contactor.is_closed()
            == self.hot_bus_2_to_dc_ess_bus_contactor.is_closed()
    }

    /// The BAT push button FAULT light: the BCL saw an abnormal charge or has failed.
    pub fn battery_charge_limiter_has_fault(&self, number: usize) -> bool {
        if number == 1 {
            self.battery_1_charge_limiter.has_fault()
        } else {
            self.battery_2_charge_limiter.has_fault()
        }
    }

    #[cfg(test)]
    pub fn battery_1(&self) -> &Battery {
        &self.battery_1
    }

    #[cfg(test)]
    pub fn battery_2(&self) -> &Battery {
        &self.battery_2
    }

    #[cfg(test)]
    pub fn empty_battery_1(&mut self) {
        self.battery_1.set_empty_battery_charge();
    }

    #[cfg(test)]
    pub fn empty_battery_2(&mut self) {
        self.battery_2.set_empty_battery_charge();
    }
}
impl A320DirectCurrentElectricalSystem for A320DirectCurrentElectrical {
    fn static_inverter(&self) -> &StaticInverter {
        &self.static_inverter
    }
}
impl SimulationElement for A320DirectCurrentElectrical {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.battery_1.accept(visitor);
        self.battery_1_charge_limiter.accept(visitor);
        self.battery_2.accept(visitor);
        self.battery_2_charge_limiter.accept(visitor);
        self.static_inverter.accept(visitor);

        self.dc_bus_1_tie_contactor.accept(visitor);
        self.dc_bus_2_tie_contactor.accept(visitor);
        self.dc_bat_bus_to_dc_ess_bus_contactor.accept(visitor);
        self.dc_ess_shed_contactor.accept(visitor);
        self.battery_1_contactor.accept(visitor);
        self.battery_2_contactor.accept(visitor);
        self.hot_bus_2_to_dc_ess_bus_contactor.accept(visitor);
        self.hot_bus_1_to_static_inv_contactor.accept(visitor);
        self.tr_1_contactor.accept(visitor);
        self.tr_2_contactor.accept(visitor);
        self.tr_ess_contactor.accept(visitor);

        self.dc_bus_1.accept(visitor);
        self.dc_bus_2.accept(visitor);
        self.dc_bat_bus.accept(visitor);
        self.dc_ess_bus.accept(visitor);
        self.dc_ess_shed_bus.accept(visitor);
        self.hot_bus_1.accept(visitor);
        self.hot_bus_2.accept(visitor);

        self.apu_start_contactors.accept(visitor);
        self.apu_start_motor_bus.accept(visitor);

        self.dc_gnd_flt_service_bus.accept(visitor);
        self.tr_2_to_dc_gnd_flt_service_bus_contactor
            .accept(visitor);
        self.dc_bus_2_to_dc_gnd_flt_service_bus_contactor
            .accept(visitor);

        visitor.visit(self);
    }
}
