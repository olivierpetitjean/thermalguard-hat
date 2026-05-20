import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import service as service_module
from service import TemperatureService


class FakeGpio:
    def __init__(self):
        self.button_callback = None
        self.fan1_power_calls = []
        self.fan2_power_calls = []
        self.fan1_rpm = 1200
        self.fan2_rpm = 1300
        self.disposed = False
        self.beep2_calls = []
        self.red_led_calls = []
        self.system_fan_calls = []

    def set_button_callback(self, callback):
        self.button_callback = callback

    def set_fan1_power(self, value):
        self.fan1_power_calls.append(value)

    def set_fan2_power(self, value):
        self.fan2_power_calls.append(value)

    def get_fan1_rpm(self):
        return self.fan1_rpm

    def get_fan2_rpm(self):
        return self.fan2_rpm

    def beep(self, _duration):
        pass

    def beep2(self, _duration):
        self.beep2_calls.append(_duration)

    def red_led(self, value):
        self.red_led_calls.append(value)

    def system_fan(self, value):
        self.system_fan_calls.append(value)

    def dispose(self):
        self.disposed = True


class FakeSensors:
    def __init__(self, sensor1=35, sensor2=30):
        self.sensor1 = sensor1
        self.sensor2 = sensor2
        self.system_current = 0.5
        self.system_sensor = {"temp": 32, "humidity": 45}
        self.init_sensor1_calls = 0
        self.init_sensor2_calls = 0

    def get_sensor1_temp(self):
        return self.sensor1

    def get_sensor2_temp(self):
        return self.sensor2

    def get_system_current(self):
        return self.system_current

    def get_system_sensor(self):
        return self.system_sensor

    def init_sensor1(self):
        self.init_sensor1_calls += 1

    def init_sensor2(self):
        self.init_sensor2_calls += 1


class FakeDisplay:
    def __init__(self):
        self.lines = []
        self.cleared = False

    def print_to_screen(self, line1, line2, line3):
        self.lines.append((line1, line2, line3))

    def clear(self):
        self.cleared = True


class FakeDb:
    def __init__(self):
        self.transactions_started = 0
        self.max_refs = []
        self.global_settings = []
        self.closed = False
        self.beep_preferences = []
        self.records = []

    def begin_transaction(self):
        self.transactions_started += 1
        return True

    def try_commit_transaction(self):
        pass

    def write_max_references(self, value1, value2):
        self.max_refs.append((value1, value2))

    def write_global_settings(self, data):
        self.global_settings.append(data)

    def write_beep_preference(self, value):
        self.beep_preferences.append(value)

    def write_record(self, name, value):
        self.records.append((name, value))

    def close(self):
        self.closed = True


class FakeMqtt:
    def __init__(self):
        self.connected = False
        self.published = []
        self.telemetry_calls = []
        self.loop_stopped = False

    def connect(self):
        self.connected = True

    def publish(self, topic, payload):
        self.published.append((topic, payload))

    def loop(self):
        pass

    def send_telemetry(self, *args):
        self.telemetry_calls.append(args)

    def loop_stop(self):
        self.loop_stopped = True


class FakeThread:
    def __init__(self, target=None, name=None):
        self.target = target
        self.name = name
        self.started = False
        self.joined = False
        self.alive = False

    def start(self):
        self.started = True
        self.alive = True

    def is_alive(self):
        return self.alive

    def join(self):
        self.joined = True
        self.alive = False


def create_service(monkeypatch, *, sensor1=35, sensor2=30):
    monkeypatch.setattr(service_module.time, "sleep", lambda _value: None)

    settings = {
        "saveDelaySecond": 15,
        "screenStandByDelay": 30,
        "fanTempoSeconds": 30,
        "sysFanThreshold": 38,
        "sensor1Name": "Rack",
        "sensor2Name": "Ambient",
        "fan1Name": "Intake Fan",
        "fan2Name": "Exhaust Fan",
    }
    gpio = FakeGpio()
    sensors = FakeSensors(sensor1=sensor1, sensor2=sensor2)
    display = FakeDisplay()
    db = FakeDb()
    mqtt = FakeMqtt()
    service = TemperatureService(settings, gpio, sensors, display, db, mqtt)
    service._max_time_delay = 1
    return service, gpio, sensors, display, db, mqtt


