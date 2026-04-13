#!/usr/bin/env python3
"""
ThermalGuard HAT - Configuration wizard
Uses the shared config/settings.json file, reads minimal API defaults from
appsettings.json when needed for migration/bootstrap, and generates the
Mosquitto configuration.
"""

import argparse
import glob
import ipaddress
import json
import os
import secrets
import string
import subprocess
import sys
import socket

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RED    = '\033[0;31m'
GREEN  = '\033[0;32m'
YELLOW = '\033[1;33m'
CYAN   = '\033[0;36m'
BOLD   = '\033[1m'
NC     = '\033[0m'

def section(title):
    print(f"\n{CYAN}{'=' * 50}{NC}")
    print(f"{CYAN}  {title}{NC}")
    print(f"{CYAN}{'=' * 50}{NC}")

def ok(msg):    print(f"{GREEN}[OK]{NC} {msg}")
def warn(msg):  print(f"{YELLOW}[!]{NC} {msg}")
def error(msg): print(f"{RED}[x]{NC} {msg}"); sys.exit(1)

def ask(prompt, default=None, secret=False):
    if default is not None:
        display = f"{prompt} [{default}]: "
    else:
        display = f"{prompt}: "
    while True:
        if secret:
            import getpass
            value = getpass.getpass(display)
        else:
            value = input(display).strip()
        if value:
            return value
        if default is not None:
            return default
        print("  This field is required.")

def ask_int(prompt, default=None, min_val=None, max_val=None):
    while True:
        raw = ask(prompt, default=str(default) if default is not None else None)
        try:
            val = int(raw)
            if min_val is not None and val < min_val:
                print(f"  Must be >= {min_val}.")
                continue
            if max_val is not None and val > max_val:
                print(f"  Must be <= {max_val}.")
                continue
            return val
        except ValueError:
            print("  Please enter a valid integer.")

def ask_float(prompt, default=None, min_val=None, max_val=None):
    while True:
        raw = ask(prompt, default=str(default) if default is not None else None)
        try:
            val = float(raw.replace(",", "."))
            if min_val is not None and val < min_val:
                print(f"  Must be >= {min_val}.")
                continue
            if max_val is not None and val > max_val:
                print(f"  Must be <= {max_val}.")
                continue
            return val
        except ValueError:
            print("  Please enter a valid number.")

def ask_bool(prompt, default=True):
    default_str = "Y/n" if default else "y/N"
    raw = input(f"{prompt} [{default_str}]: ").strip().lower()
    if not raw:
        return default
    return raw in ('y', 'yes')

def ask_choice(prompt, choices, default=None, case_sensitive=False):
    normalized_choices = choices if case_sensitive else [choice.lower() for choice in choices]
    while True:
        value = ask(prompt, default=default)
        candidate = value if case_sensitive else value.lower()
        if candidate in normalized_choices:
            if case_sensitive:
                return value
            return choices[normalized_choices.index(candidate)]
        print(f"  Please enter one of: {', '.join(choices)}.")

def ask_ip_list(prompt, default=None):
    while True:
        raw = ask(prompt, default=default)
        if not raw.strip():
            return []

        values = [value.strip() for value in raw.split(",") if value.strip()]
        try:
            normalized = [str(ipaddress.ip_address(value)) for value in values]
            return normalized
        except ValueError as ex:
            print(f"  Invalid IP address: {ex}.")

def generate_secret(length=48):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def masked_secret(value):
    return "********" if value else None


def connection_string_to_db_path(connection_string, default_path):
    if not connection_string:
        return default_path

    for segment in connection_string.split(";"):
        segment = segment.strip()
        if not segment:
            continue
        if "=" not in segment:
            continue
        key, value = segment.split("=", 1)
        if key.strip().lower() == "data source":
            return value.strip()

    return default_path


def db_path_to_connection_string(db_path):
    return f"Data Source={db_path}"

# ---------------------------------------------------------------------------
# 1-Wire sensor scan
# ---------------------------------------------------------------------------

W1_BASE = "/sys/bus/w1/devices"

def scan_w1_sensors():
    pattern = os.path.join(W1_BASE, "28-*")
    return [os.path.basename(p) for p in glob.glob(pattern)]

def normalize_w1_uid(uid):
    return uid[3:] if uid.startswith("28-") else uid

def read_w1_temp(uid):
    path = os.path.join(W1_BASE, uid, "temperature")
    try:
        with open(path) as f:
            return int(f.read().strip()) / 1000.0
    except Exception:
        return None

