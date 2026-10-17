# ============================================================================
# render.py — rendu Blender (Cycles, processeur) des scènes exportées par build-3d.cjs --glb : mêmes cadres et
# mêmes ancres que le moteur Three.js, mais éclairage global, ombres douces, occlusion ambiante, biseaux, relief
# des textures, contours à l'encre. Sortie : PNG RGBA à l'échelle 2× dans --out, mêmes chemins que les sprites.
#   python3 tools/blender/render.py --glb <dossier glb> --out <dossier png> [--only regex] [--samples 48] [--jobs N]
# ============================================================================
import bpy, json, os, sys, math, re, time, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--glb', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--only', default=None); ap.add_argument('--samples', type=int, default=48)
ap.add_argument('--scale', type=int, default=2); ap.add_argument('--force', action='store_true')
ap.add_argument('--outline', default='freestyle', choices=['hull', 'freestyle', 'both', 'none'])
ap.add_argument('--style', default='toon', choices=['toon', 'pbr'])
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRAMES = json.load(open(os.path.join(ROOT, 'frontend', 'assets', 'images', '3d', 'manifest.json')))['frames']
PRESET = { 'iso': (45, 30), 'three-quarter': (28, 18), 'bust': (0, 6), 'icon': (30, 28), 'front': (0, 0) }
SUN = { 'iso': (-2.6, 14, 7.5), 'three-quarter': (-2.6, 14, 7.5), 'bust': (-4, 8, 10), 'icon': (-3, 9, 10), 'front': (-3, 9, 10) }   # repère Three (x, y haut, z)
INK = (0.16, 0.10, 0.05, 1.0)

def to_blender(v):   # Three (x, y haut, z) -> Blender (x, -z, y)
    return (v[0], -v[2], v[1])

def setup_scene(info, frame):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.cycles.samples = args.samples; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.05
    sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transparent_max_bounces = 8
    sc.cycles.film_exposure = 1.0
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.film_transparent = True
    W, H = int(frame['w'] * args.scale), int(frame['h'] * args.scale)
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.compression = 50
    # monde : lumière d'ambiance bleutée douce (équivalent de l'hémisphère)
    w = bpy.data.worlds.new('w'); w.use_nodes = True; sc.world = w
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.72, 0.80, 0.92, 1); bg.inputs[1].default_value = 0.55
    return sc, W, H

def add_camera(sc, info, frame, W, H):
    cam_info = info.get('cam', {}) or {}
    preset = frame['cam']
    yaw = math.radians(cam_info.get('yaw', PRESET[preset][0])); pitch = math.radians(cam_info.get('pitch', PRESET[preset][1]))
    ppu = cam_info.get('ppu', frame['ppu']); ax = cam_info.get('ax', frame['ax']); ay = cam_info.get('ay', frame['ay'])
    t = (cam_info.get('tx', 0), cam_info.get('ty', 0), cam_info.get('tz', 0))
    d = 120
    pos = (t[0] + math.sin(yaw) * math.cos(pitch) * d, t[1] + math.sin(pitch) * d, t[2] + math.cos(yaw) * math.cos(pitch) * d)
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.clip_start = 0.1; cam.clip_end = 400
    L = max(frame['w'], frame['h']) / ppu
    cam.ortho_scale = L
    cam.shift_x = (frame['w'] / ppu * (0.5 - ax)) / L
    cam.shift_y = (frame['h'] / ppu * (ay - 0.5)) / L
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = to_blender(pos)
    tgt = bpy.data.objects.new('target', None); sc.collection.objects.link(tgt); tgt.location = to_blender(t)
    c = co.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return co

