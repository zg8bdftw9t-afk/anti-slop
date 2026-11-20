import subprocess, wave, json, numpy as np, os
SR = 44100
D = "/tmp/claude-0/w/audio"
os.makedirs(D, exist_ok=True)

TEXTS = [
    "Bobo dan Bintang Kecil. Sebuah cerita anak dengan animasi empat dimensi.",
    "Pada suatu malam, Bobo si kelinci kecil sedang memandang langit yang penuh bintang.",
    "Tiba-tiba, sebuah bintang jatuh dari langit! Duar! Hutan pun bergetar.",
    "Bobo melompat mendekat. Ternyata bintang itu masih hidup! Aku tersesat, kata si Bintang. Aku tidak bisa pulang.",
    "Jangan sedih, kata Bobo. Aku akan membantumu! Kunang-kunang pun datang, membuat jalan cahaya menuju bukit.",
    "Bobo dan Bintang berjalan menembus hutan, lalu mendaki bukit yang tinggi. Hop, hop, hop!",
    "Di puncak bukit, Bintang bersinar terang, lalu melayang kembali ke langit. Terima kasih, Bobo!",
    "Sejak malam itu, Bobo tahu, menolong teman akan membuat hati bahagia. Tamat.",
]
FIRST_PART = "Tiba-tiba, sebuah bintang jatuh dari langit!"

def tts(text, path):
    raw = path + ".raw.wav"
    subprocess.run(["espeak-ng", "-v", "id", "-s", "120", "-p", "68", "-g", "4", text, "-w", raw], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-ar", str(SR), "-ac", "1", path], check=True)

def read(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768

LEAD, TAIL = 0.9, 1.3
voices, scenes, t = [], [], 0.0
for i, tx in enumerate(TEXTS):
    p = f"{D}/v{i}.wav"; tts(tx, p); v = read(p); voices.append(v)
    dur = LEAD + len(v) / SR + TAIL + (1.5 if i in (0, 7) else 0)
    scenes.append({"text": tx, "start": round(t, 3), "dur": round(dur, 3)})
    t += dur
total = t

# impact time ("Duar!") in scene 2
tts(FIRST_PART, f"{D}/first.wav")
a = len(read(f"{D}/first.wav")) / SR
impact = scenes[2]["start"] + LEAD + a + 0.1
json.dump({"fps": 24, "scenes": scenes, "total": total, "impact": impact}, open("/tmp/claude-0/w/timeline.json", "w"), ensure_ascii=False, indent=1)

N = int(total * SR) + SR
mix = np.zeros(N, np.float32)
def put(sig, at, gain=1.0):
    s = int(at * SR); e = min(N, s + len(sig)); mix[s:e] += sig[:e - s] * gain

for i, v in enumerate(voices):
    put(v, scenes[i]["start"] + LEAD, 1.0)

# music box
rng = np.random.default_rng(3)
scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]
def pluck(f, dur=1.6):
    tt = np.arange(int(dur * SR)) / SR
    s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.12 * np.sin(2 * np.pi * 3.01 * f * tt)) * np.exp(-tt * 3.2)
    return s.astype(np.float32)
idx = 2; tcur = 0.3; music = np.zeros(N, np.float32)
while tcur < total:
    idx = int(np.clip(idx + rng.choice([-2, -1, -1, 1, 1, 2]), 0, len(scale) - 1))
    p = pluck(scale[idx]); s = int(tcur * SR); e = min(N, s + len(p)); music[s:e] += p[:e - s]
    if rng.random() < 0.3:
        p2 = pluck(scale[idx] / 2); music[s:e] += 0.5 * p2[:e - s]
    tcur += rng.choice([0.5, 0.5, 0.75, 1.0])
# echo
for dly, g in [(0.28, 0.35), (0.56, 0.2)]:
    k = int(dly * SR); music[k:] += music[:-k] * g
mix += music * 0.09

# whoosh + boom at impact
def noise(dur): return rng.standard_normal(int(dur * SR)).astype(np.float32)
def lowpass(x, a):
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc); y[i] = acc
    return y
w0 = scenes[2]["start"] + 0.5
wd = impact - w0
wn = lowpass(noise(wd), 0.08)
env = np.linspace(0, 1, len(wn)) ** 2
put(wn * env * 3.0, w0, 0.9)
bd = 2.2
tt = np.arange(int(bd * SR)) / SR
boom = (np.sin(2 * np.pi * (55 - 20 * tt) * tt) * np.exp(-tt * 2.2) * 1.0 + lowpass(noise(bd), 0.05) * np.exp(-tt * 3) * 4)
put(boom.astype(np.float32), impact, 0.9)
# chimes for fireflies (scene 4) and star leaving (scene 6)
for base, n in [(scenes[4]["start"] + 3.0, 10), (scenes[6]["start"] + 3.5, 14)]:
    for k in range(n):
        put(pluck(scale[k % 6] * 2, 1.2), base + k * 0.22, 0.12)

mix /= max(1.0, np.abs(mix).max() / 0.95)
out = "/tmp/claude-0/w/audio.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("total", total, "impact", impact)
