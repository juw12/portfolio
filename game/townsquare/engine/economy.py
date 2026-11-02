"""Townsquare 3D economy: wallets, producers (the world's production function) and the market.

Production rule for every producer (settled lazily on the server whenever someone collects):

    cycles = floor(elapsed / cycle_seconds)
    made   = min(cycles, cap - stock, cycles the input hopper can feed)

Unused time carries over while the producer is running; when it is full or out of inputs the
clock restarts, so an idle producer never makes goods retroactively.

Market prices respond to supply and demand: every unit sold pushes the price down by a small
factor, every unit bought pushes it up, and the pressure decays back to zero with a half-life.
"""

import math

STARTING_COINS = 100
MAX_GOOD_STACK = 999
MAX_COINS = 10_000_000

# type -> what it makes. Keep in sync with PRODUCERS in public/buildables.js.
PRODUCERS = {
    "field": {"output": "wheat", "seconds": 60, "cap": 6, "inputs": {}},
    "woodlot": {"output": "wood", "seconds": 90, "cap": 4, "inputs": {}},
    "quarry": {"output": "stone", "seconds": 120, "cap": 4, "inputs": {}},
    "oven": {"output": "bread", "seconds": 45, "cap": 6, "inputs": {"wheat": 2}},
    "sawmill": {"output": "planks", "seconds": 40, "cap": 6, "inputs": {"wood": 1}},
}
MAX_PRODUCERS_PER_OWNER = 40

# Coins charged when placing; refunded to whoever paid when the object is removed.
BUILD_COSTS = {
    "block": 1, "slab": 1, "wall": 2, "glass": 3, "lamp": 5, "tree": 3, "flower": 1, "bench": 6,
    "field": 10, "woodlot": 15, "quarry": 25, "oven": 60, "sawmill": 60,
}

# Land: price of your 1st, 2nd, 3rd, 4th plot.
PLOT_PRICES = (0, 250, 600, 1200)

GOODS = {
    "wheat": {"label": "Wheat", "base": 3.0},
    "wood": {"label": "Wood", "base": 4.0},
    "stone": {"label": "Stone", "base": 6.0},
    "bread": {"label": "Bread", "base": 9.0},
    "planks": {"label": "Planks", "base": 7.0},
}
PRICE_SENSITIVITY = 60.0      # pressure units for a factor e change in price
PRICE_HALF_LIFE_S = 600.0     # market recovers in ~10 minutes
PRICE_FLOOR = 0.3             # x base
PRICE_CEILING = 2.0           # x base
BUY_MARKUP = 1.3              # the trader sells for more than they pay
MAX_TRADE_QTY = 99

# Market stall on the plaza (south-west diagonal, between two street lamps, facing the fountain).
MARKET_ANGLE = 5 * math.pi / 4
MARKET_RADIUS = 13.4             # on the paving (plaza paving radius 14, lamps at 12.8)
MARKET_X = round(math.cos(MARKET_ANGLE) * MARKET_RADIUS, 3)
MARKET_Z = round(math.sin(MARKET_ANGLE) * MARKET_RADIUS, 3)
MARKET_REACH = 5.0            # how close you must be to trade
COLLECT_REACH = 3.5           # how close you must be to a producer to collect


def new_wallet():
    return {"coins": STARTING_COINS, "goods": {}}


def clean_wallet(raw):
    if not isinstance(raw, dict):
        return new_wallet()
    goods = {}
    raw_goods = raw.get("goods") if isinstance(raw.get("goods"), dict) else {}
    for item, count in raw_goods.items():
        if item in GOODS:
            value = _to_int(count, 0, MAX_GOOD_STACK)
            if value:
                goods[item] = value
    return {"coins": _to_int(raw.get("coins"), 0, MAX_COINS, STARTING_COINS), "goods": goods}


