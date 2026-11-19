# SAR Brain

Play a medicinal chemistry campaign using structures, assay measurements and synthesis routes. Choose a compound, buy an FEP prediction or prepare an intermediate. Making an analog reveals its assay and keeps the intermediates for subsequent syntheses. The goal is to assay the strongest compound in the campaign before the cash runs out.

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

The current game charges $1 per missing synthesis operation and $1 per FEP query. An assay is included when a compound is made. The initial inventory is supplied. The cash unit represents a game cost. RENIN’s recorded dates locate the historical measurements on the plot. Elapsed laboratory time is an open modeling question.

## Repository contents

- `src/` contains the game engine, decision rules and viewer sources.
- `data/` contains frozen campaign inputs, structures and archived replay records. The application can be rebuilt without rerunning extraction or mapping.
- `media/` contains the RENIN and ABL1 recordings of the two synchronized views.

[Future ideas](FUTURE_IDEAS.md)
