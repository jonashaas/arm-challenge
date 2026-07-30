# Bigger Arm Challenge

A static 28-day arm challenge tracker made with plain HTML, CSS and JavaScript.

**Live app:** https://jonashaas.github.io/arm-challenge/

Each day logs 5 triceps sets followed by 5 biceps sets, including reps and
kg per arm. The target is 9–12 reps per set; the logger accepts 0–30 so the
record stays honest. One row represents both arms, so daily volume is calculated
as `kg × reps × 2`. A new training pre-fills kg and reps from the most recent
completed day while leaving every set unchecked.

Days with fewer than 5 sets for either muscle can be saved as partial. Partial
days retain honest reps and volume, advance the challenge, and are excluded from
completed-day PR and LOW comparisons.

## Run

Open `index.html` in a browser. No server or installation is required.

## Storage

Progress and compressed weekly photos are stored in browser `localStorage`.
On the first saved change, Chrome asks for one JSON backup file. After that,
every saved day, check-in, import, clear, or reset automatically rewrites that
file. The regular **Export** button remains available for extra snapshots.

## Credits

The favicon uses the
[Biceps Flexed icon](https://lucide.dev/icons/biceps-flexed) from
[Lucide](https://lucide.dev), licensed under the ISC License.
