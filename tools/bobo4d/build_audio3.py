import subprocess, wave, json, os, numpy as np
SR = 44100; FPS = 24
D = "/tmp/claude-0/w/audio3"; os.makedirs(D, exist_ok=True)
VOICE = {"N": ["-v", "id+f2", "-s", "118", "-p", "42", "-g", "3"],
         "B": ["-v", "id+f4", "-s", "135", "-p", "82", "-g", "2"],
         "S": ["-v", "id+f5", "-s", "145", "-p", "99", "-g", "2"]}
SCENES = [
    [("N", "Dahulu kala, di Hutan Cahaya Bulan, hiduplah seekor kelinci kecil bernama Bobo.")],
    [("N", "Setiap malam, Bobo suka memandang bintang-bintang di langit."), ("B", "Indah sekali! Aku ingin punya sahabat bintang!")],
    [("N", "Tiba-tiba, sebuah bintang jatuh dari langit!"), "IMPACT", ("N", "Hutan pun bergetar."), ("B", "Wah! Apa itu?")],
    [("N", "Bobo memberanikan diri mendekat."), ("S", "Tolong aku. Aku tersesat, dan tidak bisa pulang ke langit."), ("B", "Jangan sedih, Bintang kecil. Aku akan membantumu!")],
    [("N", "Kunang-kunang pun datang, membuat jalan cahaya menuju bukit."), ("S", "Terima kasih, Bobo! Kamu baik sekali!")],
    [("N", "Dan mereka pun berjalan sambil bernyanyi."), "SONG"],
    [("S", "Aku sudah bisa pulang! Terima kasih, sahabatku!"), ("B", "Selamat jalan, Bintang! Sampai jumpa lagi!"), ("N", "Bintang pun melayang kembali ke langit, bersinar lebih terang dari sebelumnya.")],
    [("N", "Sejak malam itu, Bobo tahu, persahabatan adalah cahaya paling indah di dunia."), ("N", "Tamat.")],
]
SONG = [("B", "Selangkah demi selangkah kita melangkah bersama"),
        ("S", "Hutan gelap tak menakutkan ada cahaya di hati"),
        ("B", "Bukit tinggi pun kita daki demi sahabat sejati"),
        ("S", "Bersama kita pasti sampai di bawah sinar bulan")]
PENTA = {0: 523.25, 1: 587.33, 2: 659.25, 3: 783.99, 4: 880.0, 5: 1046.5}  # C D E G A C6
CONTOUR = [[0, 1, 2, 3, 2, 1], [2, 3, 4, 3, 2, 1, 0, 1], [0, 2, 3, 4, 5, 4, 3, 2], [2, 3, 4, 5, 4, 3, 1, 0]]

def tts(sp, text, name, pitch=None, speed=None):
    args = list(VOICE[sp])
    if pitch is not None: args[args.index("-p") + 1] = str(int(pitch))
    if speed is not None: args[args.index("-s") + 1] = str(int(speed))
    raw = f"{D}/{name}.raw.wav"; out = f"{D}/{name}.wav"
    subprocess.run(["espeak-ng", *args, text, "-w", raw], check=True)
    RAT = {"N": (1.8, "preserved"), "B": (1.7, "shifted"), "S": (1.4, "shifted")}[sp]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-ar", str(SR), "-ac", "1",
                    "-af", f"rubberband=pitch={RAT[0]}:formant={RAT[1]}:pitchq=quality,volume=0.9", out], check=True)
    with wave.open(out) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