def configure_sensors(settings):
    section("1-Wire Temperature Sensors")

    sensors = scan_w1_sensors()
    if not sensors:
        warn("No 1-Wire sensors detected. Check wiring and /boot/config.txt (dtoverlay=w1-gpio).")
        warn("You can set sensor UIDs manually later in the shared settings file.")
        settings['sensor1Uid'] = ask("Sensor 1 UID", default=settings.get('sensor1Uid', "xxxxxxxxxxxx"))
        settings['sensor2Uid'] = ask("Sensor 2 UID", default=settings.get('sensor2Uid', "xxxxxxxxxxxx"))
        return

    print(f"\n  Detected {len(sensors)} sensor(s):\n")
    for i, uid in enumerate(sensors):
        temp = read_w1_temp(uid)
        temp_str = f"{temp:.1f} C" if temp is not None else "unreadable"
        print(f"  [{i+1}] {uid}  ->  {temp_str}")

    print()

    normalized_sensors = [normalize_w1_uid(uid) for uid in sensors]
    default_sensor1_index = normalized_sensors.index(settings.get('sensor1Uid')) + 1 if settings.get('sensor1Uid') in normalized_sensors else 1
    default_sensor2_index = normalized_sensors.index(settings.get('sensor2Uid')) + 1 if settings.get('sensor2Uid') in normalized_sensors else 2

    if len(sensors) >= 1:
        idx = ask_int("Assign sensor 1 - enter number", default=default_sensor1_index, min_val=1, max_val=len(sensors))
        settings['sensor1Uid'] = normalize_w1_uid(sensors[idx - 1])
        ok(f"Sensor 1: {settings['sensor1Uid']}")

    if len(sensors) >= 2:
        while True:
            proposed_idx2 = default_sensor2_index if default_sensor2_index != idx else (2 if idx != 2 and len(sensors) >= 2 else 1)
            idx2 = ask_int("Assign sensor 2 - enter number", default=proposed_idx2, min_val=1, max_val=len(sensors))
            if idx2 == idx:
                print("  Sensor 2 must be different from sensor 1.")
                continue
            settings['sensor2Uid'] = normalize_w1_uid(sensors[idx2 - 1])
            ok(f"Sensor 2: {settings['sensor2Uid']}")
            break
    else:
        warn("Only one sensor detected. Sensor 2 will be unset.")
        settings['sensor2Uid'] = "xxxxxxxxxxxx"

# ---------------------------------------------------------------------------
# Timing / thresholds
# ---------------------------------------------------------------------------

def configure_thresholds(settings):
    section("Thresholds & Timing")

    settings['sysFanThreshold'] = ask_int(
        "System fan activation threshold (C)", default=settings.get('sysFanThreshold', 38), min_val=20, max_val=80)
    settings['saveDelaySecond'] = ask_int(
        "Database save interval (seconds)", default=settings.get('saveDelaySecond', 15), min_val=5, max_val=300)
    settings['screenStandByDelay'] = ask_int(
        "LCD screen standby delay (seconds)", default=settings.get('screenStandByDelay', 30), min_val=10, max_val=600)
    settings['fanFrequency'] = ask_int(
        "Fan PWM frequency (Hz)", default=settings.get('fanFrequency', 25000), min_val=1000, max_val=100000)
    settings['fanPWMResolution'] = ask_int(
        "Fan PWM resolution", default=settings.get('fanPWMResolution', 1000), min_val=100, max_val=10000)
    settings['fanTachGlitchFilterUs'] = ask_int(
        "Fan tach glitch filter (microseconds)",
        default=settings.get('fanTachGlitchFilterUs', 50),
        min_val=0,
        max_val=5000)
    settings['fanTempoSeconds'] = ask_int(
        "Fan ramp-up delay (seconds)", default=settings.get('fanTempoSeconds', 30), min_val=0, max_val=120)

# ---------------------------------------------------------------------------
# MQTT
# ---------------------------------------------------------------------------

MOSQUITTO_CONF_PATH = "/etc/mosquitto/conf.d/thermalguard-hat.conf"

