import json

import mqtt_handler
from mqtt_handler import MqttHandler


class FakeClient:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.on_message = None
        self.username = None
        self.password = None
        self.tls_enabled = False
        self.connected_to = None
        self.subscriptions = []
        self.loop_calls = []
        self.published = []
        self.loop_stopped = False

    def username_pw_set(self, username, password):
        self.username = username
        self.password = password

    def tls_set(self):
        self.tls_enabled = True

    def connect(self, host, port):
        self.connected_to = (host, port)

    def subscribe(self, topic):
        self.subscriptions.append(topic)

    def loop(self, timeout):
        self.loop_calls.append(timeout)

    def publish(self, topic, payload):
        self.published.append((topic, payload))

    def loop_stop(self):
        self.loop_stopped = True


def test_connect_should_apply_auth_tls_and_subscribe(monkeypatch):
    fake_client = FakeClient()
    monkeypatch.setattr(mqtt_handler.mqtt, "Client", lambda *args, **kwargs: fake_client)

    handler = MqttHandler(
        {
            "mqttUser": "user",
            "mqttPassword": "pass",
            "mqttUseTls": True,
            "mqttHost": "broker.local",
            "mqttPort": 1883,
        },
        on_message_callback="callback",
    )

    handler.connect()

    assert fake_client.on_message == "callback"
    assert fake_client.username == "user"
    assert fake_client.password == "pass"
    assert fake_client.tls_enabled is True
    assert fake_client.connected_to == ("broker.local", 1883)
    assert fake_client.subscriptions == ["modechanging", "boost"]


def test_send_telemetry_should_publish_expected_payloads(monkeypatch):
    fake_client = FakeClient()
    monkeypatch.setattr(mqtt_handler.mqtt, "Client", lambda *args, **kwargs: fake_client)

    handler = MqttHandler({"mqttHost": "localhost", "mqttPort": 1883}, None)

    handler.send_telemetry(31.5, 28.5, 1200, 1250, 60, 70, 0.8, {"temp": 38.1, "humidity": 52.3}, True)

    assert len(fake_client.published) == 4
    assert fake_client.published[0] == ("temperatures", json.dumps({"Temp1": 31.5, "Temp2": 28.5}))
    assert fake_client.published[1] == ("rpm", json.dumps({"Rpm1": 1200, "Rpm2": 1250}))
    assert fake_client.published[2] == ("power", json.dumps({"Pwr1": 60, "Pwr2": 70}))
    assert fake_client.published[3] == (
        "system",
        json.dumps({"Temp": 38.1, "Humidity": 52.3, "Current": 0.8, "SysFan": True}),
    )


def test_loop_should_swallow_client_exception(monkeypatch):
    class FailingClient(FakeClient):
        def loop(self, timeout):
            raise RuntimeError("boom")

    monkeypatch.setattr(mqtt_handler.mqtt, "Client", lambda *args, **kwargs: FailingClient())
    handler = MqttHandler({"mqttHost": "localhost", "mqttPort": 1883}, None)

    handler.loop(0.5)


def test_loop_stop_should_delegate_to_client(monkeypatch):
    fake_client = FakeClient()
    monkeypatch.setattr(mqtt_handler.mqtt, "Client", lambda *args, **kwargs: fake_client)
    handler = MqttHandler({"mqttHost": "localhost", "mqttPort": 1883}, None)

    handler.loop_stop()

    assert fake_client.loop_stopped is True

