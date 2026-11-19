# SAR Brain

Play a medicinal chemistry campaign using structures, assay measurements and synthesis routes. Choose a compound, buy an FEP prediction or prepare an intermediate. Making an analog reveals its assay and keeps the intermediates for subsequent syntheses. The goal is to assay the strongest compound in the campaign at the lowest total spend.

## Run locally

From a clone, run `python3 build.py` (Python 3.8 or later, standard library only). Open **dist/medicinal_chemistry_world_map.html** to play, or **dist/strategy_movie.html** to watch the game and the SAR Brain advance together. Both pages work offline.

## Campaigns

| Campaign | Playable board | Recorded dates |
| --- | --- | --- |
| RENIN | 15 early references and 26 candidates on the azaindole chloride branch | Yes |
| ABL1 | 79 compounds | No |
| S1P1 | 74 compounds | No |

The replay selector also includes archived trajectories. For RENIN, **Original archive → Forward strategy** explores the broader network with ideal FEP. **Current game** plays on the smaller board with the selected LoMap cutoff and simulated prediction error. The native SAR Brain can switch between the compound plot and squares with retrosynthesis.

## What a move costs

The current game charges $1 per missing synthesis operation and $1 per FEP query. The spend counter starts at $0 and has no cap. An assay is included when a compound is made. The initial inventory is supplied. The cash unit represents a game cost. RENIN’s recorded dates locate the historical measurements on the plot. Elapsed laboratory time is an open modeling question.

## Replay strategies

| Current game | How it picks the next compounds |
| --- | --- |
| SAR only | Estimated affinity from the nearest measured analogs, plus novelty |
| SAR + fixed price | Same score, with a penalty for the standalone synthesis price |
| SAR + current price | Same score, with the price recalculated from inventory |
| FEP + SAR + current price | Use FEP when a measured reference can reach the candidate, otherwise use SAR. Include novelty and current price. |
| FEP neighbors only + current price | Apply the same FEP score and price penalty within the reachable candidates. Stop if the frontier is exhausted. |

Every strategy pays for the operations it actually uses. Current replays shortlist two candidates per round for RENIN and four for ABL1 and S1P1. FEP strategies query all newly accessible candidates. Each prediction is anchored to a measured reference and stays fixed until an assay is available.

For each noisy setting, 101 trajectories start from the same inventory. Each draws a Gaussian error once per edge, scaled by its LoMap score and difficulty. Draws are paired across strategies, cutoffs and difficulties within each campaign. Order the trajectories by dollars spent through the winning assay, counting an unreachable winner as infinite cost. The player shows the actual 51st trajectory, the 10th–90th percentile range and the number that reached the hit. Within equal costs, the draw number breaks ties. Automatic replays with ideal FEP or SAR alone are deterministic. The manual board keeps its reproducible error draw so saved games can be resumed.

The **RENIN archive** explores the wider network from the 15 dated starting references, using ideal FEP at LoMap ≥ 0.90. Forward ranks by predicted affinity percentile plus the normalized number of previously unseen neighbors the candidate could unlock. It selects pairs subject to the original synthesis budget. Hindsight receives the winner in advance and follows a minimum-hop, least-cost path among those tied on hops. The archive reports synthesis operations and queries separately. The **ABL1 and S1P1 archives** replay saved selections from their original three-compound openings with the same five policy types, fixed batches of four and ideal FEP at 0.90 where applicable. Those archives include opening synthesis costs.

Run `node scripts/summarize.cjs` before rebuilding if a change affects the simulation, campaign data or noise model. The offline player uses the stored summaries and reruns the selected trajectory locally.

## Repository contents

- `src/` contains the game engine, decision rules and viewer sources.
- `data/` contains frozen campaign inputs, structures and archived replay records. The application can be rebuilt without rerunning extraction or mapping.
- `media/` contains the RENIN and ABL1 recordings of the two synchronized views.

[Future ideas](FUTURE_IDEAS.md)
