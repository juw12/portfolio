"""Townsfolk: server-run residents who make the town feel lived in.

They walk the public paths and the plaza, stop to look at the fountain, sit on the
plaza benches, greet players who come close and answer simple chat. Everything is
simulated on the server so every player sees the same people in the same places.

Daily life follows the town clock (the server's local time): each resident has a home
(one of the town houses), wakes up in the morning, goes home in the evening and is
indoors (not sent to clients) at night. Rosa the trader runs the market stall by day.

Coordinates are metres on the ground plane (x, z); ry is the facing angle used by the
client (forward = (sin ry, cos ry)). Keep the bench layout in sync with
public/scenery.js (4 benches, radius 8.5, on the diagonals, facing the fountain).
"""
import math
import random

# ---------------------------------------------------------------- layout (sync with client)
BENCH_RADIUS = 8.5
BENCH_SEAT_OFFSET = 0.4      # two seats per 1.6 m bench, either side of the centre
SEAT_APPROACH = 0.75         # where people stand before sitting down (in front of the seat)
OUTER_RING_RADIUS = 11.5     # walking loop inside the street lamps (lamps at 12.8)
INNER_RING_RADIUS = 6.2      # walking loop between fountain (3.6) and benches (8.5)
PATH_STOPS = (18.0, 28.0, 38.0, 48.0, 58.0, 66.0)
LANE_OFFSET = 0.6            # people keep to the right of a path

# ---------------------------------------------------------------- behaviour
WALK_SPEED_RANGE = (1.15, 1.5)   # m/s, ordinary walking pace
SIT_SECONDS = (18.0, 45.0)
FOUNTAIN_SECONDS = (6.0, 14.0)
PAUSE_SECONDS = (1.5, 5.0)
GREET_DISTANCE = 4.0
GREET_COOLDOWN_S = 90.0
REPLY_DISTANCE = 6.0
SMALL_TALK_EVERY_S = (25.0, 60.0)
MAX_STEP_S = 0.5                 # long gaps (nobody online) do not teleport people

# ---------------------------------------------------------------- daily schedule (town clock hours)
WAKE_HOURS = (6.3, 8.3)          # each resident gets their own wake-up time in this range
BED_HOURS = (21.0, 23.3)
NIGHT_OWL_BED = 24.8             # Omar stays out until ~00:50
DOOR_STEP = 1.1                  # metres in front of the door where people appear / vanish
MARKET_X = -9.475                # keep in sync with economy.MARKET_X / MARKET_Z
MARKET_Z = -9.475
TRADER = ("Rosa", "#b5543c")
TRADER_HOURS = (7.5, 19.5)       # Rosa stands behind the counter during these hours
TRADER_BEHIND = 0.55             # metres behind the stall centre (the counter is in front)
TRADER_SIDE = 2.1                # walk round the end of the counter
TRADE_REPLY_DISTANCE = 8.0

RESIDENTS = [
    ("Mara", "#c0392b"),
    ("Tomas", "#2e86de"),
    ("Ines", "#8e44ad"),
    ("Kofi", "#27ae60"),
    ("Yuki", "#f39c12"),
    ("Lena", "#16a085"),
    ("Omar", "#d35400"),
    ("Priya", "#e84393"),
]

GREETINGS = [
    "Hi {name}!",
    "Hello, {name}!",
    "Good to see you, {name}.",
    "Hey {name}, welcome to town!",
]
SMALL_TALK = [
    "Lovely day for a walk.",
    "Free plots are outside the square. Your first one costs nothing.",
    "Bread sells for much more than wheat. An oven pays for itself.",
    "A sawmill turns wood into planks. Builders always need planks.",
    "Invite a friend to build on your plot: type /invite and their name.",
    "The fountain is beautiful at night.",
    "Have you watched the sunset over the mountains?",
    "I heard someone is building a tower out east.",
    "These benches are the best seats in town.",
    "Say hi to the neighbours. Everyone here is friendly.",
]
REPLIES = [
    (("hello", "hi", "hey", "morning", "evening"), "Hi {name}! Nice to meet you."),
    (("how are you", "how r u", "how's it going"), "Doing well, thanks for asking, {name}!"),
    (("plot", "land", "claim"), "Walk outside the square and claim a plot. Your first one is free."),
    (("market", "sell", "price", "coins", "money"), "Rosa buys goods at the market stall. Prices drop if everyone sells the same thing."),
    (("build", "house", "make"), "Claim a plot first, then open Build to place blocks, walls and more."),
    (("name", "who are you"), "I'm {npc}. I've lived here since the fountain was built."),
    (("bye", "see you", "later"), "See you around, {name}!"),
    (("thanks", "thank you"), "Any time, {name}."),
]


