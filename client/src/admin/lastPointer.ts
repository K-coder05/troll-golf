/** Where the pointer was at the last right-click, so a radial menu choice can act on that spot of the course. */
export const lastPointer = { x: 0, y: 0 };

window.addEventListener(
  "contextmenu",
  (e) => {
    lastPointer.x = e.clientX;
    lastPointer.y = e.clientY;
  },
  true,
);
