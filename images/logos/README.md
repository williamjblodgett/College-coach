# Team Logos — drop-in pipeline

Gridiron Dynasty renders every team with a **color monogram badge** built from the
team's official colors + an emoji, so the game looks complete with zero image
assets. You can upgrade any team to a real logo simply by dropping a PNG here.

## How it works

For a team with id `alabama`, the game looks for:

```
images/logos/alabama.png
```

If the file exists it replaces the monogram automatically (see `teamBadge()` in
`js/ui.js`). If it's missing, the colored badge is used — no error, no broken
image. You never need to touch code; add files and reload.

## File requirements

- **Format:** PNG with transparent background (SVG is not auto-probed).
- **Size:** ~256×256 px square works best (badges render from ~28–72 px).
- **Name:** exactly the team `id` used in `js/data/teams-fbs.js` (all lowercase,
  no spaces). Search that file for a team to find its id.

## ⚠️ Legal / trademark notice

**Most college team logos and marks are trademarked** by the schools or their
licensors and are **not** distributed with this project. Do not commit logos you
don't have the right to use. Options that are generally safe to source yourself:

- **Public-domain / open-license marks:** some schools release historic or
  public-domain seals; check the school's brand/licensing page and Wikimedia
  Commons license tags before use.
- **Your own artwork:** original monograms or fan art you create.
- **Personal, non-distributed use:** you may add trademarked logos to *your own
  local copy* for private play, but do not redistribute them.

The bundled color-and-emoji fallback is original to this project and ships by
default precisely so that no trademarked assets are required to play.

## Team data corrections

Colors, cities, conferences, and prestige tiers in `js/data/teams-fbs.js` are
authored from public knowledge of the 2025 alignment. Public reference sources
for verifying/correcting them include Wikipedia's "List of NCAA Division I FBS
football programs", school athletics sites, and NCAA directories. Edits to the
data file are picked up on reload — no build step.
