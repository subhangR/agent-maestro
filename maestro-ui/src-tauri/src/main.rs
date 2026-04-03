mod app_menu;
mod app_info;
mod assets;
mod claude_logs;
mod codex_logs;
mod files;
mod file_manager;
mod pty;
mod persist;
mod recording;
mod secure;
mod ssh;
mod ssh_fs;
mod startup;
mod tray;

use app_info::get_app_info;
use assets::apply_text_assets;
use app_menu::{build_app_menu, handle_app_menu_event};
use claude_logs::{list_claude_session_logs, read_claude_session_log, tail_claude_session_log};
use codex_logs::{list_codex_session_logs, read_codex_session_log, tail_codex_session_log};
use files::{copy_fs_entry, delete_fs_entry, list_fs_entries, list_project_files, read_text_file, rename_fs_entry, write_text_file};
use file_manager::open_path_in_file_manager;
use pty::{
    close_session, create_session, detach_session, kill_persistent_session, list_persistent_sessions,
    list_sessions, resize_session, start_session_recording, stop_session_recording, write_to_session,
    AppState,
};
use persist::{list_directories, load_persisted_state, load_persisted_state_meta, save_persisted_state, validate_directory};
use recording::{delete_recording, list_recordings, load_recording};
use secure::{prepare_secure_storage, reset_secure_storage};
use ssh::list_ssh_hosts;
use ssh_fs::{
    ssh_default_root, ssh_delete_fs_entry, ssh_download_file, ssh_download_to_temp,
    ssh_list_fs_entries, ssh_read_text_file, ssh_rename_fs_entry, ssh_upload_file,
    ssh_write_text_file,
};
use startup::get_startup_flags;
use tray::{build_status_tray, set_tray_agent_count, set_tray_recent_sessions, set_tray_status};
use tauri::Manager;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(feature = "custom-protocol")]
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct SidecarState {
    child: Arc<Mutex<Option<CommandChild>>>,
}

struct AllowCloseState {
    allow: AtomicBool,
}

#[tauri::command]
fn allow_window_close(state: tauri::State<'_, AllowCloseState>) {
    state.allow.store(true, Ordering::SeqCst);
}

