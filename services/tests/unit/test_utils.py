import json

import pytest

import utils


def test_normalize_shared_settings_should_map_values_and_defaults():
    payload = {
        "ConnectionStrings": {
            "WebApiDatabase": "Data Source=/data/thermalguard.db",
        },
        "Python": {
            "Debug": "DEBUG",
            "SaveDelaySecond": 10,
            "ScreenStandByDelay": 45,
            "FanTempoSeconds": 12,
            "SysFanThreshold": 41,
        },
        "BrokerHostSettings": {
            "Host": "mqtt.local",
            "Port": 1884,
            "UseTls": True,
        },
        "Mosquitto": {
            "Local": {
                "Authentication": {
                    "Username": "local-user",
                    "Password": "local-pass",
                }
            }
        },
        "Display": {
            "DashboardTitle": "Rack",
            "Sensor1Name": "CPU",
            "Fan1Name": "Front Fan",
        },
    }

    result = utils._normalize_shared_settings(payload)

    assert result["debug"] == "DEBUG"
    assert result["saveDelaySecond"] == 10
    assert result["screenStandByDelay"] == 45
    assert result["fanTempoSeconds"] == 12
    assert result["fanPwmChipPath"] == ""
    assert result["fan1PwmChannel"] == 0
    assert result["fan2PwmChannel"] == 1
    assert result["dbPath"] == "/data/thermalguard.db"
    assert result["mqttHost"] == "mqtt.local"
    assert result["mqttPort"] == 1884
    assert result["mqttUseTls"] is True
    assert result["mqttUser"] == "local-user"
    assert result["mqttPassword"] == "local-pass"
    assert result["fanTachGlitchFilterUs"] == 100
    assert result["sysFanThreshold"] == 41
    assert result["dashboardTitle"] == "Rack"
    assert result["sensor1Name"] == "CPU"
    assert result["fan1Name"] == "Front Fan"
    assert result["sensor2Name"] == "Ambient"
    assert result["fan2Name"] == "Exhaust Fan"


def test_read_settings_should_use_environment_path_and_normalize_shared_payload(tmp_path, monkeypatch):
    config_path = tmp_path / "settings.json"
    config_path.write_text(
        json.dumps(
            {
                "Python": {
                    "Debug": "INFO",
                },
                "ConnectionStrings": {
                    "WebApiDatabase": "Data Source=/tmp/test.db",
                },
                "BrokerHostSettings": {
                    "Host": "127.0.0.1",
                    "Port": 1883,
                    "UseTls": False,
                },
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setenv("THERMALGUARD_HAT_CONFIG_PATH", str(config_path))

    result = utils.read_settings()

    assert result["debug"] == "INFO"
    assert result["dbPath"] == "/tmp/test.db"
    assert result["mqttHost"] == "127.0.0.1"
    assert result["mqttPort"] == 1883
    assert result["fanPwmChipPath"] == ""
    assert result["fan1PwmChannel"] == 0
    assert result["fan2PwmChannel"] == 1
    assert result["fanTachGlitchFilterUs"] == 100


def test_normalize_shared_settings_should_fallback_to_legacy_python_db_path():
    payload = {
        "Python": {
            "DbPath": "/legacy/test.db",
        },
    }

    result = utils._normalize_shared_settings(payload)

    assert result["dbPath"] == "/legacy/test.db"


def test_read_settings_should_raise_when_no_candidate_exists(monkeypatch, tmp_path):
    monkeypatch.delenv("THERMALGUARD_HAT_CONFIG_PATH", raising=False)
    monkeypatch.chdir(tmp_path)

    with pytest.raises(FileNotFoundError):
        utils.read_settings()


def test_preferred_network_interfaces_should_sort_default_then_wifi_then_ethernet(monkeypatch):
    monkeypatch.setattr(utils.netifaces, "interfaces", lambda: ["lo", "eth0", "wlan0", "docker0", "eth1"])
    monkeypatch.setattr(
        utils.netifaces,
        "gateways",
        lambda: {"default": {utils.netifaces.AF_INET: ("192.168.1.1", "eth1")}},
    )

    result = utils._preferred_network_interfaces()

    assert result == ["eth1", "wlan0", "eth0"]


def test_get_fans_power_reference_should_use_descending_first_match_in_linked_mode():
    conditions = [
        {"MinTemp1": 40, "MinTemp2": 40, "Value1": 90, "Value2": 90},
        {"MinTemp1": 30, "MinTemp2": 30, "Value1": 60, "Value2": 60},
        {"MinTemp1": 20, "MinTemp2": 20, "Value1": 30, "Value2": 30},
    ]

    result = utils.get_fans_power_reference(35, 25, conditions, linked_mode=True)

    assert result == {"Value1": 60, "Value2": 60}


def test_get_fans_power_reference_should_evaluate_each_sensor_independently_when_unlinked():
    conditions = [
        {"MinTemp1": 40, "MinTemp2": 40, "Value1": 90, "Value2": 90},
        {"MinTemp1": 30, "MinTemp2": 30, "Value1": 60, "Value2": 60},
        {"MinTemp1": 20, "MinTemp2": 20, "Value1": 30, "Value2": 30},
    ]

    result = utils.get_fans_power_reference(35, 45, conditions, linked_mode=False)

    assert result == {"Value1": 60, "Value2": 90}


def test_get_ip_address_should_fallback_to_preferred_interfaces_when_socket_fails(monkeypatch):
    class FailingSocket:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def connect(self, *_args, **_kwargs):
            raise OSError("network unavailable")

    monkeypatch.setattr(utils.socket, "socket", lambda *_args, **_kwargs: FailingSocket())
    monkeypatch.setattr(utils, "_preferred_network_interfaces", lambda: ["eth0"])
    monkeypatch.setattr(
        utils.netifaces,
        "ifaddresses",
        lambda interface: {
            utils.netifaces.AF_INET: [{"addr": "192.168.1.42"}],
        },
    )

    result = utils.get_ip_address()

    assert result == "192.168.1.42"


def test_get_mac_address_should_skip_zero_mac_and_return_first_valid_interface(monkeypatch):
    monkeypatch.setattr(utils, "_preferred_network_interfaces", lambda: ["eth0", "wlan0"])

    def fake_ifaddresses(interface):
        if interface == "eth0":
            return {utils.netifaces.AF_LINK: [{"addr": "00:00:00:00:00:00"}]}
        return {utils.netifaces.AF_LINK: [{"addr": "AA:BB:CC:DD:EE:FF"}]}

    monkeypatch.setattr(utils.netifaces, "ifaddresses", fake_ifaddresses)

    result = utils.get_mac_address()

    assert result == "AA:BB:CC:DD:EE:FF"
