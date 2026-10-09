# C/C++ execution tracer. Runs INSIDE gdb:
#   gdb -q -batch -nx -x /opt/lab/gdbtrace.py --args ./program
# Steps through the program line by line (only lines in the user's source file), and at each
# step records the call stack, every visible variable, and objects reachable through pointers.
# Prints one JSON document between markers on stdout.
import json
import os

import gdb

SRC = os.path.realpath(os.environ["TRACE_SRC"])
INP = os.environ.get("TRACE_IN", "/dev/null")
OUTF = os.environ["TRACE_OUTFILE"]
MAX_STEPS = int(os.environ.get("TRACE_MAX_STEPS", "1000"))
MAX_ITEMS = 100   # elements read per container/array
MAX_DEPTH = 6     # nesting depth for structs-in-vectors-in-structs...
MAX_HEAP = 200    # heap objects recorded per step

state = {"exit_code": None, "signal": None}


def on_exit(ev):
    state["exit_code"] = getattr(ev, "exit_code", None)


def on_stop(ev):
    if isinstance(ev, gdb.SignalEvent):
        state["signal"] = ev.stop_signal


gdb.events.exited.connect(on_exit)
gdb.events.stop.connect(on_stop)

for cmd in [
    "set pagination off", "set confirm off", "set width 0",
    "set disable-randomization off",     # container seccomp may block personality()
    "set startup-with-shell on",         # needed for < > redirection in `run`
    "set environment LD_PRELOAD=/opt/lab/unbuffer.so",
    # Never step into the standard library: we only want the learner's lines.
    "skip -rfu ^std::", "skip -rfu ^__gnu_cxx::", "skip -rfu ^__cxx",
]:
    gdb.execute(cmd, to_string=True)
for depth in range(1, 7):
    gdb.execute("skip -gfi /usr/" + "/".join(["*"] * depth), to_string=True)

SIGNALS = {
    "SIGSEGV": "Segmentation fault: the program read or wrote memory it doesn't own "
               "(null/dangling pointer, or an index past the end of an array).",
    "SIGABRT": "Aborted: usually an uncaught exception or a failed assertion.",
    "SIGFPE": "Arithmetic error: most often integer division by zero.",
    "SIGBUS": "Bus error: invalid memory alignment or access.",
}


def in_user_code(frame):
    try:
        sal = frame.find_sal()
        return sal.symtab is not None and os.path.realpath(sal.symtab.fullname()) == SRC
    except (gdb.error, RuntimeError):
        return False


def user_frames(frame):
    out = []
    f = frame
    while f is not None and len(out) < 64:
        if in_user_code(f):
            out.append(f)
        f = f.older()
    return out


def hexaddr(v):
    try:
        return hex(int(v))
    except (gdb.error, ValueError, OverflowError):
        return None


