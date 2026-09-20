# Thought Tracks — Stage 1 to 9

Locked design. Nine stages. One producer language. Difficulty is divided attention, not speed.

Trains stay slow from Stage 1 through Stage 9. What grows is the tree, the number of trains on the board, and — from Stage 8 — two-color identity.

## Round rules

- One tunnel. One binary tree. No merges, loops, or crossings.
- Every switch is three ports: one in, two out, one live blade.
- Tapping a hub flips only the blade. Rails outside the circle never move.
- A train locks its path when it commits to a switch. Later taps do not reroute that train.
- Correct train: `100 × stage`. A miss never subtracts points.
- Stages 1–2: reach a minimum correct count. Stages 3–9: **≤3 misses**.
- A round ends early once the clear goal is mathematically impossible.
  - Stage 1 fails on the 2nd miss.
  - Stage 2 fails on the 3rd miss.
  - Stages 3–9 fail on the 4th miss.
- The listed train count is the **round workload**. All of those trains are scheduled. The timer paces launches; it does not delete remaining work. If the active-train cap blocks a launch, that train stays queued and leaves as soon as there is room. At 0:00 no *unscheduled* trains are created. Queued and active trains still resolve.

## Unlock vs clear

- Stage 1 is always available.
- Clearing Stage N permanently unlocks Stage N+1.
- An unlocked stage never locks again.
- Any unlocked stage can be replayed from **STAGES**.
- Cleared maps show a small ✓. Locked maps stay visible but dimmed.
- **NEW** opens the selector. It does not restart Stage 1.

## The ladder

| Stage | Stations | Switches | Trains | Cap | Time | Goal | Skill |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 2 | 1 | 6 | 1 | 34s | 5/6 | One turnout, one train |
| 2 | 2 | 1 | 10 | 2 | 44s | 8/10 | Two trains, same map |
| 3 | 3 | 2 | 14 | 2 | 54s | ≤3 misses | Two decisions on one route |
| 4 | 4 | 3 | 18 | 3 | 64s | ≤3 misses | Upper and lower sides |
| 5 | 5 | 4 | 22 | 3 | 74s | ≤3 misses | Nearest switch first |
| 6 | 6 | 5 | 28 | 5 | 84s | ≤3 misses | Several trains at once |
| 7 | 7 | 6 | 34 | 6 | 94s | ≤3 misses | Scan the whole board |
| 8 | 8 | 7 | 42 | 7 | 102s | ≤3 misses | Two-color matching |
| 9 | 9 | 8 | 48 | 7 | 108s | ≤3 misses | Two live decisions at once |

Concurrent trains on stages 5–9:

**3 → 5 → 6 → 7 → 7**

After Stage 8 the cap stays at 7. Stage 8 is the last concurrency jump. From there, load comes from the map and from dual-color identity.

Every stage: **n stations, n − 1 switches, 1 source**. Two destinations always have their own switch. Never write `K/G` as one leaf.

Thumbnails on the selector are the layout source of truth. The trees below are the logical graphs only.

---

## Stage 1 — The turnout

Cap 1. Goal 5/6.

```
                 P
                /
Tunnel ------ J1
                \
                 K
```

Stations: **P, K**. One switch.

This is the whole verb of the game. Incoming from the left, two exits, one blade. With nothing moving, you should know where the next train will go.

*Tap the green switch to send each train to the matching station.*

## Stage 2 — Overlap

Same tree as Stage 1. Cap 2. Goal 8/10.

A second train can leave before the first arrives. Still one decision point. You start planning one train ahead.

*A second train can leave before the first arrives.*

## Stage 3 — Depth 2

Cap 2. Goal ≤3 misses.

```
                 P
                /
Tunnel ------ J1
                \
                 J2
                /  \
               K    G
```

Stations: **P, K, G**. Two switches.

P is one tap. K and G need the root, then J2.

*Some stations need two switches.*

## Stage 4 — Two sides

Cap 3. Goal ≤3 misses.

