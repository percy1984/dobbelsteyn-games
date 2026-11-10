import { Service } from '@angular/core';

/**
 * Maakt QR-codes in de browser. De bibliotheek wordt pas geladen als er een QR nodig is, en er
 * gaat niets naar een externe dienst: de lobbycode (en PIN) blijven op de eigen site.
 */
@Service()
export class QrGenerator {
  /** Een PNG als data-URL met rand en een gemiddelde foutcorrectie. */
  async dataUrl(text: string): Promise<string> {
    const { toDataURL } = await import('qrcode');
    return toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
  }
}
