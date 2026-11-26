// Semi-3D weergave van dezelfde wereld.
// - Grond, gras, water, ravijn, decor, tutorialblokken en tekeningen zijn Blender-modellen (models/).
// - Start en tutorial: een grijs beeld per scherm. Levels: per scherm een lucht en drie lagen die tijdens het
//   doorschuiven van de camera na elkaar aankomen (zie wereld.js).
// - De camera kantelt niet: ze staat schuin boven/rechts en het beeld wordt teruggeschoven (off-axis).
// Tekenvolgorde: achtergrond, speelvlak (met collageschaduw), papierrand en Krabbel.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LEVELS_VANAF, AANTAL, schermX, luchtStand, LAGEN, BLOKKEN, blokX } from "./wereld.js";

const FOV = 40;
const Dc = 540 / Math.tan((FOV / 2) * Math.PI / 180); // afstand waarop 1 px op z=0 precies 1 scherm-px is
const OX = 300, OY = 300;   // vaste camerahoek: schuin rechts (OX) en boven (OY)

export async function create({ canvas, wereld, platen, spriteSize }) {
  const [SP_W, SP_H, FEET_X, FEET_Y] = spriteSize;
  const W = wereld.breedte, RAND = wereld.rand;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  const achtergrond = new THREE.Scene(), verte = new THREE.Scene(), speel = new THREE.Scene(), boven = new THREE.Scene();
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

  // de levels: grond, gras, water, ravijnen en het voorgronddecor (laag 6 en 7: rotsjes, potloden, deur)
  const [grond, gras, water, ravijn, decor] = await Promise.all(["grond", "gras", "water", "ravijn", "decor"].map((n) => laad(`${n}_level1`)));
  decor.traverse((o) => { if (/laag(8|9|10)$/.test(o.name) && !o.isMesh) o.visible = false; }); // de achtergrond komt uit Figma
  // -------------------------------------------------------- eindscherm: opgebouwd uit de modellen van de levels
  const eind = { achter: new THREE.Scene(), speel: new THREE.Scene() };
  licht(eind.speel);
  plane(eind.achter, makeTex(platen.eindAchter), 1920, 1080, 960, 540, 0, 0).material.transparent = false;
  const doos = (o) => new THREE.Box3().setFromObject(o);
  const zoek = (model, links, breed) => model.children.find((c) => { const b = doos(c); return Math.abs(b.min.x - links) < 45 && Math.abs(b.max.x - b.min.x - breed) < 70; });
  // een kopie van een levelonderdeel, verschoven (dx, dy omhoog) en eventueel minder diep
  // zak: bij een opgetild platform de donkere onderband van de aarde mee terug naar beneden trekken
  function kopieer(obj, dx, dy, diep = 1, zak = false) {
    if (!obj) return;
    const houder = new THREE.Group(); houder.scale.set(100, 100, 100 * diep); houder.position.set(dx, dy, 0);
    const c = obj.clone();
    new THREE.Matrix4().makeScale(0.01, 0.01, 0.01).multiply(obj.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    c.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (!zak) return;
      o.geometry = o.geometry.clone();
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.85) p.setY(i, p.getY(i) - 4); // in modeleenheden (100 px = 1)
    });
    houder.add(c); eind.speel.add(houder);
  }
  const gras600 = zoek(gras, 0, 600), gras1920 = zoek(gras, 900, 1920);
  const grond540 = zoek(grond, 30, 540), grond1860 = zoek(grond, 930, 1860);
  // [grasmodel, grondmodel, dx, dy omhoog, diepte]: hogere platformen zijn minder diep
  for (const [g1, g2, dx, dy, diep] of [
    [gras600, grond540, -30, -64, 1], [gras1920, grond1860, -30, -64, 1],        // onderaan links en rechts
    [gras1920, grond1860, -2026, 293, 0.55], [gras1920, grond1860, 170, 176, 0.65], // linksboven en rechts midden
  ]) { kopieer(g1, dx, dy, diep); kopieer(g2, dx, dy, diep, dy > 0); }
  kopieer(zoek(water, 570, 360), -30, -64);
  let deur = null;
  decor.traverse((o) => { if (!deur && /deur/i.test(o.name)) deur = o; });
  if (deur) { const b = doos(deur); kopieer(deur, 60 - b.min.x, 1080 - 442 - b.min.y); }
  const eindGidsen = await laad("gidsen_leveleind");
  eind.speel.add(eindGidsen);

  const levels = new THREE.Group(); levels.position.x = wereld.start; speel.add(levels);
  // donkere bodem onder elk ravijn
  const bodems = [];
  ravijn.children.forEach((c) => {
    const box = new THREE.Box3().setFromObject(c);
    const bodem = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x - 4, 440), new THREE.MeshBasicMaterial({ color: 0x362419, toneMapped: false }));
    bodem.position.set((box.min.x + box.max.x) / 2, -214, box.min.z + 2);
    levels.add(bodem); bodems.push(bodem);
  });
  for (const m of [grond, gras, water, ravijn, decor]) {
    m.traverse((o) => { if (o.isMesh) snij(o.material, 1); });
    levels.add(m);
  }

  // start en tutorial: grijs papier per scherm
  platen.achtergronden.forEach((img, i) => {
    const m = plane(achtergrond, makeTex(img), wereld.scherm + 1, 1080, i * wereld.scherm + wereld.scherm / 2, 540, 0, 0);
    m.material.transparent = false;
  });
  // grijze blokken achter de tutorial, met parallax (de camera volgt hier de Krabbel)
  const tut = BLOKKEN.map((b, i) => plane(achtergrond, makeTex(platen.tut[i]), platen.tut[i].width, 1080, 0, 540 - b.y, 0, 1 + i));
  // levels: per scherm een lucht en drie lagen. De schaduwen zitten al in de beelden uit Figma, dus ze liggen op
  // z = 0 en worden per beeld op hun plaats geschoven.
  const perScherm = (naam, order) => platen[naam].map((img) => plane(verte, makeTex(img), 1920, 1080, 0, 540, 0, order));
  const luchten = perScherm("lucht", 0);
  const lagen = LAGEN.map((naam, i) => ({ naam, m: perScherm(naam, i + 2) }));
  function zetVerte(cam, heel) {
    const { onder, mate } = luchtStand(cam.lucht);
    luchten.forEach((m, k) => {
      m.visible = heel || k === onder || (k === onder + 1 && mate > 0.001);
      m.renderOrder = k === onder + 1 ? 1 : 0;
      m.material.opacity = !heel && k === onder + 1 ? mate : 1;
      m.position.x = (heel ? schermX(k) : cam.x) + 960;
    });
    lagen.forEach(({ naam, m }) => m.forEach((p, k) => {
      const sx = heel ? 0 : schermX(k) - cam[naam];       // plek op het scherm
      p.visible = heel || (sx < 1920 && sx + 1920 > 0);
      p.position.x = (heel ? schermX(k) : cam.x + sx) + 960;
    }));
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
  function render(S, spriteCanvas, wiggle = 0) {
    resize();
    if (spriteCanvas !== lastSprite) { spriteTex.image = spriteCanvas; spriteTex.needsUpdate = true; lastSprite = spriteCanvas; }
    logo.material.map = logoTex[wiggle];
    krabbel.position.set(S.x, Y3(S.y - FEET_Y + SP_H / 2), S.diepte);
    const klein = S.deur ? Math.max(0.25, 1 - S.deur) : 1; // door de deur naar binnen
    krabbel.scale.set(S.face * klein, klein, 1);
    krabbelSchaduw.position.set(krabbel.position.x + 3, krabbel.position.y - 7, S.diepte);
    krabbelSchaduw.scale.set(S.face * klein, klein, 1);
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

    if (S.eind) { // vast scherm: camera in het midden
      const w = canvas.clientWidth || 1600, h = canvas.clientHeight || 900, sc = h / 1080;
      camera.position.set(960 + OX, 540 + OY, Dc); camera.quaternion.set(0, 0, 0, 1);
      camera.setViewOffset(w, h, -OX * sc, OY * sc, w, h);
    }
    renderer.getDrawingBufferSize(maat);
    if (doel.width !== maat.x || doel.height !== maat.y) { doel.setSize(maat.x, maat.y); mengMat.uniforms.grootte.value.copy(maat); }
    mengMat.uniforms.schaal.value = (maat.y / 1080) * (overview ? 0.35 : 1);
    U.uCam.value = S.cam.x; U.uPlat.value = overview ? 1 : 0; U.uBuf.value.copy(maat);

    // 1) achtergrond rechtstreeks, 2) speelvlak naar het tussenbeeld en met schaduw erbovenop, 3) papierrand en Krabbel
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xffffff, 1); renderer.clear();
    BLOKKEN.forEach((b, i) => { tut[i].position.x = (overview ? b.x : blokX(b, S.cam.x)) + platen.tut[i].width / 2; });
    if (S.eind) {
      renderer.render(eind.achter, camera);
      renderer.setRenderTarget(doel);
      renderer.setClearColor(0x000000, 0); renderer.clear();
      renderer.render(eind.speel, camera);
      renderer.setRenderTarget(null);
      renderer.render(mengScene, mengCam);
      renderer.render(boven, camera);
      return;
    }
    renderer.render(achtergrond, camera);
    zetVerte(S.cam, overview);
    if (overview) renderer.render(verte, camera);
    else if (S.cam.x + 1920 > LEVELS_VANAF) { // enkel rechts van de papierrand
      const links = Math.max(0, ((LEVELS_VANAF - S.cam.x) / 1920) * w);
      renderer.setScissor(links, 0, w - links, h); renderer.setScissorTest(true);
      renderer.render(verte, camera);
      renderer.setScissorTest(false);
    }
    renderer.setRenderTarget(doel);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(speel, camera);
    renderer.setRenderTarget(null);
    renderer.render(mengScene, mengCam);
    renderer.render(boven, camera);
  }

  look.set(990, 540, 0);
  resize();
  return { render, setOverview, resize, speel, camera, achtergrond, eind };
}
