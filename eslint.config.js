// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'dg',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'dg',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // Drie op een rij: de spelmotor is puur, deterministisch en zonder Angular. Geen eigen bron van
    // tijd of toeval: alles komt uit de tick en de seeded generator.
    files: [
      'src/app/games/drie-op-een-rij/engine/**/*.ts',
      'src/app/games/drie-op-een-rij/rng/**/*.ts',
      'src/app/games/drie-op-een-rij/level/**/*.ts',
    ],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Gebruik de seeded generator (rng/).' },
        { object: 'Date', property: 'now', message: 'De engine is de enige bron van tijd (ticks).' },
        { object: 'performance', property: 'now', message: 'De engine is de enige bron van tijd (ticks).' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'De engine is de enige bron van tijd (ticks).' },
        { name: 'setTimeout', message: 'Geen timers in de engine.' },
        { name: 'setInterval', message: 'Geen timers in de engine.' },
        { name: 'requestAnimationFrame', message: 'De lus hoort in de GameStore, niet in de engine.' },
        { name: 'localStorage', message: 'Opslag hoort niet in de engine.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@angular/*', 'rxjs', 'rxjs/*'], message: 'De engine is puur TypeScript.' }] },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
