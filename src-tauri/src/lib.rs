use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+Space";

struct ShortcutStateStore(Mutex<Option<String>>);

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        eprintln!("show_main_window: found main window");
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    } else {
        eprintln!("show_main_window: main window not found");
    }
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn set_global_shortcut(
    app: AppHandle,
    shortcut_state: State<'_, ShortcutStateStore>,
    shortcut: String,
) -> Result<(), String> {
    let shortcut = shortcut.trim().to_string();
    if shortcut.is_empty() {
        return Err("Shortcut cannot be empty.".into());
    }

    let manager = app.global_shortcut();
    let mut stored_shortcut = shortcut_state.0.lock().map_err(|_| "Shortcut lock poisoned.")?;

    if let Some(previous_shortcut) = stored_shortcut.as_ref() {
        if manager.is_registered(previous_shortcut.as_str()) {
            manager
                .unregister(previous_shortcut.as_str())
                .map_err(|error| error.to_string())?;
        }
    }

    manager
        .on_shortcut(shortcut.as_str(), |app, _, event| {
            if event.state == ShortcutState::Pressed {
                show_main_window(app);
            }
        })
        .map_err(|error| error.to_string())?;

    *stored_shortcut = Some(shortcut);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(ShortcutStateStore(Mutex::new(Some(DEFAULT_SHORTCUT.to_string()))))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![set_global_shortcut, hide_main_window])
        .setup(|app| {
            let app_handle = app.handle().clone();

            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Regular);
                app.set_dock_visibility(true);
                app.show()?;
            }

            eprintln!(
                "setup: windows available = {:?}",
                app.webview_windows().keys().cloned().collect::<Vec<_>>()
            );

            app.run_on_main_thread(move || {
                #[cfg(target_os = "macos")]
                {
                    let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular);
                    let _ = app_handle.set_dock_visibility(true);
                    let _ = app_handle.show();
                }

                show_main_window(&app_handle);
            })?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = event
        {
            show_main_window(app_handle);
        }
    });
}
