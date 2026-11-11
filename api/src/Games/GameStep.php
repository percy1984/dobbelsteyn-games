<?php

declare(strict_types=1);

namespace Dg\Games;

/**
 * Het resultaat van één stap in een spel: de nieuwe staat plus de gebeurtenissen die daarbij
 * horen. Gebeurtenissen zijn publiek en komen in de zetlog (zie `EventedGame`).
 */
final class GameStep
{
    /**
     * @param array<string, mixed> $state nieuwe, gezaghebbende staat
     * @param list<array<string, mixed>> $events gebeurtenissen in volgorde; elk met een `type`
     */
    public function __construct(
        public readonly array $state,
        public readonly array $events = [],
    ) {
    }
}
