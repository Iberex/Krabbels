# Krabbels – Femto Bolt vs webcam (MediaPipe)

Een klein Krabbels-spel om twee soorten skelet-tracking eerlijk te vergelijken.
Een getekend mannetje wandelt over blokken en wacht bij elk gat. Jij staat voor de camera en houdt je
**armen opzij**. Zo word je een brug. Hou dat even vast: er komt een plank en het mannetje wandelt verder.

| | Test 1: Femto | Test 2: Webcam |
|---|---|---|
| Starten | `start_femto.bat` | `start_webcam.bat` |
| Adres | `http://localhost:8090/?bron=femto` | `http://localhost:8090/?bron=webcam` |
| Camera | diepte + infrarood van de Femto Bolt | kleurcamera van de Femto (als gewone webcam) |
| Skelet | Azure Kinect Body Tracking (in de brug, NVIDIA/CUDA) | MediaPipe Pose (in Chrome) |
| Venstertje rechtsboven | IR-beeld (zwart-wit) | kleurbeeld |

Beide tests gebruiken **dezelfde camera op dezelfde plek** en **dezelfde spelcode** (`src/camera.js`).
Alleen de bron verschilt: `src/sources/femto.js` of `src/sources/webcam.js`.

---

## Eenmalig installeren (schoollaptop, Windows + NVIDIA)

1. **Git**, **Chrome** en **Python 3.11** installeren. Vink bij Python "py launcher" en "Add to PATH" aan.
2. **NVIDIA-driver** up-to-date zetten (GeForce Experience of nvidia.com).
3. **Orbbec SDK K4A Wrapper** (Windows-zip, v2.0.12 werkte op de pc) downloaden via
   https://github.com/orbbec/OrbbecSDK-K4A-Wrapper/releases en uitpakken naar `C:\Femto\K4A-Wrapper`.
   Daarin moet `C:\Femto\K4A-Wrapper\bin\k4a.dll` staan.
   Een andere map mag ook: zet dan de omgevingsvariabele `K4A_BIN` naar de `bin`-map.
4. **Femto-metadata** (één keer, nodig voor de tijdstempels op Windows): open PowerShell **als administrator**
   in `C:\Femto\K4A-Wrapper\scripts` en draai het `obsensor_metadata_win10.ps1`-script uit die map
   (`.\obsensor_metadata_win10.ps1 -op install_all`). Sluit daarna de Femto opnieuw aan.
5. **Azure Kinect Body Tracking SDK 1.1.2** (.msi, ±1,7 GB) installeren met de standaardmap
   (`C:\Program Files\Azure Kinect Body Tracking SDK`). Download via de Microsoft-pagina
   "Download Azure Kinect body tracking SDK".
6. Deze repo clonen en `setup.bat` dubbelklikken:
   ```bat
   git clone <repo-url> C:\Femto\krabbels-femto
   cd C:\Femto\krabbels-femto
   setup.bat
   ```
   `setup.bat` maakt `bridge\venv` en installeert numpy, websockets en opencv.
   Op het einde moet "**alles gevonden en geladen**" staan, met "Camera's aangesloten: 1".

## Elke keer

```bat
cd C:\Femto\krabbels-femto
git pull
start_femto.bat
```

De eerste keer duurt het ±10 s voor de body tracker klaar is. Linksboven staat dan "verbonden".

## Zo test je

1. Start test 1 met `start_femto.bat`. Wacht tot linksboven "verbonden" staat.
2. Druk **T** en ga met 1 persoon op 2 à 3 m staan (je hebt 8 s). Blijf dan 5 s stilstaan met de armen opzij.
   Een test zonder skelet wordt niet bewaard.
3. Herhaal met **2 personen** naast elkaar.
4. Sluit Chrome en het zwarte venster "Femto skeleton bridge".
5. Start test 2 met `start_webcam.bat` en doe exact hetzelfde.
6. Druk **U**: de tabel toont alle tests onder elkaar. Maak er een screenshot van.

**Toetsen:** T = test · U = resultaten · X = tabel wissen (als de tabel open is) · W = bron wisselen ·
SPATIE = brug (zonder camera) · F = volledig scherm · R = opnieuw

