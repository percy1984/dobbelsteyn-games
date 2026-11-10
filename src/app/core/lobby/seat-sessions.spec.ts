import { TestBed } from '@angular/core/testing';
import { SeatSessions } from './seat-sessions';

describe('SeatSessions', () => {
  let sessions: SeatSessions;

  beforeEach(() => {
    localStorage.clear();
    sessions = TestBed.inject(SeatSessions);
  });

  it('bewaart en leest een sessie per lobby, hoofdletterongevoelig', () => {
    sessions.set('abcd', { token: 't1', seatNo: 1 });

    expect(sessions.get('ABCD')).toEqual({ token: 't1', seatNo: 1 });
    expect(sessions.get('WXYZ')).toBeNull();
  });

  it('overleeft een nieuwe instantie (pagina opnieuw geopend)', () => {
    sessions.set('ABCD', { token: 't1', seatNo: 0 });

    expect(new SeatSessions().get('ABCD')).toEqual({ token: 't1', seatNo: 0 });
  });

  it('ruimt een sessie op', () => {
    sessions.set('ABCD', { token: 't1', seatNo: 0 });
    sessions.clear('ABCD');

    expect(sessions.get('ABCD')).toBeNull();
  });

  it('negeert kapotte opslag', () => {
    localStorage.setItem('dg.seat.ABCD', 'dit is geen json');

    expect(sessions.get('ABCD')).toBeNull();
  });

  it('werkt in het geheugen door als opslag niet beschikbaar is', () => {
    const broken = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('geblokkeerd');
    });

    sessions.set('ABCD', { token: 't1', seatNo: 0 });
    expect(sessions.get('ABCD')).toEqual({ token: 't1', seatNo: 0 });

    broken.mockRestore();
  });
});
