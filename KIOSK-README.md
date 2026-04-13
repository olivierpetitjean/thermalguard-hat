# Kiosk Setup Notes

This document records the validated steps required to configure ThermalGuard HAT in kiosk mode on Raspberry Pi OS.

## Goal

Boot directly into Chromium kiosk mode on:

```text
http://localhost/kiosk?mode=inline
```

The final kiosk setup should have:

- no kiosk page title or subtitle
- desktop autologin enabled
- screen blanking disabled
- direct access to `/kiosk` working correctly

## Prerequisites

- Raspberry Pi OS with a graphical desktop
- ThermalGuard HAT already installed on the Pi
- the API reachable locally on the Pi
- the backend SPA fallback deployed so `/kiosk` works on direct access

## 1. First Boot

On a fresh Raspberry Pi OS installation, if no user account was preconfigured, the first-boot wizard will ask you to create:

- a username
- a password

This step must be completed before using `raspi-config` or enabling desktop autologin.

## 2. Check That the Display Is Detected

To confirm which HDMI output is being used:

```bash
ls -1 /sys/class/drm/card?-HDMI-A-?/status
cat /sys/class/drm/card?-HDMI-A-?/status
```

Validated result in this setup:

```text
HDMI-A-1
connected
```

To inspect the active video mode in more detail:

```bash
kmsprint | sed -n '/HDMI-A-1/,+25p'
```

`kms++` is only used as a display diagnostics tool. It helps verify:

- which connector is actually in use
- the active resolution
- the available display modes

## 3. Enable Desktop Autologin

```bash
sudo raspi-config
```

Then go to:

- `System Options`
- `Boot / Auto Login`
- `Desktop Autologin`

## 4. Disable Screen Blanking

```bash
sudo raspi-config
```

Then go to:

- `Display Options`
- `Screen Blanking`
- `No`

## 5. Launch Chromium Automatically at Startup

On Raspberry Pi OS Bookworm with `labwc`, desktop autostart commands live in:

```text
~/.config/labwc/autostart
```

Create the directory if needed:

```bash
mkdir -p ~/.config/labwc
```

Validated autostart content:

```bash
chromium "http://localhost/kiosk?mode=inline" --kiosk --noerrdialogs --disable-infobars --no-first-run --start-maximized --password-store=basic --user-data-dir=/home/olivier/.config/chromium-kiosk &
```

Command to write it directly:

```bash
printf '%s\n' 'chromium "http://localhost/kiosk?mode=inline" --kiosk --noerrdialogs --disable-infobars --no-first-run --start-maximized --password-store=basic --user-data-dir=/home/olivier/.config/chromium-kiosk &' > ~/.config/labwc/autostart
```

Verification:

```bash
cat ~/.config/labwc/autostart
```

## 6. Manual Test Before Enabling Autostart

Before relying on autostart, it is useful to test Chromium manually from the graphical session.

Validated command:

```bash
DISPLAY=:0 XDG_RUNTIME_DIR=/run/user/1000 chromium "http://localhost/kiosk?mode=inline" --kiosk --noerrdialogs --disable-infobars --no-first-run --start-maximized --password-store=basic --user-data-dir=/home/olivier/.config/chromium-kiosk
```

Notes:

- `--password-store=basic` avoids the system keyring popup
- `--user-data-dir=/home/olivier/.config/chromium-kiosk` isolates a dedicated Chromium profile for kiosk mode
- Chromium may still print warnings in the terminal without affecting kiosk mode

## 7. Validation Reboot

```bash
sudo reboot
```

After reboot, verify:

- desktop autologin is active
- Chromium starts automatically
- the kiosk URL loads correctly
- no Chromium popup appears
- screen blanking stays disabled

## 8. Useful Kiosk URL Parameter

The compact horizontal kiosk layout is enabled with:

```text
mode=inline
```

Example:

```text
/kiosk?mode=inline
```

Without this parameter, the kiosk uses its default layout.

## 9. Useful Notes

- The display rotation tests done with `wlr-randr` were rolled back and are not part of the final target setup.
- The attempts to rotate the display via `/boot/firmware/cmdline.txt` were also rolled back and are not part of the final validated procedure.
- If `/kiosk` does not work on direct access, verify that the deployed backend includes the ASP.NET SPA fallback.
