# Drie op een rij (issue #29): ontwerp

Status: goedgekeurd 2026-11-16. Bron: issue #29 ("GAME - Jewel Match") plus de besluiten hieronder.
Waar de besluiten afwijken van de oorspronkelijke spec, gelden de besluiten.

## Besluiten (2026-11-16)

- **Naam:** "Drie op een rij" (slug `drie-op-een-rij`), Engels "Match Three". Geen namen, afbeeldingen of
  uiterlijk van Bejeweled, Jewel Match of G5-games. De eerste twee thema's heten **Facet** (koel en
  geslepen) en **Goudrand** (warm, afgerond, gouden rand); in de spec hieronder staan ze nog als
  "Bejeweled" en "Jewel Match". Alle SVG's worden zelf getekend.
- **Opzet:** solo, op een eigen route, alles in de browser en localStorage; geen lobby en geen PHP. De
  engine is puur TypeScript en deterministisch, zodat later een wedstrijdvariant via de lobby kan
  (zelfde seed). Die wordt nu niet gebouwd.
- **Tempo:** automatisch door; per fase een PR ("Onderdeel van #29"), mergen en verder. De laatste PR
  sluit #29.
- **Taal:** NL en EN via i18n-sleutels, standaard NL, met de taalwissel van het platform. Spelteksten
  staan in eigen woordenboeken (`games/drie-op-een-rij/i18n/`) die met de route lazy laden.
- **"Mijn lobby"** ingevuld: Angular 22.2, lazy routes, SCSS met `--dg-*`-variabelen, localStorage, npm,
  Hostinger/Apache met `public/.htaccess` (CSP in fase 6), Vitest via `@angular/build:unit-test`.
- **Eigen keuzes:** stenen minstens 56 px op desktop, op telefoons schaalt het bord mee; lettertype
  Atkinson Hyperlegible via `@fontsource` alleen in dit spel; geluid via Web Audio (geen bestanden);
  geen SQL-migraties nodig.

## Uitwerkingen in de engine (fase 1)

- **Introductielevel:** het register legt de volgorde vast. Het werkelijke level is 2, 4, 6, ... in die
  volgorde, alleen over de elementen die aan staan. Zo komt er hooguit één nieuw element per level bij en
  vallen er geen lange gaten als maar een paar elementen aan staan.
- **Moeilijkheid en soorten stenen:** Makkelijk gebruikt één soort minder (minimaal 4). Uitdagend
  gebruikt er niet meer dan de instelling, want het thema bepaalt het maximum en het thema mag het bord
  niet beïnvloeden.
- **Valobjecten** (amulet, veer) mogen gewisseld worden zolang er een match uit volgt.
- **Explosies** raken alleen stenen die stabiel zijn; een steen die nog valt, gaat erdoorheen.
- **Cascadediepte:** matches van dezelfde reeks in dezelfde tick delen hun diepte.
- **Beurteindes** lopen één per stilstand, in de volgorde van de zetten.
- **Property-test:** een vaste lus over 150 seeds in plaats van fast-check (geen extra pakket nodig).

## Oorspronkelijke spec (issue #29)

# Opdracht: match-3-spel in de stijl van Jewel Match, als game in mijn Angular Game Lobby

## Jouw rol en werkwijze
Je bent een senior Angular-developer en gamedesigner. Je bouwt een match-3-spel in de stijl van de Jewel Match-serie als nieuwe game binnen mijn bestaande Angular Game Lobby. De belangrijkste speler is mijn vader van 76. Rust, leesbaarheid en duidelijke feedback gaan daarom voor flitsende effecten.

Werk in fases (zie "Opleverfases" onderaan). Lever per fase volledige, werkende bestanden zonder weggelaten code of "...". Stop na elke fase en wacht op mijn "ga door". Benoem je aannames expliciet. Is iets in het blok "Mijn lobby" niet ingevuld of onduidelijk, stel dan eerst je vragen.

## Mijn lobby (ingevuld door mij)
- Angular-versie van de lobby: [VUL IN, bijv. 22.x]
- Hoe games in de lobby hangen: [VUL IN, bijv. lazy loaded route per game onder /games/<naam>]
- Bestaande gedeelde services, design tokens of styling: [VUL IN, bijv. CSS-variabelen, SCSS, Tailwind, ThemeService]
- Opslag van scores en instellingen: [VUL IN, bijv. localStorage of eigen backend-API]
- Package manager: [VUL IN: npm of pnpm]
- Hosting: [VUL IN, bijv. eigen server of container, wel/geen CSP-header]

## Begrippen (gebruik deze termen consequent in code, commentaar, tests en UI)
- Vakje (cell): één positie op het bord.
- Steen (tile): een matchbaar object in een vakje. Speciale stenen zijn ook stenen.
- Wissel (swap): een poging van de speler om twee aangrenzende stenen om te ruilen.
- Zet (move): een geaccepteerde wissel, dus een wissel die direct minstens één match oplevert. Een ongeldige wissel is geen zet. Een hamerslag is een actie, geen zet.
- Match: drie of meer gelijke stenen op een rij of kolom.
- Aangrenzend: direct boven, onder, links of rechts. Diagonaal telt niet, tenzij het er expliciet bij staat.
- Spelelement (mechanic): een optionele spelregel met eigen objecten, zoals een rotsblok of olie. In de lobby aan of uit te zetten.
- Bodemlaag: iets onder de steen in het vakje, zoals goud of zilver.
- Laag op een steen (overlay): iets wat aan een steen vastzit, zoals een ketting of hars.
- Blokkade: een vast object dat een vakje inneemt in plaats van een steen. Kan niet gewisseld worden en valt niet.
- Valobject: een niet-matchbaar object dat wel meevalt, zoals een amulet of veer.
- Raken (hit): één laag van een bodemlaag, overlay of blokkade weghalen.
- Explosie: het effect van een bom, kruis, combinatie, altaar of stekelbol op de vakjes in zijn bereik.
- Afhandeling (resolution): alles wat na een zet of hamerslag automatisch gebeurt: matches vinden, stenen verwijderen, objecten raken, speciale stenen activeren, stenen laten vallen (gravity) en het bord aanvullen (refill).
- Cascade: een nieuwe match die ontstaat doordat stenen gevallen, aangevuld, verschoven of van kleur veranderd zijn, zonder actie van de speler.
- Afhandelingsreeks (code: Resolution): één zet plus alle cascades die eruit voortkomen. Elke reeks heeft een eigen id en een eigen cascadediepte: 0 voor de match van de zet zelf, 1 voor de eerste cascade, enzovoort.
- Beurteinde (end of turn): de vaste fase waarin spelelementen met een beurtregel hun actie doen, één keer per zet. Bijvoorbeeld: olie verspreidt, een tijdbom telt af, een klimmer klimt.
- Stilstand: geen steen in beweging, geen match in afwachting en geen actieve afhandelingsreeks.
- Rustmoment (settled board): stilstand zonder openstaande beurteinde-acties.
- Spawnpunt: een vakje waar nieuwe stenen verschijnen.
- Stabiele steen: een steen in de toestand Stabiel (zie "Toestanden per steen").
- Invoervergrendeling (input lock): het bord accepteert tijdelijk geen wissels en geen hamerslagen.
- Tick: één vaste tijdstap van de simulatie (60 ticks per seconde).
- Verliesmechaniek: een spelelement waardoor je een level kunt verliezen, los van tijd of beurten.
- Let op: "ketting" is uitsluitend het obstakel op een steen en "rotsblok" is de blokkade. Gebruik het woord "steen" alleen voor matchbare stenen.

