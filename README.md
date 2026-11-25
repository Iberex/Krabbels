# Wobbel proof of concept

Players draw a "wobbel" on an iPad (colours, line widths, eraser, stickers) and send it. The wobbel appears on the LEVEL screen, walks
through a platformer level, and then lives in the WORLD screen with all other wobbels of that day.

Technique: plain HTML, CSS and JavaScript with canvas, and a small Node.js + Express server.
No WebSockets. Every page talks only to the server with `fetch`. The screens ask the server for
new wobbels once per second (polling).

```
iPad /draw  --POST /api/wobbels-->  SERVER  <--GET every 1 s--  /level
                                    SERVER  <--POST .../finish-- /level
                                    SERVER  <--GET every 1 s--  /world
```

## Start on Windows, step by step

Do steps 1 to 3 only the first time.

1. **Install Node.js.** Go to <https://nodejs.org>, download the LTS version and install it with
   the default options.
2. **Copy the project folder** `wobbel-poc` to the laptop, for example to `C:\wobbel-poc`.
   You do not need to copy the `node_modules` folder.
3. **Install.** Open the folder in File Explorer, click in the address bar, type `cmd` and press
   Enter. A black command window opens. Type:
   ```
   npm install
   ```
4. **Start the server.** In the same window, type:
   ```
   npm start
   ```
   The window now shows the addresses of all pages. Keep this window open. Stop the server with
   `Ctrl + C`.
5. **Allow Node through the firewall.** The first time, Windows shows a "Windows Security Alert"
   for Node.js. Tick **Private networks** and click **Allow access**.
   If you missed that window, or the iPad cannot connect:
   - Open the Start menu, type `Allow an app through Windows Firewall` and open it.
   - Click **Change settings**, find **Node.js JavaScript Runtime** in the list and tick
     **Private**. If it is not in the list: **Allow another app...** → **Browse** →
     `C:\Program Files\nodejs\node.exe` → **Add**.
   - The Wi-Fi network must be set to **Private**: Settings → Network & internet → Wi-Fi →
     your network → **Private network**.
6. **Find the IP address of the laptop.** `npm start` already prints it. To check it yourself, open
   a second command window and type:
   ```
   ipconfig
   ```
   Look under "Wireless LAN adapter Wi-Fi" for **IPv4 Address**, for example `192.168.1.20`.
7. **Open the pages.**

   | Where | Address | Tip |
   | --- | --- | --- |
   | Laptop or projector | `http://localhost:3000/level` | Press `F11` for full screen |
   | Second screen or window | `http://localhost:3000/world` | Press `F11` for full screen |
   | iPad (Safari) | `http://192.168.1.20:3000/draw` | Use the IP address of your laptop |
   | Laptop | `http://localhost:3000/admin` | Reset button |

   The iPad and the laptop must be on the **same Wi-Fi network**. School or guest networks often
   block devices from seeing each other. If so, use a phone hotspot or your own router.

   Tip for the iPad: in Safari tap Share → **Add to Home Screen**. The page then opens full screen
   without the address bar.

   You do not need two iPads to test. `/draw` works in every browser, so a phone or a second
   browser window can be the second "iPad".

Each page has a small dot in the bottom right corner: filled = connected, empty = no connection.

### If something does not work

| Problem | Solution |
| --- | --- |
| iPad shows "cannot connect to the server" | Check the firewall (step 5), the IP address and the Wi-Fi network. |
| `npm` is not recognized | Close the command window and open a new one after you installed Node.js. |
| `EADDRINUSE` when you start | Port 3000 is in use. Start with another port: `set PORT=3001` and then `npm start`. |
| A wobbel does not walk | The level page must be visible. Browsers pause animations in hidden tabs. Use separate windows, not tabs. |

## File structure

