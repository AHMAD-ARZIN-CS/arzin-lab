"""Rasterization: turning shapes into pixels."""


def line(canvas, x0, y0, x1, y1, color):
    """Bresenham's line algorithm (1962): steps one pixel at a time using only
    integer addition — designed for computers that couldn't afford division."""
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        canvas.set(x0, y0, color)
        if x0 == x1 and y0 == y1:
            return
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def edge(ax, ay, bx, by, px, py):
    """Signed area of triangle (a, b, p) x2. Its sign says which side of line a->b
    point p is on. Three of these tell you if p is inside a triangle."""
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax)


def triangle(canvas, p0, p1, p2, color):
    """Fill a triangle, with a depth test per pixel.
    p = (x, y, depth). Check each pixel in the bounding box: inside? closer? draw."""
    area = edge(*p0[:2], *p1[:2], *p2[:2])
    if area == 0:
        return
    xmin = max(int(min(p0[0], p1[0], p2[0])), 0)
    xmax = min(int(max(p0[0], p1[0], p2[0])) + 1, canvas.width - 1)
    ymin = max(int(min(p0[1], p1[1], p2[1])), 0)
    ymax = min(int(max(p0[1], p1[1], p2[1])) + 1, canvas.height - 1)
    for y in range(ymin, ymax + 1):
        for x in range(xmin, xmax + 1):
            cx, cy = x + 0.5, y + 0.5   # sample the pixel's center
            # Barycentric weights: how much each corner "owns" this pixel. They sum to 1.
            w0 = edge(*p1[:2], *p2[:2], cx, cy) / area
            w1 = edge(*p2[:2], *p0[:2], cx, cy) / area
            w2 = edge(*p0[:2], *p1[:2], cx, cy) / area
            if w0 >= 0 and w1 >= 0 and w2 >= 0:
                z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]   # blend depth from corners
                canvas.set_if_closer(x, y, z, color)
