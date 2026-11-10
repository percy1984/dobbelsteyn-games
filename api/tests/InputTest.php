<?php

declare(strict_types=1);

namespace Dg\Tests;

use Dg\ApiException;
use Dg\Games\Rng;
use Dg\Input;
use Dg\Lobbies\CodeGenerator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class InputTest extends TestCase
{
    public function testNameIsTrimmedAndWhitespaceCollapsed(): void
    {
        $this->assertSame('Anna de Vries', Input::name("  Anna \t de   Vries  "));
    }

    public function testNameStripsControlAndInvisibleCharacters(): void
    {
        $this->assertSame('Piet', Input::name("Pi\u{200B}e\u{202E}t\x07"));
    }

    /** @return array<string, array{mixed}> */
    public static function badNames(): array
    {
        return [
            'leeg' => [''],
            'alleen spaties' => ['   '],
            'te lang' => [str_repeat('a', 21)],
            'geen tekst' => [['x']],
            'null' => [null],
            'alleen onzichtbaar' => ["\u{200B}\u{200B}"],
        ];
    }

    #[DataProvider('badNames')]
    public function testBadNamesAreRejected(mixed $value): void
    {
        $this->expectException(ApiException::class);
        Input::name($value);
    }

    public function testNameMayContainEmojiAndAccents(): void
    {
        $this->assertSame('Zoë 🎲', Input::name('Zoë 🎲'));
    }

    public function testPinIsUppercasedAndMustBeFourAlphanumerics(): void
    {
        $this->assertSame('A1B2', Input::pin(' a1b2 '));

        foreach (['abc', 'abcde', 'ab-1', '', null] as $bad) {
            try {
                Input::pin($bad);
                $this->fail('PIN had geweigerd moeten worden.');
            } catch (ApiException $e) {
                $this->assertSame(422, $e->status);
            }
        }
    }

    public function testCodeMustLookLikeALobbyCode(): void
    {
        $this->assertSame('ABCD', Input::code('abcd'));
        $this->assertSame('ABCDE', Input::code('abcde'));

        foreach (['ab', 'abcdef', 'ab1d', '../x'] as $bad) {
            try {
                Input::code($bad);
                $this->fail('Code had geweigerd moeten worden.');
            } catch (ApiException $e) {
                $this->assertSame(404, $e->status);
            }
        }
    }

    public function testTextHasALengthLimit(): void
    {
        $this->assertSame('hoi', Input::text(' hoi ', 300));

        $this->expectException(ApiException::class);
        Input::text(str_repeat('x', 301), 300);
    }

    public function testGeneratedCodesAvoidLookAlikeLetters(): void
    {
        $generator = new CodeGenerator(new Rng());

        for ($i = 0; $i < 200; $i++) {
            $this->assertMatchesRegularExpression('/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/', $generator->code());
            $this->assertMatchesRegularExpression('/^[ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/', $generator->code(5));
            $this->assertMatchesRegularExpression('/^[A-Z0-9]{4}$/', $generator->pin());
        }
        $this->assertStringNotContainsString('I', CodeGenerator::LETTERS);
        $this->assertStringNotContainsString('O', CodeGenerator::LETTERS);
        $this->assertStringNotContainsString('L', CodeGenerator::LETTERS);
    }
}
