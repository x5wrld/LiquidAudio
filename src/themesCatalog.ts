export type ThemeCategory =
  | 'Space & Cosmic'
  | 'Nature & Weather'
  | 'Light & Fluid'
  | 'Geometric & Math'
  | 'Retro & Tech';

export type UiStyleMode =
  | 'liquid'
  | 'space'
  | 'thunder'
  | 'undersea'
  | 'lava'
  | 'nature'
  | 'rain'
  | 'synthwave'
  | 'eclipse'
  | 'nebula'
  | 'aurora'
  | 'bioluminescent'
  | 'snowfall'
  | 'blackhole'
  | 'ink'
  | 'bokeh'
  | 'tunnel'
  | 'vinyl'
  | 'oscilloscope'
  | 'vumeter'
  | 'kaleidoscope'
  | 'voronoi'
  | 'crt'
  | 'topographic'
  | 'laser'
  | 'circuit'
  | 'origami'
  | 'thermal'
  | 'turing'
  | 'moire'
  | 'halftone'
  | 'pixelsort'
  | 'caustics'
  | 'prism'
  | 'ferrofluid'
  | 'oilslick'
  // 51 Extra Themes
  | 'embers'
  | 'matrix'
  | 'starwarp'
  | 'goldenhour'
  | 'sakura'
  | 'cyberpunk'
  | 'cymatics'
  | 'lissajous'
  | 'rosewindow'
  | 'chladni'
  | 'honeycomb'
  | 'pendulum'
  | 'mirror'
  | 'sonar'
  | 'silk'
  | 'voxel'
  | 'corona'
  | 'opart'
  | 'mercury'
  | 'dna'
  | 'shadowbox'
  | 'julia'
  | 'fluted'
  | 'boids'
  | 'dither'
  | 'tesla'
  | 'kinetictype'
  | 'astrolabe'
  | 'metashapes'
  | 'kintsugi'
  | 'attractor'
  | 'blinds'
  | 'transit'
  | 'geode'
  | 'harmonograph'
  | 'chromemesh'
  | 'spirograph'
  | 'flipdisc'
  | 'fiber'
  | 'brutalism'
  | 'seismograph'
  | 'filmstrip'
  | 'blueprint'
  | 'soapfilm'
  | 'magfield'
  | 'terraces'
  | 'wormhole'
  | 'lidar'
  | 'rorschach'
  | 'neontube'
  | 'diffraction';

export type ThemeCycleMode = 'off' | 'random_all' | 'fav_random' | 'fav_loop';

export interface ThemeMeta {
  id: UiStyleMode;
  label: string;
  desc: string;
  category: ThemeCategory;
  surface: 'glass' | 'space' | 'thunder' | 'undersea' | 'lava' | 'nature';
  backdrop: 'space' | 'storm' | 'ocean' | 'warm' | 'forest' | 'synth' | 'aurora' | 'snow' | 'liquid';
}

