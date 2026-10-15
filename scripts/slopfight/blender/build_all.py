"""Build every SlopFight GLB, verify the node contract, optionally render.

    python scripts/slopfight/blender/build_all.py [--render] [--only garage,kitchen,rooftop,props]

Runs each build script in its own headless Blender (factory settings, so
nothing from a user profile leaks in), then verify_glb.py on the results,
then render_previews.py when --render is given. Set BLENDER to the Blender
executable if it is not at the default Windows install path.
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.environ.get("BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
STEPS = {"garage": "build_garage.py", "kitchen": "build_kitchen.py", "rooftop": "build_rooftop.py",
         "props": "build_props.py"}


def blender(script, *args):
    cmd = [BLENDER, "--background", "--factory-startup", "--python-exit-code", "1",
           "--python", os.path.join(HERE, script)]
    if args:
        cmd += ["--"] + list(args)
    print(">>", " ".join(os.path.basename(c) if c.endswith(".py") else c for c in cmd[1:]), flush=True)
    out = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    keep = ("ARENA", "EXPORTED", "TRIS", "PROP ", "AO ", "SHEET", "RENDERED", "VERIFY", "FAIL", "Error", "Traceback",
            "CONTRACT", "  -")
    for line in out.stdout.splitlines() + out.stderr.splitlines():
        if line.startswith(keep) or any(k in line for k in ("Error", "Traceback", "FAIL")):
            print("   ", line)
    return out.returncode


def main():
    argv = sys.argv[1:]
    only = list(STEPS)
    if "--only" in argv:
        only = argv[argv.index("--only") + 1].split(",")
    bad = blender("verify_geometry.py") != 0
    bad |= blender("verify_ambient.py") != 0
    for name in only:
        bad |= blender(STEPS[name]) != 0
    out_dir = os.path.normpath(os.path.join(HERE, "..", "..", "..", "public", "models", "slopfight"))
    files = [os.path.join(out_dir, n + ".glb") for n in only]
    bad |= blender("verify_glb.py", *files) != 0
    if "--render" in argv:
        bad |= blender("render_previews.py", *files) != 0
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
