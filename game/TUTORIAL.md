# Krabbels in Phaser: van leeg scherm tot vijf levels

In deze tutorial bouw je stap voor stap de basis van het Krabbels-spel in [Phaser](https://phaser.io/), zonder camera of Femto. Een blokje (de latere Krabbel) staat op een platform. Je laat het met de pijltjestoetsen naar rechts lopen. Komt het voorbij de rechterrand van het scherm, dan start de volgende scène.

Daarna bouw je vijf levels. Elk level is één scherm met twee obstakels: een gat, een muurtje, een ladder of een plafond waar je onder moet bukken. Na level 5 loop je door een poort naar een eindscherm, en begint alles opnieuw bij level 1.

## Inhoud

- [Hoe je deze tutorial gebruikt](#hoe-je-deze-tutorial-gebruikt)
- [Stap 0: klaarzetten](#stap-0-klaarzetten)
- **De basis**
  - [Stap 1: Vite en Phaser](#stap-1-vite-en-phaser-al-gedaan)
  - [Stap 2: een lege scène](#stap-2-een-lege-scène-al-gedaan)
  - [Stap 3: platform en vallend blokje](#stap-3-platform-en-vallend-blokje-al-gedaan)
  - [Stap 4: besturing met de pijltjes](#stap-4-besturing-met-de-pijltjes-al-gedaan)
  - [Stap 5: het spel schalen](#stap-5-het-spel-schalen-al-gedaan)
- **Van scène naar scène**
  - [Stap 6: een platform over de hele breedte](#stap-6-een-platform-over-de-hele-breedte)
  - [Stap 7: de rechterrand openzetten](#stap-7-de-rechterrand-openzetten)
  - [Stap 8: naar de volgende scène](#stap-8-naar-de-volgende-scène)
  - [Stap 9: de wereld laten opschuiven](#stap-9-de-wereld-laten-opschuiven)
  - [Stap 10: terug naar de vorige scène](#stap-10-terug-naar-de-vorige-scène)
- **Levels en obstakels**
  - [Het plan](#levels-en-obstakels-het-plan)
  - [Stap 11: levels als data](#stap-11-levels-als-data)
  - [Stap 12: gaten om over te springen](#stap-12-gaten-om-over-te-springen)
  - [Stap 13: muurtjes om over te springen](#stap-13-muurtjes-om-over-te-springen)
  - [Stap 14: hoogtes en een ladder](#stap-14-hoogtes-en-een-ladder)
  - [Stap 15: bukken](#stap-15-bukken)
  - [Stap 16: level 3 en 4](#stap-16-level-3-en-4)
  - [Stap 17: level 5, de poort en het eindscherm](#stap-17-level-5-de-poort-en-het-eindscherm)
- [Klaar met deze fase](#klaar-met-deze-fase)
- [Werkt het niet?](#werkt-het-niet)

Dit is dezelfde gedachte als in de pure-JavaScript-demo, waar de Krabbel "van pagina naar pagina" loopt. Hier laat Phaser het tekenen, de zwaartekracht en de botsingen voor jou doen, zodat je zelf minder code moet schrijven.

Phaser heeft zelf goede [documentatie](https://docs.phaser.io/) en een [lijst met voorbeelden](https://phaser.io/examples). Kijk daar als je meer wil weten over een functie.

## Hoe je deze tutorial gebruikt

- Typ de code zelf over. Zo begrijp je elke regel en kan je hem uitleggen aan de jury.
- Elke stap eindigt met een **commit**. Voer die pas uit als de stap werkt in de browser.
- Stap 1 tot en met 5 heb je al gedaan: ze staan al als commits op de branch `phaser`. Lees ze na zodat je weet waarom de code er zo uitziet. Je nieuwe werk begint bij **stap 6**.

## Stap 0: klaarzetten

Ga naar de branch `phaser` en haal het nieuwste werk op:

```bash
cd ~/Desktop/Krabbels
git switch phaser
git pull
cd game
npm install
npm run dev
```

Open de url die Vite toont (meestal <http://localhost:5173>). Vite herlaadt de pagina vanzelf als je een bestand bewaart. Stoppen doe je met `Ctrl + C`.

`npm install` is nodig omdat de map `node_modules` niet op GitHub staat (zie `.gitignore`).

## Stap 1: Vite en Phaser *(al gedaan)*

We gebruiken [Vite](https://vite.dev/) als ontwikkelserver. Vite zoekt de `phaser`-import op in `node_modules` en herlaadt de pagina bij elke wijziging. Zo kunnen we de code ook opsplitsen in kleine bestanden (één per scène).

Zo is het project gemaakt:

```bash
mkdir game
cd game
npm init -y
npm install phaser
npm install -D vite
```

In `package.json` staan de scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
},
```

Commit: `Add Vite and Phaser`

## Stap 2: een lege scène *(al gedaan)*

`index.html` laadt alleen ons script. Phaser maakt zelf een `<canvas>` aan:

```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Krabbels demo</title>
  <style>body { margin: 0; background: #222; }</style>
</head>
<body>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

In `src/main.js` maak je het spel. De `config` zegt hoe groot het spel is, welke achtergrondkleur het heeft en welke scènes erin zitten:

```javascript
import * as Phaser from 'phaser';
import { GameScene } from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  backgroundColor: '#f4efe6',
  scene: [GameScene]
};

new Phaser.Game(config);
```

`Phaser.AUTO` kiest zelf WebGL, en valt terug op Canvas als dat niet lukt.

Een **scène** is één scherm van je spel: een menu, een level, een eindscherm... Elke scène is een klasse die `Phaser.Scene` uitbreidt. Maak `src/scenes/GameScene.js`:

```javascript
import * as Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
  }
}
```

- `super('game')` geeft de scène een naam (`key`). Met die naam kan je ze later starten.
- `create()` loopt één keer, wanneer de scène start. Hier zet je alles klaar.

Je ziet nu een lege, beige rechthoek.

Commit: `empty scene phaser`

## Stap 3: platform en vallend blokje *(al gedaan)*

Phaser heeft een eenvoudige physics-engine: **Arcade Physics**. Ze geeft objecten een snelheid, zwaartekracht en botsingen. Zet ze aan in `main.js`, in de `config`:

```javascript
physics: {
  default: 'arcade',
  arcade: { gravity: { y: 900 } }
},
```

`gravity.y` is hoe hard alles naar beneden valt, in pixels per seconde².

Teken daarna in `create()` een platform en een blokje:

```javascript
create() {
  this.platform = this.add.rectangle(400, 400, 600, 30, 0x333333);
  this.physics.add.existing(this.platform, true);

  this.block = this.add.rectangle(400, 100, 40, 40, 0xe4572e);
  this.physics.add.existing(this.block);
  this.block.body.setCollideWorldBounds(true);

  this.physics.add.collider(this.block, this.platform);
}
```

- `this.add.rectangle(x, y, breedte, hoogte, kleur)` tekent een rechthoek. `x` en `y` zijn het **midden** van de rechthoek.
- `this.physics.add.existing(object)` geeft een object een physics-`body`. Met `true` erbij is het een **statische** body: ze valt niet en beweegt niet. Perfect voor een platform.
- `setCollideWorldBounds(true)` houdt het blokje binnen het scherm.
- `this.physics.add.collider(a, b)` laat twee objecten tegen elkaar botsen. Zonder deze regel valt het blokje door het platform.

Het blokje valt nu en blijft op het platform liggen.

Commits: `platforms` en `falling block`

## Stap 4: besturing met de pijltjes *(al gedaan)*

Vraag in `create()` de pijltjestoetsen op:

```javascript
this.arrows = this.input.keyboard.createCursorKeys();
```

Voeg dan een `update()` toe. Die loopt **elke frame** (zo'n 60 keer per seconde). Daar lees je de toetsen uit:

```javascript
update() {
  if (this.arrows.left.isDown) {
    this.block.body.setVelocityX(-250);
  } else if (this.arrows.right.isDown) {
    this.block.body.setVelocityX(250);
  } else {
    this.block.body.setVelocityX(0);
  }

  if (this.arrows.up.isDown && this.block.body.blocked.down) {
    this.block.body.setVelocityY(-450);
  }
}
```

- `setVelocityX` geeft het blokje een snelheid opzij, in pixels per seconde. Laat je los, dan zet je ze terug op `0`, anders schuift het blokje door.
- Springen mag alleen als het blokje op iets staat: `body.blocked.down`. Anders kan je in de lucht blijven springen.

Commit: `First controls`

## Stap 5: het spel schalen *(al gedaan)*

Het spel is 800 × 450 pixels. Voeg in de `config` in `main.js` een `scale` toe, zodat het in elk venster past (en later op de projectie):

```javascript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH
},
```

- `FIT` maakt het spel zo groot mogelijk, maar houdt de verhouding 16:9.
- `CENTER_BOTH` zet het in het midden van het scherm.

Je code blijft rekenen in 800 × 450, hoe groot het venster ook is. Dat maakt alles eenvoudiger.

Commit: `Scale game to window`

---

Vanaf hier is alles nieuw.

## Stap 6: een platform over de hele breedte

Het blokje moet van links naar rechts over het platform kunnen lopen. Nu is het platform 600 pixels breed en staat het blokje in het midden. Maak het platform even breed als het spel, en zet het blokje links.

Gebruik daarvoor `this.scale.width` en `this.scale.height` in plaats van vaste getallen. **Waarom:** past de spelgrootte later aan, dan schuift alles mee.

Vervang in `GameScene.js` het begin van `create()`:

```javascript
create() {
  const { width, height } = this.scale;

  this.platform = this.add.rectangle(width / 2, height - 30, width, 30, 0x333333);
  this.physics.add.existing(this.platform, true);

  this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
  this.physics.add.existing(this.block);
  this.block.body.setCollideWorldBounds(true);

  this.physics.add.collider(this.block, this.platform);

  this.arrows = this.input.keyboard.createCursorKeys();
}
```

- `const { width, height } = this.scale;` haalt de breedte en hoogte in één keer op.
- Het platform staat in het midden (`width / 2`) en is `width` breed, dus het raakt beide randen.
- Het blokje start links, op `x = 40`.

**Test:** het blokje valt links op het platform. Loop naar rechts: het stopt tegen de rechterrand van het scherm.

```bash
git add game/src
git commit -m "Full width platform, block starts left"
```

## Stap 7: de rechterrand openzetten

Door `setCollideWorldBounds(true)` kan het blokje het scherm niet uit. Links, boven en onder willen we dat zo houden, maar rechts moet het blokje er wél uit kunnen. Zet daarvoor de botsing met de rechterrand van de wereld uit.

Voeg bovenaan `create()`, meteen na de regel met `width` en `height`, toe:

```javascript
this.physics.world.setBoundsCollision(true, false, true, true);
```

De vier waarden zijn **links, rechts, boven, onder**. Alleen rechts staat op `false`.

**Test:** loop naar rechts. Het blokje verdwijnt nu uit beeld. Naar links blijft het tegen de rand botsen.

```bash
git add game/src
git commit -m "Open right edge of the world"
```

## Stap 8: naar de volgende scène

Nu het blokje rechts uit beeld kan, controleer je in `update()` of dat gebeurd is. Zo ja, dan start je de scène opnieuw, met een hoger scènenummer.

**Waarom de scène opnieuw starten en geen nieuwe scène-klasse?** Elke scène heeft dezelfde opbouw: een platform en een blokje. Alleen het nummer (en later de obstakels) verschilt. Zo schrijf je de code één keer. In de demo werkte het net zo: elke "pagina" was dezelfde code met andere obstakels.

### 8.1 Het scènenummer bijhouden

Phaser roept vóór `create()` de functie `init(data)` op. Daarin krijg je de gegevens die je bij het starten meegeeft. Voeg `init` toe, tussen de `constructor` en `create()`:

```javascript
init(data) {
  this.level = data.level ?? 1;
}
```

De eerste keer geeft niemand een `level` mee. Dan zorgt `?? 1` ervoor dat je bij scène 1 begint.

### 8.2 Het nummer tonen

Zet onderaan in `create()` een tekst, zodat je ziet in welke scène je zit:

```javascript
this.add.text(20, 20, `Scène ${this.level}`, { fontSize: '24px', color: '#333333' });
```

### 8.3 De rechterrand controleren

Voeg onderaan in `update()` toe:

```javascript
if (this.block.x > this.scale.width + 20) {
  this.scene.restart({ level: this.level + 1 });
}
```

- `this.block.x` is het **midden** van het blokje. Het blokje is 40 breed, dus bij `width + 20` is het helemaal uit beeld.
- `this.scene.restart(data)` stopt de scène en start ze opnieuw. Phaser roept dan weer `init(data)` en `create()` op, met het nieuwe `level`.

**Test:** loop naar rechts. Als het blokje uit beeld is, sta je weer links, en bovenaan staat `Scène 2`. Daarna `Scène 3`, enzovoort.

```bash
git add game/src
git commit -m "Go to next scene at right edge"
git push
```

### Zo ziet `GameScene.js` er nu uit

```javascript
import * as Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { width, height } = this.scale;
    this.physics.world.setBoundsCollision(true, false, true, true);

    this.platform = this.add.rectangle(width / 2, height - 30, width, 30, 0x333333);
    this.physics.add.existing(this.platform, true);

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.physics.add.collider(this.block, this.platform);

    this.arrows = this.input.keyboard.createCursorKeys();

    this.add.text(20, 20, `Scène ${this.level}`, { fontSize: '24px', color: '#333333' });
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    if (this.block.x > this.scale.width + 20) {
      this.scene.restart({ level: this.level + 1 });
    }
  }
}
```

## Stap 9: de wereld laten opschuiven

Nu verspringt het beeld: `this.scene.restart()` gooit de hele scène weg en bouwt ze opnieuw op. De oude en de nieuwe scène zijn nooit samen in beeld, dus je ziet niet dat het blokje naar een nieuwe wereld wandelt.

**Het idee:** elke scène wordt een **pagina** van één schermbreedte. Die pagina's liggen naast elkaar in één grote wereld:

| Scène | x van | x tot |
| --- | --- | --- |
| 1 | 0 | 800 |
| 2 | 800 | 1600 |
| 3 | 1600 | 2400 |

Loopt het blokje rechts uit de pagina, dan bouw je de volgende pagina ernaast. Daarna schuift de **camera** er met een korte animatie naartoe. Het blokje loopt gewoon verder: het wordt niet teruggezet.

**Waarom de camera bewegen en niet de wereld?** In Phaser blijft alles op zijn plaats in de wereld staan. De camera bepaalt welk stuk je ziet. Schuift de camera, dan schuiven de oude en de nieuwe pagina samen door het beeld. Dat is precies het effect dat je wil, en je hoeft geen enkel object zelf te verplaatsen.

### 9.1 Een functie die één pagina bouwt

Het platform en de tekst verschillen per pagina alleen in hun x-positie. Zet ze daarom in een eigen functie. Voeg `buildPage()` toe, tussen `create()` en `update()`:

```javascript
buildPage() {
  const { width, height } = this.scale;
  this.pageX = (this.level - 1) * width;

  const platform = this.add.rectangle(this.pageX + width / 2, height - 30, width, 30, 0x333333);
  this.physics.add.existing(platform, true);
  this.physics.add.collider(this.block, platform);

  this.add.text(this.pageX + 20, 20, `Scène ${this.level}`, { fontSize: '24px', color: '#333333' });

  this.physics.world.setBounds(this.pageX, 0, width, height);
}
```

- `this.pageX` is de linkerrand van de huidige pagina: 0 voor scène 1, 800 voor scène 2, enzovoort.
- Alles wat je tekent, schuif je op met `this.pageX`.
- `this.physics.world.setBounds()` verplaatst de randen van de wereld naar de nieuwe pagina. Zo botst het blokje tegen de linkerrand van de huidige pagina en kan het niet terug naar de vorige. De rechterrand blijft open, door de regel uit stap 7.

### 9.2 `create()` aanpassen

Het platform, de collider en de tekst staan nu in `buildPage()`. Haal ze uit `create()` en roep onderaan `this.buildPage()` op. Het blokje moet er al zijn voordat `buildPage()` de collider maakt, dus de volgorde is belangrijk:

```javascript
create() {
  const { height } = this.scale;
  this.physics.world.setBoundsCollision(true, false, true, true);

  this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
  this.physics.add.existing(this.block);
  this.block.body.setCollideWorldBounds(true);

  this.arrows = this.input.keyboard.createCursorKeys();

  this.buildPage();
}
```

**Test:** alles ziet er nog uit zoals in stap 8. Het blokje staat op het platform en bovenaan staat `Scène 1`.

### 9.3 De camera laten schuiven

Vervang in `update()` het blok met `this.scene.restart(...)` door:

```javascript
if (this.block.x > this.pageX + this.scale.width + 20) {
  this.level += 1;
  this.buildPage();
  this.cameras.main.pan(this.pageX + this.scale.width / 2, this.scale.height / 2, 600, 'Sine.easeInOut');
}
```

- De rechterrand is nu `this.pageX + this.scale.width`, en niet meer gewoon `this.scale.width`.
- `+ 20` is de helft van het blokje. Het blokje staat dan net helemaal op de nieuwe pagina, dus de nieuwe linkerrand duwt het niet weg.
- `this.cameras.main.pan(x, y, duur, easing)` schuift het midden van de camera in 600 milliseconden naar het midden van de nieuwe pagina.
- `'Sine.easeInOut'` laat de camera zacht vertrekken en zacht stoppen, zodat de beweging niet schokt. Kijk in de [voorbeelden](https://phaser.io/examples) als je een andere easing wil proberen.
- Na `this.buildPage()` is `this.pageX` al de nieuwe pagina. Daardoor is de voorwaarde in het volgende frame niet meer waar, en wordt er maar één pagina gebouwd.

`init(data)` mag blijven staan. Zonder `restart` geeft niemand nog een `level` mee, dus `?? 1` zorgt dat je bij scène 1 begint.

**Test:** loop naar rechts. Als het blokje uit beeld loopt, schuift het beeld vloeiend naar `Scène 2`, en het blokje loopt daar verder. Naar links kan je niet meer terug naar scène 1.

```bash
git add game/src
git commit -m "Slide camera to next page"
git push
```

### Zo ziet `GameScene.js` er na stap 9 uit

```javascript
import * as Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;
    this.physics.world.setBoundsCollision(true, false, true, true);

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.arrows = this.input.keyboard.createCursorKeys();

    this.buildPage();
  }

  buildPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    const platform = this.add.rectangle(this.pageX + width / 2, height - 30, width, 30, 0x333333);
    this.physics.add.existing(platform, true);
    this.physics.add.collider(this.block, platform);

    this.add.text(this.pageX + 20, 20, `Scène ${this.level}`, { fontSize: '24px', color: '#333333' });

    this.physics.world.setBounds(this.pageX, 0, width, height);
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    if (this.block.x > this.pageX + this.scale.width + 20) {
      this.level += 1;
      this.buildPage();
      this.cameras.main.pan(this.pageX + this.scale.width / 2, this.scale.height / 2, 600, 'Sine.easeInOut');
    }
  }
}
```

## Stap 10: terug naar de vorige scène

Na stap 9 kan je alleen vooruit: de linkerrand van elke pagina is een muur. Nu zet je die muur open, zodat het blokje ook naar links de vorige pagina in kan lopen. De camera schuift dan terug.

**Wat er verandert:**

- Een pagina mag maar **één keer** gebouwd worden. Loop je terug naar scène 2, dan staat het platform van scène 2 er al. Bouw je het opnieuw, dan liggen er twee platformen en twee teksten op elkaar.
- Daarom splits je `buildPage()` in twee functies:
  - `buildPage()` **bouwt** een nieuwe pagina: platform, collider en tekst.
  - `showPage()` **toont** een pagina: randen van de wereld zetten en de camera laten schuiven.
- `this.lastPage` onthoudt tot welke pagina je al gebouwd hebt.

**Waarom twee functies?** Vooruit naar een nieuwe pagina moet bouwen én tonen. Terug naar een oude pagina moet alleen tonen. Zo roep je telkens precies op wat nodig is, en schrijf je niets dubbel.

### 10.1 `buildPage()` alleen laten bouwen

Pas `buildPage()` zo aan:

```javascript
buildPage() {
  const { width, height } = this.scale;
  const x = (this.level - 1) * width;

  const platform = this.add.rectangle(x + width / 2, height - 30, width, 30, 0x333333);
  this.physics.add.existing(platform, true);
  this.physics.add.collider(this.block, platform);

  this.add.text(x + 20, 20, `Scène ${this.level}`, { fontSize: '24px', color: '#333333' });

  this.lastPage = this.level;
}
```

- `this.pageX` wordt hier niet meer gezet. `x` is alleen de plek waar je bouwt. Waar de camera staat, regelt `showPage()`.
- De regel met `this.physics.world.setBounds(...)` is weg. Die verhuist naar `showPage()`.
- `this.lastPage = this.level` onthoudt dat deze pagina nu bestaat.

### 10.2 `showPage()` toevoegen

Zet deze functie onder `buildPage()`:

```javascript
showPage() {
  const { width, height } = this.scale;
  this.pageX = (this.level - 1) * width;

  this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, false, true, true);

  this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
}
```

- De vier laatste waarden van `setBounds` zijn weer **links, rechts, boven, onder**, net als in stap 7.
- De laatste `true` in `pan` heet `force`. Loop je terug terwijl de camera nog aan het schuiven is, dan negeert Phaser zonder `force` de nieuwe `pan`, en blijft de camera op de verkeerde scène staan. Met `true` vervangt de nieuwe beweging de oude.
- Links staat op `this.level === 1`. Dat is `true` in scène 1: daar is de linkerrand een muur, want links van scène 1 is er niets. In alle andere scènes is het `false`, dus kan je naar links door.
- Rechts blijft `false`, zoals in stap 7.

### 10.3 `create()` aanpassen

Vervang onderaan `this.buildPage();` door:

```javascript
this.buildPage();
this.showPage();
```

De regel `this.physics.world.setBoundsCollision(true, false, true, true);` bovenaan mag weg. `showPage()` zet de randen nu elke keer zelf.

**Waarom ook `showPage()` in `create()`?** Zonder die regel is `this.pageX` nog niet ingevuld, en dan werkt de controle in `update()` niet. De camera staat bij de start al op scène 1, dus `pan` beweegt hier niets.

### 10.4 `update()` aanpassen

Vervang in `update()` **alleen** het blok uit stap 9.3 door de code hieronder. De code voor de pijltjes bovenaan `update()` blijft staan.

```javascript
const { width } = this.scale;

if (this.block.x > this.pageX + width + 20) {
  this.level += 1;
  if (this.level > this.lastPage) {
    this.buildPage();
  }
  this.showPage();
} else if (this.block.x < this.pageX - 20) {
  this.level -= 1;
  this.showPage();
}
```

- **Rechts eruit:** het scènenummer gaat omhoog. Is die pagina nog niet gebouwd (`this.level > this.lastPage`), dan bouw je ze eerst. Daarna schuift de camera mee.
- **Links eruit:** het scènenummer gaat omlaag en de camera schuift terug. Je bouwt niets, want die pagina bestaat al.
- `- 20` is weer de helft van het blokje: het blokje staat dan net helemaal op de vorige pagina.
- In scène 1 kan het blokje nooit links eruit, want daar is de linkerrand een muur. Zo kom je nooit op `Scène 0`.

**Test:**

1. Loop naar rechts tot `Scène 3`.
2. Loop terug naar links. Het beeld schuift naar `Scène 2` en daarna naar `Scène 1`.
3. In scène 1 stopt het blokje tegen de linkerrand.
4. Loop opnieuw naar rechts. Je ziet nergens dubbele tekst: de pagina's worden niet opnieuw gebouwd.

```bash
git add game/src
git commit -m "Walk back to previous page"
git push
```

### Zo ziet `GameScene.js` er na stap 10 uit

```javascript
import * as Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.arrows = this.input.keyboard.createCursorKeys();

    this.buildPage();
    this.showPage();
  }

  buildPage() {
    const { width, height } = this.scale;
    const x = (this.level - 1) * width;

    const platform = this.add.rectangle(x + width / 2, height - 30, width, 30, 0x333333);
    this.physics.add.existing(platform, true);
    this.physics.add.collider(this.block, platform);

    this.add.text(x + 20, 20, `Scène ${this.level}`, { fontSize: '24px', color: '#333333' });

    this.lastPage = this.level;
  }

  showPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, false, true, true);

    this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    const { width } = this.scale;

    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      if (this.level > this.lastPage) {
        this.buildPage();
      }
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
```

## Levels en obstakels: het plan

Vanaf hier bouw je vijf levels. Elk level is **één scherm** met **twee obstakels**: deel 1 links, deel 2 rechts.

| Level | Deel 1 (links) | Deel 2 (rechts) |
| --- | --- | --- |
| 1 | over een gat springen | over een muurtje springen |
| 2 | een ladder op, naar een hoger platform | onder een plafond door bukken |
| 3 | over een gat naar een middelhoog platform | over een muurtje springen |
| 4 | over een gat springen | over een gat, terug naar de grondhoogte |
| 5 | onder een plafond door bukken | een ladder op, naar de poort |

Na level 5 loop je door een **poort**. Je ziet 3 seconden een eindscherm en dan begin je opnieuw bij level 1.

**In welke volgorde bouw je dit? Per soort obstakel, niet per level.** Elke soort obstakel heeft nieuwe code nodig: een gat vraagt dat je opnieuw kan beginnen als je valt, een ladder vraagt klimmen, een plafond vraagt bukken. Een level vullen is daarna alleen nog **data**: waar ligt de grond, waar staat het muurtje. Daarom:

1. **Stap 11:** de levels worden data in een apart bestand.
2. **Stap 12 tot 15:** één stap per soort obstakel. Je test het telkens in het eerste level waar het voorkomt.
3. **Stap 16:** level 3 en 4. Dat is alleen data, zonder één regel nieuwe code.
4. **Stap 17:** level 5, de poort en het eindscherm.

Zo voegt elke commit één ding toe dat je apart kan testen. Aan de geschiedenis zie je ook het verschil tussen **hoe iets werkt** (code in `GameScene.js`) en **waar het staat** (data in `levels.js`). Dat kan je zo uitleggen aan de jury.

**De maten.** De bovenkant van de grond ligt op een van drie hoogtes:

| Naam | y | Uitleg |
| --- | --- | --- |
| `LOW` | 405 | de gewone grond, zoals tot nu toe |
| `MID` | 330 | 75 hoger: daar kan je naartoe springen |
| `HIGH` | 255 | 150 hoger: te hoog om te springen, je hebt een ladder nodig |

Waarom deze getallen? Je sprong (`-450`) met zwaartekracht `900` brengt je ongeveer 112 pixels hoog, en je hangt ongeveer 1 seconde in de lucht. Met een snelheid van `250` spring je dus ongeveer 250 pixels ver. Een muurtje van 70 hoog en een gat van 200 breed lukken dan, maar 150 omhoog lukt niet.

Waar twee levels elkaar raken, ligt de grond aan beide kanten even hoog. Zo kan je in beide richtingen van level naar level lopen.

## Stap 11: levels als data

Tot nu toe stond alles in `GameScene.js`. Nu komt de inhoud van elk level in een eigen bestand. `GameScene.js` leest dat bestand en bouwt alle levels.

**Waarom een apart bestand?** Zo hoef je voor een nieuw level geen code te schrijven, alleen getallen in te vullen. En omdat alle levels van bij de start bekend zijn, bouw je ze allemaal meteen. Dan heb je `buildPage()` en `this.lastPage` uit stap 10 niet meer nodig.

### 11.1 Het bestand `levels.js`

Maak een nieuw bestand `src/levels.js`:

```javascript
export const LOW = 405;
export const MID = 330;
export const HIGH = 255;

export const LEVELS = [
  { ground: [{ x: 0, w: 800, top: LOW }] },
  { ground: [{ x: 0, w: 800, top: LOW }] },
  { ground: [{ x: 0, w: 800, top: LOW }] },
  { ground: [{ x: 0, w: 800, top: LOW }] },
  { ground: [{ x: 0, w: 800, top: LOW }] },
];
```

- `LEVELS` is een lijst met vijf levels. Elk level is een object.
- `ground` is een lijst met stukken grond. Elk stuk heeft een `x` (waar het begint), een `w` (hoe breed het is) en een `top` (hoe hoog de bovenkant ligt).
- `x` is gemeten **binnen het level**, van 0 tot 800. `GameScene.js` telt er zelf de plek van het level bij op.
- Voorlopig heeft elk level één stuk grond over de hele breedte. In de volgende stappen vul je dit aan.

### 11.2 `GameScene.js` herschrijven

Bovenaan, onder de import van Phaser:

```javascript
import { LEVELS } from '../levels.js';
```

Vervang `create()`, `buildPage()` en `showPage()` door:

```javascript
create() {
  const { height } = this.scale;

  this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
  this.physics.add.existing(this.block);
  this.block.body.setCollideWorldBounds(true);

  this.solid = this.physics.add.staticGroup();
  this.physics.add.collider(this.block, this.solid);

  LEVELS.forEach((level, i) => this.buildLevel(level, i));

  this.arrows = this.input.keyboard.createCursorKeys();

  this.showPage();
}

buildLevel(level, i) {
  const { width, height } = this.scale;
  const x = i * width;

  level.ground.forEach((ground) => {
    this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
  });

  this.add.text(x + 20, 20, `Level ${i + 1}`, { fontSize: '24px', color: '#333333' });
}

addSolid(x, y, w, h) {
  const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
  this.solid.add(rect);
}

showPage() {
  const { width, height } = this.scale;
  this.pageX = (this.level - 1) * width;

  this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, this.level === LEVELS.length, true, true);

  this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
}
```

- `this.physics.add.staticGroup()` is een **groep** van objecten die niet bewegen. Alles waar het blokje op kan staan of tegen kan botsen, komt in `this.solid`. Je hebt dan maar **één** `collider` nodig, in plaats van één per platform.
- `LEVELS.forEach((level, i) => ...)` loopt door alle levels. `i` is 0 voor level 1, 1 voor level 2, enzovoort. Level `i` begint op `x = i * width`.
- `addSolid()` maakt een rechthoek en steekt hem in `this.solid`. Ook muurtjes en plafonds gebruiken straks deze functie.
- `setOrigin(0)` zet het ankerpunt van de rechthoek in de **linkerbovenhoek**, in plaats van in het midden. Dan zijn `x` en `y` gewoon de linkerbovenhoek, en dat leest makkelijker in `levels.js`.
- De grond loopt van `ground.top` tot onderaan het scherm (`height - ground.top` hoog). Zo ziet een hoger platform eruit als een blok dat op de grond staat, en niet als een zwevende plank.
- In `setBounds` is de rechterrand nu een muur in het **laatste** level (`this.level === LEVELS.length`). Na level 5 is er niets meer.

### 11.3 `update()` aanpassen

`buildPage()` bestaat niet meer. Vervang het blok onderaan `update()` door:

```javascript
const { width } = this.scale;

if (this.block.x > this.pageX + width + 20) {
  this.level += 1;
  this.showPage();
} else if (this.block.x < this.pageX - 20) {
  this.level -= 1;
  this.showPage();
}
```

**Test:**

1. Je ziet `Level 1` en de grond loopt tot onderaan het scherm.
2. Loop naar rechts tot `Level 5`. In level 5 stopt het blokje tegen de rechterrand.
3. Loop terug naar `Level 1`.

```bash
git add game/src
git commit -m "Move levels to data file"
git push
```

### Zo ziet `GameScene.js` er na stap 11 uit

```javascript
import * as Phaser from 'phaser';
import { LEVELS } from '../levels.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.solid = this.physics.add.staticGroup();
    this.physics.add.collider(this.block, this.solid);

    LEVELS.forEach((level, i) => this.buildLevel(level, i));

    this.arrows = this.input.keyboard.createCursorKeys();

    this.showPage();
  }

  buildLevel(level, i) {
    const { width, height } = this.scale;
    const x = i * width;

    level.ground.forEach((ground) => {
      this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
    });

    this.add.text(x + 20, 20, `Level ${i + 1}`, { fontSize: '24px', color: '#333333' });
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
    this.solid.add(rect);
  }

  showPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, this.level === LEVELS.length, true, true);

    this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    const { width } = this.scale;

    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
```

## Stap 12: gaten om over te springen

Level 1, deel 1: een gat in de grond. Spring je er niet over, dan val je erin en begin je opnieuw aan het begin van het level.

### 12.1 Het gat in `levels.js`

Een gat is gewoon een plek **zonder** grond. Vervang daarom het eerste level door twee stukken grond met 200 pixels ertussen:

```javascript
{
  ground: [
    { x: 0, w: 100, top: LOW },
    { x: 300, w: 500, top: LOW },
  ],
},
```

Het gat loopt van `x = 100` tot `x = 300`.

### 12.2 De onderrand openzetten

Tot nu toe is de onderkant van de wereld een muur. Het blokje zou dan op de bodem van het gat blijven liggen. Zet in `showPage()` de laatste waarde van `setBounds` (onder) op `false`:

```javascript
this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, this.level === LEVELS.length, true, false);
```

### 12.3 Opnieuw beginnen als je valt

Valt het blokje onder het scherm, dan zet je het terug aan het begin van het level. Vervang in `update()` de regel `const { width } = this.scale;` door:

```javascript
const { width, height } = this.scale;

if (this.block.y > height + 50) {
  const start = LEVELS[this.level - 1].ground[0];
  this.block.body.reset(this.pageX + start.x + 40, start.top - 40);
}
```

- `this.block.y > height + 50` betekent: het blokje is helemaal onder het scherm verdwenen.
- `LEVELS[this.level - 1]` is het huidige level. `- 1` is nodig omdat een lijst bij 0 begint en je levels bij 1.
- `ground[0]` is het eerste stuk grond. Daar zet je het blokje terug.
- `this.block.body.reset(x, y)` zet het blokje op een nieuwe plek **en** zet zijn snelheid op 0. Met alleen `this.block.x = ...` zou het blokje met zijn valsnelheid verder vallen.
- `start.top - 40` zet het blokje net boven de grond, zodat het er even op valt.

**Test:**

1. Loop zonder springen naar rechts: je valt in het gat en staat weer links in level 1.
2. Spring er met het pijltje omhoog over: dat lukt.

```bash
git add game/src
git commit -m "Add gaps and respawn"
git push
```

## Stap 13: muurtjes om over te springen

Level 1, deel 2: een muurtje dat je niet voorbij kan lopen. Je moet erover springen.

### 13.1 Het muurtje in `levels.js`

Geef het eerste level een lijst `walls`:

```javascript
{
  ground: [
    { x: 0, w: 100, top: LOW },
    { x: 300, w: 500, top: LOW },
  ],
  walls: [{ x: 580, w: 40, h: 70, top: LOW }],
},
```

- `h: 70` is de hoogte van het muurtje. Je springt ongeveer 112 hoog, dus dat lukt.
- `top: LOW` zegt op welke grond het muurtje staat.

### 13.2 Muurtjes bouwen

Voeg in `buildLevel()` toe, onder de lus voor `ground`:

```javascript
(level.walls ?? []).forEach((wall) => {
  this.addSolid(x + wall.x, wall.top - wall.h, wall.w, wall.h);
});
```

- Niet elk level heeft muurtjes. Dan is `level.walls` `undefined`, en `undefined.forEach` geeft een fout. `?? []` maakt er dan een lege lijst van, en een lege lijst doet gewoon niets.
- `wall.top - wall.h` is de bovenkant van het muurtje: het staat **op** de grond en steekt `h` pixels omhoog.
- Een muurtje is ook `solid`, dus het blokje botst ertegen en kan erop staan. Daarvoor hoef je niets nieuws te schrijven: de `collider` uit stap 11 doet het al.

**Test:** in level 1 loop je eerst over het gat, en daarna stop je tegen het muurtje. Spring erover en loop door naar level 2.

```bash
git add game/src
git commit -m "Add jump obstacles"
git push
```

## Stap 14: hoogtes en een ladder

Level 2, deel 1: het platform rechts ligt op `HIGH`, 150 pixels hoger. Dat is te hoog om te springen. Je klimt er met een ladder op.

**Hoe werkt klimmen?** Staat het blokje voor een ladder, dan zet je de zwaartekracht uit. Met pijltje omhoog of omlaag beweegt het blokje dan recht op of neer. Ga je van de ladder af, dan zet je de zwaartekracht weer aan.

**Waarom is de ladder geen `solid`?** Je botst niet tegen een ladder, je loopt erdoor. De ladder is gewoon een rechthoek die je tekent. Je controleert zelf of de voeten van het blokje erin staan.

### 14.1 De ladder in `levels.js`

Vervang het tweede level door:

```javascript
{
  ground: [
    { x: 0, w: 300, top: LOW },
    { x: 300, w: 500, top: HIGH },
  ],
  ladders: [{ x: 260, top: HIGH - 45, bottom: LOW }],
},
```

- Links ligt de grond op `LOW`, rechts op `HIGH`.
- De ladder staat links tegen het hoge platform (`x: 260`, en de ladder is 40 breed).
- De ladder steekt 45 pixels **boven** het platform uit (`HIGH - 45`). Bovenaan staat je blokje dan hoger dan het platform, en kan je erop stappen.

### 14.2 Ladders bouwen

Voeg in `create()` toe, net onder `this.physics.add.collider(...)`:

```javascript
this.ladders = [];
```

Zet het blokje vóór alles wat je later tekent. Voeg onder de regel met `this.add.rectangle(...)` van het blokje toe:

```javascript
this.block.setDepth(1);
```

Phaser tekent objecten in de volgorde waarin je ze maakt. Het blokje wordt als eerste gemaakt, dus de ladder zou erover getekend worden. `setDepth(1)` legt het blokje bovenop.

Voeg in `buildLevel()` toe, onder de lus voor `walls`:

```javascript
(level.ladders ?? []).forEach((ladder) => {
  const rect = this.add.rectangle(x + ladder.x, ladder.top, 40, ladder.bottom - ladder.top, 0x8d6e63).setOrigin(0);
  this.ladders.push(rect);
});
```

Voeg een nieuwe functie toe, onder `addSolid()`:

```javascript
isOnLadder() {
  const feet = this.block.getBottomCenter();
  return this.ladders.some((ladder) => ladder.getBounds().contains(feet.x, feet.y));
}
```

- `getBottomCenter()` geeft het punt midden onderaan het blokje: zijn voeten.
- `ladder.getBounds()` geeft de rechthoek van de ladder. `.contains(x, y)` zegt of een punt erin ligt.
- `some(...)` is `true` als het voor minstens één ladder klopt.
- Je kijkt naar de **voeten** en niet naar het hele blokje. Anders telt het al als "op de ladder" wanneer het blokje er net naast staat.

### 14.3 Klimmen in `update()`

Vervang in `update()` het blok voor springen (`if (this.arrows.up.isDown && this.block.body.blocked.down) { ... }`) door:

```javascript
const onLadder = this.isOnLadder();
this.block.body.setAllowGravity(!onLadder);

if (onLadder) {
  if (this.arrows.up.isDown) {
    this.block.body.setVelocityY(-150);
  } else if (this.arrows.down.isDown) {
    this.block.body.setVelocityY(150);
  } else {
    this.block.body.setVelocityY(0);
  }
} else if (this.arrows.up.isDown && this.block.body.blocked.down) {
  this.block.body.setVelocityY(-450);
}
```

- `setAllowGravity(!onLadder)`: op de ladder geen zwaartekracht, ernaast wel.
- Op de ladder: omhoog klimt, omlaag daalt, geen pijltje blijft hangen.
- Naast de ladder werkt springen zoals vroeger.

**Test:**

1. Loop naar level 2. Je stopt tegen het hoge platform.
2. Houd pijltje omhoog ingedrukt: je klimt de ladder op.
3. Bovenaan druk je pijltje rechts: je stapt op het platform.
4. Loop terug naar links, van het platform af: je valt op de ladder en blijft hangen. Met pijltje omlaag daal je af.

Level 3 is nog plat en ligt op `LOW`. Loop je van level 2 naar level 3, dan val je naar beneden. Dat los je op in stap 16.

```bash
git add game/src
git commit -m "Add ladders"
git push
```

### Zo ziet `GameScene.js` er na stap 14 uit

```javascript
import * as Phaser from 'phaser';
import { LEVELS } from '../levels.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e);
    this.block.setDepth(1);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.solid = this.physics.add.staticGroup();
    this.physics.add.collider(this.block, this.solid);
    this.ladders = [];

    LEVELS.forEach((level, i) => this.buildLevel(level, i));

    this.arrows = this.input.keyboard.createCursorKeys();

    this.showPage();
  }

  buildLevel(level, i) {
    const { width, height } = this.scale;
    const x = i * width;

    level.ground.forEach((ground) => {
      this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
    });

    (level.walls ?? []).forEach((wall) => {
      this.addSolid(x + wall.x, wall.top - wall.h, wall.w, wall.h);
    });

    (level.ladders ?? []).forEach((ladder) => {
      const rect = this.add.rectangle(x + ladder.x, ladder.top, 40, ladder.bottom - ladder.top, 0x8d6e63).setOrigin(0);
      this.ladders.push(rect);
    });

    this.add.text(x + 20, 20, `Level ${i + 1}`, { fontSize: '24px', color: '#333333' });
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
    this.solid.add(rect);
  }

  isOnLadder() {
    const feet = this.block.getBottomCenter();
    return this.ladders.some((ladder) => ladder.getBounds().contains(feet.x, feet.y));
  }

  showPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, this.level === LEVELS.length, true, false);

    this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    const onLadder = this.isOnLadder();
    this.block.body.setAllowGravity(!onLadder);

    if (onLadder) {
      if (this.arrows.up.isDown) {
        this.block.body.setVelocityY(-150);
      } else if (this.arrows.down.isDown) {
        this.block.body.setVelocityY(150);
      } else {
        this.block.body.setVelocityY(0);
      }
    } else if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    const { width, height } = this.scale;

    if (this.block.y > height + 50) {
      const start = LEVELS[this.level - 1].ground[0];
      this.block.body.reset(this.pageX + start.x + 40, start.top - 40);
    }

    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
```

## Stap 15: bukken

Level 2, deel 2: een plafond hangt zo laag dat het blokje er niet onder past. Met pijltje omlaag bukt het blokje: het wordt half zo hoog.

**Hoe werkt bukken?** Je maakt het blokje half zo hoog met `setScale(1, 0.5)`. De physics-body krimpt vanzelf mee. Er is één valkuil: laat je pijltje omlaag los terwijl je onder het plafond zit, dan zou het blokje in het plafond groeien. Daarom kijk je eerst of er boven het blokje plaats is om recht te staan.

### 15.1 Het plafond in `levels.js`

Voeg aan het tweede level een lijst `ceilings` toe:

```javascript
{
  ground: [
    { x: 0, w: 300, top: LOW },
    { x: 300, w: 500, top: HIGH },
  ],
  ladders: [{ x: 260, top: HIGH - 45, bottom: LOW }],
  ceilings: [{ x: 560, w: 80, bottom: HIGH - 30 }],
},
```

- Het plafond hangt van de bovenkant van het scherm tot `bottom`.
- Onder het plafond blijft 30 pixels plaats. Het blokje is 40 hoog, gebukt 20. Gebukt past het er dus onder, recht niet.
- Het plafond begint bovenaan het scherm, dus je kan er niet over springen.

### 15.2 Plafonds bouwen

Voeg in `buildLevel()` toe, onder de lus voor `walls`:

```javascript
(level.ceilings ?? []).forEach((ceiling) => {
  this.addSolid(x + ceiling.x, 0, ceiling.w, ceiling.bottom);
});
```

Een plafond is ook `solid`: het blokje botst ertegen.

### 15.3 Het blokje krimpt naar zijn voeten

`setScale` krimpt een object naar zijn ankerpunt. Dat ligt nu in het midden, dus het blokje zou naar het midden krimpen en een stukje zweven. Zet het ankerpunt onderaan. Pas in `create()` de regel van het blokje aan:

```javascript
this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e).setOrigin(0.5, 1);
```

`setOrigin(0.5, 1)` betekent: horizontaal in het midden, verticaal helemaal onderaan. `this.block.y` is nu de plek van de voeten. Je controle in `update()` voor de linker- en rechterrand gebruikt alleen `this.block.x`, en die blijft het midden.

### 15.4 Bukken in `update()`

Voeg in `update()` toe, onder het blok voor klimmen en springen:

```javascript
const roomToStand = this.physics.overlapRect(this.block.x - 18, this.block.y - 40, 36, 20, false, true).length === 0;
const crouch = (this.arrows.down.isDown && !onLadder) || !roomToStand;
this.block.setScale(1, crouch ? 0.5 : 1);
```

- `this.physics.overlapRect(x, y, breedte, hoogte, false, true)` geeft alle **vaste** objecten (`true`) die in die rechthoek liggen. Bewegende objecten (`false`), zoals het blokje zelf, telt het niet mee.
- De rechthoek is de plek van de bovenste helft van een rechtstaand blokje: van `y - 40` tot `y - 20`. Ligt daar iets, dan is er geen plaats om recht te staan.
- `36` en `- 18` in plaats van `40` en `- 20`: de rechthoek is iets smaller dan het blokje. Anders telt een muur waar je net tegen staat ook als "geen plaats".
- Je bukt als je pijltje omlaag indrukt en niet op een ladder staat (daar betekent omlaag "afdalen"), **of** als er geen plaats is om recht te staan.

**Test:**

1. Klim in level 2 de ladder op en loop naar rechts. Je stopt tegen het plafond.
2. Houd pijltje omlaag ingedrukt en loop verder: het blokje bukt en past eronder.
3. Laat pijltje omlaag los terwijl je onder het plafond zit: het blokje blijft gebukt tot je eronderuit bent.

```bash
git add game/src
git commit -m "Add crouching"
git push
```

### Zo ziet `GameScene.js` er na stap 15 uit

```javascript
import * as Phaser from 'phaser';
import { LEVELS } from '../levels.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e).setOrigin(0.5, 1);
    this.block.setDepth(1);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.solid = this.physics.add.staticGroup();
    this.physics.add.collider(this.block, this.solid);
    this.ladders = [];

    LEVELS.forEach((level, i) => this.buildLevel(level, i));

    this.arrows = this.input.keyboard.createCursorKeys();

    this.showPage();
  }

  buildLevel(level, i) {
    const { width, height } = this.scale;
    const x = i * width;

    level.ground.forEach((ground) => {
      this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
    });

    (level.walls ?? []).forEach((wall) => {
      this.addSolid(x + wall.x, wall.top - wall.h, wall.w, wall.h);
    });

    (level.ceilings ?? []).forEach((ceiling) => {
      this.addSolid(x + ceiling.x, 0, ceiling.w, ceiling.bottom);
    });

    (level.ladders ?? []).forEach((ladder) => {
      const rect = this.add.rectangle(x + ladder.x, ladder.top, 40, ladder.bottom - ladder.top, 0x8d6e63).setOrigin(0);
      this.ladders.push(rect);
    });

    this.add.text(x + 20, 20, `Level ${i + 1}`, { fontSize: '24px', color: '#333333' });
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
    this.solid.add(rect);
  }

  isOnLadder() {
    const feet = this.block.getBottomCenter();
    return this.ladders.some((ladder) => ladder.getBounds().contains(feet.x, feet.y));
  }

  showPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, this.level === LEVELS.length, true, false);

    this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    const onLadder = this.isOnLadder();
    this.block.body.setAllowGravity(!onLadder);

    if (onLadder) {
      if (this.arrows.up.isDown) {
        this.block.body.setVelocityY(-150);
      } else if (this.arrows.down.isDown) {
        this.block.body.setVelocityY(150);
      } else {
        this.block.body.setVelocityY(0);
      }
    } else if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    const roomToStand = this.physics.overlapRect(this.block.x - 18, this.block.y - 40, 36, 20, false, true).length === 0;
    const crouch = (this.arrows.down.isDown && !onLadder) || !roomToStand;
    this.block.setScale(1, crouch ? 0.5 : 1);

    const { width, height } = this.scale;

    if (this.block.y > height + 50) {
      const start = LEVELS[this.level - 1].ground[0];
      this.block.body.reset(this.pageX + start.x + 40, start.top - 40);
    }

    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
```

## Stap 16: level 3 en 4

Alle soorten obstakels bestaan nu. Level 3 en 4 zijn daarom **alleen data**: je past `levels.js` aan, en `GameScene.js` blijft zoals het is.

**Waarom is dit belangrijk?** Dit is het bewijs dat de opbouw klopt. Een nieuw level maken kost geen code meer, alleen getallen. Zo kan je later snel levels bijmaken of aanpassen, bijvoorbeeld na een test met kinderen.

Vervang het derde en het vierde level in `levels.js` door:

```javascript
{
  ground: [
    { x: 0, w: 240, top: HIGH },
    { x: 360, w: 440, top: MID },
  ],
  walls: [{ x: 580, w: 40, h: 70, top: MID }],
},
{
  ground: [
    { x: 0, w: 220, top: MID },
    { x: 340, w: 200, top: MID },
    { x: 660, w: 140, top: LOW },
  ],
},
```

- **Level 3** begint op `HIGH`, want level 2 eindigt op `HIGH`. Deel 1 is een gat, en je landt lager, op `MID`. Deel 2 is een muurtje op `MID`.
- **Level 4** begint op `MID`, want level 3 eindigt op `MID`. Deel 1 is een gat op dezelfde hoogte. Deel 2 is een gat naar `LOW`, terug naar de gewone grond.
- Level 4 eindigt op `LOW`, net zoals level 5 begint.

**Test:**

1. Speel van level 1 tot level 5.
2. Val in elk gat één keer: je begint telkens opnieuw aan het begin van **dat** level, en niet in level 1.
3. Loop van level 4 terug naar level 2. Aan elke rand ligt de grond aan beide kanten even hoog.

```bash
git add game/src
git commit -m "Fill levels 3 and 4"
git push
```

## Stap 17: level 5, de poort en het eindscherm

Level 5: in deel 1 buk je onder een plafond, in deel 2 klim je een ladder op. Bovenaan staat een poort. Loop je erdoor, dan zie je 3 seconden een eindscherm en begint alles opnieuw bij level 1.

### 17.1 Level 5 in `levels.js`

Vervang het vijfde level door:

```javascript
{
  ground: [
    { x: 0, w: 500, top: LOW },
    { x: 500, w: 300, top: HIGH },
  ],
  ceilings: [{ x: 200, w: 80, bottom: LOW - 30 }],
  ladders: [{ x: 460, top: HIGH - 45, bottom: LOW }],
  gate: { x: 700, top: HIGH },
},
```

Een level heeft maar één poort. Daarom is `gate` een object en geen lijst.

### 17.2 De poort bouwen

Voeg in `create()` toe, onder `this.ladders = [];`:

```javascript
this.gate = null;
```

Voeg in `buildLevel()` toe, onder de lus voor `ladders`:

```javascript
if (level.gate) {
  this.gate = this.add.rectangle(x + level.gate.x, level.gate.top - 80, 40, 80, 0x2e86ab).setOrigin(0);
}
```

De poort is 40 breed en 80 hoog, en staat op `level.gate.top`. Ze is geen `solid`: je loopt erdoor.

### 17.3 Door de poort gaan

Voeg in `update()` toe, net vóór `if (this.block.x > this.pageX + width + 20) {`:

```javascript
if (this.gate && this.block.x > this.gate.x + 20) {
  this.scene.start('end');
  return;
}
```

- `this.gate.x` is de linkerrand van de poort, door `setOrigin(0)`. Is het midden van het blokje 20 pixels voorbij die rand, dan staat het in de poort.
- `this.scene.start('end')` stopt deze scène en start de scène met de naam `'end'`.
- `return` stopt de rest van `update()`. De scène is toch gestopt, dus de rest hoeft niet meer te gebeuren.

### 17.4 Het eindscherm

Maak een nieuw bestand `src/scenes/EndScene.js`:

```javascript
import * as Phaser from 'phaser';

export class EndScene extends Phaser.Scene {
  constructor() {
    super('end');
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2, 'Einde', { fontSize: '48px', color: '#333333' }).setOrigin(0.5);

    this.time.delayedCall(3000, () => this.scene.start('game'));
  }
}
```

- `super('end')` geeft deze scène de naam `'end'`. Die naam gebruik je in `this.scene.start('end')`.
- `setOrigin(0.5)` zet het ankerpunt van de tekst in het midden, zodat de tekst echt in het midden van het scherm staat.
- `this.time.delayedCall(3000, ...)` voert de functie na 3000 milliseconden uit. Er is dus geen toets nodig, wat handig is voor een installatie zonder toetsenbord.
- `this.scene.start('game')` start `GameScene` opnieuw. Er wordt geen `level` meegegeven, dus `init(data)` begint weer bij level 1.

### 17.5 De scène registreren in `main.js`

Phaser kent alleen de scènes die in de config staan. Voeg in `src/main.js` de import toe, onder de import van `GameScene`:

```javascript
import { EndScene } from './scenes/EndScene.js';
```

En zet de scène in de lijst:

```javascript
scene: [GameScene, EndScene],
```

De **eerste** scène in de lijst start automatisch. Daarom staat `GameScene` vooraan.

**Test:**

1. Speel tot level 5. Buk onder het plafond en klim de ladder op.
2. Loop naar rechts, door de blauwe poort: je ziet `Einde`.
3. Na 3 seconden sta je weer in level 1.

```bash
git add game/src
git commit -m "Add gate and end screen"
git push
```

### Zo ziet `levels.js` er na stap 17 uit

```javascript
export const LOW = 405;
export const MID = 330;
export const HIGH = 255;

export const LEVELS = [
  {
    ground: [
      { x: 0, w: 100, top: LOW },
      { x: 300, w: 500, top: LOW },
    ],
    walls: [{ x: 580, w: 40, h: 70, top: LOW }],
  },
  {
    ground: [
      { x: 0, w: 300, top: LOW },
      { x: 300, w: 500, top: HIGH },
    ],
    ladders: [{ x: 260, top: HIGH - 45, bottom: LOW }],
    ceilings: [{ x: 560, w: 80, bottom: HIGH - 30 }],
  },
  {
    ground: [
      { x: 0, w: 240, top: HIGH },
      { x: 360, w: 440, top: MID },
    ],
    walls: [{ x: 580, w: 40, h: 70, top: MID }],
  },
  {
    ground: [
      { x: 0, w: 220, top: MID },
      { x: 340, w: 200, top: MID },
      { x: 660, w: 140, top: LOW },
    ],
  },
  {
    ground: [
      { x: 0, w: 500, top: LOW },
      { x: 500, w: 300, top: HIGH },
    ],
    ceilings: [{ x: 200, w: 80, bottom: LOW - 30 }],
    ladders: [{ x: 460, top: HIGH - 45, bottom: LOW }],
    gate: { x: 700, top: HIGH },
  },
];
```

### Zo ziet `GameScene.js` er na stap 17 uit

```javascript
import * as Phaser from 'phaser';
import { LEVELS } from '../levels.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.level = data.level ?? 1;
  }

  create() {
    const { height } = this.scale;

    this.block = this.add.rectangle(40, height - 100, 40, 40, 0xe4572e).setOrigin(0.5, 1);
    this.block.setDepth(1);
    this.physics.add.existing(this.block);
    this.block.body.setCollideWorldBounds(true);

    this.solid = this.physics.add.staticGroup();
    this.physics.add.collider(this.block, this.solid);
    this.ladders = [];
    this.gate = null;

    LEVELS.forEach((level, i) => this.buildLevel(level, i));

    this.arrows = this.input.keyboard.createCursorKeys();

    this.showPage();
  }

  buildLevel(level, i) {
    const { width, height } = this.scale;
    const x = i * width;

    level.ground.forEach((ground) => {
      this.addSolid(x + ground.x, ground.top, ground.w, height - ground.top);
    });

    (level.walls ?? []).forEach((wall) => {
      this.addSolid(x + wall.x, wall.top - wall.h, wall.w, wall.h);
    });

    (level.ceilings ?? []).forEach((ceiling) => {
      this.addSolid(x + ceiling.x, 0, ceiling.w, ceiling.bottom);
    });

    (level.ladders ?? []).forEach((ladder) => {
      const rect = this.add.rectangle(x + ladder.x, ladder.top, 40, ladder.bottom - ladder.top, 0x8d6e63).setOrigin(0);
      this.ladders.push(rect);
    });

    if (level.gate) {
      this.gate = this.add.rectangle(x + level.gate.x, level.gate.top - 80, 40, 80, 0x2e86ab).setOrigin(0);
    }

    this.add.text(x + 20, 20, `Level ${i + 1}`, { fontSize: '24px', color: '#333333' });
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0x333333).setOrigin(0);
    this.solid.add(rect);
  }

  isOnLadder() {
    const feet = this.block.getBottomCenter();
    return this.ladders.some((ladder) => ladder.getBounds().contains(feet.x, feet.y));
  }

  showPage() {
    const { width, height } = this.scale;
    this.pageX = (this.level - 1) * width;

    this.physics.world.setBounds(this.pageX, 0, width, height, this.level === 1, this.level === LEVELS.length, true, false);

    this.cameras.main.pan(this.pageX + width / 2, height / 2, 600, 'Sine.easeInOut', true);
  }

  update() {
    if (this.arrows.left.isDown) {
      this.block.body.setVelocityX(-250);
    } else if (this.arrows.right.isDown) {
      this.block.body.setVelocityX(250);
    } else {
      this.block.body.setVelocityX(0);
    }

    const onLadder = this.isOnLadder();
    this.block.body.setAllowGravity(!onLadder);

    if (onLadder) {
      if (this.arrows.up.isDown) {
        this.block.body.setVelocityY(-150);
      } else if (this.arrows.down.isDown) {
        this.block.body.setVelocityY(150);
      } else {
        this.block.body.setVelocityY(0);
      }
    } else if (this.arrows.up.isDown && this.block.body.blocked.down) {
      this.block.body.setVelocityY(-450);
    }

    const roomToStand = this.physics.overlapRect(this.block.x - 18, this.block.y - 40, 36, 20, false, true).length === 0;
    const crouch = (this.arrows.down.isDown && !onLadder) || !roomToStand;
    this.block.setScale(1, crouch ? 0.5 : 1);

    const { width, height } = this.scale;

    if (this.block.y > height + 50) {
      const start = LEVELS[this.level - 1].ground[0];
      this.block.body.reset(this.pageX + start.x + 40, start.top - 40);
    }

    if (this.gate && this.block.x > this.gate.x + 20) {
      this.scene.start('end');
      return;
    }

    if (this.block.x > this.pageX + width + 20) {
      this.level += 1;
      this.showPage();
    } else if (this.block.x < this.pageX - 20) {
      this.level -= 1;
      this.showPage();
    }
  }
}
```

## Klaar met deze fase

Werkt alles, dan zet je de branch in `main`:

```bash
git switch main
git pull
git merge --no-ff --no-edit phaser
git push
```

`--no-ff` houdt in de geschiedenis zichtbaar dat dit een aparte stap was. Handig om je proces aan de jury te tonen.

## Werkt het niet?

- **Het blokje valt door het platform:** de regel met `this.physics.add.collider` ontbreekt, of het platform kreeg geen body met `this.physics.add.existing`.
- **Het blokje springt niet:** `body.blocked.down` is alleen `true` als het blokje op het platform staat.
- **Altijd `Scène 1`:** controleer of `init(data)` exact zo geschreven is, en of je `{ level: this.level + 1 }` meegeeft aan `restart`.
- **Het beeld schuift niet mee (stap 9):** controleer of je `this.cameras.main.pan(...)` oproept ná `this.buildPage()`. Anders schuift de camera naar de oude pagina.
- **Het blokje valt bij de overgang uit de wereld (stap 9):** `buildPage()` maakt de collider met `this.block`. Roep `buildPage()` daarom in `create()` pas op nadat het blokje gemaakt is.
- **Dubbele tekst of twee platformen (stap 10):** `buildPage()` wordt te vaak opgeroepen. Controleer de voorwaarde `this.level > this.lastPage`, en dat `this.lastPage = this.level` onderaan `buildPage()` staat.
- **Het blokje loopt links uit scène 1 (stap 10):** controleer of de vijfde waarde van `setBounds` in `showPage()` exact `this.level === 1` is.
- **De pijltjes werken niet meer (stap 10 of later):** de code voor `left`, `right` en `up` bovenaan `update()` is weg. Vergelijk je `update()` met de volledige code van de laatste stap.
- **`Cannot read properties of undefined (reading 'forEach')` (stap 13 of later):** je bent `?? []` vergeten bij `level.walls`, `level.ceilings` of `level.ladders`.
- **Je valt in een gat en blijft onderaan liggen (stap 12):** de laatste waarde van `setBounds` in `showPage()` moet `false` zijn.
- **Je begint na een val in level 1 in plaats van in het huidige level (stap 12):** controleer `LEVELS[this.level - 1]` en `this.pageX + start.x + 40`.
- **Het blokje verdwijnt achter de ladder (stap 14):** `this.block.setDepth(1)` ontbreekt.
- **Je klimt niet (stap 14):** `isOnLadder()` kijkt naar de voeten. Sta je wel midden voor de ladder? Controleer ook of `this.ladders = []` vóór `LEVELS.forEach(...)` staat.
- **Het blokje zweeft of zakt in de grond bij het bukken (stap 15):** `setOrigin(0.5, 1)` ontbreekt bij het blokje.
- **Het blokje blijft altijd gebukt (stap 15):** controleer de getallen in `overlapRect`: `this.block.x - 18`, `this.block.y - 40`, `36`, `20`, `false`, `true`.
- **Niets gebeurt bij de poort (stap 17):** staat `EndScene` in de lijst `scene` in `main.js`? En heet de scène in `super(...)` exact `'end'`?
- **Wit scherm:** open de console in Chrome (`Cmd + Option + J`) en lees de rode foutmelding.
- **`Missing script: "dev"`:** je staat niet in de map `game`.
