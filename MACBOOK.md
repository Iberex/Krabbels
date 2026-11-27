# Krabbels op de MacBook

Het project staat op GitHub: <https://github.com/Iberex/Krabbels>, branch `phaser`.

Alle commando's typ je in de terminal (in VS Code: **Terminal > New Terminal**).

## Eenmalig: voorbereiden

**1. Git**

```bash
git --version
```

Vraagt macOS om de *Command Line Developer Tools* te installeren? Klik op **Install** en voer het commando daarna opnieuw uit.

**2. Node.js**

Download de **LTS**-installer (`.pkg`) van <https://nodejs.org> en installeer. Open daarna een nieuwe terminal:

```bash
node -v
npm -v
```

`node -v` moet 22.12 of hoger tonen.

**3. Wie ben je voor Git**

```bash
git config --global user.name "kimpe"
git config --global user.email "JOUW-SCHOOL-EMAIL"
```

Vervang `JOUW-SCHOOL-EMAIL` door hetzelfde adres als op je andere laptop.

## Eenmalig: het project binnenhalen

```bash
cd ~/Desktop
git clone https://github.com/Iberex/Krabbels.git
cd Krabbels
git switch phaser
cd game
npm install
```

- Vraagt Git om in te loggen, gebruik dan je GitHub-account. Een gewoon wachtwoord werkt niet in de terminal: meld je aan via het venster van VS Code of de browser.
- `npm install` is nodig omdat `node_modules` niet op GitHub staat.

Open daarna de map in VS Code: **File > Open Folder > Krabbels**.

## Het spel starten

```bash
cd ~/Desktop/Krabbels/game
npm run dev
```

Open <http://localhost:5173> in Chrome. Stoppen doe je met `Ctrl + C`.

Volledig scherm: `Ctrl + Cmd + F`. Hard herladen: `Cmd + Shift + R`.

## Elke keer dat je van laptop wisselt

**Voor je begint** (haal het nieuwste werk op):

```bash
cd ~/Desktop/Krabbels
git switch phaser
git pull
```

Is `package.json` veranderd? Voer dan ook `npm install` uit in de map `game`.

**Als je stopt** (zet je werk online):

```bash
git status
git add game
git commit -m "Korte beschrijving van wat je deed"
git push
```

Op de Windows-laptop doe je net hetzelfde: eerst `git pull`, op het einde `git push`.

## Wat niet meekomt

- `node_modules/`: maak je opnieuw met `npm install`.
- `game/README.md` (de stap-voor-stap-uitleg): die staat bewust niet in Git. Wil je ze op de Mac, stuur ze dan zelf door (mail, OneDrive of USB).

## Werkt het niet?

- `command not found: node`: sluit de terminal en VS Code en open ze opnieuw.
- `Missing script: "dev"`: je staat niet in de map `game`.
- `git pull` weigert door lokale wijzigingen: commit ze eerst, of vraag hulp. Gooi niets weg.