class StepEncoder:
    """Encodes gdb.Values into plain JSON for one step."""

    def __init__(self, known_ranges):
        self.heap = {}
        self.known = known_ranges  # (start, end) address ranges of stack variables

    def is_known(self, addr):
        return any(s <= addr < e for s, e in self.known)

    def encode(self, val, depth=0):
        if depth > MAX_DEPTH:
            return {"k": "more"}
        try:
            return self._encode(val, depth)
        except (gdb.MemoryError, gdb.error, RuntimeError, OverflowError, ValueError) as e:
            return {"k": "err", "v": str(e)[:80]}

    def _encode(self, val, depth):
        pp = gdb.default_visualizer(val)
        if pp is not None:
            return self._encode_pretty(val, pp, depth)
        t = val.type.strip_typedefs()
        c = t.code
        if c == gdb.TYPE_CODE_PTR:
            return self._encode_ptr(val, t, depth)
        if c in (gdb.TYPE_CODE_REF, gdb.TYPE_CODE_RVALUE_REF):
            ref = val.referenced_value()
            return {"k": "ref", "addr": hexaddr(ref.address), "value": self.encode(ref, depth + 1)}
        if c == gdb.TYPE_CODE_ARRAY:
            lo, hi = t.range()
            n = hi - lo + 1
            target = t.target().strip_typedefs()
            if target.code == gdb.TYPE_CODE_INT and target.sizeof == 1:  # char[] → show as text too
                try:
                    text = val.string(length=n).split("\0")[0]
                except (gdb.error, UnicodeDecodeError):
                    text = None
            else:
                text = None
            items = [self.encode(val[lo + i], depth + 1) for i in range(min(n, MAX_ITEMS))]
            return {"k": "list", "kind": "array", "size": n, "items": items,
                    "addr": hexaddr(val.address), "elsize": target.sizeof, "text": text}
        if c in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
            fields = []
            for f in t.fields():
                if getattr(f, "artificial", False) or not hasattr(f, "bitpos"):
                    continue  # static members, vtable pointers
                if f.is_base_class:
                    base = self.encode(val.cast(f.type), depth + 1)
                    fields += base.get("fields", [])
                    continue
                fields.append({"name": f.name, "value": self.encode(val[f], depth + 1)})
            return {"k": "struct", "type": str(val.type), "fields": fields}
        if c == gdb.TYPE_CODE_BOOL:
            return {"k": "prim", "v": "true" if bool(val) else "false"}
        if c == gdb.TYPE_CODE_INT and t.sizeof == 1:
            n = int(val)
            ch = chr(n) if 32 <= n < 127 else None
            return {"k": "prim", "v": f"'{ch}'" if ch else str(n), "num": n}
        if c == gdb.TYPE_CODE_FLT:
            return {"k": "prim", "v": repr(float(val))}
        if c == gdb.TYPE_CODE_FUNC:
            return {"k": "func", "v": str(val.type)}
        return {"k": "prim", "v": str(val)}

    def _encode_ptr(self, val, t, depth):
        addr = int(val)
        if addr == 0:
            return {"k": "ptr", "addr": None}
        target = t.target().strip_typedefs()
        out = {"k": "ptr", "addr": hex(addr)}
        if target.code == gdb.TYPE_CODE_INT and target.sizeof == 1:  # char* → C string
            try:
                out["text"] = val.string(length=200)
            except (gdb.error, UnicodeDecodeError):
                out["bad"] = True
            return out
        if target.code in (gdb.TYPE_CODE_VOID, gdb.TYPE_CODE_FUNC):
            return out
        if self.is_known(addr) or hex(addr) in self.heap:
            return out  # points at a stack variable (drawn as an arrow) or already recorded
        if len(self.heap) >= MAX_HEAP:
            return out
        try:
            obj = val.dereference()
            obj.fetch_lazy()  # raises MemoryError for garbage/dangling pointers
        except (gdb.MemoryError, gdb.error):
            out["bad"] = True
            return out
        self.heap[hex(addr)] = None  # reserve first: stops infinite loops on cycles
        self.heap[hex(addr)] = {"type": str(obj.type), "value": self.encode(obj, depth + 1)}
        return out

    def _encode_pretty(self, val, pp, depth):
        hint = pp.display_hint() if hasattr(pp, "display_hint") else None
        summary = None
        if hasattr(pp, "to_string"):
            s = pp.to_string()
            if isinstance(s, gdb.LazyString):
                s = s.value()
            if isinstance(s, gdb.Value):
                try:
                    s = s.string() if hint == "string" else str(s)
                except gdb.error:
                    s = str(s)
            summary = s
        if hint == "string":
            return {"k": "str", "v": summary if isinstance(summary, str) else str(summary)}
        if not hasattr(pp, "children"):
            return {"k": "prim", "v": str(summary)}
        children = []
        it = iter(pp.children())
        limit = MAX_ITEMS * (2 if hint == "map" else 1)
        for _ in range(limit):
            try:
                children.append(next(it))
            except StopIteration:
                break
        tname = str(val.type.strip_typedefs())
        size = None
        if isinstance(summary, str):
            for word in summary.replace(",", " ").split():
                if word.isdigit():
                    size = int(word)
                    break
        if hint == "map":
            entries = []
            for i in range(0, len(children) - 1, 2):
                entries.append({"key": self.encode(children[i][1], depth + 1),
                                "value": self.encode(children[i + 1][1], depth + 1)})
            return {"k": "map", "type": tname, "size": size, "entries": entries}
        # smart pointers: one child that is the raw pointer
        if "unique_ptr" in tname or "shared_ptr" in tname or "weak_ptr" in tname:
            if children:
                return self.encode(children[0][1], depth)
            return {"k": "ptr", "addr": None}
        kind = tname.split("<")[0].replace("std::", "").replace("__cxx11::", "").replace("__debug::", "")
        items = []
        first_addr, elsize = None, None
        for i, (_, v) in enumerate(children):
            if i == 0 and isinstance(v, gdb.Value) and v.address is not None:
                first_addr, elsize = hexaddr(v.address), v.type.sizeof
            items.append(self.encode(v, depth + 1) if isinstance(v, gdb.Value) else {"k": "prim", "v": str(v)})
        if size is None:
            size = len(items)
        out = {"k": "list", "kind": kind, "size": size, "items": items}
        if kind in ("vector", "array") and first_addr:
            out["addr"], out["elsize"] = first_addr, elsize  # lets the UI resolve pointers into elements
        return out


