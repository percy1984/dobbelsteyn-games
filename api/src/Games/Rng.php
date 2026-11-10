<?php

declare(strict_types=1);

namespace Dg\Games;

use Closure;

/** Toevalsbron die in tests vervangen kan worden door een vaste reeks. */
final class Rng
{
    /** @param (Closure(int, int): int)|null $source */
    public function __construct(private readonly ?Closure $source = null)
    {
    }

    /** Geheel getal tussen $min en $max (beide inclusief). */
    public function int(int $min, int $max): int
    {
        return $this->source !== null ? ($this->source)($min, $max) : random_int($min, $max);
    }

    /**
     * @template T
     * @param non-empty-list<T> $items
     * @return T
     */
    public function pick(array $items): mixed
    {
        return $items[$this->int(0, count($items) - 1)];
    }

    /** Schudt een lijst (Fisher-Yates). */
    public function shuffle(array $items): array
    {
        $items = array_values($items);
        for ($i = count($items) - 1; $i > 0; $i--) {
            $j = $this->int(0, $i);
            [$items[$i], $items[$j]] = [$items[$j], $items[$i]];
        }

        return $items;
    }
}
