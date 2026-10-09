"""Meshes: 3D shapes as a list of points (vertices) + triangles that connect them.

A triangle is 3 indices into the vertex list. Order matters: going around the
triangle counter-clockwise (seen from outside) defines which side is the "front".
"""
import math


def cube():
    v = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
         [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]
    # Each face as 4 corners, counter-clockwise when seen from outside the cube.
    quads = [(4, 5, 6, 7),   # front  (+z)
             (1, 0, 3, 2),   # back   (-z)
             (5, 1, 2, 6),   # right  (+x)
             (0, 4, 7, 3),   # left   (-x)
             (7, 6, 2, 3),   # top    (+y)
             (0, 1, 5, 4)]   # bottom (-y)
    tris = []
    for a, b, c, d in quads:
        tris += [(a, b, c), (a, c, d)]   # a square is two triangles
    return v, tris


def cube_edges():
    return [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4),
            (0, 4), (1, 5), (2, 6), (3, 7)]


def torus(R=1.0, r=0.4, rings=32, sides=16):
    """A donut from pure math: walk a circle (radius r) around a bigger circle (radius R).
    u goes around the big circle, v goes around the tube."""
    v = []
    for i in range(rings):
        u = 2 * math.pi * i / rings
        for j in range(sides):
            w = 2 * math.pi * j / sides
            x = (R + r * math.cos(w)) * math.cos(u)
            y = r * math.sin(w)
            z = (R + r * math.cos(w)) * math.sin(u)
            v.append([x, y, z])
    tris = []
    for i in range(rings):
        for j in range(sides):
            a = i * sides + j
            b = ((i + 1) % rings) * sides + j
            c = ((i + 1) % rings) * sides + (j + 1) % sides
            d = i * sides + (j + 1) % sides
            tris += [(a, d, c), (a, c, b)]
    return v, tris
