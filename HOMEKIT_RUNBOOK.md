# HomeKit and Homebridge runbook

This is the SwitchBot-specific copy of the Homebridge/HomeKit runbook. The
central operational runbook lives one folder above this fork:

```text
/Users/filippominelle/Documents/Xcode/homebridge/homebridge.md
```

Use the central file as the first place to look during recovery. Keep this file
for SwitchBot-specific technical details: the Roller Shade fork patches, numeric
OpenAPI command format, and Aqara button behaviour.

Keep this file in git with the private Homebridge plugin forks. It is intended
for recovery and future maintenance, not for upstream publication.

## Documentation layout

Recommended layout:

```text
/Users/filippominelle/Documents/Xcode/homebridge/
  homebridge.md                              # central recovery and operations guide
  homebridge-switchbot-patched/
    README.md                                # upstream README plus fork notes
    HOMEKIT_RUNBOOK.md                       # SwitchBot-specific technical details
  homebridge-linak-patched/
    homebridge-linak/LINAK_RUNBOOK.md        # Linak-specific technical details
```

Decision rule:

- Keep one central runbook for the whole Homebridge/HomeKit system.
- Add a plugin-specific runbook only when a plugin is private, patched, fragile,
  or has a special recovery flow.
- For normal npm plugins, document the package name, version/source, config
  shape, exposed accessories, and troubleshooting in the central file only.
- For private forks, keep the central file as the operational checklist and the
  plugin folder as the technical explanation of the patch.

## Current working state

Date verified: 2026-08-22.

Host:

- Raspberry Pi 4.
- Homebridge Raspberry Pi image.
- Homebridge storage path: `/var/lib/homebridge`.
- Homebridge config path: `/var/lib/homebridge/config.json`.
- Homebridge Node runtime: `/opt/homebridge/bin/node`.
- Homebridge service: `homebridge`.
- Restart command: `sudo hb-service restart`.
- Homebridge UI: `http://homebridge.local:8581`.

Current Homebridge platforms from `config.json`:

- `config` / `Config`
- `SwitchBot` / `SwitchBot`
- `YaleSyncAlarm` / `Burglar Alarm`
- `LinakController` / `Linak Platform`
- `HomebridgeDummy` / `Homebridge Dummy`
- `DaikinCloud`

Current Homebridge package dependencies:

- `@switchbot/homebridge-switchbot`
- `homebridge-linak`
- `homebridge-ysa2`
- `homebridge-dummy`
- `@mp-consulting/homebridge-daikin-cloud`
- `homebridge-xiaomi-roborock-vacuum`
- `homebridge`

Current private/local package references:

- `@switchbot/homebridge-switchbot` is installed from
  `file:local-packages/switchbot-homebridge-switchbot-5.0.4-codex-momentary.tgz`.
- `homebridge-linak` is installed from `github:mpippo87/homebridge-linak`.

## Current SwitchBot setup

Working device:

- SwitchBot device name: `Roller Shade E3`.
- SwitchBot device id: `B0E9FEF6A7E3`.
- SwitchBot config type: `Roller Shade`.
- Current fork branch: `roller-shade-hold-position`.

HomeKit accessories created by the fork:

- `Roller Shade E3`: normal Window Covering accessory.
- `Blind Down`: momentary command switch.
- `Blind Up`: momentary command switch.

Expected behaviour:

- Press `Blind Down`: the shade moves toward closed.
- Press `Blind Up`: the shade moves toward open.
- Press either command again while the shade is considered moving: the plugin
  sends `pause`.
- Each command switch turns `On` briefly, then automatically returns to `Off`.

The Apple Home Aqara automations must use `Turn On`, not toggle and not `Off`.

## What was fixed in the SwitchBot fork

The current fork contains several operational fixes:

- HAP accessory restore/sync is matched by UUID and preserves
  `AccessoryInformation`.
- Roller Shade exposes `HoldPosition`.
- Roller Shade exposes separate command accessories for up/down.
- The command switches are momentary and visibly reset.
- Roller Shade commands prefer OpenAPI when available.
- `node-switchbot` device instances are hydrated with the API client when
  upstream discovery creates API-capable devices without wiring the API client.
