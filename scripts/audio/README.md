# Waiting song tools (not part of the app build)

`goshti-waiting-song.m4a` (assets/audio/signature) = Rohan's own original song, sung by him,
changed to a young girl's voice, with a soft accompaniment in E♭. To redo it from a new recording:

```
pip install pyworld soundfile numpy        # plus ffmpeg on the PATH
ffmpeg -ss 2 -i recording.m4a -ac 1 -ar 44100 -af "highpass=f=80,afftdn=nf=-30,lowpass=f=12000" clean.wav
python3 scripts/audio/child_voice.py clean.wav vocal.wav --pitch-hz 360 --formant 1.52
python3 scripts/audio/accompaniment.py vocal.wav song-mix.wav
ffmpeg -i song-mix.wav -af "highpass=f=60,loudnorm=I=-18:TP=-1.5:LRA=11" -c:a aac -b:a 128k goshti-waiting-song.m4a
```

The accompaniment's chord changes are timed to the current song's phrases; a new song needs new
timings in `accompaniment.py`. Raw recordings are not kept in the repository.
