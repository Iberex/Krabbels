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

export async function create({ canvas, delen, W, grens, platen, spriteSize }) {
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

  // ------------------------------------------------------------ doorlopende wereld: achtergrond splitsen en inkleuren
  const samen = delen.length > 1;
  const wit = !!platen; // final_foreground: witte achtergrond zoals in Figma
  const U = { uCam: { value: 0 }, uFront: { value: 0 }, uPlat: { value: 0 }, uBuf: { value: new THREE.Vector2(1, 1) }, uGrens: { value: grens || 0 } };
  // lineair: het materiaal tekent naar het tussenbeeld (niet rechtstreeks naar het scherm)
  // snij: niets mag onder de papierrand door steken (door de schuine kijkhoek schuiven de blokken anders opzij)
  //       1 = enkel rechts van de rand tonen (level 1), 2 = enkel links ervan (tutorialblokken)
  function bewerk(mat, { kleur = false, lineair = true, snij = 0 }) {
    if ((!kleur && !snij) || mat.userData.bewerkt) return;
    mat.userData.bewerkt = true;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "varying vec3 vWereld;\n" + sh.vertexShader.replace("#include <project_vertex>",
        "#include <project_vertex>\n vWereld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      const code = `
        {
          // plaats van deze pixel op het speelvlak (z = 0). In "hele wereld": de kijklijn tot daar doortrekken
          vec3 vlak = cameraPosition + (vWereld - cameraPosition) * (cameraPosition.z / (cameraPosition.z - vWereld.z));
          float x = mix(uCam + gl_FragCoord.x / uBuf.x * 1920.0, vlak.x, uPlat);
          float y = mix(1080.0 - gl_FragCoord.y / uBuf.y * 1080.0, 1080.0 - vlak.y, uPlat);
          ${snij ? `if (x ${snij === 1 ? "<" : ">="} uGrens + 20.0) discard;` : ""}
          ${kleur ? `float kras = 30.0 * sin(y * 0.043) + 16.0 * sin(y * 0.151 + 1.3) + 9.0 * sin(y * 0.47 + 0.4) + (y - 540.0) * 0.12;
          if (x > max(uGrens, uFront + kras)) {
            vec3 c = gl_FragColor.rgb;
            ${lineair ? "c = pow(max(c, 0.0), vec3(1.0 / 2.2));" : ""}
            float g = 0.55 + 0.42 * pow(clamp(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 1.0), 0.75);
            gl_FragColor.rgb = vec3(${lineair ? "pow(g, 2.2)" : "g"});
          }` : ""}
        }
        #include <dithering_fragment>`;
      sh.fragmentShader = "varying vec3 vWereld;\nuniform float uCam, uFront, uPlat, uGrens;\nuniform vec2 uBuf;\n" +
        sh.fragmentShader.replace("#include <dithering_fragment>", code);
    };
    mat.customProgramCacheKey = () => `kleur-${kleur}-${lineair}-${snij}`;
  }

  const lader = new GLTFLoader();
  const bodems = [], lagen = [], luchten = [], backdrops = [];
  speel.add(new THREE.AmbientLight(0xffffff, 2.5));
  const zon = new THREE.DirectionalLight(0xffffff, 1.1);
  zon.position.set(300, 800, 700);
  speel.add(zon);

  for (const { IMG, level, nr: nummer, off, inkleuren, kaal } of delen) {

    // -------------------------------------------------------- backdrop (de lucht blijft een afbeelding)
    const bdS = (Dc + 20000) / Dc;
    if (!kaal) {
    const backdrop = plane(achter, makeTex(IMG.backdrop), 1920 * bdS * 4, 1080 * bdS * 4, 0, 540, -20000, level.backdrop.snelheid > 0 ? -1 : 0);
    backdrops.push(backdrop);
    if (level.backdrop.snelheid > 0) { // vanaf level 2 drijft de lucht heel traag mee (spiegelend herhaald)
      const b = level.backdrop, w = b.breedte, r = b.snelheid, s = 1 / r, D = Dc * (s - 1);
      const mir = document.createElement("canvas"); mir.width = w * 2; mir.height = 1080;
      const g = mir.getContext("2d"); g.drawImage(IMG.backdrop, 0, 0, w, 1080);
      g.save(); g.translate(w * 2, 0); g.scale(-1, 1); g.drawImage(IMG.backdrop, 0, 0, w, 1080); g.restore();
      const tex = makeTex(mir); tex.wrapS = THREE.RepeatWrapping;
      const p = w * 2, PL = (level.frameOffset + 960) + s * (b.x0 - 960);
      const u0 = Math.floor((-960 + (960 - PL) / s - 300) / p) * p, u1 = Math.ceil((960 + (level.breedte - 960 - PL) / s + 300) / p) * p;
      tex.repeat.set((u1 - u0) / p, 1);
      const baseX = off + PL + (s * (u0 + u1)) / 2;
      const m = plane(achter, tex, (u1 - u0) * s, 1080 * s, baseX, 540, -D, 1);
      luchten.push({ m, D, baseX });
    }
    }

    // -------------------------------------------------------- alle modellen uit Blender
    // in de glb: 100 px = 1 m, X = wereld-x, Y = 1080 - y, voorkant = +Z -> dus gewoon 100x vergroten
    const namen = level.modellen || ["grond", "gras", "water", "ravijn", "decor"]; // tutorial: voorgrond + decor
    const modellen = await Promise.all(namen.map((n) => lader.loadAsync(`models/${n}_level${nummer}.glb`)
      .catch((e) => { if (n === "water" || n === "ravijn") return null; throw e; }))); // niet elk level heeft water of een ravijn
    const model = Object.fromEntries(namen.map((n, i) => [n, modellen[i]]));
    const groep = new THREE.Group(); groep.position.x = off; speel.add(groep);
    modellen.forEach((m) => { if (m) { m.scene.scale.setScalar(100); m.scene.updateMatrixWorld(true); } });
    // donkere bodem onder elk ravijn, zodat de lucht er niet doorschemert
    if (model.ravijn) {
      model.ravijn.scene.children.forEach((c) => {
        const box = new THREE.Box3().setFromObject(c);
        const bodem = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x - 4, 440), new THREE.MeshBasicMaterial({ color: 0x362419, toneMapped: false }));
        bodem.position.set((box.min.x + box.max.x) / 2, -214, box.min.z + 2);
        bewerk(bodem.material, { kleur: inkleuren });
        groep.add(bodem); bodems.push(bodem);
      });
    }
    modellen.forEach((m) => { if (m) groep.add(m.scene); });

    // -------------------------------------------------------- parallax voor de verre decorlagen
    // laag 8/9/10 staan in de glb op 120/260/420 px diepte; ze worden zo geschaald en verschoven dat ze
    // er uitzien zoals in het ontwerp en met 50/30/10 % van de camerasnelheid meeschuiven.
    const ontwerp = kaal ? {} : { 8: { b: level.bg[2], d: 120 }, 9: { b: level.bg[1], d: 260 }, 10: { b: level.bg[0], d: 420 } };
    const knopen = [];
    model.decor?.scene.traverse((o) => { const m = /laag(\d+)$/.exec(o.name); if (m && !o.isMesh) knopen.push([o, +m[1]]); });
    const fo = level.frameOffset;
    const cMin = level.camMin;
    const cMax = Math.max(cMin, W - 1920);
    knopen.forEach(([knoop, nr]) => {
      const info = ontwerp[nr];
      if (!info) return; // laag 6 en 7 staan gewoon in de wereld
      const { b, d } = info, r = b.snelheid, w = b.breedte, x0 = b.x0 + fo;
      const s = (Dc + d) / Dc;
      // spiegelend herhalen zodat de laag het hele level dekt
      const xMin = r * cMin + (1 - r) * fo, xMax = r * cMax + (1 - r) * fo + 1920;
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
      lagen.push({ knoop, r, s, off, fo });
    });
    // alles wat niet verschuift (grond, gras, voorgronddecor) inkleuren
    modellen.forEach((m, i) => {
      const snij = !wit ? 0 : off > 0 ? 1 : namen[i] === "voorgrond" ? 2 : 0;
      const kleur = inkleuren || (wit && namen[i] === "gidsen" && delen.some((d) => d.inkleuren));
      if (m && (kleur || snij)) m.scene.traverse((o) => { if (o.isMesh) bewerk(o.material, { kleur, snij }); });
    });
  }
  // Na het speelvlak wordt nog een laag getekend die altijd bovenop ligt: de papierrand en daarboven de Krabbel.
  const boven = new THREE.Scene();

  // -------------------------------------------------------- platte stukken uit Figma: logo en papierrand
  // Ze liggen op het speelvlak (z = 0) en vallen zo exact samen met het ontwerp. Hun schaduw zit al in de PNG.
  let logo = null;
  if (platen) {
    const plaat = (scene, img, x, y, order) =>
      plane(scene, makeTex(img), img.width, img.height, x + img.width / 2, Y3(y + img.height / 2), 0, order);
    plaat(boven, platen.rand, platen.randPlek.x, platen.randPlek.y, 1);
    const m = plaat(speel, platen.logo[0], platen.logoPlek.x, platen.logoPlek.y, 1);
    logo = { m, tex: platen.logo.map(makeTex) };
  }
  const zetLagen = (cx, plat) => lagen.forEach(({ knoop, r, s, off, fo }) => {
    const c = plat ? fo : cx - off;
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
  // de Krabbel is de bovenste laag (karakters boven tekenlijnen, ankers en decor), met een eigen collageschaduw
  const krabbelSchaduw = plane(boven, spriteTex, SP_W, SP_H, 0, 0, 16, 2);
  krabbelSchaduw.material.color.set(0x000000); krabbelSchaduw.material.opacity = 0.2;
  const krabbel = plane(boven, spriteTex, SP_W, SP_H, 0, 0, 16, 3);

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

  function render(S, dt, spriteCanvas, wiggle = 0) {
    resize();
    if (logo) logo.m.material.map = logo.tex[wiggle];
    if (spriteCanvas !== lastSprite) { spriteTex.image = spriteCanvas; spriteTex.needsUpdate = true; lastSprite = spriteCanvas; }
    krabbel.position.set(S.x, Y3(S.y - FEET_Y + SP_H / 2), S.diepte);
    krabbel.scale.x = S.face;
    krabbelSchaduw.position.set(krabbel.position.x + 3, krabbel.position.y - 7, S.diepte);
    krabbelSchaduw.scale.x = S.face;
    shadow.position.set(S.x, Y3(S.y) + 1.5, S.diepte);
    shadow.visible = S.onGround;
    const xc = S.cam.x + 960;
    backdrops.forEach((m) => { m.position.x = overview ? W / 2 : xc; });

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
    luchten.forEach((l) => {
      l.m.position.y = overview ? 540 : 540 - OY * (l.D / Dc);
      l.m.position.x = overview ? l.baseX : l.baseX + OX * (l.D / Dc);
    });
    renderer.getDrawingBufferSize(maat);
    if (doel.width !== maat.x || doel.height !== maat.y) { doel.setSize(maat.x, maat.y); mengMat.uniforms.grootte.value.copy(maat); }
    U.uCam.value = S.cam.x; U.uFront.value = S.front; U.uPlat.value = overview ? 1 : 0; U.uBuf.value.copy(maat);
    mengMat.uniforms.schaal.value = (maat.y / 1080) * (overview ? 0.35 : 1);
    // 1) lucht rechtstreeks, 2) speelvlak naar het tussenbeeld, 3) samenvoegen met schaduw
    renderer.setRenderTarget(null);
    renderer.setClearColor(wit ? 0xffffff : 0x1b1b22, 1); renderer.clear();
    renderer.render(achter, camera);
    renderer.setRenderTarget(doel);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(speel, camera);
    renderer.setRenderTarget(null);
    renderer.render(mengScene, mengCam);
    renderer.render(boven, camera);
  }

  look.set(990, 540, 0);
  resize();
  return { render, setOverview, resize, achter, speel, camera, lagen };
}
