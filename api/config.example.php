<?php
// Kopieer dit bestand naar config.php (staat in .gitignore) en vul de waarden in.
// config.php blijft op de server en gaat nooit in git of in de Angular-bundle.
//
// Lokaal met Docker (docker compose up): host "db", database "dobbelsteyn_games",
// gebruiker "games", wachtwoord "games_local".
// Op Hostinger: host "127.0.0.1", port 3306 en de gegevens uit hPanel.

declare(strict_types=1);

return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => '',
        'user' => '',
        'password' => '',
    ],
    // true toont foutdetails in de API-respons. Altijd false op de server.
    'debug' => false,
];
