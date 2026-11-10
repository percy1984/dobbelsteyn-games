# Games platform: overview, lobbies, chat and bots

Date: 2026-11-10. Status: draft for approval.

## Intent and why

Percy wants a small website of card and board games to play with colleagues (lunch, Friday drinks) and family. Players sit in the same room, each on their own Android phone. Nothing exists yet. The 17 games will be built later, one by one, once Percy supplies rules and designs. This document covers the **platform** all those games share: the overview page, lobbies, chat, bots, languages and the PHP API. Individual games are separate projects.

Planned games (names as the user gave them): Mancala, Nim, Tic-Tac-Toe, Super-Tic-Tac-Toe, Take-5, 31-en, Blufpoker, Klein Hartenjagen, Canasta 1v1, Canasta 2v2, Canasta 1v1v1, Jewel Match, Love Letters, Machiavelli, Takenoko, Fire-and-Ice, Maxxen.

## Goals

- **Mobile first, must work on Android phones**, and also on desktop.
- An overview page with a tile per game, shown in one continuously scrolling grid. Tiles of games that are not yet playable have a gray border and are not clickable. Playable tiles are clickable.
- Per game, a lobby system that looks and behaves identically for every game.
- No accounts. Each time a player creates or joins a lobby, they type a name; other players see it.
- Lobbies:
  - Joined by a short code of 4 or 5 letters.
  - Public lobbies and private lobbies are all listed per game. Each shows its player count (for example 2/5). Private lobbies show a lock icon and need a 4-character PIN (letters and digits only) to join.
  - The creator can change game settings and can promote other players to do the same.
  - Humans and bots fill seats. Bots have 10 difficulty levels.
  - When the required number of players is reached, the creator or a promoted player can start the game; everyone sees a 3-2-1 countdown first.
- Disconnects: if a player's phone sleeps or the page closes, the game waits for them. All other players get a notification that the player left temporarily (and that it ended when they return). The creator and promoted players get two actions: replace the player with a bot, or end the game.
- Sharing a lobby by QR code: the creator, and every player inside the lobby, can press a button that shows a QR code. Scanning it opens the app directly on that lobby (a join screen asking for a name). Players can also copy the QR code (or its link) to the clipboard to send it by SMS, WhatsApp or similar.
- Chat inside lobby and game, between the players. On the game screen it is a button that opens a popup with the chat.
- Interface in Dutch and English, switchable at any time by each player.
- Modern CSS for animations and transitions (the exact techniques are left to the builder).

## Non-goals

- The 17 games themselves, their rules, designs and board graphics.
- Accounts, logins, profiles, rankings, statistics.
- Native apps. It is a website.
- Any server other than the existing PHP/MySQL shared host.

## Anti-goals (would be a failure even if it technically works)

- The overview or lobby is awkward on a phone.
- The database is reachable from the browser or credentials leak.
- The "home" button or any link leaves the `/games` area, or any link is hard-coded to an absolute URL.
- A player who briefly loses connection is thrown out of the game.

## Constraints

- **Frontend:** the latest Angular. Percy will install Angular skills in the repo; use them (`angular-developer`, `angular-new-app` are available).
- **Hosting:** a basic PHP shared host with MySQL; no Node.js, no .NET, no long-running processes. The target is either `https://www.dobbelsteyn.nl/games` or another place, not yet decided. **The app must therefore be deployable under any sub-path** with relative links only (no absolute links, no hard-coded host). The home button goes to the platform root (the overview page), never to `https://www.dobbelsteyn.nl`.
- **Each game lives in its own directory** (its own route/folder in the app), while lobbies share one common look and one common implementation.
- **Database access only through PHP.** Browser JavaScript never talks to MySQL. Credentials live in PHP configuration, never in the Angular bundle, never committed.
- Deep links must survive a page refresh on the shared host (for example through a rewrite rule), so a lobby URL can be opened directly.
- Android phones are the primary device; no assumption of an installed app.

## Decisions taken by Percy

- Lobby code of 4 or 5 letters; private lobbies use a 4-character letters+digits PIN; all lobbies are listed, private ones with a lock icon; player count shown for all.
- Creator can promote players; promoted players can change settings, and also replace a disconnected player with a bot or end the game.
- Waiting for reconnecting players, notification to the others, creator (or promoted) decides.
- Chat opens from a button in a popup.
- Dutch and English, freely switchable by each player.
- Scrolling grid instead of a "10 more" tile.
- PHP as API in front of MySQL.

## Builder's calls (Claude's proposals; not yet confirmed by Percy)

- **Live updates by polling**, because PHP shared hosting cannot push. Phones ask the API for changes about every second while in a lobby or game, using a cheap "nothing changed" answer (version number or ETag). Slower polling on the overview or list screens. Server-sent events or websockets are not used.
- **Server-authoritative:** the PHP API validates every move; the browser is never trusted. Game rules therefore need a PHP implementation (or a shared rule definition) per game, to be decided when each game is planned.
- **Bot moves are computed on the server** when a request arrives, not on a player's phone, so a sleeping host does not freeze the game.
- **Reconnecting without accounts:** the browser stores a secret per-seat token for the lobby. Reopening the page on the same phone returns the player to their seat.
- **If the creator disconnects**, the replace/end actions go to promoted players, otherwise the next player in line.
- **A replacing bot** takes over the seat and hand; its difficulty is chosen by the person who replaced the player.
- The chosen language is remembered per phone.
- Only one game is made playable at first, as proof of the platform; the builder picks the simplest (Tic-Tac-Toe is suggested) so the lobby, bots, chat and reconnection can be tested end to end. Percy only described gray, non-playable tiles for now; this single playable tile is a proposal.