fn main() {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // Pre-seed PATH with common directories so shell init scripts can run properly.
        // Without this, commands like `brew` or `nvm` in .zshrc may fail when
        // the app is launched from Finder (which starts with minimal PATH).
        if let Ok(current_path) = std::env::var("PATH") {
            let mut paths: Vec<&str> = current_path.split(':').collect();
            let additions = [
                "/opt/homebrew/bin",
                "/opt/homebrew/sbin",
                "/usr/local/bin",
                "/usr/local/sbin",
            ];
            for dir in additions {
                if std::path::Path::new(dir).is_dir() && !paths.contains(&dir) {
                    paths.insert(0, dir);
                }
            }
            std::env::set_var("PATH", paths.join(":"));
        }

        // Now fix_path_env can properly spawn the shell to extract full PATH.
        let _ = fix_path_env::fix();
    }
    // When launched from Finder / Dock, macOS sets cwd to "/" which is often
    // inaccessible to child processes due to SIP / TCC restrictions.  This
    // causes "shell-init: getcwd: Operation not permitted" errors in every
    // subprocess (server sidecar, PTY shells, CLI commands).  Fix by moving
    // the process cwd to $HOME early, before anything spawns.
    if let Some(home) = dirs::home_dir() {
        let _ = std::env::set_current_dir(&home);
    }

    startup::init_startup_flags();

    let app = tauri::Builder::default()
        .manage(AppState::default())
        .manage(AllowCloseState { allow: AtomicBool::new(false) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .menu(|app| build_app_menu(app))
        .on_menu_event(|app, event| handle_app_menu_event(app, event))
        .setup(|app| {
            if let Err(e) = startup::clear_app_data_if_requested(&app.handle()) {
                eprintln!("Failed to clear app data: {e}");
            }
            let tray = build_status_tray(&app.handle()).unwrap_or_else(|e| {
                eprintln!("Failed to create tray icon: {e}");
                tray::StatusTrayState::disabled()
            });
            app.manage(tray);

            // Open devtools automatically in prod for debugging
            #[cfg(feature = "devtools")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Spawn the maestro-server sidecar only in release/prod builds
            #[cfg(feature = "custom-protocol")]
            {
                let home_dir = dirs::home_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| std::env::var("HOME").unwrap_or_default());
                let data_dir = format!("{home_dir}/.maestro/data");
                let session_dir = format!("{home_dir}/.maestro/sessions");

                let sidecar_cmd = app.shell()
                    .sidecar("maestro-server")
                    .expect("failed to create maestro-server sidecar command")
                    .env("PORT", "2357")
                    .env("DATA_DIR", &data_dir)
                    .env("SESSION_DIR", &session_dir)
                    .env("NODE_ENV", "production");

                let (mut rx, child) = sidecar_cmd.spawn()
                    .expect("failed to spawn maestro-server sidecar");

                // Log sidecar output for debugging
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                eprintln!("[maestro-server] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprintln!("[maestro-server:err] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(payload) => {
                                eprintln!("[maestro-server] terminated: {:?}", payload);
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                app.manage(SidecarState {
                    child: Arc::new(Mutex::new(Some(child))),
                });
            }

            #[cfg(not(feature = "custom-protocol"))]
            {
                app.manage(SidecarState {
                    child: Arc::new(Mutex::new(None)),
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            write_to_session,
            resize_session,
            close_session,
            detach_session,
            list_sessions,
            list_persistent_sessions,
            kill_persistent_session,
            start_session_recording,
            stop_session_recording,
            get_startup_flags,
            load_persisted_state,
            load_persisted_state_meta,
            save_persisted_state,
            validate_directory,
            list_directories,
            list_fs_entries,
            list_project_files,
            read_text_file,
            write_text_file,
            rename_fs_entry,
            delete_fs_entry,
            copy_fs_entry,
            ssh_default_root,
            ssh_list_fs_entries,
            ssh_read_text_file,
            ssh_write_text_file,
            ssh_rename_fs_entry,
            ssh_delete_fs_entry,
            ssh_download_file,
            ssh_upload_file,
            ssh_download_to_temp,
            load_recording,
            list_recordings,
            delete_recording,
            prepare_secure_storage,
            reset_secure_storage,
            list_ssh_hosts,
            apply_text_assets,
            set_tray_agent_count,
            set_tray_status,
            set_tray_recent_sessions,
            open_path_in_file_manager,
            get_app_info,
            allow_window_close,
            list_claude_session_logs,
            read_claude_session_log,
            tail_claude_session_log,
            list_codex_session_logs,
            read_codex_session_log,
            tail_codex_session_log
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match &event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                // On macOS, hide the window instead of closing it so the
                // sidecar stays alive and the user can reopen via the dock.
                // The frontend calls `allow_window_close` before
                // `getCurrentWindow().close()` when the user truly wants to
                // shut down; in that case we let the close proceed.
                if let Some(state) = app_handle.try_state::<AllowCloseState>() {
                    if state.allow.swap(false, Ordering::SeqCst) {
                        // Frontend said "really close" — let it through.
                        return;
                    }
                }
                api.prevent_close();
                // Hide the window (and the app from the taskbar on macOS).
                let _ = app_handle.get_webview_window("main").map(|w| w.hide());
                let _ = app_handle.hide();
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                // macOS dock icon clicked — show the hidden window.
                tray::show_main_window(app_handle);
            }
            tauri::RunEvent::ExitRequested { .. } => {
                // Kill the sidecar when the app exits.
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                            eprintln!("[maestro-server] sidecar killed on app exit");
                        }
                    }
                }
            }
            _ => {}
        }
    });
}
