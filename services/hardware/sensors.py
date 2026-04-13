import time
import board
import busio
import adafruit_sht31d
import adafruit_mcp3xxx.mcp3004 as MCP
import digitalio
from adafruit_mcp3xxx.analog_in import AnalogIn
from w1thermsensor import W1ThermSensor, Sensor
from utils import debug_print, Verbose


class SensorController:
    def __init__(self, settings):
        self._sensor1_uid = self._normalize_uid(settings['sensor1Uid'])
        self._sensor2_uid = self._normalize_uid(settings['sensor2Uid'])
        self._sensor1_name = settings.get('sensor1Name', 'Sensor 1')
        self._sensor2_name = settings.get('sensor2Name', 'Sensor 2')
        self._sensor1 = None
        self._sensor2 = None
        self._sys_sensor = None
        self._mcp3004 = None

    @staticmethod
    def _normalize_uid(uid):
        return uid[3:] if isinstance(uid, str) and uid.startswith('28-') else uid

    def init(self):
        debug_print("Initializing I2C/SPI sensors...", Verbose.INFO)
        i2c = busio.I2C(board.SCL, board.SDA)
        spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)

        self._sys_sensor = adafruit_sht31d.SHT31D(i2c)
        self._sys_sensor.heater = False

        cs = digitalio.DigitalInOut(board.D5)
        self._mcp3004 = MCP.MCP3004(spi, cs)
        debug_print("System sensors initialized.", Verbose.INFO)

        self.init_sensor1()
        self.init_sensor2()

    def init_sensor1(self):
        debug_print(f"Initializing {self._sensor1_name} sensor...", Verbose.INFO)
        try:
            self._sensor1 = W1ThermSensor(Sensor.DS18B20, self._sensor1_uid)
            debug_print(f"{self._sensor1_name} sensor OK ({self._sensor1_uid})", Verbose.INFO)
        except Exception as ex:
            self._sensor1 = None
            debug_print(f"{self._sensor1_name} sensor ({self._sensor1_uid}) not connected: {ex}", Verbose.WARNING)

    def init_sensor2(self):
        debug_print(f"Initializing {self._sensor2_name} sensor...", Verbose.INFO)
        try:
            self._sensor2 = W1ThermSensor(Sensor.DS18B20, self._sensor2_uid)
            debug_print(f"{self._sensor2_name} sensor OK ({self._sensor2_uid})", Verbose.INFO)
        except Exception as ex:
            self._sensor2 = None
            debug_print(f"{self._sensor2_name} sensor ({self._sensor2_uid}) not connected: {ex}", Verbose.WARNING)

    def get_sensor1_temp(self):
        if self._sensor1 is None:
            debug_print(f"{self._sensor1_name} sensor not connected", Verbose.WARNING)
            return 0
        try:
            temp = self._sensor1.get_temperature()
            debug_print(f"{self._sensor1_name} temperature: {temp}c", Verbose.DEBUG)
            return temp
        except Exception as ex:
            debug_print(f"Error getting {self._sensor1_name} temperature: {ex}", Verbose.WARNING)
            return 0

    def get_sensor2_temp(self):
        if self._sensor2 is None:
            debug_print(f"{self._sensor2_name} sensor not connected", Verbose.WARNING)
            return 0
        try:
            temp = self._sensor2.get_temperature()
            debug_print(f"{self._sensor2_name} temperature: {temp}c", Verbose.DEBUG)
            return temp
        except Exception as ex:
            debug_print(f"Error getting {self._sensor2_name} temperature: {ex}", Verbose.WARNING)
            return 0

    def get_system_sensor(self):
        humidity = 0
        temperature = 0
        try:
            humidity = self._sys_sensor.relative_humidity
            debug_print(f"System humidity: {humidity}", Verbose.DEBUG)
        except Exception as ex:
            debug_print(f"Unable to get system humidity: {ex}", Verbose.WARNING)
        try:
            temperature = self._sys_sensor.temperature
            debug_print(f"System temperature: {temperature}", Verbose.DEBUG)
        except Exception as ex:
            debug_print(f"Unable to get system temperature: {ex}", Verbose.WARNING)
        return {'temp': temperature, 'humidity': humidity}

    def get_system_current(self):
        chan = AnalogIn(self._mcp3004, MCP.P0)
        num_iterations = 50
        vref = 1.6310
        span = 0.0000495
        sum_voltage = 0.0
        for _ in range(num_iterations):
            sum_voltage += chan.voltage
            time.sleep(0.10)
        avg_voltage = sum_voltage / num_iterations
        current = (avg_voltage - vref) / span
        debug_print(f"ASC712 Voltage: {avg_voltage:.10f}", Verbose.DEBUG)
        debug_print(f"ASC712 Current(mA): {current:.10f}", Verbose.DEBUG)
        return current

