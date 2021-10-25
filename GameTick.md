---
title: Game Tick
description: All the information about the tick phases
---

{% include subpages.html %}

# The Tick
### the game runs calculations of all physics, redstone, mob movement, and all other things that move or change over time. This calculation is done 20 times per tick if the server isnt lagging. This calculation every 20th of a second is called a tick (or gametick). The tick goes through a large amount of calculations and steps every calculation for difrent parts of the game.

## The Difrent Tick Phases
1. *World Border:* The position of the world border gets updated here.
2. *Weather:* This phase handes everything with the weather.
3. *Chunk Related Stuff:* This phase does a lot of chunk loading and entity related procesing.
4. *Block Ticks:* This is the phase that most redstone components that add delay is, things like repeaters and observers.
5. *Fluid Ticks* This is the phase that calculates all movement of water and lava.
6. *Raids:* This is the tick phase that handles everything related to raids.
7. *Block Events:* This is the tick phase that handles blocks that get cheduled, such as pistons and bells.
8. *Enitities:* This phase handles everything to do with entities, such as their movement and behavior.
9. *block entities:* This phase handles all block entities, such as hoppers and chests.

## Other Things Calculated In A tick
### there are other things that are calculated in a ticks that isnt specific to a phase, for example rails and redstone dust is calculated recursivly independent from the ticks and can happen in all of them. These components are called "recursive updators" or "instant updators".
