/**
 * Run `start` once the page is actually shown to the person, not while Chrome prerenders it.
 *
 * Chrome prerenders an address typed or pasted into the address bar before Enter is pressed,
 * for sites visited often. A prerendered page gets its own sessionStorage, swapped for the tab's
 * real one when it is shown, so a `?start=` keyword stored during the prerender is lost and the
 * flow never starts. Starting the app then would also open a socket, and could send a keyword,
 * for a page the person may never open.
 */
export const whenShown = (start: () => void, doc: Document = document): void => {
  if ((doc as Document & { prerendering?: boolean }).prerendering) {
    doc.addEventListener('prerenderingchange', () => start(), { once: true });
    return;
  }

  start();
};
