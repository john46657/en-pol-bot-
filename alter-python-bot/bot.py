#!/usr/bin/env python3
"""
Weiterleitung auf den neuen EN-Polizei-Discord-Bot.

Manche Panels starten fest `alter-python-bot/bot.py` (Variable STARTUP_FILE). Damit dort der NEUE Bot läuft,
führt diese Datei einfach ../bot.py aus (Starter, der Node.js bereitstellt und bot.js startet).
Der frühere Python-Bot liegt unverändert in ../archiv-alter-python-bot/.
Einstellungen (.env) liegen im Hauptverzeichnis des Servers neben bot.py.
"""
import os
import runpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
runpy.run_path(os.path.join(ROOT, "bot.py"), run_name="__main__")
