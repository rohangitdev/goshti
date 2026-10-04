# GOSHTI audio assets

| Folder       | What                                                      | Played at (see `story-engine/soundDesign.ts`) |
|--------------|-----------------------------------------------------------|-----------------------------------------------|
| `ui/`        | Restrained interface sounds (`uiSoundService`)            | soft (0.35)                                   |
| `signature/` | GOSHTI signature, before Aaji's intro line                | 0.6                                           |
| `sfx/`       | One-shot story effects (approved ids only)                | secondary, by age (0.40–0.55)                 |
| `ambience/`  | Looping background beds                                   | low (0.11–0.13)                               |
| `music/`     | Short, occasional mood cues                               | very low (0.06–0.08)                          |

Aaji's narration always plays at full level; everything else sits underneath it.

## Licensing

**Every file here is a PLACEHOLDER synthesized from code** by
`scripts/generate-placeholder-audio.mjs` (sine tones, plucked strings and filtered noise; no samples,
no downloads). They are original and carry no third-party rights.

Before launch, replace them with professionally designed or properly licensed sounds, keeping the
same file names. Do **not** use sounds taken from other children's audio albums, films, YouTube
or unlicensed libraries. The signature must be an original GOSHTI composition.

## Approved ids with no placeholder yet

These need real, licensed recordings (synthesizing them convincingly isn't possible). Until a file is
added and registered in `src/services/soundAssets.ts`, the player silently skips them:

`CAT_MEOW`, `DOG_BARK`, `ELEPHANT`, `LION`, `LAUGHTER`, `RAIN_HEAVY`
