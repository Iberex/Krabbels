# krabbels-draw

Tekenpagina voor de iPad (Krabbels, BAP). Een kind tekent een Krabbel; die gaat naar Supabase,
en de hub op de demo-laptop haalt hem daar op voor het Femto-spel.

Gebouwd met `hub/tools/build-pages.js` in `demo-ipad`. Niet hier aanpassen.
De sleutel in `config.js` is de publishable key: daarmee kan je alleen een tekening toevoegen.

## Spel

`/spel/` is het Femto-spel. Het praat met de hub (`http://localhost:3000`) en de Femto-brug
(`ws://localhost:8765`) op de laptop waar je het opent; Chrome vraagt één keer of de pagina het
lokale netwerk mag gebruiken. Zonder Femto: `spel/?bron=webcam` speelt met een gewone webcam.