def configure_mqtt(settings, api_settings):
    section("MQTT Broker")

    current_local_port = int(settings.get('mqttPort', api_settings.get('BrokerHostSettings', {}).get('Port', 1883)))
    current_local_ws_port = int(api_settings.get('BrokerHostSettings', {}).get('WsPort', 1884))
    current_local_user = settings.get('mqttUser', '')
    current_local_password = settings.get('mqttPassword', '')

    bridge_enabled = bool(settings.get('mqttBridgeEnabled', False))
    current_bridge_host = settings.get('mqttBridgeHost', '')
    current_bridge_port = int(settings.get('mqttBridgePort', 1883))
    current_bridge_use_tls = bool(settings.get('mqttBridgeUseTls', False))
    current_bridge_user = settings.get('mqttBridgeUser', '')
    current_bridge_password = settings.get('mqttBridgePassword', '')

    use_local_broker = ask_bool("Use local Mosquitto broker?", default=not bridge_enabled)
    use_bridge = not use_local_broker

    local_tcp_port = ask_int("Local MQTT TCP port", default=current_local_port, min_val=1, max_val=65535)
    local_ws_port = ask_int("Local MQTT WebSocket port (used by the API proxy)", default=current_local_ws_port, min_val=1, max_val=65535)

    if use_bridge:
        bridge_host = ask("Remote broker host", default=current_bridge_host or "broker.example.com")
        bridge_port = ask_int("Remote broker port", default=current_bridge_port, min_val=1, max_val=65535)
        bridge_use_tls = ask_bool("Use TLS for the bridge connection?", default=current_bridge_use_tls)
        bridge_user = ask("Remote MQTT username", default=current_bridge_user)
        if bridge_user:
            bridge_password_input = ask("Remote MQTT password", default=masked_secret(current_bridge_password), secret=True)
            bridge_password = current_bridge_password if bridge_password_input == "********" else bridge_password_input
        else:
            bridge_password = ""

        _configure_mosquitto_bridge(
            local_tcp_port,
            local_ws_port,
            bridge_host,
            bridge_port,
            bridge_use_tls,
            bridge_user,
            bridge_password,
        )
        ok(f"Mosquitto configured locally (TCP:{local_tcp_port}, WS:{local_ws_port}) with bridge to {bridge_host}:{bridge_port}")
    else:
        use_local_auth = ask_bool("Enable local MQTT authentication?", default=bool(current_local_user))
        local_user = ""
        local_password = ""
        if use_local_auth:
            local_user = ask("Local MQTT username", default=current_local_user)
            local_password_input = ask("Local MQTT password", default=masked_secret(current_local_password), secret=True)
            local_password = current_local_password if local_password_input == "********" else local_password_input
            _configure_mosquitto_local(local_tcp_port, local_ws_port, local_user, local_password)
        else:
            _configure_mosquitto_local(local_tcp_port, local_ws_port, None, None)
        bridge_host = ""
        bridge_port = 1883
        bridge_use_tls = False
        bridge_user = ""
        bridge_password = ""
        local_user = local_user if use_local_auth else ""
        local_password = local_password if use_local_auth else ""
        ok(f"Mosquitto configured locally (TCP:{local_tcp_port}, WS:{local_ws_port})")

    settings['mqttHost'] = "127.0.0.1"
    settings['mqttPort'] = local_tcp_port
    settings['mqttUseTls'] = False
    settings['mqttUser'] = local_user if not use_bridge else ""
    settings['mqttPassword'] = local_password if not use_bridge else ""
    settings['mqttBridgeEnabled'] = use_bridge
    settings['mqttBridgeHost'] = bridge_host
    settings['mqttBridgePort'] = bridge_port
    settings['mqttBridgeUseTls'] = bridge_use_tls
    settings['mqttBridgeUser'] = bridge_user
    settings['mqttBridgePassword'] = bridge_password

    api_settings['BrokerHostSettings']['Host'] = "127.0.0.1"
    api_settings['BrokerHostSettings']['Port'] = local_tcp_port
    api_settings['BrokerHostSettings']['WsPort'] = local_ws_port
    api_settings['BrokerHostSettings']['UseTls'] = False
    api_settings['BrokerHostSettings']['User'] = local_user if not use_bridge else ""
    api_settings['BrokerHostSettings']['Password'] = local_password if not use_bridge else ""


def _configure_mosquitto_local(tcp_port, ws_port, user, password):
    lines = [
        f"listener {tcp_port} 127.0.0.1",
        f"listener {ws_port} 127.0.0.1",
        "protocol websockets",
    ]
    if user and password:
        passwd_file = "/etc/mosquitto/thermalguard-hat.passwd"
        lines += [
            f"password_file {passwd_file}",
            "allow_anonymous false",
        ]
        try:
            subprocess.run(
                ["mosquitto_passwd", "-b", "-c", passwd_file, user, password],
                check=True, capture_output=True
            )
        except Exception as e:
            warn(f"Could not create Mosquitto password file: {e}")
    else:
        lines.append("allow_anonymous true")

    os.makedirs(os.path.dirname(MOSQUITTO_CONF_PATH), exist_ok=True)
    with open(MOSQUITTO_CONF_PATH, "w") as f:
        f.write("\n".join(lines) + "\n")


def _configure_mosquitto_bridge(local_tcp_port, local_ws_port, remote_host, remote_port, remote_use_tls, remote_user, remote_password):
    lines = [
        f"listener {local_tcp_port} 127.0.0.1",
        f"listener {local_ws_port} 127.0.0.1",
        "protocol websockets",
        "allow_anonymous true",
        "",
        "connection thermalguard-hat-bridge",
        f"address {remote_host}:{remote_port}",
        "start_type automatic",
        "notifications_local_only true",
        "try_private true",
        "topic temperatures both 0",
        "topic rpm both 0",
        "topic power both 0",
        "topic system both 0",
        "topic maxrefs both 0",
        "topic servicestatuschanged both 0",
        "topic modechanging both 0",
        "topic modechanged both 0",
        "topic boost both 0",
    ]

    if remote_user:
        lines.append(f"remote_username {remote_user}")
        if remote_password:
            lines.append(f"remote_password {remote_password}")

    if remote_use_tls:
        lines += [
            "bridge_tls_use_os_certs true",
            "bridge_tls_version tlsv1.2",
        ]

    os.makedirs(os.path.dirname(MOSQUITTO_CONF_PATH), exist_ok=True)
    with open(MOSQUITTO_CONF_PATH, "w") as f:
        f.write("\n".join(lines) + "\n")

