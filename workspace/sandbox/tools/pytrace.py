# Python execution tracer:  python3 pytrace.py <program.py> <stdin-file> [max_steps]
# Uses sys.settrace, the same hook debuggers use: Python calls our function on every
# line, function call, return, and exception inside the learner's file.
# Prints one JSON document between markers on stdout.
import builtins
import io
import json
import sys
import types

SRC, INP = sys.argv[1], sys.argv[2]
MAX_STEPS = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
MAX_ITEMS = 100
PRIMS = (int, float, complex, bool, type(None))

real_stdout = sys.stdout
captured = io.StringIO()
steps = []
result = {"language": "python", "steps": steps, "truncated": False, "error": None}


class StopTracing(Exception):
    pass


class Encoder:
    """Python values are all objects. Small immutable ones are shown inline; containers and
    instances go in the 'heap' with an id, so two names for the same list share one box."""

    def __init__(self):
        self.heap = {}

    def enc(self, v, depth=0):
        if isinstance(v, PRIMS):
            return {"k": "prim", "v": repr(v)}
        if isinstance(v, str):
            return {"k": "str", "v": v if len(v) < 500 else v[:500] + "…"}
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
            return {"k": "func", "v": getattr(v, "__qualname__", repr(v))}
        if isinstance(v, types.ModuleType):
            return {"k": "prim", "v": f"<module {v.__name__}>"}
        if isinstance(v, type):
            return {"k": "prim", "v": f"<class {v.__name__}>"}
        oid = str(id(v))
        if oid not in self.heap and depth < 8 and len(self.heap) < 300:
            self.heap[oid] = None  # reserve before recursing (cycles!)
            self.heap[oid] = {"type": type(v).__name__, "value": self.enc_obj(v, depth)}
        return {"k": "heapref", "id": oid}

    def enc_obj(self, v, depth):
        if isinstance(v, (list, tuple, set, frozenset)):
            items = list(v)[:MAX_ITEMS] if not isinstance(v, (set, frozenset)) else sorted(v, key=repr)[:MAX_ITEMS]
            return {"k": "list", "kind": type(v).__name__, "size": len(v),
                    "items": [self.enc(x, depth + 1) for x in items]}
        if isinstance(v, dict):
            entries = [{"key": self.enc(k, depth + 1), "value": self.enc(x, depth + 1)}
                       for k, x in list(v.items())[:MAX_ITEMS]]
            return {"k": "map", "type": "dict", "size": len(v), "entries": entries}
        fields = getattr(v, "__dict__", None)
        if isinstance(fields, dict):
            return {"k": "struct", "type": type(v).__name__,
                    "fields": [{"name": n, "value": self.enc(x, depth + 1)} for n, x in fields.items()]}
        return {"k": "prim", "v": repr(v)[:200]}


def visible_globals(g):
    for name, v in g.items():
        if name.startswith("__") or isinstance(v, types.ModuleType):
            continue
        yield name, v


def record(frame, event, extra=None):
    if len(steps) >= MAX_STEPS:
        result["truncated"] = True
        raise StopTracing()
    enc = Encoder()
    frames = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == SRC:
            if f.f_code.co_name == "<module>":
                items = list(visible_globals(f.f_globals))
                func = "global"
            else:
                items = list(f.f_locals.items())
                func = f.f_code.co_name
            frames.append({"func": func, "line": f.f_lineno,
                           "vars": [{"name": n, "type": type(v).__name__, "value": enc.enc(v)} for n, v in items]})
        f = f.f_back
    step = {"line": frame.f_lineno, "event": event, "frames": frames,
            "heap": {k: v for k, v in enc.heap.items() if v is not None},
            "outLen": len(captured.getvalue().encode("utf-8"))}
    if extra:
        step.update(extra)
    steps.append(step)


def tracer(frame, event, arg):
    if frame.f_code.co_filename != SRC:
        return None  # don't trace library code
    if event == "line":
        record(frame, "step")
    elif event == "call" and frame.f_code.co_name != "<module>":
        record(frame, "call")
    elif event == "return" and frame.f_code.co_name != "<module>":
        record(frame, "return", {"returnValue": Encoder().enc(arg) if isinstance(arg, PRIMS + (str,)) else None})
    elif event == "exception":
        exc_type, exc, _ = arg
        record(frame, "exception", {"exception": f"{exc_type.__name__}: {exc}"})
    return tracer


def main():
    with open(SRC, encoding="utf-8-sig") as fh:  # -sig: tolerate a BOM from Windows editors
        source = fh.read()
    try:
        code = compile(source, SRC, "exec")
    except SyntaxError as e:
        result["error"] = f"SyntaxError on line {e.lineno}: {e.msg}"
        result["errorLine"] = e.lineno
        return
    sys.stdin = open(INP, encoding="utf-8")
    sys.stdout = captured
    g = {"__name__": "__main__", "__file__": SRC, "__builtins__": builtins}
    sys.settrace(tracer)
    try:
        exec(code, g)
        result["exitCode"] = 0
    except StopTracing:
        pass
    except SystemExit as e:
        result["exitCode"] = e.code if isinstance(e.code, int) else 0
    except BaseException as e:  # the learner's uncaught error
        tb = e.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == SRC:
                line = tb.tb_lineno
            tb = tb.tb_next
        result["error"] = f"{type(e).__name__}: {e}"
        result["errorLine"] = line
        result["exitCode"] = 1
    finally:
        sys.settrace(None)
        sys.stdout = real_stdout


main()
result["output"] = captured.getvalue()[:200_000]
print("@@TRACE_BEGIN@@")
print(json.dumps(result, separators=(",", ":"), default=str))
print("@@TRACE_END@@")
