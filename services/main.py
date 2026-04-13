import atexit
import time

import utils
from utils import debug_print, Verbose, read_settings, get_ip_address, get_mac_address, setup_logging
from utils import check_pigpiod_status, start_service

from hardware.display import DisplayController
from hardware.gpio import GpioController
from hardware.sensors import SensorController
from database import Database
from mqtt_handler import MqttHandler
from service import TemperatureService


def main():
    # Load settings
    settings = read_settings()
    setup_logging(settings['debug'])
    debug_print(f"Settings loaded (debug={settings['debug']})", Verbose.INFO)

    # Start pigpiod if not running
    if not check_pigpiod_status():
        debug_print("pigpiod is stopped. Starting...", Verbose.INFO)
        start_service("pigpiod")
        time.sleep(2)
    else:
        debug_print("pigpiod already running.", Verbose.DEBUG)

    # Initialize hardware
    display = DisplayController()
    display.init()
    display.print_to_screen("Loading...", "", "")

    sensors = SensorController(settings)
    sensors.init()

    gpio = GpioController(settings)
    gpio.init()

    # Connect database
    db = Database(settings)
    db.connect()

    # Bootstrap service (needs on_message before mqtt connects)
    mqtt = MqttHandler(settings, None)  # callback set below
    service = TemperatureService(settings, gpio, sensors, display, db, mqtt)
    mqtt._client.on_message = service.on_message  # wire callback

    # Load initial data
    global_settings = db.read_global_settings()
    conditions = db.get_conditions()
    ip = get_ip_address()
    mac = get_mac_address()
    debug_print(f"Loaded {len(conditions)} fan condition rows from database.", Verbose.INFO)
    debug_print(f"Network identity: ip={ip}, mac={mac}", Verbose.INFO)

    # Optional: enable debugpy in DEBUG mode
    if utils.debug_level.value >= Verbose.DEBUG.value:
        try:
            import debugpy
            debugpy.listen(('0.0.0.0', 5678))
            debug_print("debugpy listening on port 5678", Verbose.DEBUG)
        except ImportError:
            pass

    # Register cleanup
    atexit.register(service.shutdown)

    # Init service (connects MQTT, initializes fans)
    service.init(global_settings, conditions, ip, mac)

    if service._beep_enabled:
        gpio.beep(0.1)

    # Main loop
    t_mqtt = time.time()
    t_monitor = time.time()

    try:
        while True:
            service.tick()

            # Send MQTT telemetry every second
            if time.time() - t_mqtt > 1:
                t_mqtt = time.time()
                service.mqtt_send()

            # Enable hardware monitor after 10 s
            if not service._start_monitoring and time.time() - t_monitor > 10:
                service._start_monitoring = True
                debug_print("Hardware monitoring enabled.", Verbose.INFO)

            time.sleep(0.1)

    except KeyboardInterrupt:
        debug_print("Service ending: keyboard interrupt", Verbose.INFO)
    except Exception as ex:
        debug_print(f"Exception on main thread: {repr(ex)}", Verbose.ERROR)


if __name__ == "__main__":
    main()