# ---------------------------------------------------------------------------
# API / security
# ---------------------------------------------------------------------------

def configure_api(api_settings):
    section("API & Security")

    current_origin = api_settings.get('AllowedOrigins', f"http://{_get_ip()},https://{_get_ip()}")
    current_host = current_origin.split(",")[0].replace("http://", "").replace("https://", "").strip()
    host = ask("Hostname or IP of this device (used for CORS)", default=current_host or _get_ip())
    api_settings['AllowedOrigins'] = f"http://{host},https://{host}"

    current_secret = api_settings.get('Auth', {}).get('JwtSecret', '')
    print(f"\n  A random JWT secret will be generated automatically.")
    if ask_bool("  Generate now?", default=not bool(current_secret)):
        api_settings['Auth']['JwtSecret'] = generate_secret()
        ok("JWT secret generated")
    else:
        jwt_input = ask("JWT secret (min 32 chars)", default=masked_secret(current_secret), secret=True)
        api_settings['Auth']['JwtSecret'] = current_secret if jwt_input == "********" else jwt_input

    api_settings['Auth']['TokenExpiryHours'] = ask_int(
        "Token expiry (hours)", default=api_settings.get('Auth', {}).get('TokenExpiryHours', 12), min_val=1, max_val=720)

    api_settings['RetentionDays'] = ask_int(
        "Data retention (days)", default=api_settings.get('RetentionDays', 30), min_val=1, max_val=3650)

    current_kiosk_bypass = api_settings.get('Kiosk', {}).get('BypassIPs', [])
    kiosk_bypass_default = ", ".join(current_kiosk_bypass) if current_kiosk_bypass else ""
    api_settings.setdefault('Kiosk', {})
    api_settings['Kiosk']['BypassIPs'] = ask_ip_list(
        "Additional kiosk IP whitelist (comma-separated, optional)",
        default=kiosk_bypass_default
    )


def configure_display(shared_settings):
    section("Display & Naming")

    display = shared_settings.setdefault("Display", {})
    display['DashboardTitle'] = ask("Dashboard title", default=display.get('DashboardTitle', "Dashboard"))
    display['Sensor1Name'] = ask("Sensor 1 display name", default=display.get('Sensor1Name', "Rack"))
    display['Sensor2Name'] = ask("Sensor 2 display name", default=display.get('Sensor2Name', "Ambient"))
    display['Fan1Name'] = ask("Fan 1 display name", default=display.get('Fan1Name', "Intake Fan"))
    display['Fan2Name'] = ask("Fan 2 display name", default=display.get('Fan2Name', "Exhaust Fan"))
    display['Locale'] = ask("Display locale", default=display.get('Locale', "en-US"))
    display['TemperatureUnit'] = ask_choice("Temperature unit (C/F)", ["C", "F"], default=display.get('TemperatureUnit', "C").upper(), case_sensitive=False)
    display['DisableFanAnimations'] = ask_bool("Disable fan animations?", default=display.get('DisableFanAnimations', False))
    display['AirflowUnit'] = ask_choice("Airflow unit (m3h/CFM)", ["m3h", "CFM"], default=display.get('AirflowUnit', "m3h"), case_sensitive=False)
    display['Fan1MaxAirflow'] = ask_float("Fan 1 max airflow", default=display.get('Fan1MaxAirflow', 95), min_val=1, max_val=10000)
    display['Fan2MaxAirflow'] = ask_float("Fan 2 max airflow", default=display.get('Fan2MaxAirflow', 95), min_val=1, max_val=10000)

def configure_kiosk_setup(shared_settings):
    section("Kiosk Mode")

    kiosk_setup = shared_settings.setdefault("KioskSetup", {})
    enabled = ask_bool("Enable kiosk mode?", default=kiosk_setup.get("Enabled", False))
    kiosk_setup["Enabled"] = enabled

    if not enabled:
        return

    default_user = kiosk_setup.get("User") or os.environ.get("SUDO_USER") or os.environ.get("USER") or "pi"
    kiosk_setup["User"] = ask("Which local user should run kiosk mode", default=default_user)
    kiosk_setup["Inline"] = ask_bool("Enable inline layout?", default=kiosk_setup.get("Inline", False))
    kiosk_setup["HideCursor"] = ask_bool("Hide the mouse cursor automatically?", default=kiosk_setup.get("HideCursor", True))
    kiosk_setup["DesktopAutologin"] = ask_bool("Enable desktop autologin?", default=kiosk_setup.get("DesktopAutologin", True))
    kiosk_setup["DisableScreenBlanking"] = ask_bool("Disable screen blanking?", default=kiosk_setup.get("DisableScreenBlanking", True))
    kiosk_setup["Autostart"] = ask_bool("Start kiosk automatically on login?", default=kiosk_setup.get("Autostart", True))

