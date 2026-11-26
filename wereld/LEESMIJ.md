# Krabbels · wereld (2D en 3D)

Speelbaar: tutorial (level 0) en Level 1 t/m 5, rechtstreeks gebouwd op de lagen uit Figma (pagina "FINAL FINAL FINAL", level_1_final).
Nog zonder bruggen/hellingen/ladders: enkel pijltjes.

Starten (vanuit de projectmap):  preview "wereld" (poort 5178), of
`python3 -m http.server 5178 --directory 5-demos/Wereld` en open http://localhost:5178
3D laadt Three.js van een CDN (internet nodig).

Besturing: ← → lopen · ↑/spatie springen · V = 2D/3D · W = hele wereld · R = opnieuw · 0–5 = level kiezen (0 = tutorial) · Enter na de deur = volgend level.
(Of rechtstreeks: ?level=2)
In 3D: één vaste camerahoek; in "Hele wereld": slepen = draaien, scrollen = zoomen.

Bestanden
- level1–5.json  ondergrondhoogte per 2 px (uit de PNG afgeleid), spawn, deur, parallax-lagen
- assets/L1–L5/   backdrop, bg3/bg2/bg1 (parallax 10/30/50%), achter_0-2 en grond_0-2 (3 tegels van 3220 px)
- game.js      spelregels + 2D-weergave · game3d.js  semi-3D (elke laag een papieren vlak op eigen diepte)

Krabbel is een placeholder (krijt-blob); de echte tekening van het kind komt er later in.

Nieuw level toevoegen: lagen uit Figma exporteren (zie memory wereld-speelbaar-2d-3d) en `maak_level.py` draaien.

**3D (nieuw):** grond, gras, water, ravijn en decor zijn Blender-modellen uit `models/`; enkel de lucht is nog een afbeelding (opnieuw maken: `3-design/assets/glb/bouw_grond.py` en `bouw_gras.py` in Blender draaien en de .glb's naar `models/` kopiëren). `grond.html?level=1` toont enkel die modellen.

**Tutorial:** `level0.json` + `assets/L0/` (opnieuw maken: `maak_level0.py <map met de Figma-exports>`), 3D: `models/voorgrond_level0.glb` en `decor_level0.glb` uit `3-design/assets/glb/bouw_tutorial.py`. De hangende balk staat als `plafond` in de JSON.
