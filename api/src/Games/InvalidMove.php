<?php

declare(strict_types=1);

namespace Dg\Games;

use RuntimeException;

/** De zet is volgens de spelregels niet toegestaan. De melding mag aan de speler getoond worden. */
final class InvalidMove extends RuntimeException
{
}