def _get_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        try:
            host_ips = socket.gethostbyname_ex(socket.gethostname())[2]
            for ip in host_ips:
                if ip and not ip.startswith("127."):
                    return ip
        except Exception:
            pass
        return "raspberrypi.local"


def get_install_root(sensor_dir, api_dir):
    return os.path.commonpath([os.path.abspath(sensor_dir), os.path.abspath(api_dir)])


def get_shared_config_path(sensor_dir, api_dir):
    install_root = get_install_root(sensor_dir, api_dir)
    return os.path.join(install_root, "config", "settings.json")


def build_default_shared_settings(install_root):
    api_db_path = os.path.join(install_root, "api", "db", "LocalDatabase.db")
    return {
        "ConnectionStrings": {
            "WebApiDatabase": f"Data Source={api_db_path}"
        },
        "AllowedOrigins": f"http://{_get_ip()}",
        "RetentionDays": 30,
        "Auth": {
            "JwtSecret": "change-me-in-production-at-least-32-chars!!",
            "TokenExpiryHours": 12,
        },
        "Kiosk": {
            "BypassIPs": [],
        },
        "KioskSetup": {
            "Enabled": False,
            "User": "",
            "Inline": False,
            "HideCursor": True,
            "DesktopAutologin": True,
            "DisableScreenBlanking": True,
            "Autostart": True,
        },
        "BrokerHostSettings": {
            "Host": "127.0.0.1",
            "Port": 1883,
            "WsPort": 1884,
            "User": "",
            "Password": "",
            "UseTls": False,
        },
        "ClientSettings": {
            "Id": "thermalguard-hat-api"
        },
        "Display": {
            "DashboardTitle": "Dashboard",
            "Sensor1Name": "Rack",
            "Sensor2Name": "Ambient",
            "Fan1Name": "Intake Fan",
            "Fan2Name": "Exhaust Fan",
            "Locale": "en-US",
            "TemperatureUnit": "C",
            "DisableFanAnimations": False,
            "AirflowUnit": "m3h",
            "Fan1MaxAirflow": 95.0,
            "Fan2MaxAirflow": 95.0,
        },
        "Python": {
            "Debug": "INFO",
            "SaveDelaySecond": 15,
            "ScreenStandByDelay": 30,
            "FanFrequency": 25000,
            "FanPWMResolution": 1000,
            "GpioChip": 0,
            "FanPwmChipPath": "",
            "Fan1PwmChannel": 0,
            "Fan2PwmChannel": 1,
            "FanTempoSeconds": 30,
            "Fan1Pin": 12,
            "Fan2Pin": 13,
            "SysBuzzer": 22,
            "SystemFan": 23,
            "Fan1Sensor": 25,
            "Fan2Sensor": 24,
            "FanTachGlitchFilterUs": 50,
            "Button1Pin": 17,
            "Button2Pin": 0,
            "RedLed": 6,
            "GreenLed": 5,
            "OutputEnabled": 4,
            "DbName": "temperatures",
            "Sensor1Uid": "xxxxxxxxxxxx",
            "Sensor2Uid": "xxxxxxxxxxxx",
            "SysFanThreshold": 38,
        },
        "Mosquitto": {
            "Local": {
                "Authentication": {
                    "Enabled": False,
                    "Username": "",
                    "Password": "",
                }
            },
            "Bridge": {
                "Enabled": False,
                "Host": "",
                "Port": 1883,
                "UseTls": False,
                "Username": "",
                "Password": "",
            },
        },
    }


