/**
 * Bouwt de link naar een lobby uit het adres waaronder de app nu draait (`baseUri`, de `<base href>`).
 * Zo staat er nergens een vast adres of pad in de code en werkt het onder elk sub-pad.
 *
 * Bij een privélobby zit de PIN in het URL-fragment (`#p=XXXX`): een fragment wordt niet naar de
 * server gestuurd en komt dus niet in serverlogs terecht.
 */
export function lobbyLink(baseUri: string, code: string, pin: string | null | undefined): string {
  const url = new URL(`lobby/${code}`, baseUri);
  if (pin) {
    url.hash = `p=${pin}`;
  }
  return url.toString();
}