def add_lights(sc, frame):
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(6)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    dvec = SUN[frame['cam']]; n = math.sqrt(sum(v * v for v in dvec)); so.location = to_blender(tuple(v / n * 40 for v in dvec))
    tgt = bpy.data.objects.new('sun_target', None); sc.collection.objects.link(tgt)
    c = so.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    # lumière de retour (face droite lisible), sans ombre
    fill = bpy.data.lights.new('fill', 'SUN'); fill.energy = 0.7; fill.angle = math.radians(20); fill.use_shadow = False; fill.color = (1.0, 0.92, 0.82)
    fo = bpy.data.objects.new('fill', fill); sc.collection.objects.link(fo); fo.location = to_blender((10, 6, -4))
    c2 = fo.constraints.new('TRACK_TO'); c2.target = tgt; c2.track_axis = 'TRACK_NEGATIVE_Z'; c2.up_axis = 'UP_Y'
    if args.style == 'toon':
        rim = bpy.data.lights.new('rim', 'SUN'); rim.energy = 0.9; rim.angle = math.radians(10); rim.use_shadow = False; rim.color = (0.75, 0.85, 1.0)
        ro = bpy.data.objects.new('rim', rim); sc.collection.objects.link(ro); ro.location = to_blender((6, 5, -10))
        c3 = ro.constraints.new('TRACK_TO'); c3.target = tgt; c3.track_axis = 'TRACK_NEGATIVE_Z'; c3.up_axis = 'UP_Y'
        sun.energy = 3.6; sun.color = (1.0, 0.95, 0.86)

def outline_material():
    m = bpy.data.materials.get('_ink')
    if m: return m
    m = bpy.data.materials.new('_ink'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); mix = nt.nodes.new('ShaderNodeMixShader'); geo = nt.nodes.new('ShaderNodeNewGeometry')
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = INK; em.inputs[1].default_value = 1.0
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    nt.links.new(geo.outputs['Backfacing'], mix.inputs[0]); nt.links.new(em.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs[0])
    return m

def prepare_meshes(sc, info):
    ink = outline_material() if args.outline in ('hull', 'both') else None
    for o in list(sc.objects):
        if o.type != 'MESH': continue
        me = o.data
        # relief léger à partir de la texture, rugosité plus matte
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes: continue
            nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf: continue
            m.blend_method = 'BLEND' if m.blend_method == 'BLEND' else m.blend_method
            tex = next((l.from_node for l in nt.links if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE'), None)
            if tex and not bsdf.inputs['Normal'].is_linked:
                bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.22; bump.inputs['Distance'].default_value = 0.03
                nt.links.new(tex.outputs['Color'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
            if args.style == 'toon' and tex:
                # couleur : texture × occlusion ambiante (creux assombris) ; ombrage : mélange Toon (aplats doux) + Principled (volume)
                ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.45; ao.samples = 8; ao.only_local = True
                mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 0.55
                sat = nt.nodes.new('ShaderNodeHueSaturation'); sat.inputs['Saturation'].default_value = 1.18; sat.inputs['Value'].default_value = 1.05
                nt.links.new(tex.outputs['Color'], ao.inputs['Color']); nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(ao.outputs['Color'], mul.inputs[7])
                nt.links.new(mul.outputs[2], sat.inputs['Color'])
                nt.links.new(sat.outputs['Color'], bsdf.inputs['Base Color'])
                toon = nt.nodes.new('ShaderNodeBsdfToon'); toon.component = 'DIFFUSE'; toon.inputs['Size'].default_value = 0.55; toon.inputs['Smooth'].default_value = 0.3
                nt.links.new(sat.outputs['Color'], toon.inputs['Color']); nt.links.new(bump.outputs['Normal'], toon.inputs['Normal']) if 'bump' in dir() and not bsdf.inputs['Normal'].is_linked else None
                outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); mix = nt.nodes.new('ShaderNodeMixShader'); mix.inputs[0].default_value = 0.5
                prev = next((l.from_node for l in nt.links if l.to_node == outn and l.to_socket.name == 'Surface'), bsdf)
                nt.links.new(prev.outputs[0], mix.inputs[1]); nt.links.new(toon.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], outn.inputs['Surface'])
                if bsdf.inputs['Emission Strength'].default_value > 0: bsdf.inputs['Emission Strength'].default_value *= 2.0
            if bsdf.inputs['Roughness'].default_value < 0.5: bsdf.inputs['Roughness'].default_value = max(bsdf.inputs['Roughness'].default_value, 0.35)
            bsdf.inputs['Specular IOR Level'].default_value = 0.3 if 'Specular IOR Level' in bsdf.inputs else 0.3
        # biseau des petites pièces (boîtes, toits) : arêtes adoucies, bords lumineux
        if len(me.vertices) <= 400 and not info.get('noBevel'):
            mod = o.modifiers.new('bevel', 'BEVEL'); mod.width = 0.022; mod.segments = 2; mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(40); mod.harden_normals = True
        # contour à l'encre : coque inversée (solidify vers l'extérieur, faces arrière noires)
        if ink and info.get('outline', True) and not any(m.material and m.material.blend_method == 'BLEND' for m in o.material_slots):
            if ink.name not in [m.material.name for m in o.material_slots if m.material]: me.materials.append(ink)
            sol = o.modifiers.new('ink', 'SOLIDIFY'); sol.thickness = -0.028; sol.offset = 1.0; sol.use_flip_normals = True; sol.use_rim = False
            sol.material_offset = len(o.material_slots) - 1; sol.material_offset_rim = len(o.material_slots) - 1
    if info.get('shadowCatcher', True):
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0)); plane = bpy.context.object; plane.is_shadow_catcher = True; plane.name = 'catcher'

