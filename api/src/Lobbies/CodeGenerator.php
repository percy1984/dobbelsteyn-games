<?php

declare(strict_types=1);

namespace Dg\Lobbies;

use Dg\Games\Rng;

/** Maakt lobbycodes en PINs. */
final class CodeGenerator
{
    /** Zonder letters die op cijfers of elkaar lijken: geen I, O, L. */
    public const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    private const PIN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function __construct(private readonly Rng $rng = new Rng())
    {
    }

    public function code(int $length = 4): string
    {
        return $this->random(self::LETTERS, $length);
    }

    public function pin(): string
    {
        return $this->random(self::PIN_CHARS, 4);
    }

    private function random(string $alphabet, int $length): string
    {
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[$this->rng->int(0, strlen($alphabet) - 1)];
        }

        return $out;
    }
}
