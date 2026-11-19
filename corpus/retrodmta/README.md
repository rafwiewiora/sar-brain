# RetroDMTA coverage and route provenance

Status recorded on 19 November 2026. The [RetroDMTA release](https://github.com/Sanofi-Public/RetroDMTA/tree/64eb182823485fcc450d70b575935dd449d791d2) supplies structures, activities and recorded experimental dates for four targets. The synthesis graphs were reconstructed separately. The date field does not establish when any intermediate was prepared.

| Target | Dataset compounds | Preparation supported by a source | Conservative priced routes | Priced including reconstructed routes | Exact products found in PaRoutes | Of these, still unpriced |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| RENIN | 388 | 275 | 173 | 218 | 4 | 1 |
| FXA | 1,015 | 414 | 73 | 77 | 39 | 32 |
| PPARD | 498 | 240 | 20 | 123 | 8 | 4 |
| MMP8 | 430 | 154 | 96 | 119 | 0 | 0 |
| **Total** | **2,331** | **1,083** | **362** | **537** | **51** | **37** |

The conservative tier requires a complete route from declared starting stock using accepted source evidence. The expanded tier also allows explicitly labelled reconstructions such as applying a documented general procedure to a reported analog. The 537 includes the 362. Another 546 compounds have preparation evidence but lack a complete priced route. Use the [compound ledger](coverage.csv) for individual eligibility, gap reasons and frozen graph hashes. Use the reviewed PPARD v2 and MMP8 v3 counts.

## What came from the route database?

The separate [47-patent screen](../README.md) **started from PaRoutes in all 70 assay contexts**. The reported comparison used the archive extraction directly in 64 contexts and a revision with patent-reviewed chemistry in six. These counts track the version used for pricing. They do not measure hours spent reviewing a patent.

For RetroDMTA, we started from the dated compound lists. We parsed patent examples, resolved names and references such as “prepared as in Example X,” and reviewed ambiguous structures, shared building blocks and isolated operations. This combined scripted extraction with targeted source review. We did not track human versus automated effort per step.

A separate audit searched all 457,166 archived PaRoutes trees for the exact compound as a prepared product, including stereochemistry. **14 of the 537 priced compounds** matched, and **523** had no exact product match. A match establishes archive coverage of the final structure. It does not establish which source supplied a particular step in our reconstruction. Partial upstream overlap was not quantified.

## Where review could be cheaper

The [37 unpriced matches](unpriced-archive-matches.csv) point to 74 archive trees. They are leads for review. An archive route can stop at an advanced building block with unresolved preparation. The largest immediate opportunity is FXA. In the taurine series, seven unpriced compounds already have three-operation route witnesses. A reviewer can start with their shared starting materials and patent locators.

For a new campaign, search the existing route index first, then trace each missing preparation back from the intermediate used by the most otherwise reachable compounds. Save the exact structure, reaction inputs and outputs, patent locator and operation count once. Reprice every affected analog after review. The [worked FAK example](../examples/fak-reviewed-preparation.json) shows the format for saving that correction.
