import { lobbyLink } from './lobby-link';

describe('lobbyLink', () => {
  it('bouwt de link uit het adres waaronder de app draait, onder elk sub-pad', () => {
    expect(lobbyLink('https://www.example.com/games/', 'ABCD', null)).toBe(
      'https://www.example.com/games/lobby/ABCD',
    );
    expect(lobbyLink('https://www.example.com/ander/pad/', 'WXYZ', null)).toBe(
      'https://www.example.com/ander/pad/lobby/WXYZ',
    );
    expect(lobbyLink('http://localhost:4200/', 'ABCD', null)).toBe(
      'http://localhost:4200/lobby/ABCD',
    );
  });

  it('zet de PIN van een privélobby in het fragment, niet in de query', () => {
    const link = lobbyLink('https://www.example.com/games/', 'ABCD', 'K7P2');

    expect(link).toBe('https://www.example.com/games/lobby/ABCD#p=K7P2');
    expect(new URL(link).search).toBe('');
    expect(new URL(link).hash).toBe('#p=K7P2');
  });

  it('laat het fragment weg zonder PIN', () => {
    expect(lobbyLink('https://www.example.com/games/', 'ABCD', '')).toBe(
      'https://www.example.com/games/lobby/ABCD',
    );
    expect(lobbyLink('https://www.example.com/games/', 'ABCD', undefined)).toBe(
      'https://www.example.com/games/lobby/ABCD',
    );
  });

  it('negeert een eventuele pagina in het basisadres', () => {
    expect(lobbyLink('https://www.example.com/games/lobby/OUD#p=XXXX', 'ABCD', null)).toBe(
      'https://www.example.com/games/lobby/lobby/ABCD',
    );
  });
});