**Adres-opties:** `?spiegel=0` = niet spiegelen · `?brug=ws://andere-pc:8765` = brug op een ander toestel.

## Wat betekenen de cijfers?

| cijfer | betekenis | beter = |
|---|---|---|
| spelers | gemiddeld aantal gevonden spelers (2,0 = altijd allebei) | dichter bij het aantal dat er stond |
| fps | nieuwe skeletten per seconde | hoger |
| ms | verwerkingstijd van het skelet (Femto: in de brug, webcam: in Chrome) | lager |
| brug | % van de beelden waarin de brug-houding herkend werd | hoger |
| trillen | hoeveel de pols springt tussen twee beelden, in % van de armlengte | lager |

De brug-houding telt als beide armen binnen 25° van horizontaal zijn, gestrekt (≥ 75 %) en zeker genoeg
(≥ 50 %). Pas dat aan in `POSE` bovenaan `src/camera.js`.

Bij de Femto zit het berekenen van het dieptebeeld niet in "ms" (dat doet de camera-software voor de brug).
Totale vertraging meten: film jezelf en het scherm samen met een gsm in slow motion (240 fps), laat je armen
snel zakken en tel de frames tot de figuur beweegt (1 frame ≈ 4 ms). Doe dat 5 keer per bron.

## Eerlijk vergelijken

- Zelfde ruimte, zelfde licht (liefst zoals op het festival: donker met de projector aan).
- Niet allebei tegelijk laten draaien: ze delen de camera en de videokaart. `start_webcam.bat` waarschuwt.
- MediaPipe laadt de eerste keer ±10 MB van internet. Geen internet op school?
  Draai thuis `python tools\haal_mediapipe.py`: dat zet alles in `vendor\` (staat niet in git, dus kopieer die map mee).

## Problemen

| Melding | Oplossing |
|---|---|
| `ontbreekt: Orbbec K4A Wrapper` | Stap 3: `k4a.dll` niet gevonden. Map nakijken of `K4A_BIN` zetten. |
| `ontbreekt: Azure Kinect Body Tracking SDK` | Stap 5. |
| `geen Femto gevonden` | USB-C-kabel in een USB 3-poort + aparte stroom. Orbbec Viewer even proberen. |
| `body tracker starten mislukt (mode cuda)` | NVIDIA-driver updaten. Lukt het niet: `bridge\start_bridge.bat --mode directml` of `--mode cpu`. |
| `geen brug op ws://localhost:8765` | Het venster "Femto skeleton bridge" is dicht of gecrasht. Bekijk `bridge\bridge.log`. |
| Webcam: `camera is bezet` | De brug gebruikt de Femto nog. Sluit dat venster. |

Debugvenster van de brug (IR-beeld + skelet): `bridge\start_bridge.bat` zonder opties. Stoppen met q.

## Zonder Femto testen (Mac of eender welke pc)

```bash
python3 -m pip install websockets
python3 tools/nep_brug.py        # nep-skelet dat de armen op en neer doet
python3 serve.py                 # in een tweede terminal
# open http://localhost:8090/?bron=femto
```

`?bron=webcam` werkt ook op een Mac met de ingebouwde camera.

## Mappen

```
index.html, style.css     het spel
src/main.js               spel: blokken, gat, brug, mannetje, toetsen
src/camera.js             kiest de bron, maakt spelers + herkent de brug-houding (gedeeld)
src/sources/femto.js      bron 1: WebSocket naar de brug
src/sources/webcam.js     bron 2: MediaPipe Pose in Chrome
src/cameraView.js         camerabeeld rechtsboven
src/metrics.js            test (T) en resultatentabel (U)
bridge/skeleton_bridge.py Femto -> skeletten over WebSocket (ws://localhost:8765)
serve.py                  kleine webserver (poort 8090)
tools/nep_brug.py         nep-brug om zonder camera te testen
tools/haal_mediapipe.py   MediaPipe lokaal zetten (offline)
```

> Opnieuw opgebouwd op basis van de testversie van 9 november op de pc (`C:\Femto\krabbels-vergelijk`).
> Het spel is getest met de nep-brug. De echte brug is nog niet getest op de schoollaptop met de Femto.