def test_init_should_load_global_state_connect_mqtt_and_publish_maxrefs(monkeypatch):
    service, gpio, _sensors, _display, db, mqtt = create_service(monkeypatch)

    service.init(
        {
            "Auto": True,
            "LinkedMode": False,
            "ControlMode": "independent",
            "LinkedSensor": "sensor1",
            "DifferentialMode": "sensor1_minus_sensor2",
            "Fan1Pwr": 25,
            "Fan2Pwr": 35,
            "Beep": False,
            "DisableFanAlerts": True,
        },
        [{"MinTemp1": 30, "MinTemp2": 30, "Value1": 60, "Value2": 60}],
        "192.168.1.50",
        "AA:BB:CC:DD:EE:FF",
    )

    assert service._auto is True
    assert service._control_mode == "independent"
    assert service._linked_mode is False
    assert service._force_fp1 == 25
    assert service._force_fp2 == 35
    assert service._beep_enabled is False
    assert service._disable_fan_alerts is True
    assert service._ip == "192.168.1.50"
    assert service._mac == "AA:BB:CC:DD:EE:FF"
    assert gpio.button_callback is not None
    assert mqtt.connected is True
    assert db.max_refs == [(1200, 1300)]
    assert mqtt.published[-1] == ("maxrefs", json.dumps({"fan1": 1200, "fan2": 1300}))


def test_on_message_modechanging_should_persist_and_publish_ack(monkeypatch):
    service, _gpio, _sensors, _display, db, mqtt = create_service(monkeypatch)

    msg = SimpleNamespace(
        topic="modechanging",
        payload=json.dumps({"Auto": False, "Fan1Pwr": 40, "Fan2Pwr": 55}).encode(),
    )

    service.on_message(None, None, msg)

    assert service._auto is False
    assert service._force_fp1 == 40
    assert service._force_fp2 == 55
    assert db.global_settings == [{"Auto": False, "Fan1Pwr": 40, "Fan2Pwr": 55}]
    assert mqtt.published[-1] == (
        "modechanged",
        json.dumps({"Auto": False, "Fan1Pwr": 40, "Fan2Pwr": 55, "Success": True}),
    )


def test_on_message_boost_should_set_status_and_cancel(monkeypatch):
    service, _gpio, _sensors, _display, _db, mqtt = create_service(monkeypatch)

    set_msg = SimpleNamespace(topic="boost", payload=json.dumps({"Request": "SetBoost", "Value": 120}).encode())
    service.on_message(None, None, set_msg)
    assert service._boost_time is not None
    assert mqtt.published[-1][0] == "boost"
    assert json.loads(mqtt.published[-1][1])["Request"] == "BoostStatus"

    get_msg = SimpleNamespace(topic="boost", payload=json.dumps({"Request": "GetBoost"}).encode())
    service.on_message(None, None, get_msg)
    assert json.loads(mqtt.published[-1][1])["Expire"] > 0

    cancel_msg = SimpleNamespace(topic="boost", payload=json.dumps({"Request": "CancelBoost"}).encode())
    service.on_message(None, None, cancel_msg)
    assert service._boost_time is None
    assert json.loads(mqtt.published[-1][1]) == {"Request": "BoostCancelled", "Success": True}


def test_update_temp_should_force_100_percent_when_boost_is_active(monkeypatch):
    service, gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch)
    service._boost_time = datetime.now() + timedelta(seconds=60)

    service.update_temp()

    assert service._fp1 == 100
    assert service._fp2 == 100
    assert gpio.fan1_power_calls[-1] == 100
    assert gpio.fan2_power_calls[-1] == 100


def test_update_temp_should_apply_manual_power_when_auto_is_disabled(monkeypatch):
    service, gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch)
    service._auto = False
    service._force_fp1 = 45
    service._force_fp2 = 55
    service._fpm1 = 2080
    service._fpm2 = 2080

    service.update_temp()

    assert service._fp1 == 45
    assert service._fp2 == 55
    assert gpio.fan1_power_calls[-1] == 45
    assert gpio.fan2_power_calls[-1] == 55


