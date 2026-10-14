use systems::{
    air_conditioning::{
        AirConditioningOverheadShared, Channel, FdacId, OperatingChannel, PackFlow,
        PackFlowControllers, PackFlowValveSignal, PressurizationOverheadShared,
    },
    failures::{Failure, FailureType},
    pneumatic::{EngineState, PneumaticValveSignal},
    shared::{
        pid::PidController, ControllerSignal, ElectricalBusType, EngineBleedPushbutton,
        EngineCorrectedN1, EngineFirePushButtons, EngineStartState, PackFlowValveState,
        PneumaticBleed,
    },
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};

use std::time::Duration;
use uom::si::{
    f64::*,
    mass_rate::kilogram_per_second,
    ratio::{percent, ratio},
    thermodynamic_temperature::degree_celsius,
};

#[derive(Debug)]
enum FdacFault {
    OneChannelFault,
    BothChannelsFault,
}

#[derive(Clone, Copy)]
enum FcvFault {
    PositionDisagree,
    FdacBothChannelsFault,
    //More to be added
}

pub struct FullDigitalAGUController<const ENGINES: usize> {
    fdac_channel_1_failure_id: VariableIdentifier,
    fdac_channel_2_failure_id: VariableIdentifier,

    active_channel: OperatingChannel,
    stand_by_channel: OperatingChannel,
    flow_control: FDACFlowControl<ENGINES>,
    // agu_control
    fault: Option<FdacFault>,

    /// The pack outlet temperature is above the overheat limit (AIR PACK 1(2) OVHT)
    pack_overheat: bool,
    /// flyPad failure: the pack is in bypass mode, its performance is degraded (AIR PACK 1(2) REGUL FAULT)
    pack_regulation_failure: Failure,
}

