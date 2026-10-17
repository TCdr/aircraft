use crate::simulation::{
    InitContext, Read, SimulationElement, SimulatorReader, SimulatorWriter, VariableIdentifier,
    Write,
};
use uom::si::{
    f64::{Length, Ratio},
    length::nautical_mile,
    ratio::percent,
};

pub struct NavigationDisplay {
    range_knob_id: VariableIdentifier,
    range_knob_position: usize,
    range: Length,
    mode_id: VariableIdentifier,
    mode: u8,
    terrain_on_nd_pb_id: VariableIdentifier,
    terrain_on_nd_pb_active: bool,
    terrain_on_nd_active: bool,
    /// The EGPWC sets the TERR ON ND pb-sw back to OFF this update (terrain standby, see the EGPWC)
    deselect_terrain_on_nd_pb: bool,
    potentiometer_id: VariableIdentifier,
    potentiometer: Ratio,
    // output variables of the display
    egpwc_nd_range_id: VariableIdentifier,
    egpwc_nd_terrain_active_id: VariableIdentifier,
}

impl NavigationDisplay {
    pub fn new(context: &mut InitContext, side: &str) -> Self {
        NavigationDisplay {
            range_knob_id: context.get_identifier(format!("EFIS_{}_ND_RANGE", side)),
            range_knob_position: 0,
            range: Length::new::<nautical_mile>(10.0),
            mode_id: context.get_identifier(format!("EFIS_{}_ND_MODE", side)),
            mode: 0,
            terrain_on_nd_pb_id: context.get_identifier(format!("EFIS_TERR_{}_ACTIVE", side)),
            terrain_on_nd_pb_active: false,
            terrain_on_nd_active: false,
            deselect_terrain_on_nd_pb: false,
            potentiometer_id: context
                .get_identifier(format!("ND_{}_TERR_ON_ND_POTENTIOMETER", side)),
            potentiometer: Ratio::new::<percent>(100.0),
            egpwc_nd_range_id: context.get_identifier(format!("EGPWC_ND_{}_RANGE", side)),
            egpwc_nd_terrain_active_id: context
                .get_identifier(format!("EGPWC_ND_{}_TERRAIN_ACTIVE", side)),
        }
    }

    /// ## Parameters
    /// `terrain_display_available` - the EGPWC can show the terrain: it has the position data of its predictive
    /// functions (no terrain standby) and its terrain functions work (A320: TERR pb-sw not OFF, no TERR FAULT)
    /// `deselect_terrain_on_nd_pb` - the EGPWC sets a selected TERR ON ND pb-sw back to OFF (terrain standby)
    pub fn update(
        &mut self,
        is_powered: bool,
        range_lookup: &[Length],
        terrain_display_available: bool,
        deselect_terrain_on_nd_pb: bool,
    ) {
        self.range = range_lookup[self.range_knob_position];
        self.terrain_on_nd_active =
            terrain_display_available && self.terrain_on_nd_pb_active && is_powered;
        self.deselect_terrain_on_nd_pb = deselect_terrain_on_nd_pb && self.terrain_on_nd_pb_active;
    }
}

impl SimulationElement for NavigationDisplay {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.range_knob_position = reader.read(&self.range_knob_id);
        self.mode = reader.read(&self.mode_id);
        self.terrain_on_nd_pb_active = reader.read(&self.terrain_on_nd_pb_id);
        self.potentiometer = Ratio::new::<percent>(reader.read(&self.potentiometer_id));
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.egpwc_nd_range_id, self.range.get::<nautical_mile>());
        writer.write(&self.egpwc_nd_terrain_active_id, self.terrain_on_nd_active);
        // Only written to set the pb-sw OFF: the cockpit owns the variable otherwise
        if self.deselect_terrain_on_nd_pb {
            writer.write(&self.terrain_on_nd_pb_id, false);
        }
    }
}
