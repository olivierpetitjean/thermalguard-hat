import time
from pathlib import Path

import pigpio

from utils import debug_print, Verbose

PULSE = 2  # Fan pulses per revolution


class _KernelPwmChannel:
    def __init__(self, chip: Path, channel: int, frequency: int):
        self._chip = chip
        self._channel = channel
        self._frequency = frequency
        self._pwm = chip / f"pwm{channel}"
        self._period_ns = int(1_000_000_000 / frequency)

    @staticmethod
    def _read_text(path: Path) -> str:
        return path.read_text(encoding="utf-8").strip()

    @staticmethod
    def _write_text(path: Path, value) -> None:
        path.write_text(f"{value}\n", encoding="utf-8")

    def export(self):
        if not self._pwm.exists():
            self._write_text(self._chip / "export", self._channel)
            for _ in range(50):
                if self._pwm.exists():
                    break
                time.sleep(0.1)
        if not self._pwm.exists():
            raise RuntimeError(f"Unable to export {self._chip.name}/pwm{self._channel}")

    def disable(self):
        enable = self._pwm / "enable"
        if enable.exists():
            try:
                if self._read_text(enable) != "0":
                    self._write_text(enable, 0)
            except Exception:
                pass

    def set_power(self, power: int):
        power = max(0, min(100, int(power)))
        duty_ns = int(self._period_ns * power / 100)

        self.disable()

        polarity = self._pwm / "polarity"
        if polarity.exists():
            try:
                if self._read_text(polarity) != "normal":
                    self._write_text(polarity, "normal")
            except Exception:
                pass

        self._write_text(self._pwm / "period", self._period_ns)
        self._write_text(self._pwm / "duty_cycle", duty_ns)
        self._write_text(self._pwm / "enable", 1 if power > 0 else 0)
        return duty_ns


