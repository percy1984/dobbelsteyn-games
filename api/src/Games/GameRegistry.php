<?php

declare(strict_types=1);

namespace Dg\Games;

use InvalidArgumentException;

/** Alle games die op de server gespeeld kunnen worden. */
final class GameRegistry
{
    /** @var array<string, Game> */
    private array $games = [];

    /** @param list<Game> $games */
    public function __construct(array $games)
    {
        foreach ($games as $game) {
            $this->games[$game->slug()] = $game;
        }
    }

    /** Het productieregister. Een nieuwe game voeg je hier toe zodra de regels gebouwd zijn. */
    public static function default(): self
    {
        return new self([
            new TicTacToe(),
            new ThirtyOne(),
        ]);
    }

    public function has(string $slug): bool
    {
        return isset($this->games[$slug]);
    }

    public function get(string $slug): Game
    {
        return $this->games[$slug] ?? throw new InvalidArgumentException("Onbekende game: $slug");
    }

    /** @return list<string> */
    public function slugs(): array
    {
        return array_keys($this->games);
    }
}
