# Test de faisabilité : rendu Cycles sans GPU, film transparent, contours Freestyle, mesure du temps
import bpy, time, os
out = os.environ.get('OUT', '/tmp/blender-smoke.png')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 48
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 3
sc.render.resolution_x, sc.render.resolution_y = 520, 720
sc.render.film_transparent = True
sc.render.use_freestyle = True
sc.render.line_thickness = 2.0
# objets
bpy.ops.mesh.primitive_cube_add(size=1.2, location=(0, 0, 0.6))
cube = bpy.context.object
mod = cube.modifiers.new('bevel', 'BEVEL'); mod.width = 0.05; mod.segments = 2
bpy.ops.mesh.primitive_cylinder_add(radius=0.4, depth=1.6, location=(1.0, 0.8, 0.8))
mat = bpy.data.materials.new('m'); mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Base Color'].default_value = (0.85, 0.72, 0.5, 1); bsdf.inputs['Roughness'].default_value = 0.85
for o in (cube, bpy.context.object): o.data.materials.append(mat)
# sol attrape-ombres
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0)); plane = bpy.context.object; plane.is_shadow_catcher = True
# soleil + monde
bpy.ops.object.light_add(type='SUN', location=(-2.6, -7.5, 14)); sun = bpy.context.object; sun.data.energy = 4.0; sun.data.angle = 0.12
tr = sun.constraints.new('TRACK_TO'); tr.target = plane; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.82, 0.95, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
# caméra iso orthographique
import math
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 720 / 35.355
camo = bpy.data.objects.new('cam', cam); sc.collection.objects.link(camo); sc.camera = camo
yaw, pitch, d = math.radians(45), math.radians(30), 120
camo.location = (math.sin(yaw) * math.cos(pitch) * d, -math.cos(yaw) * math.cos(pitch) * d, math.sin(pitch) * d)
tc = camo.constraints.new('TRACK_TO'); tc.target = plane; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
cam.shift_y = 0.25
# freestyle
vl = sc.view_layers[0]; vl.use_freestyle = True
ls = vl.freestyle_settings.linesets.new('ink'); ls.select_silhouette = True; ls.select_crease = True; ls.select_border = True
ls.linestyle.color = (0.18, 0.11, 0.05); ls.linestyle.thickness = 2.0
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = out
t0 = time.time()
bpy.ops.render.render(write_still=True)
print('rendu en %.1f s ->' % (time.time() - t0), out, os.path.getsize(out), 'octets')