class GpioController:
    def __init__(self, settings):
        self._fan1_pin = int(settings["fan1Pin"])
        self._fan2_pin = int(settings["fan2Pin"])
        self._fan1_sensor = int(settings["fan1Sensor"])
        self._fan2_sensor = int(settings["fan2Sensor"])
        self._fan_tach_glitch_filter_us = int(settings.get("fanTachGlitchFilterUs", 100))
        self._red_led = settings["redLed"]
        self._green_led = settings["greenLed"]
        self._sys_fan = settings["systemFan"]
        self._sys_buzzer = settings["sysBuzzer"]
        self._output_enabled = settings["outputEnabled"]
        self._btn1 = int(settings["button1Pin"])
        self._btn2 = int(settings["button2Pin"])
        self._frequency = int(settings["fanFrequency"])
        self._resolution = int(settings["fanPWMResolution"])
        self._fan_pwm_chip_path = settings.get("fanPwmChipPath", "")
        self._fan1_pwm_channel = int(settings.get("fan1PwmChannel", 0))
        self._fan2_pwm_channel = int(settings.get("fan2PwmChannel", 1))
        self._fan1_name = settings.get("fan1Name", "Fan 1")
        self._fan2_name = settings.get("fan2Name", "Fan 2")

        self._gpio = None
        self._fan1_pwr = 0
        self._fan2_pwr = 0
        self._fan1_callback = None
        self._fan2_callback = None
        self._fan1_timer = None
        self._fan2_timer = None
        self._fan1_pwm = None
        self._fan2_pwm = None

        self._button_callback = None
        self._button1_pressed = False
        self._button2_pressed = False
        self._button1_timer = time.time()
        self._button2_timer = time.time()
        self._button_both_pressed = False

    def init(self):
        self._gpio = pigpio.pi()
        if not self._gpio.connected:
            raise RuntimeError("Unable to connect to pigpiod")
        debug_print("Connected to pigpiod.", Verbose.INFO)

        # System fan
        self._gpio.set_mode(self._sys_fan, pigpio.OUTPUT)
        self._gpio.write(self._sys_fan, 0)

        # Buzzer
        self._gpio.set_mode(self._sys_buzzer, pigpio.OUTPUT)

        # LEDs
        self._gpio.set_mode(self._red_led, pigpio.OUTPUT)
        self._gpio.set_mode(self._green_led, pigpio.OUTPUT)
        self._gpio.write(self._red_led, 0)
        self._gpio.write(self._green_led, 0)

        # Fan outputs through kernel PWM
        pwm_chip = self._resolve_pwm_chip()
        self._fan1_pwm = _KernelPwmChannel(pwm_chip, self._fan1_pwm_channel, self._frequency)
        self._fan2_pwm = _KernelPwmChannel(pwm_chip, self._fan2_pwm_channel, self._frequency)
        self._fan1_pwm.export()
        self._fan2_pwm.export()
        self._set_fan_pwm(self._fan1_pwm, 100, f"{self._fan1_name} initial duty")
        self._set_fan_pwm(self._fan2_pwm, 100, f"{self._fan2_name} initial duty")
        debug_print(
            f"{self._fan1_name}/{self._fan2_name} outputs initialized on PWM channels "
            f"{self._fan1_pwm_channel}/{self._fan2_pwm_channel} "
            f"(freq={self._frequency}, resolution={self._resolution})",
            Verbose.INFO,
        )

        # Output enable
        self._gpio.set_mode(self._output_enabled, pigpio.OUTPUT)
        self._gpio.write(self._output_enabled, 1)

        # Fan tachometer inputs
        self._gpio.set_mode(self._fan1_sensor, pigpio.INPUT)
        self._gpio.set_mode(self._fan2_sensor, pigpio.INPUT)
        self._gpio.set_pull_up_down(self._fan1_sensor, pigpio.PUD_UP)
        self._gpio.set_pull_up_down(self._fan2_sensor, pigpio.PUD_UP)
        if self._fan_tach_glitch_filter_us > 0:
            self._gpio.set_glitch_filter(self._fan1_sensor, self._fan_tach_glitch_filter_us)
            self._gpio.set_glitch_filter(self._fan2_sensor, self._fan_tach_glitch_filter_us)
            debug_print(
                f"Applied tachometer glitch filter: {self._fan_tach_glitch_filter_us} us on GPIO "
                f"{self._fan1_sensor}/{self._fan2_sensor}",
                Verbose.INFO,
            )
        self._fan1_timer = time.time()
        self._fan1_callback = self._gpio.callback(self._fan1_sensor, pigpio.RISING_EDGE)
        self._fan2_timer = time.time()
        self._fan2_callback = self._gpio.callback(self._fan2_sensor, pigpio.FALLING_EDGE)
        debug_print(
            f"{self._fan1_name}/{self._fan2_name} tachometer inputs initialized on GPIO "
            f"{self._fan1_sensor}/{self._fan2_sensor}",
            Verbose.DEBUG,
        )

        # Buttons
        self._gpio.set_mode(self._btn1, pigpio.INPUT)
        self._gpio.set_mode(self._btn2, pigpio.INPUT)
        self._gpio.set_pull_up_down(self._btn1, pigpio.PUD_DOWN)
        self._gpio.set_pull_up_down(self._btn2, pigpio.PUD_DOWN)
        self._gpio.callback(self._btn1, pigpio.EITHER_EDGE, self._on_btn1)
        self._gpio.callback(self._btn2, pigpio.EITHER_EDGE, self._on_btn2)
        debug_print(f"Buttons initialized on GPIO {self._btn1}/{self._btn2}", Verbose.DEBUG)

        debug_print("GPIO initialized.", Verbose.INFO)

    def _resolve_pwm_chip(self) -> Path:
        if self._fan_pwm_chip_path:
            return Path(self._fan_pwm_chip_path)

        chips = sorted(p for p in Path("/sys/class/pwm").glob("pwmchip*") if p.is_dir())
        if not chips:
            raise RuntimeError("No pwmchip found under /sys/class/pwm")

        for chip in chips:
            try:
                if int((chip / "npwm").read_text(encoding="utf-8").strip()) >= 2:
                    return chip
            except Exception:
                continue
        return chips[0]

    def set_button_callback(self, callback):
        self._button_callback = callback

    def _log_gpio_result(self, action, rc, pin=None):
        if rc < 0:
            debug_print(f"{action} failed with pigpio rc={rc}", Verbose.ERROR)
            return
        if pin is not None:
            try:
                readback = self._gpio.get_PWM_dutycycle(pin)
                debug_print(f"{action} succeeded (rc={rc}, readback={readback})", Verbose.DEBUG)
                return
            except Exception as ex:
                debug_print(f"{action} succeeded (rc={rc}), readback failed: {ex}", Verbose.DEBUG)
                return
        debug_print(f"{action} succeeded (rc={rc})", Verbose.DEBUG)

    def get_fan1_rpm(self):
        if self._fan1_callback is None:
            debug_print(f"{self._fan1_name} tachometer callback unavailable.", Verbose.WARNING)
            return 0
        elapsed = time.time() - self._fan1_timer
        self._fan1_timer = time.time()
        falls = self._fan1_callback.tally()
        self._fan1_callback.reset_tally()
        return ((falls / PULSE) / elapsed) * 60 if elapsed > 0 else 0

    def get_fan2_rpm(self):
        if self._fan2_callback is None:
            debug_print(f"{self._fan2_name} tachometer callback unavailable.", Verbose.WARNING)
            return 0
        elapsed = time.time() - self._fan2_timer
        self._fan2_timer = time.time()
        falls = self._fan2_callback.tally()
        self._fan2_callback.reset_tally()
        return ((falls / PULSE) / elapsed) * 60 if elapsed > 0 else 0

    def _set_fan_pwm(self, channel, power, action):
        duty_ns = channel.set_power(power)
        debug_print(f"{action} to {power}% (duty={duty_ns}ns)", Verbose.DEBUG)

    def set_fan1_power(self, power):
        if self._fan1_pwr != power:
            debug_print(f"Setting {self._fan1_name} power to {power}%", Verbose.INFO)
            self._set_fan_pwm(self._fan1_pwm, power, self._fan1_name)
            self._fan1_pwr = power
            return power
        return -1

    def set_fan2_power(self, power):
        if self._fan2_pwr != power:
            debug_print(f"Setting {self._fan2_name} power to {power}%", Verbose.INFO)
            self._set_fan_pwm(self._fan2_pwm, power, self._fan2_name)
            self._fan2_pwr = power
            return power
        return -1

    def red_led(self, state):
        self._gpio.write(self._red_led, state)

    def green_led(self, state):
        self._gpio.write(self._green_led, state)

    def system_fan(self, state):
        self._gpio.write(self._sys_fan, state)

    def beep(self, duration):
        try:
            self._gpio.set_PWM_dutycycle(self._sys_buzzer, 128)
            time.sleep(duration)
            self._gpio.set_PWM_dutycycle(self._sys_buzzer, 0)
        except Exception as ex:
            debug_print(f"Unable to play short beep: {ex}", Verbose.WARNING)

    def beep2(self, duration):
        try:
            self._gpio.set_PWM_dutycycle(self._sys_buzzer, 200)
            time.sleep(duration)
            self._gpio.set_PWM_dutycycle(self._sys_buzzer, 0)
        except Exception as ex:
            debug_print(f"Unable to play alert beep: {ex}", Verbose.WARNING)

    def _on_btn1(self, pin, level, tick):
        dt = time.time() - self._button1_timer
        if dt < 0.01:
            return
        self._button1_timer = time.time()
        if level == 1:
            self._button1_pressed = True
            debug_print("Button 1 pressed", Verbose.DEBUG)
        elif level == 0:
            self._button1_pressed = False
            debug_print("Button 1 released", Verbose.DEBUG)
        else:
            return
        if self._button_callback and not self._button1_pressed:
            if not self._button2_pressed:
                if self._button_both_pressed:
                    self._button_both_pressed = False
                    self._button_callback(2, dt)
                else:
                    self._button_callback(0, dt)
            else:
                self._button_both_pressed = True

    def _on_btn2(self, pin, level, tick):
        dt = time.time() - self._button2_timer
        if dt < 0.01:
            return
        self._button2_timer = time.time()
        if level == 1:
            self._button2_pressed = True
            debug_print("Button 2 pressed", Verbose.DEBUG)
        elif level == 0:
            self._button2_pressed = False
            debug_print("Button 2 released", Verbose.DEBUG)
        else:
            return
        if self._button_callback and not self._button2_pressed:
            if not self._button1_pressed:
                if self._button_both_pressed:
                    self._button_both_pressed = False
                    self._button_callback(2, dt)
                else:
                    self._button_callback(1, dt)
            else:
                self._button_both_pressed = True

    def dispose(self):
        self.red_led(0)
        self.green_led(0)
        if self._fan1_callback:
            self._fan1_callback.cancel()
        if self._fan2_callback:
            self._fan2_callback.cancel()
        if self._fan1_pwm is not None:
            self._fan1_pwm.disable()
        if self._fan2_pwm is not None:
            self._fan2_pwm.disable()
        if self._gpio:
            self._gpio.stop()
        debug_print("GPIO disposed.", Verbose.INFO)
