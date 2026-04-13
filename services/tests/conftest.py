import sys
import types
from pathlib import Path


SERVICES_ROOT = Path(__file__).resolve().parents[1]

if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

if "netifaces" not in sys.modules:
    sys.modules["netifaces"] = types.SimpleNamespace(
        AF_INET=2,
        AF_LINK=17,
        gateways=lambda: {},
        interfaces=lambda: [],
        ifaddresses=lambda _interface: {},
    )

if "paho.mqtt.client" not in sys.modules:
    class _DummyClient:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs
            self.on_message = None

        def username_pw_set(self, *_args, **_kwargs):
            pass

        def tls_set(self, *_args, **_kwargs):
            pass

        def connect(self, *_args, **_kwargs):
            pass

        def subscribe(self, *_args, **_kwargs):
            pass

        def loop(self, *_args, **_kwargs):
            pass

        def publish(self, *_args, **_kwargs):
            pass

        def loop_stop(self, *_args, **_kwargs):
            pass

    mqtt_client_module = types.SimpleNamespace(
        Client=_DummyClient,
        CallbackAPIVersion=types.SimpleNamespace(VERSION1="VERSION1"),
    )
    mqtt_mqtt_module = types.SimpleNamespace(client=mqtt_client_module)
    paho_module = types.SimpleNamespace(mqtt=mqtt_mqtt_module)
    sys.modules["paho"] = paho_module
    sys.modules["paho.mqtt"] = mqtt_mqtt_module
    sys.modules["paho.mqtt.client"] = mqtt_client_module

if "hardware" not in sys.modules:
    sys.modules["hardware"] = types.ModuleType("hardware")

for module_name, class_name in [
    ("hardware.display", "DisplayController"),
    ("hardware.gpio", "GpioController"),
    ("hardware.sensors", "SensorController"),
]:
    if module_name not in sys.modules:
        module = types.ModuleType(module_name)
        setattr(module, class_name, object)
        sys.modules[module_name] = module
