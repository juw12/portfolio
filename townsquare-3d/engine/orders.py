"""Rosa's daily order: once per town day the trader wants a batch of one good and pays a premium.

Everyone may fill it once per day. The order is derived from the date alone, so every player
(and every server restart) sees the same order for the same day.
"""
import random
import time

import economy

ORDER_BATCHES = {"wheat": 12, "wood": 10, "stone": 8, "bread": 6, "planks": 6}
ORDER_PREMIUM = 1.6  # x base price for the whole batch


def default_town_day(now):
    """The town day as YYYY-MM-DD in server local time."""
    return time.strftime("%Y-%m-%d", time.localtime(now))


def order_for_day(day):
    rng = random.Random(f"rosa-order:{day}")
    item = rng.choice(sorted(ORDER_BATCHES))
    qty = ORDER_BATCHES[item]
    return {
        "day": day,
        "item": item,
        "label": economy.GOODS[item]["label"],
        "qty": qty,
        "pay": round(qty * economy.GOODS[item]["base"] * ORDER_PREMIUM),
    }
