//! The memory of one asynchronous file read of the simulator.
//!
//! The simulator writes into the destination buffer and calls back at any time between the start of the read and the
//! callback, and a read that reported an error may still be running. The memory of a read is therefore only ever
//! released after its own callback has reported it done. A read that is given up on is left alone (it is leaked, a
//! few hundred kilobytes at most), and the callbacks of different reads cannot reach each other because each read has
//! its own slot.

use super::terrain_grid::ReadFailure;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicI32, AtomicU8, Ordering};

const IN_PROGRESS: u8 = 0;
const DONE: u8 = 1;
const FAILED: u8 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadSlotStatus {
    InProgress,
    Done,
    Failed,
}

struct ReadSlot {
    status: AtomicU8,
    bytes_read: AtomicI32,
    buffer: Vec<u8>,
}

/// A handle on the slot of one read. Dropping it without [`PendingRead::finish`] leaves the slot allocated.
pub struct PendingRead {
    slot: NonNull<ReadSlot>,
    buffer_pointer: *mut u8,
    length: usize,
}

impl PendingRead {
    pub fn new(length: usize) -> Self {
        let mut buffer = vec![0; length];
        let buffer_pointer = buffer.as_mut_ptr();
        let slot = Box::new(ReadSlot {
            status: AtomicU8::new(IN_PROGRESS),
            bytes_read: AtomicI32::new(0),
            buffer,
        });
        Self {
            // SAFETY: Box::into_raw never returns null.
            slot: unsafe { NonNull::new_unchecked(Box::into_raw(slot)) },
            buffer_pointer,
            length,
        }
    }

    /// Where the simulator writes the bytes. Valid until `finish` has released a finished read, never moved.
    pub fn buffer_pointer(&self) -> *mut u8 {
        self.buffer_pointer
    }

    /// The pointer for the callback of the simulator, to be handed back to [`complete`] and [`fail`].
    pub fn user_data(&self) -> *mut c_void {
        self.slot.as_ptr().cast()
    }

    pub fn status(&self) -> ReadSlotStatus {
        // SAFETY: the slot is only released by `finish`, which consumes this handle.
        let status = unsafe { self.slot.as_ref() }.status.load(Ordering::Acquire);
        match status {
            DONE => ReadSlotStatus::Done,
            FAILED => ReadSlotStatus::Failed,
            _ => ReadSlotStatus::InProgress,
        }
    }

    pub fn mark_failed(&self) {
        // SAFETY: as in `status`.
        unsafe { self.slot.as_ref() }
            .status
            .store(FAILED, Ordering::Release);
    }

    /// The bytes of a finished read when the simulator delivered all that was asked for. A read that is not done is
    /// left allocated, because the simulator may still write into it.
    pub fn finish(self) -> Result<Vec<u8>, ReadFailure> {
        if self.status() != ReadSlotStatus::Done {
            return Err(ReadFailure);
        }
        // SAFETY: the callback of the read has run (status Done), so the simulator does not touch the slot any more,
        // and this handle is the only one.
        let slot = unsafe { Box::from_raw(self.slot.as_ptr()) };
        if slot.bytes_read.load(Ordering::Acquire) as usize == self.length {
            Ok(slot.buffer)
        } else {
            Err(ReadFailure)
        }
    }
}

/// The read callback of the simulator: the read of the slot behind `user_data` delivered `bytes_read` bytes.
///
/// # Safety
/// `user_data` is the pointer of [`PendingRead::user_data`] of a read that was not released by `finish`. That holds
/// for a read that is still running, and for a read that was given up on (its slot is never released).
pub unsafe fn complete(user_data: *mut c_void, bytes_read: i32) {
    let slot = &*(user_data as *const ReadSlot);
    slot.bytes_read.store(bytes_read, Ordering::Release);
    slot.status.store(DONE, Ordering::Release);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_finished_read_gives_its_bytes() {
        let read = PendingRead::new(4);
        // SAFETY: the buffer has four bytes and the slot is alive.
        unsafe {
            read.buffer_pointer()
                .copy_from_nonoverlapping([1, 2, 3, 4].as_ptr(), 4)
        };
        assert_eq!(read.status(), ReadSlotStatus::InProgress);
        // SAFETY: the slot of a read that is not finished is alive.
        unsafe { complete(read.user_data(), 4) };
        assert_eq!(read.status(), ReadSlotStatus::Done);
        assert_eq!(read.finish(), Ok(vec![1, 2, 3, 4]));
    }

    #[test]
    fn a_read_that_delivers_fewer_bytes_than_asked_for_is_a_failure() {
        let read = PendingRead::new(4);
        // SAFETY: as above.
        unsafe { complete(read.user_data(), 3) };
        assert_eq!(read.finish(), Err(ReadFailure));
    }

    #[test]
    fn a_late_callback_of_an_abandoned_read_cannot_complete_the_next_read() {
        let abandoned = PendingRead::new(8);
        let late_callback_target = abandoned.user_data();
        abandoned.mark_failed();
        // The failed read is given up on: nothing releases it
        assert_eq!(abandoned.finish(), Err(ReadFailure));

        let next = PendingRead::new(8);
        assert_ne!(next.user_data(), late_callback_target);
        // SAFETY: a read that was given up on is never released, so its slot is still alive.
        unsafe { complete(late_callback_target, 8) };
        assert_eq!(
            next.status(),
            ReadSlotStatus::InProgress,
            "the late callback of the old read must not finish the new one"
        );
    }

    #[test]
    fn the_buffer_of_an_abandoned_read_is_not_handed_to_the_next_read() {
        let abandoned = PendingRead::new(64);
        let abandoned_buffer = abandoned.buffer_pointer();
        abandoned.mark_failed();
        assert!(abandoned.finish().is_err());

        let next = PendingRead::new(64);
        assert_ne!(next.buffer_pointer(), abandoned_buffer);
        // The simulator may still be writing into the old buffer, which has to be there
        // SAFETY: the abandoned buffer is never released.
        unsafe { abandoned_buffer.write(0xAB) };
        // SAFETY: the next read is still alive.
        unsafe { complete(next.user_data(), 64) };
        assert_eq!(next.finish().unwrap()[0], 0);
    }

    #[test]
    fn a_read_that_failed_before_it_ran_is_a_failure() {
        let read = PendingRead::new(2);
        read.mark_failed();
        assert_eq!(read.status(), ReadSlotStatus::Failed);
    }
}