## Technische eisen (Angular)
Ga uit van Angular 22 (juni 2026). Je trainingsdata loopt mogelijk achter. Volg deze punten dus ook als je ze niet herkent en controleer bij twijfel op angular.dev. Draait mijn lobby op een oudere versie, kies dan de dichtstbijzijnde moderne variant en meld dat.
- Standalone components, geen NgModules.
- Signals voor alle state: signal(), computed() en linkedSignal(). Gebruik effect() alleen voor echte bijwerkingen zoals geluid of opslaan. Geen RxJS voor spelstate.
- Zoneless change detection (standaard sinds v21) en OnPush (standaard in v22). Geen zone.js en geen setTimeout-trucs om change detection te forceren.
- input(), output() en model() in plaats van decorators. inject() in plaats van constructor-injectie. Services met @Service() als de lobby op v22 zit, anders @Injectable({ providedIn: 'root' }).
- Nieuwe control flow: @if, @for (altijd met track), @switch en @defer voor zwaardere panelen zoals instellingen, spelelementen en themakeuze.
- Formulieren in de lobby met Signal Forms uit @angular/forms/signals.
- Toegankelijke schakelaars en uitklapgroepen in de lobby bij voorkeur met @angular/aria, als dat in de lobby beschikbaar is.
- Animaties met native CSS (transitions, @keyframes, @starting-style) en animate.enter / animate.leave. Gebruik NIET @angular/animations, dat pakket is deprecated.
- Respecteer prefers-reduced-motion. Dit schakelt alleen cosmetische effecten uit (gloed, pop, deeltjes) en verandert nooit de bewegingsduur in de engine.
- TypeScript strict, geen any.
- Unit tests met Vitest.
- Het spel is een lazy loaded route, zodat de lobby licht blijft.
- Andere npm-pakketten mogen, zolang ze tijdens runtime niets van internet laden.

## Architectuur
Scheid de spelmotor strikt van Angular:
1. engine/: pure TypeScript zonder Angular-imports. Een deterministische simulatie met een vaste tijdstap:
   - step(state) zet de simulatie één tick verder.
   - applyAction(state, action) verwerkt een wissel of hamerslag op de huidige tick en geeft { state, result, events } terug. result is Accepted of Rejected met een reden (bijv. 'input-locked', 'tile-not-stable', 'no-match', 'blocked-by-wall').
   - De engine is de enige bron van tijd en toestand. Bewegingsduren staan in ticks in de config en hangen alleen af van de instelling Animatiesnelheid.
   - De invoerinstelling Locked/Unlocked en de set actieve spelelementen zitten in de engineconfig en worden door de engine afgedwongen.
   - Events zijn bijvoorbeeld SwapStarted, SwapRejected, Matched, Cleared, Hit, ObjectDestroyed, FallStarted, Landed, Spawned, SpecialCreated, SpecialTriggered, TurnEndStarted, TurnEndFinished, Shuffled, Settled, GoalProgress, LevelWon en LevelLost, plus eigen events per spelelement.
2. engine/mechanics/: één module per spelelement, met een vaste interface, bijvoorbeeld:
   MechanicModule { id; place(ctx); onMatchAdjacent?; onMatchOnTop?; onExplosion?; onHammer?; onTurnEnd?; blocksFall?; blocksSwap?; goals?; loseCheck? }
   Plus een register MECHANICS met per element: id, bitIndex, categorie, standaardAan, introductieLevel, vereist (afhankelijkheden), isVerliesmechaniek, naam en uitleg in het Nederlands.
3. rng/: seeded random generator (zie verderop).
4. level/: level- en bordgenerator.
5. themes/: themamanifesten (alleen data, geen logica).
6. settings/: GameSettings-type, DEFAULT_SETTINGS, presets, validatie, migratie en opslag (zie "Instellingen onthouden").
7. ui/: Angular components zoals GameShell, Board, Tile, Hud (score, doelen, tijd of beurten, hamermeter), PauseDialog, ResultDialog, LobbySettings, MechanicsPanel en NewMechanicCard.
8. Een GameStore-service met signals. Die draait een requestAnimationFrame-lus met vaste tijdstap (fixed timestep met accumulator) en roept step() aan. De lus is alleen actief zolang het bord niet in rust is of de tijd loopt. De UI rendert posities rechtstreeks uit de engine-state (CSS transform gekoppeld aan signals). CSS-animaties zijn alleen cosmetisch en sturen nooit spellogica aan, dus geen logica op transitionend of animationend.

Rendering: een CSS-grid van <button>-elementen met daarin lokale SVG's (via <img> of inline <svg><use> uit een sprite per thema). Geen canvas, zodat toetsenbord en schermlezer werken. Stenen zijn in de engine abstracte types 0 tot en met n-1. Het thema bepaalt alleen hoe ze eruitzien.

## Celmodel
Elk vakje heeft lagen, van onder naar boven:
1. Bodemlaag: geen, zilver of goud. Optioneel ligt er een verborgen schat onder.
2. Inhoud: precies één van: steen, valobject, blokkade, deel van een groot blok, of leeg (alleen tijdelijk tijdens een afhandeling).
3. Laag op de steen: geen, ketting (1 of 2 schakels) of hars.
4. Vakjeskenmerken: muren op de randen, portaalingang of portaaluitgang, lopende band met richting, spawnpunt, uitgang voor reizigers.

Zwaartekracht:
- Stenen en valobjecten vallen recht naar beneden.
- Vaste dingen houden vallende stenen tegen: blokkades, grote blokken, stenen met ketting, reizigers en horizontale muren.
- Een vakje zonder vakje erboven waaruit stenen kunnen vallen, is een spawnpunt. Dat geldt voor de bovenrand van het bord, vakjes onder een gat in de bordvorm, vakjes direct onder een vast ding en vakjes onder een horizontale muur.
- Uitzondering: een portaaluitgang is geen spawnpunt, die wordt gevoed door de bijbehorende ingang.
- Elk spawnpunt heeft een eigen deelreeks van de seeded generator.