```
             P          G
            /          /
          J2          J3
         /  \        /  \
        /    K      /    Y
       /           /
      J1-----------
```

Binding routes:

- `J1.A → J2 → P / K`
- `J1.B → J3 → G / Y`

Three switches, four leaves. Stations: **P, K, G, Y**. The root splits the board. Upper pair P/K. Lower pair G/Y.

*Watch both sides of the board.*

## Stage 5 — Near before new

Cap **3**. Goal ≤3 misses.

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

Stations: **P, K, G, Y, B**. Four switches. Five leaves.

Longest route is three decisions (P, K). The new skill is priority: the train closest to a switch matters more than the train that just left the tunnel.

*Prioritize the nearest switch, not the newest train.*

## Stage 6 — Concurrent trains

Cap **5**. Goal ≤3 misses.

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

Stations: **P, K, G, Y, B, V**. Five switches. Six leaves.

Up to five trains on the rails. This is the first stage that feels like divided attention rather than a tutorial.

*Several trains may be on the rails at once.*

## Stage 7 — Scan the board

Cap **6**. Goal ≤3 misses.

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

Stations: **P, K, G, Y, B, V, W**. Six switches. Seven leaves.

Longest route is four decisions (V, W). Downstream blades stay set. You set them, leave them, and come back when a later train needs the other branch.

*Scan the whole board. Downstream switches stay set.*

## Stage 8 — Two-color matching

Cap **7**. Goal ≤3 misses. Last concurrency jump.

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

This is the first dual-color stage. The Stage 8 card shows a small **NEW · DUAL** chip. Stage 9 does not.

A **G/K** train is a distinct identity. It matches **only** the G/K station. It does not match single-color G or K. Token order is canonical: `G/K` and `K/G` are not separate targets. The same rule applies to **P/W**.

Color pair first; letters for accessibility.

Same train speed as Stage 7. More trains, one new identity rule.

*NEW: Two-color trains go to the two-color station.*

## Stage 9 — Overlapping decisions

Cap **7**. Goal ≤3 misses.

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

Stations: **P, K, G, Y, B, V, W, G/K, P/W**. Eight switches. Nine leaves.

Two dual-color leaves, on opposite sides. Every pair has its own switch.

Cap stays 7. The jump is overlapping decision windows: two hubs can need a tap at almost the same time, on different sides of the board.

*Two switches can need a tap at almost the same time.*

---

## What actually gets harder

| Layer | Stages | Mechanism |
| --- | --- | --- |
| Motor | 1 | Tap a 3-port turnout |
| Overlap | 2 | Second train before the first arrives |
| Depth | 3, 5, 7 | 2 → 3 → 4 switches on the longest route |
| Split attention | 4, 6 | Two sides, then five trains at once |
| Identity | 8 | Dual-color train ↔ dual-color station |
| Simultaneous | 9 | Two live decisions on opposite sides |

If a map is hard because the rails are unreadable, that is a layout bug, not intended difficulty.

## Map rules

- One source, `n` stations, `n − 1` switches.
- 1 incoming port, 2 outgoing ports, 1 live blade.
- Parent–child is one rail, growing away from the tunnel.
- No hairpins, no false crossings, no fourth port.
- Dual-color identity is exact. `G/K` matches only `G/K`. `P/W` matches only `P/W`.
- Dual-color stations are split fills, not a label on one color.
- Selector thumbnails draw unique graph edges only.

## Scoring and failure

- Score for a correct train: `100 × stage`.
- Misses never subtract points.
- Stage 1 fails as soon as 2 trains have missed.
- Stage 2 fails as soon as 3 trains have missed.
- Stages 3–9 fail on the 4th miss.
- If the round is not failed early, it resolves after every scheduled train has finished.

## Selector

- Two-column grid. Stage 9 stays left on the last row.
- Continue: small tag on the current card.
- Cleared: small ✓ on the thumbnail and next to the stage name.
- Stage 8 only: small **NEW · DUAL** chip. Not a banner.
- Do not add more thumbnail detail.
