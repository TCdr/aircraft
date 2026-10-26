//! Reads the terrain grid file from the aircraft package through the simulator's asynchronous file API.
//!
//! The MSFS WASM SDK (`MSFS_IO.h`) is not part of the msfs-rs bindings, so the few functions needed are declared here.
//! The build links with `--allow-undefined`, so they resolve when the module is loaded.

use std::ffi::{c_char, c_void, CString};
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use systems::surveillance::egpws::read_slot::{self, PendingRead, ReadSlotStatus};
use systems::surveillance::egpws::terrain_grid::{
    BlockReader, ReadCompletion, ReadFailure, ReadRequest,
};

type FsIoFile = u64;
type FsIoError = u32;

const FS_IO_SUCCESS: FsIoError = 0;
const FS_IO_OPEN_READ_ONLY: u32 = 1;

type FileOpenCallback = extern "C" fn(file: FsIoFile, user_data: *mut c_void);
type FileReadCallback = extern "C" fn(
    file: FsIoFile,
    out_buffer: *mut c_char,
    byte_offset: i32,
    bytes_read: i32,
    user_data: *mut c_void,
);

extern "C" {
    fn fsIOOpen(
        path: *const c_char,
        flags: u32,
        callback: FileOpenCallback,
        user_data: *mut c_void,
    ) -> FsIoFile;
    fn fsIORead(
        file: FsIoFile,
        out_buffer: *mut c_char,
        byte_offset: i32,
        bytes_to_read: i32,
        callback: FileReadCallback,
        user_data: *mut c_void,
    ) -> FsIoError;
    fn fsIOHasError(file: FsIoFile) -> bool;
}

const STATUS_IDLE: u8 = 0;
const STATUS_IN_PROGRESS: u8 = 1;
const STATUS_DONE: u8 = 2;
const STATUS_FAILED: u8 = 3;

/// State of the open, written by the callback of the simulator and read by the polling side. It lives in a box so
/// that the pointer handed to the simulator stays valid when the loader moves. Every read has a state of its own, see
/// [`PendingRead`].
struct CallbackState {
    file: AtomicU64,
    open_status: AtomicU8,
}

impl CallbackState {
    fn new() -> Box<Self> {
        Box::new(Self {
            file: AtomicU64::new(0),
            open_status: AtomicU8::new(STATUS_IDLE),
        })
    }
}

extern "C" fn on_open(file: FsIoFile, user_data: *mut c_void) {
    // SAFETY: user_data is the boxed CallbackState of the loader, which outlives every request it starts.
    let state = unsafe { &*(user_data as *const CallbackState) };
    state.file.store(file, Ordering::Release);
    state.open_status.store(STATUS_DONE, Ordering::Release);
}

extern "C" fn on_read(
    _file: FsIoFile,
    _out_buffer: *mut c_char,
    _byte_offset: i32,
    bytes_read: i32,
    user_data: *mut c_void,
) {
    // SAFETY: user_data is the pointer of the PendingRead this read was started with, whose slot is never released
    // before the callback has run.
    unsafe { read_slot::complete(user_data, bytes_read) };
}

/// Opens the file once and then serves one read at a time. The destination buffer belongs to the read and is only
/// handed back once the simulator reports the read finished, because the simulator writes into it at any time
/// before. A read that is given up on is never freed or reused, so a late callback of it cannot touch the next read.
pub struct FsIoBlockReader {
    path: CString,
    state: Box<CallbackState>,
    read: Option<PendingRead>,
    request: Option<ReadRequest>,
}

impl FsIoBlockReader {
    /// `path` is relative to the package root, for example `./SimObjects/AirPlanes/.../panel/terrain_grid.bin`.
    pub fn new(path: &str) -> Self {
        Self {
            path: CString::new(path).expect("path contains a NUL byte"),
            state: CallbackState::new(),
            read: None,
            request: None,
        }
    }

    fn file(&self) -> FsIoFile {
        self.state.file.load(Ordering::Acquire)
    }

    fn start_open_if_needed(&mut self) {
        // A failed open is tried again with the next request: the cache decides how often to ask
        if self.state.open_status.load(Ordering::Acquire) == STATUS_FAILED {
            self.state.open_status.store(STATUS_IDLE, Ordering::Release);
        }
        if self.state.open_status.load(Ordering::Acquire) != STATUS_IDLE {
            return;
        }
        self.state
            .open_status
            .store(STATUS_IN_PROGRESS, Ordering::Release);
        let user_data = &*self.state as *const CallbackState as *mut c_void;
        // SAFETY: the path is NUL terminated and the user data outlives the call (see CallbackState).
        let file =
            unsafe { fsIOOpen(self.path.as_ptr(), FS_IO_OPEN_READ_ONLY, on_open, user_data) };
        if file == 0 {
            self.state
                .open_status
                .store(STATUS_FAILED, Ordering::Release);
        }
    }

    fn start_read(&mut self, request: ReadRequest) {
        let read = PendingRead::new(request.length as usize);
        // SAFETY: the buffer and the slot of the read stay allocated until the callback has run (or for good), and the
        // buffer is not touched by this side before.
        let error = unsafe {
            fsIORead(
                self.file(),
                read.buffer_pointer() as *mut c_char,
                request.offset as i32,
                request.length as i32,
                on_read,
                read.user_data(),
            )
        };
        if error != FS_IO_SUCCESS {
            read.mark_failed();
        }
        self.read = Some(read);
    }
}

impl BlockReader for FsIoBlockReader {
    fn request(&mut self, request: ReadRequest) {
        self.request = Some(request);
        // A read still in the hands of the simulator is left where it is
        self.read = None;
        self.start_open_if_needed();
    }

    fn poll(&mut self) -> Option<ReadCompletion> {
        let request = self.request?;

        match self.state.open_status.load(Ordering::Acquire) {
            STATUS_FAILED => {
                self.request = None;
                return Some(ReadCompletion {
                    request,
                    outcome: Err(ReadFailure),
                });
            }
            STATUS_DONE => {}
            _ => return None,
        }

        if self.read.is_none() {
            self.start_read(request);
        }
        let status = self.read.as_ref()?.status();
        // SAFETY: plain query on a file handle returned by the simulator.
        let failed = status == ReadSlotStatus::Failed || unsafe { fsIOHasError(self.file()) };
        if failed {
            // The simulator may still write into the buffer, so the read is dropped without releasing its memory
            self.request = None;
            self.read = None;
            return Some(ReadCompletion {
                request,
                outcome: Err(ReadFailure),
            });
        }
        if status != ReadSlotStatus::Done {
            return None;
        }

        self.request = None;
        let outcome = self.read.take()?.finish();
        Some(ReadCompletion { request, outcome })
    }
}