def shared_to_sensor_settings(shared_settings):
    python_settings = shared_settings.get("Python", {})
    broker_settings = shared_settings.get("BrokerHostSettings", {})
    mosquitto_settings = shared_settings.get("Mosquitto", {})
    local_auth = mosquitto_settings.get("Local", {}).get("Authentication", {})
    bridge = mosquitto_settings.get("Bridge", {})
    connection_strings = shared_settings.get("ConnectionStrings", {})
    legacy_python_db_path = python_settings.get("DbPath", os.path.join("..", "api", "db", "LocalDatabase.db"))
    db_connection = connection_strings.get("WebApiDatabase", db_path_to_connection_string(legacy_python_db_path))

    return {
        "debug": python_settings.get("Debug", "INFO"),
        "saveDelaySecond": python_settings.get("SaveDelaySecond", 15),
        "screenStandByDelay": python_settings.get("ScreenStandByDelay", 30),
        "fanFrequency": python_settings.get("FanFrequency", 25000),
        "fanPWMResolution": python_settings.get("FanPWMResolution", 1000),
        "gpioChip": python_settings.get("GpioChip", 0),
        "fanPwmChipPath": python_settings.get("FanPwmChipPath", ""),
        "fan1PwmChannel": python_settings.get("Fan1PwmChannel", 0),
        "fan2PwmChannel": python_settings.get("Fan2PwmChannel", 1),
        "fanTempoSeconds": python_settings.get("FanTempoSeconds", 30),
        "fan1Pin": python_settings.get("Fan1Pin", 12),
        "fan2Pin": python_settings.get("Fan2Pin", 13),
        "sysBuzzer": python_settings.get("SysBuzzer", 22),
        "systemFan": python_settings.get("SystemFan", 23),
        "fan1Sensor": python_settings.get("Fan1Sensor", 25),
        "fan2Sensor": python_settings.get("Fan2Sensor", 24),
        "fanTachGlitchFilterUs": python_settings.get("FanTachGlitchFilterUs", 50),
        "button1Pin": python_settings.get("Button1Pin", 17),
        "button2Pin": python_settings.get("Button2Pin", 0),
        "redLed": python_settings.get("RedLed", 6),
        "greenLed": python_settings.get("GreenLed", 5),
        "outputEnabled": python_settings.get("OutputEnabled", 4),
        "dbPath": connection_string_to_db_path(db_connection, legacy_python_db_path),
        "dbName": python_settings.get("DbName", "temperatures"),
        "mqttHost": broker_settings.get("Host", "127.0.0.1"),
        "mqttPort": broker_settings.get("Port", 1883),
        "mqttUseTls": broker_settings.get("UseTls", False),
        "mqttUser": broker_settings.get("User", local_auth.get("Username", "")),
        "mqttPassword": broker_settings.get("Password", local_auth.get("Password", "")),
        "mqttBridgeEnabled": bridge.get("Enabled", False),
        "mqttBridgeHost": bridge.get("Host", ""),
        "mqttBridgePort": bridge.get("Port", 1883),
        "mqttBridgeUseTls": bridge.get("UseTls", False),
        "mqttBridgeUser": bridge.get("Username", ""),
        "mqttBridgePassword": bridge.get("Password", ""),
        "sensor1Uid": python_settings.get("Sensor1Uid", "xxxxxxxxxxxx"),
        "sensor2Uid": python_settings.get("Sensor2Uid", "xxxxxxxxxxxx"),
        "sysFanThreshold": python_settings.get("SysFanThreshold", 38),
    }