impl<const ENGINES: usize> FullDigitalAGUController<ENGINES> {
    pub fn new(
        context: &mut InitContext,
        fdac_id: FdacId,
        powered_by: [ElectricalBusType; 2],
    ) -> Self {
        Self {
            fdac_channel_1_failure_id: context
                .get_identifier(format!("COND_FDAC_{}_CHANNEL_1_FAILURE", fdac_id)),
            fdac_channel_2_failure_id: context
                .get_identifier(format!("COND_FDAC_{}_CHANNEL_2_FAILURE", fdac_id)),

            active_channel: OperatingChannel::new(
                1,
                Some(FailureType::Fdac(fdac_id, Channel::ChannelOne)),
                &[powered_by[0]],
            ),
            stand_by_channel: OperatingChannel::new(
                2,
                Some(FailureType::Fdac(fdac_id, Channel::ChannelTwo)),
                &[powered_by[1]],
            ),
            flow_control: FDACFlowControl::new(fdac_id.into()),
            // agu_control
            fault: None,

            pack_overheat: false,
            // FDAC 1 controls pack 1 and FDAC 2 pack 2
            pack_regulation_failure: Failure::new(FailureType::PackRegulation(fdac_id.into())),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        acs_overhead: &impl AirConditioningOverheadShared,
        any_door_open: bool,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        engines: [&impl EngineCorrectedN1; ENGINES],
        pack_flow_demand: &impl PackFlow,
        pneumatic: &(impl EngineStartState + PackFlowValveState + PneumaticBleed),
        pneumatic_overhead: &impl EngineBleedPushbutton<ENGINES>,
        pressurization_overhead: &impl PressurizationOverheadShared,
    ) {
        self.fault_determination();

        self.flow_control.update(
            context,
            acs_overhead,
            any_door_open,
            engine_fire_push_buttons,
            engines,
            matches!(self.fault, Some(FdacFault::BothChannelsFault)),
            pack_flow_demand,
            pneumatic,
            pneumatic_overhead,
            pressurization_overhead,
        )
    }

    fn fault_determination(&mut self) {
        self.active_channel.update_fault();
        self.stand_by_channel.update_fault();

        self.fault = match (
            self.active_channel.has_fault(),
            self.stand_by_channel.has_fault(),
        ) {
            (true, true) => Some(FdacFault::BothChannelsFault),
            (false, false) => None,
            (ac, _) => {
                if ac {
                    self.switch_active_channel();
                }
                Some(FdacFault::OneChannelFault)
            }
        };
    }

    fn switch_active_channel(&mut self) {
        std::mem::swap(&mut self.stand_by_channel, &mut self.active_channel);
    }

    pub fn fcv_status_determination(&self, fcv_id: usize) -> bool {
        self.flow_control.fcv_has_fault(fcv_id)
    }

    /// The FDAC monitors its pack and its valves while at least one of its channels operates
    fn is_monitoring(&self) -> bool {
        !matches!(self.fault, Some(FdacFault::BothChannelsFault))
    }

    /// Pack overheat monitoring, from the pack outlet temperature (AIR PACK 1(2) OVHT, a380_fcom.txt l.131799)
    pub fn update_pack_overheat_monitoring(
        &mut self,
        pack_outlet_temperature: ThermodynamicTemperature,
    ) {
        self.pack_overheat = self.is_monitoring()
            && pack_outlet_temperature
                > ThermodynamicTemperature::new::<degree_celsius>(Self::PACK_OVERHEAT_LIMIT_DEG_C);
    }

    /// The pack outlet temperature is above 95 deg C
    pub fn pack_overheat(&self) -> bool {
        self.pack_overheat
    }

    /// The pack is in bypass mode (AIR PACK 1(2) REGUL FAULT, a380_fcom.txt l.131857-131859). Simplified: the pack
    /// performance itself is not simulated, only the FDAC report.
    pub fn pack_in_bypass_mode(&self) -> bool {
        self.is_monitoring() && self.pack_regulation_failure.is_active()
    }

    /// Pack flow valve fcv_id is open against a close command (AIR PACK 1(2) VLV 1(2) FAULT)
    pub fn fcv_failed_open(&self, fcv_id: usize) -> bool {
        self.is_monitoring() && self.flow_control.fcv_failed_open(fcv_id)
    }

    /// Pack flow valve fcv_id is closed against an open command (AIR PACK 1(2) VLV 1(2) FAULT)
    pub fn fcv_failed_closed(&self, fcv_id: usize) -> bool {
        self.is_monitoring() && self.flow_control.fcv_failed_closed(fcv_id)
    }
}

impl<const ENGINES: usize> FullDigitalAGUController<ENGINES> {
    /// A380 FCOM PRO-ABN-ECAM-10-21-10 AIR PACK 1(2) OVHT (a380_fcom.txt l.131799): "The pack outlet temperature is
    /// above 95 deg C."
    const PACK_OVERHEAT_LIMIT_DEG_C: f64 = 95.;
}

impl<const ENGINES: usize> PackFlow for FullDigitalAGUController<ENGINES> {
    fn pack_flow(&self) -> MassRate {
        self.flow_control.pack_flow()
    }
}

impl<const ENGINES: usize> PackFlowControllers for FullDigitalAGUController<ENGINES> {
    type PackFlowControllerSignal = PackFlowController<ENGINES>;

