import json
import logging
import os
import socket
import subprocess
import sys
from enum import Enum

import netifaces


class Verbose(Enum):
    INFO = 0
    WARNING = 1
    ERROR = 2
    DEBUG = 3


_LOG_LEVELS = {
    Verbose.INFO: logging.INFO,
    Verbose.WARNING: logging.WARNING,
    Verbose.ERROR: logging.ERROR,
    Verbose.DEBUG: logging.DEBUG,
}

_LOGGER = logging.getLogger("thermalguard-hat.sensor")
debug_level = Verbose.INFO

CONTROL_MODE_LINKED_FANS = "linked_fans"
CONTROL_MODE_INDEPENDENT = "independent"
CONTROL_MODE_DIFFERENTIAL = "differential"

LINKED_SENSOR_1 = "sensor1"
LINKED_SENSOR_2 = "sensor2"

DIFFERENTIAL_SENSOR1_MINUS_SENSOR2 = "sensor1_minus_sensor2"
DIFFERENTIAL_SENSOR2_MINUS_SENSOR1 = "sensor2_minus_sensor1"


def setup_logging(level_name):
    global debug_level
    level = Verbose[level_name] if isinstance(level_name, str) else level_name
    debug_level = level
    log_level = _LOG_LEVELS.get(level, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s %(levelname)s [%(threadName)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))

    _LOGGER.handlers.clear()
    _LOGGER.addHandler(handler)
    _LOGGER.setLevel(log_level)
    _LOGGER.propagate = False


def debug_print(msg, verbose: Verbose):
    _LOGGER.log(_LOG_LEVELS.get(verbose, logging.INFO), str(msg))


def _candidate_config_paths():
    env_path = os.environ.get("THERMALGUARD_HAT_CONFIG_PATH")
    if env_path:
        yield env_path

    cwd = os.getcwd()
    yield os.path.join(cwd, "..", "config", "settings.json")
    yield os.path.join(cwd, "config", "settings.json")
    yield "/opt/thermalguard-hat/config/settings.json"


def _normalize_shared_settings(shared):
    python_settings = shared.get("Python", {})
    connection_settings = shared.get("ConnectionStrings", {})
    broker_settings = shared.get("BrokerHostSettings", {})
    mosquitto_settings = shared.get("Mosquitto", {})
    local_auth = mosquitto_settings.get("Local", {}).get("Authentication", {})
    bridge_settings = mosquitto_settings.get("Bridge", {})
    display_settings = shared.get("Display", {})

    db_path = connection_settings.get("WebApiDatabase", "")
    if db_path:
        db_path = _connection_string_to_db_path(db_path)
    else:
        db_path = python_settings.get("DbPath", "../api/db/LocalDatabase.db")

    return {
        "debug": python_settings.get("Debug", "INFO"),
        "saveDelaySecond": python_settings.get("SaveDelaySecond", 15),
        "screenStandByDelay": python_settings.get("ScreenStandByDelay", 30),
        "fanFrequency": python_settings.get("FanFrequency", 25000),
        "fanPWMResolution": python_settings.get("FanPWMResolution", 1000),
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
        "fanTachGlitchFilterUs": python_settings.get("FanTachGlitchFilterUs", 100),
        "button1Pin": python_settings.get("Button1Pin", 17),
        "button2Pin": python_settings.get("Button2Pin", 0),
        "redLed": python_settings.get("RedLed", 6),
        "greenLed": python_settings.get("GreenLed", 5),
        "outputEnabled": python_settings.get("OutputEnabled", 4),
        "dbPath": db_path,
        "dbName": python_settings.get("DbName", "temperatures"),
        "mqttHost": broker_settings.get("Host", "127.0.0.1"),
        "mqttPort": broker_settings.get("Port", 1883),
        "mqttUseTls": broker_settings.get("UseTls", False),
        "mqttUser": broker_settings.get("User", local_auth.get("Username", "")),
        "mqttPassword": broker_settings.get("Password", local_auth.get("Password", "")),
        "mqttBridgeEnabled": bridge_settings.get("Enabled", False),
        "mqttBridgeHost": bridge_settings.get("Host", ""),
        "mqttBridgePort": bridge_settings.get("Port", 1883),
        "mqttBridgeUseTls": bridge_settings.get("UseTls", False),
        "mqttBridgeUser": bridge_settings.get("Username", ""),
        "mqttBridgePassword": bridge_settings.get("Password", ""),
        "sensor1Uid": python_settings.get("Sensor1Uid", "xxxxxxxxxxxx"),
        "sensor2Uid": python_settings.get("Sensor2Uid", "xxxxxxxxxxxx"),
        "sysFanThreshold": python_settings.get("SysFanThreshold", 38),
        "dashboardTitle": display_settings.get("DashboardTitle", "Dashboard"),
        "sensor1Name": display_settings.get("Sensor1Name", "Rack"),
        "sensor2Name": display_settings.get("Sensor2Name", "Ambient"),
        "fan1Name": display_settings.get("Fan1Name", "Intake Fan"),
        "fan2Name": display_settings.get("Fan2Name", "Exhaust Fan"),
}


def _connection_string_to_db_path(connection_string):
    for segment in str(connection_string).split(";"):
        segment = segment.strip()
        if not segment or "=" not in segment:
            continue
        key, value = segment.split("=", 1)
        if key.strip().lower() == "data source":
            return value.strip()
    return "../api/db/LocalDatabase.db"