LEAD, TAIL, GAP = 0.9, 1.3, 0.35
total_len = 0.0
placed = []   # (sp, audio, t0)
scenes = []; impact = None; song_lines = []
mouth = {"B": [], "S": []}
t = 0.0; n = 0
for si, items in enumerate(SCENES):
    cur = t + LEAD + (0.6 if si == 0 else 0); segs = []
    for it in items:
        if it == "IMPACT":
            impact = cur + 0.12; cur = impact + 1.1; continue
        if it == "SONG":
            cur += 0.4; BEAT = 0.62
            for li, (sp, line) in enumerate(SONG):
                words = line.split(); words_meta = []
                for wi, w in enumerate(words):
                    deg = CONTOUR[li][wi % len(CONTOUR[li])]
                    if wi == len(words) - 1: deg = 0 if li % 2 else 3
                    pitch = 28 + deg * 11 + (6 if sp == "S" else 0)
                    a = tts(sp, w, f"song{li}_{wi}", pitch=pitch, speed=105)
                    t0 = cur + wi * BEAT
                    placed.append((sp, a, t0, 1.0))
                    song_lines.append(("note", PENTA[deg], t0, BEAT * 0.95))
                    words_meta.append({"w": w, "t0": t0, "t1": t0 + BEAT})
                song_lines.append(("line", sp, line, words_meta))
                cur += len(words) * BEAT + BEAT * 0.8
            continue
        sp, tx = it
        a = tts(sp, tx, f"s{si}_{n}"); n += 1
        placed.append((sp, a, cur, 1.0)); segs.append({"sp": sp, "text": tx, "t0": cur, "t1": cur + len(a) / SR})
        cur += len(a) / SR + GAP
    dur = cur - t + TAIL - GAP + (1.5 if si in (0, 7) else 0)
    scenes.append({"start": t, "dur": dur, "segs": segs}); t += dur
total = t
lines_meta = [x for x in song_lines if x[0] == "line"]
notes = [x for x in song_lines if x[0] == "note"]

N = int(total * SR) + SR * 2
voice = np.zeros(N, np.float32)
env = {"B": np.zeros(N, np.float32), "S": np.zeros(N, np.float32)}
for sp, a, t0, g in placed:
    s = int(t0 * SR); e = min(N, s + len(a)); voice[s:e] += a[:e - s] * g
    if sp in env: env[sp][s:e] += np.abs(a[:e - s])
nfr = int(total * FPS) + 2
for sp in env:
    arr = []
    win = SR // FPS
    for f in range(nfr):
        seg = env[sp][f * win:(f + 1) * win]; arr.append(float(seg.mean()) if len(seg) else 0.0)
    arr = np.array(arr); ref = np.percentile(arr[arr > 1e-4], 90) if (arr > 1e-4).any() else 1
    arr = np.clip(arr / ref, 0, 1) ** 0.8
    sm = np.convolve(arr, [0.25, 0.5, 0.25], mode="same")
    mouth[sp] = [round(float(x), 3) for x in sm]

json.dump({"fps": FPS, "total": total, "impact": impact, "scenes": scenes, "mouth": mouth,
           "song": [{"sp": l[1], "text": l[2], "words": l[3]} for l in lines_meta]},
          open("/tmp/claude-0/w/timeline3.json", "w"), ensure_ascii=False)

# ---------- music ----------
rng = np.random.default_rng(5)
mus = np.zeros(N, np.float32)
def add(sig, t0, g=1.0):
    s = int(t0 * SR)
    if s >= N: return
    e = min(N, s + len(sig)); mus[s:e] += sig[:e - s] * g
def tone(f, dur, kind):
    tt = np.arange(int(dur * SR)) / SR
    if kind == "pad":
        sig = sum(np.sin(2 * np.pi * f * k * tt + k) / k for k in (1, 2, 3, 4)) * 0.5
        sig += 0.4 * np.sin(2 * np.pi * f * 1.004 * tt)
        env = np.minimum(1, tt / 0.9) * np.minimum(1, (dur - tt) / 0.9)
        return (sig * env).astype(np.float32)
    if kind == "harp":
        sig = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2 * f * tt) + 0.15 * np.sin(2 * np.pi * 3 * f * tt)) * np.exp(-tt * 3.2)
        return (sig * np.minimum(1, tt / 0.005)).astype(np.float32)
    if kind == "bell":
        sig = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 4) + 0.25 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt * 8)) * np.exp(-tt * 2.2)
        return sig.astype(np.float32)
    if kind == "timp":
        sig = np.sin(2 * np.pi * (f + 25 * np.exp(-tt * 5)) * tt) * np.exp(-tt * 2.6)
        return sig.astype(np.float32)
