# TRIOS / 3

Dein experimentelles Betriebssystem für eine virtuelle **balancierte ternäre
CPU** mit den Zuständen **−1, 0 und +1**. Läuft lokal im Browser auf deinem Mac.

## Starten

**Mac:** `Start.command` doppelklicken. Ein Terminalfenster und der Browser
öffnen sich. Das Terminalfenster während der Nutzung offen lassen; mit Ctrl+C
beendest du den lokalen Server. Node.js ab Version 20 wird benötigt und ist auf
dem Entwicklungsrechner vorhanden. Es sind keine zusätzlichen Pakete notwendig.

Alternativ im Projektordner:

```sh
cd trios
npm start
```

Dann [TRIOS öffnen](http://127.0.0.1:4313).

## Ausprobieren

In der Konsole:

```text
run hello
run counter
run fibonacci
calc -7 * 8
trit -8
help
```

**Einzelschritt** pausiert die automatische Ausführung und führt genau eine
Instruktion des ausgewählten aktiven Prozesses aus. Gibt es keinen aktiven
Prozess, wird das Programm aus dem Editor geladen. **Start** setzt die
Ausführung fort. Der CPU-Monitor zeigt Register, Vorzeichen, Überlauf und
Programmadresse. Wähle **Kernel** im Speicherbereich, um den residenten
Supervisor an Adresse −256 zu sehen. Nach `SYS` springt die CPU dorthin;
`IRET` bringt sie zurück zum Benutzerprogramm.

Im Editor kannst du eigene Programme schreiben, **Ausführen** und unter einem
eigenen Namen **Speichern**. Dateien werden im lokalen Browserspeicher für
dieselbe Browseradresse gespeichert; sie bleiben nach einem Neuladen erhalten.
Ist der Browserspeicher gesperrt oder voll, meldet die Konsole, dass Dateien nur
für diese Sitzung verfügbar sind. `Neu starten` setzt Prozesse und Speicher
zurück, behält aber das simulierte Programmlaufwerk.

## Dein erstes Programm

```asm
LI a, 8       ; 8 ins Register a laden
ADD a, #5     ; 5 addieren
SYS 1         ; Zahl in a ausgeben
SYS 0         ; Prozess beenden
```

## Die virtuelle Maschine

| Eigenschaft | Ausführung |
| --- | --- |
| Ziffern | −1, 0, +1 (Trits) |
| Wortbreite | 6 Trits; Werte −364 bis +364 |
| Register | a, b, c, s |
| Speicher | 729 Wörter, Adressen −364 bis +364 |
| Supervisor | −364 bis −1; Boot ab −364, Systemaufrufe ab −256 |
| Benutzerprogramm | 0 bis 299; eigener Speicher pro Prozess |
| Instruktion | 3 ternäre Wörter: Opcode, Registerfeld, Operand |
| Arithmetik | Addition mit ternärem Carry; Multiplikation auf Trits |
| Überlauf | Modulo 729; separates Flag im Monitor |
| Scheduling | Round Robin, 48 Instruktionen je Zeitscheibe, maximal 8 aktive Prozesse |
| Begrenzung | 50.000 Instruktionen pro Prozess; maximal 32 Prozesse in der Historie |

Der Kernel ist ein **echtes assembliertes Gastprogramm**: Er läuft auf der
virtuellen CPU und bearbeitet Systemaufrufe. Der Emulator stellt Geräte,
Speicherschutz, Prozesswechsel und die Bedienkonsole bereit. Die physische
Apple-CPU bleibt binär. Dieses Lernsystem läuft innerhalb von macOS und ist
kein direkt auf dem M4 bootfähiges OS; es enthält keine Hardwaretreiber,
POSIX-Umgebung oder vollständige Dateisystemimplementierung.

## Befehlssatz

| Befehl | Bedeutung / Beispiel |
| --- | --- |
| `LI a, -8` | Konstante laden |
| `MOV a, b` | Register kopieren |
| `LD a, [299]` / `ST a, [299]` | Speicher lesen / schreiben; auch `[b]` möglich |
| `ADD a, #5` / `SUB a, b` / `MUL a, #3` | Rechnen mit Zahl oder Register |
| `CMP a, #0` | Vorzeichenflag für Vergleich setzen |
| `JMP label` | Springen |
| `JN label` / `JZ label` / `JP label` | Springen bei negativ / null / positiv |
| `SYS 0` | Prozess beenden |
| `SYS 1` | Dezimalwert in Register a ausgeben |
| `SYS 2` | ASCII-Zeichen (0…127) in Register a ausgeben |
| `SYS 3` | Rechenzeit freiwillig abgeben |
| `NOP` | Keine Operation |
| `.WORD 12` | Ein Datenwort einfügen |

`OUT`, `OUTC`, `IRET`, `YIELD`, `HALT` und `TRAP` sind nur im Kernel erlaubt.
Der Kernel bewahrt die Benutzerregister und Flags während eines Systemaufrufs.
Labels enden mit `:`. Kommentare beginnen mit `;`. Programme müssen an Adresse
0 mit einer Instruktion beginnen und in 300 Wörter passen (maximal 100 Befehle,
wenn keine Datenwörter verwendet werden). Springen ist nur zu Instruktionsanfängen
erlaubt. Direkter Zugriff auf den Supervisor beendet den betreffenden Prozess
mit einer Fehlermeldung.

## Prüfen und erweitern

```sh
npm test
```

Die Tests prüfen Tritarithmetik, Carry, Überlauf, Assembler, Kernel-Eintritt und
Rückkehr, Speicherisolation, privilegierte Befehle, Scheduling, Endlosschleifen,
Konsole, gespeicherte Programme und den lokalen Server.

- `src/ternary.mjs`: Tritarithmetik.
- `src/isa.mjs`, `src/assembler.mjs`, `src/cpu.mjs`: Gastmaschine.
- `src/kernel.mjs`: Bootcode und residenter Systemaufrufhandler.
- `src/system.mjs`: Prozesse, Scheduler, Beispielprogramme.
- `src/shell.mjs`: Bedienkonsole und simuliertes Programmlaufwerk.
- `app.mjs`, `index.html`, `styles.css`: Oberfläche.
- `server.mjs`: lokaler, nur an 127.0.0.1 gebundener Server.