export const THEME_CATALOG: ThemeMeta[] = [
  // Core & Existing 36
  { id: 'liquid', label: 'Liquid Glass (Default)', desc: 'Frosted glass & 3D album color mesh', category: 'Light & Fluid', surface: 'glass', backdrop: 'liquid' },
  { id: 'space', label: 'Meteor Shower / Space', desc: 'Twinkling stars & glowing audio meteors', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'thunder', label: 'Thunder & Lightning', desc: 'Top storm clouds & beat-synced bolts', category: 'Nature & Weather', surface: 'thunder', backdrop: 'storm' },
  { id: 'undersea', label: 'Ocean Waves', desc: 'Layered rolling wave swells & glowing seafoam', category: 'Nature & Weather', surface: 'undersea', backdrop: 'ocean' },
  { id: 'lava', label: 'Lava Lamp', desc: 'Floating molten wax blobs in song colors', category: 'Light & Fluid', surface: 'lava', backdrop: 'warm' },
  { id: 'nature', label: 'Growing Tree Roots', desc: 'Branching luminous tree roots growing organically', category: 'Nature & Weather', surface: 'nature', backdrop: 'forest' },
  { id: 'rain', label: 'Rain on Glass', desc: 'Window droplets, wet trails & soft bokeh', category: 'Nature & Weather', surface: 'thunder', backdrop: 'storm' },
  { id: 'synthwave', label: 'Synthwave', desc: 'Retro segmented sun & scrolling neon grid', category: 'Retro & Tech', surface: 'lava', backdrop: 'synth' },
  { id: 'eclipse', label: 'Solar Eclipse', desc: 'Dark lunar disc with blazing solar corona', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'nebula', label: 'Nebula', desc: 'Swirling deep-space cosmic gas & star clusters', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'aurora', label: 'Aurora Borealis', desc: 'Flowing Northern Lights curtains in the night sky', category: 'Nature & Weather', surface: 'undersea', backdrop: 'aurora' },
  { id: 'bioluminescent', label: 'Bioluminescent', desc: 'Glowing deep-sea jellyfish & luminous spores', category: 'Nature & Weather', surface: 'undersea', backdrop: 'ocean' },
  { id: 'snowfall', label: 'Snowfall', desc: 'Multi-depth drifting snowflakes & frost glow', category: 'Nature & Weather', surface: 'thunder', backdrop: 'snow' },
  { id: 'blackhole', label: 'Blackhole', desc: 'Event horizon, photon ring & accretion disk', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'ink', label: 'Ink in Water', desc: 'Billowing smoke-like color plumes blooming & curling', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'bokeh', label: 'Bokeh Lights', desc: 'Warm photographic out-of-focus lens orbs at depth', category: 'Light & Fluid', surface: 'lava', backdrop: 'warm' },
  { id: 'tunnel', label: 'Grid / Perspective Tunnel', desc: 'Infinite wireframe geometric tunnel flying forward', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'vinyl', label: 'Vinyl Groove Sheen', desc: 'Full-screen record grooves & spinning light sheen', category: 'Retro & Tech', surface: 'space', backdrop: 'space' },
  { id: 'oscilloscope', label: 'Oscilloscope / Waveform', desc: 'Crisp glowing audio waveform & frequency ring', category: 'Retro & Tech', surface: 'thunder', backdrop: 'space' },
  { id: 'vumeter', label: 'VU Meter / Spectrum Columns', desc: 'Giant vertical translucent ambient EQ pillars', category: 'Retro & Tech', surface: 'space', backdrop: 'space' },
  { id: 'kaleidoscope', label: 'Kaleidoscope / Stained Glass', desc: 'Rotating geometric facets with glowing borders', category: 'Geometric & Math', surface: 'lava', backdrop: 'space' },
  { id: 'voronoi', label: 'Voronoi / Cellular', desc: 'Interlocking organic cell membranes drifting & merging', category: 'Geometric & Math', surface: 'undersea', backdrop: 'space' },
  { id: 'crt', label: 'CRT / Scanlines & Aperture Grille', desc: 'Retro scanlines, RGB sub-pixel grille & vignette', category: 'Retro & Tech', surface: 'thunder', backdrop: 'storm' },
  { id: 'topographic', label: 'Topographic Contour', desc: 'Morphing elevation map lines glowing in accent color', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'laser', label: 'Laser Harp / Stage Beams', desc: 'Volumetric concert spotlights & crisscrossing laser planes', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'circuit', label: 'Cybernetic Circuitry / PCB Traces', desc: '45° glowing circuit pathways with zipping data pulses', category: 'Retro & Tech', surface: 'thunder', backdrop: 'storm' },
  { id: 'origami', label: 'Origami / Low-Poly Mesh', desc: '3D triangulated folded paper surface catching live light', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'thermal', label: 'Solarized Thermal / Infrared', desc: 'High-contrast thermal heat-map plumes in cover hues', category: 'Light & Fluid', surface: 'lava', backdrop: 'space' },
  { id: 'turing', label: 'Reaction-Diffusion (Turing)', desc: 'Organic coral & zebra maze patterns growing & morphing', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'moire', label: 'Moiré Interference', desc: 'Overlapping rotating rings creating optical wave patterns', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'halftone', label: 'ASCII / Halftone Matrix', desc: 'Glowing typographic characters & pulsing halftone dots', category: 'Retro & Tech', surface: 'thunder', backdrop: 'space' },
  { id: 'pixelsort', label: 'Pixel Sort / Glitch Melt', desc: 'Vertical melting color columns & digital tape glitches', category: 'Retro & Tech', surface: 'space', backdrop: 'space' },
  { id: 'caustics', label: 'Caustics (Refracted Pool Light)', desc: 'Bright razor-sharp swimming-pool light webs dancing', category: 'Light & Fluid', surface: 'undersea', backdrop: 'ocean' },
  { id: 'prism', label: 'Chromatic Prism / Dispersion', desc: 'Rotating glass crystal splitting CMY & accent light beams', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'ferrofluid', label: 'Ferrofluid Spikes', desc: 'Glossy metallic magnetic tendrils spiking on beats', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'oilslick', label: 'Oil Slick / Iridescence', desc: 'Swirling pearlescent thin-film bands over obsidian', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },

  // 51 New Themes
  { id: 'embers', label: 'Embers & Ash', desc: 'Floating glowing sparks drifting upward against charcoal', category: 'Nature & Weather', surface: 'lava', backdrop: 'warm' },
  { id: 'matrix', label: 'Digital Matrix / Code Rain', desc: 'Cascading vertical streams of glowing code & pulses', category: 'Retro & Tech', surface: 'nature', backdrop: 'space' },
  { id: 'starwarp', label: 'Starfield Warp', desc: '80s/90s stars streaking outward from the center', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'goldenhour', label: 'Golden Hour / Amber', desc: 'Warm terracotta, burnt orange & gold drifting light beams', category: 'Light & Fluid', surface: 'lava', backdrop: 'warm' },
  { id: 'sakura', label: 'Cherry Blossom (Sakura)', desc: 'Soft blush pink & magenta with drifting petal silhouettes', category: 'Nature & Weather', surface: 'lava', backdrop: 'warm' },
  { id: 'cyberpunk', label: 'Cyberpunk / Tokyo Neon', desc: 'Hot pink, electric cyan & acid yellow vertical bokeh streaks', category: 'Retro & Tech', surface: 'lava', backdrop: 'synth' },
  { id: 'cymatics', label: 'Bass Pulse / Cymatics', desc: 'Concentric geometric ripple rings expanding with low-end bass', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'lissajous', label: 'Lissajous Knots', desc: 'Interlocking glowing parametric light loops weaving smoothly', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'rosewindow', label: 'Stained Glass Rose Window', desc: 'Cathedral mandala shards illuminating in album colors', category: 'Geometric & Math', surface: 'lava', backdrop: 'space' },
  { id: 'chladni', label: 'Magnetic Sand / Chladni Plates', desc: 'Glowing grains vibrating into symmetrical standing waves', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'honeycomb', label: 'Hexagonal Honeycomb / Hive', desc: 'Reactive LED wall of glowing rippling hexagons', category: 'Geometric & Math', surface: 'thunder', backdrop: 'space' },
  { id: 'pendulum', label: 'Kinetic Pendulum Wave', desc: 'Staggered glowing orbs swinging into shifting sine illusions', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'mirror', label: 'Shattered Mirror / Glass Shards', desc: 'Floating triangular fragments reflecting palette slivers', category: 'Light & Fluid', surface: 'thunder', backdrop: 'storm' },
  { id: 'sonar', label: 'Sonar Radar Sweep', desc: 'Rotating radial beam sweeping range rings & glowing blips', category: 'Retro & Tech', surface: 'nature', backdrop: 'forest' },
  { id: 'silk', label: 'Silk Ribbon / Calligraphic Brush', desc: 'Flowing 3D ribbon strokes twisting with dramatic shading', category: 'Light & Fluid', surface: 'lava', backdrop: 'space' },
  { id: 'voxel', label: 'Isometric Voxel Cubes', desc: '3D extruded square pillars rising like a mechanical EQ floor', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'corona', label: 'Eclipse Corona Flares', desc: 'Dark void ringed by whipping fiery solar prominences', category: 'Space & Cosmic', surface: 'lava', backdrop: 'space' },
  { id: 'opart', label: 'Op-Art Hypnotic Spiral', desc: 'High-contrast bending black-and-color optical illusion stripes', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'mercury', label: 'Liquid Mercury Drops', desc: 'High-gloss chrome droplets orbiting & snapping together', category: 'Light & Fluid', surface: 'thunder', backdrop: 'storm' },
  { id: 'dna', label: 'DNA Double Helix', desc: 'Twin intertwined glowing strands & rungs rotating diagonally', category: 'Geometric & Math', surface: 'undersea', backdrop: 'space' },
  { id: 'shadowbox', label: 'Paper Cutout / Shadowbox', desc: 'Layered 3D parallax silhouettes backlit by glowing color bands', category: 'Light & Fluid', surface: 'lava', backdrop: 'space' },
  { id: 'julia', label: 'Fractal Julia Set', desc: 'Continuously morphing mathematical spirals in sharp color bands', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'fluted', label: 'Anamorphic Glass Cylinders', desc: 'Vertical fluted glass ribs refracting colors into crisp columns', category: 'Light & Fluid', surface: 'thunder', backdrop: 'space' },
  { id: 'boids', label: 'Boids Murmuration', desc: 'Geometric bird-like triangles flocking & swooping in formation', category: 'Nature & Weather', surface: 'space', backdrop: 'space' },
  { id: 'dither', label: 'Dithered 1-Bit / Game Boy', desc: 'Retro ordered-dither pixel waves in darkest & brightest tones', category: 'Retro & Tech', surface: 'nature', backdrop: 'forest' },
  { id: 'tesla', label: 'Tesla Plasma Globe', desc: 'Jagged high-voltage electric arcs branching from a central core', category: 'Space & Cosmic', surface: 'lava', backdrop: 'space' },
  { id: 'kinetictype', label: 'Kinetic Typography / Lyric Matrix', desc: 'Oversized ultra-thin song metadata drifting in columns', category: 'Retro & Tech', surface: 'space', backdrop: 'space' },
  { id: 'astrolabe', label: 'Gyroscope / Astrolabe Rings', desc: 'Interlocking metallic 3D rings rotating on intersecting axes', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'metashapes', label: 'Raymarched Metashapes', desc: 'Hard-edged 3D geometric primitives morphing in mid-air', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'kintsugi', label: 'Kintsugi Gold Cracks', desc: 'Matte obsidian fractured by pulsing metallic veins of light', category: 'Light & Fluid', surface: 'lava', backdrop: 'space' },
  { id: 'attractor', label: 'Bifurcation / Strange Attractor', desc: 'Glowing dust trails tracing chaotic 3D Lorenz orbits', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'blinds', label: 'Louvre / Venetian Blinds', desc: 'Crisp horizontal slats tilting open in waves of bright color', category: 'Light & Fluid', surface: 'thunder', backdrop: 'space' },
  { id: 'transit', label: 'Subway / Transit Map', desc: 'Color-coded 45°/90° transit lines with glowing traveling nodes', category: 'Retro & Tech', surface: 'space', backdrop: 'space' },
  { id: 'geode', label: 'Crystalline Geode', desc: 'Jagged inward-pointing crystal facets lining screen edges', category: 'Nature & Weather', surface: 'lava', backdrop: 'space' },
  { id: 'harmonograph', label: 'Pendulum Sand Trace (Harmonograph)', desc: 'Continuous glowing thread drawing decaying spirograph curves', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'chromemesh', label: 'Liquid Chrome Mesh', desc: 'Reflective 3D wireframe cloth billowing in invisible wind', category: 'Light & Fluid', surface: 'thunder', backdrop: 'storm' },
  { id: 'spirograph', label: 'Spirograph Gearwork', desc: 'Interlocking translucent gears tracing glowing hypotrochoids', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'flipdisc', label: 'Dot-Matrix Flip Discs', desc: 'Mechanical circular tiles flipping in sweeping color waves', category: 'Retro & Tech', surface: 'space', backdrop: 'space' },
  { id: 'fiber', label: 'Optical Fiber Bundle', desc: 'Curved hairline light strands swaying with glowing pulsing tips', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'brutalism', label: 'Architectural Brutalism / Shadow Cast', desc: 'Monolithic concrete blocks with sweeping directional sunbeams', category: 'Geometric & Math', surface: 'thunder', backdrop: 'storm' },
  { id: 'seismograph', label: 'Sound-Reactive Seismograph', desc: 'Stacked horizontal needle lines sketching live jagged peaks', category: 'Retro & Tech', surface: 'thunder', backdrop: 'space' },
  { id: 'filmstrip', label: 'Polaroid / Film Strip Frames', desc: 'Vintage analog cinema frames & sprocket holes scrolling vertically', category: 'Retro & Tech', surface: 'lava', backdrop: 'warm' },
  { id: 'blueprint', label: 'X-Ray / Blueprint Schematic', desc: 'White & cyan technical drafting grids, crosshairs & arcs', category: 'Retro & Tech', surface: 'undersea', backdrop: 'ocean' },
  { id: 'soapfilm', label: 'Soap Film Interference', desc: 'Swirling ultra-thin fluid bands with sharp spectral fringes', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'magfield', label: 'Magnetic Field Lines', desc: 'Symmetrical dipole loops with luminous dashes flowing pole-to-pole', category: 'Geometric & Math', surface: 'space', backdrop: 'space' },
  { id: 'terraces', label: 'Terraced Rice Fields / Step Pyramid', desc: 'Concentric stepped contour platforms rising with drop shadows', category: 'Geometric & Math', surface: 'nature', backdrop: 'forest' },
  { id: 'wormhole', label: 'Kaleidoscopic Tunnel / Wormhole', desc: 'Faceted mirrored polygon shaft rushing inward in cover colors', category: 'Space & Cosmic', surface: 'space', backdrop: 'space' },
  { id: 'lidar', label: 'Laser LiDAR Point Cloud', desc: 'Crisp depth-mapped 3D terrain point cloud colored by elevation', category: 'Retro & Tech', surface: 'undersea', backdrop: 'space' },
  { id: 'rorschach', label: 'Rorschach Inkblot', desc: 'Symmetrical high-contrast fluid shapes folding along center axis', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
  { id: 'neontube', label: 'Neon Tube Bending', desc: 'Continuous glowing glass neon tubes with realistic wall-glow spill', category: 'Light & Fluid', surface: 'lava', backdrop: 'synth' },
  { id: 'diffraction', label: 'Prism Diffraction Grating', desc: 'Diagonal rainbow-split light beams fanning from a bright focal point', category: 'Light & Fluid', surface: 'space', backdrop: 'space' },
];

export const VALID_UI_STYLES: UiStyleMode[] = THEME_CATALOG.map((t) => t.id);

export const THEME_BY_ID: Record<UiStyleMode, ThemeMeta> = THEME_CATALOG.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<UiStyleMode, ThemeMeta>);

export const THEME_CATEGORIES: ThemeCategory[] = [
  'Space & Cosmic',
  'Nature & Weather',
  'Light & Fluid',
  'Geometric & Math',
  'Retro & Tech',
];
