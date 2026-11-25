// Semi-3D weergave van dezelfde wereld.
// - Grond, gras, water, ravijn en decor zijn de Blender-modellen (models/*_levelN.glb).
// - Alleen de lucht is nog een afbeelding uit Figma.
// - De camera kantelt niet: ze staat schuin boven/rechts en het beeld wordt teruggeschoven (off-axis),
//   zodat alle lagen rechthoekig blijven en op elkaar aansluiten.
// Getekend in twee passen: eerst de achtergrond, dan het speelvlak met echte diepte.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const FOV = 40;
const Dc = 540 / Math.tan((FOV / 2) * Math.PI / 180); // afstand waarop 1 px op z=0 precies 1 scherm-px is
const OX = 300, OY = 300;   // vaste camerahoek: schuin rechts (OX) en boven (OY)
const HALF = 43;            // halve diepte van de platformen in de Blender-modellen (px)

export async function create({ canvas, IMG, level, nummer, W, spriteSize }) {
  const [SP_W, SP_H, FEET_X, FEET_Y] = spriteSize;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x1b1b22);
  renderer.autoClear = false;
  const achter = new THREE.Scene(), speel = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 200, 90000);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const Y3 = (y) => 1080 - y; // Figma-y (omlaag) -> three-y (omhoog)

  const makeTex = (src) => {
    const t = new THREE.Texture(src);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso); t.needsUpdate = true; return t;
  };
  const plane = (scene, tex, w, h, x, y, z, order, diepte = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: diepte, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    m.position.set(x, y, z); m.renderOrder = order; scene.add(m); return m;
  };

  // ------------------------------------------------------------ backdrop (de lucht blijft een afbeelding)
  const bdS = (Dc + 20000) / Dc;
  const backdrop = plane(achter, makeTex(IMG.backdrop), 1920 * bdS * 4, 1080 * bdS * 4, 0, 540, -20000, level.backdrop.snelheid > 0 ? -1 : 0);
  let luchtLaag = null;
  if (level.backdrop.snelheid > 0) { // vanaf level 2 drijft de lucht heel traag mee (spiegelend herhaald)
    const b = level.backdrop, w = b.breedte, r = b.snelheid, s = 1 / r, D = Dc * (s - 1);
    const mir = document.createElement("canvas"); mir.width = w * 2; mir.height = 1080;
    const g = mir.getContext("2d"); g.drawImage(IMG.backdrop, 0, 0, w, 1080);
    g.save(); g.translate(w * 2, 0); g.scale(-1, 1); g.drawImage(IMG.backdrop, 0, 0, w, 1080); g.restore();
    const tex = makeTex(mir); tex.wrapS = THREE.RepeatWrapping;
    const p = w * 2, PL = (level.frameOffset + 960) + s * (b.x0 - 960);
    const u0 = Math.floor((-960 + (960 - PL) / s - 300) / p) * p, u1 = Math.ceil((960 + (W - 960 - PL) / s + 300) / p) * p;
    tex.repeat.set((u1 - u0) / p, 1);
    const baseX = PL + (s * (u0 + u1)) / 2;
    luchtLaag = { m: plane(achter, tex, (u1 - u0) * s, 1080 * s, baseX, 540, -D, 1), D, baseX };
  }

  // ------------------------------------------------------------ alle modellen uit Blender
  // in de glb: 100 px = 1 m, X = wereld-x, Y = 1080 - y, voorkant = +Z -> dus gewoon 100x vergroten
  const lader = new GLTFLoader();
  const namen = ["grond", "gras", "water", "ravijn", "decor"];
  const modellen = await Promise.all(namen.map((n) => lader.loadAsync(`models/${n}_level${nummer}.glb`)
    .catch((e) => { if (n === "water" || n === "ravijn") return null; throw e; }))); // niet elk level heeft water of een ravijn
  modellen.forEach((m) => { if (m) { m.scene.scale.setScalar(100); speel.add(m.scene); } });
  // donkere bodem onder elk ravijn, zodat de lucht er niet doorschemert
  const bodems = [];
  if (modellen[3]) {
    modellen[3].scene.updateMatrixWorld(true);
    modellen[3].scene.children.forEach((c) => {
      const box = new THREE.Box3().setFromObject(c);
      const bodem = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x - 4, 440), new THREE.MeshBasicMaterial({ color: 0x362419, toneMapped: false }));
      bodem.position.set((box.min.x + box.max.x) / 2, -214, box.min.z + 2);
      speel.add(bodem); bodems.push(bodem);
    });
  }
  speel.add(new THREE.AmbientLight(0xffffff, 2.5));
  const zon = new THREE.DirectionalLight(0xffffff, 1.1);
  zon.position.set(300, 800, 700);
  speel.add(zon);

  // ------------------------------------------------------------ parallax voor de verre decorlagen
  // laag 8/9/10 staan in de glb op 120/260/420 px diepte; ze worden zo geschaald en verschoven dat ze
  // er uitzien zoals in het ontwerp en met 50/30/10 % van de camerasnelheid meeschuiven.
  const ontwerp = { 8: { b: level.bg[2], d: 120 }, 9: { b: level.bg[1], d: 260 }, 10: { b: level.bg[0], d: 420 } };
  const lagen = [];
  const knopen = [];
  modellen[4].scene.traverse((o) => { const m = /laag(\d+)$/.exec(o.name); if (m && !o.isMesh) knopen.push([o, +m[1]]); });
  const fo = level.frameOffset;
  knopen.forEach(([knoop, nr]) => {
    const info = ontwerp[nr];
    if (!info) return; // laag 6 en 7 staan gewoon in de wereld
    const { b, d } = info, r = b.snelheid, w = b.breedte, x0 = b.x0 + fo;
    const s = (Dc + d) / Dc;
    // spiegelend herhalen zodat de laag het hele level dekt
    const xMin = r * level.camMin + (1 - r) * fo, xMax = r * Math.max(level.camMin, W - 1920) + (1 - r) * fo + 1920;
    const k0 = Math.floor((xMin - 300 - x0) / w), k1 = Math.floor((xMax + 300 - x0) / w);
    const inhoud = [...knoop.children];
    const basis = new THREE.Group();
    inhoud.forEach((c) => basis.add(c));
    for (let k = k0; k <= k1; k++) {
      const kopie = k === 0 ? basis : basis.clone();
      const spiegel = Math.abs(k) % 2 === 1;
      kopie.scale.x = spiegel ? -1 : 1;
      kopie.position.x = (spiegel ? 2 * x0 + (k + 1) * w : k * w) / 100;
      knoop.add(kopie);
    }
    if (k0 > 0 || k1 < 0) knoop.remove(basis);
    knoop.scale.set(s, s, 1);
    lagen.push({ knoop, r, s });
  });
  const zetLagen = (cx, plat) => lagen.forEach(({ knoop, r, s }) => {
    const c = plat ? fo : cx;
    const tx = c * (1 - s * r) - s * (1 - r) * fo - (960 + (plat ? 0 : OX)) * (s - 1);
    const ty = (540 + (plat ? 0 : OY)) * (1 - s);
    knoop.position.set(tx / 100, ty / 100, 0);
  });

  // ------------------------------------------------------------ Krabbel + schaduw op het gras
  const sh = document.createElement("canvas"); sh.width = sh.height = 128;
  const sg = sh.getContext("2d"); const gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const shadow = plane(speel, new THREE.CanvasTexture(sh), 110, 60, 0, 0, 0, 3, true);
  shadow.rotation.x = -Math.PI / 2;
  let lastSprite = null;
  const spriteTex = new THREE.CanvasTexture(document.createElement("canvas"));
  spriteTex.colorSpace = THREE.SRGBColorSpace;
  const krabbel = plane(speel, spriteTex, SP_W, SP_H, 0, 0, 4, 4, true);
  krabbel.material.depthWrite = true; krabbel.material.alphaTest = 0.5;

  // ------------------------------------------------------------ collageschaduw (zoals in Figma)
  // Het speelvlak gaat eerst naar een tussenbeeld met diepte. Daarna krijgt elke pixel schaduw als er iets
  // vlak boven hem dichter bij de camera ligt. Figma: Y 8 blur 20 zwart 28% + Y 3 blur 6 zwart 22%.
  const SCHADUW = { y1: 8, r1: 10, a1: 0.28, y2: 3, r2: 3, a2: 0.22 };
  const doel = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
  doel.depthTexture = new THREE.DepthTexture(16, 16);
  doel.depthTexture.type = THREE.UnsignedIntType;
  const mengMat = new THREE.ShaderMaterial({
    uniforms: {
      tKleur: { value: doel.texture }, tDiepte: { value: doel.depthTexture },
      grootte: { value: new THREE.Vector2(16, 16) }, schaal: { value: 1 },
      near: { value: camera.near }, far: { value: camera.far },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tKleur, tDiepte; uniform vec2 grootte; uniform float schaal, near, far;
      varying vec2 vUv;
      float afstand(vec2 uv){ float d = texture2D(tDiepte, uv).x; return (near * far) / (far - d * (far - near)); }
      // deel van de schijf (boven deze pixel) dat dichter bij de camera ligt
      float bedekt(float mij, float omhoog, float straal, float draai){
        float som = 0.0;
        for (int i = 0; i < 14; i++) {
          float r = sqrt((float(i) + 0.5) / 14.0) * straal;
          float h = float(i) * 2.39996 + draai;
          vec2 uv = vUv + (vec2(cos(h), sin(h)) * r + vec2(0.0, omhoog)) * schaal / grootte;
          som += step(afstand(uv), mij - max(2.5, mij * 0.0012));
        }
        return som / 14.0;
      }
      void main(){
        vec4 kleur = texture2D(tKleur, vUv);
        float mij = afstand(vUv);
        float draai = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
        float s1 = bedekt(mij, ${SCHADUW.y1.toFixed(1)}, ${SCHADUW.r1.toFixed(1)}, draai) * ${SCHADUW.a1};
        float s2 = bedekt(mij, ${SCHADUW.y2.toFixed(1)}, ${SCHADUW.r2.toFixed(1)}, draai) * ${SCHADUW.a2};
        float s = 1.0 - (1.0 - s1) * (1.0 - s2);
        gl_FragColor = vec4(kleur.rgb * (1.0 - s), 1.0 - (1.0 - kleur.a) * (1.0 - s));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mengScene = new THREE.Scene(), mengCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mengScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mengMat));
  const maat = new THREE.Vector2();

  // ------------------------------------------------------------ camera
  const orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false; orbit.enableDamping = true; orbit.dampingFactor = 0.08;
  orbit.maxDistance = 30000; orbit.minDistance = 600;
  let overview = false, intro = 0;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const desiredPos = new THREE.Vector3(), desiredLook = new THREE.Vector3();

  function setOverview(v) {
    overview = v; orbit.enabled = v; intro = v ? 1.1 : 0;
    if (v) { camera.clearViewOffset(); pos.copy(camera.position); orbit.target.set(W / 2, 480, 0); }
    else { camera.quaternion.set(0, 0, 0, 1); }
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }

  function render(S, dt, spriteCanvas) {
    resize();
    if (spriteCanvas !== lastSprite) { spriteTex.image = spriteCanvas; spriteTex.needsUpdate = true; lastSprite = spriteCanvas; }
    krabbel.position.set(S.x, Y3(S.y - FEET_Y + SP_H / 2), 16);
    krabbel.scale.x = S.face;
    shadow.position.set(S.x, Y3(S.y) + 1.5, 16);
    shadow.visible = S.onGround;
    const xc = S.cam.x + 960;
    backdrop.position.x = overview ? W / 2 : xc;

    if (!overview) {
      camera.position.set(xc + OX, 540 + OY, Dc);
      camera.quaternion.set(0, 0, 0, 1);
      const w = canvas.clientWidth || 1600, h = canvas.clientHeight || 900, sc = h / 1080;
      camera.setViewOffset(w, h, -OX * sc, OY * sc, w, h);
    } else if (intro > 0) {
      intro -= dt;
      desiredLook.set(W / 2, 480, 0); desiredPos.set(W / 2 + 500, 1200, Math.min(8800, W * 0.92 + 600));
      const k = 1 - Math.exp(-dt * 4);
      pos.lerp(desiredPos, k); look.lerp(desiredLook, k);
      camera.position.copy(pos); orbit.target.copy(look); camera.lookAt(look);
    } else {
      orbit.update();
    }
    bodems.forEach((m) => { m.visible = !overview; }); // anders steekt de bodem onderaan uit
    // verre lagen: parallax en uitlijning
    zetLagen(S.cam.x, overview);
    if (luchtLaag) {
      luchtLaag.m.position.y = overview ? 540 : 540 - OY * (luchtLaag.D / Dc);
      luchtLaag.m.position.x = overview ? luchtLaag.baseX : luchtLaag.baseX + OX * (luchtLaag.D / Dc);
    }
    renderer.getDrawingBufferSize(maat);
    if (doel.width !== maat.x || doel.height !== maat.y) { doel.setSize(maat.x, maat.y); mengMat.uniforms.grootte.value.copy(maat); }
    mengMat.uniforms.schaal.value = (maat.y / 1080) * (overview ? 0.35 : 1);
    // 1) lucht rechtstreeks, 2) speelvlak naar het tussenbeeld, 3) samenvoegen met schaduw
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x1b1b22, 1); renderer.clear();
    renderer.render(achter, camera);
    renderer.setRenderTarget(doel);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(speel, camera);
    renderer.setRenderTarget(null);
    renderer.render(mengScene, mengCam);
  }

  look.set(990, 540, 0);
  resize();
  return { render, setOverview, resize, achter, speel, camera, lagen };
}
