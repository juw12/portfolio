"""Goal chain: the "what do I do next?" ladder that pulls new players into the production loop.

Each person works through GOALS in order. A goal is met by an action (an event) or by the state of
their town (plots owned, coins saved, producers built). Finishing one pays its reward and the next
goal appears at once, so there is always a clear, rewarded next step.
"""

GOALS = [
    {"id": "claim", "text": "Claim your first plot", "reward": 20},
    {"id": "field", "text": "Build a wheat field on your plot", "reward": 15},
    {"id": "collect", "text": "Collect a harvest from a producer", "reward": 10},
    {"id": "sell", "text": "Sell goods to Rosa at the market", "reward": 15},
    {"id": "woodlot", "text": "Build a woodlot", "reward": 15},
    {"id": "oven", "text": "Build an oven to bake bread", "reward": 25},
    {"id": "sell_bread", "text": "Sell bread at the market", "reward": 30},
    {"id": "social", "text": "Add a friend or invite a co-builder", "reward": 20},
    {"id": "sawmill", "text": "Build a sawmill", "reward": 40},
    {"id": "plot2", "text": "Own a second plot", "reward": 60},
    {"id": "rich", "text": "Save up 1,000 coins", "reward": 150},
]
BUILD_GOALS = {"field", "woodlot", "oven", "sawmill"}  # goal id == producer type
FEED_FROM_STEP = 5                                    # later goals are announced in the town feed


def goal_met(goal_id, events, state):
    """`events`: list of (kind, detail, amount) since the last check; `state`: dict snapshot."""
    if goal_id == "claim":
        return state["plots"] >= 1
    if goal_id == "plot2":
        return state["plots"] >= 2
    if goal_id == "rich":
        return state["coins"] >= 1000
    if goal_id in BUILD_GOALS:
        return goal_id in state["producer_types"] or any(
            kind == "place" and detail == goal_id for kind, detail, _ in events
        )
    if goal_id == "collect":
        return any(kind == "collect" and amount > 0 for kind, _, amount in events)
    if goal_id == "sell":
        return any(kind == "sell" and amount > 0 for kind, _, amount in events)
    if goal_id == "sell_bread":
        return any(kind == "sell" and detail == "bread" and amount > 0 for kind, detail, amount in events)
    if goal_id == "social":
        return state["friends"] > 0 or any(kind == "social" for kind, _, _ in events)
    return False


def advance(index, events, state):
    """Return (new index, [goals completed]) after applying events/state. State goals can chain."""
    completed = []
    while 0 <= index < len(GOALS) and goal_met(GOALS[index]["id"], events, state):
        completed.append(GOALS[index])
        index += 1  # several goals can complete at once (e.g. claim + build in one moment)
    return index, completed


def public_goal(index):
    if not 0 <= index < len(GOALS):
        return None
    goal = GOALS[index]
    return {"id": goal["id"], "text": goal["text"], "reward": goal["reward"], "step": index + 1, "total": len(GOALS)}