- Roller Shade `setPosition` is sent as a numeric OpenAPI parameter (`0..100`),
  not as the Curtain string format (`0,ff,position`).

The numeric Roller Shade command is important. The old Curtain-style format could
return success from the SwitchBot API while not physically moving the shade.

Verified real command path:

- Before: `slidePosition: 51`.
- Plugin command target: `41`.
- After: `slidePosition: 41`.
- Result: `PLUGIN_COMMAND true`.

## From-scratch rebuild

### 1. Prepare Raspberry Pi access

SSH target:

```bash
ssh pi@homebridge.local
```

If working through a local tunnel from the Mac:

```bash
ssh -N -L 2222:127.0.0.1:22 pi@homebridge.local
```

Then connect through the tunnel:

```bash
ssh -p 2222 pi@127.0.0.1
```

Security cleanup on a fresh Pi:

```bash
passwd
```

If Wi-Fi is blocked by rfkill, set the Wi-Fi country in `raspi-config`.

### 2. Back up Homebridge before any change

Run on the Pi:

```bash
stamp=$(date +%Y%m%d-%H%M%S)
backup=/var/lib/homebridge/backups/codex-$stamp
mkdir -p "$backup"
cp /var/lib/homebridge/config.json "$backup/config.json"
cp /var/lib/homebridge/package.json "$backup/package.json" 2>/dev/null || true
cp /var/lib/homebridge/package-lock.json "$backup/package-lock.json" 2>/dev/null || true
echo "$backup"
```

Never update private fork plugins without a backup.

### 3. Build the SwitchBot private fork on the Mac

```bash
cd /Users/filippominelle/Documents/Xcode/homebridge/homebridge-switchbot-patched
git checkout roller-shade-hold-position
git pull
npm run build
npm test -- --run test/client/switchbotClient.spec.ts test/device/curtain-hold-position.spec.ts test/platform/accessory-restore.spec.ts
npm pack --pack-destination /tmp
```

Expected tarball:

```text
/tmp/switchbot-homebridge-switchbot-5.0.4.tgz
```

### 4. Copy the tarball to stable Homebridge storage

Use direct SSH or the tunnel. Tunnel example:

```bash
ssh -p 2222 pi@127.0.0.1 'mkdir -p /var/lib/homebridge/local-packages'

scp -P 2222 \
  /tmp/switchbot-homebridge-switchbot-5.0.4.tgz \
  pi@127.0.0.1:/var/lib/homebridge/local-packages/switchbot-homebridge-switchbot-5.0.4-codex-momentary.tgz
```

Do not leave the Homebridge dependency pointing to `/tmp`. `/tmp` can be cleaned
and will make future `npm install` runs unreliable.

### 5. Install the private SwitchBot package

Run on the Pi:

```bash
cd /var/lib/homebridge
npm install ./local-packages/switchbot-homebridge-switchbot-5.0.4-codex-momentary.tgz --save
sudo setcap cap_net_raw+eip /opt/homebridge/bin/node
sudo hb-service restart
sleep 18
systemctl is-active homebridge
sudo /usr/sbin/getcap /opt/homebridge/bin/node
```

Expected:

```text
active
/opt/homebridge/bin/node cap_net_raw=eip
```

Check package reference:

```bash
node -e 'const p=require("/var/lib/homebridge/package.json"); console.log(p.dependencies["@switchbot/homebridge-switchbot"]);'
```

Expected:

```text
file:local-packages/switchbot-homebridge-switchbot-5.0.4-codex-momentary.tgz
```

### 6. Confirm the fork was not overwritten

Run on the Pi:

```bash
cd /var/lib/homebridge/node_modules/@switchbot/homebridge-switchbot
npm pkg get version
grep -n "hydrateDeviceConnections\|getOpenApiToken\|setPreferredConnection('api')" dist/switchbotClient.js
grep -n "sendRollerShadeAPICommand\|clampRollerShadePosition" dist/deviceCommandMapper.js
grep -n "commandMoveOrPause\|autoResetAfterMs\|Blind Up\|Blind Down\|Command result" dist/devices/genericDevice.js
grep -n "autoResetAfterMs" dist/SwitchBotHAPPlatform.js
```

If these symbols are missing, the fork has likely been overwritten by an upstream
or npm install.

## SwitchBot config

The SwitchBot platform needs OpenAPI credentials and the Roller Shade device in
`/var/lib/homebridge/config.json`.

The current device entry is:

```json
{
  "deviceId": "B0E9FEF6A7E3",
  "configDeviceName": "Roller Shade E3",
  "configDeviceType": "Roller Shade"
}
```

Credentials may exist in either shape depending on plugin UI migrations:

```json
{
  "credentials": {
    "token": "...",
    "secret": "..."
  },
  "openApiToken": "...",
  "openApiSecret": "..."
}
```

Do not paste token/secret into issues, chats, docs, or logs.

## Apple Home setup

### Pairing Homebridge

Pair the Homebridge bridge into Apple Home using the Homebridge UI pairing code.
After the bridge is paired, Homebridge accessories should appear in Apple Home.

If stale duplicates appear in Apple Home, check the Homebridge cached accessories
before deleting the whole Homebridge bridge from Apple Home.

### Roller Shade accessories

Expected HomeKit accessories:

- `Roller Shade E3`
- `Blind Down`
- `Blind Up`

Manual Apple Home test:

1. Tap `Blind Down`.
2. It should briefly show `On`, then return to `Off`.
3. The shade should move toward closed.
4. Tap `Blind Down` again while moving.
5. The shade should stop.
6. Repeat with `Blind Up`.

If this manual test works, the plugin and Apple Home bridge are working.

## Aqara button automation

The working setup uses Aqara buttons as triggers inside Apple Home.

For `Button 1`:

1. Open Apple Home.
2. Open `Button 1` accessory details.
3. Tap `Single Press`.
4. Select `Blind Down`.
5. Open the selected action detail.
6. Make sure the action is `Turn On`.
7. Save with `Done`.

For `Button 2`:

1. Open Apple Home.
2. Open `Button 2` accessory details.
3. Tap `Single Press`.
4. Select `Blind Up`.
5. Open the selected action detail.
6. Make sure the action is `Turn On`.
7. Save with `Done`.

Important: merely seeing `Single Press -> Blind Down` or
`Single Press -> Blind Up` is not enough. The selected action can still be `Off`.
If Apple Home sends `Off`, the plugin intentionally ignores it.

Also important: tapping the Aqara button tile in Apple Home may not simulate a
physical button press. Test with the physical Aqara button.

## Adding a second identical SwitchBot Roller Shade

Do not add the second shade blindly. Plan the names first.

The current code creates generic command accessory names:

- `Blind Down`
- `Blind Up`

With two Roller Shades, HomeKit may show duplicate command names. The accessory
UUIDs will be distinct because they include the SwitchBot device id, but the
display names can still be confusing.

Recommended process:

1. Add and calibrate the new Roller Shade in the SwitchBot app.
2. Enable Cloud Service for the new shade in the SwitchBot app.
3. Confirm it is reachable in the SwitchBot app.
4. Get the new `deviceId`.
5. Decide naming before adding to Homebridge. Example:
   - `Desk Roller Shade`
   - `Window Roller Shade`
   - `Desk Blind Up`
   - `Desk Blind Down`
   - `Window Blind Up`
   - `Window Blind Down`
6. Add the new device to the SwitchBot platform `devices` array.
7. Restart Homebridge.
8. Verify Homebridge logs show the new Roller Shade and command accessories.
9. Verify Homebridge manual control before creating Apple Home automations.
10. Create separate Aqara or HomeKit automations that target the correct command
    accessories.

Possible future code improvement before adding the second shade:

- Change command accessory names from fixed `Blind Up` / `Blind Down` to include
  the device name, for example `${deviceName} Up` and `${deviceName} Down`.
