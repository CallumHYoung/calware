// Microgame registry. To add a new microgame: import it and add to the map.
// Each microgame must satisfy this contract:
//
//   {
//     key: string,            // stable id
//     title: string,          // flashed on the instruction card / preround
//     description: string,    // one-liner shown on the pre-round screen
//     controls: string,       // short hint ("Mouse — click", "WASD") — optional
//     thumbnail: string,      // path to image (optional — missing is fine)
//     baseDuration: number,   // seconds, scaled down by difficulty
//     mount(ctx): {
//       scene: THREE.Scene,
//       camera: THREE.Camera,
//       update(dt, elapsed),
//       dispose(),
//     }
//   }
//
// ctx carries { THREE, seed, difficulty, duration, onWin, onLose,
//               keys, mouse, playerColor, playerName }.

import dodge   from './dodge.js';
import punch   from './punch.js';
import jump    from './jump.js';
import collect from './collect.js';
import stack   from './stack.js';
import swat    from './swat.js';
import race    from './race.js';
import math    from './math.js';
import count   from './count.js';
import statue  from './statue.js';
import mash    from './mash.js';

export const microgames = { dodge, punch, jump, collect, stack, swat, race, math, count, statue, mash };
export const microgameKeys = Object.keys(microgames);
