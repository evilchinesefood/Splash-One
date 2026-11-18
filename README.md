# Patrol

[Play Patrol](https://dev.jdayers.com/patrol/)

Open `index.html` in a WebGL2 browser. The game runs directly from disk, including its terrain worker. No install, build step, assets, fonts, or network connection are required. A static web server can serve the same folder.

## Flight deck

Move the mouse to steer. In chase and cockpit views, the distance from center controls the turn rate and climb or dive. In the north-up view, point in the direction you want to fly. The jet flies gentle turns until the first steering input.

| Action | Desktop |
| --- | --- |
| Cannon | Hold left mouse |
| Missile | Right mouse or F |
| Afterburner | Hold Shift |
| Airbrake | Hold S |
| Barrel roll | Q or E |
| Cycle chase, cockpit, and north-up cameras | Space |
| Pause or resume | Esc |

On a phone, put your left thumb on the stick and drag from where it lands. Small movements make fine adjustments. Hold Cannon with your right thumb and slide onto Missile to launch while firing, or tap Missile on its own. Hold Boost or Brake to change speed, tap Roll to evade, and tap View in the header to change cameras. Portrait keeps the thumb controls below the flight window. Starting a patrol enables synthesized sound. Pause to see controls, pilot level, equipped upgrades, and the sound toggle. The game remembers your mute preference. Use the fullscreen button to expand the flight view.

## Regions

Choose a region and sky on the flight deck. Autumn Lake District has wooded islands and mountain lakes. Painted Mesa follows a turquoise river through terraced sandstone cliffs. Moonlight keeps each map’s terrain and adds stars, a crescent moon, cool reflections, and aircraft navigation lights. To choose another region during a run, pause and select **End patrol and change region**.

## Patrols

Destroy any three jets from the opening fighter formations to choose your first upgrade. The shortest route has five missions and a carrier finale. Patrol length is a pacing estimate. Longer routes add more missions before the carrier. The tracker leads you toward the current objective. Keep a contact near the nose to acquire a missile lock. The cannon and missile rails work independently.

Shields recharge after a break from incoming hits. Each wave offers a bonus hull repair and a separate upgrade choice. Wing Wisps attack automatically. At level three, four wisps focus on a locked target if you also have Target Link. Tail Spark covers your rear, Orbit Guard intercepts incoming rounds, Kinetic Siphon restores shield on kills, and Split Salvo adds side bolts to a missile launch. Each has three ranks. Broadwing bombers fire slow amber spreads, Darts make quick attack passes, and Prism Towers signal their pulse volleys with a brightening diamond.

Milestones add gear to the upgrade pool using browser-local storage. After defeating the carrier, return home or continue into endless waves.

## Where to extend it

- `game.js` owns simulation and run state. The `encounters`, `gear`, and `models` tables hold mission groups, upgrade levels, and enemy stats. Add behavior alongside the corresponding flight, weapon, or enemy update.
- `world.js` generates tiled terrain and clouds in a worker. Its WebGL2 renderer and CPU height queries share the terrain map.
- `art.js` draws projected aircraft, weapon effects, targeting cues, and cockpit instruments from simulation state.
- `upgrades.js` and `upgrades.css` draw equipment icons and the between-wave upgrade cards.
- `audio.js` synthesizes the engine and combat sounds using Web Audio.
- `main.js` connects controls, cameras, audio, and the fixed-step game loop. The menus and control strip live in `index.html` and `patrol.css`.

## Deployment

Run `Scripts/Deploy.sh` to preview changes to the hosted game. Run `Scripts/Deploy.sh --live` to upload the game assets and icons, followed by the entry page. The Dev Labs launcher card is maintained in the separate Home-Website repository.
