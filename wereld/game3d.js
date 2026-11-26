// Semi-3D weergave van dezelfde wereld.
// - Grond, gras, water, ravijn, decor, tutorialblokken en tekeningen zijn Blender-modellen (models/).
// - De lucht van elk level is een afbeelding uit Figma; de verre decorlagen (8-10) schuiven met parallax mee.
// - De camera kantelt niet: ze staat schuin boven/rechts en het beeld wordt teruggeschoven (off-axis).
// Tekenvolgorde: wit, achtergrond(en) van het level (vloeien in elkaar over), speelvlak, papierrand en Krabbel.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { vloeit, OVERVLOEI } from "./wereld.js";

const FOV = 40;
const Dc = 540 / Math.tan((FOV / 2) * Math.PI / 180); // afstand waarop 1 px op z=0 precies 1 scherm-px is
const OX = 300, OY = 300;   // vaste camerahoek: schuin rechts (OX) en boven (OY)
const VOORAF = 7680;        // zo breed is het witte stuk (start + tutorial)

export async function create({ canvas, wereld, delen, platen, spriteSize }) {
  const [SP_W, SP_H, FEET_X, FEET_Y] = spriteSize;
  const W = wereld.breedte, RAND = wereld.rand;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  const speel = new THREE.Scene(), boven = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 200, 90000);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const Y3 = (y) => 1080 - y; // Figma-y (omlaag) -> three-y (omhoog)
  const licht = (scene) => {
    scene.add(new THREE.AmbientLight(0xffffff, 2.5));
    const zon = new THREE.DirectionalLight(0xffffff, 1.1); zon.position.set(300, 800, 700); scene.add(zon);
  };
  licht(speel);

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

  // ------------------------------------------------------------ niets mag onder de papierrand door steken
  // (door de schuine kijkhoek schuiven blokken anders opzij). 1 = enkel rechts ervan tonen, 2 = enkel links
  const U = { uCam: { value: 0 }, uPlat: { value: 0 }, uBuf: { value: new THREE.Vector2(1, 1) }, uRand: { value: RAND + 20 } };
  function snij(mat, kant) {
    if (mat.userData.gesneden) return;
    mat.userData.gesneden = true;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "varying vec3 vWereld;\n" + sh.vertexShader.replace("#include <project_vertex>",
        "#include <project_vertex>\n vWereld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "varying vec3 vWereld;\nuniform float uCam, uPlat, uRand;\nuniform vec2 uBuf;\n" +
        sh.fragmentShader.replace("#include <dithering_fragment>", `
        { float x = mix(uCam + gl_FragCoord.x / uBuf.x * 1920.0, vWereld.x, uPlat);
          if (x ${kant === 1 ? "<" : ">="} uRand) discard; }
        #include <dithering_fragment>`);
    };
    mat.customProgramCacheKey = () => "snij-" + kant;
  }

  // ------------------------------------------------------------ modellen laden
  const lader = new GLTFLoader();
  // in de glb: 100 px = 1 m, X = x, Y = 1080 - y, voorkant = +Z -> dus gewoon 100x vergroten
  const laad = async (naam, mag) => {
    try { const m = await lader.loadAsync(`models/${naam}.glb`); m.scene.scale.setScalar(100); m.scene.updateMatrixWorld(true); return m.scene; }
    catch (e) { if (mag) return null; throw e; }
  };
  const [tutorial, gidsen] = await Promise.all([laad("voorgrond_levelfinal"), laad("gidsen_levelfinal")]);
  tutorial.traverse((o) => { if (o.isMesh) snij(o.material, 2); });
  speel.add(tutorial, gidsen);

  const bodems = [], achtergronden = [];
  for (const [k, deel] of delen.entries()) {
    const { nr, x: off, breedte, info } = deel;
    const [grond, gras, water, ravijn, decor] = await Promise.all(
      ["grond", "gras", "water", "ravijn", "decor"].map((n) => laad(`${n}_level${nr}`, n === "water" || n === "ravijn")));
    // de levels schuiven een beetje in elkaar: een haartje verschil in hoogte en diepte voorkomt geflikker
    const groep = new THREE.Group(); groep.position.set(off, (k % 2) * 0.4, (k % 2) * 0.7); speel.add(groep);
    // donkere bodem onder elk ravijn
    ravijn?.children.forEach((c) => {
      const box = new THREE.Box3().setFromObject(c);
      const bodem = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x - 4, 440), new THREE.MeshBasicMaterial({ color: 0x362419, toneMapped: false }));
      bodem.position.set((box.min.x + box.max.x) / 2, -214, box.min.z + 2);
      groep.add(bodem); bodems.push(bodem);
    });

    // achtergrond van dit level: een eigen scène met lucht en de verre decorlagen
    const scene = new THREE.Scene(); licht(scene);
    const img = new Image(); img.src = `assets/L${nr}/${info.backdrop.bestand}`; await img.decode();
    const b = info.backdrop, bdS = (Dc + 20000) / Dc;
    const lucht = { m: null, D: 0, baseX: 0 };
    // de lucht moet voor de decorlagen getekend worden: dus niet als doorzichtig vlak
    const alsLucht = (m) => { m.material.transparent = false; return m; };
    const backdrop = alsLucht(plane(scene, makeTex(img), 1920 * bdS * 4, 1080 * bdS * 4, 0, 540, -20000, -2));
    if (b.snelheid > 0) { // de lucht drijft heel traag mee (spiegelend herhaald)
      const w = b.breedte, r = b.snelheid, s = 1 / r, D = Dc * (s - 1);
      const mir = document.createElement("canvas"); mir.width = w * 2; mir.height = 1080;
      const g = mir.getContext("2d"); g.drawImage(img, 0, 0, w, 1080);
      g.save(); g.translate(w * 2, 0); g.scale(-1, 1); g.drawImage(img, 0, 0, w, 1080); g.restore();
      const tex = makeTex(mir); tex.wrapS = THREE.RepeatWrapping;
      const p = w * 2, PL = (info.frameOffset + 960) + s * (b.x0 - 960);
      const reik = OVERVLOEI + 960;
      const u0 = Math.floor((-960 + (960 - PL) / s - reik) / p) * p, u1 = Math.ceil((960 + (breedte - 960 - PL) / s + reik) / p) * p;
      tex.repeat.set((u1 - u0) / p, 1);
      lucht.D = D; lucht.baseX = off + PL + (s * (u0 + u1)) / 2;
      lucht.m = alsLucht(plane(scene, tex, (u1 - u0) * s, 1080 * s, lucht.baseX, 540, -D, -1));
    }

    // laag 8/9/10 staan in de glb op 120/260/420 px diepte; ze worden zo geschaald en verschoven dat ze
    // er uitzien zoals in het ontwerp en met 50/30/10 % van de camerasnelheid meeschuiven
    const ontwerp = { 8: { b: info.bg[2], d: 120 }, 9: { b: info.bg[1], d: 260 }, 10: { b: info.bg[0], d: 420 } };
    const knopen = [], lagen = [];
    decor.traverse((o) => { const m = /laag(\d+)$/.exec(o.name); if (m && !o.isMesh) knopen.push([o, +m[1]]); });
    const ver = new THREE.Group(); ver.position.x = off; ver.scale.setScalar(100); scene.add(ver);
    const fo = info.frameOffset;
    const cMin = -OVERVLOEI - 960, cMax = breedte + OVERVLOEI - 960;
    knopen.forEach(([knoop, laagNr]) => {
      const o = ontwerp[laagNr];
      if (!o) return; // laag 6 en 7 staan gewoon in de wereld
      const { b: bl, d } = o, r = bl.snelheid, w = bl.breedte, x0 = bl.x0 + fo;
      const s = (Dc + d) / Dc;
      const xMin = r * cMin + (1 - r) * fo, xMax = r * cMax + (1 - r) * fo + 1920;
      const k0 = Math.floor((xMin - 300 - x0) / w), k1 = Math.floor((xMax + 300 - x0) / w);
      const basis = new THREE.Group();
      [...knoop.children].forEach((c) => basis.add(c));
      for (let i = k0; i <= k1; i++) { // spiegelend herhalen zodat de laag het hele level dekt
        const kopie = i === 0 ? basis : basis.clone();
        const spiegel = Math.abs(i) % 2 === 1;
        kopie.scale.x = spiegel ? -1 : 1;
        kopie.position.x = (spiegel ? 2 * x0 + (i + 1) * w : i * w) / 100;
        knoop.add(kopie);
      }
      if (k0 > 0 || k1 < 0) knoop.remove(basis);
      knoop.scale.set(s, s, 1);
      ver.add(knoop);
      lagen.push({ knoop, r, s });
    });
    achtergronden.push({ scene, backdrop, lucht, lagen, off, breedte, fo });

    const vooraan = [grond, gras, water, ravijn, decor].filter(Boolean);
    if (k === 0) vooraan.forEach((m) => m.traverse((o) => { if (o.isMesh) snij(o.material, 1); }));
    vooraan.forEach((m) => groep.add(m));
  }

  function zetAchtergrond(a, cx, plat) {
    const lc = cx - a.off;
    a.lagen.forEach(({ knoop, r, s }) => {
      const c = plat ? a.fo : lc;
      const tx = c * (1 - s * r) - s * (1 - r) * a.fo - (960 + (plat ? 0 : OX)) * (s - 1);
      const ty = (540 + (plat ? 0 : OY)) * (1 - s);
      knoop.position.set(tx / 100, ty / 100, 0);
    });
    a.backdrop.position.x = plat ? a.off + a.breedte / 2 : cx + 960;
    a.backdrop.position.z = plat ? -600 : -20000; // in "hele wereld" vlak achter het decor, anders klopt de uitsnede niet
    const l = a.lucht;
    if (l.m) {
      l.m.position.y = plat ? 540 : 540 - OY * (l.D / Dc);
      l.m.position.x = plat ? l.baseX : l.baseX + OX * (l.D / Dc);
      l.m.position.z = plat ? -590 : -l.D;
    }
  }

  // ------------------------------------------------------------ logo, papierrand, Krabbel
  const logo = plane(speel, null, platen.logo[0].width, platen.logo[0].height,
    platen.logoPlek.x + platen.logo[0].width / 2, Y3(platen.logoPlek.y + platen.logo[0].height / 2), 0, 1);
  const logoTex = platen.logo.map(makeTex);
  logo.material.map = logoTex[0];
  plane(boven, makeTex(platen.rand), platen.rand.width, platen.rand.height,
    platen.randPlek.x + platen.rand.width / 2, Y3(platen.randPlek.y + platen.rand.height / 2), 0, 1);

  const sh = document.createElement("canvas"); sh.width = sh.height = 128;
  const sg = sh.getContext("2d"); const gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const shadow = plane(speel, new THREE.CanvasTexture(sh), 110, 60, 0, 0, 0, 3, true);
  shadow.rotation.x = -Math.PI / 2;
  let lastSprite = null;
  const spriteTex = new THREE.CanvasTexture(document.createElement("canvas"));
  spriteTex.colorSpace = THREE.SRGBColorSpace;
  // de Krabbel is de bovenste laag, met een eigen collageschaduw
  const krabbelSchaduw = plane(boven, spriteTex, SP_W, SP_H, 0, 0, 0, 2);
  krabbelSchaduw.material.color.set(0x000000); krabbelSchaduw.material.opacity = 0.2;
  const krabbel = plane(boven, spriteTex, SP_W, SP_H, 0, 0, 0, 3);

  // ------------------------------------------------------------ collageschaduw (zoals in Figma)
  // Elke scène gaat eerst naar een tussenbeeld met diepte. Daarna krijgt elke pixel schaduw als er iets
  // vlak boven hem dichter bij de camera ligt. Figma: Y 8 blur 20 zwart 28% + Y 3 blur 6 zwart 22%.
  const SCHADUW = { y1: 8, r1: 10, a1: 0.28, y2: 3, r2: 3, a2: 0.22 };
  const doel = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
  doel.depthTexture = new THREE.DepthTexture(16, 16);
  doel.depthTexture.type = THREE.UnsignedIntType;
  const mengMat = new THREE.ShaderMaterial({
    uniforms: {
      tKleur: { value: doel.texture }, tDiepte: { value: doel.depthTexture },
      grootte: { value: new THREE.Vector2(16, 16) }, schaal: { value: 1 }, dekking: { value: 1 },
      near: { value: camera.near }, far: { value: camera.far },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tKleur, tDiepte; uniform vec2 grootte; uniform float schaal, near, far, dekking;
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
        gl_FragColor *= dekking;
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
  orbit.maxDistance = 70000; orbit.minDistance = 600;
  camera.far = 90000;
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
  // een scène met collageschaduw bovenop het beeld leggen
  function laagje(scene, dekking, knippen) {
    renderer.clippingPlanes = knippen || [];
    renderer.setScissorTest(false);
    renderer.setRenderTarget(doel);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, camera);
    renderer.clippingPlanes = [];
    renderer.setRenderTarget(null);
    mengMat.uniforms.dekking.value = dekking;
    renderer.render(mengScene, mengCam);
  }

  function render(S, spriteCanvas, wiggle = 0) {
    resize();
    if (spriteCanvas !== lastSprite) { spriteTex.image = spriteCanvas; spriteTex.needsUpdate = true; lastSprite = spriteCanvas; }
    logo.material.map = logoTex[wiggle];
    krabbel.position.set(S.x, Y3(S.y - FEET_Y + SP_H / 2), S.diepte);
    krabbel.scale.x = S.face;
    krabbelSchaduw.position.set(krabbel.position.x + 3, krabbel.position.y - 7, S.diepte);
    krabbelSchaduw.scale.x = S.face;
    shadow.position.set(S.x, Y3(S.y) + 1.5, S.diepte);
    shadow.visible = S.onGround;
    const xc = S.cam.x + 960;
    const w = canvas.clientWidth || 1600, h = canvas.clientHeight || 900;

    if (!overview) {
      camera.position.set(xc + OX, 540 + OY, Dc);
      camera.quaternion.set(0, 0, 0, 1);
      const sc = h / 1080;
      camera.setViewOffset(w, h, -OX * sc, OY * sc, w, h);
    } else if (intro > 0) {
      intro -= 1 / 60;
      desiredLook.set(W / 2, 480, 0); desiredPos.set(W / 2 + 500, 3200, Math.min(34000, W * 0.9));
      pos.lerp(desiredPos, 0.07); look.lerp(desiredLook, 0.07);
      camera.position.copy(pos); orbit.target.copy(look); camera.lookAt(look);
    } else {
      orbit.update();
    }
    bodems.forEach((m) => { m.visible = !overview; }); // anders steekt de bodem onderaan uit

    renderer.getDrawingBufferSize(maat);
    if (doel.width !== maat.x || doel.height !== maat.y) { doel.setSize(maat.x, maat.y); mengMat.uniforms.grootte.value.copy(maat); }
    mengMat.uniforms.schaal.value = (maat.y / 1080) * (overview ? 0.35 : 1);
    U.uCam.value = S.cam.x; U.uPlat.value = overview ? 1 : 0; U.uBuf.value.copy(maat);

    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setClearColor(0xffffff, 1); renderer.clear(); // start en tutorial zijn wit
    // 1) achtergrond: in het gewone zicht het huidige level, met het volgende er geleidelijk overheen
    const teTekenen = [];
    if (overview) {
      achtergronden.forEach((a) => {
        const x0 = Math.max(a.off, VOORAF), x1 = a.off + a.breedte;
        teTekenen.push({ a, dekking: 1, knippen: [new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1)] });
      });
    } else if (S.cam.x + 1920 > VOORAF) {
      const { basis, volgende, mate } = vloeit(delen, xc);
      teTekenen.push({ a: achtergronden[basis], dekking: 1 });
      if (mate > 0) teTekenen.push({ a: achtergronden[volgende], dekking: mate });
    }
    const links = overview ? 0 : Math.max(0, ((VOORAF - S.cam.x) / 1920) * w); // de achtergrond begint aan de papierrand
    for (const { a, dekking, knippen } of teTekenen) {
      zetAchtergrond(a, S.cam.x, overview);
      renderer.clippingPlanes = knippen || [];
      renderer.setRenderTarget(doel);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0); renderer.clear();
      renderer.render(a.scene, camera);
      renderer.clippingPlanes = [];
      renderer.setRenderTarget(null);
      mengMat.uniforms.dekking.value = dekking;
      renderer.setScissor(links, 0, w - links, h); renderer.setScissorTest(true);
      renderer.render(mengScene, mengCam);
      renderer.setScissorTest(false);
    }
    // 2) speelvlak, 3) papierrand en Krabbel bovenop
    laagje(speel, 1);
    renderer.render(boven, camera);
  }

  look.set(990, 540, 0);
  resize();
  return { render, setOverview, resize, speel, camera, achtergronden };
}
