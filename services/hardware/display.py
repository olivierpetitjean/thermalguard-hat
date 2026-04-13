import Adafruit_SSD1306
from PIL import Image, ImageFont, ImageDraw

DEFAULT_FONT = "/usr/share/fonts/truetype/freefont/DejaVuSans.ttf"


class DisplayController:
    def __init__(self):
        self._disp = None
        self._font = None
        self._last_print = ""

    def init(self):
        self._font = ImageFont.truetype(DEFAULT_FONT, 10, encoding="unic")
        self._disp = Adafruit_SSD1306.SSD1306_128_32(rst=None)
        self._disp.begin()
        self._disp.clear()
        self._disp.display()

    def print_to_screen(self, line1, line2, line3):
        content = line1 + line2 + line3
        if self._last_print == content:
            return
        width = self._disp.width
        height = self._disp.height
        image = Image.new('1', (width, height))
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, width, height), outline=0, fill=0)
        draw.text((0, 0), line1, font=self._font, fill=255)
        draw.text((0, 11), line2, font=self._font, fill=255)
        draw.text((0, 22), line3, font=self._font, fill=255)
        self._disp.image(image)
        self._disp.display()
        self._last_print = content

    def clear(self):
        self._disp.clear()
        self._disp.display()
        self._last_print = ""
