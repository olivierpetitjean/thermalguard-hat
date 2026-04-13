#!/usr/bin/env python3
"""
ThermalGuard HAT - Kiosk configuration wizard
Applies the kiosk mode configuration selected during the main setup wizard.
"""

import argparse
import glob
import json
import os
import pwd
import shutil
import subprocess
import sys
from pathlib import Path

GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
CYAN = '\033[0;36m'
RED = '\033[0;31m'
NC = '\033[0m'

def section(title):
    print(f"\n{CYAN}{'=' * 50}{NC}")
    print(f"{CYAN}  {title}{NC}")
    print(f"{CYAN}{'=' * 50}{NC}")

def ok(msg):
    print(f"{GREEN}[OK]{NC} {msg}")

def warn(msg):
    print(f"{YELLOW}[!]{NC} {msg}")

def error(msg):
    print(f"{RED}[x]{NC} {msg}")
    sys.exit(1)

def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)

def save_json(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

def run_command(command, check=True):
    return subprocess.run(command, check=check, text=True, capture_output=True)

def command_exists(name):
    return shutil.which(name) is not None

def install_unclutter():
    run_command(["apt-get", "update", "-qq"])
    run_command(["apt-get", "install", "-y", "-qq", "unclutter"])
    ok("Installed unclutter")

def apply_desktop_autologin():
    if not command_exists("raspi-config"):
        warn("raspi-config not found - desktop autologin was not changed")
        return

    result = run_command(["raspi-config", "nonint", "do_boot_behaviour", "B4"], check=False)
    if result.returncode == 0:
        ok("Desktop autologin enabled")
    else:
        warn("Unable to enable desktop autologin automatically")

def apply_screen_blanking():
    if not command_exists("raspi-config"):
        warn("raspi-config not found - screen blanking was not changed")
        return

    result = run_command(["raspi-config", "nonint", "do_blanking", "1"], check=False)
    if result.returncode == 0:
        ok("Screen blanking disabled")
    else:
        warn("Unable to disable screen blanking automatically")

def get_display_connectors():
    items = []
    for status_path in sorted(glob.glob("/sys/class/drm/card?-HDMI-A-?/status")):
        try:
            status = Path(status_path).read_text(encoding="utf-8").strip()
        except OSError:
            status = "unknown"
        items.append((status_path.split("/")[-2], status))
    return items

def build_autostart_lines(kiosk_url, hide_cursor, profile_dir):
    lines = []
    if hide_cursor:
        lines.append("unclutter -idle 0.1 -root &")

    lines.append(
        f'chromium "{kiosk_url}" --kiosk --noerrdialogs --disable-infobars --no-first-run '
        f'--start-maximized --password-store=basic --user-data-dir={profile_dir} &'
    )
    return lines

def write_autostart(user_name, lines):
    user_info = pwd.getpwnam(user_name)
    home_dir = Path(user_info.pw_dir)
    labwc_dir = home_dir / ".config" / "labwc"
    autostart_path = labwc_dir / "autostart"

    labwc_dir.mkdir(parents=True, exist_ok=True)
    autostart_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chown(labwc_dir, user_info.pw_uid, user_info.pw_gid)
    os.chown(autostart_path, user_info.pw_uid, user_info.pw_gid)
    ok(f"Wrote kiosk autostart to {autostart_path}")

def main():
    parser = argparse.ArgumentParser(description="ThermalGuard HAT kiosk configuration wizard")
    parser.add_argument("--install-root", required=True, help="Path to the ThermalGuard HAT install root")
    args = parser.parse_args()

    install_root = Path(args.install_root).resolve()
    shared_config_path = install_root / "config" / "settings.json"
    if not shared_config_path.exists():
        error(f"Shared settings file not found: {shared_config_path}")

    shared_settings = load_json(shared_config_path)
    kiosk_setup = shared_settings.get("KioskSetup", {})
    if not kiosk_setup.get("Enabled", False):
        ok("Kiosk mode was not requested during the main setup wizard")
        return

    user_name = kiosk_setup.get("User", "").strip()
    if not user_name:
        error("Kiosk user is missing from KioskSetup.User")

    try:
        user_info = pwd.getpwnam(user_name)
    except KeyError:
        error(f"Local user '{user_name}' does not exist")

    section("Kiosk configuration")
    print(f"  User            : {user_name}")
    print(f"  Inline layout   : {'yes' if kiosk_setup.get('Inline', False) else 'no'}")
    print(f"  Hide cursor     : {'yes' if kiosk_setup.get('HideCursor', True) else 'no'}")
    print(f"  Desktop login   : {'yes' if kiosk_setup.get('DesktopAutologin', True) else 'no'}")
    print(f"  Screen blanking : {'yes' if kiosk_setup.get('DisableScreenBlanking', True) else 'no'}")
    print(f"  Autostart       : {'yes' if kiosk_setup.get('Autostart', True) else 'no'}")

    connectors = get_display_connectors()
    if connectors:
        print("  Displays        :")
        for connector, status in connectors:
            print(f"    - {connector}: {status}")

    kiosk_url = "http://localhost/kiosk?mode=inline" if kiosk_setup.get("Inline", False) else "http://localhost/kiosk"
    profile_dir = Path(user_info.pw_dir) / ".config" / "chromium-kiosk"

    if kiosk_setup.get("HideCursor", True) and not command_exists("unclutter"):
        warn("unclutter is not installed - installing now")
        install_unclutter()

    if kiosk_setup.get("DesktopAutologin", True):
        apply_desktop_autologin()

    if kiosk_setup.get("DisableScreenBlanking", True):
        apply_screen_blanking()

    if kiosk_setup.get("Autostart", True):
        lines = build_autostart_lines(kiosk_url, kiosk_setup.get("HideCursor", True), str(profile_dir))
        write_autostart(user_name, lines)

    kiosk_runtime = shared_settings.setdefault("KioskRuntime", {})
    kiosk_runtime["Configured"] = True
    kiosk_runtime["Url"] = kiosk_url
    kiosk_runtime["User"] = user_name
    kiosk_runtime["ProfileDir"] = str(profile_dir)
    save_json(shared_config_path, shared_settings)

    section("Done")
    print(f"  Kiosk URL       : {kiosk_url}")
    print(f"  Browser profile : {profile_dir}")
    if kiosk_setup.get("Autostart", True):
        print("  Kiosk autostart has been configured.")
    print("  A reboot is recommended before validating the final kiosk setup.\n")

if __name__ == "__main__":
    main()
