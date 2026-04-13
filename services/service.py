import json
import time
from datetime import datetime, timedelta
from threading import Thread

from utils import debug_print, Verbose, get_fans_power_reference, restart_service, reboot_system


FAN_MODES = {True: "Auto", False: "Manual"}
BOOL_ON_OFF = {True: "On", False: "Off"}


class TemperatureService:
    def __init__(self, settings, gpio, sensors, display, db, mqtt):
        self._settings = settings
        self._gpio = gpio
        self._sensors = sensors
        self._display = display
        self._db = db
        self._mqtt = mqtt

        self._delay = settings['saveDelaySecond']
        self._screen_delay = settings['screenStandByDelay']
        self._fan_tempo_seconds = settings['fanTempoSeconds']
        self._sys_fan_threshold = settings['sysFanThreshold']
        self._sensor1_name = settings.get('sensor1Name', 'Sensor 1')
        self._sensor2_name = settings.get('sensor2Name', 'Sensor 2')
        self._fan1_name = settings.get('fan1Name', 'Fan 1')
        self._fan2_name = settings.get('fan2Name', 'Fan 2')

        # Fan state
        self._auto = True
        self._linked_mode = True
        self._force_fp1 = 15
        self._force_fp2 = 15
        self._fp1 = 0
        self._fp2 = 0
        self._fpm1 = 0
        self._fpm2 = 0
        self._s1temp = 0
        self._s2temp = 0
        self._rpm1 = 0
        self._rpm2 = 0
        self._sys_cur = 0
        self._sys_sens = {'temp': 0, 'humidity': 0}
        self._sys_fan_on = False
        self._beep_enabled = True
        self._boost_time = None
        self._last_fan_update = None
        self._last_sys_fan_change = time.time()

        # Screen state
        self._show_screen = True
        self._mode = 0
        self._cleared = False
        self._last_button_action = time.time()
        self._last_save_date = datetime.now()

        # Alert state
        self._has_alert = False
        self._silent_alert = False
        self._alert_messages = []
        self._last_alert_count = 0
        self._sensor1_alert = False
        self._sensor2_alert = False
        self._fan1_alert = False
        self._fan2_alert = False

        # Thread guards
        self._running_task = False
        self._write_task_running = False
        self._get_current_running = False
        self._get_sys_sens_running = False
        self._hardware_monitor_running = False
        self._sound_alert_active = False

        # Thread handles
        self._get_current_process = None
        self._get_sys_sens_process = None
        self._update_temp_process = None
        self._hardware_monitor_process = None
        self._write_task_process = None
        self._sound_alert_process = None

        self._restarting = False
        self._init_done = False
        self._start_monitoring = False
        self._conditions = []
        self._max_time_delay = 10
        self._ip = ''
        self._mac = ''

    def init(self, global_settings, conditions, ip, mac):
        self._conditions = conditions
        self._ip = ip
        self._mac = mac

        self._auto = bool(global_settings['Auto'])
        self._linked_mode = bool(global_settings['LinkedMode']) if 'LinkedMode' in global_settings.keys() else True
        self._force_fp1 = int(global_settings['Fan1Pwr'])
        self._force_fp2 = int(global_settings['Fan2Pwr'])
        self._beep_enabled = bool(global_settings['Beep'])
        debug_print(
            f"Initializing service with auto={self._auto}, {self._fan1_name}={self._force_fp1}, "
            f"{self._fan2_name}={self._force_fp2}, linked={self._linked_mode}, beep={self._beep_enabled}",
            Verbose.INFO,
        )

        self._gpio.set_button_callback(self._on_button)
        self._mqtt.connect()

        self._fans_init()

        self._init_done = True
        debug_print("Service initialized.", Verbose.INFO)

    # --- Fan initialization ---

    def _fans_init(self):
        debug_print(
            f"Initializing fan references with auto={self._auto}, "
            f"manual {self._fan1_name}={self._force_fp1}, manual {self._fan2_name}={self._force_fp2}",
            Verbose.DEBUG,
        )

        self._gpio.set_fan1_power(100)
        self._gpio.set_fan2_power(100)

        fpm1 = 0
        fpm2 = 0
        for _ in range(self._max_time_delay):
            fpm1 = self._gpio.get_fan1_rpm()
            fpm2 = self._gpio.get_fan2_rpm()
            time.sleep(1)

        if fpm1 == 0:
            fpm1 = 2080
        if fpm2 == 0:
            fpm2 = 2080

        self._fpm1 = fpm1
        self._fpm2 = fpm2
        debug_print(f"{self._fan1_name} max reference: {fpm1}", Verbose.INFO)
        debug_print(f"{self._fan2_name} max reference: {fpm2}", Verbose.INFO)

        if self._db.begin_transaction():
            self._db.write_max_references(fpm1, fpm2)
            self._db.try_commit_transaction()

        self._mqtt.publish("maxrefs", json.dumps({'fan1': fpm1, 'fan2': fpm2}))

    # --- MQTT message handler ---

    def on_message(self, client, userdata, msg, tmp=None):
        payload = msg.payload.decode()
        debug_print(f"MQTT msg on {msg.topic}: {payload}", Verbose.INFO)
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as ex:
            debug_print(f"Invalid MQTT payload on {msg.topic}: {ex}", Verbose.ERROR)
            return

        if msg.topic == "modechanging":
            new_mode = data['Auto']
            debug_print(f"Mode change requested: {FAN_MODES[new_mode]}", Verbose.INFO)
            if self._db.begin_transaction():
                self._db.write_global_settings(data)
                self._db.try_commit_transaction()
            self._force_fp1 = int(data['Fan1Pwr'])
            self._force_fp2 = int(data['Fan2Pwr'])
            self._auto = data['Auto']
            debug_print(
                f"Applied mode change: auto={self._auto}, {self._fan1_name}={self._force_fp1}, {self._fan2_name}={self._force_fp2}",
                Verbose.INFO,
            )
            result = {'Auto': self._auto, 'Fan1Pwr': self._force_fp1,
                      'Fan2Pwr': self._force_fp2, 'Success': True}
            self._mqtt.publish("modechanged", json.dumps(result))
            debug_print(f"Mode changed to {FAN_MODES[new_mode]}", Verbose.INFO)

        elif msg.topic == "boost":
            request = data['Request']
            if request == "SetBoost":
                value = data['Value']
                self._boost_time = datetime.now() + timedelta(seconds=value)
                expire = int((self._boost_time - datetime.now()).total_seconds())
                self._mqtt.publish("boost", json.dumps(
                    {'Request': 'BoostStatus', 'Success': True, 'Expire': expire}
                ))
                debug_print(f"Boost enabled until {self._boost_time}", Verbose.INFO)
            elif request == "GetBoost":
                if self._boost_time is None or self._boost_time <= datetime.now():
                    expire = 0
                else:
                    expire = int((self._boost_time - datetime.now()).total_seconds())
                self._mqtt.publish("boost", json.dumps({'Request': 'BoostStatus', 'Expire': expire}))
                debug_print(f"Boost status requested, remaining={expire}s", Verbose.DEBUG)
            elif request == "CancelBoost":
                self._boost_time = None
                self._mqtt.publish("boost", json.dumps(
                    {'Request': 'BoostCancelled', 'Success': True}
                ))
                debug_print("Boost cancelled.", Verbose.INFO)
        else:
            debug_print(f"Unhandled MQTT topic: {msg.topic}", Verbose.WARNING)

    # --- Tasks ---

    def update_temp(self):
        if self._running_task:
            return
        self._running_task = True
        try:
            self._rpm1 = self._gpio.get_fan1_rpm()
            self._rpm2 = self._gpio.get_fan2_rpm()
            self._s1temp = self._sensors.get_sensor1_temp()
            self._s2temp = self._sensors.get_sensor2_temp()

            if self._boost_time is not None and self._boost_time > datetime.now():
                self._fp1 = 100
                self._fp2 = 100
                debug_print("Boost active, forcing both fans to 100%", Verbose.DEBUG)
            elif self._auto:
                if self._s1temp == 0 and self._s2temp == 0:
                    debug_print("Both temperature sensors unavailable, skipping fan update.", Verbose.WARNING)
                    return
                if self._last_fan_update and \
                   (datetime.now() - self._last_fan_update).total_seconds() < self._fan_tempo_seconds:
                    debug_print("Fan update skipped due to anti-flap tempo.", Verbose.DEBUG)
                    return
                pr = get_fans_power_reference(
                    self._s1temp,
                    self._s2temp,
                    self._conditions,
                    self._linked_mode,
                )
                self._fp1 = pr['Value1']
                self._fp2 = pr['Value2']
                debug_print(
                    f"Auto mode target power computed: {self._fan1_name}={self._fp1}, {self._fan2_name}={self._fp2}, "
                    f"{self._sensor1_name}={self._s1temp}, {self._sensor2_name}={self._s2temp}, linked={self._linked_mode}",
                    Verbose.DEBUG,
                )
            else:
                self._fp1 = self._force_fp1
                self._fp2 = self._force_fp2
                debug_print(
                    f"Manual mode target power applied: {self._fan1_name}={self._fp1}, {self._fan2_name}={self._fp2}",
                    Verbose.DEBUG,
                )
                if self._fpm1 > 0:
                    debug_print(f"{self._fan1_name} %: {(self._rpm1 / self._fpm1) * 100}", Verbose.DEBUG)
                if self._fpm2 > 0:
                    debug_print(f"{self._fan2_name} %: {(self._rpm2 / self._fpm2) * 100}", Verbose.DEBUG)

            self._gpio.set_fan1_power(self._fp1)
            self._gpio.set_fan2_power(self._fp2)
            self._last_fan_update = datetime.now()
        except Exception as ex:
            debug_print(f"Unhandled error during temperature update: {ex}", Verbose.ERROR)
        finally:
            self._running_task = False

    def write_data_task(self):
        if self._write_task_running:
            return
        self._write_task_running = True
        try:
            if self._db.begin_transaction():
                self._db.write_record("Fan1 PWR", self._fp1)
                self._db.write_record("Fan2 PWR", self._fp2)
                self._db.write_record("Fan1 RPM", self._rpm1)
                self._db.write_record("Fan2 RPM", self._rpm2)
                self._db.write_record("Sensor1", self._s1temp)
                self._db.write_record("Sensor2", self._s2temp)
                self._db.write_record("Current", self._sys_cur)
                self._db.write_record("System Temp.", self._sys_sens['temp'])
                self._db.write_record("Humidity", self._sys_sens['humidity'])
                self._db.try_commit_transaction()
                self._last_save_date = datetime.now()
                debug_print("Telemetry snapshot written to database.", Verbose.DEBUG)
                time.sleep(0.5)
        except Exception as ex:
            debug_print(f"Unhandled error during database write: {ex}", Verbose.ERROR)
        finally:
            self._write_task_running = False

    def get_current_task(self):
        if self._get_current_running:
            return
        self._get_current_running = True
        try:
            self._sys_cur = self._sensors.get_system_current()
        except Exception as ex:
            debug_print(f"Unhandled error while reading system current: {ex}", Verbose.ERROR)
        finally:
            time.sleep(2)
            self._get_current_running = False

    def get_system_sens_task(self):
        if self._get_sys_sens_running:
            return
        self._get_sys_sens_running = True
        try:
            self._sys_sens = self._sensors.get_system_sensor()

            dt = time.time() - self._last_sys_fan_change
            if dt > 60:
                if self._sys_sens['temp'] > self._sys_fan_threshold and not self._sys_fan_on:
                    debug_print("System fan enabled", Verbose.INFO)
                    self._sys_fan_on = True
                    self._gpio.red_led(1)
                    self._gpio.system_fan(1)
                    self._last_sys_fan_change = time.time()
                elif self._sys_sens['temp'] < self._sys_fan_threshold and self._sys_fan_on:
                    debug_print("System fan disabled", Verbose.INFO)
                    self._sys_fan_on = False
                    self._gpio.red_led(0)
                    self._gpio.system_fan(0)
                    self._last_sys_fan_change = time.time()
        except Exception as ex:
            debug_print(f"Unhandled error while reading system sensors: {ex}", Verbose.ERROR)
        finally:
            time.sleep(1)
            self._get_sys_sens_running = False

    def hardware_monitor_task(self):
        if self._hardware_monitor_running:
            return
        self._hardware_monitor_running = True

        try:
            if self._s1temp == 0:
                self._sensors.init_sensor1()
            if self._s2temp == 0:
                self._sensors.init_sensor2()

            self._set_sensor1_alert(self._s1temp == 0)
            self._set_sensor2_alert(self._s2temp == 0)
            self._set_fan1_alert(self._rpm1 == 0)
            self._set_fan2_alert(self._rpm2 == 0)
        except Exception as ex:
            debug_print(f"Unhandled error during hardware monitoring: {ex}", Verbose.ERROR)
        finally:
            time.sleep(5)
            self._hardware_monitor_running = False

    def _sound_alert_task(self):
        self._sound_alert_active = True
        debug_print("Alert sound loop started.", Verbose.DEBUG)
        while self._sound_alert_active:
            self._gpio.beep2(1)
            time.sleep(3)
        debug_print("Alert sound loop stopped.", Verbose.DEBUG)

    # --- Alerts ---

    def _set_sensor1_alert(self, value):
        if value == self._sensor1_alert:
            return
        self._sensor1_alert = value
        msg = f"/!\\ {self._sensor1_name} disconnected"
        if value:
            self._alert_messages.append(msg)
            debug_print(f"{self._sensor1_name} disconnect alert raised.", Verbose.WARNING)
        else:
            self._alert_messages.remove(msg)
            debug_print(f"{self._sensor1_name} disconnect alert cleared.", Verbose.INFO)
        self._update_alert()

    def _set_sensor2_alert(self, value):
        if value == self._sensor2_alert:
            return
        self._sensor2_alert = value
        msg = f"/!\\ {self._sensor2_name} disconnected"
        if value:
            self._alert_messages.append(msg)
            debug_print(f"{self._sensor2_name} disconnect alert raised.", Verbose.WARNING)
        else:
            self._alert_messages.remove(msg)
            debug_print(f"{self._sensor2_name} disconnect alert cleared.", Verbose.INFO)
        self._update_alert()

    def _set_fan1_alert(self, value):
        if value == self._fan1_alert:
            return
        self._fan1_alert = value
        msg = f"/!\\ {self._fan1_name} disconnected"
        if value:
            self._alert_messages.append(msg)
            debug_print(f"{self._fan1_name} alert raised.", Verbose.WARNING)
        else:
            self._alert_messages.remove(msg)
            debug_print(f"{self._fan1_name} alert cleared.", Verbose.INFO)
        self._update_alert()

    def _set_fan2_alert(self, value):
        if value == self._fan2_alert:
            return
        self._fan2_alert = value
        msg = f"/!\\ {self._fan2_name} disconnected"
        if value:
            self._alert_messages.append(msg)
            debug_print(f"{self._fan2_name} alert raised.", Verbose.WARNING)
        else:
            self._alert_messages.remove(msg)
            debug_print(f"{self._fan2_name} alert cleared.", Verbose.INFO)
        self._update_alert()

    def _update_alert(self):
        if (len(self._alert_messages) > 0 and
                len(self._alert_messages) != self._last_alert_count) or not self._has_alert:
            self._last_alert_count = len(self._alert_messages)
            self._has_alert = True
            self._silent_alert = False
            self._sound_alert_active = True
            debug_print("Alert activated", Verbose.WARNING)
        elif len(self._alert_messages) == 0 and self._has_alert:
            self._last_alert_count = 0
            self._sound_alert_active = False
            self._cleared = False
            self._has_alert = False
            debug_print("Alert stopped", Verbose.WARNING)

    # --- Screen ---

    def _display_fan_info(self, mode):
        if mode == 0:
            self._display.print_to_screen(
                f"{self._sensor1_name}: {round(self._s1temp, 2)}c",
                f"{self._fan1_name} RPM: {round(self._rpm1)}",
                f"{self._fan1_name}: {self._fp1}%"
            )
        elif mode == 1:
            self._display.print_to_screen(
                f"{self._sensor2_name}: {round(self._s2temp, 2)}c",
                f"{self._fan2_name} RPM: {round(self._rpm2)}",
                f"{self._fan2_name}: {self._fp2}%"
            )
        else:
            curr = (self._sys_cur / 1000) * 12
            self._display.print_to_screen(
                f"Temp: {round(self._sys_sens['temp'], 2)}c",
                f"Humidity: {round(self._sys_sens['humidity'], 2)}%",
                f"Power: {round(curr, 2)}w"
            )

    def _display_ip_info(self):
        self._display.print_to_screen(f"IP: {self._ip}", "MAC:", self._mac)

    def _display_sound_info(self):
        self._display.print_to_screen(f"Beep: {BOOL_ON_OFF[self._beep_enabled]}", "", "")

    def _display_alert_info(self):
        self._hide_screen()
        msgs = self._alert_messages
        self._display.print_to_screen(
            msgs[0] if len(msgs) > 0 else "",
            msgs[1] if len(msgs) > 1 else "",
            msgs[2] if len(msgs) > 2 else ""
        )

    def _hide_screen(self):
        if not self._cleared:
            self._display.clear()
            self._cleared = True

    def update_screen(self):
        if self._restarting:
            return
        if self._has_alert:
            self._display_alert_info()
            return
        if self._show_screen:
            self._cleared = False
            if self._mode == 0:
                self._display_fan_info(0)
            elif self._mode == 1:
                self._display_fan_info(1)
            elif self._mode == 2:
                self._display_fan_info(2)
            elif self._mode == 3:
                self._display_ip_info()
            elif self._mode == -1:
                self._display_sound_info()
        else:
            self._hide_screen()

    def _update_mode(self):
        if not self._show_screen:
            self._show_screen = True
        else:
            self._mode = (self._mode + 1) % 4
        debug_print(f"Screen mode: {self._mode}", Verbose.DEBUG)

    def _update_sound(self):
        if not self._show_screen or self._mode != -1:
            self._show_screen = True
            self._mode = -1
        else:
            self._beep_enabled = not self._beep_enabled
            if self._db.begin_transaction():
                self._db.write_beep_preference(self._beep_enabled)
                self._db.try_commit_transaction()
        debug_print(f"Beep: {self._beep_enabled}", Verbose.DEBUG)

    # --- Button callback ---

    def _on_button(self, btn, ts):
        if not self._init_done:
            return
        debug_print(f"Button: {btn}, hold: {ts:.2f}s", Verbose.INFO)

        if ts >= 5:
            if btn == 0:
                self._restarting = True
                self._display.print_to_screen("Restart service...", "", "")
                restart_service("thermalguard-hat-sensor")
                time.sleep(5)
            elif btn == 2:
                self._restarting = True
                self._display.print_to_screen("System reboot...", "", "")
                reboot_system()
                time.sleep(5)
        else:
            if self._has_alert:
                debug_print("Alert muted", Verbose.WARNING)
                self._silent_alert = True
                self._sound_alert_active = False
                return
            self._last_button_action = time.time()
            if btn == 0:
                if self._mode < 0:
                    self._mode = 0
                self._update_mode()
            else:
                self._update_sound()

    # --- MQTT send ---

    def mqtt_send(self):
        try:
            self._mqtt.loop()
            self._mqtt.send_telemetry(
                self._s1temp, self._s2temp,
                self._rpm1, self._rpm2,
                self._fp1, self._fp2,
                self._sys_cur, self._sys_sens, self._sys_fan_on
            )
        except Exception as ex:
            debug_print(f"Unhandled error during MQTT telemetry send: {ex}", Verbose.ERROR)

    # --- Main loop step ---

    def tick(self):
        if not self._get_current_running:
            self._get_current_process = Thread(target=self.get_current_task, name="CurrentTask")
            self._get_current_process.start()

        if not self._get_sys_sens_running:
            self._get_sys_sens_process = Thread(target=self.get_system_sens_task, name="SystemSensTask")
            self._get_sys_sens_process.start()

        if self._update_temp_process is None or not self._update_temp_process.is_alive():
            self._update_temp_process = Thread(target=self.update_temp, name="UpdateTemp")
            self._update_temp_process.start()

        if not self._hardware_monitor_running and self._start_monitoring:
            self._hardware_monitor_process = Thread(target=self.hardware_monitor_task, name="MonitorTask")
            self._hardware_monitor_process.start()

        elapsed = (datetime.now() - self._last_save_date).seconds
        if elapsed > self._delay and not self._write_task_running:
            self._write_task_process = Thread(target=self.write_data_task, name="WriteTask")
            self._write_task_process.start()

        if (not self._silent_alert and self._sound_alert_active and
                (self._sound_alert_process is None or not self._sound_alert_process.is_alive())):
            self._sound_alert_process = Thread(target=self._sound_alert_task, name="SoundAlert")
            self._sound_alert_process.start()

        e = time.time() - self._last_button_action
        if e > self._screen_delay and self._show_screen:
            self._show_screen = False

        self.update_screen()

    # --- Shutdown ---

    def shutdown(self):
        debug_print("Shutting down service...", Verbose.INFO)
        self._sound_alert_active = False

        for proc, name in [
            (self._sound_alert_process, "SoundAlert"),
            (self._get_current_process, "CurrentTask"),
            (self._get_sys_sens_process, "SystemSensTask"),
            (self._update_temp_process, "UpdateTemp"),
            (self._hardware_monitor_process, "MonitorTask"),
            (self._write_task_process, "WriteTask"),
        ]:
            if proc is not None and proc.is_alive():
                debug_print(f"Terminating {name}...", Verbose.INFO)
                proc.join()
                debug_print(f"{name} ended.", Verbose.INFO)

        self._mqtt.loop_stop()
        debug_print("Service shutdown complete.", Verbose.INFO)
        self._hide_screen()
        self._db.close()
        self._gpio.dispose()
        debug_print("Service shutdown complete.", Verbose.INFO)
