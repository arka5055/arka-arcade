# Thought Tracks — Stages 1–9

Thought Tracks is a divided-attention game. You route trains from one tunnel to matching stations by tapping switches.

Difficulty does **not** come from faster trains. Trains stay slow and readable. Later stages add more stations, more switches, more trains on the board at once, and (from Stage 8) two-color matching.

There are nine stages. Once a stage is cleared it stays unlocked. You can replay any cleared map from **STAGES**.

## How a round works

- One tunnel. One connected binary tree of rails. No merges, loops, or crossings.
- Each switch has **one incoming rail** and **exactly two outgoing rails**. The green hub shows the live turnout. Tapping it flips only the blade inside the circle.
- A train locks its route when it commits to a switch. Flipping after that does not reroute that train.
- Correct train: `100 × stage number` points. A miss does not subtract points.
- Stages 1–2 also require a minimum number of correct trains. Stages 3–9 allow **≤3 misses**.
- The timer is the round window, not the score target. The stage ends when the last train resolves, or when time / misses run out.

## Progression at a glance

| Stage | Stations | Switches | Trains | Cap | Time | Goal | What it teaches |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 2 | 1 | 6 | 1 | 34s | 5 of 6, ≤1 miss | One switch, one train |
| 2 | 2 | 1 | 10 | 2 | 44s | 8 of 10, ≤2 misses | Two trains, same map |
| 3 | 3 | 2 | 14 | 2 | 54s | ≤3 misses | Two decisions on one route |
| 4 | 4 | 3 | 18 | 3 | 64s | ≤3 misses | Upper / lower split |
| 5 | 5 | 4 | 22 | 3 | 74s | ≤3 misses | Near switch first |
| 6 | 6 | 5 | 28 | 5 | 84s | ≤3 misses | Several trains at once |
| 7 | 7 | 6 | 34 | 6 | 94s | ≤3 misses | Full-board scan |
| 8 | 8 | 7 | 42 | 7 | 102s | ≤3 misses | Two-color matching |
| 9 | 9 | 8 | 48 | 7 | 108s | ≤3 misses | Overlapping decisions |

`Cap` is the maximum number of trains allowed on the rails at the same time. After Stage 8 the cap stays at 7. Load goes up through the map, not through more overlapping sprites.

---

## Stage 1 — The turnout

```
                 P
                 |
Tunnel --------- ●
                  \
                   \
                    K
```

Stations: **P, K**. One switch.

The whole game is this object. Incoming from the tunnel, two exits, one live blade. Look at the hub with nothing moving and you should already know where the next train will go.

Intro: *Tap the green switch to send each train to the matching station.*

## Stage 2 — Overlap, same map

Same tree as Stage 1. A second train can leave before the first arrives. You start planning one train ahead, still with only one decision point.

Intro: *A second train can leave before the first arrives.*

## Stage 3 — Depth 2

```
                 P
                 |
Tunnel --------- ●
                  \
                   ●---- K
                    \
                     G
```

Stations: **P, K, G**. Two switches. Some destinations need two taps: root, then the second hub.

Intro: *Some stations need two switches.*

## Stage 4 — Two sides

```
                 P
                /
           ●---
          /    \
Tunnel --●      K
          \
           ●---
          /    \
         G      Y
```

Stations: **P, K, G, Y**. Three switches. The root now splits the board into an upper pair and a lower pair. You have to watch both sides.

Intro: *Watch both sides of the board.*

## Stage 5 — Near before new

```
                    P
                   /
              ●---
             /    \
Tunnel -----●      K
             \     G
              ●
             / \
            Y   B
```

Stations: **P, K, G, Y, B**. Four switches. Longest route is three decisions. The new skill is priority: the train closest to a switch matters more than the train that just left the tunnel.

Intro: *Prioritize the nearest switch, not the newest train.*

## Stage 6 — Concurrent trains

```
                    P
                   /
              ●---
             /    \
Tunnel -----●      K / G
             \
              ●---- Y
               \
                ●---- B / V
```

Stations: **P, K, G, Y, B, V**. Five switches. Up to **5** trains on the rails. This is the first stage that feels like divided attention rather than a tutorial.

Intro: *Several trains may be on the rails at once.*

## Stage 7 — Scan the board

```
                    P / K
                   /
              ●--- G
             /
Tunnel -----●
             \
              ●---- Y
               \
                ●---- B
                 \
                  ●---- V / W
```

Stations: **P, K, G, Y, B, V, W**. Six switches. Longest route is four decisions. Downstream blades stay set — you set them, then leave them, then come back when a later train needs the other branch.

Intro: *Scan the whole board. Downstream switches stay set.*

## Stage 8 — Two-color matching

Same language as Stage 7, plus one dual-color leaf.

Stations: **P, K, G, Y, B, V, W, G/K**.

A **G/K** train is split green/black and must go to the split **G/K** station. Color pair is the first thing you read; the letters are there for accessibility.

Cap reaches **7** and stays there. More trains, same speed.

Intro: *NEW: Two-color trains go to the two-color station.*

## Stage 9 — Overlapping decisions

```
                         P / K
                        /
                   ●---
                  /    \
Tunnel ---- ●----●      G
                  \
                   ●---- Y / B

                    V / W
                   /
              ●---
             /
            ●---- G/K / P/W
```

Stations: **P, K, G, Y, B, V, W, G/K, P/W**. Eight switches. Two dual-color leaves, on opposite sides of the tree.

Cap stays **7**. The jump is overlapping decision windows: two hubs can need a tap at almost the same time, on different sides of the board.

Intro: *Two switches can need a tap at almost the same time.*

---

## What actually gets harder

| Layer | Stages | Mechanism |
| --- | --- | --- |
| Motor | 1 | Tap a 3-port turnout |
| Overlap | 2 | Second train before the first arrives |
| Depth | 3, 5, 7 | 2 → 3 → 4 switches on the longest route |
| Split attention | 4, 6 | Upper/lower subtrees, then 5 trains at once |
| Identity | 8 | Dual-color train ↔ dual-color station |
| Simultaneous | 9 | Two live decisions on opposite sides |

Train speed is unchanged from Stage 1 through Stage 9. If a map is hard because the rails are unreadable, that is a layout bug, not intended difficulty.

## Map rules that every stage obeys

- One source, `n` stations, `n − 1` switches.
- Every switch: 1 incoming port, 2 outgoing ports, 1 live blade.
- Rails outside a hub never move. Only the internal blade changes.
- Parent–child is one rail, growing away from the tunnel. No hairpins, no false crossings.
- Dual-color stations (8–9) are split fills, not labels on a single color.

## Scoring and unlocks

- Score for a correct train: `100 × stage`.
- Misses never subtract. They only spend the miss budget.
- Clearing a stage unlocks it permanently. A weak later run does not lock earlier maps again.
- **STAGES** shows every map as a real thumbnail of its rail tree. Cleared maps stay marked. **NEW** opens this selector rather than restarting Stage 1.
