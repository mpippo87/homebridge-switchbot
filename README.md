<span align="center">

<a href="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><img alt="homebridge-verified" src="https://raw.githubusercontent.com/OpenWonderLabs/homebridge-switchbot/latest/branding/Homebridge_x_SwitchBot.svg?sanitize=true" width="350px"></a>

# @switchbot/homebridge-switchbot

[![npm version](https://badgen.net/npm/v/@switchbot/homebridge-switchbot)](https://www.npmjs.com/package/@switchbot/homebridge-switchbot)
[![npm downloads](https://badgen.net/npm/dt/@switchbot/homebridge-switchbot)](https://www.npmjs.com/package/@switchbot/homebridge-switchbot)
[![discord-switchbot](https://badgen.net/discord/online-members/5wYTbwP4ha?icon=discord&label=discord)](https://discord.gg/5wYTbwP4ha)

<p>The Homebridge <a href="https://www.switch-bot.com">SwitchBot</a> plugin allows you to access your SwitchBot Device(s) from HomeKit with
  <a href="https://homebridge.io">Homebridge</a>.
</p>

</span>

## Private fork maintenance notes

This repository is a private operational fork used for a Homebridge Raspberry Pi
installation. Keep these notes near the top of the README so future upstream
updates do not accidentally erase the local behaviour that makes the current
HomeKit setup work.

Current target installation:

- Host: Raspberry Pi 4 running the Homebridge Raspberry Pi image.
- Homebridge storage path: `/var/lib/homebridge`.
- Homebridge config path: `/var/lib/homebridge/config.json`.
- Homebridge Node runtime: `/opt/homebridge/bin/node`.
- Service: `homebridge`; `sudo hb-service restart` is available and works.
- SwitchBot device under active maintenance: `Roller Shade E3`.
- SwitchBot device id: `B0E9FEF6A7E3`.
- SwitchBot device type in config: `Roller Shade`.
- Fork branch used on the Pi: `roller-shade-hold-position`.
- Installed package version on the Pi after the local fixes: `@switchbot/homebridge-switchbot@5.0.4-patched.1`.

Important: this fork is intentionally installed from a packed tarball, not from
the public npm package. Installing or updating `@switchbot/homebridge-switchbot`
from the Homebridge UI or npm registry can overwrite these local patches.

For the full Homebridge/HomeKit recovery and update procedure, including Aqara
button automations and adding a second Roller Shade, see
[`HOMEKIT_RUNBOOK.md`](HOMEKIT_RUNBOOK.md).

### Local patch summary

The local commits that matter for the Roller Shade flow are:

- `2543af9 Fix HAP accessory sync by UUID`
  - Fixes HAP accessory restore/sync so stale Homebridge cached accessories do
    not lose required services such as `AccessoryInformation`.
  - This addressed the earlier `HAP API not available to register accessories`
    and bad accessory-cache behaviour seen with the 5.x stack.

- `cc714bc Add momentary blind direction controls`
  - Adds command controls for blind up/down behaviour.
  - A press starts movement; pressing again while movement is considered active
    sends `pause`.

- `cb5209d Rename blind command switches`
  - Renames the command switches to clear HomeKit names: `Blind Up` and
    `Blind Down`.

- `72c173f Expose blind commands as accessories`
  - Exposes `Blind Up` and `Blind Down` as separate Homebridge accessories
    instead of extra services inside the Roller Shade accessory.
  - This makes Apple Home automation easier because Aqara buttons can target
    distinct command accessories.

- `9923078 Prefer API commands for roller shade`
  - Normalises OpenAPI credentials from both `openApiToken/openApiSecret` and
    `credentials.token/credentials.secret`.
  - Hydrates `node-switchbot` device instances with the API client when upstream
    discovery creates API-capable devices without wiring the API client into the
    device instance.
  - Forces `Roller Shade` command routing to prefer OpenAPI when available.
  - This is important because BLE on the Pi has been unreliable for this device,
    while OpenAPI status and `pause` commands returned success.
  - Adds command-result logging for `Blind Up` and `Blind Down`, so the Homebridge
    log clearly shows whether the plugin command returned `true`, `false`, or an
    object result.

- `a7cad25 Send roller shade positions as numeric API commands`
  - Routes Roller Shade `open`, `close`, and `setPosition` through direct
    OpenAPI calls when the device has API support.
  - Uses numeric `setPosition` parameters (`0` open, `100` closed) for Roller
    Shade instead of the Curtain parameter string format (`0,ff,position`).
  - Keeps a fallback to the upstream device methods for BLE-only cases.

- `ec974ae Make blind command switches momentary`
  - `Blind Up` and `Blind Down` now expose a short visible `On` state before
    automatically returning to `Off`.
  - The momentary `On` window is intentionally short, currently about 1.2s.
  - This gives Homebridge and Apple Home a real `off -> on -> off` transition
    instead of a switch that always reads as `Off`.
  - Command switches now send movement commands immediately without first waiting
    for a position refresh. This makes button presses feel more responsive and
    avoids stale position reads preventing a command.

- `5.0.4-patched.1`: configurable Roller Shade exposure
  - Adds a third momentary switch accessory named `Blind Stop`.
  - `Blind Stop` sends only the Roller Shade `pause` command.
  - This is intended for a hybrid Apple Home setup where Matter/Apple Home can
    handle normal up/down movement and Homebridge provides the missing explicit
    stop action.
  - Adds per-device exposure flags:
    `exposeWindowCovering`, `exposeBlindUp`, `exposeBlindDown`,
    `exposeBlindStop`, and `exposeMatter`.
  - The current target setup disables the Homebridge shade, up/down command
    switches, and SwitchBot Matter publication, leaving only `Blind Stop`.

### Why the Roller Shade patch exists

During debugging, the plugin command path was proven to reach `node-switchbot`,
but `device.setPosition(...)` returned `false`. Direct SwitchBot OpenAPI tests
from the Pi succeeded:

- `getStatus` returned the Roller Shade status, including battery, calibration,
  `slidePosition`, `moving`, and `hubDeviceId`.
- `pause` returned `statusCode: 100` and `message: "success"`.

The relevant failure was in the device object returned by `node-switchbot`:

- API-only discovery found the Roller Shade.
- The discovered device had `connectionTypes: ["api"]`.
- Before the patch, `device.hasAPI()` still returned `false` because the API
  client was not attached to the device instance.
- As a result, plugin commands could fall back into BLE failure instead of using
  the working cloud command path.

The fork now hydrates discovered and managed device instances before command
dispatch and sets Roller Shade devices to prefer `api` when an API client is
available.

A second Roller Shade issue was found after the UI was cleaned up: command logs
showed `Command result: true`, but the shade did not move. The SwitchBot OpenAPI
documentation for `Roller Shade` defines `setPosition` as a direct `0~100`
numeric parameter. The upstream `node-switchbot` Roller Shade class inherits
Curtain command formatting and sends `0,ff,position`, which the API can accept
without physically moving the Roller Shade. This fork bypasses that inherited
format for Roller Shade API commands.

Verified on the target Pi:

- Before: `slidePosition: 51`.
- Plugin command: `setPosition` with target `41`.
- After: `slidePosition: 41`.
- Result: `PLUGIN_COMMAND true`.

The same session also verified that OpenAPI `pause` can stop the moving Roller
Shade, even though the public Roller Shade command table only documents
`setPosition`.

### Expected HomeKit behaviour

The default behaviour still exposes the Roller Shade as the normal HomeKit
window covering accessory and creates three extra momentary switch accessories:

- `Blind Up`
- `Blind Down`
- `Blind Stop`

The expected user flow is:

- Press `Blind Up`: move the Roller Shade toward open.
- Press `Blind Up` again while movement is active: send `pause`.
- Press `Blind Down`: move the Roller Shade toward closed.
- Press `Blind Down` again while movement is active: send `pause`.
- Press `Blind Stop`: send `pause` directly, without starting movement.

These switches are intended to be targets for separate Aqara button automations
in Apple Home. For example:

- Aqara button 1 single press -> turn on `Blind Down`.
- Aqara button 2 single press -> turn on `Blind Up`.

For the hybrid Matter/Homebridge flow to test next:

- use the direct Apple Home/Matter shade accessory for normal open/close or
  position movement;
- use `Blind Stop` as the explicit Homebridge stop action when Apple Home reports
  the shade is already moving.
- set the SwitchBot device config to expose only the stop command from
  Homebridge:

```json
{
  "exposeWindowCovering": false,
  "exposeBlindUp": false,
  "exposeBlindDown": false,
  "exposeBlindStop": true,
  "exposeMatter": false
}
```

The platform-level SwitchBot config should also use HAP mode for this setup:

```json
{
  "preferMatter": false,
  "enableMatter": false
}
```

The switches are momentary from the plugin side: their `On` getter returns
`true` only during a short command window, then returns `false`. HomeKit should
not treat them as durable on/off state.

If a command switch is pressed while a movement command is still considered
active, the plugin sends `pause`. This applies to either direction switch; press
again after the switch auto-resets if the intended next action is to reverse
direction.

Apple Home/Aqara automation gotcha: the action inside `Single Press` must be
`Turn On` for the target command switch. The row can show
`Single Press -> Blind Down` while the detail action is still effectively `Off`;
in that case the plugin ignores the write and no command is logged.

If Apple Home shows duplicate `Blind Up`, `Blind Down`, `Blind Stop`, or `Roller Shade E3`
tiles, first check Homebridge's cached accessories before removing bridges from
Apple Home. During the original debugging, Homebridge cache had one command
accessory of each type, while Apple Home still showed stale duplicated services.
That points to Apple Home cache residue, not necessarily plugin duplication.

### Raspberry Pi install workflow

From the Mac, build and pack this fork:

```bash
cd /Users/filippominelle/Documents/Xcode/homebridge/homebridge-switchbot-patched
npm run build
npm test -- --run test/client/switchbotClient.spec.ts test/device/curtain-hold-position.spec.ts test/platform/accessory-restore.spec.ts
npm pack --pack-destination /tmp
```

Copy the tarball through the SSH tunnel or directly to the Pi. In the original
Work session the tunnel was:

```bash
ssh -N -L 2222:127.0.0.1:22 pi@homebridge.local
```

Copy and install through that tunnel:

```bash
scp -P 2222 \
  /tmp/switchbot-homebridge-switchbot-5.0.4-patched.1.tgz \
  pi@127.0.0.1:/var/lib/homebridge/local-packages/switchbot-homebridge-switchbot-5.0.4-patched.1.tgz

ssh -p 2222 pi@127.0.0.1
```

On the Pi, always make a backup before installing:

```bash
stamp=$(date +%Y%m%d-%H%M%S)
backup=/var/lib/homebridge/backups/codex-$stamp
mkdir -p "$backup"
cp /var/lib/homebridge/config.json "$backup/config.json"
cp /var/lib/homebridge/package.json "$backup/package.json" 2>/dev/null || true
cp /var/lib/homebridge/package-lock.json "$backup/package-lock.json" 2>/dev/null || true
```

Then install the fork package:

```bash
cd /var/lib/homebridge
npm install ./local-packages/switchbot-homebridge-switchbot-5.0.4-patched.1.tgz --save
sudo setcap cap_net_raw+eip /opt/homebridge/bin/node
sudo hb-service restart
sleep 18
systemctl is-active homebridge
sudo /usr/sbin/getcap /opt/homebridge/bin/node
```

Expected final checks:

- `systemctl is-active homebridge` prints `active`.
- `npm pkg get version` from
  `/var/lib/homebridge/node_modules/@switchbot/homebridge-switchbot` prints
  `"5.0.4-patched.1"`.
- `/var/lib/homebridge/package.json` points to
  `file:local-packages/switchbot-homebridge-switchbot-5.0.4-patched.1.tgz`
  for `@switchbot/homebridge-switchbot`.
- `sudo /usr/sbin/getcap /opt/homebridge/bin/node` prints
  `/opt/homebridge/bin/node cap_net_raw=eip`.

### Checking whether an update overwrote the fork

Run this on the Pi:

```bash
cd /var/lib/homebridge/node_modules/@switchbot/homebridge-switchbot
npm pkg get version
grep -n "hydrateDeviceConnections\|getOpenApiToken\|setPreferredConnection('api')" dist/switchbotClient.js
grep -n "sendRollerShadeAPICommand\|clampRollerShadePosition" dist/deviceCommandMapper.js
grep -n "commandMoveOrPause\|autoResetAfterMs\|Blind Up\|Blind Down\|Blind Stop\|Command result" dist/devices/genericDevice.js
grep -n "autoResetAfterMs" dist/SwitchBotHAPPlatform.js
```

The fork is still installed if:

- version is `5.0.4-patched.1`;
- `hydrateDeviceConnections` exists in `dist/switchbotClient.js`;
- `getOpenApiToken` exists in `dist/switchbotClient.js`;
- `sendRollerShadeAPICommand` exists in `dist/deviceCommandMapper.js`;
- `clampRollerShadePosition` exists in `dist/deviceCommandMapper.js`;
- `commandMoveOrPause` and `autoResetAfterMs` exist in
  `dist/devices/genericDevice.js`;
- `autoResetAfterMs` exists in `dist/SwitchBotHAPPlatform.js`;
- `Blind Up`, `Blind Down`, `Blind Stop`, and `Command result` exist in
  `dist/devices/genericDevice.js`.

If those strings are missing, reinstall the tarball from this fork.

### Useful diagnostics

Check Homebridge service health:

```bash
systemctl is-active homebridge
sudo journalctl -u homebridge -n 200 --no-pager
```

Filter SwitchBot-related logs:

```bash
sudo journalctl -u homebridge -n 300 --no-pager \
  | grep -iE "SwitchBot|Roller Shade|Blind Up|Blind Down|Blind Stop|Command result|noble|bluetooth|error|warn"
```

Good command logs look like:

```text
[Blind Up] Command requested
[Blind Up] Command result: true
```

or:

```text
[Blind Down] Command requested
[Blind Down] Command result: true
```

or:

```text
[Blind Stop] Command requested
[Blind Stop] Command result: true
```

If the command result is `false`, test the OpenAPI path directly before changing
HomeKit automations. Use the real token/secret from `config.json`, but do not
paste them into issues or logs.

Check the Homebridge cached accessories for the Roller Shade and command
switches:

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

Expected accessory names in the current stop-only setup:

- `Blind Stop`

Expected accessory names when all Roller Shade HAP controls are enabled:

- `Roller Shade E3`
- `Blind Up`
- `Blind Down`
- `Blind Stop`

### BLE notes for Raspberry Pi

BLE has been unreliable in the observed setup. Symptoms included:

- `BLE adapter not ready`
- repeated `noble warning: unknown handle 64 disconnected!`
- direct Noble discovery/connection issues even when `bluetoothctl` could see
  the device

Keep the Linux capability on the Homebridge Node runtime anyway:

```bash
sudo setcap cap_net_raw+eip /opt/homebridge/bin/node
sudo /usr/sbin/getcap /opt/homebridge/bin/node
```

If BLE remains noisy but Roller Shade OpenAPI commands work, prefer fixing the
Roller Shade through OpenAPI as this fork does. Do not spend time removing the
Apple Home bridge until Homebridge logs prove the plugin is registering duplicate
accessories.

### Update and merge strategy

When pulling upstream changes:

1. Create a branch from the current fork branch.
2. Merge or rebase upstream.
3. Re-check these files carefully:
   - `src/switchbotClient.ts`
   - `src/switchbotClient.js`
   - `src/devices/genericDevice.ts`
   - `src/deviceCommandMapper.ts`
   - `src/SwitchBotHAPPlatform.ts`
   - `dist/switchbotClient.js`
   - `dist/devices/genericDevice.js`
4. Re-run the focused tests:

```bash
npm run build
npm test -- --run test/client/switchbotClient.spec.ts test/device/curtain-hold-position.spec.ts test/platform/accessory-restore.spec.ts
```

5. Pack, install on the Pi, reapply Node capability, and restart Homebridge.
6. Test through Homebridge first, then Apple Home.

Do not assume a green install from the Homebridge UI means the fork behaviour is
still present. Always grep for the fork-specific strings listed above.

## Installation

1. Search for "SwitchBot" on the plugin screen of [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)
2. Find: `@switchbot/homebridge-switchbot`
   - See noble [prerequisites](https://github.com/abandonware/noble#prerequisites) for your OS. (This is used for BLE connection.)
3. Click **Install**


## Configuration

### OpenAPI Polling/Rate Advanced Settings (UI)

You can now configure global OpenAPI polling and rate-limiting options directly from the Homebridge UI:

- Go to the SwitchBot plugin settings in Homebridge Config UI X.
- Scroll to the **Advanced Settings** section at the bottom of the page.
- Adjust the following options as needed:
  - **OpenAPI Polling Interval (seconds):** How often to poll devices via OpenAPI for status. Default: 300 (5 min). Min: 30. Can be overridden per device.
  - **Enable Batched OpenAPI Polling:** Poll all OpenAPI devices in a single batch at the configured interval. Devices with per-device refreshRate are excluded from the batch.
  - **OpenAPI Batch Polling Interval (seconds):** Interval for batched OpenAPI polling. Falls back to OpenAPI Polling Interval if not set. Default: 300.
  - **OpenAPI Daily Request Limit:** Maximum OpenAPI requests per day allowed by the plugin. Default: 10000.
  - **OpenAPI Reserve for Commands:** Requests reserved for user actions. When remaining budget reaches this value, background polling pauses. Default: 1000.
  - **Reset OpenAPI Counter at Local Midnight:** If true, resets the daily OpenAPI request counter at local midnight. If false, resets at UTC midnight.
  - **Only Allow Webhooks on Reserve:** When remaining OpenAPI budget reaches the reserve, only webhooks and user commands are allowed. Background polling/discovery pauses.
  - **OpenAPI Batch Concurrency:** Maximum number of parallel OpenAPI status calls during a batch. Default: 5.
  - **OpenAPI Batch Jitter (seconds):** Random startup delay before the first batch to reduce synchronized spikes. Default: 0.

Click **Save Advanced Settings** to apply changes. These settings match the options available in `config.schema.json` and can be overridden per device.

<!-- Optionally add a screenshot here -->


- ### If using OpenAPI Connection
  1. Download SwitchBot App on App Store or Google Play Store
  2. Register a SwitchBot account and log in into your account
  3. Generate an Token within the App
     - Click Bottom Profile Tab
     - Click Preference
     - Click App version 10 Times, this will enable Developer Options
     - Click Developer Options
     - Click Copy `token` to Clipboard
  4. Input your `token` into the config parameter
  5. Generate an Secret within the App
     - Click Bottom Profile Tab
     - Click Preference
     - Click App version 10 Times, this will enable Developer Options
     - Click Developer Options
     - Click Copy `secret` to Clipboard
  6. Input your `secret` into the config parameter
- ### If using BLE Connection
  1. Download SwitchBot App on App Store or Google Play Store
  2. Register a SwitchBot account and log in into your account
  3. Click on Device wanting to connect too plugin
     - Click the Settings Gear
     - Click Device Info
     - Copy BLE Mac aka `deviceId`
  4. Input your `deviceId` into the Device Config

## Troubleshooting

- ### If using Linux / Raspberry Pi OS
  1. `bluetoothctl` must be installed on the device, otherwise it cannot communicate via Bluetooth. Enable it with `sudo bluetoothctl power on`.

  2. If errors occur, while enabling it, restart the process:
     - `rfkill block bluetooth`
     - `rfkill unblock bluetooth`

  3. Also make sure, that the computer can discover the SwitchBot device:
     - `sudo bluetoothctl`
     - `scan on`

     This lists all discovered Bluetooth devices. The BLE address of the SwitchBot device should be included in this list, otherwise your computer does not discover it.

- ### If using MacOS
  1. Manually grant Bluetooth access in System Settings UI for `Security & Privacy -> Privacy` to the node executable, eg `/usr/local/bin/node`
     ![Security & Privacy -> Privacy](assets/security-privacy-bluetooth.png)
     (This is what is intended in documentation for the noble bluetooth package [prerequisites](https://github.com/abandonware/noble#prerequisites) by "Add terminal app", however for HomeBridge it is `node` that needs the permission granted, not `terminal`.
     Without this step, then you will receive the following error when the swichbot plugin launches, which will cause Homebridge or the child bridge process to restart:
  ```
  Error: Failed to initialize the Noble object: unauthorized
    at Noble.<anonymous> (file:///usr/local/lib/node_modules/@switchbot/homebridge-switchbot/node_modules/node-switchbot/src/switchbot.ts:244:19)
    at Object.onceWrapper (node:events:629:26)
    at Noble.emit (node:events:514:28)
    at Noble.onStateChange (/usr/local/lib/node_modules/@switchbot/homebridge-switchbot/node_modules/@stoprocent/noble/lib/noble.js:92:8)
    at NobleMac.emit (node:events:514:28)
  ```

## Supported SwitchBot Devices

- [SwitchBot Humidifier](https://www.switch-bot.com/products/switchbot-smart-humidifier)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
    - Can Push Updates over OpenAPI
    - Can Receive Updates over BLE and OpenAPI
- [SwitchBot Evaporative Humidifier (Auto-refill)](https://www.switch-bot.com/products/switchbot-evaporative-humidifier-auto-refill)
- [SwitchBot Meter](https://www.switch-bot.com/products/switchbot-meter)
- [SwitchBot Meter Plus (US)](https://www.switch-bot.com/products/switchbot-meter-plus)
- [SwitchBot Meter Plus (JP)](https://www.switchbot.jp/products/switchbot-meter-plus)
- [SwitchBot Indoor/Outdoor Thermo-Hygrometer](https://www.switch-bot.com/products/switchbot-indoor-outdoor-thermo-hygrometer)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
  - If using Bluetooth Low Energy (BLE) only:
    - Must supply `deviceId` & `deviceName` to Device Config
    - Check `Enable Bluetooth Low Energy (BLE) Connection` on Device Config
- [SwitchBot Motion Sensor](https://www.switch-bot.com/products/motion-sensor)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
  - If using Bluetooth Low Energy (BLE) only:
    - Must supply `deviceId` & `deviceName` to Device Config
    - Check `Enable Bluetooth Low Energy (BLE) Connection` on Device Config
- [SwitchBot Contact Sensor](https://www.switch-bot.com/products/contact-sensor)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
  - If using Bluetooth Low Energy (BLE) only:
    - Must supply `deviceId` & `deviceName` to Device Config
    - Check `Enable Bluetooth Low Energy (BLE) Connection` on Device Config
- [SwitchBot Curtain](https://www.switch-bot.com/products/switchbot-curtain)
- [SwitchBot Curtain 3](https://www.switch-bot.com/products/switchbot-curtain-3)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
  - If using Bluetooth Low Energy (BLE) only:
    - Must supply `deviceId` & `deviceName` to Device Config
    - Check `Enable Bluetooth Low Energy (BLE) Connection` on Device Config
- [SwitchBot Blind Tilt](https://us.switch-bot.com/products/switchbot-blind-tilt)
  - Supports OpenAPI & partial Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
- [SwitchBot Bulb](https://www.switch-bot.com/products/switchbot-color-bulb)
- [SwitchBot Ceiling Light](https://www.switchbot.jp/collections/all/products/switchbot-ceiling-light)
- [SwitchBot Ceiling Light Pro](https://www.switchbot.jp/collections/all/products/switchbot-ceiling-light)
- [SwitchBot Light Strip](https://www.switch-bot.com/products/switchbot-light-strip)
  - Supports OpenAPI & partial Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
- [SwitchBot Lock](https://us.switch-bot.com/products/switchbot-lock)
- [SwitchBot Lock Pro](https://www.switchbot.jp/products/switchbot-lock-pro)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
- US: [SwitchBot Mini Robot Vacuum K10+](https://www.switch-bot.com/products/switchbot-mini-robot-vacuum-k10)
- US: [SwitchBot Floor Cleaning Robot S10](https://www.switch-bot.com/products/switchbot-floor-cleaning-robot-s10)
- JP: [SwitchBot Robot Vacuum Cleaner S1](https://www.switchbot.jp/products/switchbot-robot-vacuum-cleaner)
- JP: [SwitchBot Robot Vacuum Cleaner S1 Plus](https://www.switchbot.jp/products/switchbot-robot-vacuum-cleaner)
  - Supports OpenAPI Connection Only
- [SwitchBot Plug](https://www.switch-bot.com/products/switchbot-plug)
- [SwitchBot Plug Mini (US)](https://www.switch-bot.com/products/switchbot-plug-mini)
- [SwitchBot Plug Mini (JP)](https://www.switchbot.jp/products/switchbot-plug-mini)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
- [SwitchBot Bot](https://www.switch-bot.com/products/switchbot-bot)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
  - If using OpenAPI:
    - [SwitchBot Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini), [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), or [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3) Required
    - Enable Cloud Services for Device on SwitchBot App
    - You must set your Bot's Device ID for either Press Mode or Switch Mode in Plugin Config (SwitchBot Device Settings > Bot Settings)
      - Press Mode - Turns on then instantly turn it off
      - Switch Mode - Turns on and keep it on until it is turned off
        - This can get out of sync, since API doesn't give me a status
        - To Correct you must go into the SwitchBot App and correct the status of either `On` or `Off`
  - If using Bluetooth Low Energy (BLE) only:
    - Must supply `deviceId` & `deviceName` to Device Config
    - Check `Enable Bluetooth Low Energy (BLE) Connection` on Device Config
- [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
    - Enables Humidity, Temperature, and Light Sensor
- [SwitchBot Hub Mini 2](https://us.switch-bot.com/products/switchbot-hub-mini-2)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
    - Enables Humidity, Temperature, and Light Sensor
- [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections
    - Enables Humidity, Temperature, and Light Sensor
- [SwitchBot Battery Circulator Fan](https://us.switch-bot.com/products/switchbot-battery-circulator-fan)
  - Supports OpenAPI Connection Only
- [SwitchBot Water Leak Detector](https://us.switch-bot.com/products/switchbot-water-leak-detector)
  - Supports OpenAPI & Bluetooth Low Energy (BLE) Connections


## BLE Encryption Support

### BLE Encryption Key and Key ID

Some SwitchBot devices (notably newer locks, curtains, and select sensors) require a BLE encryption key and keyId for secure Bluetooth communication. This plugin supports configuring these fields for each device.

#### How to Obtain BLE Encryption Key and Key ID

1. **Open the SwitchBot App** and select your device.
2. Go to **Device Settings** (gear icon).
3. Tap **Device Info**.
4. If your device supports BLE encryption, you will see fields for **Encryption Key** and **Key ID**. (If not visible, your device may not require encryption or may need a firmware update.)
5. Copy the **Encryption Key** and **Key ID** values.

#### How to Configure in Homebridge

In the Homebridge UI, when adding or editing a SwitchBot device, enter the **Encryption Key** and **Key ID** in the provided fields. These values will be securely used for BLE communication with your device.

**Example device config excerpt:**

```json
{
  "deviceId": "E7F8A1B2C3D4",
  "deviceName": "SwitchBot Lock",
  "enableBLE": true,
  "encryptionKey": "0123456789abcdef0123456789abcdef",
  "keyId": "01"
}
```

#### Which Devices Require BLE Encryption?

- SwitchBot Lock (and Lock Pro)
- SwitchBot Curtain 3 (and some Curtain 2 with updated firmware)
- Some sensors and new device models (see device info in app)

If you are unsure, check your device's info in the SwitchBot app. If the fields are present, copy them into the plugin config.

**Note:** If you enter an incorrect key or keyId, BLE communication will fail for that device. Double-check values if you encounter connection issues.

---

## Supported IR Devices

### _(All IR Devices require [SwitchBot Hub 2](https://us.switch-bot.com/products/switchbot-hub-2), [SwitchBot Hub Mini 2](https://us.switch-bot.com/products/switchbot-hub-mini-2), [SwitchBot Hub 3](https://us.switch-bot.com/products/switchbot-hub-3), or [Hub Mini](https://www.switch-bot.com/products/switchbot-hub-mini))_

- TV
  - Allows for On/Off and Volume Controls
  - Optional Disable Sending Power Command
- Projector (Displayed as TV)
  - Allows for On/Off and Volume Controls
- Set Top Box (Displayed as Set Top Box)
  - Allows for On/Off and Volume Controls
- DVD (Displayed as Set Top Box)
  - Allows for On/Off and Volume Controls
- Streamer (Displayed as Streaming Stick)
  - Allows for On/Off and Volume Controls
- Speaker (Displayed as Speaker)
  - Allows for On/Off and Volume Controls
- Fans
  - Allows for On/Off Controls
  - Optional Rotation Speed
  - Optional Swing Mode
- Lights
  - Allows for On/Off Controls
- Air Purifiers
  - Allows for On/Off Controls
- Air Conditioners
  - Allows for On/Off, Tempeture, and Mode Controls
  - Optional Disable Auto Mode
- Cameras
  - Allows for On/Off Controls
- Vacuum Cleaners
  - Allows for On/Off Controls
- Water Heaters
  - Allows for On/Off Controls
- Others
  - Option to Display as differenet Device Type
    - Supports Fan Device Type
  - Allows for On/Off Controls

## Matter Platform

### Batched refresh and API load control

By default, the Matter platform uses a single batched refresh to update device status. You can tune or override this behavior with the following options under `options`:

- `matterBatchEnabled` (boolean, default true): enable/disable platform-level batched refresh. Devices with a per-device `refreshRate` still run their own timers.
- `matterBatchRefreshRate` (number, seconds): batch interval (falls back to `options.refreshRate`, then 300 if not set).
- `matterBatchConcurrency` (number): limit of parallel OpenAPI status calls during a batch (default 5).
- `matterBatchJitter` (number, seconds): random startup delay before the first batch to reduce synchronized spikes.

Device-level override:

- If a device sets `refreshRate` in its config, it uses a per-device timer and is excluded from the platform batch.

Reliability and rate-limiting:

- Each device status call retries with exponential backoff on non-success responses.
- After exhausting retries, the device enters a short cooldown before being retried; cooldowns are persisted across restarts.
- The batch worklist is randomized every cycle to further distribute API load.

These controls keep API usage smooth and predictable while preserving per-device control when needed.

## What's new with node-switchbot v4.0.0

- Matter-first: when Homebridge Matter is available the plugin now prefers registering Matter accessories (with HAP fallback).
- Hybrid client: the plugin uses `node-switchbot@^4.0.0` with BLE + OpenAPI discovery and OpenAPI fallback.
- OpenAPI credentials: cloud discovery and cloud fallback paths require both `openApiToken` and `openApiSecret`.
- UI always served: the plugin UI is packaged into `dist/homebridge-ui` and is always served when Homebridge UI support is present; there is no platform-level opt-out.
- OpenAPI hardening: OpenAPI calls have AbortController timeouts, jittered exponential backoff, per-device retry limits and cooldowns, and safe response parsing for resilient behavior.
- v4 resilience enabled in discovery: plugin discovery enables retry, circuit-breaker, and connection-intelligence flags from `node-switchbot` v4.

- Write coalescing (debounce): command writes to the same device are coalesced by default to avoid command floods. Configure with `writeDebounceMs` (milliseconds, default 100). Set to `0` to disable coalescing.

See `MIGRATION.md` for migration notes and recommended upgrade steps.

## OpenAPI rate limiting and daily budget

To prevent hitting SwitchBot’s daily OpenAPI limit, the plugin provides several platform-level options under `options`:

- `dailyApiLimit` (number, default 10000): maximum OpenAPI requests per day that the plugin will allow.
- `dailyApiReserveForCommands` (number, default 1000): requests reserved for user actions so background polling pauses before the hard limit.
- `webhookOnlyOnReserve` (boolean, default false): when remaining budget reaches the reserve, pause background polling/discovery; webhooks and commands continue until the hard limit.
- `dailyApiResetLocalMidnight` (boolean, default false): if true, resets the daily counter at local midnight; when false, resets at UTC midnight.

Example (excerpt):

```json
{
  "options": {
    "dailyApiLimit": 10000,
    "dailyApiReserveForCommands": 1000,
    "webhookOnlyOnReserve": false,
    "dailyApiResetLocalMidnight": true
  }
}
```

## SwitchBot APIs

- [OpenWonderLabs/node-switchbot](https://github.com/OpenWonderLabs/node-switchbot)
  - [OpenWonderLabs/SwitchBotAPI](https://github.com/OpenWonderLabs/SwitchBotAPI)
  - [OpenWonderLabs/SwitchBotAPI-BLE](https://github.com/OpenWonderLabs/SwitchBotAPI-BLE)

## Development / Tests

- Run unit tests:
  ```bash
  npm run test
  ```

- Notes:
  - Added Lock Ultra (Cloud + BLE) support with `node-switchbot` v4.

## Community

- [SwitchBot (Official website)](https://www.switch-bot.com/)
- [Facebook @SwitchBotRobot](https://www.facebook.com/SwitchBotRobot/)
- [Twitter @SwitchBot](https://twitter.com/switchbot)