Algemene raakregels:
- Een match raakt de bodemlaag van elk vakje in de match één keer.
- Een match raakt elk aangrenzend object (blokkade, valobject, deel van een groot blok) hooguit één keer, ook als meerdere stenen van de match ernaast liggen.
- Een explosie raakt elk vakje in haar bereik één keer: steen weg, bodemlaag één keer geraakt, ketting één schakel, blokkade één laag. Uitzonderingen staan per spelelement.
- Bij een gelijktijdige treffer op hetzelfde object telt dat als één treffer per match of per explosie.

## Spelregels
De officiële regels zijn niet openbaar. Dit is mijn versie, gebaseerd op hoe de Jewel Match-serie werkt. Alle getallen zijn startwaarden: zet ze in één configbestand zodat ik ze kan bijstellen.

### Basis
- Bord standaard 8x8, instelbaar van 6x6 tot 10x10. Levels mogen onregelmatige vormen met gaten hebben.
- Aantal soorten stenen instelbaar van 5 tot 7, standaard 6. Minder soorten maakt het makkelijker. Een thema bepaalt het maximum (de Dobbelstenen-set heeft er bijvoorbeeld 6).
- Een wissel is alleen geldig als er direct minstens één match ontstaat. Anders schuiven de stenen rustig terug en kost het niets. Wisselen over een muur kan niet.
- Bediening: klik steen 1 en daarna een buur om te wisselen. Klik nogmaals op de geselecteerde steen om te deselecteren. Slepen en swipen mag ook. Toetsenbord: pijltjestoetsen plus Enter of spatie.
- Gematchte stenen verdwijnen, stenen erboven vallen naar beneden en via spawnpunten komen nieuwe stenen. Cascades leveren een oplopende bonus op.

### Doelen en verlies
- Elk level heeft een of meer doelen, gekozen uit de actieve spelelementen. Goud wegspelen is altijd een doel.
- De HUD toont elk doel met icoon en teller, bijvoorbeeld "Goud: nog 14" en "Amuletten: 1 van 3".
- Het level is gehaald zodra alle doelen gehaald zijn (vastgesteld bij een rustmoment).
- Verliezen kan door: tijd op, beurten op, of een verliesmechaniek (alleen als die aan staat).

### Speciale stenen
- 4 op een rij: Bom. Ontploft in een vlak van 3x3 zodra hij in een match zit.
- L- of T-vorm: Kruis. Ruimt de hele rij en kolom op.
- 5 op een rij: Kleurenster. Wissel hem met een steen en alle stenen van die soort verdwijnen. De bodemlagen onder die stenen worden één keer geraakt. Blokkades worden niet geraakt.
- Twee speciale stenen met elkaar wisselen geeft een combinatie: bom plus bom wordt 5x5, kruis plus bom ruimt drie rijen en drie kolommen op, ster plus ster ruimt het hele bord.

### Hamer
- Een meter vult bij elke match, sneller bij grotere matches en cascades. Bij een volle meter is de hamer beschikbaar op niveau 1.
- Gebruik je hem niet, dan vult de meter door naar niveau 2 en daarna niveau 3:
  - Niveau 1: werkt als een explosie op één vakje.
  - Niveau 2: haalt alles in één vakje weg: steen, bodemlaag, overlays en een blokkade volledig (ook een schild). Onverwoestbare objecten (oliebron, muur, portaal) blijven. Bij een groot blok telt het als één treffer of één deel.
  - Niveau 3: kies een steen en alle stenen van die soort verdwijnen. De bodemlagen eronder worden één keer geraakt.
- Gebruik: klik op de hamerknop, de cursor en het bord laten duidelijk zien dat de hamer actief is, klik daarna op een vakje. Er is een grote knop "Annuleren".
- De hamer kost geen beurt. Na gebruik staat de meter weer op 0.
- Wanneer de hamer tijdens een afhandeling mag, staat in de sectie "Zetten tijdens afhandeling".

### Geen zetten meer
- Bij elk rustmoment controleert de engine of er nog een geldige zet is. Zo niet, dan wordt het bord automatisch geschud met de melding "Geen zetten meer, het bord wordt geschud". Dit kost niets.
- Schudden verplaatst alleen vrije stenen. Stenen met ketting, blokkades, valobjecten en vaste objecten blijven staan. Stenen met hars gaan mee met hun laag.
- Schudden gebruikt de seeded generator en levert gegarandeerd minstens één zet op en geen directe matches. Lukt dat niet, dan verwijdert de engine deterministisch één blokkade (de blokkade met de meeste vrije buren) en probeert het opnieuw.

### Hint
- Na 10 seconden zonder actie (instelbaar of uit te zetten) licht een mogelijke zet rustig op. Hints worden alleen bij een rustmoment berekend.
- Er is altijd een hintknop. Hints gebruiken de random generator NIET.

### Score (voorstel)
- 3 op een rij 50 punten, 4 op een rij 100, 5 op een rij 200. Elke cascade vermenigvuldigt met (1 + 0,5 x cascadediepte). Een geraakte bodemlaag geeft 25 punten, een geraakte blokkadelaag 20, een verzameld doelobject 250.
- Elke afhandelingsreeks houdt haar eigen cascadediepte bij. Er is geen extra bonus voor afhandelingsreeksen die tegelijk lopen. Voorzie wel een configvlag om die later toe te voegen.

