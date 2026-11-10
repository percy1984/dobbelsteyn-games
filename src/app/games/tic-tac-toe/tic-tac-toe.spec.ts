import { ComponentFixture, TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n';
import { SeatView } from '../../core/lobby/lobby.models';
import { TicTacToe } from './tic-tac-toe';

type Mark = null | 'X' | 'O';

function seat(seatNo: number, name: string): SeatView {
  return {
    seatNo,
    kind: 'human',
    name,
    isCreator: seatNo === 0,
    isPromoted: false,
    botLevel: null,
    isAway: false,
  };
}

function view(board: Mark[], options: { turnSeat?: number | null; line?: number[] | null } = {}) {
  return {
    board,
    marks: { '0': 'X', '1': 'O' },
    yourMark: 'X',
    turnSeat: options.turnSeat ?? 0,
    winnerSeat: null,
    line: options.line ?? null,
    moves: board.filter(Boolean).length,
  };
}

const EMPTY: Mark[] = Array(9).fill(null);

async function render(
  board: Mark[],
  inputs: {
    mySeatNo?: number;
    activeSeats?: number[];
    disabled?: boolean;
    line?: number[] | null;
    lang?: 'nl' | 'en';
  } = {},
) {
  localStorage.clear();
  const submit = vi.fn().mockResolvedValue(undefined);
  TestBed.inject(I18n).setLang(inputs.lang ?? 'nl');
  const fixture: ComponentFixture<TicTacToe> = TestBed.createComponent(TicTacToe);
  fixture.componentRef.setInput('view', view(board, { line: inputs.line }));
  fixture.componentRef.setInput('seats', [seat(0, 'Percy'), seat(1, 'Anna')]);
  fixture.componentRef.setInput('mySeatNo', inputs.mySeatNo ?? 0);
  fixture.componentRef.setInput('activeSeats', inputs.activeSeats ?? [0]);
  fixture.componentRef.setInput('result', null);
  fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
  fixture.componentRef.setInput('submit', submit);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    fixture,
    submit,
    cells: () => Array.from(el.querySelectorAll<HTMLButtonElement>('.cell')),
  };
}

describe('TicTacToe', () => {
  it('toont een bord van negen vakjes', async () => {
    const { cells } = await render(EMPTY);

    expect(cells()).toHaveLength(9);
  });

  it('laat je in jouw beurt een leeg vakje kiezen en stuurt de zet naar het platform', async () => {
    const { cells, submit, fixture } = await render(EMPTY);

    cells()[4].click();
    await fixture.whenStable();

    expect(submit).toHaveBeenCalledWith({ cell: 4 });
  });

  it('staat geen zet toe als je niet aan de beurt bent', async () => {
    const { cells, submit } = await render(EMPTY, { activeSeats: [1] });

    expect(cells().every((cell) => cell.disabled)).toBe(true);
    cells()[0].click();
    expect(submit).not.toHaveBeenCalled();
  });

  it('staat geen zet toe op een bezet vakje, maar wel op de lege', async () => {
    const board: Mark[] = ['X', null, 'O', null, null, null, null, null, null];
    const { cells, submit } = await render(board);

    expect(cells()[0].disabled).toBe(true);
    expect(cells()[2].disabled).toBe(true);
    expect(cells()[1].disabled).toBe(false);
    cells()[0].click();
    expect(submit).not.toHaveBeenCalled();
  });

  it('is uitgeschakeld terwijl een zet onderweg is of het spel afgelopen is', async () => {
    const { cells } = await render(EMPTY, { disabled: true });

    expect(cells().every((cell) => cell.disabled)).toBe(true);
  });

  it('toont de tekens en markeert de winnende lijn', async () => {
    const board: Mark[] = ['X', 'X', 'X', 'O', 'O', null, null, null, null];
    const { cells } = await render(board, { line: [0, 1, 2], activeSeats: [] });

    expect(cells()[0].textContent?.trim()).toBe('X');
    expect(cells()[3].textContent?.trim()).toBe('O');
    expect(cells().filter((cell) => cell.classList.contains('cell--win'))).toHaveLength(3);
    expect(cells()[4].classList.contains('cell--win')).toBe(false);
  });

  it('beschrijft elk vakje voor hulpsoftware, in de gekozen taal', async () => {
    const board: Mark[] = ['X', null, null, null, null, null, null, null, 'O'];

    const nl = await render(board);
    expect(nl.cells()[0].getAttribute('aria-label')).toBe('Rij 1, kolom 1: kruisje (X)');
    expect(nl.cells()[1].getAttribute('aria-label')).toBe('Rij 1, kolom 2: leeg');
    expect(nl.cells()[8].getAttribute('aria-label')).toBe('Rij 3, kolom 3: rondje (O)');
    expect(nl.el.querySelector('.board')?.getAttribute('aria-label')).toBe('Tic-Tac-Toe-bord');

    TestBed.resetTestingModule();
    const en = await render(board, { lang: 'en' });
    expect(en.cells()[0].getAttribute('aria-label')).toBe('Row 1, column 1: cross (X)');
    expect(en.el.querySelector('.board')?.getAttribute('aria-label')).toBe('Tic-Tac-Toe board');
  });

  it('toont wie welk teken speelt en wie jijzelf bent', async () => {
    const { el } = await render(EMPTY);

    const players = Array.from(el.querySelectorAll('.ttt__player')).map((p) =>
      p.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(players).toEqual(['X Percy (jij)', 'O Anna']);
  });

  it('herkent jezelf ook als je het tweede teken speelt', async () => {
    const { el } = await render(EMPTY, { mySeatNo: 1, activeSeats: [1] });

    expect(el.querySelector('.ttt__player--me')?.textContent).toContain('Anna');
  });

  it('is bruikbaar zonder spelstaat (bijvoorbeeld net voor het begin)', async () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(TicTacToe);
    fixture.componentRef.setInput('submit', vi.fn());
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('.cell')).toHaveLength(9);
  });
});
