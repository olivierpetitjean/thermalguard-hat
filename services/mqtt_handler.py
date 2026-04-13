import json
import paho.mqtt.client as mqtt
from utils import debug_print, Verbose


class MqttHandler:
    def __init__(self, settings, on_message_callback):
        self._settings = settings
        try:
            self._client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
                client_id="thermalguard-hat"
            )
        except AttributeError:
            self._client = mqtt.Client("thermalguard-hat")
        self._client.on_message = on_message_callback

    def connect(self):
        if self._settings.get('mqttUser'):
            self._client.username_pw_set(
                self._settings['mqttUser'],
                self._settings['mqttPassword']
            )
        if self._settings.get('mqttUseTls'):
            self._client.tls_set()
        self._client.connect(
            self._settings['mqttHost'],
            int(self._settings['mqttPort'])
        )
        self._client.subscribe("modechanging")
        self._client.subscribe("boost")
        debug_print("MQTT connected.", Verbose.INFO)

    def loop(self, timeout=0.1):
        try:
            self._client.loop(timeout)
        except Exception as ex:
            debug_print(f"MQTT loop exception: {repr(ex)}", Verbose.ERROR)

    def publish(self, topic, payload):
        self._client.publish(topic, payload)

    def send_telemetry(self, s1temp, s2temp, rpm1, rpm2, fp1, fp2, sys_cur, sys_sens, sys_fan):
        try:
            self._client.publish("temperatures", json.dumps({'Temp1': s1temp, 'Temp2': s2temp}))
            self._client.publish("rpm", json.dumps({'Rpm1': rpm1, 'Rpm2': rpm2}))
            self._client.publish("power", json.dumps({'Pwr1': fp1, 'Pwr2': fp2}))
            self._client.publish("system", json.dumps({
                'Temp': sys_sens.get('temp', 0),
                'Humidity': sys_sens.get('humidity', 0),
                'Current': sys_cur,
                'SysFan': sys_fan,
            }))
        except Exception as ex:
            debug_print(f"MQTT send exception: {repr(ex)}", Verbose.ERROR)

    def loop_stop(self):
        self._client.loop_stop()