def sync_shared_settings(shared_settings, sensor_settings, api_settings, install_root):
    shared_settings["AllowedOrigins"] = api_settings.get("AllowedOrigins", shared_settings.get("AllowedOrigins", f"http://{_get_ip()}"))
    shared_settings["RetentionDays"] = api_settings.get("RetentionDays", shared_settings.get("RetentionDays", 30))
    shared_settings.setdefault("Auth", {})
    shared_settings["Auth"]["JwtSecret"] = api_settings.get("Auth", {}).get("JwtSecret", shared_settings["Auth"].get("JwtSecret", ""))
    shared_settings["Auth"]["TokenExpiryHours"] = api_settings.get("Auth", {}).get("TokenExpiryHours", shared_settings["Auth"].get("TokenExpiryHours", 12))
    shared_settings.setdefault("Kiosk", {})
    shared_settings["Kiosk"]["BypassIPs"] = api_settings.get("Kiosk", {}).get("BypassIPs", shared_settings["Kiosk"].get("BypassIPs", []))

    shared_settings.setdefault("BrokerHostSettings", {})
    shared_settings["BrokerHostSettings"]["Host"] = api_settings.get("BrokerHostSettings", {}).get("Host", "127.0.0.1")
    shared_settings["BrokerHostSettings"]["Port"] = api_settings.get("BrokerHostSettings", {}).get("Port", 1883)
    shared_settings["BrokerHostSettings"]["WsPort"] = api_settings.get("BrokerHostSettings", {}).get("WsPort", 1884)
    shared_settings["BrokerHostSettings"]["User"] = api_settings.get("BrokerHostSettings", {}).get("User", "")
    shared_settings["BrokerHostSettings"]["Password"] = api_settings.get("BrokerHostSettings", {}).get("Password", "")
    shared_settings["BrokerHostSettings"]["UseTls"] = api_settings.get("BrokerHostSettings", {}).get("UseTls", False)

    shared_settings.setdefault("Display", {})
    shared_settings["Display"]["DashboardTitle"] = shared_settings["Display"].get("DashboardTitle", "Dashboard")
    shared_settings["Display"]["Sensor1Name"] = shared_settings["Display"].get("Sensor1Name", "Rack")
    shared_settings["Display"]["Sensor2Name"] = shared_settings["Display"].get("Sensor2Name", "Ambient")
    shared_settings["Display"]["Fan1Name"] = shared_settings["Display"].get("Fan1Name", "Intake Fan")
    shared_settings["Display"]["Fan2Name"] = shared_settings["Display"].get("Fan2Name", "Exhaust Fan")
    shared_settings["Display"]["Locale"] = shared_settings["Display"].get("Locale", "en-US")
    shared_settings["Display"]["TemperatureUnit"] = shared_settings["Display"].get("TemperatureUnit", "C")
    shared_settings["Display"]["DisableFanAnimations"] = shared_settings["Display"].get("DisableFanAnimations", False)
    shared_settings["Display"]["AirflowUnit"] = shared_settings["Display"].get("AirflowUnit", "m3h")
    shared_settings["Display"]["Fan1MaxAirflow"] = float(shared_settings["Display"].get("Fan1MaxAirflow", 95.0))
    shared_settings["Display"]["Fan2MaxAirflow"] = float(shared_settings["Display"].get("Fan2MaxAirflow", 95.0))

    shared_settings.setdefault("Python", {})
    shared_settings["Python"].update({
        "Debug": sensor_settings.get("debug", "INFO"),
        "SaveDelaySecond": sensor_settings.get("saveDelaySecond", 15),
        "ScreenStandByDelay": sensor_settings.get("screenStandByDelay", 30),
        "FanFrequency": sensor_settings.get("fanFrequency", 25000),
        "FanPWMResolution": sensor_settings.get("fanPWMResolution", 1000),
        "GpioChip": sensor_settings.get("gpioChip", 0),
        "FanPwmChipPath": sensor_settings.get("fanPwmChipPath", ""),
        "Fan1PwmChannel": sensor_settings.get("fan1PwmChannel", 0),
        "Fan2PwmChannel": sensor_settings.get("fan2PwmChannel", 1),
        "FanTempoSeconds": sensor_settings.get("fanTempoSeconds", 30),
        "Fan1Pin": sensor_settings.get("fan1Pin", 12),
        "Fan2Pin": sensor_settings.get("fan2Pin", 13),
        "SysBuzzer": sensor_settings.get("sysBuzzer", 22),
        "SystemFan": sensor_settings.get("systemFan", 23),
        "Fan1Sensor": sensor_settings.get("fan1Sensor", 25),
        "Fan2Sensor": sensor_settings.get("fan2Sensor", 24),
        "FanTachGlitchFilterUs": sensor_settings.get("fanTachGlitchFilterUs", 50),
        "Button1Pin": sensor_settings.get("button1Pin", 17),
        "Button2Pin": sensor_settings.get("button2Pin", 0),
        "RedLed": sensor_settings.get("redLed", 6),
        "GreenLed": sensor_settings.get("greenLed", 5),
        "OutputEnabled": sensor_settings.get("outputEnabled", 4),
        "DbName": sensor_settings.get("dbName", "temperatures"),
        "Sensor1Uid": sensor_settings.get("sensor1Uid", "xxxxxxxxxxxx"),
        "Sensor2Uid": sensor_settings.get("sensor2Uid", "xxxxxxxxxxxx"),
        "SysFanThreshold": sensor_settings.get("sysFanThreshold", 38),
    })
    shared_settings["Python"].pop("DbPath", None)

    shared_settings.setdefault("ConnectionStrings", {})
    db_path = sensor_settings.get("dbPath", os.path.join(install_root, "api", "db", "LocalDatabase.db"))
    shared_settings["ConnectionStrings"]["WebApiDatabase"] = db_path_to_connection_string(db_path)

    shared_settings.setdefault("Mosquitto", {})
    shared_settings["Mosquitto"].setdefault("Local", {})
    shared_settings["Mosquitto"]["Local"].setdefault("Authentication", {})
    local_auth_enabled = bool(sensor_settings.get("mqttUser"))
    shared_settings["Mosquitto"]["Local"]["Authentication"].update({
        "Enabled": local_auth_enabled,
        "Username": sensor_settings.get("mqttUser", ""),
        "Password": sensor_settings.get("mqttPassword", ""),
    })

    shared_settings["Mosquitto"].setdefault("Bridge", {})
    shared_settings["Mosquitto"]["Bridge"].update({
        "Enabled": sensor_settings.get("mqttBridgeEnabled", False),
        "Host": sensor_settings.get("mqttBridgeHost", ""),
        "Port": sensor_settings.get("mqttBridgePort", 1883),
        "UseTls": sensor_settings.get("mqttBridgeUseTls", False),
        "Username": sensor_settings.get("mqttBridgeUser", ""),
        "Password": sensor_settings.get("mqttBridgePassword", ""),
    })


def load_shared_settings(config_path):
    if os.path.exists(config_path):
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)
    return None

# ---------------------------------------------------------------------------
# Write config files
# ---------------------------------------------------------------------------

def write_shared_settings(shared_settings, config_path):
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(shared_settings, f, indent=2)
    ok(f"Shared settings written to {config_path}")