def read_settings():
    for candidate in _candidate_config_paths():
        full_path = os.path.abspath(candidate)
        if not os.path.exists(full_path):
            continue
        with open(full_path, encoding='utf-8') as f:
            payload = json.load(f)
        if "Python" in payload:
            return _normalize_shared_settings(payload)
        return payload
    raise FileNotFoundError(
        "Shared settings file not found. Expected config/settings.json or THERMALGUARD_HAT_CONFIG_PATH."
    )


def get_ip_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        pass

    for interface in _preferred_network_interfaces():
        try:
            inet_addresses = netifaces.ifaddresses(interface).get(netifaces.AF_INET, [])
        except ValueError:
            continue

        for address in inet_addresses:
            ip = address.get("addr", "")
            if ip and not ip.startswith("127."):
                return ip

    return "Unavailable"


def get_mac_address():
    for interface in _preferred_network_interfaces():
        try:
            link_addresses = netifaces.ifaddresses(interface).get(netifaces.AF_LINK, [])
        except ValueError:
            continue

        for address in link_addresses:
            mac = str(address.get("addr", "")).strip()
            if mac and mac != "00:00:00:00:00:00":
                return mac

    return "Unavailable"


def _preferred_network_interfaces():
    try:
        default_gateway = netifaces.gateways().get("default", {}).get(netifaces.AF_INET, ())
        default_interface = default_gateway[1] if len(default_gateway) > 1 else ""
    except ValueError:
        default_interface = ""

    preferred = []
    for interface in netifaces.interfaces():
        if interface == "lo":
            continue
        if interface.startswith(("docker", "veth", "br-", "virbr", "tun", "tap")):
            continue
        preferred.append(interface)

    preferred.sort(key=lambda name: (
        0 if name == default_interface else 1 if name.startswith("wlan") else 2 if name.startswith("eth") else 3,
        name,
    ))
    return preferred


def _condition_value(condition, key, index):
    try:
        return condition[key]
    except (TypeError, KeyError, IndexError):
        return condition[index]


def get_fans_power_reference(
    temp1,
    temp2,
    conditions,
    linked_mode=True,
    control_mode=None,
    linked_sensor=LINKED_SENSOR_1,
    differential_mode=DIFFERENTIAL_SENSOR1_MINUS_SENSOR2,
):
    result = {'Value1': 0, 'Value2': 0}

    normalized_control_mode = control_mode or (
        CONTROL_MODE_LINKED_FANS if linked_mode else CONTROL_MODE_INDEPENDENT
    )

    if normalized_control_mode == CONTROL_MODE_INDEPENDENT:
        for condition in conditions:
            min_temp1 = _condition_value(condition, 'MinTemp1', 1)
            value1 = _condition_value(condition, 'Value1', 3)
            if temp1 is not None and temp1 > min_temp1:
                result['Value1'] = value1
                break

        for condition in conditions:
            min_temp2 = _condition_value(condition, 'MinTemp2', 2)
            value2 = _condition_value(condition, 'Value2', 4)
            if temp2 is not None and temp2 > min_temp2:
                result['Value2'] = value2
                break

        return result

    if normalized_control_mode == CONTROL_MODE_DIFFERENTIAL:
        if temp1 is None or temp2 is None:
            return result

        if differential_mode == DIFFERENTIAL_SENSOR2_MINUS_SENSOR1:
            differential_temp = temp2 - temp1
        else:
            differential_temp = temp1 - temp2

        for condition in conditions:
            threshold = _condition_value(condition, 'MinTemp1', 1)
            value1 = _condition_value(condition, 'Value1', 3)
            value2 = _condition_value(condition, 'Value2', 4)

            if differential_temp > threshold:
                result['Value1'] = value1
                result['Value2'] = value2
                break

        return result

    selected_sensor = LINKED_SENSOR_2 if linked_sensor == LINKED_SENSOR_2 else LINKED_SENSOR_1
    for condition in conditions:
        threshold = _condition_value(
            condition,
            'MinTemp2' if selected_sensor == LINKED_SENSOR_2 else 'MinTemp1',
            2 if selected_sensor == LINKED_SENSOR_2 else 1,
        )
        value1 = _condition_value(condition, 'Value1', 3)
        value2 = _condition_value(condition, 'Value2', 4)

        trigger_temp = temp2 if selected_sensor == LINKED_SENSOR_2 else temp1
        if trigger_temp is not None and trigger_temp > threshold:
            result['Value1'] = value1
            result['Value2'] = value2
            break
    return result


def check_pigpiod_status():
    try:
        result = subprocess.run(
            ["sudo", "systemctl", "status", "pigpiod"],
            capture_output=True,
            text=True,
            check=False,
        )
        return "active (running)" in result.stdout
    except Exception as ex:
        debug_print(f"Unable to check pigpiod status: {ex}", Verbose.ERROR)
        return False


def start_service(name):
    try:
        subprocess.run(["sudo", "systemctl", "start", name], check=True, capture_output=True)
        debug_print(f"{name} started.", Verbose.INFO)
    except subprocess.CalledProcessError as ex:
        debug_print(f"Error starting {name}: {ex}", Verbose.ERROR)


def restart_service(name):
    try:
        subprocess.run(["sudo", "systemctl", "restart", name], check=True, capture_output=True)
        debug_print(f"{name} restarted.", Verbose.INFO)
    except subprocess.CalledProcessError as ex:
        debug_print(f"Error restarting {name}: {ex}", Verbose.ERROR)


def reboot_system():
    try:
        subprocess.run(["sudo", "reboot"], check=True)
    except subprocess.CalledProcessError as ex:
        debug_print(f"Error during reboot: {ex}", Verbose.ERROR)
