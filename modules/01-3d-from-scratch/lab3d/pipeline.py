"""The graphics pipeline: how a 3D point becomes a pixel.

    model space --(model matrix)--> world space
    world space --(view matrix)---> camera space
    camera space --(projection)---> clip space    [x, y, z, w]
    clip space  --(divide by w)---> NDC           every visible point is in [-1, 1]
    NDC         --(viewport)------> screen pixels
"""
from .mathlib import mat_mul, mat_vec


def make_mvp(model, view, proj):
    """Pre-multiply all three so each vertex needs one matrix multiply, not three.
    GPUs get this as a single 'MVP' matrix."""
    return mat_mul(proj, mat_mul(view, model))


def to_screen(vertex, mvp, width, height):
    """Returns (pixel_x, pixel_y, depth) or None if the point is behind the camera."""
    x, y, z, w = mat_vec(mvp, [vertex[0], vertex[1], vertex[2], 1.0])
    if w <= 1e-6:
        return None            # behind the camera — real renderers "clip" here instead
    nx, ny, nz = x / w, y / w, z / w   # <- the perspective divide. This one line IS 3D.
    px = (nx + 1) * 0.5 * width
    py = (1 - ny) * 0.5 * height       # flip: in NDC +y is up, on screens row 0 is the top
    return px, py, nz
