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

## Storage and sync

The app works local-first. Browser `localStorage` is the fast offline cache.
Sign in with a one-time email link to make Supabase the cross-device source of
truth. Existing data on that web origin moves into the account automatically.

Browser storage is origin-specific. Data saved in the old `file://` version cannot
be read directly by GitHub Pages. Export it once, sign in on the live app, then use
**Import existing data** in Settings. All later saves sync automatically.

Each account owns one protected JSON challenge row. Check-in photos live in a
private Storage bucket. Row Level Security prevents users from reading or
changing another user's data. The browser only contains Supabase's public key;
no server or secret key is shipped.

The automatic JSON file and **Export** remain available as optional backups.
The database setup is versioned in `supabase/migrations`.

## Credits

The favicon uses the
[Biceps Flexed icon](https://lucide.dev/icons/biceps-flexed) from
[Lucide](https://lucide.dev), licensed under the ISC License.
