# Planes Control Official Feature Audit

The official [Google Play listing](https://play.google.com/store/apps/details?id=com.rarepixels.planeslittle&hl=en_US) explicitly defines the core control rule: players draw a path from each aircraft to the airstrip it belongs to, and “the colour of the plane should match the colour of the runway.” It also states that players can redirect aircraft to avoid collisions and lists more than 60 aircraft and helicopters.

The official [Rarepixels game page](https://www.rarepixels.com/games/planes-control/) describes 18 levels across Arizona, Hawaii, the Australian forest, Taiwan, Antarctica, and the Pacific Ocean. It lists enemies, tornadoes, mountains, wildfires, aliens, fuel loss, volcanic eruptions, and historical-combat scenarios as broader content features. These are content-expansion opportunities rather than prerequisites for the current landing-control loop.

The [June 2026 anniversary release](https://www.gamespress.com/Planes-Control-Celebrates-Its-10th-Anniversary-with-Biggest-Update-Eve) adds landmark-based destinations and level-specific gameplay, including fog that slows aircraft, balloon avoidance, lightning, three active runways, and mixed aircraft sizes and speeds. It confirms the original direction of increasing environmental variety and traffic complexity.

## Core parity implemented in Skyline Signal

Skyline Signal preserves player-drawn routes without synthetic points, maps each aircraft to one strict color-matched destination, offers collision avoidance, progressive traffic pressure, and stage-specific environments. The new helicopter type is violet, can only land on the dedicated violet H1 helipad, and may approach that pad from any direction.

## Mixed-fleet calibration

Rarepixels’ official App Store description confirms that the original roster includes **airliners, WWII fighters, jet planes, tilt rotors, and helicopters**, while the publisher does not expose internal numerical speed or model-scale values. Skyline Signal therefore uses a touch-safe, original-inspired relative hierarchy: compact helicopter, small commuter propeller aircraft, mid-size utility seaplane, large airliner, and the largest/fastest supersonic aircraft. The gameplay system applies these differences to both movement and the physical separation needed for collision warnings.
