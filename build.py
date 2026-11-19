"""Build the offline board and synchronized replay from the frozen campaigns."""
import gzip
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "src"
OUT = ROOT / "dist"


def source(name):
    return (SOURCE / name).read_text(encoding="utf-8")


def inline_json(value):
    return json.dumps(value, separators=(",", ":")).replace("<", r"\u003c")


def build():
    datasets = {field: {} for field in ("boards", "native")}
    for path in sorted((ROOT / "data").glob("*.json.gz")):
        key = path.name.split(".")[0]
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            campaign = json.load(stream)
        for field in datasets:
            datasets[field][key] = campaign[field]

    OUT.mkdir(exist_ok=True)
    game = source("world.html").replace("__ENGINE__", source("engine.js"))
    world = source("world.js")
    board = game.replace("__WORLD__", world).replace("__LEVELS__", inline_json(datasets["boards"]))
    (OUT / "medicinal_chemistry_world_map.html").write_text(board, encoding="utf-8")

    board_logic, startup, _ = world.rpartition("\nconst [startKey,startError,startCut]=")
    if not startup:
        raise ValueError("Missing standalone board entry point")
    datasets["draws"] = {key: json.loads((ROOT / "data" / (key + ".draws.json")).read_text()) for key in datasets["boards"]}
    datasets["gameTemplate"] = game.replace("__WORLD__", board_logic + "\n" + source("game_embed.js"))
    datasets["brainTemplate"] = source("replay.html").replace("__DEMO_SCRIPT__", source("replay.js"))
    logic = "\n".join(source(name) for name in ("engine.js", "strategy_play.js", "native_movie.js"))
    story_logic = "\n".join(source(name) for name in ("engine.js", "strategy_play.js", "story.js"))
    for key, level in datasets["boards"].items():
        story_data = {"board": level, "draws": datasets["draws"][key]}
        story = source("story.html").replace("__TARGET__", key).replace("__DATA__", inline_json(story_data)).replace("__LOGIC__", story_logic)
        (OUT / (key + "_intro.html")).write_text(story, encoding="utf-8")
    renin = datasets["native"]["RENIN"]
    renin["openingInventory"] = renin.pop("archivedPaths")["forward"][0]["inventory"]
    movie = source("movie.html").replace("__DATA__", inline_json(datasets)).replace("__SCENE__", logic)
    (OUT / "strategy_movie.html").write_text(movie, encoding="utf-8")
    for path in (ROOT / "media").iterdir():
        if path.suffix not in (".mp4", ".pdf"):
            continue
        shutil.copyfile(path, OUT / path.name)


if __name__ == "__main__":
    build()
