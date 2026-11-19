# The 47-patent collection

Start with the [patent list](patents.csv). Each row is one patent, target, assay context and endpoint. A patent can supply several rows. Use the `screen_network` column to open the precise route revision used in the comparison.

We screened the overlap between PaRoutes preparations and BindingDB patent measurements. We kept contexts with at least 20 usable, prepared compounds and an acyclic route graph with valid chemical identities. An intermediate could qualify if it had its own measurement and a recorded preparation. This gave **47 patents, 70 assay contexts and 3,672 eligible compound–context entries**, including 259 measured internal compounds. The screen ran across the whole overlap. The [context census](screen/full_context_census.csv) preserves smaller and excluded groups.

## What is saved

| File | What a follow-up analysis can recover |
| --- | --- |
| [Catalog](catalog.json) and `networks/` | Structures, molecular identities, starting stock, alternative reactions with all required inputs, route-tree indices, patent links, assay values and eligibility. The catalog distinguishes the archive extraction from patent-reviewed versions and records both original and packaged hashes. |
| `observations/` | Individual BindingDB records with source row, ligand name, reactant-set ID, reported value or qualifier, identity check and row-quality flag. Use these to trace a compound's median nM value. |
| [Intermediate candidates](screen/candidate_intermediates.json.gz) and [selection rules](screen/intermediate_screen_protocol.json) | The original 56 intermediate–assay candidates, representing 40 distinct platforms across 18 patents. Each record lists its measured descendants and preparation cost. |
| [Comparison](screen/coverage_all_128.csv) and [paired starts](screen/paired_starts.json.gz) | All 128 shared starts per context, seeds 0–63 and 1000–1063. Batches contained four compounds. Both cost-aware policies retained products. Their selection rules used either the original or the current route price. ABL1 had the largest mean paired saving, 59.1 operations. |
| [FEP index](fep/index.json) | Ten existing OpenFE/LoMap transformation networks linked to the exact candidate pools. Includes atom mappings, mapper settings, edge scores and available lower-cutoff extensions. These are eligible transformations for simulated predictions. |
| [Worked examples](examples/) | An ABL1 intermediate and saving, plus three source-cited steps that correct the FAK stock boundary. |

One step is one recorded preparative operation. A starting material is free at the recorded route boundary. Buying, yield loss, quantities and calendar time are outside this cost model. A correct stock boundary matters whenever a patent refers elsewhere for the preparation of an advanced building block.

## Look up an intermediate and its saving

Run these commands at the repository root with Python 3.10 or later. The archive, verifier and pricing example use the standard library.

```sh
python3 corpus/tools/verify.py
python3 corpus/tools/patent.py inspect US9278981_c8205_e2 m_264522
python3 corpus/tools/patent.py price US9278981_c8205_e2 m_307317 m_307318
```

The first ABL1 compound costs **3 steps**. It leaves an aryl bromide in stock. The second compound costs **1 more step**, compared with **3 from starting stock**. The price command returns both reaction sequences and the structure that accounts for the difference. Both lookup commands accept a context key or a network file and support `--output new-file.json` or `.json.gz`.

To reproduce the larger selection experiment, install NumPy and RDKit and run `python3 corpus/tools/screen.py US9278981_c8205_e2 --seed 16`. For this start, SAR only, fixed price and updated price reached the winner in 136, 127 and 60 operations, respectively. The [paired results](screen/paired_starts.json.gz) record the starting indices in the simulation's eligible-compound order.

## Extract another patent

Use the [PaRoutes 2.0 route archive](https://zenodo.org/records/7341155) and a [BindingDB patent TSV archive](https://www.bindingdb.org/rwd/bind/chemsearch/marvin/Download.jsp). The three ingestion commands build a source index once. Use a fresh database path. Pinned versions for this extraction are in [requirements.txt](tools/ingest/requirements.txt).

```sh
python3 -m pip install -r corpus/tools/ingest/requirements.txt
python3 corpus/tools/ingest/build_corpus.py --routes all_loaded_routes.json.gz --bindingdb BindingDB_Patents_202611_tsv.zip --database patents.db --receipt build.json
python3 corpus/tools/ingest/derive_activities.py --database patents.db --receipt activities.json
python3 corpus/tools/ingest/derive_branches.py --database patents.db --receipt branches.json
python3 corpus/tools/patent.py contexts patents.db US9278981
python3 corpus/tools/patent.py extract patents.db 8205 2 extracted-abl1.json.gz
```

Look up the context and endpoint IDs on each new database build. The example numbers belong to the archived release. The export keeps raw assay observations alongside the graph. Measurements are aggregated within one context and endpoint using positive, exact nM values with matching structure identity, accepted source rows and at most tenfold repeat spread. The builder preserves bounds and other raw observations for inspection.

**When a preparation is missing**, follow the patent's example or cross-reference. Record each isolated operation, input and output structures, the source URL and the example or step. Record conditions or reagents only when the source gives them. The [FAK example](examples/fak-reviewed-preparation.json) is a reusable input format keyed by InChIKey. The following command verifies the structures, requires a source locator for each step and writes a new network revision while retaining the original. It checks that a final product was previously treated as starting stock. Source interpretation still requires review.

```sh
python3 corpus/tools/add_preparation.py corpus/networks/US8501936_c5189_e2.archive.json.gz corpus/examples/fak-reviewed-preparation.json fak-reviewed.json.gz
python3 corpus/tools/patent.py inspect fak-reviewed.json.gz m_230788
```

Adding those three documented operations changes the recorded cost to the later FAK chloride intermediate `m_230809` from **3 to 6**. Keep both network revisions, the evidence file and the hash of the revision used for each replay. Seed indices and database molecule IDs are meaningful only within their revision.

The package supports route lookup, pricing and SAR comparisons for all 70 contexts. To promote one to a browser game, choose its starting inventory, check the stock boundary and assay endpoint, and prepare its structures and any FEP mappings at the intended cutoff. The existing browser campaigns are in [data](../data/). The dated RetroDMTA campaigns are a separate collection.

## Source credit

Routes derive from Samuel Genheden's *PaRoutes 2.0 and USPTO-based models*, [dataset and attribution](https://doi.org/10.5281/zenodo.7341155), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Measurements derive from BindingDB's US Patent curation. See [BindingDB's attribution and licensing](https://www.bindingdb.org/rwd/bind/info.jsp) and [the database paper](https://doi.org/10.1093/nar/gkae1075). BindingDB identifies its staff-curated records as [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/). The graphs normalize chemical identities, join assays to preparations, aggregate repeated measurements and add explicitly identified route reviews. Each network contains its patent link and source archive hashes. The release stores derived records and source locators. The original bulk archives are available from their providers.
