# GOSHTI audio assets

| Folder       | What                                                      | Played at (see `story-engine/soundDesign.ts`) |
|--------------|-----------------------------------------------------------|-----------------------------------------------|
| `ui/`        | Restrained interface sounds (`uiSoundService`)            | soft (0.35)                                   |
| `signature/` | GOSHTI signature, before Aaji's intro line                | 0.6                                           |
| `sfx/`       | One-shot story effects (approved ids only)                | secondary, by age (0.35–0.50)                 |
| `ambience/`  | Scene-setting beds (~20 s, then fade)                     | low (0.07–0.09)                               |
| `music/`     | Short, occasional mood cues                               | very low (0.04–0.06)                          |

Aaji's narration always plays at full level; everything else sits underneath it.

## Waiting song

`signature/goshti-waiting-song.m4a` plays once while Aaji prepares a story (fades out when the story
is ready; off with the parent "app sounds" switch). Original words and tune by Rohan Shukla, sung by
him and processed into a young girl's voice, with a code-generated accompaniment — see
`scripts/audio/README.md`. It is the one non-placeholder file here.

## Licensing

**Every other file here is a PLACEHOLDER synthesized from code** by
`scripts/generate-placeholder-audio.mjs` (sine tones, plucked strings and filtered noise; no samples,
no downloads). They are original and carry no third-party rights.

Before launch, replace them with professionally designed or properly licensed sounds, keeping the
same file names. Do **not** use sounds taken from other children's audio albums, films, YouTube
or unlicensed libraries. The signature must be an original GOSHTI composition.

## Approved ids with no placeholder yet

These need real, licensed recordings (synthesizing them convincingly isn't possible). Until a file is
added and registered in `src/services/soundAssets.ts`, the player silently skips them:

`CAT_MEOW`, `DOG_BARK`, `ELEPHANT`, `LION`, `LAUGHTER`, `RAIN_HEAVY`

Generated but **switched off** (the synthesized water sounded artificial): `WATER_STREAM`, `WAVES`,
`RAIN_LIGHT`, `SPLASH`. The files remain for reference; register real recordings to turn them back on.

## How often sounds play

- Ambience sets the scene for ~20 s, then fades out (it does not loop under the whole story).
- One-shot effects are at least ~15 s apart, and capped per minute by age (3 / 2 / 2 / 1).
