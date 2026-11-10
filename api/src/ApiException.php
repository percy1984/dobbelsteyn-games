<?php

declare(strict_types=1);

namespace Dg;

use RuntimeException;

/** Fout met een HTTP-status en een melding die aan de gebruiker getoond mag worden. */
final class ApiException extends RuntimeException
{
    /** @param string $errorCode stabiele code die de frontend vertaalt; de melding is de Nederlandse terugval */
    public function __construct(public readonly int $status, string $message, public readonly string $errorCode = 'error')
    {
        parent::__construct($message);
    }
}