def _to_int(value, low, high, default=0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return int(max(low, min(high, number)))


def build_cost(object_type):
    return BUILD_COSTS.get(object_type, 0)


def plot_price(plots_owned):
    if plots_owned >= len(PLOT_PRICES):
        return None
    return PLOT_PRICES[plots_owned]


# ---------------------------------------------------------------------------- producers
def init_producer(obj, now):
    """Give a freshly placed producer its state (empty, clock starting now)."""
    if obj["type"] in PRODUCERS:
        obj["stock"] = 0
        obj["hopper"] = {}
        obj["since"] = round(now, 3)
    return obj


def clean_producer_state(obj, raw, now):
    """Restore producer state from a trusted save file."""
    spec = PRODUCERS.get(obj["type"])
    if not spec:
        return obj
    obj["stock"] = _to_int(raw.get("stock"), 0, spec["cap"])
    hopper = {}
    raw_hopper = raw.get("hopper") if isinstance(raw.get("hopper"), dict) else {}
    for item, need in spec["inputs"].items():
        value = _to_int(raw_hopper.get(item), 0, need * spec["cap"])
        if value:
            hopper[item] = value
    obj["hopper"] = hopper
    since = raw.get("since")
    obj["since"] = round(float(since), 3) if isinstance(since, (int, float)) and math.isfinite(since) else round(now, 3)
    return obj


def settle(obj, now):
    """Advance a producer to `now`. Returns how many units were made."""
    spec = PRODUCERS[obj["type"]]
    stock = obj.get("stock", 0)
    hopper = obj.setdefault("hopper", {})
    since = obj.get("since", now)
    cycles = int(max(0.0, now - since) // spec["seconds"])
    feedable = min(
        (hopper.get(item, 0) // need for item, need in spec["inputs"].items()),
        default=cycles,
    )
    made = max(0, min(cycles, spec["cap"] - stock, feedable))
    for item, need in spec["inputs"].items():
        left = hopper.get(item, 0) - need * made
        if left > 0:
            hopper[item] = left
        else:
            hopper.pop(item, None)
    obj["stock"] = stock + made
    if made == cycles:
        obj["since"] = round(since + made * spec["seconds"], 3)  # keep partial progress
    else:
        obj["since"] = round(now, 3)  # it was full or starved: the clock restarts now
    return made


def collect(obj, wallet, now):
    """Settle, move output into the wallet and top up the input hopper from the wallet.

    Returns {"took": {item: n}, "loaded": {item: n}}.
    """
    spec = PRODUCERS[obj["type"]]
    settle(obj, now)
    took = {}
    goods = wallet["goods"]
    room = MAX_GOOD_STACK - goods.get(spec["output"], 0)
    amount = min(obj["stock"], room)
    if amount:
        goods[spec["output"]] = goods.get(spec["output"], 0) + amount
        obj["stock"] -= amount
        took[spec["output"]] = amount
        if obj["stock"] + amount >= spec["cap"]:
            obj["since"] = round(now, 3)  # it was full: restart the clock now there is room
    loaded = {}
    for item, need in spec["inputs"].items():
        hopper = obj["hopper"]
        space = need * spec["cap"] - hopper.get(item, 0)
        moved = min(space, goods.get(item, 0))
        if moved > 0:
            hopper[item] = hopper.get(item, 0) + moved
            goods[item] -= moved
            if not goods[item]:
                del goods[item]
            loaded[item] = moved
    return {"took": took, "loaded": loaded}


# ---------------------------------------------------------------------------- market
class Market:
    def __init__(self):
        self.pressure = {item: 0.0 for item in GOODS}
        self.at = None

    def load(self, raw, now):
        if isinstance(raw, dict) and isinstance(raw.get("pressure"), dict):
            for item in GOODS:
                value = raw["pressure"].get(item, 0.0)
                if isinstance(value, (int, float)) and math.isfinite(value):
                    self.pressure[item] = max(-1000.0, min(1000.0, float(value)))
        self.at = now

    def dump(self):
        return {"pressure": {item: round(value, 3) for item, value in self.pressure.items()}}

    def _decay(self, now):
        if self.at is None:
            self.at = now
            return
        dt = max(0.0, now - self.at)
        if dt:
            factor = 0.5 ** (dt / PRICE_HALF_LIFE_S)
            for item in self.pressure:
                self.pressure[item] *= factor
            self.at = now

    @staticmethod
    def _unit_price(item, pressure):
        base = GOODS[item]["base"]
        factor = math.exp(-pressure / PRICE_SENSITIVITY)
        return base * max(PRICE_FLOOR, min(PRICE_CEILING, factor))

    def prices(self, now):
        self._decay(now)
        return {
            item: {
                "sell": round(self._unit_price(item, self.pressure[item]), 2),
                "buy": round(self._unit_price(item, self.pressure[item]) * BUY_MARKUP, 2),
            }
            for item in GOODS
        }

    def sell(self, wallet, item, qty, now):
        """Player sells to the trader. Returns coins received (0 if nothing happened)."""
        if item not in GOODS:
            return 0
        qty = min(_to_int(qty, 0, MAX_TRADE_QTY), wallet["goods"].get(item, 0))
        if qty <= 0:
            return 0
        self._decay(now)
        pressure = self.pressure[item]
        total = sum(self._unit_price(item, pressure + i) for i in range(qty))
        coins = int(total)  # the trader rounds down
        wallet["goods"][item] -= qty
        if not wallet["goods"][item]:
            del wallet["goods"][item]
        wallet["coins"] = min(MAX_COINS, wallet["coins"] + coins)
        self.pressure[item] = pressure + qty
        return coins

    def buy(self, wallet, item, qty, now):
        """Player buys from the trader. Returns coins spent (0 if they could not afford it)."""
        if item not in GOODS:
            return 0
        qty = min(_to_int(qty, 0, MAX_TRADE_QTY), MAX_GOOD_STACK - wallet["goods"].get(item, 0))
        if qty <= 0:
            return 0
        self._decay(now)
        pressure = self.pressure[item]
        total = sum(self._unit_price(item, pressure - i) * BUY_MARKUP for i in range(qty))
        coins = math.ceil(total - 1e-9)  # the trader rounds up
        if coins > wallet["coins"]:
            return 0
        wallet["coins"] -= coins
        wallet["goods"][item] = wallet["goods"].get(item, 0) + qty
        self.pressure[item] = pressure - qty
        return coins


def public_rules():
    """What the client needs to show costs, producer timers and the market."""
    return {
        "producers": PRODUCERS,
        "buildCosts": BUILD_COSTS,
        "plotPrices": list(PLOT_PRICES),
        "goods": {item: spec["label"] for item, spec in GOODS.items()},
        "market": {"x": MARKET_X, "z": MARKET_Z, "angle": MARKET_ANGLE, "reach": MARKET_REACH},
        "collectReach": COLLECT_REACH,
        "startingCoins": STARTING_COINS,
    }