    fn pack_flow_controller(&self, fcv_id: usize) -> &Self::PackFlowControllerSignal {
        self.flow_control.pack_flow_controller(fcv_id)
    }
}

impl<const ENGINES: usize> SimulationElement for FullDigitalAGUController<ENGINES> {
    fn write(&self, writer: &mut SimulatorWriter) {
        let (channel_1_failure, channel_2_failure) = match self.fault {
            None => (false, false),
            Some(FdacFault::OneChannelFault) => (
                self.stand_by_channel.id() == Channel::ChannelOne,
                self.stand_by_channel.id() == Channel::ChannelTwo,
            ),
            Some(FdacFault::BothChannelsFault) => (true, true),
        };
        writer.write(&self.fdac_channel_1_failure_id, channel_1_failure);
        writer.write(&self.fdac_channel_2_failure_id, channel_2_failure);
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.active_channel.accept(visitor);
        self.stand_by_channel.accept(visitor);
        self.pack_regulation_failure.accept(visitor);

        visitor.visit(self);
    }
}

/// Each FDAC controls two FCV, FDAC 1 controls the left side (engine 1 & 2)
/// and FDAC 2 controls the right side (engine 3 & 4)
struct FDACFlowControl<const ENGINES: usize> {
    fdac_id: usize, // 1 or 2
    flow_control_valves_controller: [PackFlowController<ENGINES>; 2],
    fcv_open_allowed: [bool; 2],
    should_open_fcv: [bool; 2],
}

impl<const ENGINES: usize> FDACFlowControl<ENGINES> {
    fn new(fdac_id: usize) -> Self {
        Self {
            fdac_id,
            flow_control_valves_controller: [PackFlowController::new(); 2],
            fcv_open_allowed: [false; 2],
            should_open_fcv: [false; 2],
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        acs_overhead: &impl AirConditioningOverheadShared,
        any_door_open: bool,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        engines: [&impl EngineCorrectedN1; ENGINES],
        fdac_both_channels_fault: bool,
        pack_flow_demand: &impl PackFlow,
        pneumatic: &(impl EngineStartState + PackFlowValveState + PneumaticBleed),
        pneumatic_overhead: &impl EngineBleedPushbutton<ENGINES>,
        pressurization_overhead: &impl PressurizationOverheadShared,
    ) {
        let fcv_id = [1, 2].map(|i| i + ((self.fdac_id == 2) as usize * 2));

        self.fcv_open_allowed = fcv_id.map(|id| {
            self.fcv_open_allowed_determination(
                acs_overhead,
                any_door_open,
                engine_fire_push_buttons,
                id,
                fdac_both_channels_fault,
                pressurization_overhead,
                pneumatic,
            )
        });

        self.should_open_fcv = fcv_id
            .iter()
            .zip(self.fcv_open_allowed)
            .map(|(&fcv, fcv_open_allowed)| {
                fcv_open_allowed && self.can_move_fcv(engines, fcv, pneumatic, pneumatic_overhead)
            })
            .collect::<Vec<_>>()
            .try_into()
            .unwrap_or_else(|v: Vec<_>| {
                panic!(
                    "Expected a Vec of length {} but it was {}",
                    self.should_open_fcv.len(),
                    v.len()
                )
            });

        // At the moment we split the demand of the pack between the two FCV equally
        // TODO: Add provision in case one of the valves fails
        self.flow_control_valves_controller
            .iter_mut()
            .enumerate()
            .for_each(|(id, controller)| {
                controller.update(
                    context,
                    fcv_id[id],
                    self.fcv_open_allowed[id],
                    fdac_both_channels_fault,
                    self.should_open_fcv[id],
                    pack_flow_demand.pack_flow_demand(self.fdac_id.into()) / 2.,
                    pneumatic,
                )
            });
    }

    fn fcv_open_allowed_determination(
        &mut self,
        acs_overhead: &impl AirConditioningOverheadShared,
        any_door_open: bool,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        fcv_id: usize,
        fdac_both_channels_fault: bool,
        pressurization_overhead: &impl PressurizationOverheadShared,
        pneumatic: &(impl PneumaticBleed + EngineStartState),
    ) -> bool {
        let onside_engine_numbers = [1, 2].map(|i| i + ((self.fdac_id == 2) as usize * 2));
        // The pack flow valve closes when:
        // The associated PACK pbs is set to off
        !(!acs_overhead.pack_pushbuttons_state()[self.fdac_id - 1]
            // The FIRE pb of the associated engine is pressed
            || engine_fire_push_buttons.is_released(fcv_id)
            // One onside engine starts, and the crossbleed valves are closed
            || onside_engine_numbers
                .iter()
                .any(|engine| pneumatic.engine_state(*engine) == EngineState::Starting)
                && !pneumatic.engine_crossbleed_is_on()
            // Any engine starts, and the crossbleed valves are opened
            || (1..=4).any(|engine| pneumatic.engine_state(engine) == EngineState::Starting)
                && pneumatic.engine_crossbleed_is_on()
            // The DITCHING pb-sw is set to ON
            || pressurization_overhead.ditching_is_on()
            // A leak is detected in the pack bay: "the two pack valves of the affected pack ...
            // automatically close" (A380 FCOM DSC-36-10-60, a380_fcom.txt l.94220-94222)
            || pneumatic.pack_valves_closed_by_leak(self.fdac_id))
            // On ground, one door (or more) is opened, and at least one engine is running
            && !(any_door_open
                && (1..=4).any(|engine| pneumatic.engine_state(engine) == EngineState::On))
            // Both channels of the corresponding FDAC have failed
            && !fdac_both_channels_fault
        // && ! pack overheat
        // && mixer unit burst
    }

    fn can_move_fcv(
        &self,
        engines: [&impl EngineCorrectedN1; ENGINES],
        fcv_id: usize,
        pneumatic: &(impl PneumaticBleed + EngineStartState),
        pneumatic_overhead: &impl EngineBleedPushbutton<ENGINES>,
    ) -> bool {
        ((engines[fcv_id - 1].corrected_n1() >= Ratio::new::<percent>(15.)
            && pneumatic_overhead.engine_bleed_pushbuttons_are_auto()[fcv_id - 1])
            || (engines
                .iter()
                .any(|e| e.corrected_n1() >= Ratio::new::<percent>(15.))
                && pneumatic_overhead
                    .engine_bleed_pushbuttons_are_auto()
                    .iter()
                    .any(|pb| *pb)
                && pneumatic.engine_crossbleed_is_on()))
            || pneumatic.apu_bleed_is_on()
    }

    pub fn fcv_has_fault(&self, fcv_id: usize) -> bool {
        self.flow_control_valves_controller[fcv_id - 1 - ((self.fdac_id == 2) as usize * 2)]
            .fault()
            .is_some()
    }

    fn fcv_failed_open(&self, fcv_id: usize) -> bool {
        self.flow_control_valves_controller[fcv_id - 1 - ((self.fdac_id == 2) as usize * 2)]
            .failed_open()
    }

    fn fcv_failed_closed(&self, fcv_id: usize) -> bool {
        self.flow_control_valves_controller[fcv_id - 1 - ((self.fdac_id == 2) as usize * 2)]
            .failed_closed()
    }
}

impl<const ENGINES: usize> PackFlow for FDACFlowControl<ENGINES> {
    fn pack_flow(&self) -> MassRate {
        self.flow_control_valves_controller[0].pack_flow()
            + self.flow_control_valves_controller[1].pack_flow()
    }
}

impl<const ENGINES: usize> PackFlowControllers for FDACFlowControl<ENGINES> {
    type PackFlowControllerSignal = PackFlowController<ENGINES>;