- Make the command accessory names configurable per device.

Do not make that naming change casually after Apple Home automations already
exist, because HomeKit may preserve or confuse renamed accessories.

## Updating the SwitchBot fork later

Use this sequence:

1. Back up `/var/lib/homebridge`.
2. Pull latest fork branch on the Mac.
3. Merge/rebase upstream if needed.
4. Re-check these files carefully:
   - `src/switchbotClient.ts`
   - `src/switchbotClient.js`
   - `src/deviceCommandMapper.ts`
   - `src/deviceCommandMapper.js`
   - `src/devices/genericDevice.ts`
   - `src/SwitchBotHAPPlatform.ts`
   - `dist/switchbotClient.js`
   - `dist/deviceCommandMapper.js`
   - `dist/devices/genericDevice.js`
   - `dist/SwitchBotHAPPlatform.js`
5. Run build and focused tests.
6. Pack to `/tmp`.
7. Copy tarball to `/var/lib/homebridge/local-packages`.
8. Install from `./local-packages/...tgz`.
9. Reapply `setcap`.
10. Restart Homebridge.
11. Test from Homebridge UI.
12. Test from Apple Home.
13. Test from physical Aqara buttons.

## Updating Homebridge plugins safely

Before updating any plugin from Homebridge UI:

1. Check whether it is a private fork.
2. Check `/var/lib/homebridge/package.json`.
3. Back up config and package files.
4. Update one plugin at a time.
5. Restart Homebridge.
6. Test the related accessories.

Do not update `@switchbot/homebridge-switchbot` from the public npm package
unless you are intentionally replacing this fork.

Known fork-sensitive plugins:

- `@switchbot/homebridge-switchbot`
- `homebridge-linak`

The Linak setup has its own runbook at
`homebridge-linak-patched/homebridge-linak/LINAK_RUNBOOK.md`. The current fork
fixes the desk resynchronisation issue by bounding `idasen-controller` calls with
timeouts and resetting HomeKit movement/polling state after errors or timeouts.

## Troubleshooting

### Homebridge service

```bash
systemctl is-active homebridge
sudo journalctl -u homebridge -n 200 --no-pager
```

### SwitchBot filtered logs

```bash
sudo journalctl -u homebridge -n 300 --no-pager \
  | grep -iE "SwitchBot|Roller Shade|Blind Up|Blind Down|Command result|noble|bluetooth|error|warn"
```

Expected command logs:

```text
[Blind Down] Command requested
[Blind Down] Command result: true
```

or:

```text
[Blind Up] Command requested
[Blind Up] Command result: true
```

### Manual command path test

Use this only when diagnosing. It can move the shade.

```bash
cd /var/lib/homebridge/node_modules/@switchbot/homebridge-switchbot
/opt/homebridge/bin/node --input-type=module - <<'NODE'
import fs from "node:fs";
import { OpenAPIClient } from "node-switchbot";
import { SwitchBotClient } from "./dist/switchbotClient.js";

const cfg = JSON.parse(fs.readFileSync("/var/lib/homebridge/config.json", "utf8"));
const p = (cfg.platforms || []).find(x => String(x.platform || "").toLowerCase().includes("switchbot"));
const token = p.openApiToken || p.credentials?.token;
const secret = p.openApiSecret || p.credentials?.secret;
const deviceId = "B0E9FEF6A7E3";
const api = new OpenAPIClient(token, secret);
const before = await api.getStatus(deviceId);
const current = Number(before.slidePosition);
const target = current >= 50 ? Math.max(0, current - 10) : Math.min(100, current + 10);
console.log("BEFORE", JSON.stringify({ slidePosition: before.slidePosition, moving: before.moving, target }));

const log = {
  info: (...a) => console.log("INFO", ...a),
  warn: (...a) => console.log("WARN", ...a),
  error: (...a) => console.log("ERROR", ...a),
  debug: (...a) => console.log("DEBUG", ...a)
};

const client = new SwitchBotClient({ ...p, logger: log, enableBLE: false, writeDebounceMs: 0, discoveryCacheTtlMs: 0 });
await client.init();
const result = await client.setDeviceState(deviceId, { command: "setPosition", parameter: String(target), commandType: "command" });
console.log("PLUGIN_COMMAND", JSON.stringify(result));
await new Promise(resolve => setTimeout(resolve, 12000));
const after = await api.getStatus(deviceId);
console.log("AFTER", JSON.stringify({ slidePosition: after.slidePosition, moving: after.moving, target }));
await client.destroy();
NODE
```

