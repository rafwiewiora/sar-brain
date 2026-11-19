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

Each target has an eleven-slide story (`dist/ABL1_intro.html`, `dist/RENIN_intro.html`, `dist/S1P1_intro.html`), a web replay and a separate deck. The replay and slides 1–10 follow the same actual median-spend run of **FEP with SAR fallback + cost** at LoMap 0.80 with Hard error for RENIN and LoMap 0.60 with Medium error for ABL1 and S1P1. On slide 11, compare all four strategies and change the cutoff, difficulty or cost metric. Each dot is the median for its chosen metric and the whiskers span the middle 50% on the same opening hand. The replay reports the wider 10th–90th percentile range for spend.

Open `dist/strategy_movie.html` to open the replay at the first slide. **Step slides** introduces each move before the live rankings, inventory, and counters update. Select **Play this move** to watch one move, then use the right arrow when ready. **Play** runs the full replay. The default RENIN replay and its separate deck share slide content, including the patent’s preparation of the retained azaindole chloride. During the first synthesis, the live squares show the price of CPD 121 falling from nine steps to two. Other replay settings show slide previews drawn from their own actions.

Each forward move starts on the game board. After an assay or FEP screen, the left pane briefly shows the changing candidate ranks, then returns to the updated board. Open `dist/RENIN_ranks.html` at the first RENIN synthesis decision. Each line follows one candidate across the three score columns. Watch the ranks move after an assay or FEP screen. The batch picks were committed at the start of the batch. Click a line or use Inspect to follow its structure, forecast, and synthesis price beneath the plot. Purchased FEP predictions include the replay’s error draw and use SAR as fallback. All three columns include the same novelty term.

## Patent evidence

Save each verified preparation in `data/patents/<publication-number>.md` as it is extracted for a viewer. Use a heading with the patent example and step, the viewer’s intermediate label, and a recognizable chemical name. Include the internal molecule ID, reaction partners, reported conditions and isolation data, and a link to the exact procedure. Keep replay costs under a separate **Replay use** note.

The records are plain text and searchable offline by patent number, target, intermediate, compound or reagent. The first entry is [RENIN · I5 · Example 1, step 5](data/patents/US8580813B2.md).

## What a move costs

The current game charges $1 per missing synthesis operation and $1 per FEP query. The spend counter starts at $0 and has no cap. An assay is included when a compound is made. The initial inventory is supplied. The cash unit represents a game cost. RENIN’s recorded dates locate the historical measurements on the plot. Elapsed laboratory time is an open modeling question.

The three candidate cards show a selection. **Run FEP on all eligible** shows the full count and total price before purchase. You can also predict one compound from its card. The replay marks every compound in the FEP batch, depresses the chosen button, then updates money spent on the left and the synthesis-step and FEP-query counters on the right. In the ABL1 example, the structures for Ex 171 and Ex 175 are aligned on their shared scaffold. Teal marks the ring alcohol and hydroxymethyl groups in their respective patent structures.

## Replay strategies

| Current game | How it picks the next compounds |
| --- | --- |
| SAR only | Estimated affinity from the nearest measured analogs, plus novelty |
| SAR + synthesis cost | Same estimate and novelty, with a penalty for steps still needed from inventory |
| FEP with SAR fallback | Use FEP for reachable candidates and SAR for the rest, plus novelty |
| FEP with SAR fallback + cost | Use the same estimates and novelty, with the current synthesis penalty |

Every strategy pays for the operations it actually uses. Current replays shortlist two candidates per round for RENIN and four for ABL1 and S1P1. FEP strategies query all newly accessible candidates. Each prediction is anchored to a measured reference and stays fixed until an assay is available.

For each noisy setting, 101 trajectories start from the same inventory. Each draws a Gaussian error once per edge, scaled by its LoMap score and difficulty. Draws are paired across strategies, cutoffs and difficulties within each campaign. Order the trajectories by dollars spent through the winning assay, counting an unreachable winner as infinite cost. The player shows the actual 51st trajectory, the 10th–90th percentile range and the number that reached the hit. Within equal costs, the draw number breaks ties. Automatic replays with ideal FEP or SAR alone are deterministic. The manual board keeps its reproducible error draw so saved games can be resumed.

**Hindsight oracle** is a separate control. The winner’s identity is supplied. Starting with the same measured references, breadth-first search finds the fewest FEP hops at the selected cutoff. The control enumerates the tied shortest paths and chooses one with the lowest cost for the union of missing synthesis operations. Each targeted ideal FEP query costs $1. Intermediate compounds on the path must be made and assayed to serve as references. A disconnected winner has no FEP path. The **Direct synthesis** option shows the unrestricted known-winner benchmark from the same inventory, with zero queries. A SAR-fallback policy can cross between disconnected FEP components.

Run `node scripts/summarize.cjs` before rebuilding if a change affects the simulation, campaign data or noise model. The offline player uses the stored summaries and reruns the selected trajectory locally.

## Repository contents

- `src/` contains the game engine, decision rules and viewer sources.
- `data/` contains frozen campaign inputs, structures and archived replay records. The application can be rebuilt without rerunning extraction or mapping.
- `media/` contains the separate slide PDFs and historical recordings. The web build copies the PDFs.

[Future ideas](FUTURE_IDEAS.md)