def test_update_temp_should_compute_auto_power_from_conditions(monkeypatch):
    service, gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch, sensor1=35, sensor2=20)
    service._auto = True
    service._control_mode = "linked_fans"
    service._linked_mode = True
    service._conditions = [
        {"MinTemp1": 40, "MinTemp2": 40, "Value1": 90, "Value2": 90},
        {"MinTemp1": 30, "MinTemp2": 30, "Value1": 60, "Value2": 60},
        {"MinTemp1": 20, "MinTemp2": 20, "Value1": 30, "Value2": 30},
    ]

    service.update_temp()

    assert service._fp1 == 60
    assert service._fp2 == 60
    assert gpio.fan1_power_calls[-1] == 60
    assert gpio.fan2_power_calls[-1] == 60


def test_update_temp_should_compute_linked_fans_from_selected_sensor(monkeypatch):
    service, gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch, sensor1=45, sensor2=35)
    service._auto = True
    service._control_mode = "linked_fans"
    service._linked_mode = True
    service._linked_sensor = "sensor2"
    service._conditions = [
        {"MinTemp1": 40, "MinTemp2": 40, "Value1": 90, "Value2": 90},
        {"MinTemp1": 30, "MinTemp2": 30, "Value1": 60, "Value2": 60},
    ]

    service.update_temp()

    assert service._fp1 == 60
    assert service._fp2 == 60
    assert gpio.fan1_power_calls[-1] == 60
    assert gpio.fan2_power_calls[-1] == 60


def test_update_temp_should_compute_differential_mode(monkeypatch):
    service, gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch, sensor1=35, sensor2=28)
    service._auto = True
    service._control_mode = "differential"
    service._linked_mode = True
    service._differential_mode = "sensor1_minus_sensor2"
    service._conditions = [
        {"MinTemp1": 10, "MinTemp2": 10, "Value1": 90, "Value2": 90},
        {"MinTemp1": 6, "MinTemp2": 6, "Value1": 60, "Value2": 60},
        {"MinTemp1": 2, "MinTemp2": 2, "Value1": 30, "Value2": 30},
    ]

    service.update_temp()

    assert service._fp1 == 60
    assert service._fp2 == 60
    assert gpio.fan1_power_calls[-1] == 60
    assert gpio.fan2_power_calls[-1] == 60


def test_update_temp_should_skip_when_both_sensors_are_zero(monkeypatch):
    service, gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch, sensor1=0, sensor2=0)
    service._auto = True
    service._conditions = [{"MinTemp1": 20, "MinTemp2": 20, "Value1": 30, "Value2": 30}]

    service.update_temp()

    assert gpio.fan1_power_calls == []
    assert gpio.fan2_power_calls == []


def test_shutdown_should_stop_mqtt_close_db_and_dispose_gpio(monkeypatch):
    service, gpio, _sensors, display, db, mqtt = create_service(monkeypatch)
    service._cleared = False

    service.shutdown()

    assert mqtt.loop_stopped is True
    assert db.closed is True
    assert gpio.disposed is True
    assert display.cleared is True


def test_write_data_task_should_persist_current_snapshot(monkeypatch):
    service, _gpio, _sensors, _display, db, _mqtt = create_service(monkeypatch)
    service._fp1 = 30
    service._fp2 = 40
    service._rpm1 = 1200
    service._rpm2 = 1300
    service._s1temp = 35
    service._s2temp = 28
    service._sys_cur = 0.8
    service._sys_sens = {"temp": 38, "humidity": 52}

    service.write_data_task()

    assert db.records == [
        ("Fan1 PWR", 30),
        ("Fan2 PWR", 40),
        ("Fan1 RPM", 1200),
        ("Fan2 RPM", 1300),
        ("Sensor1", 35),
        ("Sensor2", 28),
        ("Current", 0.8),
        ("System Temp.", 38),
        ("Humidity", 52),
    ]


