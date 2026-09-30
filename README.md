# Time Talker

A clock that speaks the time on the hour and at half past. It uses the Mac `say` command, so announcements keep going after you close the browser tab. They stop when you quit the terminal.

## Run

Requires Node.js on macOS.

```bash
npm start
```

That starts the app at [http://127.0.0.1:4173](http://127.0.0.1:4173) and opens it in your browser. Stop it with Ctrl+C.

If port 4173 is already in use:

```bash
PORT=4174 npm start
```

## What it says

The time is read exactly, with the part of the day when that option is on.

| Time   | Spoken                                      |
| ------ | ------------------------------------------- |
| 11:30  | It's eleven thirty in the morning.          |
| 12:00  | It's twelve o'clock in the afternoon.       |
| 12:04  | It's twelve oh four in the afternoon.       |
| 9:00   | It's nine o'clock at night.                 |

## Controls

- **Half-hour chime** turns announcements on or off.
- **Voice** picks a macOS speaking voice.
- **Say the time of day** adds “in the morning,” “in the afternoon,” “in the evening,” or “at night.”
- **Say the time now** speaks the current minute immediately.

Your choices are saved in `data/settings.json`.
