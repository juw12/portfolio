"""
Cozy Fishing Island - procedural low-poly scene for Blender 4.x (3.6 / 5.x should also work).

Run it:
  * Blender UI:  Scripting tab -> Open -> this file -> Run Script  (takes a few seconds)
  * Headless (also renders preview.png):
        blender -b --python cozy_fishing_scene.py

Outputs (OUTPUT_DIR):
  cozy_fishing.blend   - the scene
  cozy_fishing.fbx     - meshes + marker empties, ready to drag into Unity
  preview.png          - only when run headless (-b)

Everything is driven by the constants below - change SEED for a new island layout.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

# ----------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "exports")
SEED = 7

ISLAND_RADIUS = 14.0      # m, rough island radius before noise
WATER_LEVEL = 0.0
SEABED_DEPTH = -2.6
DOCK_Y = -2.0             # dock runs along +X at this Y
DOCK_LENGTH = 10.0
DOCK_WIDTH = 2.0
DOCK_HEIGHT = 0.6         # plank centre height above water
CABIN_POS = Vector((-4.0, 3.0))
CABIN_FLOOR = 1.3
GARDEN_POS = Vector((-0.5, 7.5))      # fenced raised-bed garden
GARDEN_FLOOR = 1.05
VIEWPOINT_POS = Vector((-8.5, -0.5))  # sunset bench on a small mound
VIEWPOINT_FLOOR = 1.2
SUNSET_DIR = Vector((-0.94, 0.34)).normalized()  # direction toward the low sun, seen from the island
# claimable village homesteads (shared world): fence + 2 raised beds (4 planting spots) + sign + mailbox
HOMESTEADS = [Vector((-5.0, -5.5)), Vector((0.5, -7.5)), Vector((6.0, -6.0)), Vector((6.5, 4.0))]
HOMESTEAD_FLOOR = 0.95
TREE_COUNT = 30
BUSH_COUNT = 16
ROCK_COUNT = 18

# (centre, height, inner radius = fully flat, outer radius = blended back to natural terrain)
FLAT_PADS = [
    (CABIN_POS, CABIN_FLOOR, 4.2, 6.0),
    (GARDEN_POS, GARDEN_FLOOR, 2.6, 4.0),
    (VIEWPOINT_POS, VIEWPOINT_FLOOR, 1.5, 3.5),
] + [(centre, HOMESTEAD_FLOOR, 2.3, 3.4) for centre in HOMESTEADS]


# ----------------------------------------------------------------------------
# Generic helpers
# ----------------------------------------------------------------------------
def srgb_to_linear(channel):
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_color(hex_code):
    hex_code = hex_code.lstrip("#")
    return tuple(srgb_to_linear(int(hex_code[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def try_set(target, attribute, value):
    """Set an attribute if this Blender version has it (API differs between 3.x/4.x/5.x)."""
    try:
        setattr(target, attribute, value)
        return True
    except (AttributeError, TypeError, ValueError):
        return False


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def distance_to_segment(point, seg_a, seg_b):
    ab = seg_b - seg_a
    t = max(0.0, min(1.0, (point - seg_a).dot(ab) / ab.length_squared))
    return (point - (seg_a + ab * t)).length


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.curves,
        bpy.data.worlds,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def get_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def make_material(name, hex_code, roughness=0.8, emission_strength=0.0, alpha=1.0, metallic=0.0):
    color = hex_color(hex_code)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*color, alpha)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission_strength > 0.0:
        emission_key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[emission_key].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        try_set(material, "blend_method", "BLEND")
        try_set(material, "surface_render_method", "BLENDED")
    return material


def make_palette():
    """Warm, slightly desaturated 'cozy' palette."""
    return {
        "grass": make_material("Grass", "#7FB069", 0.9),
        "sand": make_material("Sand", "#E8D3A2", 0.95),
        "seabed": make_material("Seabed", "#5E8F86", 1.0),
        "water": make_material("Water", "#4FB3BF", 0.05, alpha=0.72),
        "wood": make_material("Wood", "#A9744F", 0.8),
        "wood_dark": make_material("WoodDark", "#6B4632", 0.8),
        "wall": make_material("CabinWall", "#F3E3C3", 0.85),
        "roof": make_material("Roof", "#C8553D", 0.7),
        "stone": make_material("Stone", "#9C9A91", 0.9),
        "window": make_material("WindowGlow", "#FFC46B", 0.5, emission_strength=6.0),
        "pine": make_material("PineLeaves", "#3E7C59", 0.9),
        "leaf": make_material("Leaves", "#8CC084", 0.9),
        "trunk": make_material("Trunk", "#7A5136", 0.9),
        "rock": make_material("Rock", "#8F8C86", 0.95),
        "bush": make_material("Bush", "#6FA36B", 0.9),
        "flower_pink": make_material("FlowerPink", "#F4A6C0", 0.7),
        "flower_yellow": make_material("FlowerYellow", "#FFE08A", 0.7),
        "flower_white": make_material("FlowerWhite", "#FFF6E8", 0.7),
        "lily": make_material("LilyPad", "#5E9E5A", 0.6),
        "lantern": make_material("LanternGlow", "#FFB45E", 0.5, emission_strength=10.0),
        "firefly": make_material("Firefly", "#E8FF9C", 0.5, emission_strength=15.0),
        "metal": make_material("Metal", "#8A9BA8", 0.4, metallic=0.6),
        "bobber_red": make_material("BobberRed", "#E4473C", 0.5),
        "bobber_white": make_material("BobberWhite", "#FAF5EC", 0.5),
        "cork": make_material("Cork", "#C9A27A", 0.9),
        "line": make_material("FishingLine", "#FFFFFF", 0.3),
        "mountain": make_material("Mountains", "#8197BD", 1.0),
        "soil": make_material("Soil", "#6B4A35", 1.0),
        "teal": make_material("WateringCan", "#5FA8A0", 0.5, metallic=0.3),
    }


# ----------------------------------------------------------------------------
# bmesh building blocks (one bmesh can hold several parts with different materials)
# ----------------------------------------------------------------------------
def place(bm, verts, material_index=0, scale=None, rotation=None, offset=None):
    if scale is not None:
        bmesh.ops.scale(bm, vec=Vector(scale), verts=verts)
    if rotation is not None:
        bmesh.ops.rotate(bm, cent=Vector((0.0, 0.0, 0.0)), matrix=rotation, verts=verts)
    if offset is not None:
        bmesh.ops.translate(bm, vec=Vector(offset), verts=verts)
    for face in {face for vert in verts for face in vert.link_faces}:
        face.material_index = material_index
    return verts


def add_box(bm, size, offset, material_index=0, rotation=None):
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    return place(bm, verts, material_index, scale=size, rotation=rotation, offset=offset)


def add_cylinder(bm, radius_bottom, radius_top, depth, offset, segments=8, material_index=0, rotation=None):
    verts = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
    )["verts"]
    return place(bm, verts, material_index, rotation=rotation, offset=offset)


def add_ico(bm, radius, offset, material_index=0, subdivisions=1, scale=None, jitter=0.0):
    verts = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)["verts"]
    if jitter > 0.0:
        for vert in verts:
            vert.co += Vector([random.uniform(-jitter, jitter) for _ in range(3)])
    return place(bm, verts, material_index, scale=scale, offset=offset)


def add_hull(bm, points, material_index=0):
    verts = [bm.verts.new(point) for point in points]
    bmesh.ops.convex_hull(bm, input=verts)
    return place(bm, verts, material_index)


def mesh_from_bmesh(name, bm, materials, recalc_normals=True):
    if recalc_normals:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for material in materials:
        mesh.materials.append(material)
    return mesh


def instance(name, mesh, collection, location, rotation_z=0.0, scale=1.0):
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, rotation_z)
    obj.scale = (scale, scale, scale)
    collection.objects.link(obj)
    return obj


def object_from_bmesh(name, bm, materials, collection, location=(0.0, 0.0, 0.0), rotation_z=0.0,
                      recalc_normals=True):
    mesh = mesh_from_bmesh(name, bm, materials, recalc_normals)
    return instance(name, mesh, collection, location, rotation_z)


def add_marker(name, location, collection):
    """Empty that Unity scripts can hook onto (RodTip, FishingSpot, PlayerSpot...)."""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.4
    empty.location = location
    collection.objects.link(empty)
    return empty


def add_point_light(name, location, collection, energy, hex_code="#FFB066", radius=0.1):
    light_data = bpy.data.lights.new(name, "POINT")
    light_data.energy = energy
    light_data.color = hex_color(hex_code)
    light_data.shadow_soft_size = radius
    light_obj = bpy.data.objects.new(name, light_data)
    light_obj.location = location
    collection.objects.link(light_obj)
    return light_obj


# ----------------------------------------------------------------------------
# Terrain
# ----------------------------------------------------------------------------
def terrain_height(x, y):
    sample = Vector((x * 0.09, y * 0.09, 0.0))
    radius = ISLAND_RADIUS * (1.0 + 0.18 * noise.noise(sample * 0.7))
    d = math.hypot(x, y) / radius
    height = 2.0 * (1.0 - d * d) - 0.4
    height += 0.35 * noise.noise(sample * 2.0 + Vector((5.2, 1.3, 0.0)))

    # flat pads for the cabin, garden and viewpoint
    for centre, pad_height, inner, outer in FLAT_PADS:
        distance = math.hypot(x - centre.x, y - centre.y)
        if distance < outer:
            blend = smoothstep(outer, inner, distance)
            height = height * (1.0 - blend) + pad_height * blend
    return max(height, SEABED_DEPTH)


def find_dock_start():
    """First x along the dock line where the ground (incl. both dock edges) is below the deck."""
    x = 0.0
    while x < 30.0:
        heights = [terrain_height(x, DOCK_Y + dy) for dy in (-1.1, 0.0, 1.1)]
        if max(heights) < DOCK_HEIGHT - 0.15:
            return x
        x += 0.05
    return 10.0


def build_terrain(collection, mats):
    bm = bmesh.new()
    half_size = 26.0
    resolution = 90
    step = 2.0 * half_size / resolution
    grid = []
    for j in range(resolution + 1):
        row = []
        for i in range(resolution + 1):
            x = -half_size + i * step
            y = -half_size + j * step
            row.append(bm.verts.new((x, y, terrain_height(x, y))))
        grid.append(row)
    for j in range(resolution):
        for i in range(resolution):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))

    # triangulated + flat shaded = classic low-poly facets
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for face in bm.faces:
        z = face.calc_center_median().z
        if z > 0.45:
            face.material_index = 0
        elif z > -0.9:
            face.material_index = 1
        else:
            face.material_index = 2
    object_from_bmesh(
        "Island_Terrain",
        bm,
        [mats["grass"], mats["sand"], mats["seabed"]],
        collection,
        recalc_normals=False,
    )


def build_flat_plane(name, half_size, z, material, collection):
    bm = bmesh.new()
    corners = [(-half_size, -half_size), (half_size, -half_size), (half_size, half_size), (-half_size, half_size)]
    verts = [bm.verts.new((cx, cy, z)) for cx, cy in corners]
    bm.faces.new(verts)
    return object_from_bmesh(name, bm, [material], collection, recalc_normals=False)


# ----------------------------------------------------------------------------
# Dock, cabin, props
# ----------------------------------------------------------------------------
def build_dock(collection, mats, dock_start):
    bm = bmesh.new()
    plank_pitch = 0.32
    plank_count = int(DOCK_LENGTH / plank_pitch)
    for k in range(plank_count):
        x = dock_start + (k + 0.5) * plank_pitch
        wobble = Matrix.Rotation(math.radians(random.uniform(-1.5, 1.5)), 3, "Z")
        z = DOCK_HEIGHT + random.uniform(-0.012, 0.012)
        add_box(bm, (0.29, DOCK_WIDTH, 0.07), (x, DOCK_Y, z), 0, rotation=wobble)

    # stringers under the planks
    for side in (-1, 1):
        add_box(
            bm,
            (DOCK_LENGTH, 0.14, 0.14),
            (dock_start + DOCK_LENGTH / 2, DOCK_Y + side * 0.75, DOCK_HEIGHT - 0.1),
            1,
        )

    # posts every 2 m down to the seabed
    post_bottom = SEABED_DEPTH - 0.1
    post_top = DOCK_HEIGHT + 0.08
    post_xs = [dock_start + 0.3 + 2.0 * n for n in range(int(DOCK_LENGTH / 2.0))]
    post_xs.append(dock_start + DOCK_LENGTH - 0.15)
    for x in post_xs:
        for side in (-1, 1):
            add_cylinder(
                bm,
                0.1,
                0.1,
                post_top - post_bottom,
                (x, DOCK_Y + side * (DOCK_WIDTH / 2 - 0.05), (post_top + post_bottom) / 2),
                segments=8,
                material_index=1,
            )
    object_from_bmesh("Dock", bm, [mats["wood"], mats["wood_dark"]], collection)


def build_lanterns(collection, light_collection, mats, positions):
    bm = bmesh.new()
    deck_top = DOCK_HEIGHT + 0.035
    for (x, y) in positions:
        add_cylinder(bm, 0.06, 0.05, 1.4, (x, y, deck_top + 0.7), segments=6, material_index=0)
        add_box(bm, (0.2, 0.2, 0.24), (x, y, deck_top + 1.52), 1)
        add_cylinder(bm, 0.19, 0.0, 0.16, (x, y, deck_top + 1.72), segments=4, material_index=0)
        add_point_light(f"LanternLight_{len(light_collection.objects):02d}", (x, y, deck_top + 1.5),
                        light_collection, energy=40.0)
    object_from_bmesh("Lanterns", bm, [mats["wood_dark"], mats["lantern"]], collection)


def build_cabin(collection, light_collection, mats, yaw):
    bm = bmesh.new()
    floor_top = 0.2
    wall_top = 2.6
    half_x, half_y = 2.0, 1.6
    roof_slope = 0.75
    ridge_z = wall_top + 0.1 + roof_slope * half_y
    porch_depth = 1.8

    add_box(bm, (2 * half_x + 0.4, 2 * half_y + 0.4, 0.6), (0, 0, floor_top - 0.3), 3)          # stone base
    add_box(bm, (2 * half_x, 2 * half_y, wall_top - floor_top), (0, 0, (wall_top + floor_top) / 2), 0)
    add_hull(bm, [                                                                                  # gables
        (-half_x, -half_y, wall_top), (-half_x, half_y, wall_top), (-half_x, 0, ridge_z - 0.1),
        (half_x, -half_y, wall_top), (half_x, half_y, wall_top), (half_x, 0, ridge_z - 0.1),
    ], 0)

    # roof: two slabs meeting at the ridge, 0.4 m eave overhang
    eave_y = half_y + 0.4
    slab_length = math.hypot(eave_y, roof_slope * eave_y) + 0.1
    slab_angle = math.atan(roof_slope)
    for side in (-1, 1):
        rotation = Matrix.Rotation(-side * slab_angle, 3, "X")
        center = (0.0, side * eave_y / 2, ridge_z - roof_slope * eave_y / 2)
        add_box(bm, (2 * half_x + 0.7, slab_length, 0.12), center, 1, rotation=rotation)

    add_box(bm, (0.08, 0.9, 1.6), (half_x + 0.02, 0.0, floor_top + 0.8), 2)                       # door
    add_box(bm, (porch_depth, 2 * half_y + 0.4, 0.6),                                              # porch deck
            (half_x + porch_depth / 2, 0.0, floor_top - 0.3), 5)
    add_box(bm, (0.4, 1.0, 0.1), (half_x + porch_depth + 0.2, 0.0, floor_top - 0.15), 3)          # front step
    for side in (-1, 1):
        for window_x in (-0.9, 0.9):
            y = side * (half_y + 0.02)
            add_box(bm, (0.9, 0.06, 0.7), (window_x, y, 1.6), 4)                                   # glowing window
            add_box(bm, (1.0, 0.2, 0.18), (window_x, side * (half_y + 0.1), 1.12), 5)             # flower box
            for k in range(5):
                add_ico(bm, 0.07, (window_x - 0.36 + k * 0.18, side * (half_y + 0.1), 1.26), 6, subdivisions=1)
    add_box(bm, (0.5, 0.5, 1.6), (-1.2, 0.8, ridge_z - 0.3), 3)                                   # chimney

    # tea corner on the porch: table, chair, kettle, cup
    table = Vector((half_x + 0.85, 1.15))
    table_top = floor_top + 0.645
    add_box(bm, (0.7, 0.7, 0.05), (table.x, table.y, floor_top + 0.62), 2)
    add_cylinder(bm, 0.05, 0.05, 0.6, (table.x, table.y, floor_top + 0.3), segments=6, material_index=2)
    chair = Vector((table.x + 0.62, table.y))
    add_box(bm, (0.45, 0.45, 0.05), (chair.x, chair.y, floor_top + 0.42), 5)
    add_box(bm, (0.05, 0.45, 0.5), (chair.x + 0.2, chair.y, floor_top + 0.7), 5)
    for dx in (-0.18, 0.18):
        for dy in (-0.18, 0.18):
            add_cylinder(bm, 0.025, 0.025, 0.4, (chair.x + dx, chair.y + dy, floor_top + 0.2),
                         segments=5, material_index=2)
    kettle = Vector((table.x - 0.12, table.y + 0.1))
    add_cylinder(bm, 0.1, 0.09, 0.14, (kettle.x, kettle.y, table_top + 0.07), segments=10, material_index=7)
    add_cylinder(bm, 0.05, 0.0, 0.05, (kettle.x, kettle.y, table_top + 0.165), segments=10, material_index=7)
    add_cylinder(bm, 0.018, 0.012, 0.12, (kettle.x + 0.12, kettle.y, table_top + 0.1), segments=6,
                 material_index=7, rotation=Matrix.Rotation(math.radians(50), 3, "Y"))
    add_cylinder(bm, 0.04, 0.045, 0.07, (table.x + 0.12, table.y - 0.1, table_top + 0.035), segments=10,
                 material_index=8)

    base = Vector((CABIN_POS.x, CABIN_POS.y, CABIN_FLOOR))
    object_from_bmesh(
        "Cabin",
        bm,
        [mats["wall"], mats["roof"], mats["wood_dark"], mats["stone"], mats["window"], mats["wood"],
         mats["flower_pink"], mats["metal"], mats["flower_white"]],
        collection,
        location=base,
        rotation_z=yaw,
    )

    def to_world(local):
        return base + Matrix.Rotation(yaw, 3, "Z") @ Vector(local)

    add_point_light("PorchLight", to_world((half_x + 0.5, 0.75, 2.0)), light_collection, energy=80.0)
    return {
        "path_start": to_world((half_x + porch_depth + 0.5, 0.0, 0.0)),
        "tea_spot": to_world((table.x, table.y, floor_top)),
        "tea_camera_from": to_world((half_x + porch_depth + 3.5, 1.6, 0.0)),
    }


def build_path_stones(collection, mats, start, end, name="PathStones"):
    bm = bmesh.new()
    direction = (end - start)
    length = direction.length
    direction.normalize()
    side = Vector((-direction.y, direction.x))
    steps = int(length / 0.85)
    for k in range(steps + 1):
        p = start + direction * (k * 0.85) + side * random.uniform(-0.15, 0.15)
        radius = random.uniform(0.22, 0.3)
        add_cylinder(bm, radius, radius * 0.9, 0.06, (p.x, p.y, terrain_height(p.x, p.y) + 0.03),
                     segments=7, material_index=0)
    object_from_bmesh(name, bm, [mats["stone"]], collection)


def build_garden(collection, marker_collection, mats, center):
    """Three raised beds (two plots each) inside a picket fence with a gate facing the cabin."""
    bm = bmesh.new()
    floor = terrain_height(center.x, center.y)
    plot_index = 0
    for bed_y in (-1.2, 0.0, 1.2):
        add_box(bm, (2.2, 0.9, 0.3), (center.x, center.y + bed_y, floor + 0.1), 0)    # bed frame
        add_box(bm, (2.0, 0.7, 0.04), (center.x, center.y + bed_y, floor + 0.22), 1)  # soil, 1 cm below rim
        for bed_x in (-0.55, 0.55):
            add_marker(f"GardenPlot_{plot_index}", (center.x + bed_x, center.y + bed_y, floor + 0.24),
                       marker_collection)
            plot_index += 1

    half_x, half_y = 1.8, 2.2
    corners = [Vector((-half_x, -half_y)), Vector((half_x, -half_y)),
               Vector((half_x, half_y)), Vector((-half_x, half_y))]
    fence_posts = []
    for side in range(4):
        start, end = corners[side], corners[(side + 1) % 4]
        count = max(2, round((end - start).length / 0.7))
        points = [start.lerp(end, k / count) for k in range(count + 1)]
        fence_posts.extend(points[:-1])  # each corner added once
        for k in range(count):
            mid = (points[k] + points[k + 1]) / 2
            if side == 0 and abs(mid.x) < 0.5:
                continue  # gate opening on the south side
            rail_rotation = Matrix.Rotation(math.atan2(points[k + 1].y - points[k].y,
                                                       points[k + 1].x - points[k].x), 3, "Z")
            segment_length = (points[k + 1] - points[k]).length
            for rail_z in (0.3, 0.6):
                add_box(bm, (segment_length, 0.04, 0.06), (center.x + mid.x, center.y + mid.y, floor + rail_z),
                        2, rotation=rail_rotation)
    for post in fence_posts:
        add_box(bm, (0.08, 0.08, 0.8), (center.x + post.x, center.y + post.y, floor + 0.35), 2)

    # watering can by the gate
    can = Vector((center.x + 0.9, center.y - half_y - 0.5))
    can_floor = terrain_height(can.x, can.y)
    add_cylinder(bm, 0.12, 0.11, 0.22, (can.x, can.y, can_floor + 0.11), segments=10, material_index=3)
    add_cylinder(bm, 0.02, 0.015, 0.3, (can.x + 0.18, can.y, can_floor + 0.2), segments=6, material_index=3,
                 rotation=Matrix.Rotation(math.radians(55), 3, "Y"))

    object_from_bmesh("Garden", bm, [mats["wood"], mats["soil"], mats["wood_dark"], mats["teal"]], collection)
    add_marker("GardenCenter", (center.x, center.y, floor), marker_collection)
    # two fence posts double as bird perches (post tops)
    for index, post in enumerate((Vector((half_x, 0.0)), Vector((-half_x, half_y)))):
        add_marker(f"BirdPerch_{4 + index}", (center.x + post.x, center.y + post.y, floor + 0.75), marker_collection)


def build_bird_feeder(collection, marker_collection, mats, location):
    bm = bmesh.new()
    floor = terrain_height(location.x, location.y)
    tray_z = floor + 1.5
    add_cylinder(bm, 0.05, 0.05, 1.55, (location.x, location.y, floor + 0.725), segments=6, material_index=0)
    add_box(bm, (0.6, 0.6, 0.04), (location.x, location.y, tray_z), 1)
    add_cylinder(bm, 0.035, 0.035, 0.35, (location.x, location.y, tray_z + 0.19), segments=6, material_index=0)
    add_cylinder(bm, 0.5, 0.0, 0.3, (location.x, location.y, tray_z + 0.5), segments=4, material_index=2,
                 rotation=Matrix.Rotation(math.radians(45), 3, "Z"))
    object_from_bmesh("BirdFeeder", bm, [mats["wood_dark"], mats["wood"], mats["roof"]], collection)
    for index, (dx, dy) in enumerate(((0.26, 0.0), (-0.26, 0.0), (0.0, 0.26), (0.0, -0.26))):
        add_marker(f"BirdPerch_{index}", (location.x + dx, location.y + dy, tray_z + 0.02), marker_collection)
    add_marker("FeederSpot", (location.x, location.y, floor), marker_collection)


def build_bench(collection, marker_collection, mats, location, facing):
    """Bench whose sitter looks along `facing` (local +Y), backrest behind."""
    floor = terrain_height(location.x, location.y)
    bm = bmesh.new()
    add_box(bm, (1.4, 0.42, 0.06), (0.0, 0.0, 0.45), 0)
    add_box(bm, (1.4, 0.05, 0.36), (0.0, -0.21, 0.72), 0, rotation=Matrix.Rotation(math.radians(12), 3, "X"))
    for dx in (-0.6, 0.6):
        for dy in (-0.15, 0.15):
            add_cylinder(bm, 0.03, 0.03, 0.45, (dx, dy, 0.225), segments=6, material_index=1)
    yaw = math.atan2(-facing.x, facing.y)
    object_from_bmesh("ViewpointBench", bm, [mats["wood"], mats["wood_dark"]], collection,
                      location=(location.x, location.y, floor - 0.02), rotation_z=yaw)
    add_marker("ViewpointSpot", (location.x, location.y, floor), marker_collection)
    behind = location - facing * 3.0
    add_marker("ViewpointCameraFrom", (behind.x, behind.y, floor), marker_collection)


def build_homestead(index, collection, marker_collection, mats, center):
    """Claimable village plot. Built in a local frame whose gate side (-Y) faces the island centre."""
    floor = terrain_height(center.x, center.y)
    toward_centre = (-center).normalized()
    outward = -toward_centre
    yaw = math.atan2(-outward.x, outward.y)  # local +Y -> outward, so the gate (-Y) faces the centre
    rotation = Matrix.Rotation(yaw, 3, "Z")

    def to_world(local):
        offset = rotation @ Vector(local)
        return Vector((center.x + offset.x, center.y + offset.y, floor + offset.z))

    bm = bmesh.new()
    bed_index = 0
    for bed_y in (-0.55, 0.55):
        add_box(bm, (2.0, 0.8, 0.3), (0.0, bed_y, 0.1), 0)    # raised bed frame
        add_box(bm, (1.8, 0.6, 0.04), (0.0, bed_y, 0.22), 1)  # soil
        for bed_x in (-0.5, 0.5):
            add_marker(f"Homestead_{index}_Bed_{bed_index}", to_world((bed_x, bed_y, 0.24)), marker_collection)
            bed_index += 1

    half = 1.5
    corners = [Vector((-half, -half)), Vector((half, -half)), Vector((half, half)), Vector((-half, half))]
    for side in range(4):
        start, end = corners[side], corners[(side + 1) % 4]
        count = max(2, round((end - start).length / 0.75))
        points = [start.lerp(end, k / count) for k in range(count + 1)]
        for post in points[:-1]:
            add_box(bm, (0.07, 0.07, 0.65), (post.x, post.y, 0.28), 2)
        for k in range(count):
            mid = (points[k] + points[k + 1]) / 2
            if side == 0 and abs(mid.x) < 0.45:
                continue  # gate opening
            rail_rotation = Matrix.Rotation(math.atan2(points[k + 1].y - points[k].y,
                                                       points[k + 1].x - points[k].x), 3, "Z")
            add_box(bm, ((points[k + 1] - points[k]).length, 0.04, 0.05), (mid.x, mid.y, 0.45), 2,
                    rotation=rail_rotation)

    # name sign (left of the gate) and mailbox (right of the gate), both outside the fence
    add_cylinder(bm, 0.04, 0.04, 1.1, (-0.8, -1.9, 0.5), segments=6, material_index=2)
    add_box(bm, (0.6, 0.05, 0.35), (-0.8, -1.93, 1.0), 0)
    add_cylinder(bm, 0.035, 0.035, 0.9, (0.8, -1.9, 0.4), segments=6, material_index=2)
    add_box(bm, (0.25, 0.4, 0.22), (0.8, -1.9, 0.92), 3)

    object_from_bmesh(f"Homestead_{index}", bm, [mats["wood"], mats["soil"], mats["wood_dark"], mats["roof"]],
                      collection, location=(center.x, center.y, floor), rotation_z=yaw)
    add_marker(f"Homestead_{index}_Center", (center.x, center.y, floor), marker_collection)
    add_marker(f"Homestead_{index}_Sign", to_world((-0.8, -1.93, 1.0)), marker_collection)
    add_marker(f"Homestead_{index}_Mailbox", to_world((0.8, -1.9, 0.92)), marker_collection)


def build_tree_meshes(mats):
    bm = bmesh.new()
    add_cylinder(bm, 0.14, 0.1, 1.0, (0, 0, 0.5), segments=6, material_index=0)
    for radius, depth, z in ((1.1, 1.4, 1.5), (0.85, 1.2, 2.3), (0.55, 1.0, 3.0)):
        add_cylinder(bm, radius, 0.0, depth, (0, 0, z), segments=7, material_index=1)
    pine = mesh_from_bmesh("PineTree", bm, [mats["trunk"], mats["pine"]])

    bm = bmesh.new()
    add_cylinder(bm, 0.16, 0.12, 1.4, (0, 0, 0.7), segments=6, material_index=0)
    add_ico(bm, 1.1, (0, 0, 2.2), 1, subdivisions=1, jitter=0.12)
    add_ico(bm, 0.7, (0.5, 0.3, 2.75), 1, subdivisions=1, jitter=0.08)
    round_tree = mesh_from_bmesh("RoundTree", bm, [mats["trunk"], mats["leaf"]])
    return pine, round_tree


def scatter_points(count, min_height, max_height, min_spacing, accept, extent=ISLAND_RADIUS * 1.2,
                   max_attempts=6000):
    points = []
    for _ in range(max_attempts):
        if len(points) >= count:
            break
        x = random.uniform(-extent, extent)
        y = random.uniform(-extent, extent)
        height = terrain_height(x, y)
        if not (min_height <= height <= max_height):
            continue
        if not accept(x, y):
            continue
        point = Vector((x, y))
        if any((point - other).length < min_spacing for other in points):
            continue
        points.append(point)
    return points


def build_boat(collection, mats, location, yaw):
    bm = bmesh.new()
    verts = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)["verts"]
    bmesh.ops.scale(bm, vec=Vector((1.7, 0.7, 0.5)), verts=verts)
    bmesh.ops.bisect_plane(
        bm,
        geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
        plane_co=(0.0, 0.0, 0.0),
        plane_no=(0.0, 0.0, 1.0),
        clear_outer=True,
    )
    for face in bm.faces:
        face.material_index = 0
    for seat_x in (-0.45, 0.45):
        add_box(bm, (0.2, 1.2, 0.05), (seat_x, 0.0, -0.12), 1)
    oar_rotation = Matrix.Rotation(math.radians(8), 3, "Z")
    add_box(bm, (2.0, 0.08, 0.03), (0.0, 0.25, -0.2), 1, rotation=oar_rotation)

    boat = object_from_bmesh("Rowboat", bm, [mats["wood"], mats["wood_dark"]], collection,
                             location=location, rotation_z=yaw, recalc_normals=False)
    boat.rotation_euler.x = math.radians(2.5)
    solidify = boat.modifiers.new("HullThickness", "SOLIDIFY")
    solidify.thickness = 0.05
    solidify.offset = -1.0
    return boat


def build_fishing_props(props_collection, marker_collection, mats, dock_end):
    deck_top = DOCK_HEIGHT + 0.035

    # stool, bucket, tackle box
    bm = bmesh.new()
    stool = Vector((dock_end - 1.3, DOCK_Y + 0.25))
    add_box(bm, (0.42, 0.42, 0.06), (stool.x, stool.y, deck_top + 0.45), 0)
    for dx in (-0.16, 0.16):
        for dy in (-0.16, 0.16):
            add_cylinder(bm, 0.025, 0.025, 0.42, (stool.x + dx, stool.y + dy, deck_top + 0.21),
                         segments=5, material_index=1)
    add_cylinder(bm, 0.2, 0.25, 0.32, (dock_end - 1.75, DOCK_Y - 0.5, deck_top + 0.16),
                 segments=12, material_index=2)
    add_box(bm, (0.42, 0.26, 0.18), (dock_end - 2.4, DOCK_Y + 0.45, deck_top + 0.09), 3)
    object_from_bmesh("FishingGear", bm, [mats["wood"], mats["wood_dark"], mats["metal"], mats["roof"]],
                      props_collection)

    # rod in a holder on the dock edge
    rod_base = Vector((dock_end - 0.8, DOCK_Y - 0.55, deck_top + 0.5))
    rod_dir = Vector((math.cos(math.radians(38)), 0.12, math.sin(math.radians(38)))).normalized()
    rod_length = 2.6
    rod_rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(rod_dir).to_matrix()
    bm = bmesh.new()
    add_cylinder(bm, 0.05, 0.05, 0.5, (rod_base.x, rod_base.y, deck_top + 0.25), segments=8, material_index=0)
    add_cylinder(bm, 0.03, 0.012, rod_length, rod_base + rod_dir * (rod_length / 2), segments=6,
                 material_index=0, rotation=rod_rotation)
    add_cylinder(bm, 0.045, 0.045, 0.45, rod_base + rod_dir * 0.3, segments=8, material_index=1,
                 rotation=rod_rotation)
    reel_rotation = Matrix.Rotation(math.radians(90), 3, "X")
    add_cylinder(bm, 0.06, 0.06, 0.04, rod_base + rod_dir * 0.62 - Vector((0, 0, 0.07)), segments=10,
                 material_index=2, rotation=reel_rotation)
    object_from_bmesh("FishingRod", bm, [mats["wood_dark"], mats["cork"], mats["metal"]], props_collection)
    rod_tip = rod_base + rod_dir * rod_length

    # bobber: red top, white bottom
    bobber_location = Vector((rod_tip.x + 3.0, rod_tip.y + 0.4, WATER_LEVEL + 0.03))
    bm = bmesh.new()
    verts = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.08)["verts"]
    place(bm, verts, 0)
    for face in bm.faces:
        face.material_index = 0 if face.calc_center_median().z > 0 else 1
    object_from_bmesh("Bobber", bm, [mats["bobber_red"], mats["bobber_white"]], props_collection,
                      location=bobber_location)

    # sagging line (Unity will use a LineRenderer instead)
    curve = bpy.data.curves.new("FishingLine", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.004
    spline = curve.splines.new("POLY")
    point_count = 16
    spline.points.add(point_count - 1)
    for i in range(point_count):
        t = i / (point_count - 1)
        p = rod_tip.lerp(bobber_location, t)
        p.z -= 0.5 * 4.0 * t * (1.0 - t)
        spline.points[i].co = (p.x, p.y, p.z, 1.0)
    curve.materials.append(mats["line"])
    line_obj = bpy.data.objects.new("FishingLine", curve)
    props_collection.objects.link(line_obj)

    add_marker("RodTip", rod_tip, marker_collection)
    add_marker("FishingSpot", bobber_location, marker_collection)
    add_marker("PlayerSpot", (stool.x, stool.y, deck_top), marker_collection)


# ----------------------------------------------------------------------------
# Lighting, sky, camera, render settings
# ----------------------------------------------------------------------------
def build_sky(scene):
    world = bpy.data.worlds.new("CozySky")
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    coords = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    remap = tree.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -0.05
    remap.inputs["From Max"].default_value = 0.55
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*hex_color("#FFB38A"), 1.0)   # peach horizon
    ramp.color_ramp.elements[1].color = (*hex_color("#8FA8E0"), 1.0)   # soft blue zenith
    middle = ramp.color_ramp.elements.new(0.3)
    middle.color = (*hex_color("#F5C4C0"), 1.0)                         # pink band
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 0.8
    output = tree.nodes.new("ShaderNodeOutputWorld")
    tree.links.new(coords.outputs["Generated"], separate.inputs[0])
    tree.links.new(separate.outputs["Z"], remap.inputs["Value"])
    tree.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], background.inputs["Color"])
    tree.links.new(background.outputs["Background"], output.inputs["Surface"])


def build_sun(collection):
    sun_data = bpy.data.lights.new("GoldenHourSun", "SUN")
    sun_data.energy = 3.2
    sun_data.color = hex_color("#FFC68C")
    sun_data.angle = math.radians(4.0)
    sun = bpy.data.objects.new("GoldenHourSun", sun_data)
    sun.rotation_euler = (math.radians(72.0), 0.0, math.radians(-110.0))  # ~18 deg above horizon
    collection.objects.link(sun)


def build_camera(scene, collection, focus_point):
    camera_data = bpy.data.cameras.new("CozyCam")
    camera_data.lens = 45.0
    camera = bpy.data.objects.new("CozyCam", camera_data)
    camera.location = (36.0, -30.0, 17.0)
    target = Vector((3.0, -1.0, 0.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.dof.use_dof = True
    camera_data.dof.focus_distance = (focus_point - camera.location).length
    camera_data.dof.aperture_fstop = 0.3       # gentle tilt-shift / miniature blur
    collection.objects.link(camera)
    scene.camera = camera


def add_glare_compositor(scene):
    """EEVEE Next (4.2+) has no bloom toggle; use a Fog Glow glare node instead."""
    try:
        scene.use_nodes = True
        tree = scene.node_tree
        if tree is None:
            return
        render_layers = tree.nodes.get("Render Layers") or tree.nodes.new("CompositorNodeRLayers")
        composite = tree.nodes.get("Composite") or tree.nodes.new("CompositorNodeComposite")
        glare = tree.nodes.new("CompositorNodeGlare")
        try_set(glare, "glare_type", "FOG_GLOW")
        try_set(glare, "quality", "HIGH")
        try_set(glare, "threshold", 0.9)
        tree.links.new(render_layers.outputs["Image"], glare.inputs["Image"])
        tree.links.new(glare.outputs["Image"], composite.inputs["Image"])
    except Exception as error:  # compositor API changed in 5.x - glow is optional
        print(f"[cozy] skipped glare compositor: {error}")


def configure_render(scene):
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    eevee = scene.eevee
    try_set(eevee, "taa_render_samples", 64)
    try_set(eevee, "use_gtao", True)
    try_set(eevee, "use_soft_shadows", True)
    try_set(eevee, "shadow_cascade_size", "2048")
    if bpy.app.version < (4, 2, 0):
        try_set(eevee, "use_bloom", True)
        try_set(eevee, "bloom_intensity", 0.04)
    else:
        add_glare_compositor(scene)

    view = scene.view_settings
    if not try_set(view, "view_transform", "AgX"):
        try_set(view, "view_transform", "Filmic")
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        if try_set(view, "look", look):
            break


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main():
    random.seed(SEED)
    clear_scene()
    scene = bpy.context.scene
    mats = make_palette()

    terrain_collection = get_collection("Terrain")
    building_collection = get_collection("Buildings")
    nature_collection = get_collection("Nature")
    props_collection = get_collection("Props")
    fx_collection = get_collection("FX")
    light_collection = get_collection("Lighting")
    marker_collection = get_collection("Unity_Markers")

    dock_start = find_dock_start()
    dock_end = dock_start + DOCK_LENGTH
    cabin_yaw = math.atan2(DOCK_Y - CABIN_POS.y, dock_start - CABIN_POS.x)

    # ground + water
    build_terrain(terrain_collection, mats)
    build_flat_plane("Water", 120.0, WATER_LEVEL, mats["water"], terrain_collection)
    build_flat_plane("Seabed_Far", 120.0, SEABED_DEPTH, mats["seabed"], terrain_collection)

    # structures
    build_dock(building_collection, mats, dock_start)
    build_lanterns(
        building_collection,
        light_collection,
        mats,
        [(dock_start + 0.4, DOCK_Y + 0.95), (dock_end - 0.3, DOCK_Y + 0.95)],
    )
    cabin_info = build_cabin(building_collection, light_collection, mats, cabin_yaw)
    path_start = cabin_info["path_start"].to_2d()
    path_end = Vector((dock_start - 0.3, DOCK_Y))
    garden_gate = GARDEN_POS + Vector((0.0, -2.6))
    garden_path_start = path_start + (garden_gate - path_start).normalized() * 0.85
    build_path_stones(building_collection, mats, path_start, path_end, "PathStones_Dock")
    build_path_stones(building_collection, mats, garden_path_start, garden_gate, "PathStones_Garden")
    path_segments = [(path_start, path_end), (garden_path_start, garden_gate)]
    add_marker("TeaSpot", cabin_info["tea_spot"], marker_collection)
    add_marker("TeaCameraFrom", cabin_info["tea_camera_from"], marker_collection)

    # nature activities: garden, bird feeder, sunset bench
    feeder_pos = GARDEN_POS + Vector((2.8, -1.8))
    build_garden(building_collection, marker_collection, mats, GARDEN_POS)
    build_bird_feeder(building_collection, marker_collection, mats, feeder_pos)
    add_marker("BirdCameraFrom", (GARDEN_POS.x, GARDEN_POS.y, GARDEN_FLOOR), marker_collection)
    build_bench(building_collection, marker_collection, mats, VIEWPOINT_POS, SUNSET_DIR)
    add_marker("FishingCameraFrom", (dock_start, DOCK_Y, DOCK_HEIGHT), marker_collection)

    # shared-village homesteads + avatar spawn point (on the dock path)
    for index, centre in enumerate(HOMESTEADS):
        build_homestead(index, building_collection, marker_collection, mats, centre)
    spawn = path_start.lerp(path_end, 0.5)
    add_marker("VillageSpawn", (spawn.x, spawn.y, terrain_height(spawn.x, spawn.y)), marker_collection)

    def is_clear(x, y, margin=0.0):
        point = Vector((x, y))
        if (point - CABIN_POS).length < 5.0 + margin:
            return False
        if (point - GARDEN_POS).length < 3.4 + margin:
            return False
        if any((point - centre).length < 2.8 + margin for centre in HOMESTEADS):
            return False
        if (point - feeder_pos).length < 1.0 + margin:
            return False
        if x > dock_start - 2.5 - margin and abs(y - DOCK_Y) < 2.0 + margin:
            return False
        for seg_a, seg_b in path_segments:
            if distance_to_segment(point, seg_a, seg_b) < 1.0 + margin:
                return False
        offset = point - VIEWPOINT_POS
        if offset.length < 2.0 + margin:
            return False
        along = offset.dot(SUNSET_DIR)
        across = abs(offset.x * SUNSET_DIR.y - offset.y * SUNSET_DIR.x)
        if along > 0.0 and across < 3.0 + margin:  # keep the sunset view open
            return False
        return True

    # nature
    pine_mesh, round_mesh = build_tree_meshes(mats)
    tree_points = scatter_points(
        TREE_COUNT, 0.7, 99.0, 2.0,
        accept=lambda x, y: is_clear(x, y, 0.8) and (x - y) < 12.0,   # keep the camera side open
    )
    for index, point in enumerate(tree_points):
        mesh = pine_mesh if random.random() < 0.6 else round_mesh
        instance(f"Tree_{index:02d}", mesh, nature_collection,
                 (point.x, point.y, terrain_height(point.x, point.y) - 0.05),
                 rotation_z=random.uniform(0.0, math.tau), scale=random.uniform(0.75, 1.3))

    bm = bmesh.new()
    for point in scatter_points(BUSH_COUNT, 0.55, 99.0, 1.2, accept=lambda x, y: is_clear(x, y, 0.2)):
        add_ico(bm, random.uniform(0.35, 0.6), (point.x, point.y, terrain_height(point.x, point.y) + 0.15),
                0, subdivisions=1, scale=(1.0, 1.0, 0.75), jitter=0.06)
    object_from_bmesh("Bushes", bm, [mats["bush"]], nature_collection)

    bm = bmesh.new()
    rock_points = scatter_points(
        ROCK_COUNT, -0.5, 0.45, 1.2,
        accept=lambda x, y: not (x > dock_start - 1.0 and abs(y - DOCK_Y) < 1.8),
    )
    for point in rock_points:
        size = random.uniform(0.3, 0.9)
        add_ico(bm, size, (point.x, point.y, terrain_height(point.x, point.y)), 0, subdivisions=1,
                scale=(1.0, random.uniform(0.7, 1.0), random.uniform(0.5, 0.75)), jitter=size * 0.15)
    object_from_bmesh("Rocks", bm, [mats["rock"]], nature_collection)

    bm = bmesh.new()
    for patch in scatter_points(10, 0.6, 99.0, 2.5, accept=lambda x, y: is_clear(x, y, 0.0)):
        material_index = random.randrange(3)
        for _ in range(7):
            fx = patch.x + random.uniform(-0.6, 0.6)
            fy = patch.y + random.uniform(-0.6, 0.6)
            add_ico(bm, 0.07, (fx, fy, terrain_height(fx, fy) + 0.12), material_index, subdivisions=1)
    object_from_bmesh("Flowers", bm, [mats["flower_pink"], mats["flower_yellow"], mats["flower_white"]],
                      nature_collection)

    boat_center = Vector((dock_start + 5.5, DOCK_Y + 2.0))
    bm = bmesh.new()
    lily_points = scatter_points(
        14, -1.4, -0.4, 0.9,
        accept=lambda x, y: abs(y - DOCK_Y) > 2.2 and (Vector((x, y)) - boat_center).length > 2.5,
        extent=ISLAND_RADIUS * 1.4,
    )
    for point in lily_points:
        radius = random.uniform(0.25, 0.4)
        add_cylinder(bm, radius, radius, 0.02, (point.x, point.y, WATER_LEVEL + 0.012), segments=10,
                     material_index=0)
        if random.random() < 0.3:
            add_cylinder(bm, 0.0, 0.1, 0.1, (point.x, point.y, WATER_LEVEL + 0.07), segments=5,
                         material_index=1)
    object_from_bmesh("LilyPads", bm, [mats["lily"], mats["flower_pink"]], nature_collection)

    # props
    build_boat(props_collection, mats, (boat_center.x, boat_center.y, WATER_LEVEL + 0.22), math.radians(7))
    build_fishing_props(props_collection, marker_collection, mats, dock_end)

    # fx + backdrop
    bm = bmesh.new()
    for _ in range(30):
        angle = random.uniform(0.0, math.tau)
        radius = random.uniform(0.0, ISLAND_RADIUS)
        fx = math.cos(angle) * radius
        fy = math.sin(angle) * radius
        base_z = max(terrain_height(fx, fy), WATER_LEVEL)
        add_ico(bm, 0.035, (fx, fy, base_z + random.uniform(0.8, 2.5)), 0, subdivisions=1)
    object_from_bmesh("Fireflies", bm, [mats["firefly"]], fx_collection)

    bm = bmesh.new()
    for k in range(9):
        angle = math.radians(k * 40.0 + random.uniform(-12.0, 12.0))
        distance = random.uniform(75.0, 95.0)
        height = random.uniform(10.0, 22.0)
        add_cylinder(bm, random.uniform(14.0, 24.0), 0.0, height,
                     (math.cos(angle) * distance, math.sin(angle) * distance, height / 2 - 1.0),
                     segments=6, material_index=0,
                     rotation=Matrix.Rotation(random.uniform(0.0, math.tau), 3, "Z"))
    object_from_bmesh("Backdrop_Mountains", bm, [mats["mountain"]], terrain_collection)

    # light, sky, camera, render
    build_sun(light_collection)
    build_sky(scene)
    build_camera(scene, light_collection, Vector((dock_end - 1.0, DOCK_Y, DOCK_HEIGHT)))
    configure_render(scene)

    # save + export
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    blend_path = os.path.join(OUTPUT_DIR, "cozy_fishing.blend")
    fbx_path = os.path.join(OUTPUT_DIR, "cozy_fishing.fbx")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.fbx(
        filepath=fbx_path,
        use_selection=False,
        object_types={"MESH", "EMPTY", "OTHER"},
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL",
        bake_space_transform=True,
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        axis_forward="-Z",
        axis_up="Y",
    )
    print(f"[cozy] saved {blend_path}")
    print(f"[cozy] exported {fbx_path}")

    if bpy.app.background:
        scene.render.filepath = os.path.join(OUTPUT_DIR, "preview.png")
        bpy.ops.render.render(write_still=True)
        print(f"[cozy] rendered {scene.render.filepath}")


if __name__ == "__main__":
    main()
