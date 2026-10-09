"""A canvas of pixels, and how to save it as a real PNG file.

An image is just a grid of numbers. Each pixel is 3 bytes: red, green, blue (0-255).
A PNG file is that grid, compressed with zlib, wrapped in a few labeled "chunks".
No libraries needed — this is the whole format for a basic RGB image.
"""
import struct
import zlib


class Canvas:
    def __init__(self, width, height, background=(12, 14, 22)):
        self.width = width
        self.height = height
        # One flat list of bytes: row 0 left-to-right, then row 1, ...
        self.pixels = bytearray(bytes(background) * (width * height))
        # The depth buffer (z-buffer): for every pixel, how close is the nearest
        # thing we've drawn there? Starts at "infinitely far".
        self.depth = [float("inf")] * (width * height)

    def set(self, x, y, color):
        if 0 <= x < self.width and 0 <= y < self.height:
            i = (y * self.width + x) * 3
            self.pixels[i:i + 3] = bytes(color)

    def set_if_closer(self, x, y, z, color):
        """Draw only if this point is closer than what's already there."""
        if 0 <= x < self.width and 0 <= y < self.height:
            k = y * self.width + x
            if z < self.depth[k]:
                self.depth[k] = z
                self.pixels[k * 3:k * 3 + 3] = bytes(color)

    def save_png(self, path):
        w, h = self.width, self.height
        # Each row starts with a "filter type" byte; 0 means "no filter".
        raw = b"".join(b"\x00" + bytes(self.pixels[y * w * 3:(y + 1) * w * 3]) for y in range(h))

        def chunk(tag, data):
            body = tag + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        with open(path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")                                         # magic signature
            f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))  # 8-bit RGB
            f.write(chunk(b"IDAT", zlib.compress(raw, 9)))                         # the pixels
            f.write(chunk(b"IEND", b""))                                           # end marker