TRADER_TALK = [
    "Fresh prices today! Wheat, wood, stone, bread and planks.",
    "Bread is selling well this morning.",
    "Planks are in demand. Somebody must be building!",
    "Sell a little at a time and you'll get better prices.",
]
TRADE_THANKS = [
    "Thank you, {name}!",
    "Pleasure doing business, {name}.",
    "Good choice, {name}. Come again!",
]
EVENING_TALK = [
    "Getting late. I'll head home soon.",
    "The lamps look lovely in the evening.",
]


def default_local_hour(now):
    """Hours since local midnight on the server (the shared town clock)."""
    import time

    moment = time.localtime(now)
    return moment.tm_hour + moment.tm_min / 60 + moment.tm_sec / 3600


def front_door(house):
    """Point just outside the door of a town house (the door faces the square, as in scenery.js)."""
    x, z = house["x"], house["z"]
    length = math.hypot(x, z) or 1.0
    to_centre = (-x / length, -z / length)
    faces = [
        (0.0, 1.0, house["depth"] / 2),
        (0.0, -1.0, house["depth"] / 2),
        (1.0, 0.0, house["width"] / 2),
        (-1.0, 0.0, house["width"] / 2),
    ]
    nx, nz, half = max(faces, key=lambda face: face[0] * to_centre[0] + face[1] * to_centre[1])
    return (x + nx * (half + DOOR_STEP), z + nz * (half + DOOR_STEP))


def segment_hits_houses(start, end, houses, margin=0.3):
    """True if the straight walk from start to end passes through a house footprint."""
    steps = max(2, int(math.dist(start, end) / 0.25))
    for i in range(steps + 1):
        t = i / steps
        px = start[0] + (end[0] - start[0]) * t
        pz = start[1] + (end[1] - start[1]) * t
        for house in houses:
            if abs(px - house["x"]) < house["width"] / 2 + margin and abs(pz - house["z"]) < house["depth"] / 2 + margin:
                return True
    return False


def stall_spots():
    """Where the trader stands (behind the counter, facing the fountain) and the walk round its end."""
    ry = math.atan2(-MARKET_X, -MARKET_Z)
    forward = (math.sin(ry), math.cos(ry))
    right = (math.cos(ry), -math.sin(ry))
    spot = (MARKET_X - forward[0] * TRADER_BEHIND, MARKET_Z - forward[1] * TRADER_BEHIND)
    side = (spot[0] + right[0] * TRADER_SIDE, spot[1] + right[1] * TRADER_SIDE)
    return spot, side, ry


def bench_seats():
    """Two seats per plaza bench: position, facing (towards the fountain) and approach point."""
    seats = []
    for bench in range(4):
        angle = bench * (math.pi / 2) + math.pi / 4
        bench_x = math.cos(angle) * BENCH_RADIUS
        bench_z = math.sin(angle) * BENCH_RADIUS
        ry = math.atan2(-bench_x, -bench_z)
        for side in (-1, 1):
            local_x = side * BENCH_SEAT_OFFSET
            local_z = 0.02
            x = bench_x + local_x * math.cos(ry) + local_z * math.sin(ry)
            z = bench_z - local_x * math.sin(ry) + local_z * math.cos(ry)
            seats.append({
                "id": f"bench{bench}{'L' if side < 0 else 'R'}",
                "x": x,
                "z": z,
                "ry": ry,
                "approach": (x + math.sin(ry) * SEAT_APPROACH, z + math.cos(ry) * SEAT_APPROACH),
                "ring_node": f"inner{2 * bench + 1}",  # inner-ring node on the same diagonal
            })
    return seats


def build_walk_graph():
    """Nodes (name -> (x, z)) and undirected edges along paths, plaza loops and to the benches."""
    nodes = {}
    edges = {}

    def link(a, b):
        edges.setdefault(a, set()).add(b)
        edges.setdefault(b, set()).add(a)

    for k in range(8):
        angle = k * math.pi / 4
        nodes[f"outer{k}"] = (math.cos(angle) * OUTER_RING_RADIUS, math.sin(angle) * OUTER_RING_RADIUS)
        nodes[f"inner{k}"] = (math.cos(angle) * INNER_RING_RADIUS, math.sin(angle) * INNER_RING_RADIUS)
    for k in range(8):
        link(f"outer{k}", f"outer{(k + 1) % 8}")
        link(f"inner{k}", f"inner{(k + 1) % 8}")
    for k in (0, 2, 4, 6):  # spokes along the four paths (benches sit on the diagonals)
        link(f"outer{k}", f"inner{k}")

    for k in (0, 2, 4, 6):
        angle = k * math.pi / 4
        previous = f"outer{k}"
        for distance in PATH_STOPS:
            name = f"path{k}_{int(distance)}"
            nodes[name] = (round(math.cos(angle) * distance, 6), round(math.sin(angle) * distance, 6))
            link(previous, name)
            previous = name

    for seat in bench_seats():
        name = f"seat_{seat['id']}"
        nodes[name] = seat["approach"]
        link(name, seat["ring_node"])
    return nodes, edges


