// keyboard and touch input. arrows or wasd drive; on phones two steer
// buttons appear and the throttle is always on.

export const MOBILE = matchMedia('(pointer:coarse)').matches;

export function makeInput() {
  const keys = new Set();
  let touchSteer = 0;

  addEventListener('keydown', (e) => keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));

  if (MOBILE) {
    // stopPropagation keeps button presses away from the tap handler, and
    // pointer capture makes sure we get the release even off the button
    const mkButton = (label, right, dir) => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText =
        `position:fixed;bottom:4vmin;right:${right}vmin;width:20vmin;height:20vmin;` +
        'border-radius:50%;background:#fff2;border:2px solid #fff5;color:#fffa;' +
        'font:bold 10vmin/19vmin monospace;text-align:center;' +
        'user-select:none;-webkit-user-select:none;touch-action:none;z-index:1';
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        touchSteer = dir;
      });
      b.addEventListener('pointerup', () => { if (touchSteer === dir) touchSteer = 0; });
      b.addEventListener('pointercancel', () => { if (touchSteer === dir) touchSteer = 0; });
      document.body.appendChild(b);
    };
    mkButton('◀', 27, -1);
    mkButton('▶', 4, 1);
  }

  const state = { steer: 0, throttle: 0, brake: false };

  return {
    read() {
      state.steer = Math.max(-1, Math.min(1,
        (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
        - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
        + touchSteer));
      state.throttle = MOBILE || keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0;
      state.brake = keys.has('ArrowDown') || keys.has('KeyS');
      return state;
    },
  };
}
