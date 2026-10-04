# GOSHTI — manual device test checklist

Run on a real phone (Expo Go is fine). Use a story with **Aaji's voice** (generated or library story
after `npm run deploy:function`) and, separately, one that falls back to the phone voice
(airplane mode before opening a never-played story). Mark ✅ / ❌ and add a note for every ❌.

Device: ____________  OS: ____________  Date: ____________  Build/commit: ____________

## Playback basics
| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Open a story, tap ▶ | GOSHTI signature (≈2.5 s), then Aaji: "चला मग... गोष्ट सुरू करूया!", then the story | |
| 2 | Tap ❚❚ mid-sentence | Voice and background sound stop together | |
| 3 | Tap ▶ again | Resumes (no second signature); background sound resumes if still in its first ~20 s | |
| 4 | Let the story finish | Short warm ending sound; 😍/🙂/😐 appears; nothing keeps playing | |
| 5 | Tap ▶ after it finished (replay) | Starts again from the signature; **no "आजी लवकरच गोष्ट सुरू करतेय..." wait** (cached) | |
| 6 | Progress bar / timer | Moves steadily; total time is plausible | |
| 7 | Seek | Not supported in this build — confirm there is no broken seek control | |
| 8 | Tap ▶ five times quickly | Only one signature, one narration, no overlap | |

## Sound mix
| # | Step | Expected | Result |
|---|---|---|---|
| 9 | Listen to a full story | Aaji always clearly understandable; sounds occasional (≥15 s apart) | |
| 10 | Background ambience | Fades in, sets the scene ~20 s, fades away; never loops under the whole story | |
| 11 | Any sound that feels fake/too loud | Note the story title and moment → we switch that sound off | |
| 12 | Age 2–3 vs age 8–9 story | Younger: a few more playful sounds; older: subtle | |

## Device conditions
| # | Step | Expected | Result |
|---|---|---|---|
| 13 | Wired / USB-C headphones | Plays in headphones; unplugging pauses or continues sensibly (note which) | |
| 14 | Bluetooth headphones / speaker | Plays; no long delay before the voice | |
| 15 | Phone volume up/down | Changes story volume; UI sounds stay quieter than Aaji | |
| 16 | Silent / ring switch ON (iPhone) | Story still plays (silent mode is overridden for stories) | |
| 17 | App to background mid-story | Note: does audio stop or continue? (background audio is not configured yet — expected to stop) | |
| 18 | Back to foreground | Story can be resumed with ▶; nothing plays twice | |
| 19 | Lock the phone mid-story | Note behaviour (same as 17) | |
| 20 | Incoming call / alarm / Siri | Story pauses; after the call, ▶ resumes | |

## Navigation
| # | Step | Expected | Result |
|---|---|---|---|
| 21 | Back arrow while playing | Audio stops completely | |
| 22 | "अजून एक गोष्ट" while playing | Audio stops; Home shows | |
| 23 | Open story A, then quickly story B from My Stories | Only B plays; nothing from A | |
| 24 | Kill the app, reopen, replay a voiced story | Plays immediately from the phone (no re-generation, works offline) | |
| 25 | Airplane mode, replay an old voiced story | Plays (cached) | |
| 26 | Airplane mode, "आजीने गोष्ट निवडावी" | Library story or a prepared story plays; friendly screens only | |

## Limits, parent mode, feedback
| # | Step | Expected | Result |
|---|---|---|---|
| 27 | Use up 5 new stories (FREE) | Child sees "या महिन्याच्या नव्या गोष्टी ऐकून झाल्या!…" + replay/library buttons; no prices | |
| 28 | Replay saved stories after the limit | Works; counter does not change | |
| 29 | Short tap on "पालक ⚙︎" | Nothing happens | |
| 30 | Long-press "पालक ⚙︎" | Maths gate; wrong answer → new question; right answer → parent screen | |
| 31 | Parent: "₹99 / महिना" | Calm "GOSHTI Plus लवकरच उपलब्ध होईल." — no purchase | |
| 32 | Parent: switch off app sounds | Category/favourite sounds stop; story audio unchanged | |
| 33 | Tap 😍 after a story | Selected; parent screen shows the count | |
