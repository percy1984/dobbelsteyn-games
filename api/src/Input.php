<?php

declare(strict_types=1);

namespace Dg;

/** Controle en opschoning van tekst die spelers invoeren. */
final class Input
{
    public const NAME_MAX = 20;
    public const CHAT_MAX = 300;

    /** Naam van een speler: 1 tot 20 tekens, geen stuurtekens, spaties samengevoegd. */
    public static function name(mixed $value): string
    {
        $name = self::clean($value);
        $length = mb_strlen($name);
        if ($length < 1 || $length > self::NAME_MAX) {
            throw new ApiException(422, 'Vul een naam in van 1 tot ' . self::NAME_MAX . ' tekens.', 'bad_name');
        }

        return $name;
    }

    /** PIN van een privélobby: precies 4 letters of cijfers, hoofdletterongevoelig (we bewaren hoofdletters). */
    public static function pin(mixed $value): string
    {
        $pin = is_string($value) ? strtoupper(trim($value)) : '';
        if (preg_match('/^[A-Z0-9]{4}$/', $pin) !== 1) {
            throw new ApiException(422, 'Een PIN bestaat uit precies 4 letters of cijfers.', 'bad_pin_format');
        }

        return $pin;
    }

    /** Lobbycode uit de URL. Een ongeldige code bestaat gewoon niet. */
    public static function code(string $value): string
    {
        $code = strtoupper(trim($value));
        if (preg_match('/^[A-Z]{4,5}$/', $code) !== 1) {
            throw new ApiException(404, 'Deze lobby bestaat niet (meer).', 'lobby_not_found');
        }

        return $code;
    }

    /** Vrije tekst zoals een chatbericht: opgeschoond en beperkt in lengte. */
    public static function text(mixed $value, int $max): string
    {
        $text = self::clean($value);
        if ($text === '' || mb_strlen($text) > $max) {
            throw new ApiException(422, "Een bericht bestaat uit 1 tot $max tekens.", 'bad_message');
        }

        return $text;
    }

    private static function clean(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        // Stuurtekens (ook onzichtbare zoals zero-width spaties en bidi-tekens) eruit, spaties samenvoegen.
        $value = preg_replace('/[\p{Cc}\p{Cf}]/u', '', $value) ?? '';
        $value = preg_replace('/\s+/u', ' ', $value) ?? '';

        return trim($value);
    }
}
