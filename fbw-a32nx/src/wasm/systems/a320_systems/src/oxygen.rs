use systems::simulation::{
    InitContext, Read, SimulationElement, SimulatorReader, SimulatorWriter, UpdateContext,
    VariableIdentifier, Write,
};
use uom::si::{f64::*, pressure::psi, ratio::ratio, thermodynamic_temperature::kelvin};

/// Models the crew oxygen bottle that feeds the pilots' masks and is displayed on the DOOR/OXY
/// ECAM page. There is no mask-donning interaction anywhere in this aircraft yet, so the only
/// modelled driver of a pressure change is the ideal gas law response to the bottle's
/// environment temperature (the bottle lives in the avionics compartment, so the cockpit duct
/// temperature - already computed by [`crate::air_conditioning::A320AirConditioning`] - is used
/// as a stand-in for that compartment), plus a very slow background leak.
///
/// No FCOM figure for *normal* background leakage could be sourced; maintenance documentation
/// only specifies an abnormal-fault threshold of roughly 48psi/day. [`Self::LEAK_RATIO_PER_SECOND`]
/// is a conservative placeholder intentionally far below that figure, so the bottle does not
/// noticeably deplete within a single flight - consistent with how these bottles behave in
/// service between scheduled recharges.
pub struct A320Oxygen {
    crew_bottle_pressure_id: VariableIdentifier,
    cockpit_duct_temperature_id: VariableIdentifier,

    cockpit_duct_temperature: ThermodynamicTemperature,
    charge_remaining: Ratio,
    pressure: Pressure,
}
impl A320Oxygen {
    /// Nominal full charge pressure at the reference temperature used when charging the bottle.
    const FULL_CHARGE_PRESSURE_PSI: f64 = 1850.;
    /// 70 degF / 21 degC, the standard reference temperature for the full charge pressure above.
    const REFERENCE_TEMPERATURE_KELVIN: f64 = 294.15;

    const LEAK_RATIO_PER_SECOND: f64 = 1e-8;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            crew_bottle_pressure_id: context
                .get_identifier("OXYGEN_CREW_BOTTLE_PRESSURE".to_owned()),
            cockpit_duct_temperature_id: context.get_identifier("COND_CKPT_DUCT_TEMP".to_owned()),

            cockpit_duct_temperature: ThermodynamicTemperature::new::<kelvin>(
                Self::REFERENCE_TEMPERATURE_KELVIN,
            ),
            charge_remaining: Ratio::new::<ratio>(1.),
            pressure: Pressure::new::<psi>(Self::FULL_CHARGE_PRESSURE_PSI),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.charge_remaining -=
            Ratio::new::<ratio>(Self::LEAK_RATIO_PER_SECOND * context.delta_as_secs_f64());
        self.charge_remaining = self.charge_remaining.max(Ratio::new::<ratio>(0.));

        let temperature_ratio =
            self.cockpit_duct_temperature.get::<kelvin>() / Self::REFERENCE_TEMPERATURE_KELVIN;

        self.pressure = Pressure::new::<psi>(
            Self::FULL_CHARGE_PRESSURE_PSI
                * self.charge_remaining.get::<ratio>()
                * temperature_ratio,
        )
        .max(Pressure::new::<psi>(0.));
    }
}
impl SimulationElement for A320Oxygen {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.cockpit_duct_temperature = reader.read(&self.cockpit_duct_temperature_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.crew_bottle_pressure_id, self.pressure.get::<psi>());
    }
}
