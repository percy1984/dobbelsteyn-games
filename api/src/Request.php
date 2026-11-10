<?php

declare(strict_types=1);

namespace Dg;

/** Wat de API van een binnenkomend verzoek nodig heeft. */
final class Request
{
    /**
     * @param array<string, string> $query
     * @param array<string, mixed> $body
     * @param array<string, string> $headers sleutels in kleine letters
     */
    public function __construct(
        public readonly string $method,
        public readonly array $query = [],
        public readonly array $body = [],
        public readonly array $headers = [],
        public readonly string $ip = '',
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (is_string($value) && str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            }
        }

        $body = [];
        $raw = file_get_contents('php://input');
        if ($raw !== false && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded) || array_is_list($decoded) && $decoded !== []) {
                throw new ApiException(400, 'Ongeldige JSON in het verzoek.', 'bad_json');
            }
            $body = $decoded;
        }

        // Achter een CDN/proxy staat het echte adres in X-Forwarded-For; zonder proxy in REMOTE_ADDR.
        $forwarded = $headers['x-forwarded-for'] ?? '';
        $ip = $forwarded !== '' ? trim(explode(',', $forwarded)[0]) : (string) ($_SERVER['REMOTE_ADDR'] ?? '');

        return new self(
            $_SERVER['REQUEST_METHOD'] ?? 'GET',
            array_map('strval', array_filter($_GET, 'is_scalar')),
            $body,
            $headers,
            $ip,
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** Geheim plaats-token van de speler (header X-Seat-Token). */
    public function seatToken(): ?string
    {
        $token = $this->header('X-Seat-Token');

        return $token !== null && $token !== '' ? $token : null;
    }

    public function string(string $key): ?string
    {
        $value = $this->body[$key] ?? null;

        return is_string($value) ? $value : null;
    }
}
