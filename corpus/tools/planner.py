"""Minimum recorded operations to one compound from current molecular inventory."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from numbers import Integral
from typing import Iterable, Mapping, Optional
import math


@dataclass(frozen=True)
class RoutePlan:
    cost: int
    reactions: tuple[str, ...]
    outputs: frozenset[str]
    goal: str


class RoutePlanningLimit(RuntimeError):
    """The caller's explicit search limit was reached; no approximate quote."""


class ReactionPlanner:
    """Minimum preparative-operation union for one target and current stock.

    ``nodes`` and ``reactions`` use the shared network.json dictionaries.
    ``available`` passed to plan is a node-ID iterable; declared stock is always
    available.  ``plan`` returns None only when the target is not preparable.
    Normal replay inventories contain only declared stock and actually made
    molecules.  The planner also supports an explicitly supplied advanced input
    that is not itself reachable from declared stock, without silently declaring
    that input stocked for any subsequent query.
    """

    def __init__(self, nodes: Mapping, reactions: Mapping,
                 tier: str = "conservative", targets: Optional[Iterable[str]] = None,
                 max_states: Optional[int] = None):
        if tier not in ("conservative", "expanded"):
            raise ValueError(f"Unknown evidence tier: {tier}")
        self.N = nodes
        self.R = reactions
        self.tier = tier
        self.max_states = max_states
        self.stock = frozenset(n for n, q in nodes.items() if q.get("is_stock"))
        self._node_ids = sorted(nodes)
        self._node_index = {n: i for i, n in enumerate(self._node_ids)}
        self._node_bit = {n: 1 << i for n, i in self._node_index.items()}
        self._stock_mask = self._mask(self.stock)
        self.viable = {}
        for rid, q in sorted(reactions.items()):
            if (q.get("issues") or q.get("alternative") or q.get("excluded")
                    or q.get("exclude") or q.get("disabled")
                    or q.get("eligible") is False
                    or tier in q.get("excluded_tiers", [])
                    or (tier == "conservative" and
                        q.get("expanded_preparation_inference"))):
                continue
            cost = q["cost"]
            if isinstance(cost, bool) or not isinstance(cost, Integral) or cost <= 0:
                raise ValueError(f"Reaction {rid} needs a positive integer cost")
            if not q.get("outputs"):
                raise ValueError(f"Reaction {rid} has no output")
            for n in q.get("inputs", []) + q["outputs"]:
                if n not in nodes:
                    raise ValueError(f"Reaction {rid} refers to missing molecule {n}")
            self.viable[rid] = q
        all_by = defaultdict(list)
        for rid, q in self.viable.items():
            for n in q["outputs"]:
                all_by[n].append(rid)

        # All viable ancestors, not only the canonical preferred recipe.  Stock
        # nodes terminate ancestry.  The visited set, not a recursive memo of a
        # failed cyclic route, controls traversal.
        if targets is None:
            active = set(self.viable)
        else:
            active = set()
            todo = list(targets)
            visited = set()
            while todo:
                n = todo.pop()
                if n in visited or n in self.stock:
                    continue
                if n not in nodes:
                    raise KeyError(n)
                visited.add(n)
                for rid in all_by[n]:
                    if rid not in active:
                        active.add(rid)
                        todo.extend(self.viable[rid].get("inputs", []))
        self.active = sorted(active)

        # Chemically equivalent records cannot create additional discounts just
        # because the same preparation is described in two patent sources.
        groups = defaultdict(list)
        for rid in self.active:
            q = self.R[rid]
            groups[(tuple(sorted(set(q.get("inputs", [])))),
                    tuple(sorted(set(q["outputs"]))))].append(rid)
        self.equivalent_sources = {}
        representatives = []
        for ids in groups.values():
            rep = min(ids, key=lambda r: (
                self.R[r]["cost"],
                0 if self.R[r].get("evidence", "").startswith("explicit_preparation_reviewed") else
                1 if self.R[r].get("evidence", "").startswith("explicit") else 2, r))
            representatives.append(rep)
            self.equivalent_sources[rep] = tuple(sorted(ids))
        self.representatives = sorted(representatives)
        self._rindex = {r: i for i, r in enumerate(self.representatives)}
        self._rin = [self._mask(self.R[r].get("inputs", []))
                     for r in self.representatives]
        self._rout = [self._mask(self.R[r]["outputs"])
                      for r in self.representatives]
        self._rcost = [int(self.R[r]["cost"]) for r in self.representatives]
        self._by = defaultdict(list)
        for j, rid in enumerate(self.representatives):
            for n in self.R[rid]["outputs"]:
                self._by[self._node_index[n]].append(j)
        self._relevant = {}
        self._cache = {}
        self.stats = dict(queries=0, cache_hits=0, searches=0,
                          search_states=0, max_query_states=0,
                          cyclic_or_unexecutable_leaves_rejected=0)
        self.algorithm = ("Exact single-target branch-and-bound regression over "
                          "reaction unions; forward executable closure; all "
                          "co-products retained; no beam or greedy-input heuristic")
        self.closed_stock_nodes = self.closure(self.stock)
        self.closed_stock_reactions = frozenset(
            r for r in self.representatives
            if set(self.R[r].get("inputs", [])) <= self.closed_stock_nodes)

    def _mask(self, ids: Iterable[str]) -> int:
        z = 0
        for n in ids:
            if n not in self._node_bit:
                raise KeyError(f"Unknown molecular inventory node: {n}")
            z |= self._node_bit[n]
        return z

    @staticmethod
    def _bits(mask: int):
        while mask:
            bit = mask & -mask
            yield bit.bit_length() - 1
            mask ^= bit

    def _nodes(self, mask: int) -> frozenset[str]:
        return frozenset(self._node_ids[j] for j in self._bits(mask))

    def _ancestry(self, target: str):
        if target in self._relevant:
            return self._relevant[target]
        todo = [self._node_index[target]]
        seen = set()
        rset = set()
        nm = self._node_bit[target]
        while todo:
            k = todo.pop()
            if k in seen or (self._stock_mask >> k) & 1:
                continue
            seen.add(k)
            for j in self._by[k]:
                if j in rset:
                    continue
                rset.add(j)
                nm |= self._rin[j] | self._rout[j]
                todo.extend(self._bits(self._rin[j]))
        self._relevant[target] = (frozenset(rset), nm)
        return self._relevant[target]

    def _forward_selected(self, selected: int, available: int):
        """Return executable prefix, available molecules, and blocked operations."""
        pending = set(self._bits(selected))
        order = []
        while pending:
            ready = sorted(j for j in pending
                           if self._rin[j] & ~available == 0)
            if not ready:
                break
            for j in ready:
                available |= self._rout[j]
                pending.remove(j)
                order.append(j)
        return order, available, pending

    def _schedule(self, selected: int, available: int):
        order, after, blocked = self._forward_selected(selected, available)
        return None if blocked else (order, after)

    def closure(self, available: Iterable[str]) -> frozenset[str]:
        """Forward reachability under *all* viable representative operations."""
        av = self._stock_mask | self._mask(available)
        pending = set(range(len(self.representatives)))
        while pending:
            ready = [j for j in pending if self._rin[j] & ~av == 0]
            if not ready:
                break
            for j in ready:
                av |= self._rout[j]
                pending.remove(j)
        return self._nodes(av)

    def plan(self, target_node: str,
             available: Iterable[str] = ()) -> Optional[RoutePlan]:
        self.stats["queries"] += 1
        target = self._node_bit[target_node]
        av = self._stock_mask | self._mask(available)
        if target & av:
            return RoutePlan(0, (), frozenset(), target_node)
        relevant, nm = self._ancestry(target_node)
        # Irrelevant inventory cannot change the route or its cache entry.
        av &= nm | self._stock_mask
        key = (target_node, av & nm)
        if key in self._cache:
            self.stats["cache_hits"] += 1
            return self._cache[key]
        self.stats["searches"] += 1

        # Eliminate unreachable operations using a *forward* closure from the
        # actual supplied inventory.  A source-free cycle never becomes viable.
        reach = av
        pending = set(relevant)
        closed = set()
        while pending:
            ready = [j for j in pending if self._rin[j] & ~reach == 0]
            if not ready:
                break
            for j in ready:
                reach |= self._rout[j]
                closed.add(j)
                pending.remove(j)
        if not target & reach:
            self._cache[key] = None
            return None
        by = {k: tuple(j for j in js if j in closed)
              for k, js in self._by.items()}
        best_cost = math.inf
        best_ids = None
        best_selected = None
        visited = set()
        states = 0
        rejected = 0

        def search(needs: int, made: int, selected: int, cost: int):
            nonlocal best_cost, best_ids, best_selected, states, rejected
            needs &= ~(av | made)
            if cost > best_cost or (needs and cost >= best_cost):
                return
            context = (needs, selected)
            if context in visited:
                return
            visited.add(context)
            states += 1
            if self.max_states is not None and states > self.max_states:
                raise RoutePlanningLimit(
                    f"Exact planner exceeded {self.max_states} states for {target_node}")
            if not needs:
                order, after, blocked = self._forward_selected(selected, av)
                if blocked:
                    rejected += 1
                    # A future co-product may have hidden the starting molecule
                    # required by an earlier operation.  Rejecting this union
                    # alone is insufficient: an external preparation can break
                    # that dependency cycle (S->F; F->A; A->F+D).  Exhaustively
                    # add an outside producer for any blocked, actually absent
                    # input.  At least one such producer belongs to every
                    # executable completion of this reaction union.
                    missing = 0
                    for blocked_j in blocked:
                        missing |= self._rin[blocked_j] & ~after
                    repairs = set()
                    for missing_k in self._bits(missing):
                        repairs.update(j for j in by.get(missing_k, ())
                                       if not (selected >> j & 1))
                    for j in sorted(repairs, key=lambda jj: (self._rcost[jj],
                                                             self.representatives[jj])):
                        out = made | self._rout[j]
                        search(self._rin[j] & ~(av | out), out,
                               selected | (1 << j), cost + self._rcost[j])
                    return
                if not after & target:
                    raise AssertionError("A regression leaf did not produce its target")
                ids = tuple(self.representatives[j] for j in self._bits(selected))
                if (cost, ids) < (best_cost, best_ids or ()):
                    best_cost, best_ids, best_selected = cost, ids, selected
                return
            # Resolve the most constrained remaining molecule first.  This is a
            # search order only, not an approximation to the objective.
            k = min(self._bits(needs), key=lambda n: (len(by.get(n, ())), n))
            options = by.get(k, ())
            for j in sorted(options, key=lambda jj: (self._rcost[jj],
                                                     self.representatives[jj])):
                if selected >> j & 1:
                    continue
                out = made | self._rout[j]
                new_needs = (needs | self._rin[j]) & ~(av | out)
                search(new_needs, out, selected | (1 << j), cost + self._rcost[j])

        search(target, 0, 0, 0)
        self.stats["search_states"] += states
        self.stats["max_query_states"] = max(self.stats["max_query_states"], states)
        self.stats["cyclic_or_unexecutable_leaves_rejected"] += rejected
        if best_selected is None:
            # Forward closure established preparability, so a failure here would
            # be a planner bug, not missing patent evidence.
            raise AssertionError(f"No executable plan despite closure: {target_node}")
        order, after = self._schedule(best_selected, av)
        ids = tuple(self.representatives[j] for j in order)
        output_mask = 0
        for j in order:
            output_mask |= self._rout[j]
        answer = RoutePlan(int(best_cost), ids, self._nodes(output_mask), target_node)
        assert answer.cost == sum(self.R[r]["cost"] for r in answer.reactions)
        self._cache[key] = answer
        return answer

    def execute_plan(self, plan: RoutePlan, available: set[str]):
        """Execute a plan against real molecules, retaining every output.

        The caller normally replans immediately before execution.  For a stale
        quote, an operation whose *all* outputs are already available is skipped;
        its source ID alone never establishes an inventory discount.
        """
        available.update(self.stock)
        paid = []
        cost = 0
        for rid in plan.reactions:
            q = self.R[rid]
            if set(q["outputs"]) <= available:
                continue
            assert set(q.get("inputs", [])) <= available, (rid, "missing molecular input")
            available.update(q["outputs"])
            paid.append(rid)
            cost += int(q["cost"])
        assert plan.goal in available, (plan.goal, "not actually prepared")
        return cost, paid