## Spelelementen (in de lobby aan of uit te zetten)
Inspiratie: de lijst met match-3-mechanieken van G5 (https://support.g5.com/hc/en-us/articles/5869010996498-What-Mechanics-are-there-in-Match-3-levels). Gebruik die lijst alleen als inspiratie voor regels. Neem geen afbeeldingen, teksten of themanamen van G5 over. Waar de regels hieronder afwijken van G5, gelden de regels hieronder.

Per element: code-id, standaardwaarde, beschrijving en hoe het reageert op matches, explosies en de hamer. Wat niet genoemd wordt, volgt de algemene raakregels.

### A. Doelen
1. goud (Goud) [altijd aan, niet uit te zetten]: bodemlaag. Een match bovenop het vakje of een explosie raakt het. Doel: alle goud weg.
2. zilver (Zilver) [standaard AAN]: bodemlaag die twee keer geraakt moet worden: zilver wordt goud, goud wordt leeg.
3. amulet (Amulet) [standaard AAN]: valobject, niet matchbaar. Laat het naar de onderste rij van zijn kolom zakken, daar wordt het verzameld. Doel: een aantal amuletten verzamelen.
4. verborgenSchat (Verborgen schat) [standaard AAN]: een groepje vakjes van 1x1 tot 2x2 met goud of zilver, met een schat eronder die als vage omtrek zichtbaar is. Zodra alle bodemlagen van de groep weg zijn, komt de schat tevoorschijn en is hij verzameld. Doel.
5. reiziger (Reiziger) [standaard UIT]: een vast figuurtje met een zichtbaar pad naar een uitgang. Een match in het volgende vakje van zijn pad laat hem bij het beurteinde één stap opschuiven: hij ruilt van plek met wat daar ligt. Bereikt hij de uitgang, dan is hij gered. Doel. Houdt vallende stenen tegen. Explosies en de hamer doen hem niets.
6. grootBlok (Groot blok) [standaard UIT]: een vast object van 1x2 of 2x2, in drie varianten:
   - taart: elke match aangrenzend aan een deel haalt dat deel weg. Alle delen weg, dan verdwijnt de taart.
   - emmer: elke aangrenzende match of explosie is één treffer voor het hele blok. Na het ingestelde aantal treffers verdwijnt de emmer.
   - doos: telt het aantal stenen in aangrenzende matches. Vol, dan verdwijnt de doos.
   Optioneel doel: alle grote blokken weg.

### B. Blokkades en lagen
7. ketting (Ketting) [standaard AAN]: laag op een steen, 1 of 2 schakels. De steen kan niet gewisseld worden en valt niet, maar kan wel in een match zitten. Een match met de steen erin, een explosie of de hamer haalt één schakel weg. De steen blijft liggen en is na de laatste schakel weer vrij.
8. rotsblok (Rotsblok) [standaard AAN]: blokkade met 1 tot 3 lagen. Elke aangrenzende match en elke explosie raakt hem één keer.
9. muntblok (Muntblok) [standaard AAN]: blokkade met 1 laag, verder als rotsblok. Bij breken: bonuspunten en een stuk hamermeter.
10. kleurblok (Kleurblok) [standaard UIT]: blokkade met een kleur en 1 of 2 lagen. Alleen aangrenzende matches in die kleur en de hamer raken hem. Explosies niet.
11. hars (Hars) [standaard UIT]: laag op een steen. De steen kan wel wisselen en vallen. Een gewone match met de steen erin haalt alleen de harslaag weg, de steen blijft liggen. Explosies hebben geen effect. Hamer niveau 2 haalt hars en steen weg.
12. veer (Veer) [standaard AAN]: valobject, niet matchbaar. Eén aangrenzende match of explosie haalt hem weg.
13. schild (Schild) [standaard UIT]: blokkade die alleen door een bom, kruis, combinatie of hamer niveau 2 of hoger geraakt wordt. Na die treffer wordt het een rotsblok met 1 laag.
14. muur (Muur) [standaard UIT]: rand tussen twee vakjes. Je kunt niet over een muur wisselen en stenen vallen niet door een horizontale muur. Matches over een muur heen tellen wel. Onverwoestbaar.

### C. Verspreiders
15. olie (Olie) [standaard UIT]: blokkade met 1 laag. Eén aangrenzende match of explosie haalt hem weg. Haalt een zet geen enkele olie weg, dan neemt de olie bij het beurteinde één aangrenzend vakje met een vrije steen over. Die steen verdwijnt. Welk vakje dat wordt, kiest de deelreeks "verspreiding".
16. oliebron (Oliebron) [standaard UIT, vereist olie]: vast, onverwoestbaar object. Telt mee voor de verspreidingsregel, dus ook op een olievrij bord ontstaat er nieuwe olie na een zet zonder opgeruimde olie. Olie is in levels met een oliebron geen doel.
17. goudzakje (Goudzakje) [standaard UIT]: een extra matchbare soort steen die af en toe uit een spawnpunt komt (kans in config). Match je drie of meer goudzakjes, dan krijgen de vakjes van die match een goudlaag. Meer werk, maar ook meer punten.

### D. Bordstroom
18. portaal (Portaal) [standaard UIT]: een paar van ingang en uitgang, herkenbaar aan dezelfde kleur en hetzelfde cijfer. Stenen en valobjecten die door de ingang (onderrand van een vakje) vallen, komen bovenin het uitgangsvakje weer tevoorschijn. Onverwoestbaar.
19. lopendeBand (Lopende band) [standaard UIT]: een reeks vakjes met pijlen, als lijn (rivier) of als lus (band). Bij elk beurteinde schuift alles op de band één vakje op. Bij een lijn verdwijnt wat aan het eind van de band af gaat en komt aan het begin een nieuwe steen uit de deelreeks van die band. Op een band liggen nooit stenen met ketting of blokkades.

### E. Hulpobjecten
20. altaar (Altaar) [standaard AAN]: vast object met een kleur. Een aangrenzende match in die kleur ontsteekt het. Bij het beurteinde geeft een brandend altaar een explosie op de 8 omliggende vakjes (diagonaal telt hier wel mee) en dooft daarna. Kan opnieuw ontstoken worden.
21. stekelbol (Stekelbol) [standaard UIT]: vast object met een kleur en een richting (horizontaal of verticaal), zichtbaar aan de stekels. Een aangrenzende match in zijn kleur geeft direct een explosie op de hele rij of kolom in zijn richting. Bij elk beurteinde draait de richting om. Blijft liggen en gaat hooguit één keer per zet af.
22. pers (Pers) [standaard UIT]: vast object met een kleur en een meter (bijv. 12). Aangrenzende matches in zijn kleur vullen de meter met het aantal stenen. Vol: bij het beurteinde verdwijnen alle stenen van die kleur en begint de meter opnieuw.
23. waterklok (Waterklok) [standaard UIT]: vast object met een kleur, een meter en een uitloop-richting. Aangrenzende matches in zijn kleur vullen de meter. Vol: bij het beurteinde krijgen de eerste 3 stenen in de uitloop-richting zijn kleur. Matches die daardoor ontstaan, zijn cascades.

### F. Verliesmechanieken (standaard UIT, automatisch uit in de modus Ontspannen)
24. tijdbom (Tijdbom) [standaard UIT]: een steen met kleur en een teller, altijd groot zichtbaar. Bij elk beurteinde gaat de teller 1 omlaag. Haal de tijdbom weg met een match of explosie voordat hij op 0 staat, anders is het level verloren.
25. klimmer (Klimmer) [standaard UIT]: een steen met kleur (matchbaar). Bij elk beurteinde klimt hij één vakje omhoog door te ruilen met de steen erboven. Ligt er iets vasts boven, dan wacht hij. Vang hem door hem te matchen of op te blazen. Bereikt hij de bovenste rij, dan is het level verloren. Optioneel doel: een aantal klimmers vangen.

### Beurteinde
- Spelelementen met een beurtregel: reiziger, olie, oliebron, lopende band, altaar, stekelbol, pers, waterklok, tijdbom en klimmer.
- Per zet is er precies één beurteinde. Het wordt uitgevoerd bij stilstand, in deze vaste volgorde:
  1. altaren ontploffen,
  2. persen en waterklokken legen,
  3. reizigers stappen,
  4. lopende banden schuiven,
  5. klimmers klimmen,
  6. olie verspreidt,
  7. stekelbollen draaien,
  8. tijdbommen tellen af en klimmers en tijdbommen worden gecontroleerd op verlies.
- Matches die door het beurteinde ontstaan, vormen een nieuwe systeemreeks. Die begint met cascadediepte 1.
- Bij gelijktijdige acties van hetzelfde type geldt een vaste volgorde: rij van boven naar beneden, dan kolom van links naar rechts.

### Levelopbouw met spelelementen
- Een spelelement mag alleen voorkomen als het in de lobby aan staat. De moeilijkheid bepaalt hoeveel en hoe sterk: aantal lagen, starttellers, aantal objecten.
- Elk element heeft een introductieLevel. Er komt hooguit één nieuw element per level bij en er zijn hooguit 3 verschillende elementen per level, naast goud en zilver.
- De eerste keer dat een element verschijnt, toont het spel een korte uitlegkaart "Nieuw: Rotsblok" met plaatje en één of twee zinnen. Later terug te lezen via "Hoe werkt het?".
- Maximaal 25 procent van de vakjes is blokkade (config).
- De generator controleert elk level: het startbord heeft minstens drie zetten, elk doel is haalbaar (een amulet kan de onderste rij bereiken, een reiziger heeft een pad naar de uitgang) en verliesmechanieken krijgen genoeg marge.
- Afhankelijkheden worden afgedwongen. Staat olie uit, dan staat de oliebron ook uit en is die schakelaar grijs met uitleg.

### Presets in de lobby
- Standaard (rustig): goud, zilver, amulet, verborgen schat, ketting, rotsblok, muntblok, veer en altaar.
- Klassiek: goud, zilver, amulet en ketting. Ligt het dichtst bij Jewel Match.
- Uitdagend: Standaard plus kleurblok, hars, schild, muur, olie, portaal, lopende band, stekelbol, pers, waterklok, groot blok en reiziger.
- Alles aan: alle elementen, inclusief de verliesmechanieken.
- Eigen keuze: wordt automatisch gekozen zodra de speler zelf iets aan- of uitzet.

## Zetten tijdens afhandeling: Locked of Unlocked (lobby-instelling)
Deze instelling bepaalt of de speler een nieuwe zet mag doen terwijl een vorige zet nog wordt afgehandeld.

### Toestanden per steen
Leg in de engine een expliciete toestandsmachine vast voor stenen en valobjecten: Stabiel, Wisselend, Terugwisselend, Gemarkeerd (wordt verwijderd), Verdwijnend, Vallend, Verschuivend (lopende band, klimmer, reiziger) en Verschijnend. Alleen een steen in de toestand Stabiel kan geselecteerd, gewisseld of met de hamer geraakt worden. Elke positie op het bord heeft op elk moment precies één eigenaar.

### Locked (standaard)
- Vanaf het moment dat een zet of hamerslag geaccepteerd is tot het volgende rustmoment staat de invoervergrendeling aan. Dat omvat het beurteinde, de controle op beschikbare zetten en een eventuele schudbeurt.
- Klikken, slepen en toetsaanslagen op het bord worden in die periode genegeerd. Er komt niets in een wachtrij (geen input buffering), zodat er nooit een zet vanzelf gebeurt.
- De hamerknop is tijdens afhandeling uitgeschakeld. Pauze, geluid en instellingen blijven altijd bruikbaar.
- Een rustige indicatie laat zien dat het bord bezig is, bijvoorbeeld een aangepaste cursor en een klein label "Even wachten". Geen knipperen en geen gedimd bord.
- Er is altijd hooguit één afhandelingsreeks actief.

### Unlocked
- De speler kan tijdens een lopende afhandeling een nieuwe wissel doen, zolang beide stenen stabiel zijn. Een selectie vervalt automatisch zodra de geselecteerde steen niet meer stabiel is.
- De geldigheid van een wissel wordt bepaald op het moment van de wissel, alleen met de stenen die op dat moment stabiel zijn. Een match die pas later zou ontstaan doordat er stenen naast landen, maakt de wissel niet geldig.
- Elke geaccepteerde zet start een eigen afhandelingsreeks. Meerdere afhandelingsreeksen lopen tegelijk. De gevolgen van een nieuwe zet (matches, treffers, speciale stenen, vallen, aanvullen en cascades) werken in op het bord zoals het op dat moment is. Ze kunnen dus lopende afhandelingsreeksen beïnvloeden en andersom.
- Beurteindes worden per zet verzameld en bij de eerstvolgende stilstand uitgevoerd, één keer per zet en in de volgorde van de zetten.
- Toewijzing van een match: de match hoort bij de afhandelingsreeks van de steen die de match als laatste compleet maakte (de laatst gelande, gewisselde, verschoven of verschenen steen). De cascadediepte van de match is de diepte van die reeks plus 1. Een match die direct uit een wissel ontstaat, krijgt diepte 0 in de nieuwe reeks.
- Toewijzing van opgeruimde olie (voor de verspreidingsregel) volgt dezelfde toewijzing per reeks.
- Conflicten worden deterministisch opgelost:
  - Een steen in de toestand Wisselend maakt zijn wissel af voordat zwaartekracht hem kan verplaatsen.
  - Matches worden aan het eind van elke tick gezocht, alleen onder stabiele stenen.
  - Meerdere matches in dezelfde tick worden in vaste volgorde verwerkt: laagste reeks-id, dan rij, dan kolom.
  - Stenen en lagen die door een explosie verdwijnen, tellen voor de reeks die de explosie veroorzaakte.
  - Documenteer elke conflictregel in de code en dek hem af met een test.
- Hamer: niveau 1 en 2 mogen tijdens afhandeling op een stabiele steen of een blokkade die niet in een explosie zit. Niveau 3 kan pas bij een rustmoment.

### Wat voor beide standen geldt
- "Geen zetten meer", schudden en hints alleen bij een rustmoment.
- Levelresultaat: gewonnen of verloren wordt pas bepaald bij een rustmoment. Is het laatste doel tijdens een afhandeling gehaald, dan gaat de invoervergrendeling aan, loopt alles af (inclusief beurteindes) en verschijnt daarna "Gewonnen".
- Aantal beurten: een zet kost een beurt op het moment dat hij geaccepteerd wordt. Na de laatste beurt loopt de afhandeling gewoon af. Doelen die dan nog gehaald worden, tellen mee.
- Op tijd: is de tijd op tijdens een afhandeling, dan gaat de invoervergrendeling aan, loopt de afhandeling af en telt die mee. Daarna volgt de uitslag.
- De optie "Tijd pauzeert tijdens afhandeling" werkt alleen bij Locked. Bij Unlocked staat ze uitgeschakeld met een korte uitleg, omdat het bord dan vrijwel altijd in afhandeling is.
- Zet terugnemen (modus Ontspannen) zet het bord terug naar het laatste rustmoment. Bij Unlocked kan dat meerdere zetten tegelijk terugdraaien. Meld dat in de UI voordat de speler bevestigt.
- Highscores worden apart bijgehouden per combinatie van spelmodus, deze instelling en de preset (Eigen keuze telt als één groep).

### Instelling wijzigen
- Te kiezen in de lobby en in het pauzemenu. Een wijziging in het pauzemenu gaat in bij het eerstvolgende rustmoment.

### Lobby-teksten
- Label: "Zetten terwijl stenen nog vallen"
- Locked: "Je wacht tot alle stenen stilliggen. Daarna doe je je volgende zet. Rustig en overzichtelijk."
- Unlocked: "Je speelt door terwijl stenen nog vallen. Je nieuwe zet zorgt voor eigen gevolgen en cascades. Sneller, maar drukker."

### Tests voor deze instelling (Vitest)
- Locked: een wissel tijdens afhandeling of beurteinde geeft Rejected('input-locked') en verandert niets aan de state.
- Locked: na het rustmoment wordt dezelfde wissel wel geaccepteerd.
- Unlocked: een wissel met een niet-stabiele steen geeft Rejected('tile-not-stable').
- Unlocked: een geldige wissel tijdens afhandeling start een nieuwe afhandelingsreeks met een eigen id.
- Unlocked: twee zetten voor één stilstand leveren twee beurteindes op, in de juiste volgorde.
- Unlocked: elke conflictregel hierboven heeft een eigen test.
- Beide: het levelresultaat valt pas bij een rustmoment, en beurten worden afgeschreven bij acceptatie.
- Beide: dezelfde seed, dezelfde instellingen en dezelfde lijst { tick, action } leveren exact dezelfde eindstate op.

## Spelmodi (keuze in de lobby)
1. Op tijd: een zandloper per level. Voorbeeld startwaarde: 60 seconden plus 4 seconden per doelonderdeel. De tijd pauzeert bij de pauzeknop en zodra het tabblad niet zichtbaar is (visibilitychange). In de laatste 15 seconden volgt een rustige visuele waarschuwing, geen harde piepjes.
2. Aantal beurten: een vast aantal beurten per level, afgeleid van de doelen plus een marge (in config). Een ongeldige wissel, schudden en de hamer kosten geen beurt. Overgebleven beurten leveren bonuspunten op.
3. Ontspannen: geen tijd, geen beurtenlimiet en geen verliesmechanieken. Hier kan de speler een zet terugnemen.

Moeilijkheid: Makkelijk, Normaal of Uitdagend. Dit beïnvloedt het aantal soorten stenen, de tijd of het aantal beurten en de hoeveelheid en sterkte van de actieve spelelementen. Welke spelelementen mogen voorkomen, bepaalt alleen het spelelementenpaneel.
Bij verlies: "Probeer opnieuw" met exact hetzelfde bord. Geen levens, geen wachttijden.

## Random bordgenerator met seed (reproduceerbaar)
- Schrijf zelf een kleine PRNG, bijvoorbeeld sfc32 of mulberry32, plus een string-hash zoals cyrb128. Dan kan een seed ook een woord zijn, zoals "papa". Waarom geen npm-pakket: een update van zo'n pakket kan de reeks veranderen en dan kloppen oude bordnummers niet meer.
- In de engine komt nergens Math.random(). Dwing dat af met een lint-regel of een test.
- Seed-formaat: "v1-<seed>", met een constante GENERATOR_VERSION. Verandert de generator, dan wordt het een nieuwe versie en blijven oude bordnummers werken. Snapshot-tests falen zodra de uitvoer van v1 verandert.
- Leid uit één seed aparte deelreeksen af: levelindeling (inclusief plaatsing van spelelementen), startbord, één deelreeks per spawnpunt, één per lopende band, verspreiding (olie) en schudden.
- Level k in een reeks krijgt een afgeleide seed, bijvoorbeeld hash(seed + ":" + k).
- De volgorde in het register MECHANICS is vast. Nieuwe spelelementen komen alleen achteraan erbij en een bitIndex verandert nooit.
- Garanties:
  - Dezelfde seed plus level, modus, moeilijkheid, bordgrootte, aantal soorten en set actieve spelelementen levert exact hetzelfde startbord en dezelfde levelindeling op. Het thema en de invoerinstelling hebben daar GEEN invloed op.
  - Bij Locked levert dezelfde volgorde van zetten exact hetzelfde spelverloop op, ongeacht hoe snel de speler klikt.
  - Bij Unlocked hangt het spelverloop ook af van het moment van elke zet. Het is reproduceerbaar als de acties op dezelfde tick opnieuw worden afgespeeld, met dezelfde animatiesnelheid. Sla daarom een replay op als lijst { tick, action } plus de volledige config.
- Startbord: geen matches bij de start en minstens drie geldige zetten. Vul cel voor cel en kies steeds een soort die geen drie op een rij maakt. Lukt het niet, genereer dan deterministisch opnieuw.
- Lobby: een invoerveld "Bordnummer", een knop "Willekeurig bord" en een knop "Bord van de dag" (seed is de datum JJJJ-MM-DD). In het spel staat het bordnummer altijd zichtbaar met een knop "Kopieer".
- De URL bevat alles wat nodig is om het bord na te maken: ?seed=...&mode=...&level=...&diff=...&size=...&kinds=...&input=...&mech=... waarbij mech de bitmask van actieve spelelementen is in base36.
- Vitest: snapshot-tests voor een paar vaste seeds met verschillende sets spelelementen, een test op geen startmatches, een test op altijd minstens één zet en optioneel een property-test met fast-check over 1000 seeds.

## Instellingen onthouden en standaard herstellen
- Alle lobby-instellingen zitten in één object GameSettings met een veld schemaVersion: spelmodus, moeilijkheid, bordgrootte, aantal soorten stenen, thema, zetten terwijl stenen nog vallen (Locked of Unlocked), animatiesnelheid, tijd pauzeert tijdens afhandeling, hint na x seconden, geluid aan/uit en volume, bordkeuze (willekeurig, bord van de dag of eigen bordnummer plus dat nummer), preset en per spelelement aan of uit.
- DEFAULT_SETTINGS is één constante en de enige bron voor standaardwaarden. Presets zijn ook constanten.
- Opslag in localStorage onder de sleutel "jewel-match.settings". Heeft mijn lobby een eigen instellingenservice (zie "Mijn lobby"), gebruik die dan via een adapter met dezelfde interface. Geen cookies (die gaan bij elk verzoek mee naar de server) en geen sessionStorage (die is weg na het sluiten van de browser).
- Opslaan bij elke wijziging (300 ms debounce) en bij de start van een spel. Bij de volgende keer openen staat de lobby op de laatst gebruikte instellingen en start "Nieuw spel" daar direct mee.
- Laden met validatie per veld: een ontbrekend of ongeldig veld krijgt zijn standaardwaarde, onbekende spelelementen worden genegeerd en nieuwe spelelementen krijgen hun standaardwaarde. Kapotte JSON geeft de standaardinstellingen, zonder foutmelding voor de speler (wel een console.warn). Schrijf een migratiefunctie per schemaVersion.
- Werkt localStorage niet (privémodus, geblokkeerd, vol), dan bewaar je de instellingen in het geheugen. Dat mag nooit een fout geven.
- Implementatie: een SettingsStore met een signal, opslaan via effect(), het lobbyformulier met Signal Forms.
- Knop "Standaardinstellingen herstellen": groot, onderaan het instellingenscherm. Na een duidelijke bevestiging ("Alle instellingen terugzetten naar standaard? Je scores en voortgang blijven bewaard.") worden alle instellingen inclusief spelelementen teruggezet naar DEFAULT_SETTINGS en opgeslagen.
- Scores, highscores, voortgang, gezien-uitlegkaarten en replays staan onder aparte sleutels en worden door deze knop niet aangeraakt.
- Instellingen uit een gedeelde URL gelden alleen voor dat ene spel. Ze overschrijven de opgeslagen instellingen niet, tenzij de speler op "Deze instellingen bewaren" klikt.
- Tests: opslaan en laden, migratie, kapotte of halve data, ontbrekende localStorage, de resetknop, URL-instellingen die niet worden opgeslagen.

## Lobby-instellingen (overzicht en indeling)
- Bovenaan: spelmodus, moeilijkheid, bordkeuze en thema.
- Uitklapgroep "Spelelementen": eerst de presetkeuze, daarna de elementen per categorie (Doelen, Blokkades en lagen, Verspreiders, Bordstroom, Hulpobjecten, Verliesmechanieken). Per element: icoon uit het gekozen thema, naam, één zin uitleg en een grote schakelaar. Goud staat altijd aan en de schakelaar is zichtbaar vergrendeld met uitleg. Verliesmechanieken hebben een duidelijke aanduiding en zijn grijs in de modus Ontspannen.
- Uitklapgroep "Spelen": zetten terwijl stenen nog vallen, animatiesnelheid, tijd pauzeert tijdens afhandeling, hint, bordgrootte, aantal soorten stenen.
- Uitklapgroep "Geluid".
- Onderaan: "Standaardinstellingen herstellen" en een link naar "Credits".
- Tekst bij spelelementen: "Kies wat er in de levels mag voorkomen. Nieuwe onderdelen worden de eerste keer kort uitgelegd."

## Thema's
Een thema is een manifest met data, geen code. In de lobby kies je het thema. Wisselen kan ook tijdens pauze, zonder dat het bord verandert. Bouw de themastructuur nu volledig en lever in de eerste versie twee werkende thema's (Bejeweled en Jewel Match). Zet de andere thema's klaar als manifest met TODO's, zodat ik ze later vul.

```ts
type MechanicId =
  | 'goud' | 'zilver' | 'amulet' | 'verborgenSchat' | 'reiziger' | 'grootBlok'
  | 'ketting' | 'rotsblok' | 'muntblok' | 'kleurblok' | 'hars' | 'veer' | 'schild' | 'muur'
  | 'olie' | 'oliebron' | 'goudzakje' | 'portaal' | 'lopendeBand'
  | 'altaar' | 'stekelbol' | 'pers' | 'waterklok' | 'tijdbom' | 'klimmer';

interface ThemeManifest {
  id: string;                 // 'bejeweled', 'jewel-match', 'halloween', 'xmas', 'easter', 'dice'
  name: string;               // naam in de lobby
  tiles: string[];            // lokale SVG-paden, index = steentype; lengte = max aantal soorten
  tileLabels: string[];       // voor schermlezer, bijv. 'rode robijn', 'pompoen'
  specials: { bomb: string; cross: string; star: string };
  hammer: string;
  mechanics?: Partial<Record<MechanicId, string | string[]>>; // ontbreekt iets, dan het basisthema
  background?: string;
  cssVars: Record<string, string>; // bordkleur, goud, zilver, accent, tekst
  credits: { asset: string; author: string; license: string; url: string }[];
}
```

- Er is een neutraal basisthema "base" met een afbeelding voor elk spelelement. Een thema mag elementen overschrijven. Ontbreekt een afbeelding, dan valt het spel terug op het basisthema.
- Elementen met een kleur (kleurblok, altaar, stekelbol, pers, waterklok, tijdbom, klimmer) tonen de vorm van de bijbehorende steensoort, zodat kleur nooit de enige aanwijzing is.
- Lagen en tellers zijn altijd zichtbaar als groot cijfer of duidelijke stapjes (bijv. scheuren in een rotsblok).

Eis voor elk thema: elke steensoort verschilt in vorm én kleur, zodat het spel ook speelbaar is bij kleurenblindheid of minder scherp zicht.

Voorstel per thema:
- Bejeweled: teken zelf zeven juwelen als SVG (cirkel, vierkant, driehoek, ruit, zeshoek, druppel, ster) met verlopen en facetten. Kopieer GEEN afbeeldingen uit het originele spel. Alternatief: de edelstenen uit de Kenney-pakketten hieronder.
- Jewel Match: ook zelf getekende juwelen, maar in een andere stijl: warmer, afgerond, met gouden rand.
- Halloween: pompoen, spookje, vleermuis, spin, snoepje, lolly, maan.
- Xmas: kerstboom, cadeautje, ster, bel, sneeuwvlok, sneeuwpop, sok.
- Easter: zelf getekende paaseieren (zeven kleuren met elk een eigen patroon) of emoji's zoals kuiken, konijn, tulp, ei, wortel en bloesem.
- Dice: zelf getekende dobbelsteenvlakken 1 tot en met 6, elk vlak een eigen kleur. Maximaal 6 soorten.

## Assetbronnen (alleen lokaal gebruiken)
- Kenney (CC0, naamsvermelding niet verplicht):
  - Puzzle Pack 2: https://opengameart.org/content/puzzle-pack-2-795-assets (edelstenen in 8 kleuren, achtergrondtegels voor match-3)
  - Puzzle game art: https://opengameart.org/content/puzzle-game-art (bevat SVG-bronbestanden)
- Microsoft Fluent Emoji (MIT): https://github.com/microsoft/fluentui-emoji. Via npm kan ook @iconify-json/fluent-emoji-flat, maar dan uitsluitend lokaal gebundeld. Nooit api.iconify.design aanroepen.
- Google Noto Emoji (SVG's onder Apache 2.0): https://github.com/googlefonts/noto-emoji
- Twemoji (CC BY 4.0, naamsvermelding verplicht): https://github.com/jdecked/twemoji
- OpenMoji (CC BY-SA 4.0, naamsvermelding verplicht en aangepaste versies onder dezelfde licentie): https://github.com/hfg-gmuend/openmoji
- game-icons.net (CC BY 3.0, naamsvermelding per auteur verplicht), handig voor het basisthema (hamer, ketting, rots, schild, olie, portaal, altaar, tandwielen, dobbelstenen): https://game-icons.net en https://github.com/game-icons/icons
- Lettertype: self-hosted via @fontsource, bijvoorbeeld @fontsource/atkinson-hyperlegible (ontworpen voor goede leesbaarheid). Geen Google Fonts-CDN.
- Geluid (optioneel): CC0-geluidspakketten van Kenney. Controleer de licentie bij download.
Mix binnen één thema bij voorkeur geen verschillende licenties.

## Harde regels voor self-hosting
- Tijdens runtime gaat er geen enkel verzoek naar een ander domein: geen CDN (jsdelivr, unpkg, iconify-API, Google Fonts), geen analytics, geen externe scripts.
- Assets staan in de repo, bijvoorbeeld in public/games/jewel-match/themes/<thema-id>/ of passend bij de structuur van mijn lobby.
- Maak een script scripts/fetch-assets.mjs. Dat kopieert de benodigde bestanden uit de npm-pakketten of gedownloade repo's naar de juiste map, optimaliseert ze met SVGO en genereert CREDITS.md. De assets worden gecommit, zodat de build offline werkt.
- Stel een CSP-header voor, bijvoorbeeld default-src 'self', en voeg een check toe dat er geen externe requests zijn.
- In de lobby komt een scherm "Credits" met alle verplichte naamsvermeldingen.

## Toegankelijkheid en comfort (speler is 76)
- Grote stenen van minimaal 56x56 pixels. Het bord schaalt mee met de beschikbare ruimte (aspect-ratio, container queries). Tekst minimaal 18px, HUD minimaal 20px.
- Hoog contrast. Een geselecteerde steen krijgt een dikke rand (minimaal 4px) en wordt iets groter, dus niet alleen een kleurverschil.
- Animatiesnelheid instelbaar (Rustig, Normaal, Snel), standaard Rustig. Cascades en beurteindes zijn goed te volgen.
- Zetten terwijl stenen nog vallen staat standaard op Locked. Verliesmechanieken staan standaard uit.
- Geen flitsen en geen schuddend scherm.
- Geluid standaard zacht, met een grote aan/uit-knop.
- Pauzeknop altijd zichtbaar, Esc pauzeert ook.
- Voortgang en instellingen worden automatisch bewaard, met "Verder spelen" in de lobby.
- Alle teksten in eenvoudig Nederlands, zoals "Beurten over: 12" en "Tijd: 2:30". Uitzondering: de optienamen Locked en Unlocked, altijd met de Nederlandse uitleg erbij. Code en identifiers mogen Engels of Nederlands zijn, maar wel consequent.
- Korte uitleg bij de eerste keer (maximaal drie schermen met plaatjes), en een uitlegkaart bij elk nieuw spelelement. Alles later terug te lezen via "Hoe werkt het?".
- Muis is de belangrijkste invoer (pc), touch moet ook werken.
- Richtlijn WCAG 2.2 AA. Elk vakje krijgt een aria-label, bijvoorbeeld "rij 3, kolom 5, pompoen, gouden vakje" of "rij 2, kolom 4, rotsblok, nog 2 keer raken". Meldingen gaan via een rustige aria-live-regio.

## Opleverfases
1. Projectstructuur, types, celmodel, register MECHANICS (alle 25 elementen beschreven, nog niet allemaal geïmplementeerd), RNG, bord- en levelgenerator, tick-gebaseerde engine met Locked en de toestandsmachine, plus Vitest-tests. Nog geen UI.
2. Bord-UI met één thema en het basisthema, requestAnimationFrame-lus, klik-wissel, cascades, de modus "Aantal beurten" en de spelelementen uit de preset Standaard.
3. Unlocked (meerdere afhandelingsreeksen, beurteindes per zet, conflictregels en tests), modi "Op tijd" en "Ontspannen", hamer en speciale stenen.
4. Lobby-integratie: alle instellingen, spelelementenpaneel met presets, instellingen onthouden, resetknop, bordnummer, bord van de dag, URL, themaswitcher, opslag en verder spelen.
5. Overige spelelementen, per categorie in kleine stappen: eerst blokkades en lagen, dan verspreiders, bordstroom, hulpobjecten en als laatste de verliesmechanieken. Per element tests en een uitlegkaart.
6. Overige thema's, asset-script, credits-scherm, CSP en een toegankelijkheidscontrole.

Geef per fase: de bestandsboom, de volledige bestanden, een korte uitleg van je keuzes en hoe ik het test.

## Niet doen
- Geen Math.random() in de engine.
- Geen spellogica op CSS-events zoals transitionend of animationend.
- Geen input buffering bij Locked.
- Geen externe URL's in code, HTML of CSS.
- Geen cookies of sessionStorage voor instellingen.
- Geen @angular/animations, geen NgModules, geen zone.js, geen *ngIf of *ngFor.
- Geen originele afbeeldingen, logo's, teksten of geluiden uit Bejeweled, Jewel Match of G5-games.
- Geen advertenties, in-app-aankopen, levens of wachttijden.

Bron: docs/superpowers/specs/2026-11-10-games-platform-design.md
