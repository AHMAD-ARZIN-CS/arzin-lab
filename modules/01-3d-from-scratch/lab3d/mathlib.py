"""Vectors and 4x4 matrices — the entire math engine of 3D graphics.

Every GPU on earth does exactly these operations, billions of times per second.
Matrices here are lists of 4 rows, each row a list of 4 numbers.
"""
import math


# ---------- vectors (3 numbers: x, y, z) ----------

def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def dot(a, b):
    """How much two directions agree. 1 = same way, 0 = perpendicular, -1 = opposite
    (when both have length 1). Used for lighting and 'is this face pointing at me?'."""
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    """A new vector perpendicular to both a and b. Gives us surface normals."""
    return [a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]]


def normalize(v):
    length = math.sqrt(dot(v, v))
    return [c / length for c in v] if length else [0.0, 0.0, 0.0]


# ---------- 4x4 matrices ----------

def identity():
    return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def mat_mul(a, b):
    """Combine two transforms into one. mat_mul(A, B) means 'do B first, then A'."""
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def mat_vec(m, v):
    """Apply a transform to a 4-number point [x, y, z, w]."""
    return [sum(m[r][k] * v[k] for k in range(4)) for r in range(4)]


def translate(tx, ty, tz):
    # Moving needs that 4th column — this is WHY we use 4x4 instead of 3x3.
    return [[1, 0, 0, tx], [0, 1, 0, ty], [0, 0, 1, tz], [0, 0, 0, 1]]


def scale(sx, sy, sz):
    return [[sx, 0, 0, 0], [0, sy, 0, 0], [0, 0, sz, 0], [0, 0, 0, 1]]


def rotate_x(a):
    c, s = math.cos(a), math.sin(a)
    return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]]


def rotate_y(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]]


def rotate_z(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def look_at(eye, target, up=(0, 1, 0)):
    """The VIEW matrix: re-expresses the whole world relative to the camera.
    After this, the camera sits at the origin looking down -Z.
    (The camera never moves — the universe moves around it.)"""
    f = normalize(sub(target, eye))   # forward
    s = normalize(cross(f, up))       # right
    u = cross(s, f)                   # true up
    return [[s[0], s[1], s[2], -dot(s, eye)],
            [u[0], u[1], u[2], -dot(u, eye)],
            [-f[0], -f[1], -f[2], dot(f, eye)],
            [0, 0, 0, 1]]


def perspective(fov_y_deg, aspect, near, far):
    """The PROJECTION matrix: makes far things small.
    Its trick: it copies -z into w. Later we divide x and y by w,
    so a point twice as far away ends up half as far from the center."""
    f = 1 / math.tan(math.radians(fov_y_deg) / 2)
    return [[f / aspect, 0, 0, 0],
            [0, f, 0, 0],
            [0, 0, (far + near) / (near - far), 2 * far * near / (near - far)],
            [0, 0, -1, 0]]
