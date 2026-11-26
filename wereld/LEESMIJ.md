# Krabbels · wereld (2D en 3D)

De hele wereld in een stuk: start met logo, tutorial, papierrand en dan level 1 tot 5 na elkaar (door de deur op het einde).

Starten (vanuit de projectmap): preview "wereld" (poort 5178), of
`python3 -m http.server 5178 --directory 5-demos/Wereld` en open http://localhost:5178
3D laadt Three.js van een CDN (internet nodig).

Besturing: pijltjes lopen, spatie of omhoog springen, omhoog/omlaag op de ladder, V = 2D/3D, W = hele wereld,
R = opnieuw, 0 = begin, 1-5 = bij dat level beginnen (ook `?level=3&3d`).

Bestanden
- `maak_wereld.py` -> `wereld.json`: platformen, bruggen, hellingen, ladders, ankers (de wereld = Figma `final_foreground`, 17280 px)
- `assets/achtergrond/`: `scherm_0..3.jpg` (start en tutorial) en per level `L1-5_lucht.jpg` + `_10/_9/_8.png`
  (`maak_schermlagen.py`). Camera: in de tutorial volgt ze, in de levels staat ze stil per scherm en schuift ze door
  met de lagen na elkaar (tijden en regels in `wereld.js`)
- `assets/F/` (start, tutorial, logo met 3 wiggle-versies, papierrand) en `assets/L1/` (voorgrond van de levels)
- `game.js` (spel + 2D), `game3d.js` (semi-3D), `wereld.js` (tekeningen en ankers)
- `models/`: Blender-modellen; maken met de scripts in `3-design/assets/glb/` (`bouw_gidsen.py` leest `wereld.json`)

Krabbel is een placeholder.