```
wobbel-poc/
  server.js            Express server: pages + API
  lib/store.js         wobbels in memory + one JSON file per day (safe write)
  lib/validate.js      checks the data that the iPad sends
  data/                wobbels-2026-11-16.json, one file per day (made automatically)
  public/
    draw.html / draw.js      iPad: draw (colours, widths, eraser), stickers, send
    level.html / level.js    level screen: arrival, walk, finish
    world.html / world.js    world screen
    admin.html               reset button
    shared/
      stickers.js      ALL stickers: eyes, mouths, extras, legs, arms (add new ones here)
      wobbel.js        draws a wobbel (used by all three pages)
      api.js           fetch, polling, connection dot
      hooks.js         empty hooks for light and sound (later)
      base.css         wireframe style
  test/api.test.js     API tests:  npm test
  tools/seed.js        makes random test wobbels:  npm run seed -- 120
```

## API

| Method and path | Used by | What it does |
| --- | --- | --- |
| `POST /api/wobbels` | `/draw` | Creates a wobbel. The server adds `id`, `createdAt` and `status: "level"`. |
| `GET /api/wobbels?status=level&since=<id>` | `/level` | New wobbels in the level, after the wobbel with this id. |
| `POST /api/wobbels/:id/finish` | `/level` | The wobbel reached the finish. Sets `status: "world"`. |
| `GET /api/wobbels?status=world&since=<id>` | `/world` | Newly finished wobbels. Without `since`: all world wobbels of today. |
| `POST /admin/reset` | `/admin` | Removes all wobbels of today. |
| `GET /api/health` | `/draw`, `/admin` | Small status call for the connection dot. |

A list answer looks like this:

```json
{ "epoch": "2026-11-16_3f6ef3", "day": "2026-11-16", "wobbels": [ ... ] }
```

- `since` is optional. Without it you get the full list for that status.
- `epoch` changes after a reset and on a new day. When a screen sees a new `epoch`, it empties
  itself and loads the list again.
- The iPad sends an extra `clientId` with each wobbel. If the same wobbel arrives twice (automatic
  retry), the server stores it only once.

### Data format

All positions are relative to the guide circle on the iPad: centre = (0, 0), radius = 1, y points
down. So every screen can draw the wobbel at any size. The drawing is stored as lines (points),
not as an image, so it stays sharp on a big screen. The guide circle itself is not part of the
wobbel: it is only a hint on the iPad. Players can draw outside it, up to -1.7 .. 1.7.

```json
{
  "id": "w_8f3a1c",
  "createdAt": "2026-11-16T15:44:00.000Z",
  "status": "level",
  "strokes": [
    { "c": "#e53935", "w": 0.06, "p": [[-0.2, 0.1], [-0.18, 0.12]] },
    { "c": "erase",   "w": 0.13, "p": [[0.3, 0.3], [0.4, 0.3]] }
  ],
  "stickers": [
    { "type": "eye_round", "x": -0.25, "y": -0.2, "c": "#1e88e5" },
    { "type": "legs_long", "x": 0, "y": 1 }
  ]
}
```

- A stroke has a colour `c` (`"#rrggbb"`, or `"erase"` for the eraser), a line width `w` (in
  radii) and points `p`. Strokes are drawn in order, so an eraser stroke removes what was drawn
  before it.
- A sticker has an optional colour `c`. Without it the sticker is black.
- Rules that the server checks: exactly one `legs_` sticker, at most one `arms_` sticker.
- Old format: a stroke that is only a list of points (`[[x, y], ...]`) is still accepted and
  stored as a black stroke with the default width.

The server also stores `seq` and `worldSeq` (order of creation and of finishing), `finishedAt`
and `clientId`.

### Storage

- One file per day: `data/wobbels-YYYY-MM-DD.json`.
- After a restart of the server, the wobbels of today are back.
- A new day starts empty. Old files stay in the `data` folder.
- The file is written safely: first to a `.tmp` file, then renamed.

## How to add a sticker

All stickers are in `public/shared/stickers.js`. Add one entry and it appears in the right tab of
the tray on the iPad and works on all screens. You do not need to change any other file.

There are five kinds. The name of a sticker must start with its kind:

| Kind | Name starts with | Behaviour |
| --- | --- | --- |
| `eye` | `eye_` | Free placement, as many as you like. Blinks and looks around. |
| `mouth` | `mouth_` | Free placement. |
| `extra` | `extra_` | Free placement (hat, bow, antenna, tail, ...). |
| `legs` | `legs_` | One per wobbel, required. Snaps to the bottom. Sets the walking style. |
| `arms` | `arms_` | One per wobbel, optional. Snaps to the sides. Swings while walking. |

