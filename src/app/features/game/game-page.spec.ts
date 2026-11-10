import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiError } from '../../core/api/api-client';
import { I18n } from '../../core/i18n/i18n';
import { LobbyApi } from '../../core/lobby/lobby-api';
import { GamePage } from './game-page';

describe('GamePage', () => {
  let api: { create: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<GamePage>;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  function type(selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(formIndex = 0): Promise<void> {
    el.querySelectorAll('form')[formIndex].dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    api = { create: vi.fn(), list: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LobbyApi, useValue: api }],
    });
    TestBed.inject(I18n).setLang('nl');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(GamePage);
    fixture.componentRef.setInput('slug', 'tic-tac-toe');
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  it('toont de naam van de game', () => {
    expect(el.querySelector('h1')?.textContent).toBe('Tic-Tac-Toe');
  });

  it('maakt een openbare lobby en gaat ernaartoe', async () => {
    api.create.mockResolvedValue({ code: 'ABCD' });

    type('#create-name', 'Percy');
    await submit();

    expect(api.create).toHaveBeenCalledWith('tic-tac-toe', 'Percy', false, '');
    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ABCD']);
  });

  it('vraagt om een PIN bij een privélobby en stuurt die mee', async () => {
    api.create.mockResolvedValue({ code: 'WXYZ' });
    expect(el.querySelector('#create-pin')).toBeNull();

    el.querySelector<HTMLInputElement>('input[value="private"]')!.click();
    await fixture.whenStable();
    type('#create-name', 'Percy');
    type('#create-pin', 'k7p2');
    await submit();

    expect(api.create).toHaveBeenCalledWith('tic-tac-toe', 'Percy', true, 'k7p2');
  });

  it('maakt niets aan zonder naam en toont de validatiefout', async () => {
    await submit();

    expect(api.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Dit veld is verplicht.');
  });

  it('weigert een ongeldige PIN', async () => {
    el.querySelector<HTMLInputElement>('input[value="private"]')!.click();
    await fixture.whenStable();
    type('#create-name', 'Percy');
    type('#create-pin', 'ab');
    await submit();

    expect(api.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Precies 4 letters of cijfers.');
  });

  it('toont een vertaalde fout van de server', async () => {
    api.create.mockRejectedValue(new ApiError(503, 'no_code', 'x'));

    type('#create-name', 'Percy');
    await submit();

    expect(el.querySelector('.alert')?.textContent).toContain('geen vrije lobbycode');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opent een lobby met een ingetypte code, in hoofdletters', async () => {
    type('#join-code', 'abcd');
    await submit(1);

    expect(navigate).toHaveBeenCalledWith(['/lobby', 'ABCD']);
  });

  it('weigert een ongeldige code', async () => {
    type('#join-code', 'a1');
    await submit(1);

    expect(navigate).not.toHaveBeenCalled();
    expect(el.textContent).toContain('4 of 5 letters');
  });
});