### If Homebridge works but Apple Home does not

1. Test `Blind Up` / `Blind Down` manually in Homebridge UI.
2. Test them manually in Apple Home.
3. Watch logs while tapping in Apple Home.
4. If logs show `Command requested`, Apple Home is reaching Homebridge.
5. If logs show nothing, Apple Home is not sending the action or has stale
   accessory state.

### If Apple Home works but Aqara buttons do not

1. Watch Homebridge logs live.
2. Press the physical Aqara button.
3. If no `Command requested` log appears, the Aqara automation did not fire.
4. Open the Aqara button automation in Apple Home.
5. Confirm `Single Press` targets `Blind Up` or `Blind Down`.
6. Open the target action detail and confirm it is `Turn On`.
7. Save and test with the physical button.

### If command result is true but shade does not move

Check that the numeric Roller Shade command patch is installed:

```bash
cd /var/lib/homebridge/node_modules/@switchbot/homebridge-switchbot
grep -n "sendRollerShadeAPICommand\|clampRollerShadePosition" dist/deviceCommandMapper.js
```

If missing, reinstall the private tarball.

### BLE warnings

Known warnings:

```text
noble: unknown peripheral null connected!
noble warning: unknown handle 64 disconnected!
BLE adapter not ready
```

For Roller Shade control this fork prefers OpenAPI, so BLE noise should not block
movement. Still keep the Node capability applied:

```bash
sudo setcap cap_net_raw+eip /opt/homebridge/bin/node
sudo /usr/sbin/getcap /opt/homebridge/bin/node
```

### Cached accessories

Check cached SwitchBot accessories:

```bash
/opt/homebridge/bin/node -e '
const fs = require("fs");
const arr = JSON.parse(fs.readFileSync("/var/lib/homebridge/accessories/cachedAccessories", "utf8"));
console.log(JSON.stringify(arr.filter(x =>
  x?.context?.deviceId === "B0E9FEF6A7E3" ||
  x?.context?.parentDeviceId === "B0E9FEF6A7E3"
).map(a => ({
  displayName: a.displayName,
  context: a.context,
  services: (a.services || []).map(s => ({
    displayName: s.displayName,
    UUID: s.UUID
  }))
})), null, 2));
'
```

Do not delete Homebridge from Apple Home until cache and logs show the plugin is
really wrong. Apple Home can show stale duplicates even when Homebridge cache is
clean.

## Rollback

To roll back after a bad plugin install:

1. Stop Homebridge:

```bash
sudo systemctl stop homebridge
```

2. Restore backed up files:

```bash
backup=/var/lib/homebridge/backups/codex-YYYYMMDD-HHMMSS
cp "$backup/config.json" /var/lib/homebridge/config.json
cp "$backup/package.json" /var/lib/homebridge/package.json
cp "$backup/package-lock.json" /var/lib/homebridge/package-lock.json 2>/dev/null || true
```

3. Reinstall dependencies:

```bash
cd /var/lib/homebridge
npm install
sudo setcap cap_net_raw+eip /opt/homebridge/bin/node
sudo systemctl start homebridge
sleep 18
systemctl is-active homebridge
```

4. Check logs.

## Documentation maintenance

When a new plugin is added or fixed, update this file with:

- plugin name;
- package source;
- config shape, with secrets omitted;
- devices exposed to HomeKit;
- Apple Home automations;
- known failure modes;
- rollback steps;
- relevant fork commit hashes.
