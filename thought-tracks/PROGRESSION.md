# Thought Tracks — Stages 1–9

Thought Tracks is a divided-attention game. You route trains from one tunnel to matching stations by tapping switches.

Difficulty does **not** come from faster trains. Trains stay slow and readable. Later stages add more stations, more switches, more trains on the board at once, and (from Stage 8) two-color matching.

There are nine stages. **STAGES** shows every map as a real thumbnail of its rail tree. Use those thumbnails as the layout source of truth. The trees below are the logical graphs only.

## How a round works

- One tunnel. One connected binary tree of rails. No merges, loops, or crossings.
- Each switch has **one incoming rail** and **exactly two outgoing rails**. The green hub shows the live turnout. Tapping it flips only the blade inside the circle.
- A train locks its route when it commits to a switch. Flipping after that does not reroute that train.
- Correct train: `100 × stage number` points. A miss does not subtract points.
- Stages 1–2 require a minimum number of correct trains (`5/6`, `8/10`). Stages 3–9 allow **≤3 misses**.
- The timer controls the **train-release window**. When it reaches zero, no new trains launch. Trains already on the rails are allowed to resolve. The result is determined by routing accuracy, not by finishing early.

## Unlock vs clear

- Stage 1 is always available.
- **Clearing Stage N permanently unlocks Stage N+1.**
- Once a stage has been unlocked, it never locks again.
- Any unlocked stage can be replayed from **STAGES**.
- A cleared stage remains visibly marked as cleared.
- Locked stages stay visible but dimmed, so the ladder is readable.
- **NEW** opens this selector. It never restarts Stage 1 by itself.

## Progression at a glance

| Stage | Stations | Switches | Trains | Cap | Time | Goal | What it teaches |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 2 | 1 | 6 | 1 | 34s | 5/6 | One switch, one train |
| 2 | 2 | 1 | 10 | 2 | 44s | 8/10 | Two trains, same map |
| 3 | 3 | 2 | 14 | 2 | 54s | ≤3 misses | Two decisions on one route |
| 4 | 4 | 3 | 18 | 3 | 64s | ≤3 misses | Upper / lower split |
| 5 | 5 | 4 | 22 | 3 | 74s | ≤3 misses | Near switch first |
| 6 | 6 | 5 | 28 | 5 | 84s | ≤3 misses | Several trains at once |
| 7 | 7 | 6 | 34 | 6 | 94s | ≤3 misses | Full-board scan |
| 8 | 8 | 7 | 42 | 7 | 102s | ≤3 misses | Two-color matching |
| 9 | 9 | 8 | 48 | 7 | 108s | ≤3 misses | Overlapping decisions |

`Cap` is the maximum number of trains allowed on the rails at the same time:

1 → 1, 2 → 2, 3 → 2, 4 → 3, 5 → 3, 6 → 5, 7 → 6, 8 → 7, 9 → 7

After Stage 8 the cap stays at 7. Load goes up through the map, not through more overlapping sprites.

Every stage is a binary tree: **n stations, n − 1 switches, 1 source**. Never write two destinations as if they shared a leaf.

---

## Stage 1 — The turnout

```
                 P
                /
Tunnel ------ J1
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
                /
Tunnel ------ J1
                \
                 J2
                /  \
               K    G
```

Stations: **P, K, G**. Two switches. P is one tap. K and G need the root, then J2.

Intro: *Some stations need two switches.*

## Stage 4 — Two sides

```
          P          G
         /          /
    J2 --      J3 --
   /     \    /     \
  /       K  /       Y
J1 ---------
```

Stations: **P, K, G, Y**. Three switches. The root splits the board into an upper pair and a lower pair.

Intro: *Watch both sides of the board.*

## Stage 5 — Near before new

```
                    P
                   /
              J3 --
             /     \
            /       K
       J2 --
      /     \
     /       G
J1 --
      \
       J4 --
      /     \
     Y       B
```

Stations: **P, K, G, Y, B**. Four switches. Five leaves. Longest route is three decisions (P, K). The new skill is priority: the train closest to a switch matters more than the train that just left the tunnel.

Intro: *Prioritize the nearest switch, not the newest train.*

## Stage 6 — Concurrent trains

```
          P
         /
    J2 --
   /     \
  /       J3 -- K
 /       /     \
J1      /       G
  \
   J4 -- Y
        \
         J5 -- B
              \
               V
```

Stations: **P, K, G, Y, B, V**. Five switches. Six leaves. Up to **5** trains on the rails. This is the first stage that feels like divided attention rather than a tutorial.

Intro: *Several trains may be on the rails at once.*

## Stage 7 — Scan the board

```
              P
             /
        J3 --
       /     \
      /       K
 J2 --
/     \
       G
J1
 \
  J4 -- Y
       \
        J5 -- B
             \
              J6 -- V
                   \
                    W
```

Stations: **P, K, G, Y, B, V, W**. Six switches. Seven leaves. Longest route is four decisions (V, W). Downstream blades stay set — you set them, then leave them, then come back when a later train needs the other branch.

Intro: *Scan the whole board. Downstream switches stay set.*

## Stage 8 — Two-color matching

```
              P
             /
        J3 --
       /     \
      /       J7 -- K
 J2 --             \
/     \              G/K
       G
J1
 \
  J4 -- Y
       \
        J5 -- B
             \
              J6 -- V
                   \
                    W
```

Stations: **P, K, G, Y, B, V, W, G/K**. Seven switches. Eight leaves.

This is the first dual-color stage. The Stage 8 card in **STAGES** carries a **DUAL COLOR** badge. Stage 9 does not — by then the mechanic is part of the language.

A **G/K** train is split green/black and must go to the split **G/K** station. Color pair is the first thing you read; the letters are there for accessibility.

Cap reaches **7** and stays there. More trains, same speed.

Intro: *NEW: Two-color trains go to the two-color station.*

## Stage 9 — Overlapping decisions

```
                    P
                   /
              J4 --
             /     \
        J3 --       K
       /     \
      /       G
 J2 --
/     \
/      J5 -- Y
             \
              B
J1
 \
  J6 --
 /     \
J7      J8
 / \     / \
V   W  G/K P/W
```

Stations: **P, K, G, Y, B, V, W, G/K, P/W**. Eight switches. Nine leaves. Two dual-color leaves, on opposite sides of the tree. Every pair is a real switch, never a combined leaf.

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
- A pair of destinations always has its own switch. Never write `K / G` as if they were one leaf.
- Dual-color stations (8–9) are split fills, not labels on a single color.
- Thumbnails draw unique graph edges only. They must match these trees.

## Scoring

- Score for a correct train: `100 × stage`.
- Misses never subtract. They only spend the miss budget, checked when the round resolves.