NOTE = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = {"C": [48, 52, 55], "Am": [45, 48, 52], "F": [41, 45, 48], "G": [43, 47, 50], "Em": [40, 43, 47], "Dm": [38, 41, 45]}
PROG = {0: ["C", "G", "Am", "F"], 1: ["C", "Am", "F", "G"], 2: ["Am", "Am", "Em", "Em"], 3: ["Am", "F", "C", "G"], 4: ["F", "G", "Am", "G"],
        5: ["C", "G", "Am", "F"], 6: ["F", "G", "C", "C"], 7: ["C", "Am", "F", "G", "C", "C"]}
BAR = 1.9
for si, sc in enumerate(scenes):
    nb = int(np.ceil(sc["dur"] / BAR)); prog = PROG[si]
    for b in range(nb):
        t0 = sc["start"] + b * BAR; ch = CH[prog[b % len(prog)]]; dur = min(BAR + 0.8, sc["start"] + sc["dur"] + 1.0 - t0)
        for m in ch: add(tone(NOTE(m), BAR + 0.9, "pad"), t0, 0.07)
        add(tone(NOTE(ch[0] - 12), BAR + 0.5, "pad"), t0, 0.09)
        # harp arpeggio
        arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12, ch[1] + 12] if si in (1, 3, 4, 5, 6, 7, 0) else []
        step = BAR / (len(arp) or 1)
        for k, m in enumerate(arp): add(tone(NOTE(m), 1.4, "harp"), t0 + k * step, 0.11 if si != 3 else 0.07)
        if si in (0, 1, 7) and b % 2 == 1: add(tone(NOTE(ch[2] + 24), 1.8, "bell"), t0 + 0.9, 0.07)
for _, f, t0, d in notes: add(tone(f, 1.5, "bell"), t0, 0.14)
# tension tremolo before impact + dramatic hit
S2 = scenes[2]; tt = np.arange(int((impact - S2["start"]) * SR)) / SR
trem = (np.sin(2 * np.pi * 110 * tt) + 0.5 * np.sin(2 * np.pi * 165 * tt)) * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * tt)) * np.minimum(1, tt / 1.5)
add(trem.astype(np.float32), S2["start"], 0.07)
for k, f in enumerate([65.4, 98, 130.8]): add(tone(f, 2.5, "timp"), impact, 0.45)
for m in (48, 55, 64, 72): add(tone(NOTE(m), 3.5, "pad"), impact, 0.12)
for k in range(10): add(tone(NOTE(84 - k % 4), 1.5, "bell"), impact + 0.3 + k * 0.08, 0.06)
# star rises swell
S6 = scenes[6]; r0 = S6["start"] + S6["dur"] * 0.5
for k in range(18): add(tone(PENTA[k % 6] * 2, 1.2, "bell"), r0 + k * 0.2, 0.06)
for dly, g in [(0.3, 0.3), (0.62, 0.18)]:
    k = int(dly * SR); mus[k:] += mus[:-k] * g
fx = np.zeros(N, np.float32)
def lp(x, a):
    from scipy.signal import lfilter
    return lfilter([a], [1, -(1 - a)], x).astype(np.float32)
w0 = S2["start"] + 0.5; wn = lp(rng.standard_normal(int((impact - w0) * SR)).astype(np.float32), 0.08) * (np.linspace(0, 1, int((impact - w0) * SR)) ** 2) * 3
fx[int(w0 * SR):int(w0 * SR) + len(wn)] += wn * 0.8
bt = np.arange(int(2.2 * SR)) / SR
boom = np.sin(2 * np.pi * (55 - 20 * bt) * bt) * np.exp(-bt * 2.2) + lp(rng.standard_normal(len(bt)).astype(np.float32), 0.05) * np.exp(-bt * 3) * 4
fx[int(impact * SR):int(impact * SR) + len(bt)] += boom.astype(np.float32) * 0.8
mix = voice * 1.0 + mus * 1.0 + fx
mix /= max(1.0, np.abs(mix).max() / 0.95)
with wave.open("/tmp/claude-0/w/audio3.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("total", total, "impact", impact, [round(s["dur"], 1) for s in scenes])
