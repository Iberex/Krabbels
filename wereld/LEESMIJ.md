# Krabbels · wereld (2D en 3D)

De hele wereld in een stuk: start met logo, tutorial, papierrand en dan level 1 tot 5 na elkaar (door de deur op het einde).

Starten (vanuit de projectmap): preview "wereld" (poort 5178), of
`python3 -m http.server 5178 --directory 5-demos/Wereld` en open http://localhost:5178
3D laadt Three.js van een CDN (internet nodig).

Besturing: pijltjes lopen, spatie of omhoog springen, omhoog/omlaag op de ladder, V = 2D/3D, W = hele wereld,
R = opnieuw, 0 = begin, 1-5 = bij dat level beginnen (ook `?level=3&3d`).

Bestanden
- `maak_wereld.py` -> `wereld.json`: platformen, bruggen, hellingen, ladders, ankers en waar elk level begint
- `assets/F/` + `maak_final.py`: start, tutorial, logo (3 wiggle-versies) en papierrand uit Figma `final_foreground`
- `assets/L1-L5/` + `level1-5.json`: achtergronden en voorgrondtegels per level
- `game.js` (spel + 2D), `game3d.js` (semi-3D), `wereld.js` (tekeningen, ankers, overvloeien van de achtergronden)
- `models/`: Blender-modellen; maken met de scripts in `3-design/assets/glb/` (`bouw_gidsen.py` leest `wereld.json`)

De achtergrond van een level vloeit geleidelijk in die van het volgende (`OVERVLOEI` in wereld.js).
De levels schuiven 62 px in elkaar zodat er geen spleet in de grond zit. Krabbel is een placeholder.
