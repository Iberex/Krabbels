# BAP-DEMO-Femto

Krabbels-testdemo met de **Orbbec Femto Bolt** (dieptecamera) in plaats van een webcam.
De camera staat **achter** de spelers, richting de projectiemuur.

| Versie | Starten | Adres |
|---|---|---|
| v2 (met stijl) | `start_demo_v2.bat` | `http://localhost:8091/v2/?achter=1` |
| grijze testdemo | `start_demo.bat` | `http://localhost:8091/?achter=1` |
| stoppen | `stop_demo.bat` | |

## Nodig

Deze map verwacht de Femto-brug ernaast:

```
Femto\
  BAP-DEMO\            deze repo
  krabbels-femto\      bridge\skeleton_bridge.py + bridge\venv  (repo krabbels-femto, setup.bat)
  K4A-Wrapper\         Orbbec SDK K4A Wrapper (bin\k4a.dll)
  BodyTrackingSDK\     Azure Kinect Body Tracking SDK 1.1.2 (uitgepakt met msiexec /a)
```

De brug leest de skeletten (Azure Kinect Body Tracking op de NVIDIA-GPU) en stuurt ze over
`ws://localhost:8765`. `start_demo*.bat` start de brug, de webserver (`serve.py`, poort 8091) en Chrome.

Kabel: USB 3 (5 Gbps) naar een blauwe USB 3-poort + de aparte stroomadapter.
Langer dan ±3 m: actieve USB 3-kabel, of laptop bij de camera en een lange HDMI naar de projector.

## Eén keer afstellen

In **Kalibratie** (toets `0`): ga aan de linkerrand van het beeld op de muur staan en druk `[`,
aan de rechterrand en druk `]`. Wordt onthouden in de browser. `\` wist het.
Daarna staat je silhouet op de muur waar je in de zaal staat, op ware grootte.

## Toetsen

`0`–`2` modus · `S` solo/duo · `D` debug (fps, afstand per speler) · `C` IR-beeld · `T` stijl/grijs ·
`F` volledig scherm · `Esc` menu

## Wat de Femto toevoegt (v2)

- `v2/femto.js`: skeletten van de brug → zelfde vorm als MediaPipe, in **echte meters**,
  One Euro-filter (rustig bij stilstaan, snel bij bewegen), speelzone in meters (`?min=`, `?max=`).
- Silhouetten op ware grootte (`scale` in `pose.js`): wie hand in hand staat, staat op de muur ook hand in hand.
- **Samen-brug (duo)**: elke 3e pagina één gat van 1,8 m (`togetherGapM` in `v2/main.js`).
  Lukt alleen hand in hand, met jullie echte buitenste handen op de twee bolletjes.
- `v2/picto.js`: pictogrammen, gedeeld door de grijze en de gestileerde weergave.

Adres-opties: `?achter=0` (camera vóór de spelers) · `?breedte=3.5&midden=0` (speelveld in m) ·
`?bron=webcam` (webcam + MediaPipe) · `?brug=ws://host:8765`.