class Tracer:
    def __init__(self):
        self.steps = []
        self.initialized = set()   # (depth, func, var, decl_line) seen past their declaration
        self.prev_stack = []

    def frame_vars(self, f, depth, line):
        out = []
        try:
            block = f.block()
        except RuntimeError:
            return out
        seen = set()
        func = f.name() or "?"
        while block is not None:
            for sym in block:
                if not (sym.is_variable or sym.is_argument) or sym.name in seen:
                    continue
                if sym.is_variable and not sym.is_argument and sym.line > line:
                    continue  # declared further down: not in scope yet
                seen.add(sym.name)
                try:
                    val = sym.value(f)
                except (gdb.error, RuntimeError):
                    continue
                key = (depth, func, sym.name, sym.line)
                uninit = False
                if sym.is_variable and not sym.is_argument:
                    if sym.line == line and key not in self.initialized:
                        uninit = True  # we're ON the declaration: it hasn't run yet
                    elif sym.line != line or key in self.initialized:
                        self.initialized.add(key)
                out.append((sym.name, val, uninit))
            if block.function is not None:
                break
            block = block.superblock
        return out

    def record(self, frame, event=None):
        frames = user_frames(frame)                 # newest first
        stack = [f.name() for f in reversed(frames)]  # oldest first
        # A frame that returned and got re-entered starts fresh: forget its "initialized" marks.
        common = 0
        while common < min(len(stack), len(self.prev_stack)) and stack[common] == self.prev_stack[common]:
            common += 1
        if common < len(self.prev_stack):
            self.initialized = {k for k in self.initialized if k[0] < common}
        if event is None:
            event = "call" if len(stack) > len(self.prev_stack) else (
                "return" if len(stack) < len(self.prev_stack) else "step")
        self.prev_stack = stack

        collected = []
        ranges = []
        for i, f in enumerate(frames):
            depth = len(frames) - 1 - i
            line = f.find_sal().line
            vs = self.frame_vars(f, depth, line)
            collected.append((f, line, vs))
            for _, val, _ in vs:
                try:
                    a = int(val.address)
                    ranges.append((a, a + max(val.type.sizeof, 1)))
                except (gdb.error, TypeError, ValueError):
                    pass
        enc = StepEncoder(ranges)
        out_frames = []
        for f, line, vs in collected:
            out_vars = []
            for name, val, uninit in vs:
                out_vars.append({
                    "name": name, "type": str(val.type),
                    "addr": hexaddr(val.address) if val.address is not None else None,
                    "value": {"k": "uninit"} if uninit else enc.encode(val),
                })
            out_frames.append({"func": f.name(), "line": line, "vars": out_vars})
        try:
            out_len = os.path.getsize(OUTF)
        except OSError:
            out_len = 0
        self.steps.append({"line": frame.find_sal().line, "event": event, "frames": out_frames,
                           "heap": {k: v for k, v in enc.heap.items() if v is not None},
                           "outLen": out_len})


def alive():
    try:
        gdb.selected_frame()
        return True
    except gdb.error:
        return False


def main():
    tr = Tracer()
    result = {"language": "cpp", "steps": tr.steps, "truncated": False, "error": None}
    gdb.execute("break main", to_string=True)
    gdb.execute(f"run < '{INP}' > '{OUTF}' 2>&1", to_string=True)
    while alive():
        frame = gdb.selected_frame()
        if state["signal"]:
            sig = state["signal"]
            uf = user_frames(frame)
            if uf:
                tr.record(uf[0], event="error")
            result["error"] = f"{sig}: {SIGNALS.get(sig, 'the program was stopped by a signal.')}"
            break
        if in_user_code(frame):
            if len(tr.steps) >= MAX_STEPS:
                result["truncated"] = True
                break
            tr.record(frame)
            gdb.execute("step", to_string=True)
        elif user_frames(frame):
            gdb.execute("finish", to_string=True)   # inside a library call: run it to completion
        else:
            gdb.execute("continue", to_string=True)  # main returned: let the program end
    if alive():
        gdb.execute("kill", to_string=True)
    result["exitCode"] = state["exit_code"]
    print("@@TRACE_BEGIN@@")
    print(json.dumps(result, separators=(",", ":")))
    print("@@TRACE_END@@")


try:
    main()
except Exception as e:  # report tracer failures instead of dying silently
    print("@@TRACE_BEGIN@@")
    print(json.dumps({"language": "cpp", "steps": [], "truncated": False,
                      "error": f"Tracer failed: {type(e).__name__}: {e}"}))
    print("@@TRACE_END@@")