def shortest_route(edges, nodes, start, goal):
    """Dijkstra over the small walk graph; returns the node list from start to goal."""
    best = {start: 0.0}
    previous = {}
    frontier = [(0.0, start)]
    while frontier:
        frontier.sort()
        cost, node = frontier.pop(0)
        if node == goal:
            break
        if cost > best.get(node, math.inf):
            continue
        for neighbour in edges.get(node, ()):
            step = math.dist(nodes[node], nodes[neighbour])
            if cost + step < best.get(neighbour, math.inf):
                best[neighbour] = cost + step
                previous[neighbour] = node
                frontier.append((cost + step, neighbour))
    if goal != start and goal not in previous:
        return [start]
    route = [goal]
    while route[-1] != start:
        route.append(previous[route[-1]])
    return list(reversed(route))


class TownLife:
    def __init__(self, seed=7, count=len(RESIDENTS), houses=None, local_hour=None, trader=True):
        """`houses` are the server's town houses (homes); `local_hour(now)` is the town clock.
        Without a clock it is always midday, so tests are deterministic."""
        self._rng = random.Random(seed)
        self._local_hour = local_hour or (lambda now: 12.0)
        self.nodes, self.edges = build_walk_graph()
        self.seats = {seat["id"]: seat for seat in bench_seats()}
        self.seat_taken = {}
        self.people = []
        start_nodes = [n for n in self.nodes if n.startswith(("outer", "path"))]
        self.homes = self._add_homes(houses or [])
        self.stall_ry = self._add_stall()
        residents = list(RESIDENTS[:count]) + ([TRADER] if trader else [])
        for index, (name, color) in enumerate(residents):
            node = start_nodes[(index * 5) % len(start_nodes)]
            x, z = self.nodes[node]
            person = {
                "id": f"npc-{name.lower()}",
                "name": name,
                "color": color,
                "x": x,
                "z": z,
                "ry": 0.0,
                "node": node,
                "route": [],
                "speed": self._rng.uniform(*WALK_SPEED_RANGE),
                "activity": "pause",
                "until": 0.0,
                "seat": None,
                "bubble": "",
                "bubbleAt": 0.0,
                "greeted": {},
                "nextTalk": self._rng.uniform(*SMALL_TALK_EVERY_S),
                "trader": trader and index == len(residents) - 1,
                "home": f"home{index % len(self.homes)}" if self.homes else None,
                "wake": self._rng.uniform(*WAKE_HOURS),
                "bed": NIGHT_OWL_BED if name == "Omar" else self._rng.uniform(*BED_HOURS),
            }
            self.people.append(person)
        self._clock = None
        self.hour = 12.0

    # ------------------------------------------------------------ places
    def _link_nearest(self, name, point, houses=()):
        """Connect a new node to the nearest public node it can walk to in a straight line."""
        candidates = sorted(
            (n for n in self.nodes if n.startswith(("outer", "path"))),
            key=lambda n: math.dist(self.nodes[n], point),
        )
        for candidate in candidates:
            if not segment_hits_houses(self.nodes[candidate], point, houses):
                break
        else:
            candidate = candidates[0]
        self.edges.setdefault(name, set()).add(candidate)
        self.edges.setdefault(candidate, set()).add(name)

    def _add_homes(self, houses):
        homes = []
        for index, house in enumerate(houses):
            name = f"home{index}"
            self.nodes[name] = front_door(house)
            self._link_nearest(name, self.nodes[name], houses)
            homes.append(name)
        return homes

    def _add_stall(self):
        spot, side, ry = stall_spots()
        self.nodes["stall_side"] = side
        self.nodes["stall"] = spot
        self.edges.setdefault("stall", set()).add("stall_side")
        self.edges.setdefault("stall_side", set()).add("stall")
        self._link_nearest("stall_side", side)
        return ry

    # ------------------------------------------------------------ schedule
    @staticmethod
    def _awake(person, hour):
        bed = person["bed"]
        if bed >= 24:
            return hour >= person["wake"] or hour < bed - 24
        return person["wake"] <= hour < bed

    def _should_be_home(self, person, hour):
        return bool(person["home"]) and not self._awake(person, hour)

    def _is_working(self, person, hour):
        return person["trader"] and TRADER_HOURS[0] <= hour < TRADER_HOURS[1] and self._awake(person, hour)

    def trader(self):
        return next((p for p in self.people if p["trader"]), None)

    # ------------------------------------------------------------ public API
    def update(self, now, players):
        """Advance the simulation to `now`. `players` maps id -> real player dicts."""
        if self._clock is None:
            self._clock = now
            for person in self.people:
                person["until"] = now + self._rng.uniform(0.0, 3.0)
                person["nextTalk"] += now
        dt = min(max(now - self._clock, 0.0), MAX_STEP_S)
        self._clock = now
        self.hour = self._local_hour(now) % 24
        for person in self.people:
            self._step(person, dt, now)
            if person["activity"] != "home":
                self._social(person, now, players)

    def on_player_chat(self, player, text, now):
        """A nearby resident answers simple questions and greetings."""
        lowered = text.lower()
        nearby = [
            p for p in self.people
            if p["activity"] != "home"
            and math.dist((p["x"], p["z"]), (player["x"], player["z"])) <= REPLY_DISTANCE
        ]
        if not nearby:
            return
        addressed = [p for p in nearby if p["name"].lower() in lowered]
        person = addressed[0] if addressed else min(
            nearby, key=lambda p: math.dist((p["x"], p["z"]), (player["x"], player["z"]))
        )
        for keywords, reply in REPLIES:
            if any(keyword in lowered for keyword in keywords):
                self._say(person, reply.format(name=player["name"], npc=person["name"]), now)
                self._face(person, player["x"], player["z"])
                return
        if addressed:
            self._say(person, f"Yes, {player['name']}?", now)
            self._face(person, player["x"], player["z"])

    def on_trade(self, player, sold_or_bought, now):
        """Rosa thanks people who trade at her stall while she is working."""
        trader = self.trader()
        if not sold_or_bought or trader is None or trader["activity"] != "trade":
            return
        if math.dist((trader["x"], trader["z"]), (player["x"], player["z"])) > TRADE_REPLY_DISTANCE:
            return
        self._say(trader, self._rng.choice(TRADE_THANKS).format(name=player["name"]), now)

    def states(self, now, bubble_duration):
        result = []
        for person in self.people:
            if person["activity"] == "home":
                continue  # indoors for the night
            bubble_active = now - person["bubbleAt"] < bubble_duration
            result.append({
                "id": person["id"],
                "name": person["name"],
                "color": person["color"],
                "x": round(person["x"], 3),
                "y": 0.0,
                "z": round(person["z"], 3),
                "ry": round(person["ry"], 3),
                "moving": person["activity"] == "walk",
                "pose": "sit" if person["activity"] == "sit" else "stand",
                "npc": True,
                "bubble": person["bubble"] if bubble_active else "",
            })
        return result

    # ------------------------------------------------------------ behaviour
    def _step(self, person, dt, now):
        activity = person["activity"]
        hour = self.hour
        if activity == "home":
            if not self._should_be_home(person, hour):
                self._choose_destination(person, now)  # good morning: out of the door
            return
        if activity == "walk":
            self._walk(person, dt, now)
            return
        if activity == "trade":
            if not self._is_working(person, hour):
                self._choose_destination(person, now)  # closing time
            return
        due_elsewhere = self._should_be_home(person, hour) or self._is_working(person, hour)
        if now < person["until"] and not due_elsewhere:
            return
        if activity == "sit":
            self._stand_up(person)
        self._choose_destination(person, now)

    def _choose_destination(self, person, now):
        if self._should_be_home(person, self.hour):
            self._route_to(person, person["home"], now)
            return
        if self._is_working(person, self.hour):
            self._route_to(person, "stall", now)
            return
        roll = self._rng.random()
        free_seats = [s for s in self.seats if s not in self.seat_taken]
        if roll < 0.3 and free_seats:
            seat_id = self._rng.choice(free_seats)
            self.seat_taken[seat_id] = person["id"]
            person["seat"] = seat_id
            goal = f"seat_{seat_id}"
        elif roll < 0.5:
            goal = f"inner{self._rng.choice((0, 2, 4, 6))}"
        elif roll < 0.85:
            goal = self._rng.choice([n for n in self.nodes if n.startswith("path")])
        else:
            goal = f"outer{self._rng.randrange(8)}"
        self._route_to(person, goal, now)

    def _route_to(self, person, goal, now):
        route = shortest_route(self.edges, self.nodes, person["node"], goal)
        person["route"] = route[1:]
        person["goal"] = goal
        person["activity"] = "walk" if person["route"] else "pause"
        if not person["route"]:
            self._arrive(person, now)

    def _walk(self, person, dt, now):
        remaining = person["speed"] * dt
        while remaining > 0 and person["route"]:
            target_node = person["route"][0]
            from_x, from_z = self.nodes[person["node"]]
            to_x, to_z = self.nodes[target_node]
            seg_x, seg_z = to_x - from_x, to_z - from_z
            length = math.hypot(seg_x, seg_z) or 1.0
            # keep right: lane offset perpendicular to the segment (fades out near nodes)
            right_x, right_z = -seg_z / length, seg_x / length
            goal_x = to_x + right_x * LANE_OFFSET * 0.5
            goal_z = to_z + right_z * LANE_OFFSET * 0.5
            if not person["route"][1:] and target_node.startswith(("seat_", "inner", "home", "stall")):
                goal_x, goal_z = to_x, to_z  # stop exactly at seats and viewing spots
            dx, dz = goal_x - person["x"], goal_z - person["z"]
            distance = math.hypot(dx, dz)
            if distance <= remaining:
                person["x"], person["z"] = goal_x, goal_z
                remaining -= distance
                person["node"] = target_node
                person["route"].pop(0)
            else:
                person["x"] += dx / distance * remaining
                person["z"] += dz / distance * remaining
                remaining = 0
            if distance > 1e-6:
                person["ry"] = math.atan2(dx, dz)
        if not person["route"]:
            self._arrive(person, now)

    def _arrive(self, person, now):
        goal = person.get("goal", person["node"])
        if goal.startswith("seat_") and person["seat"]:
            seat = self.seats[person["seat"]]
            person["x"], person["z"], person["ry"] = seat["x"], seat["z"], seat["ry"]
            person["activity"] = "sit"
            person["until"] = now + self._rng.uniform(*SIT_SECONDS)
        elif goal.startswith("home") and person["node"] == goal:
            person["activity"] = "home"   # indoors until the morning
            person["bubble"] = ""
        elif goal == "stall" and person["node"] == "stall":
            person["x"], person["z"] = self.nodes["stall"]
            person["ry"] = self.stall_ry
            person["activity"] = "trade"
        elif goal.startswith("inner"):
            self._face(person, 0.0, 0.0)  # admire the fountain
            person["activity"] = "pause"
            person["until"] = now + self._rng.uniform(*FOUNTAIN_SECONDS)
        else:
            person["activity"] = "pause"
            person["until"] = now + self._rng.uniform(*PAUSE_SECONDS)

    def _stand_up(self, person):
        seat = self.seats.get(person["seat"])
        if seat:
            person["x"], person["z"] = seat["approach"]
            self.seat_taken.pop(person["seat"], None)
        person["seat"] = None

    # ------------------------------------------------------------ social
    def _social(self, person, now, players):
        for player in players.values():
            distance = math.dist((person["x"], person["z"]), (player["x"], player["z"]))
            if distance > GREET_DISTANCE:
                continue
            last = person["greeted"].get(player["id"], -math.inf)
            if now - last < GREET_COOLDOWN_S:
                continue
            person["greeted"][player["id"]] = now
            self._say(person, self._rng.choice(GREETINGS).format(name=player["name"]), now)
            if person["activity"] != "walk":
                self._face(person, player["x"], player["z"])
            return
        if now >= person["nextTalk"]:
            person["nextTalk"] = now + self._rng.uniform(*SMALL_TALK_EVERY_S)
            if person["activity"] != "walk" and players:
                if person["activity"] == "trade":
                    lines = TRADER_TALK
                elif self.hour >= 20 or self.hour < 5:
                    lines = EVENING_TALK
                else:
                    lines = SMALL_TALK
                self._say(person, self._rng.choice(lines), now)
        # forget greetings for players who left long ago
        if len(person["greeted"]) > 64:
            person["greeted"] = {pid: t for pid, t in person["greeted"].items() if now - t < GREET_COOLDOWN_S}

    def _say(self, person, text, now):
        person["bubble"] = text[:140]
        person["bubbleAt"] = now

    def _face(self, person, x, z):
        if person["activity"] == "sit":
            return  # stay facing forward on the bench
        dx, dz = x - person["x"], z - person["z"]
        if math.hypot(dx, dz) > 1e-6:
            person["ry"] = math.atan2(dx, dz)