## More builder's calls (from the reviewer's questions; Claude's proposals)

- **Build output:** a static Angular single-page app (no SSR, no prerendering), deployed as plain files next to the PHP API. The sub-path is handled at deploy time (base href set per build or at load time), and deep links rely on a rewrite rule. A fallback to hash-based routes is acceptable if the host does not allow rewrites (see open question on hosting).
- **Polling:** default about every 2 seconds in a lobby or game, with a version check so most answers are tiny, and slower on list screens. The interval is a single setting so it can be tuned to the host's limits. Polling pauses while the page is hidden, and the player is treated as away after a missed-heartbeat threshold of about 15 seconds (tunable).
- **Game contract:** the platform defines a generic game interface that already supports per-player hidden information (each player gets their own view of the state) and simultaneous turns, because Canasta, Take-5 and Blufpoker need them. Real-time play (such as a fast Jewel Match) is out of scope of this contract and is decided when that game is planned.
- **Proof game:** Tic-Tac-Toe is the single playable game at first (proposal above).
- **Lost seat token** (storage cleared, other browser): the seat is lost; the creator can replace the player with a bot. No recovery by name and code, because that would let anyone take a seat.
- **No timeout on waiting** for a reconnecting player; the creator and promoted players decide.
- **Joining:** only before the game starts. No spectators in this version.
- **Public/private** is fixed at creation. Codes and PINs are case-insensitive. Codes are random, 4 or 5 letters, unambiguous letters only (no I/O/L look-alikes).
- **Lifecycle:** lobbies without human activity for a while (builder picks the time) are removed; finished games are not listed.
- **Leaving:** a player can leave voluntarily before the game starts; during a game, leaving counts as a disconnect. If everything is human-less, the game ends. The creator cannot be demoted; the first action on a disconnected seat (replace or end) wins.
- **Chat:** kept for the lifetime of the lobby, shown to anyone in it, with a length limit; no profanity filter.
- **Translation:** UI strings and game names are translated; I supply the Dutch and English text. Chat is not translated.
- **Browser support:** current Chrome on a recent Android phone and current desktop browsers, using progressive enhancement for newer CSS features. No offline mode or installable app (PWA) in this version.

## QR code sharing (Claude's calls)

- The QR encodes a full link to the lobby. The link is built at runtime from the address the app is currently served from, so nothing is hard-coded and it works under any sub-path. This is the one place an absolute URL is unavoidable, and it is never stored in the source.
- The QR is generated in the browser (a small library, no external service, so no lobby codes leave the site).
- "Copy" copies the link as text, and also the QR image where the browser allows image copy. On phones, a Share button uses the system share sheet (Web Share API) when available, because image copy is unreliable on Android. These are proposals; the builder verifies what Android Chrome actually supports.
- Scanning opens the join screen for that lobby; the person still types a name each time. If the lobby is full, already started or gone, they see a clear message.
- For a private lobby, the link and QR **do contain the PIN** (decided by Percy): scanning joins the lobby directly without typing the PIN, after the person enters their name. Consequence: anyone who sees the QR or the forwarded link can join, which is the intended trade-off. The PIN should travel in a way that keeps it out of server logs where possible (for example the URL fragment after `#`, not the query string); the builder decides the exact form.

## Hosting: Hostinger (researched; Percy left the choice to Claude)

Percy hosts at Hostinger and does not know Apache from nginx, so Claude decided. Findings from Hostinger's own support pages and third-party sources, which may be out of date because Hostinger says limits change without notice; the hPanel resource page for Percy's actual plan is authoritative:

- Hostinger shared plans run **LiteSpeed**, which reads Apache-style `.htaccess` files. So the plan is a static Angular app with an `.htaccess` rewrite for deep links; the hash-route fallback is only needed if this turns out not to work.
- **PHP workers** (each handles one request at a time) are listed at about 20, 40 or 60 depending on the web hosting plan. Hitting the cap gives 503 errors.
- **MySQL max user connections** is listed at about 25 on shared plans (other pages show 25 to 75).
- Decisions that follow: keep the polling endpoint tiny and fast (one indexed query, no long-polling, because that would tie up scarce PHP workers); default interval 2 seconds, one setting to tune; open one database connection per request and close it quickly; avoid keeping sessions open.
- Still to verify during the build, on Percy's actual plan: the PHP version in hPanel, the plan's exact limits, and that the `.htaccess` rewrite works.
- Deployment method is not yet decided; Percy has not chosen one. The builder proposes the simplest option hPanel offers (upload of the build output plus the PHP files, for example via file manager or FTP) and keeps the database password in a PHP config file outside git. Whether `/games` on dobbelsteyn.nl stays the target is still open.

## Left to the builder

- Angular structure (standalone components, signals, lazy-loaded routes per game, and so on), state handling, folder layout.
- API shape, database schema, cleanup of stale lobbies, rate limiting, basic abuse protection for names and chat text.
- Visual design, colors, animation techniques, tile artwork (placeholders are fine until Percy supplies designs).
- How "scroll through all games" is implemented (a plain grid with reveal-on-scroll animation is enough; there are only 17 games).
- Accessibility basics, translation mechanism (Angular i18n or a runtime library, as long as switching needs no page reload).
- How the 10 bot difficulty levels are defined per game (done per game later; the platform supplies the level setting and the hook).
- Deployment steps and the rewrite rule for deep links.