def render_one(glb, meta, out_png):
    info = json.load(open(meta)); frame = FRAMES[info['frame']]
    sc, W, H = setup_scene(info, frame)
    bpy.ops.import_scene.gltf(filepath=glb, import_shading='NORMALS')
    prepare_meshes(sc, info)
    add_camera(sc, info, frame, W, H); add_lights(sc, frame)
    if args.outline in ('freestyle', 'both'):
        sc.render.use_freestyle = True; vl = sc.view_layers[0]; vl.use_freestyle = True
        for old in list(vl.freestyle_settings.linesets):   # le jeu de lignes par défaut n'a pas de style en mode module : on repart de zéro
            vl.freestyle_settings.linesets.remove(old)
        ls = vl.freestyle_settings.linesets.new('ink'); ls.select_silhouette = True; ls.select_crease = True; ls.select_border = True; ls.select_by_visibility = True
        if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('ink')
        ls.linestyle.color = INK[:3]; ls.linestyle.thickness = 1.3 * args.scale; ls.linestyle.thickness_position = 'CENTER'
        ls2 = vl.freestyle_settings.linesets.new('contour'); ls2.select_silhouette = False; ls2.select_crease = False; ls2.select_border = False; ls2.select_external_contour = True; ls2.select_by_visibility = True
        ls2.linestyle = bpy.data.linestyles.new('contour'); ls2.linestyle.color = INK[:3]; ls2.linestyle.thickness = 2.6 * args.scale; ls2.linestyle.thickness_position = 'OUTSIDE'
        vl.freestyle_settings.crease_angle = math.radians(120)
        for o in sc.objects:
            if o.name == 'catcher': o.hide_render = False
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)

jobs = []
for d, _, fs in os.walk(args.glb):
    for f in fs:
        if f.endswith('.glb'):
            glb = os.path.join(d, f); rel = os.path.relpath(glb, args.glb)[:-4]
            if args.only and not re.search(args.only, rel): continue
            out_png = os.path.join(args.out, rel + '.png')
            if os.path.exists(out_png) and not args.force: continue
            jobs.append((glb, glb[:-4] + '.json', out_png, rel))
print(f'{len(jobs)} scène(s) à rendre', flush=True)
t0 = time.time()
for i, (glb, meta, out_png, rel) in enumerate(sorted(jobs)):
    t1 = time.time()
    try: render_one(glb, meta, out_png)
    except Exception as ex: print('ÉCHEC', rel, ex, flush=True); continue
    print(f'  {i + 1}/{len(jobs)}  {rel}  {time.time() - t1:.1f} s  (total {time.time() - t0:.0f} s)', flush=True)
