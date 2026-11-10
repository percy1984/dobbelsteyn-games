<?php

declare(strict_types=1);

namespace Dg;

/** JSON-respons. */
final class Response
{
    /** @param array<string, mixed>|list<mixed> $data */
    public function __construct(
        public readonly int $status,
        public readonly array $data,
    ) {
    }

    /** @param array<string, mixed>|list<mixed> $data */
    public static function json(array $data, int $status = 200): self
    {
        return new self($status, $data);
    }

    public static function error(int $status, string $message, string $code = 'error'): self
    {
        return new self($status, ['error' => $message, 'code' => $code]);
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($this->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
}
