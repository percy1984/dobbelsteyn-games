<?php

declare(strict_types=1);

namespace Dg;

use RuntimeException;

/** Leest de configuratie uit config.php (buiten git, alleen op de server/lokaal). */
final class Config
{
    /** @param array<string, mixed> $values */
    public function __construct(private readonly array $values)
    {
    }

    public static function load(string $path): self
    {
        if (!is_file($path)) {
            throw new RuntimeException('Configuratiebestand ontbreekt: kopieer config.example.php naar config.php.');
        }

        $values = require $path;
        if (!is_array($values)) {
            throw new RuntimeException('config.php moet een array teruggeven.');
        }

        return new self($values);
    }

    /** @return array{host: string, port: int, name: string, user: string, password: string} */
    public function database(): array
    {
        $db = $this->values['db'] ?? null;
        if (!is_array($db)) {
            throw new RuntimeException('Configuratie mist het onderdeel "db".');
        }

        foreach (['host', 'name', 'user', 'password'] as $key) {
            if (!isset($db[$key]) || !is_string($db[$key])) {
                throw new RuntimeException("Configuratie mist db.$key.");
            }
        }

        return [
            'host' => $db['host'],
            'port' => (int) ($db['port'] ?? 3306),
            'name' => $db['name'],
            'user' => $db['user'],
            'password' => $db['password'],
        ];
    }

    /**
     * Geheim token voor POST /migrate. Null (endpoint uit) als het ontbreekt of korter is dan 32 tekens.
     */
    public function migrateToken(): ?string
    {
        $token = $this->values['migrate_token'] ?? null;

        return is_string($token) && strlen($token) >= 32 ? $token : null;
    }

    public function debug(): bool
    {
        return ($this->values['debug'] ?? false) === true;
    }
}
