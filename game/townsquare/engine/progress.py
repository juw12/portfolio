"""Levels and XP: everything productive you do in town fills a bar; each level pays coins and
can give a new title on your name tag. Early levels come fast, later ones take real play.

XP for going from level L to L+1 is LEVEL_BASE + LEVEL_GROWTH * L (60 XP for level 2, 80 for 3, ...).
"""

XP = {
    "collect": 2,     # per unit harvested
    "sell": 1,        # per unit sold
    "producer": 15,   # building a producer
    "claim": 20,      # claiming / buying a plot
    "order": 40,      # filling Rosa's daily order
    "goal": 25,       # finishing a goal
    "star": 10,       # someone stars your plot (first time per new high)
}
LEVEL_BASE = 40
LEVEL_GROWTH = 20
MAX_LEVEL = 50
COINS_PER_LEVEL = 10  # reaching level L pays L * 10 coins
FEED_FROM_LEVEL = 5   # level-ups from here on are announced in the town feed
TITLES = [
    (1, "Newcomer"),
    (3, "Farmer"),
    (5, "Craftsperson"),
    (8, "Merchant"),
    (12, "Builder"),
    (16, "Tycoon"),
    (20, "Town elder"),
    (30, "Legend"),
]


def xp_to_next(level):
    return LEVEL_BASE + LEVEL_GROWTH * level


def level_for(xp):
    """(level, xp into that level) for a lifetime XP total."""
    level = 1
    remaining = max(0, int(xp))
    while level < MAX_LEVEL and remaining >= xp_to_next(level):
        remaining -= xp_to_next(level)
        level += 1
    return level, remaining


def title_for(level):
    title = TITLES[0][1]
    for needed, name in TITLES:
        if level >= needed:
            title = name
    return title


def public_level(xp):
    level, into = level_for(xp)
    return {
        "level": level,
        "title": title_for(level),
        "xp": int(xp),
        "into": into,
        "need": xp_to_next(level) if level < MAX_LEVEL else 0,
    }
