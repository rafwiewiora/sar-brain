"""Repeat one paired start of the published patent screen."""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import numpy as np
from planner import ReactionPlanner
from replay_base import Experiment as CanonicalExperiment
from patent import ROOT, load

class DynamicExperiment(CanonicalExperiment):
    """Same SAR proxy and event schema; inventory-dependent physical routes."""

    def __init__(self, path, tier="conservative", max_states=None):
        super().__init__(path, tier)
        self.canonical_reference_pool_cost = int(self.total_cost)
        self.canonical_reference_standalone_costs = self.C0.copy()
        self.canonical_reference_routes = [set(r) for r in self.routes]
        self.canonical_reference_active = list(self.active)
        self.planner = ReactionPlanner(self.N, self.R, tier,
                                      targets=[c["node"] for c in self.E],
                                      max_states=max_states)
        stockplans = [self.planner.plan(c["node"]) for c in self.E]
        assert all(p is not None for p in stockplans)
        self.routes = [set(p.reactions) for p in stockplans]
        self.C0 = np.array([p.cost for p in stockplans], dtype=int)
        self.original_standalone_costs = self.C0.copy()
        self.active = self.planner.active
        # Keep the inherited static-route inspection fields internally aligned
        # with the new active-ID ordering.  The dynamic executor never infers
        # molecular availability from these masks.
        ix = {r: j for j, r in enumerate(self.active)}
        self.weights = [int(self.R[r]["cost"]) for r in self.active]
        offsets = {}
        bit_offset = 0
        for j, weight in enumerate(self.weights):
            offsets[j] = ((1 << weight) - 1) << bit_offset
            bit_offset += weight
        self.rmasks = [sum(1 << ix[r] for r in rr) for rr in self.routes]
        self.smasks = [sum(offsets[ix[r]] for r in rr) for rr in self.routes]
        self.term = [sum(1 << ix[r] for r in self.active
                         if c["node"] in self.R[r]["outputs"]) for c in self.E]
        assert np.array_equal(self.C0, [s.bit_count() for s in self.smasks])
        # Only representative operations reachable from the real stock boundary
        # can be executed in a normal run.  Their union is a safe bound, not a
        # prediction that every run pays it or that final costs must be equal.
        self.total_cost = sum(self.R[r]["cost"]
                              for r in self.planner.closed_stock_reactions)
        assert self.total_cost >= max(self.C0)
        self.route_price_discrepancies = [
            dict(compound=c["id"], graph_cost=c.get("standalone_cost"),
                 canonical_executor_cost=int(self.canonical_reference_standalone_costs[i]),
                 dynamic_standalone_cost=int(self.C0[i]))
            for i, c in enumerate(self.E)
            if (c.get("standalone_cost") is not None
                and c["standalone_cost"] != int(self.C0[i]))
                or self.canonical_reference_standalone_costs[i] != self.C0[i]]
        self.dynamic_metadata = dict(
            algorithm=self.planner.algorithm,
            exact_single_target=True,
            joint_batch_optimization=False,
            original_canonical_pool_cost=self.canonical_reference_pool_cost,
            pool_cost_upper_bound=int(self.total_cost),
            pool_cost_order_dependent=True,
            active_all_source_reactions=len(self.active),
            representative_operations=len(self.planner.representatives),
            reachable_representative_operations=len(self.planner.closed_stock_reactions),
            chemically_equivalent_source_groups=sum(
                len(v) > 1 for v in self.planner.equivalent_sources.values()),
            fixed_quote="Minimum stock-to-target cost frozen before the replay",
            inventory="Molecular node availability; all reaction outputs retained",
            assay_feedback="Completed batches only; automatically assay all prepared dataset molecules",
            execution="All policies use the same exact inventory-dependent individual-target planner",
        )

    def marginal_plan(self, compound_index, available=()):
        return self.planner.plan(self.E[int(compound_index)]["node"], available)

    def run(self, seed, mode, lam, batch, limit=None):
        if mode not in ("sar", "fixed", "aware", "aware_greedy"):
            raise ValueError(mode)
        if batch < 1:
            raise ValueError("batch must be positive")
        rng = np.random.default_rng(seed)
        initial = rng.choice(self.n, min(3, self.n), False).tolist()
        tie = rng.random(self.n) * 1e-9
        seen = np.zeros(self.n, bool)
        inventory = set(self.planner.stock)
        paid_reactions = set()
        spent = 0
        best = None
        events = []
        plans = []
        coefficient = 0 if mode == "sar" else lam

        def acquire(i, phase, pid):
            nonlocal spent, seen
            plan = self.marginal_plan(i, inventory)
            assert plan is not None
            before = set(inventory)
            cost, new_r = self.planner.execute_plan(plan, inventory)
            assert cost == plan.cost, ("stale or redundant dynamic plan", i, cost, plan.cost)
            assert not (set(new_r) & paid_reactions), "paid a preparation twice"
            paid_reactions.update(new_r)
            spent += cost
            available = np.array([c["node"] in inventory for c in self.E])
            new = np.flatnonzero(available & ~seen).tolist()
            seen |= available
            events.append(dict(
                chosen=int(i), compound=self.E[i]["id"], phase=phase, plan=pid,
                cost=int(cost), spent=int(spent), newResults=new,
                newReactions=new_r, hits=int(self.top[seen].sum()),
                recall=float(self.top[seen].sum() / self.ntop),
                observed=int(seen.sum()), newMolecules=sorted(inventory - before),
                synthesisPlan=list(plan.reactions),
            ))
            return new

        new = []
        for i in initial:
            if not seen[i]:
                new += acquire(i, "seed", -1)
        best = self.update_neighbors(best, new)
        completed = [dict(events[-1], allNewResults=new,
                          allCompounds=[self.E[i]["id"] for i in initial])]
        while not seen.all() and (limit is None or spent < limit):
            utility, pred = self.score(best)
            pending = np.flatnonzero(~seen).tolist()
            quotes = {}

            def quote(i, inv=inventory):
                if mode == "fixed":
                    return int(self.C0[i])
                p = self.marginal_plan(i, inv)
                assert p is not None
                return p.cost

            if mode == "sar" or coefficient == 0:
                # No hidden activity values or unused cost computation can enter
                # the cost-blind membership/tie rule.
                ranks = utility + tie
            else:
                for i in pending:
                    quotes[i] = quote(i)
                ranks = np.array([
                    utility[i] - coefficient * math.log(max(quotes.get(i, 1), 1)) + tie[i]
                    for i in range(self.n)])
            ranks[seen] = -np.inf
            k = min(int(batch), len(pending))
            chosen = [int(i) for i in np.argsort(-ranks, kind="stable")[:k]]
            if mode == "aware_greedy" and coefficient != 0:
                virtual = set(inventory)
                chosen = []
                virtual_quotes = {}
                for _ in range(k):
                    candidates = [i for i in pending if i not in chosen]
                    current = {i: self.marginal_plan(i, virtual) for i in candidates}
                    i = max(candidates, key=lambda j:
                            utility[j] - coefficient * math.log(max(current[j].cost, 1)) + tie[j])
                    chosen.append(i)
                    virtual_quotes[i] = int(current[i].cost)
                    self.planner.execute_plan(current[i], virtual)
                quotes.update(virtual_quotes)
            for i in chosen:
                if i not in quotes:
                    quotes[i] = quote(i)
            pid = len(plans)
            plans.append(dict(atSpent=int(spent), targets=chosen.copy(),
                              utility={str(i): float(utility[i]) for i in chosen},
                              quote={str(i): int(quotes[i]) for i in chosen}))
            new = []
            executed = []
            while chosen:
                # Co-products/intermediates already made need no new preparation.
                # This uses molecular availability, never their assay values.
                chosen = [i for i in chosen if not seen[i]]
                if not chosen:
                    break
                if coefficient == 0:
                    i = max(chosen, key=lambda j: utility[j] + tie[j])
                elif mode == "fixed":
                    i = max(chosen, key=lambda j:
                            utility[j] - coefficient * math.log(max(self.C0[j], 1)) + tie[j])
                else:
                    costs = {j: self.marginal_plan(j, inventory).cost for j in chosen}
                    i = max(chosen, key=lambda j:
                            utility[j] - coefficient * math.log(max(costs[j], 1)) + tie[j])
                new += acquire(i, "select", pid)
                executed.append(self.E[i]["id"])
                chosen.remove(i)
            if new:
                best = self.update_neighbors(best, new)
            completed.append(dict(events[-1], allNewResults=new,
                                  allCompounds=executed))
        assert spent == sum(self.R[r]["cost"] for r in paid_reactions)
        assert spent <= self.total_cost, (spent, self.total_cost)
        return dict(seed=seed, mode=mode, lambda_=lam, batch=batch,
                    initial=initial, events=events, plans=plans,
                    completedEvents=completed,
                    final_cost=int(spent), final_observed=int(seen.sum()),
                    dynamic_route_planning=True)


# Drop-in import for the existing common CLI, while retaining the descriptive name.
Experiment = DynamicExperiment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("context")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    record = load(ROOT / "catalog.json")[args.context]
    experiment = DynamicExperiment(ROOT / record["screen_network"])
    winners = set(np.flatnonzero(np.abs(experiment.y - experiment.y.max()) < 1e-9))
    result = {"seed": args.seed}
    for policy in ("sar", "fixed", "aware"):
        run = experiment.run(args.seed, policy, 0 if policy == "sar" else 0.5, 4)
        result["initial"] = run["initial"]
        event = next(e for e in run["completedEvents"] if winners.intersection(e["allNewResults"]))
        result[policy] = event["spent"]
    print(json.dumps(result))


if __name__ == "__main__":
    main()