    fn pack_flow_controller(&self, fcv_id: usize) -> &Self::PackFlowControllerSignal {
        &self.flow_control_valves_controller[fcv_id - 1 - ((self.fdac_id == 2) as usize * 2)]
    }
}

#[derive(Copy, Clone)]
pub struct PackFlowController<const ENGINES: usize> {
    should_open_fcv: bool,
    pack_flow: MassRate,
    pid: PidController,
    fault: Option<FcvFault>,

    // Failed valve monitoring (AIR PACK 1(2) VLV 1(2) FAULT): how long the valve position has disagreed with the
    // command, and the confirmed result
    failed_open_timer: Duration,
    failed_closed_timer: Duration,
    failed_open: bool,
    failed_closed: bool,
}

impl<const ENGINES: usize> PackFlowController<ENGINES> {
    // Design choice (the FCOM gives no detection logic): a pack flow valve is failed when its position disagrees with
    // its command for this long, as the trim air valves of the TADD (trim_air_drive_device.rs). A healthy valve
    // follows its command in the next update.
    const FAILED_VALVE_CONFIRMATION_TIME: Duration = Duration::from_secs(10);

    fn new() -> Self {
        Self {
            should_open_fcv: false,
            pack_flow: MassRate::default(),
            pid: PidController::new(0.01, 0.4, 0., 0., 1., 0., 1.),
            fault: None,

            failed_open_timer: Duration::ZERO,
            failed_closed_timer: Duration::ZERO,
            failed_open: false,
            failed_closed: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        fcv_id: usize,
        fcv_open_allowed: bool,
        fdac_both_channels_fault: bool,
        should_open_fcv: bool,
        pack_flow_demand: MassRate,
        pneumatic: &impl PackFlowValveState,
    ) {
        self.fault_determination(
            fcv_id,
            fcv_open_allowed,
            fdac_both_channels_fault,
            pneumatic,
        );

        self.should_open_fcv = should_open_fcv;
        self.pack_flow = pneumatic.pack_flow_valve_air_flow(fcv_id);

        if self.should_open_fcv {
            self.pid
                .change_setpoint(pack_flow_demand.get::<kilogram_per_second>().max(0.));
            self.pid.next_control_output(
                self.pack_flow.get::<kilogram_per_second>(),
                Some(context.delta()),
            );
        }

        self.failed_valve_monitoring(context, pneumatic.pack_flow_valve_is_open(fcv_id));
    }

    /// AIR PACK 1(2) VLV 1(2) FAULT (a380_fcom.txt l.131946-131949): a pack valve is failed open when it stays open
    /// while commanded closed, failed closed when it stays closed while commanded open. A jammed valve is only found
    /// when its command changes (l.131972-131974: the FAULT light of a valve failed open comes on with the PACK pb
    /// set to OFF).
    fn failed_valve_monitoring(&mut self, context: &UpdateContext, valve_is_open: bool) {
        let commanded_open = self.commanded_open_amount() > Ratio::default();

        if !commanded_open && valve_is_open {
            self.failed_open_timer += context.delta();
        } else {
            self.failed_open_timer = Duration::ZERO;
        }
        if commanded_open && !valve_is_open {
            self.failed_closed_timer += context.delta();
        } else {
            self.failed_closed_timer = Duration::ZERO;
        }

        self.failed_open = self.failed_open_timer > Self::FAILED_VALVE_CONFIRMATION_TIME;
        self.failed_closed = self.failed_closed_timer > Self::FAILED_VALVE_CONFIRMATION_TIME;
    }

    /// The open amount this controller commands to its valve
    fn commanded_open_amount(&self) -> Ratio {
        Ratio::new::<ratio>(if self.should_open_fcv {
            self.pid.output()
        } else {
            0.
        })
    }

    fn failed_open(&self) -> bool {
        self.failed_open
    }

    fn failed_closed(&self) -> bool {
        self.failed_closed
    }

    fn fault_determination(
        &mut self,
        fcv_id: usize,
        fcv_open_allowed: bool,
        fdac_both_channels_fault: bool,
        pneumatic: &impl PackFlowValveState,
    ) {
        self.fault = if fcv_open_allowed != pneumatic.pack_flow_valve_is_open(fcv_id) {
            Some(FcvFault::PositionDisagree)
        } else if fdac_both_channels_fault {
            Some(FcvFault::FdacBothChannelsFault)
        } else {
            None
        }
    }

    fn fault(&self) -> Option<FcvFault> {
        self.fault
    }
}

impl<const ENGINES: usize> PackFlow for PackFlowController<ENGINES> {
    fn pack_flow(&self) -> MassRate {
        self.pack_flow
    }
}

impl<const ENGINES: usize> ControllerSignal<PackFlowValveSignal> for PackFlowController<ENGINES> {
    fn signal(&self) -> Option<PackFlowValveSignal> {
        Some(PackFlowValveSignal::new(self.commanded_open_amount()))
    }
}
