# Credits kaartsets

Beide kaartsets zijn CC0 (publiek domein), vrij voor commercieel gebruik. Naamsvermelding is niet verplicht, maar wel gewenst.

| Set | Maker | Bron | Licentie |
| --- | --- | --- | --- |
| `heratexx` | heratexx | https://opengameart.org/sites/default/files/4color_deck_by_heratexx.zip | CC0 1.0 |
| `austingabriel` | AustinGabriel | https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards (commit `3765067c32fcef42a30e87022332db729658e7cd`) | CC0 1.0 |

Wijzigingen ten opzichte van de originelen (gedaan door `scripts/import-cards.mjs`):

- Bestanden hernoemd naar `<kleur><rang>.svg` en geoptimaliseerd met SVGO.
- De rangletters in de hoeken zijn weggehaald; de app tekent ze zelf zodat spelers hun letterset kunnen kiezen.
- `austingabriel`: de kleurtekens zijn omgekleurd naar het vierkleurendeck (schoppen zwart, harten rood, klaveren groen, ruiten blauw). De illustraties van de plaatjes zijn niet gewijzigd.

Elke map bevat het licentiebestand van de bron (`LICENSE.txt`).

## Achterkanten

De achterkanten staan in `public/cards/backs/`. Vier zijn eigen ontwerpen, gegenereerd door `scripts/generate-card-backs.mjs` (dobbelstenen, chaos fractals met de drakenkromme van Heighway, Maastricht met de Helpoort, de Sint-Servaasbrug en de Sint-Janskerk, en scouting). Het scoutingthema bevat geen bestaande logo's en kan worden vervangen door aangeleverd beeld (zet een ander `back.svg` in die map).

Het vijfde thema, `traditional`, is de blauwe achterkant van AustinGabriel (CC0, zelfde bron en commit als hierboven), alleen geoptimaliseerd met SVGO.