Rules:

- Names: small letters, numbers and `_` only.
- Draw in wobbel units: the guide circle has radius 1.
- Only draw lines and shapes. Line colour and line width are already set to the colour that the
  player chose. Use `s.color` if you fill a shape with that colour.

**New eye, mouth or extra.** `(0, 0)` is the middle of the sticker.

```js
eye_star: {
  kind: 'eye',
  label: 'Star',
  draw(ctx, s) {
    // s.blink: 0 = open, 1 = closed.  s.lookX, s.lookY: -1..1.  s.side: -1 left, 1 right.
    const size = 0.16 * (1 - s.blink * 0.9);
    ctx.beginPath();
    ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
    ctx.moveTo(0, -size); ctx.lineTo(0, size);
    ctx.stroke();
  },
},

mouth_line: {
  kind: 'mouth',
  label: 'Line',
  draw(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.25, 0); ctx.lineTo(0.25, 0);
    ctx.stroke();
  },
},
```

**New legs.** `(0, 0)` is the bottom of the guide circle. The feet touch the ground at `y = height`.

```js
legs_hop: {
  kind: 'legs',
  label: 'One leg',
  height: 0.5,                       // distance from the body to the ground
  gait: {
    speed: 3,                        // walking speed, in radii per second
    stepHz: 3,                       // steps per second
    bounce: 0.2,                     // how high the body bounces with each step
    squash: 0.1,                     // squash and stretch with each step (0 to 0.2)
  },
  draw(ctx, s) {
    // s.phase = walking cycle, s.moving = 0 (still) to 1 (walking), s.hipY = body bounce.
    const lift = Math.max(0, Math.cos(s.phase)) * 0.15 * s.moving;
    ctx.beginPath();
    ctx.moveTo(0, s.hipY);           // start at the body, so it follows the bounce
    ctx.lineTo(0, 0.5 - lift);
    ctx.lineTo(0.2, 0.5 - lift);     // foot points forward
    ctx.stroke();
  },
},
```

The `gait` values decide the walking style in the level and in the world.

**New arms.** `(0, 0)` is the middle of the guide circle. Draw both arms: they start at `x = -1`
and `x = 1`. `reach` and `drop` say how far the arms go sideways and down. The iPad uses them to
know where a finger can grab the arms.

```js
arms_up: {
  kind: 'arms',
  label: 'Up',
  reach: 0.4,
  drop: 0.1,
  draw(ctx, s) {
    for (const side of [-1, 1]) {
      const wave = Math.sin(s.phase) * 0.1 * s.moving;
      ctx.beginPath();
      ctx.moveTo(side, 0);
      ctx.lineTo(side * 1.4, -0.5 + wave);
      ctx.stroke();
    }
  },
},
```

To change the colours or line widths on the iPad, edit `COLORS` and `WIDTHS` at the top of
`public/draw.js`. To add a tab to the tray, add a line to `TABS` in the same file.

## Hooks for light and sound (later)

`public/shared/hooks.js` has four empty functions. They are already called at the right moment:

| Hook | Page | Moment |
| --- | --- | --- |
| `Hooks.onWobbelSent(wobbel)` | `/draw` | The server accepted the wobbel, it starts to fly off the iPad. |
| `Hooks.onWobbelArrive(wobbel)` | `/level` | The wobbel starts to appear in the portal at START. |
| `Hooks.onWobbelFinish(wobbel)` | `/level` | The wobbel reached the FINISH flag. |
| `Hooks.onWobbelLandInWorld(wobbel)` | `/world` | A new wobbel fell from the sky and touched the ground. |

## Change the level

In `public/level.js`:

- `PLATFORMS` is the list of rectangles that are drawn.
- `PATH` is the fixed route of the wobbel. A point with `jump: 100` means: jump to this point,
  100 units high. Wobbels do not use physics, they only follow this path. If you move a platform,
  move the path points too.

## Test tools

```
npm test                    API tests
npm run seed -- 120         120 random wobbels straight into the world (performance test)
npm run seed -- 3 level     3 random wobbels that walk through the level
```

Open `/world?fps` to see the frame rate and the number of wobbels.
