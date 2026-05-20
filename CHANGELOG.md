# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-20

### Added

- Added multi-mode fan condition control with `linked_fans`, `independent`, and `differential` modes.
- Added frontend controls for selecting the control mode and related trigger options in the settings UI.
- Added a `DisableFanAlerts` option to suppress fan disconnect alerts for low-speed fans that intentionally stop at low PWM values.
- Added the fan alert option to the web setup flow and the post-install configuration wizard.
- Added installation-time synchronization of runtime alert preferences before the Python sensor service starts.

### Changed

- Updated the Python hardware service to apply the new control modes when computing fan power.
- Updated the backend settings model and SQLite schema to persist the new control settings and `DisableFanAlerts`.
- Improved the installation/configuration flow so setup choices are applied consistently to the runtime database.

### Fixed

- Prevented false fan disconnect alerts on fans that report `0 RPM` when running below their startup threshold.

### Docs

- Updated demo video links in the README.
