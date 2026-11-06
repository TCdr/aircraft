//! The runway database of the EGPWC: the runways the systems host sends over the CommBus.

#[cfg(not(target_arch = "wasm32"))]
use crate::msfs::commbus::{CommBus, CommBusBroadcastFlags};
#[cfg(target_arch = "wasm32")]
use ::msfs::commbus::{CommBus, CommBusBroadcastFlags};

use std::cell::RefCell;
use std::rc::Rc;
use systems::surveillance::egpws::predictive::RunwayDatabaseMessages;

/// Keeps the latest message until the aircraft takes it. The handle keeps the CommBus registration alive.
pub struct CommBusRunwayDatabase {
    latest_message: Rc<RefCell<Option<String>>>,
    _commbus: CommBus<'static>,
}

impl CommBusRunwayDatabase {
    const UPDATE_EVENT: &'static str = "FBW_EGPWC_RUNWAYS";
    const REQUEST_EVENT: &'static str = "FBW_EGPWC_RUNWAYS_REQUEST";

    pub fn new() -> Self {
        let latest_message = Rc::new(RefCell::new(None));
        let mut commbus = CommBus::default();
        {
            let latest_message = latest_message.clone();
            commbus.register(Self::UPDATE_EVENT, move |data| {
                *latest_message.borrow_mut() = Some(data.to_owned());
            });
        }
        // The systems host may have sent the list before this module was loaded
        CommBus::call(Self::REQUEST_EVENT, "", CommBusBroadcastFlags::JS);
        Self {
            latest_message,
            _commbus: commbus,
        }
    }
}

impl Default for CommBusRunwayDatabase {
    fn default() -> Self {
        Self::new()
    }
}

impl RunwayDatabaseMessages for CommBusRunwayDatabase {
    fn take_latest_message(&mut self) -> Option<String> {
        self.latest_message.borrow_mut().take()
    }
}
