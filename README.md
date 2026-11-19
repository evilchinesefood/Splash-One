# Patrol

[Play Patrol](https://dev.jdayers.com/patrol/)

Open `index.html` in a WebGL2 browser. The game runs directly from disk, including its terrain worker. No install, build step, assets, fonts, or network connection are required. A static web server can serve the same folder.

## Flight deck

Open the Aircraft card on the flight deck to compare the three jets. Each card shows the aircraft, its primary weapon, and flight stats with your installed parts. Your browser remembers the selected jet. All three carry four lock-on missiles. Click or tap outside the Hangar, Aircraft, Region, or Sky menu to return to the flight deck.

| Aircraft | Cruise | Primary weapon | Flight characteristics |
| --- | --- | --- | --- |
| Kestrel | 112 m/s | Pulse cannon | Balanced handling and armor |
| Needle | 140 m/s | Ion lance | Fast, agile, lightly armored. Each bolt can pierce two targets in a line. |
| Manta | 92 m/s | Scatter cannon | Heavier armor and slower turns. Three shots spread across the nose. |

Move the mouse to steer. Desktop flight captures the mouse in both windowed and fullscreen play so long turns work across multi-monitor setups. Press **P** or **Esc** to pause and free the cursor. Resume captures it again. You can turn this off under **Pause → Flight controls → Keep mouse inside game**. Switching away still pauses the patrol. In chase and cockpit views, the distance from center controls the turn rate and climb or dive. In the north-up view, point in the direction you want to fly. Under **Pause → Flight controls**, set mouse sensitivity, invert pitch, or pick the starting camera for your next patrol. North-up keeps its compass steering when pitch is inverted. These settings persist in this browser. The jet flies gentle turns until the first steering input. In chase and cockpit views, pull up manually when terrain approaches. Contact with land, water, another aircraft, a boat, or a station ends the patrol even at full shield. A flashing PULL UP warning signals low clearance or rising terrain.

| Action | Desktop |
| --- | --- |
| Fire primary | Hold left mouse |
| Missile | Right mouse or F |
| Afterburner | Hold Shift |
| Airbrake | Hold S |
| Barrel roll | Q or E |
| Cycle chase, cockpit, and north-up cameras | Space |
| Pause or resume | Esc / P |

On a phone, put your left thumb on the stick and drag from where it lands. Small movements make fine adjustments. Hold your aircraft’s Cannon, Lance, or Scatter button with your right thumb and slide onto Missile to launch while firing, or tap Missile on its own. Hold Boost or Brake to change speed, tap Roll to evade, and tap the camera name beside the missile count in the lower left to change views. Enable **Left-handed touch controls** to move the weapons to your left thumb and the stick to your right. Portrait keeps the thumb controls below the flight window. Launching starts the engine and an original synth score. The carrier finale adds a busier drum pattern. Pause to see your region, controls, pilot level, equipped upgrades, and audio controls. Sound mutes the whole game. Music lets you fly with effects alone. Separate Music and Sound effects sliders set the mix from 0 to 100%. The game remembers both levels and mute settings in this browser. Use the fullscreen button to expand the flight view.

## Regions

Open the Region and Sky cards on the flight deck to choose a landscape and weather. Autumn Lake District has wooded islands and mountain lakes. Painted Mesa follows a turquoise river through terraced sandstone cliffs. Jade Isle has one forested volcanic island ringed by beaches and open ocean. Shore missions bring you back to the island if you have flown far out to sea. Moonlight keeps each map’s terrain and adds stars, a crescent moon, cool reflections, and aircraft navigation lights. Storm brings low dark clouds, windblown rain, and a steel-blue cast to every region. To choose another region during a run, pause, select **End**, then return to the flight deck.

## Patrols

Destroy two targets in the opening fighter formations for your first upgrade. The third completes the wave and awards another choice. Other missions offer a choice halfway through their objective and again on completion. The shortest route has five missions and a carrier finale. Patrol length is a pacing estimate. Longer routes add more missions before the carrier. The tracker leads you toward the current objective. Keep a contact near the nose to acquire a missile lock. A hollow gun lead indicator shows where to point the nose for a moving contact within gun range. You can turn it off in **Pause → Flight controls**. The primary weapon and missile rails work independently. Incoming fire flashes the screen edge toward the source. When the shield breaks, it makes a distinct cracking sound. Pause to see the aircraft’s weapons, run upgrades and installed hangar parts.

Fly through a beacon to collect it. The first appears about ten seconds into a patrol. Each beacon is rolled independently when it spawns, so repeats are possible. The chance of a shield recharge rises smoothly from 10% at full shield to 40% at half shield and 70% at empty. Squadron and rapid fire split the remaining chance equally.

| Beacon | Effect |
| --- | --- |
| Cyan octagon with three aircraft chevrons | Calls three friendly jets for one attack pass on your locked target or the nearest enemy. |
| Violet shield with a plus | Instantly refills your shield to 100%. |
| Amber diamond with a lightning bolt | Doubles your current primary weapon’s firing rate for 12 seconds of flight. The HUD shows the remaining time. |

The cockpit radar and off-screen markers use matching pickup symbols.

Shields recharge after a break from incoming hits. Completing a wave’s bonus objective can repair your hull alongside the upgrade choice. Wing Wisps attack automatically. At level three, four wisps focus on a locked target if you also have Target Link. Tail Spark covers your rear, Orbit Guard intercepts incoming rounds, Kinetic Siphon restores shield on kills, and Split Salvo adds side bolts to a missile launch. Each has three ranks. Broadwing bombers fire slow amber spreads, Darts make quick attack passes, and Prism Towers signal their pulse volleys with a brightening diamond. Cutters and heavier gunboats patrol navigable water. Watch for their wakes during the opening patrol and the Silent Shore mission.

Upgrade cards compare your current values with the next rank. Wing Wisps and Target Link also show what you still need for all four wisps to focus on your lock.

Milestones add gear to the upgrade pool using browser-local storage. After defeating the carrier, return home or continue into endless waves.

## Hangar

Every patrol earns flight credits. Destroyed targets and completed missions add to the payout, and defeating the carrier grants a 300-credit victory bonus. Continuing into endless waves adds to that run’s earnings. The debrief ranks your weapons and squadron support by enemy HP removed. It also shows the highest credit payout earned in one patrol with this aircraft. You can see that record again when choosing your aircraft.

Open the Hangar from the flight deck or debrief. All aircraft draw from one credit balance. Choose an aircraft tab to install parts for that jet. Engine speed, turning, maximum hull and shield, shield recharge, primary weapon damage and rate of fire, and missile reload each have three ranks costing 40, 95, and 175 credits. A signature weapon kit costs 65, 130, and 240 credits. Kestrel gains extra parallel rounds at intervals, Needle pierces additional targets, and Manta concentrates its three-shot spread.

Choose **Paint & flame** on an aircraft’s tab to preview a finish, then select **Buy & equip** to spend credits. Glacier, Crimson, and Midnight paint cost 45, 60, and 75 credits. Ion blue, Plasma violet, and Mint exhaust cost 55, 70, and 85. Each aircraft keeps its own collection. You can mix paint and exhaust and switch between owned finishes for free.

The Fleet tab sells perks for every aircraft. Each rank grants one use per patrol. Re-roll draws different upgrade cards and Banish removes one upgrade from future offers for the rest of the run. Banishing keeps previously equipped ranks and leaves your level-up choice available. Respawn offers a reserve aircraft on loss. Deploy it to continue the current mission with your upgrades, full hull, shield and missile rails, or end the patrol and collect your credits.

| Fleet perk | Rank 1 | Rank 2 | Rank 3 |
| --- | ---: | ---: | ---: |
| Re-roll | 220 cr | 420 cr | 720 cr |
| Banish | 280 cr | 490 cr | 820 cr |
| Respawn | 600 cr | 1,100 cr | — |

Purchases apply on the next launch and persist in this browser. Existing players keep their balance and receive their previously purchased weapon, shield generator, and rail loader ranks on all three aircraft.

## Where to extend it

- `game.js` owns simulation and run state. The `encounters`, `gear`, and `models` tables hold mission groups, upgrade levels, and enemy stats. Add behavior alongside the corresponding flight, weapon, or enemy update.
- `world.js` generates terrain and clouds in a worker. Its WebGL2 renderer and CPU height queries share the terrain map.
- `art.js` draws projected aircraft, weapon effects, targeting cues, and cockpit instruments from simulation state.
- `upgrades.js` and `upgrades.css` draw equipment icons and the between-wave upgrade cards.
- `hangar.js` stores the credit balance and permanent parts, prices purchases, and calculates run payouts.
- `audio.js` synthesizes the flight score, engine, and combat sounds using Web Audio.
- `main.js` connects controls, cameras, audio, and the fixed-step game loop. The menus and flight readouts live in `index.html` and `patrol.css`.

## Deployment

Run `Scripts/Deploy.sh` to preview changes to the hosted game. Run `Scripts/Deploy.sh --live` to upload the game assets and icons, followed by the entry page. The Dev Labs launcher card is maintained in the separate Home-Website repository.