def test_get_current_task_should_update_system_current(monkeypatch):
    service, _gpio, sensors, _display, _db, _mqtt = create_service(monkeypatch)
    sensors.system_current = 1.7

    service.get_current_task()

    assert service._sys_cur == 1.7
    assert service._get_current_running is False


def test_get_system_sens_task_should_enable_system_fan_above_threshold(monkeypatch):
    service, gpio, sensors, _display, _db, _mqtt = create_service(monkeypatch)
    sensors.system_sensor = {"temp": 45, "humidity": 50}
    service._last_sys_fan_change = 0
    monkeypatch.setattr(service_module.time, "time", lambda: 100)

    service.get_system_sens_task()

    assert service._sys_fan_on is True
    assert gpio.red_led_calls[-1] == 1
    assert gpio.system_fan_calls[-1] == 1


def test_hardware_monitor_task_should_raise_alerts_and_reinitialize_missing_sensors(monkeypatch):
    service, _gpio, sensors, _display, _db, _mqtt = create_service(monkeypatch, sensor1=0, sensor2=0)
    service._rpm1 = 0
    service._rpm2 = 0

    service.hardware_monitor_task()

    assert sensors.init_sensor1_calls == 1
    assert sensors.init_sensor2_calls == 1
    assert service._sensor1_alert is True
    assert service._sensor2_alert is True
    assert service._fan1_alert is True
    assert service._fan2_alert is True
    assert service._has_alert is True


def test_hardware_monitor_task_should_skip_fan_alerts_when_disabled(monkeypatch):
    service, _gpio, sensors, _display, _db, _mqtt = create_service(monkeypatch, sensor1=35, sensor2=30)
    service._disable_fan_alerts = True
    service._s1temp = 35
    service._s2temp = 30
    service._rpm1 = 0
    service._rpm2 = 0

    service.hardware_monitor_task()

    assert sensors.init_sensor1_calls == 0
    assert sensors.init_sensor2_calls == 0
    assert service._fan1_alert is False
    assert service._fan2_alert is False
    assert service._has_alert is False


def test_update_sound_should_toggle_beep_and_persist_preference(monkeypatch):
    service, _gpio, _sensors, _display, db, _mqtt = create_service(monkeypatch)
    service._show_screen = True
    service._mode = -1
    service._beep_enabled = True

    service._update_sound()

    assert service._beep_enabled is False
    assert db.beep_preferences == [False]


def test_on_button_should_mute_active_alert(monkeypatch):
    service, _gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch)
    service._init_done = True
    service._has_alert = True
    service._sound_alert_active = True

    service._on_button(0, 1)

    assert service._silent_alert is True
    assert service._sound_alert_active is False


def test_on_button_should_cycle_screen_mode_on_short_press(monkeypatch):
    service, _gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch)
    service._init_done = True
    service._mode = 0

    service._on_button(0, 1)

    assert service._mode == 1


def test_tick_should_start_expected_threads_and_turn_screen_off_after_timeout(monkeypatch):
    created_threads = []

    def fake_thread_factory(target=None, name=None):
        thread = FakeThread(target=target, name=name)
        created_threads.append(thread)
        return thread

    monkeypatch.setattr(service_module, "Thread", fake_thread_factory)
    monkeypatch.setattr(service_module.time, "time", lambda: 100)

    service, _gpio, _sensors, _display, _db, _mqtt = create_service(monkeypatch)
    service._last_button_action = 0
    service._show_screen = True
    service._start_monitoring = True
    service._sound_alert_active = True
    service._silent_alert = False
    service._last_save_date = datetime.now() - timedelta(seconds=60)
    service.update_screen = lambda: None

    service.tick()

    thread_names = [thread.name for thread in created_threads]
    assert "CurrentTask" in thread_names
    assert "SystemSensTask" in thread_names
    assert "UpdateTemp" in thread_names
    assert "MonitorTask" in thread_names
    assert "WriteTask" in thread_names
    assert "SoundAlert" in thread_names
    assert service._show_screen is False
