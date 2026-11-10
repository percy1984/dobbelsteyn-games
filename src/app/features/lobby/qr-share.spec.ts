import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { LobbyView } from '../../core/lobby/lobby.models';
import { QrGenerator } from '../../core/share/qr-generator';
import { QrShare } from './qr-share';

function lobby(isPrivate: boolean): LobbyView {
  return {
    code: 'ABCD',
    game: 'tic-tac-toe',
    status: 'waiting',
    isPrivate,
    minPlayers: 2,
    maxPlayers: 2,
    version: 1,
    seats: [],
    me: { seatNo: 0, isCreator: true, isPromoted: false, canManage: true },
    pin: isPrivate ? 'K7P2' : null,
  };
}

const QR_URL = 'data:image/png;base64,QVNE';

interface Env {
  clipboard?: { writeText?: ReturnType<typeof vi.fn>; write?: ReturnType<typeof vi.fn> };
  share?: ReturnType<typeof vi.fn>;
  clipboardItem?: boolean;
}

function setBrowser({ clipboard, share, clipboardItem }: Env): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  if (clipboardItem) {
    vi.stubGlobal(
      'ClipboardItem',
      class FakeItem {
        constructor(readonly items: Record<string, Blob>) {}
      },
    );
  } else {
    vi.stubGlobal('ClipboardItem', undefined);
  }
}

async function render(
  isPrivate = false,
  env: Env = {},
  generator = { dataUrl: vi.fn().mockResolvedValue(QR_URL) },
) {
  setBrowser(env);
  TestBed.configureTestingModule({ providers: [{ provide: QrGenerator, useValue: generator }] });
  TestBed.inject(I18n).setLang('nl');
  const fixture = TestBed.createComponent(QrShare);
  fixture.componentRef.setInput('lobby', lobby(isPrivate));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const open = async () => {
    el.querySelector<HTMLButtonElement>(':scope > button')!.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };
  const button = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.share__actions button')).find((b) =>
      b.textContent?.includes(text),
    );
  return { fixture, el, open, generator, button };
}

describe('QrShare', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'share');
  });

  beforeEach(() => localStorage.clear());

  it('maakt de QR pas als de popup opengaat', async () => {
    const { generator, open } = await render();
    expect(generator.dataUrl).not.toHaveBeenCalled();

    await open();

    expect(generator.dataUrl).toHaveBeenCalledTimes(1);
  });

  it('toont de QR met een beschrijving en de link van een openbare lobby zonder PIN', async () => {
    const { el, open, generator } = await render(false);
    await open();

    const img = el.querySelector<HTMLImageElement>('.share__qr')!;
    expect(img.getAttribute('src')).toBe(QR_URL);
    expect(img.getAttribute('alt')).toBe('QR-code om lobby ABCD te openen');
    const link = el.querySelector<HTMLInputElement>('#share-link')!.value;
    expect(link).toBe(new URL('lobby/ABCD', document.baseURI).toString());
    expect(generator.dataUrl).toHaveBeenCalledWith(link);
    expect(el.querySelector('.share__note')).toBeNull();
  });

  it('zet bij een privélobby de PIN in het fragment van de link en waarschuwt daarvoor', async () => {
    const { el, open } = await render(true);
    await open();

    const link = el.querySelector<HTMLInputElement>('#share-link')!.value;
    expect(new URL(link).hash).toBe('#p=K7P2');
    expect(new URL(link).search).toBe('');
    expect(el.querySelector('.share__note')?.textContent).toContain('bevat de PIN');
  });

  it('kopieert de link naar het klembord en meldt dat', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { el, fixture, open, button } = await render(true, { clipboard: { writeText } });
    await open();

    button('Link kopiëren')!.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(
      el.querySelector<HTMLInputElement>('#share-link')!.value,
    );
    expect(el.querySelector('.share__feedback')?.textContent).toBe('Gekopieerd');
  });

  it('meldt een mislukte kopie en wijst op handmatig kopiëren', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('geweigerd'));
    const { el, fixture, open, button } = await render(false, { clipboard: { writeText } });
    await open();

    button('Link kopiëren')!.click();
    await fixture.whenStable();

    expect(el.querySelector('.share__feedback')?.textContent).toContain(
      'Kopieer de link met de hand',
    );
  });

  it('toont de knop "QR kopiëren" alleen als de browser afbeeldingen kan kopiëren', async () => {
    const without = await render(false, { clipboard: { writeText: vi.fn() } });
    await without.open();
    expect(without.button('QR kopiëren')).toBeUndefined();

    TestBed.resetTestingModule();
    const withImage = await render(false, {
      clipboard: { writeText: vi.fn(), write: vi.fn().mockResolvedValue(undefined) },
      clipboardItem: true,
    });
    await withImage.open();
    expect(withImage.button('QR kopiëren')).toBeDefined();
  });

  it('kopieert de QR als afbeelding naar het klembord', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })) }),
    );
    const { el, fixture, open, button } = await render(false, {
      clipboard: { writeText: vi.fn(), write },
      clipboardItem: true,
    });
    await open();

    button('QR kopiëren')!.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(write).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.share__feedback')?.textContent).toBe('Gekopieerd');
  });

  it('toont "Delen" alleen als de browser een deelmenu heeft en deelt de link', async () => {
    const without = await render(false, { clipboard: { writeText: vi.fn() } });
    await without.open();
    expect(without.button('Delen')).toBeUndefined();

    TestBed.resetTestingModule();
    const share = vi.fn().mockResolvedValue(undefined);
    const { el, fixture, open, button } = await render(false, {
      clipboard: { writeText: vi.fn() },
      share,
    });
    await open();

    button('Delen')!.click();
    await fixture.whenStable();

    expect(share).toHaveBeenCalledWith({
      title: 'Dobbelsteyn Games',
      text: 'Doe mee met Tic-Tac-Toe op Dobbelsteyn Games. Code: ABCD',
      url: el.querySelector<HTMLInputElement>('#share-link')!.value,
    });
  });

  it('beschouwt het wegklikken van het deelmenu niet als fout', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('geannuleerd', 'AbortError'));
    const { el, fixture, open, button } = await render(false, {
      clipboard: { writeText: vi.fn() },
      share,
    });
    await open();

    button('Delen')!.click();
    await fixture.whenStable();

    expect(el.querySelector('.share__feedback')?.textContent).toBe('');
  });
});