def load_api_settings(api_dir):
    path = os.path.join(api_dir, "appsettings.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    error(f"appsettings.json not found in {api_dir}")

def load_sensor_settings(sensor_dir):
    path = os.path.join(sensor_dir, "settings.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="ThermalGuard HAT configuration wizard")
    parser.add_argument("--api-dir", required=True, help="Path to published API directory")
    args = parser.parse_args()

    sensor_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    install_root = get_install_root(sensor_dir, args.api_dir)
    shared_config_path = get_shared_config_path(sensor_dir, args.api_dir)

    print(f"\n{BOLD}{'=' * 50}")
    print("  ThermalGuard HAT - Setup Wizard")
    print(f"{'=' * 50}{NC}")
    print("\n  This wizard will configure your ThermalGuard HAT unit.")
    print("  Press Ctrl+C at any time to abort.\n")

    shared_settings = build_default_shared_settings(install_root)
    existing_shared_settings = load_shared_settings(shared_config_path)
    if existing_shared_settings:
        for key, value in existing_shared_settings.items():
            if isinstance(value, dict) and isinstance(shared_settings.get(key), dict):
                shared_settings[key].update(value)
            else:
                shared_settings[key] = value
    else:
        existing_sensor_settings = load_sensor_settings(sensor_dir)
        api_settings_legacy = load_api_settings(args.api_dir)
        if existing_sensor_settings:
            sync_shared_settings(shared_settings, existing_sensor_settings, api_settings_legacy, install_root)

    sensor_settings = shared_to_sensor_settings(shared_settings)

    api_settings = load_api_settings(args.api_dir)
    api_settings['AllowedOrigins'] = shared_settings.get('AllowedOrigins', api_settings.get('AllowedOrigins'))
    api_settings['RetentionDays'] = shared_settings.get('RetentionDays', api_settings.get('RetentionDays', 30))
    api_settings.setdefault('Auth', {}).update(shared_settings.get('Auth', {}))
    api_settings.setdefault('BrokerHostSettings', {}).update(shared_settings.get('BrokerHostSettings', {}))
    api_settings.setdefault('ClientSettings', {}).update(shared_settings.get('ClientSettings', {}))

    try:
        configure_api(api_settings)
        configure_display(shared_settings)
        configure_kiosk_setup(shared_settings)
        configure_mqtt(sensor_settings, api_settings)
        configure_sensors(sensor_settings)
        configure_thresholds(sensor_settings)
    except KeyboardInterrupt:
        print("\n\nAborted. No files written.")
        sys.exit(1)

    section("Summary")
    print(f"  Sensor 1        : {sensor_settings['sensor1Uid']}")
    print(f"  Sensor 2        : {sensor_settings['sensor2Uid']}")
    print(f"  Dashboard title : {shared_settings.get('Display', {}).get('DashboardTitle', 'Dashboard')}")
    print(f"  Sensor names    : {shared_settings.get('Display', {}).get('Sensor1Name', 'Rack')} / {shared_settings.get('Display', {}).get('Sensor2Name', 'Ambient')}")
    print(f"  Fan names       : {shared_settings.get('Display', {}).get('Fan1Name', 'Intake Fan')} / {shared_settings.get('Display', {}).get('Fan2Name', 'Exhaust Fan')}")
    print(f"  Airflow         : {shared_settings.get('Display', {}).get('Fan1MaxAirflow', 95)} / {shared_settings.get('Display', {}).get('Fan2MaxAirflow', 95)} {shared_settings.get('Display', {}).get('AirflowUnit', 'm3h')}")
    print(f"  MQTT host       : {sensor_settings['mqttHost']}:{sensor_settings['mqttPort']}")
    print(f"  MQTT WS port    : {api_settings['BrokerHostSettings']['WsPort']}")
    print(f"  MQTT bridge     : {'enabled' if sensor_settings.get('mqttBridgeEnabled') else 'disabled'}")
    if sensor_settings.get('mqttBridgeEnabled'):
        tls_label = "TLS" if sensor_settings.get('mqttBridgeUseTls') else "plain"
        print(f"  Bridge target   : {sensor_settings.get('mqttBridgeHost')}:{sensor_settings.get('mqttBridgePort')} ({tls_label})")
    print(f"  Allowed origins : {api_settings['AllowedOrigins']}")
    print(f"  Kiosk bypass IPs: {', '.join(api_settings.get('Kiosk', {}).get('BypassIPs', [])) or 'none'}")
    print(f"  Kiosk mode      : {'enabled' if shared_settings.get('KioskSetup', {}).get('Enabled') else 'disabled'}")
    print(f"  Retention       : {api_settings['RetentionDays']} days")
    print()

    if not ask_bool("Write configuration?", default=True):
        print("Aborted. No files written.")
        sys.exit(0)

    sync_shared_settings(shared_settings, sensor_settings, api_settings, install_root)
    write_shared_settings(shared_settings, shared_config_path)

    section("Done")
    print("  Configuration complete. Services will start momentarily.\n")


if __name__ == "__main__":
    main()





