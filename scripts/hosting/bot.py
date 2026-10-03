#!/usr/bin/env python3
"""
ENRP NEXUS – Python-Starter für Panels, die nur "python3 bot.py" starten können.

Das Projekt läuft mit Node.js. Dieses Skript
  1. nutzt ein vorhandenes Node.js (>= 22), sonst
  2. lädt die offizielle Node.js-Version von nodejs.org (Prüfsumme wird gegen SHASUMS256.txt von nodejs.org geprüft)
     einmalig nach ./.node und
  3. startet dann bot.js (eigenständiger Discord-Bot) bzw. start.js (komplettes Hosting-Paket).

Besser (falls im Panel möglich): Server auf Node.js umstellen und direkt "node bot.js" starten – dann wird dieses Skript nicht gebraucht.
"""
import hashlib
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request

NODE_VERSION = os.environ.get("NEXUS_NODE_VERSION", "22.23.3")
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


def log(msg):
    print(f"[starter] {msg}", flush=True)


def node_major(path):
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=20).stdout.strip()
        return int(out.lstrip("v").split(".")[0])
    except Exception:
        return 0


def find_node():
    local = os.path.join(HERE, ".node", "bin", "node")
    for candidate in (shutil.which("node"), local):
        if candidate and os.path.exists(candidate) and node_major(candidate) >= 22:
            return candidate
    return None


def download_node():
    system = (os.environ.get("NEXUS_FORCE_OS") or platform.system()).lower()
    if system != "linux":
        log(f"FEHLER: Automatischer Node-Download ist nur für Linux gedacht (hier: {system}). Bitte Node.js >= 22 installieren.")
        sys.exit(1)
    machine = platform.machine().lower()
    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(machine)
    if not arch:
        log(f"FEHLER: Unbekannte CPU-Architektur '{machine}'.")
        sys.exit(1)
    name = f"node-v{NODE_VERSION}-linux-{arch}.tar.xz"
    base = f"https://nodejs.org/dist/v{NODE_VERSION}"
    log(f"Node.js >= 22 nicht gefunden – lade {name} von nodejs.org (einmalig, ca. 30 MB) …")
    try:
        sums = urllib.request.urlopen(f"{base}/SHASUMS256.txt", timeout=60).read().decode()
        expected = next(line.split()[0] for line in sums.splitlines() if line.strip().endswith(name))
        archive = os.path.join(HERE, ".node-download.tar.xz")
        h = hashlib.sha256()
        with urllib.request.urlopen(f"{base}/{name}", timeout=120) as resp, open(archive, "wb") as f:
            for chunk in iter(lambda: resp.read(1024 * 1024), b""):
                h.update(chunk)
                f.write(chunk)
    except Exception as e:  # Netzwerk, fehlende Version, ...
        log(f"FEHLER beim Download: {e}")
        log("Tipp: Stelle den Server im Panel auf Node.js (22 oder neuer) um und starte 'node bot.js'.")
        sys.exit(1)
    if h.hexdigest() != expected:
        os.remove(archive)
        log("FEHLER: Prüfsumme stimmt nicht – Download wird verworfen.")
        sys.exit(1)
    log("Prüfsumme OK – entpacke …")
    target = os.path.join(HERE, ".node")
    shutil.rmtree(target, ignore_errors=True)
    os.makedirs(target)
    with tarfile.open(archive, "r:xz") as tar:
        for m in tar.getmembers():  # kein Entpacken außerhalb des Zielordners
            dest = os.path.realpath(os.path.join(target, m.name))
            if not dest.startswith(os.path.realpath(target) + os.sep):
                log("FEHLER: unsicheres Archiv.")
                sys.exit(1)
        tar.extractall(target)
    os.remove(archive)
    # Der Archiv-Ordner node-vX-linux-ARCH/ wird eine Ebene hochgezogen -> .node/bin/node
    inner = os.path.join(target, name.replace(".tar.xz", ""))
    for entry in os.listdir(inner):
        shutil.move(os.path.join(inner, entry), os.path.join(target, entry))
    os.rmdir(inner)
    node = os.path.join(target, "bin", "node")
    try:
        log(f"Node.js bereit: {subprocess.run([node, '--version'], capture_output=True, text=True).stdout.strip()}")
    except OSError as e:  # z. B. falsche Architektur
        log(f"WARNUNG: heruntergeladenes Node.js lässt sich nicht ausführen ({e}).")
    return node


def main():
    entry = os.environ.get("NEXUS_ENTRY") or next((f for f in ("bot.js", "start.js") if os.path.exists(f)), None)
    if not entry:
        log("FEHLER: weder bot.js noch start.js im Ordner gefunden. ZIP vollständig entpackt?")
        sys.exit(1)
    node = find_node() or download_node()
    if os.environ.get("NEXUS_NO_EXEC"):  # nur für Tests
        log(f"(Test) würde starten: {node} {entry}")
        return
    log(f"Starte {entry} …")
    os.execv(node, [node, entry])


main()
