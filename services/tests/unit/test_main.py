import importlib
import sys


class FakeDisplayController:
    instances = []

    def __init__(self):
        self.initialized = False
        self.messages = []
        FakeDisplayController.instances.append(self)

    def init(self):
        self.initialized = True

    def print_to_screen(self, line1, line2, line3):
        self.messages.append((line1, line2, line3))


class FakeGpioController:
    instances = []

    def __init__(self, settings):
        self.settings = settings
        self.initialized = False
        self.beeps = []
        FakeGpioController.instances.append(self)

    def init(self):
        self.initialized = True

    def beep(self, duration):
        self.beeps.append(duration)


class FakeSensorController:
    instances = []

    def __init__(self, settings):
        self.settings = settings
        self.initialized = False
        FakeSensorController.instances.append(self)

    def init(self):
        self.initialized = True


class FakeDatabase:
    instances = []

    def __init__(self, settings):
        self.settings = settings
        self.connected = False
        FakeDatabase.instances.append(self)

    def connect(self):
        self.connected = True

    def read_global_settings(self):
        return {"Auto": True, "LinkedMode": True, "Fan1Pwr": 15, "Fan2Pwr": 15, "Beep": True}

    def get_conditions(self):
        return [{"MinTemp1": 20, "MinTemp2": 20, "Value1": 30, "Value2": 30}]


class FakeMqttHandler:
    instances = []

    def __init__(self, settings, callback):
        self.settings = settings
        self.callback = callback
        self._client = type("Client", (), {"on_message": callback})()
        FakeMqttHandler.instances.append(self)


class FakeTemperatureService:
    instances = []

    def __init__(self, settings, gpio, sensors, display, db, mqtt):
        self.settings = settings
        self.gpio = gpio
        self.sensors = sensors
        self.display = display
        self.db = db
        self.mqtt = mqtt
        self._beep_enabled = True
        self._start_monitoring = False
        self.init_calls = []
        self.shutdown_called = False
        self.tick_count = 0
        self.mqtt_send_count = 0
        FakeTemperatureService.instances.append(self)

    def init(self, global_settings, conditions, ip, mac):
        self.init_calls.append((global_settings, conditions, ip, mac))

    def on_message(self, *_args, **_kwargs):
        pass

    def shutdown(self):
        self.shutdown_called = True

    def tick(self):
        self.tick_count += 1
        raise KeyboardInterrupt()

    def mqtt_send(self):
        self.mqtt_send_count += 1


def load_main_module(monkeypatch):
    FakeDisplayController.instances.clear()
    FakeGpioController.instances.clear()
    FakeSensorController.instances.clear()
    FakeDatabase.instances.clear()
    FakeMqttHandler.instances.clear()
    FakeTemperatureService.instances.clear()

    monkeypatch.setattr(sys.modules["hardware.display"], "DisplayController", FakeDisplayController)
    monkeypatch.setattr(sys.modules["hardware.gpio"], "GpioController", FakeGpioController)
    monkeypatch.setattr(sys.modules["hardware.sensors"], "SensorController", FakeSensorController)

    database_module = type(sys)("database")
    database_module.Database = FakeDatabase
    mqtt_module = type(sys)("mqtt_handler")
    mqtt_module.MqttHandler = FakeMqttHandler
    service_module = type(sys)("service")
    service_module.TemperatureService = FakeTemperatureService

    monkeypatch.setitem(sys.modules, "database", database_module)
    monkeypatch.setitem(sys.modules, "mqtt_handler", mqtt_module)
    monkeypatch.setitem(sys.modules, "service", service_module)

    if "main" in sys.modules:
        del sys.modules["main"]

    return importlib.import_module("main")


def test_main_should_bootstrap_components_and_register_shutdown(monkeypatch):
    module = load_main_module(monkeypatch)
    registered_cleanups = []

    monkeypatch.setattr(module, "read_settings", lambda: {"debug": "INFO"})
    monkeypatch.setattr(module, "setup_logging", lambda _level: None)
    monkeypatch.setattr(module, "debug_print", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(module, "check_pigpiod_status", lambda: True)
    monkeypatch.setattr(module, "get_ip_address", lambda: "192.168.1.20")
    monkeypatch.setattr(module, "get_mac_address", lambda: "AA:BB:CC:DD:EE:FF")
    monkeypatch.setattr(module.atexit, "register", lambda callback: registered_cleanups.append(callback))
    monkeypatch.setattr(module.time, "sleep", lambda _value: None)
    module.utils.debug_level = module.Verbose.INFO

    module.main()

    display = FakeDisplayController.instances[0]
    gpio = FakeGpioController.instances[0]
    sensors = FakeSensorController.instances[0]
    db = FakeDatabase.instances[0]
    mqtt = FakeMqttHandler.instances[0]
    service = FakeTemperatureService.instances[0]

    assert display.initialized is True
    assert display.messages[0] == ("Loading...", "", "")
    assert gpio.initialized is True
    assert sensors.initialized is True
    assert db.connected is True
    assert mqtt._client.on_message == service.on_message
    assert service.init_calls == [
        (
            {"Auto": True, "LinkedMode": True, "Fan1Pwr": 15, "Fan2Pwr": 15, "Beep": True},
            [{"MinTemp1": 20, "MinTemp2": 20, "Value1": 30, "Value2": 30}],
            "192.168.1.20",
            "AA:BB:CC:DD:EE:FF",
        )
    ]
    assert gpio.beeps == [0.1]
    assert registered_cleanups == [service.shutdown]


def test_main_should_start_pigpiod_when_not_running(monkeypatch):
    module = load_main_module(monkeypatch)
    started_services = []

    monkeypatch.setattr(module, "read_settings", lambda: {"debug": "INFO"})
    monkeypatch.setattr(module, "setup_logging", lambda _level: None)
    monkeypatch.setattr(module, "debug_print", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(module, "check_pigpiod_status", lambda: False)
    monkeypatch.setattr(module, "start_service", lambda name: started_services.append(name))
    monkeypatch.setattr(module, "get_ip_address", lambda: "192.168.1.20")
    monkeypatch.setattr(module, "get_mac_address", lambda: "AA:BB:CC:DD:EE:FF")
    monkeypatch.setattr(module.atexit, "register", lambda _callback: None)
    monkeypatch.setattr(module.time, "sleep", lambda _value: None)
    module.utils.debug_level = module.Verbose.INFO

    module.main()

    assert started_services == ["pigpiod"]
