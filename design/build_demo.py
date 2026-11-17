#!/usr/bin/env python3
"""Build the UI demo artboards (.dc.html) from one set of shared components.

Every screen is generated from the same tokens and component functions, so
button sizes, page headers, tables and loading states stay identical across
screens. Run:  python build_demo.py  [heights.json]
"""
import calendar
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "project"
FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
MONO = "ui-monospace, Menlo, Consolas, monospace"
LOAD_MS = "1.2s"

HEIGHTS = {"Main": 900, "Builder": 900, "Run": 900, "Versions": 900,
           "RefTables": 900, "Admin": 900, "Components": 900}
if len(sys.argv) > 1:
    HEIGHTS.update(json.loads(Path(sys.argv[1]).read_text()))

HELMET = """<helmet>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0}
a{color:#0F766E}a:hover{color:#134E4A}
button,a{transition:filter .15s ease}
button:hover,a[data-btn]:hover{filter:brightness(.94)}
:focus-visible{outline:2px solid #0D9488;outline-offset:2px}
[data-field]:focus-within{outline:2px solid #0D9488;outline-offset:2px}
@keyframes dfw-pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes dfw-hide{to{opacity:0;visibility:hidden}}
@keyframes dfw-show{from{opacity:0}to{opacity:1}}
@keyframes dfw-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
</style>
</helmet>"""

ICON = {
    "flows": '<path d="M4 6h7M4 12h16M4 18h10"/>',
    "table": '<path d="M4 5h16v14H4zM4 10h16M10 5v14"/>',
    "user": '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5 7-5s6 1 7 5"/>',
    "search": '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    "chevron": '<path d="M6 9l6 6 6-6"/>',
    "calendar": '<path d="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4"/>',
    "left": '<path d="M15 6l-6 6 6 6"/>',
    "right": '<path d="M9 6l6 6-6 6"/>',
    "check": '<path d="M5 12l5 5 9-10"/>',
    "alert": '<path d="M12 4l9 16H3zM12 10v5M12 18v.5"/>',
    "inbox": '<path d="M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5"/>',
}


def icon(name, size=18, color="currentColor"):
    return (f'<svg aria-hidden="true" width="{size}" height="{size}" viewBox="0 0 24 24" '
            f'style="flex: none; fill: none; stroke: {color}; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round">'
            f'{ICON[name]}</svg>')


PRESSED = ' aria-pressed="true"'
UNPRESSED = ' aria-pressed="false"'


# ---------- buttons: one scale for the whole app ----------
BTN_LOOK = {
    "cta": "border: 1px solid #C2410C; background: #C2410C; color: #FFFFFF",
    "primary": "border: 1px solid #0F766E; background: #0F766E; color: #FFFFFF",
    "secondary": "border: 1px solid #6F918D; background: #FFFFFF; color: #134E4A",
    "danger": "border: 1px solid transparent; background: none; color: #B91C1C",
    "disabled": "border: 1px solid #E8F1F4; background: #E8F1F4; color: #475569",
}


def btn_style(variant="secondary", size="md", extra=""):
    h, p, fs = (40, 16, 14) if size == "md" else (36, 12, 13)
    cursor = "not-allowed" if variant == "disabled" else "pointer"
    return (f"display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; "
            f"height: {h}px; padding: 0 {p}px; border-radius: 8px; {BTN_LOOK[variant]}; "
            f"font: 600 {fs}px {FONT}; text-decoration: none; white-space: nowrap; cursor: {cursor}; {extra}").strip()


def btn(label, variant="secondary", size="md", href=None, aria=None, extra="", attrs=""):
    a = f' aria-label="{aria}"' if aria else ""
    st = btn_style(variant, size, extra)
    if href:
        return f'<a data-btn href="{href}"{a}{attrs} style="{st}">{label}</a>'
    dis = " disabled" if variant == "disabled" else ""
    return f'<button type="button"{a}{attrs}{dis} style="{st}">{label}</button>'


def badge(text, kind="ok"):
    look = {
        "ok": "background: #CCFBF1; color: #115E59",
        "draft": "background: #FFEDD5; color: #9A3412",
        "neutral": "background: #E8F1F4; color: #334155",
        "outline": "box-shadow: inset 0 0 0 1px #0D9488; color: #115E59",
    }[kind]
    return (f'<span style="display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; '
            f'line-height: 18px; font-weight: 700; white-space: nowrap; {look}">{text}</span>')


# ---------- form controls built from our own parts ----------
FIELD = ("box-sizing: border-box; height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid #6F918D; "
         f"background: #FFFFFF; color: #134E4A; font: 400 14px {FONT}")


def text_field(label, value, width="100%"):
    return (f'<label style="display: flex; flex-direction: column; gap: 6px; font-weight: 700">{label}\n'
            f'<input type="text" value="{value}" style="{FIELD}; width: {width}">\n</label>')


def search_field(label, placeholder):
    return (f'<label style="display: flex; align-items: center; gap: 8px; color: #475569; font-weight: 600">{label}\n'
            f'<span data-field style="display: inline-flex; align-items: center; gap: 8px; {FIELD}; width: 260px">'
            f'{icon("search", 16, "#475569")}'
            f'<input type="text" placeholder="{placeholder}" style="flex: 1; min-width: 0; border: 0; outline: 0; padding: 0; background: none; color: #134E4A; font: 400 14px {FONT}">'
            f'</span>\n</label>')


POPOVER = ("position: absolute; left: 0; top: 44px; z-index: 5; box-sizing: border-box; background: #FFFFFF; "
           "border: 1px solid #6F918D; border-radius: 12px; box-shadow: 0 8px 24px rgba(19, 78, 74, 0.14)")


def dropdown(aria, options, selected, width=260, open_hole=None, toggle_hole=None, static_open=False):
    """Custom dropdown: a button plus a list of option buttons."""
    click = f' onClick="{{{{ {toggle_hole} }}}}"' if toggle_hole else ""
    head = (f'<button type="button" aria-haspopup="listbox" aria-label="{aria}: {options[selected]}"{click} '
            f'style="display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; {FIELD}; '
            f'width: {width}px; font-weight: 600; cursor: pointer">{options[selected]}{icon("chevron", 16, "#475569")}</button>')
    items = ""
    for i, opt in enumerate(options):
        sel = i == selected
        look = "background: #CCFBF1; font-weight: 700" if sel else "background: none; font-weight: 500"
        mark = icon("check", 16, "#0F766E") if sel else '<span style="width: 16px"></span>'
        items += (f'<button type="button" role="option" aria-selected="{"true" if sel else "false"}" '
                  f'style="display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; height: 36px; padding: 0 10px; '
                  f'border: 0; border-radius: 6px; {look}; color: #134E4A; font-size: 13px; font-family: {FONT}; text-align: left; cursor: pointer">'
                  f'{mark}{opt}</button>\n')
    pop = f'<div style="{POPOVER}; width: {max(width, 280)}px; padding: 6px; display: flex; flex-direction: column; gap: 2px">\n{items}</div>'
    if open_hole:
        pop = f'<sc-if value="{{{{ {open_hole} }}}}" hint-placeholder-val="{{{{ false }}}}">\n{pop}\n</sc-if>'
    elif not static_open:
        pop = ""
    return f'<div style="position: relative; display: inline-block">\n{head}\n{pop}\n</div>'


def date_picker(aria, year, month, day, open_hole=None, toggle_hole=None, static_open=False, up=False):
    """Custom date picker: a button plus a month grid of day buttons."""
    text = f"{day:02d} {calendar.month_abbr[month]} {year}"
    click = f' onClick="{{{{ {toggle_hole} }}}}"' if toggle_hole else ""
    head = (f'<button type="button" aria-haspopup="dialog" aria-label="{aria}: {text}. Change date"{click} '
            f'style="display: inline-flex; align-items: center; gap: 8px; {FIELD}; width: 180px; font-weight: 600; cursor: pointer">'
            f'{icon("calendar", 16, "#475569")}{text}</button>')
    nav = ("display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; "
           "border: 1px solid #6F918D; background: #FFFFFF; color: #134E4A; cursor: pointer")
    cells = "".join(f'<span style="text-align: center; font-size: 12px; font-weight: 700; color: #475569">{d}</span>'
                    for d in ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"))
    for week in calendar.monthcalendar(year, month):
        for d in week:
            if d == 0:
                cells += "<span></span>"
                continue
            sel = d == day
            look = ("border: 1px solid #0F766E; background: #0F766E; color: #FFFFFF; font-weight: 700" if sel
                    else "border: 1px solid transparent; background: none; color: #134E4A; font-weight: 500")
            pressed = ' aria-pressed="true"' if sel else ""
            cells += (f'<button type="button" aria-label="{d} {calendar.month_name[month]} {year}"{pressed} '
                      f'style="height: 36px; padding: 0; border-radius: 8px; {look}; font-size: 13px; font-family: {FONT}; cursor: pointer">{d}</button>')
    place = POPOVER.replace('top: 44px', 'bottom: 44px') if up else POPOVER
    pop = (f'<div style="{place}; width: 300px; padding: 12px; display: flex; flex-direction: column; gap: 8px">\n'
           f'<div style="display: flex; align-items: center; justify-content: space-between">'
           f'<button type="button" aria-label="Previous month" style="{nav}">{icon("left", 16)}</button>'
           f'<span style="font-weight: 700">{calendar.month_name[month]} {year}</span>'
           f'<button type="button" aria-label="Next month" style="{nav}">{icon("right", 16)}</button></div>\n'
           f'<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; align-items: center">{cells}</div>\n</div>')
    if open_hole:
        pop = f'<sc-if value="{{{{ {open_hole} }}}}" hint-placeholder-val="{{{{ false }}}}">\n{pop}\n</sc-if>'
    elif not static_open:
        pop = ""
    return f'<div style="position: relative; display: inline-block">\n{head}\n{pop}\n</div>'


def checkbox(label, checked, aria=None, disabled=False):
    """Custom checkbox: a button with role checkbox and a drawn box."""
    if checked:
        box = ('<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" style="flex: none">'
               '<rect x="1" y="1" width="18" height="18" rx="5" fill="#0F766E"/>'
               '<path d="M5.5 10.5l3 3 6-7" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    else:
        fill = "#E8F1F4" if disabled else "#FFFFFF"
        box = ('<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" style="flex: none">'
               f'<rect x="1" y="1" width="18" height="18" rx="5" fill="{fill}" stroke="#6F918D" stroke-width="1.5"/></svg>')
    a = f' aria-label="{aria}"' if aria else ""
    dis = ' disabled' if disabled else ""
    color = "#475569" if disabled else "#134E4A"
    return (f'<button type="button" role="checkbox" aria-checked="{"true" if checked else "false"}"{a}{dis} '
            f'style="display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 0; border: 0; background: none; '
            f'color: {color}; font: 500 14px {FONT}; cursor: {"not-allowed" if disabled else "pointer"}">{box}{label}</button>')


# ---------- tables, cards, loading ----------
TH = "padding: 10px 16px; font-size: 12px; line-height: 20px; font-weight: 700; color: #475569; border-bottom: 1px solid #99F6E4; white-space: nowrap"


def table(headers, rows, min_width=720):
    """headers: [(label, align)], rows: [[cell html]]. One density for every table."""
    head = "".join(f'<th scope="col" style="text-align: {al}; {TH}">{lb}</th>' for lb, al in headers)
    body = ""
    for i, row in enumerate(rows):
        line = "" if i == len(rows) - 1 else " border-bottom: 1px solid #E8F1F4;"
        tds = "".join(f'<td style="height: 56px; padding: 0 16px; text-align: {headers[j][1]}; white-space: nowrap;{line}">{cell}</td>'
                      for j, cell in enumerate(row))
        body += f"<tr>{tds}</tr>\n"
    return (f'<table style="width: 100%; min-width: {min_width}px; border-collapse: collapse; font-size: 14px">\n'
            f"<thead><tr>{head}</tr></thead>\n<tbody>\n{body}</tbody>\n</table>")


def skeleton(cols, rows, overlay=True):
    """Placeholder with the same row heights as table(), so nothing moves when data arrives."""
    bar = "height: 12px; border-radius: 6px; background: #DCE7EA; animation: dfw-pulse 1.2s ease-in-out infinite"
    head = "".join(f'<span style="flex: {c} 1 0"><span style="display: block; width: 45%; height: 8px; border-radius: 4px; background: #DCE7EA"></span></span>' for c in cols)
    out = f'<div style="display: flex; align-items: center; gap: 16px; height: 40px; padding: 0 16px; border-bottom: 1px solid #99F6E4">{head}</div>\n'
    for r in range(rows):
        line = "" if r == rows - 1 else " border-bottom: 1px solid #E8F1F4;"
        cells = "".join(f'<span style="flex: {c} 1 0"><span style="display: block; width: {70 - (r * 7 + i * 11) % 30}%; {bar}"></span></span>' for i, c in enumerate(cols))
        out += f'<div style="display: flex; align-items: center; gap: 16px; height: 56px; padding: 0 16px;{line}">{cells}</div>\n'
    pos = (f"position: absolute; inset: 0; z-index: 1; pointer-events: none; animation: dfw-hide 0.2s ease-out {LOAD_MS} both; "
           if overlay else "")
    return f'<div aria-hidden="true" style="{pos}background: #FFFFFF; border-radius: 12px; overflow: hidden">\n{out}</div>'


def loading(content, cols, rows):
    """Show the skeleton first, then the content, inside the same reserved box."""
    return (f'<div style="position: relative">\n{skeleton(cols, rows)}\n'
            f'<div style="overflow-x: auto; animation: dfw-show 0.3s ease-out {LOAD_MS} both">\n{content}\n</div>\n</div>')


CARD = "background: #FFFFFF; border: 1px solid #99F6E4; border-radius: 12px"


def card(body, header=None, pad=True, tag="section", label=None):
    al = f' aria-label="{label}"' if label else ""
    head = ""
    if header:
        line = "" if pad else " border-bottom: 1px solid #E8F1F4;"
        gap = " margin-bottom: 16px;" if pad else " padding: 16px 20px;"
        head = f'<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px;{gap}{line}">{header}</div>\n'
    padding = "padding: 20px; " if pad else ""
    return f'<{tag}{al} style="{CARD}; {padding}min-width: 0">\n{head}{body}\n</{tag}>'


def scroll(inner):
    return f'<div style="overflow-x: auto">{inner}</div>'


def h2(text):
    return f'<h2 style="margin: 0; font-size: 16px; line-height: 24px; font-weight: 700">{text}</h2>'


def note(text):
    return f'<p style="margin: 0; font-size: 13px; line-height: 20px; color: #475569">{text}</p>'


# ---------- page shell: identical on every screen ----------
NAV = [("Flows", "Main.dc.html", "flows"), ("Reference tables", "RefTables.dc.html", "table"), ("Admin", "Admin.dc.html", "user")]


def sidebar(active):
    links = ""
    for label, href, ic in NAV:
        on = label == active
        look = "background: #CCFBF1; font-weight: 700" if on else "font-weight: 600"
        cur = ' aria-current="page"' if on else ""
        links += (f'<a href="{href}"{cur} style="display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border-radius: 8px; '
                  f'{look}; color: #134E4A; text-decoration: none">{icon(ic)}{label}</a>\n')
    logo = ('<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" style="box-sizing: border-box; padding: 4px; border-radius: 8px; '
            'background: #0F766E; fill: none; stroke: #FFFFFF; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round">'
            '<path d="M5 5h6v4H5zM13 15h6v4h-6zM8 9v6a2 2 0 0 0 2 2h3"/></svg>')
    return (f'<nav aria-label="Main" style="flex: 0 0 232px; box-sizing: border-box; background: #FFFFFF; border-right: 1px solid #99F6E4; '
            f'padding: 20px 16px; display: flex; flex-direction: column; gap: 6px">\n'
            f'<div style="display: flex; align-items: center; gap: 10px; height: 28px; padding: 0 4px; margin-bottom: 16px; font-size: 18px; font-weight: 700">{logo}Data Flow</div>\n'
            f'{btn("Create flow", "cta", href="Builder.dc.html", extra="margin-bottom: 12px")}\n{links}'
            f'<div style="margin-top: auto; padding: 12px 4px 0; border-top: 1px solid #E8F1F4; display: flex; flex-direction: column">'
            f'<span style="font-weight: 700">Harold</span><span style="font-size: 12px; color: #475569">Admin</span></div>\n</nav>')


def page_header(crumbs, title, subtitle, action=""):
    """Fixed-height header: breadcrumb line, title, subtitle, one action on the right."""
    parts = []
    for label, href in crumbs:
        if href:
            parts.append(f'<a href="{href}" style="display: inline-flex; align-items: center; height: 24px; font-weight: 700; text-decoration: none">{label}</a>')
        else:
            parts.append(f'<span style="font-weight: 700; color: #475569">{label}</span>')
    trail = '<span aria-hidden="true" style="color: #475569">/</span>'.join(parts)
    return (f'<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; min-height: 92px">\n'
            f'<div style="display: flex; flex-direction: column; gap: 4px; min-width: 0">\n'
            f'<div style="display: flex; align-items: center; gap: 8px; height: 24px; font-size: 12px; line-height: 24px">{trail}</div>\n'
            f'<h1 style="margin: 0; font-size: 28px; line-height: 36px; font-weight: 700">{title}</h1>\n'
            f'<p style="margin: 0; color: #475569">{subtitle}</p>\n</div>\n{action}\n</div>')


def logic(body="return {};"):
    return "class Component extends DCLogic {\nrenderVals() {\n" + body + "\n}\n}"


def toggle_logic(key):
    return (f"var st = this.state || {{}};\nvar self = this;\n"
            f"return {{ {key}: !!st.{key}, toggle_{key}: function () {{ self.setState({{ {key}: !st.{key} }}); }} }};")


def document(name, title, root, script=None):
    h = HEIGHTS[name]
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
{HELMET}
{root}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1440,"height":{h}}}}}'>
{script or logic()}
</script>
</body>
</html>
"""


ROOT_STYLE = f"background: #F0FDFA; color: #134E4A; font-family: {FONT}; font-size: 14px; line-height: 21px"


def shell(name, title, active, header, blocks, script=None):
    body = "\n".join(blocks)
    root = (f'<div style="display: flex; flex-wrap: wrap; min-height: {HEIGHTS[name]}px; {ROOT_STYLE}">\n{sidebar(active)}\n'
            f'<main style="flex: 999 1 560px; min-width: 0; box-sizing: border-box; padding: 32px 40px; display: flex; flex-direction: column; gap: 24px">\n'
            f'{header}\n{body}\n</main>\n</div>')
    return document(name, title, root, script)


def two_line(strong, small):
    return f'<b>{strong}</b><br><span style="font-size: 12px; line-height: 18px; color: #475569">{small}</span>'


def two_line_plain(top, small):
    return f'{top}<br><span style="font-size: 12px; line-height: 18px; color: #475569">{small}</span>'


def actions(*buttons):
    return f'<div style="display: flex; align-items: center; gap: 8px">{"".join(buttons)}</div>'


# ---------- screens ----------
def main_screen():
    flows = [
        ("Monthly timesheet summary", "12 steps, 3 output sheets", two_line_plain(badge("Shared", "outline"), "HR Payroll"), "Admin", "v3 " + badge("Published"), "From 01 Jul 2026", True),
        ("Headcount report cleanup", "6 steps, 1 output sheet", two_line_plain(badge("Shared", "outline"), "HR Analytics"), "Admin", "v1 " + badge("Published"), "From 01 Jan 2026", True),
        ("OT by department", "5 steps, 1 output sheet", badge("Personal", "neutral"), "Harold", "v2 " + badge("Published"), "From 01 Jul 2026", True),
        ("Insurance list merge", "4 steps, 1 output sheet", badge("Personal", "neutral"), "Minh", "v1 " + badge("Draft", "draft"), "Not published yet", False),
    ]
    rows = []
    for name, desc, scope, owner, ver, rng, can_run in flows:
        acts = [btn("Open", "secondary", "sm", href="Builder.dc.html", aria=f"Open {name}")]
        if can_run:
            acts.append(btn("Run", "primary", "sm", href="Run.dc.html", aria=f"Run {name}"))
        acts.append(btn("Delete", "danger", "sm", aria=f"Delete {name}", extra="margin-left: 8px"))
        rows.append([two_line(name, desc), scope, owner, ver, rng, actions(*acts)])
    heads = [("Flow", "left"), ("Scope", "left"), ("Owner", "left"), ("Version in effect", "left"), ("Effective range", "left"), ("Actions", "left")]
    toolbar = (f'<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 40px">\n'
               f'{btn("All flows", "primary", "sm", attrs=PRESSED)}'
               f'{btn("Personal", "secondary", "sm", attrs=UNPRESSED)}'
               f'{btn("Shared", "secondary", "sm", attrs=UNPRESSED)}'
               f'<span style="margin-left: auto">{search_field("Search", "Flow name")}</span>\n</div>')
    tbl = card(loading(table(heads, rows, 900), [30, 16, 8, 14, 14, 18], 4), pad=False, tag="div")
    foot = note('As admin you see every flow. A user sees personal flows and the shared flows of their groups. '
                'Delete asks you to confirm first, and a deleted flow stays in <a href="Admin.dc.html">Admin</a> for 30 days.')
    head = page_header([("Workspace", None)], "Flows", "Build a flow once, then run it for any effective date.")
    return shell("Main", "Flows", "Flows", head, [toolbar, tbl, foot])


def chip(title, sub):
    return (f'<div style="padding: 10px 12px; border-radius: 8px; background: #F0FDFA; border: 1px solid #E8F1F4"><b>{title}</b><br>'
            f'<span style="font-size: 12px; color: #475569">{sub}</span></div>')


def step_h2(n, text):
    return (f'<h2 style="margin: 0; font-size: 16px; line-height: 24px; font-weight: 700; display: flex; align-items: center; gap: 10px">'
            f'<span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; '
            f'background: #0F766E; color: #FFFFFF; font-size: 13px">{n}</span>{text}</h2>')


def run_screen():
    picker = (f'<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 700">Effective date</span>\n'
              f'{date_picker("Effective date", 2026, 9, 30, "dateOpen", "toggle_dateOpen")}\n</div>')
    chips = (f'<div style="flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 700">Versions used for this date</span>\n'
             f'<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px">\n'
             f'{chip("Flow v3", "From 01 Jul 2026")}{chip("Attendance codes v2", "From 01 Jul 2026")}{chip("OT types v1", "From 01 Jan 2026")}{chip("OT limits v1", "From 01 Jan 2026")}\n</div>\n</div>')
    c1 = card(f'<div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start">\n{picker}\n{chips}\n</div>',
              header=step_h2(1, "Choose the effective date"))

    def file_row(name, detail):
        return (f'<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-height: 56px; padding: 0 12px; border-radius: 8px; border: 1px solid #E8F1F4">\n'
                f'<div style="flex: 1 1 280px; min-width: 0">{two_line(name, detail)}</div>\n{badge("Loaded")}\n'
                f'{btn("Change file", "secondary", "sm", aria="Change file for " + name)}\n</div>')
    c2 = card(f'<div style="display: flex; flex-direction: column; gap: 8px">\n'
              f'{file_row("Timesheet", "timesheet_2026-09.xlsx, sheet Timesheet, 24 rows")}\n'
              f'{file_row("Employee list", "employees.xlsx, sheet Employees, 12 rows")}\n</div>',
              header=step_h2(2, "Add the input files") + btn("Run again", "secondary"))
    heads = [("employee_id", "left"), ("full_name", "left"), ("work_days", "right"), ("ot_day_hours", "right"), ("ot_night_hours", "right"),
             ("ot_rest_hours", "right"), ("ot_holiday_hours", "right"), ("ot_total_hours", "right"), ("ot_breach_count", "right")]
    hot = '<b style="color: #9A3412">1</b>'
    rows = [["E0001", "An Nguyen", "25", "0", "0", "0", "0", "0", "0"], ["E0003", "Chi Le", "25", "0", "8", "0", "0", "8", "0"],
            ["E0006", "Hai Do", "25", "42", "0", "0", "0", "42", hot], ["E0010", "Nga Duong", "25", "0", "0", "15", "8", "23", hot]]
    tabs = (f'<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 20px">'
            f'{btn("Summary, 11 rows", "primary", "sm", attrs=PRESSED)}'
            f'{btn("Exceptions, 11 rows", "secondary", "sm", attrs=UNPRESSED)}'
            f'{btn("OT breaches, 4 rows", "secondary", "sm", attrs=UNPRESSED)}</div>')
    c3 = card(tabs + f'\n<div style="border-top: 1px solid #E8F1F4">{loading(table(heads, rows, 900), [10, 14, 9, 10, 11, 10, 12, 11, 12], 4)}</div>\n'
              f'<div style="padding: 12px 20px; border-top: 1px solid #E8F1F4">{note("Preview of the Summary sheet, 4 of 11 rows. The numbers come from the sample test files.")}</div>',
              header=step_h2(3, "Result: run finished") + btn("Download workbook", "primary"), pad=False)
    head = page_header([("Flows", "Main.dc.html"), ("Monthly timesheet summary", "Builder.dc.html")], "Run flow",
                       "Your files are read on this device. Nothing is uploaded to the server.")
    return shell("Run", "Run a flow", "Flows", head, [c1, c2, c3], logic(toggle_logic("dateOpen")))


def versions_screen():
    def seg(flex, title, sub, look):
        return f'<div style="flex: {flex} 1 0; min-width: 0; box-sizing: border-box; height: 60px; padding: 9px 12px; border-radius: 8px; {look}"><b>{title}</b><br><span style="font-size: 12px">{sub}</span></div>'
    timeline = (f'<div style="display: flex; gap: 4px">\n'
                f'{seg(3, "v1", "Jan to Mar 2026", "border: 1px solid #E8F1F4; background: #E8F1F4; color: #334155")}'
                f'{seg(3, "v2", "Apr to Jun 2026", "border: 1px solid #E8F1F4; background: #E8F1F4; color: #334155")}'
                f'{seg(6, "v3, in effect", "From Jul 2026, no end date", "border: 1px solid #0F766E; background: #0F766E; color: #FFFFFF")}'
                f'{seg(3, "v4, draft", "From Jan 2027", "border: 1px dashed #C2410C; background: #FFF7ED; color: #9A3412")}\n</div>\n'
                f'<div style="display: flex; gap: 4px; margin-top: 6px; font-size: 12px; color: #475569">'
                f'<span style="flex: 3 1 0">Jan 2026</span><span style="flex: 3 1 0">Apr 2026</span><span style="flex: 6 1 0">Jul 2026</span><span style="flex: 3 1 0">Jan 2027</span></div>\n'
                f'<p style="margin: 12px 0 0; padding: 10px 12px; border-radius: 8px; background: #FFF7ED; color: #7C2D12">Versions cannot overlap. Publishing v4 will end v3 on 31 Dec 2026.</p>')
    heads = [("Version", "left"), ("Status", "left"), ("Valid from", "left"), ("Valid to", "left"), ("Change note", "left"), ("Actions", "left")]
    rows = [
        ["<b>v4</b>", badge("Draft", "draft"), "01 Jan 2027", "No end date", "New check for rest-day OT",
         actions(btn("Edit", "secondary", "sm", href="Builder.dc.html", aria="Edit version 4"), btn("Publish", "primary", "sm", aria="Publish version 4"))],
        ["<b>v3</b>", badge("Published, in effect"), "01 Jul 2026", "No end date", "OT type now comes from the attendance code",
         actions(btn("View", "secondary", "sm", href="Builder.dc.html", aria="View version 3"), btn("Copy to new version", "secondary", "sm", aria="Copy version 3 to a new version"))],
        ["<b>v2</b>", badge("Published, ended", "neutral"), "01 Apr 2026", "30 Jun 2026", "Added the OT limit check per week",
         actions(btn("View", "secondary", "sm", href="Builder.dc.html", aria="View version 2"))],
        ["<b>v1</b>", badge("Published, ended", "neutral"), "01 Jan 2026", "31 Mar 2026", "First version",
         actions(btn("View", "secondary", "sm", href="Builder.dc.html", aria="View version 1"))],
    ]
    check = (f'<div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px">\n'
             f'<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 700">Check which version a date uses</span>\n'
             f'{date_picker("Date to check", 2026, 5, 15, "dateOpen", "toggle_dateOpen", up=True)}\n</div>\n'
             f'<p style="margin: 0; height: 40px; display: flex; align-items: center">A run with effective date 15 May 2026 uses <b style="margin-left: 4px">v2</b>.</p>\n</div>')
    head = page_header([("Flows", "Main.dc.html"), ("Monthly timesheet summary", "Builder.dc.html")], "Versions",
                       "Each version is valid for a date range. A run uses the version valid on its effective date.",
                       btn("New version", "primary"))
    return shell("Versions", "Flow versions", "Flows", head,
                 [card(timeline, label="Version timeline"), card(loading(table(heads, rows, 860), [8, 16, 12, 12, 30, 22], 4), pad=False, tag="div"), card(check)],
                 logic(toggle_logic("dateOpen")))


def reftables_screen():
    def item(title, sub, on):
        look = "border: 2px solid #0F766E; padding: 0 13px" if on else "border: 1px solid #6F918D; padding: 0 14px"
        return (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="box-sizing: border-box; height: 56px; {look}; text-align: left; border-radius: 8px; '
                f'background: #FFFFFF; color: #134E4A; font: 700 14px {FONT}; cursor: pointer">{title}<br>'
                f'<span style="font-size: 12px; font-weight: 500; color: #475569">{sub}</span></button>')
    lst = (f'<div style="flex: 0 0 260px; display: flex; flex-direction: column; gap: 8px">\n'
           f'{item("Attendance codes", "8 rows, v2 in effect", True)}\n{item("OT types", "4 rows, v1 in effect", False)}\n{item("OT limits", "2 rows, v1 in effect", False)}\n</div>')
    no_ot = '<span style="color: #475569">No OT allowed</span>'
    codes = [["<b>X</b>", "Day shift worked", "1", "WORK", "OT_DAY"], ["<b>N</b>", "Night shift worked", "1", "WORK", "OT_NIGHT"],
             ["<b>X/2</b>", "Half day worked", "0.5", "WORK", "OT_DAY"], ["<b>P</b>", "Annual leave", "0", "PAID_LEAVE", no_ot],
             ["<b>KL</b>", "Unpaid leave", "0", "UNPAID_LEAVE", no_ot], ["<b>O</b>", "Sick leave", "0", "SICK", no_ot],
             ["<b>NT</b>", "Weekly rest day", "0", "REST", "OT_REST"], ["<b>L</b>", "Public holiday", "0", "HOLIDAY", "OT_HOLIDAY"]]
    heads = [("code", "left"), ("description", "left"), ("work_day_value", "right"), ("day_category", "left"), ("ot_type", "left")]
    vers = (f'<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 20px">'
            f'{btn("v2, from 01 Jul 2026", "primary", "sm", attrs=PRESSED)}'
            f'{btn("v1, 01 Jan 2026 to 30 Jun 2026", "secondary", "sm", attrs=UNPRESSED)}</div>')
    detail = card(vers + f'\n<div style="border-top: 1px solid #E8F1F4">{loading(table(heads, codes, 640), [10, 30, 16, 20, 24], 8)}</div>\n'
                  f'<div style="padding: 12px 20px; border-top: 1px solid #E8F1F4">{note("Used by <a href=" + chr(34) + "Builder.dc.html" + chr(34) + ">Monthly timesheet summary</a>, step 4. A published version is read-only: create a new version to change its rows. Sample codes for testing.")}</div>',
                  header=h2("Attendance codes") + actions(btn("Paste from Excel", "secondary"), btn("New version", "secondary")), pad=False)
    pane = f'<div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start">\n{lst}\n<div style="flex: 999 1 480px; min-width: 0">{detail}</div>\n</div>'
    ot_types = card(scroll(table([("ot_type", "left"), ("description", "left"), ("day_limit_hours", "right")],
                          [["OT_DAY", "OT after a day shift", "4"], ["OT_NIGHT", "OT after a night shift", "4"],
                           ["OT_REST", "OT on a weekly rest day", "8"], ["OT_HOLIDAY", "OT on a public holiday", "8"]], 360)),
                    header=h2("OT types, v1"), pad=False)
    ot_limits = card(scroll(table([("period", "left"), ("limit_hours", "right")], [["WEEK", "16"], ["MONTH", "40"]], 240))
                     + f'\n<div style="padding: 12px 20px; border-top: 1px solid #E8F1F4">{note("Sample limits for testing. Replace them with the real limits before go-live.")}</div>',
                     header=h2("OT limits, v1"), pad=False)
    others = (f'{h2("Other tables used by Monthly timesheet summary")}\n'
              f'<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 24px; align-items: start">\n{ot_types}\n{ot_limits}\n</div>')
    head = page_header([("Workspace", None)], "Reference tables",
                       "Shared rules that flows look up. Each table keeps versions with an effective date range.", btn("New table", "primary"))
    return shell("RefTables", "Reference tables", "Reference tables", head, [pane, others])


def admin_screen():
    users = [["<b>Harold</b>", "harold@example.com", badge("Admin", "draft"), "All groups"], ["<b>Lan</b>", "lan@example.com", badge("User", "neutral"), "HR Payroll"],
             ["<b>Minh</b>", "minh@example.com", badge("User", "neutral"), "HR Analytics"], ["<b>Thu</b>", "thu@example.com", badge("User", "neutral"), "HR Payroll, HR Analytics"]]
    for u in users:
        name = u[0].replace("<b>", "").replace("</b>", "")
        u.append(btn("Edit", "secondary", "sm", aria=f"Edit {name}"))
    c1 = card(loading(table([("Name", "left"), ("Email", "left"), ("Role", "left"), ("Groups", "left"), ("Actions", "left")], users, 720), [16, 28, 14, 28, 14], 4)
              + f'\n<div style="padding: 12px 20px; border-top: 1px solid #E8F1F4">{note("Showing 4 of 10 users.")}</div>',
              header=h2("Users") + btn("Invite user", "primary"), pad=False)
    access = []
    for flow, a, b in (("Monthly timesheet summary", True, False), ("Headcount report cleanup", False, True)):
        access.append([f"<b>{flow}</b>", checkbox("View and run", a, f"HR Payroll can view and run {flow}"),
                       checkbox("View and run", b, f"HR Analytics can view and run {flow}")])
    c2 = card(scroll(table([("Shared flow", "left"), ("HR Payroll", "left"), ("HR Analytics", "left")], access, 560)),
              header=f'<div style="display: flex; flex-direction: column; gap: 2px">{h2("Access to shared flows")}{note("Members of a ticked group can view and run the flow. Only the admin can edit or delete it.")}</div>', pad=False)
    deleted = []
    for flow, owner, d1, d2 in (("Payroll export check", "Lan", "05 Nov 2026", "05 Dec 2026"), ("Old headcount merge", "Admin", "28 Oct 2026", "27 Nov 2026")):
        deleted.append([f"<b>{flow}</b>", owner, d1, d2, actions(btn("Restore", "secondary", "sm", aria=f"Restore {flow}"),
                                                                 btn("Delete for good", "danger", "sm", aria=f"Delete {flow} for good", extra="margin-left: 8px"))])
    c3 = card(scroll(table([("Flow", "left"), ("Owner", "left"), ("Deleted on", "left"), ("Kept until", "left"), ("Actions", "left")], deleted, 720)),
              header=f'<div style="display: flex; flex-direction: column; gap: 2px">{h2("Deleted flows")}{note("A deleted flow is kept for 30 days. After that it is removed for good.")}</div>', pad=False)
    head = page_header([("Workspace", None)], "Admin", "Users, groups, access to shared flows, and deleted flows.")
    return shell("Admin", "Admin", "Admin", head, [c1, c2, c3])


def builder_screen():
    host = (ROOT / "canvas_host.html").read_text().strip()
    versions = ["v3, from 01 Jul 2026", "v2, 01 Apr 2026 to 30 Jun 2026", "v1, 01 Jan 2026 to 31 Mar 2026"]
    header = (f'<header style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; box-sizing: border-box; min-height: 64px; padding: 12px 24px; background: #FFFFFF; border-bottom: 1px solid #99F6E4">\n'
              f'<a href="Main.dc.html" style="display: inline-flex; align-items: center; height: 40px; font-weight: 700; text-decoration: none">Flows</a>\n'
              f'<span aria-hidden="true" style="color: #475569">/</span>\n'
              f'<h1 style="margin: 0; font-size: 18px; line-height: 24px; font-weight: 700">Monthly timesheet summary</h1>\n'
              f'{dropdown("Version", versions, 0, 260, "verOpen", "toggle_verOpen")}\n{badge("Published")}\n'
              f'<div style="margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px">{btn("Versions", "secondary", href="Versions.dc.html")}{btn("Save draft", "secondary")}{btn("Run", "cta", href="Run.dc.html")}</div>\n</header>')
    groups = [("Files", ["Input file", "Output"]), ("Shape", ["Column mapping", "Filter", "Formula column", "Unpivot", "Pivot", "Group by"]),
              ("Combine", ["Lookup / Join", "Append"]), ("Advanced", ["SQL"])]
    pal = ""
    for gname, items in groups:
        pal += f'<span style="font-size: 12px; font-weight: 700; color: #475569; padding: 8px 4px 2px">{gname}</span>\n'
        for it in items:
            pal += btn(it, "secondary", "sm", extra="justify-content: flex-start; width: 100%; cursor: grab") + "\n"
    palette = (f'<aside aria-label="Step types" style="flex: 0 0 184px; box-sizing: border-box; padding: 16px 12px; background: #FFFFFF; border-right: 1px solid #99F6E4; display: flex; flex-direction: column; gap: 4px">\n'
               f'{h2("Add a step")}\n{note("Drag a step onto the canvas.")}\n{pal}</aside>')
    zoom = (f'<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; width: 680px; max-width: 100%; margin: 0 auto 12px">\n'
            f'<span style="color: #475569; font-weight: 600">12 steps, 3 output sheets</span>\n'
            f'<div style="display: flex; align-items: center; gap: 4px">{btn("-", "secondary", "sm", aria="Zoom out", extra="width: 36px; padding: 0; font-size: 16px")}'
            f'<span style="min-width: 48px; text-align: center; font-weight: 600">100%</span>'
            f'{btn("+", "secondary", "sm", aria="Zoom in", extra="width: 36px; padding: 0; font-size: 16px")}{btn("Fit to screen", "secondary", "sm")}</div>\n</div>')
    canvas = f'<section aria-label="Canvas" style="flex: 999 1 560px; min-width: 0; box-sizing: border-box; padding: 16px; overflow-x: auto">\n{zoom}\n{host}\n</section>'

    def tab(label, on):
        look = "border-bottom: 3px solid #C2410C; color: #134E4A" if on else "border-bottom: 3px solid transparent; color: #475569"
        return (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="height: 40px; padding: 0 16px; border: 0; {look}; background: none; '
                f'font: 600 14px {FONT}; cursor: pointer">{label}</button>')
    formula = ('IFS(\n  [OT month] &gt; [Month limit],\n    "Over month limit",\n  [OT week max] &gt; [Week limit],\n    "Over week limit",\n'
               '  [OT day] &gt; [Day limit],\n    "Over day limit",\n  TRUE, "OK")')
    fns = "".join(btn(f, "secondary", "sm", extra=f"font-family: {MONO}") for f in ("IF", "IFS", "AND", "ROUND", "DATEDIF", "EFFECTIVE_DATE"))
    hot = lambda t: f'<b style="color: #9A3412">{t}</b>'
    test = table([("Employee ID", "left"), ("OT month (h)", "right"), ("OT flag", "left")],
                 [["E0002", "8", "OK"], ["E0004", "9", hot("Over day limit")], ["E0005", "36", hot("Over week limit")], ["E0006", "42", hot("Over month limit")]], 320)
    panel = (f'<aside aria-label="Step settings" style="flex: 0 0 380px; box-sizing: border-box; padding: 20px; background: #FFFFFF; border-left: 1px solid #99F6E4; display: flex; flex-direction: column; gap: 16px">\n'
             f'<div style="display: flex; flex-direction: column; gap: 2px">{h2("8. Flag OT limits")}{note("Formula column. Adds one column to every row.")}</div>\n'
             f'<div style="display: flex; gap: 4px; border-bottom: 1px solid #E8F1F4">{tab("Setup", False)}{tab("Configure", True)}{tab("Test", False)}</div>\n'
             f'{text_field("New column name", "OT flag")}\n'
             f'<label style="display: flex; flex-direction: column; gap: 6px; font-weight: 700">Formula\n'
             f'<textarea rows="9" style="box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #6F918D; font: 400 13px {MONO}; line-height: 20px; color: #134E4A; resize: none">{formula}</textarea>\n'
             f'<span style="font-weight: 500; font-size: 12px; color: #115E59">Formula is valid. Result type: text.</span>\n</label>\n'
             f'<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 700">Insert a function</span>\n'
             f'<div style="display: flex; flex-wrap: wrap; gap: 6px">{fns}{btn("All functions", "secondary", "sm")}</div>\n</div>\n'
             f'<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 700">Test result, first rows</span>\n'
             f'<div style="border: 1px solid #E8F1F4; border-radius: 12px; overflow: hidden">{loading(test, [30, 30, 40], 4)}</div>\n</div>\n'
             f'<div style="margin-top: auto; display: flex; align-items: center; gap: 8px">{btn("Continue", "primary", extra="flex: 1")}{btn("Delete step", "danger")}</div>\n</aside>')
    root = (f'<div style="display: flex; flex-direction: column; min-height: {HEIGHTS["Builder"]}px; {ROOT_STYLE}">\n{header}\n'
            f'<div style="display: flex; flex-wrap: wrap; flex: 1">\n{palette}\n{canvas}\n{panel}\n</div>\n</div>')
    return document("Builder", "Flow builder", root, logic(toggle_logic("verOpen")))


def components_screen():
    def block(title, body, min_h=0):
        mh = f" min-height: {min_h}px;" if min_h else ""
        return (f'<section style="{CARD}; padding: 20px; display: flex; flex-direction: column; gap: 16px;{mh}">\n{h2(title)}\n{body}\n</section>')

    def row(label, *items):
        return (f'<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px"><span style="width: 120px; font-size: 12px; font-weight: 700; color: #475569">{label}</span>'
                f'{"".join(items)}</div>')
    spinner = ('<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" style="fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; '
               'animation: dfw-spin 0.8s linear infinite"><path d="M12 3a9 9 0 1 0 9 9"/></svg>')
    buttons = block("Buttons: two sizes, one radius",
                    row("Default, 40 px", btn("Run", "cta"), btn("New version", "primary"), btn("Save draft", "secondary"), btn("Delete step", "danger"),
                        btn("Not available", "disabled"), btn(spinner + "Running", "primary", attrs=' aria-busy="true"'))
                    + "\n" + row("Compact, 36 px", btn("Run", "primary", "sm"), btn("Open", "secondary", "sm"), btn("Delete", "danger", "sm"), btn("Not available", "disabled", "sm"))
                    + "\n" + note("Orange is used once per screen, for the main action. Compact buttons are used inside tables and toolbars."))
    fields = block("Text fields and checkboxes",
                   f'<div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end">'
                   f'<div style="width: 240px">{text_field("New column name", "OT flag")}</div>{search_field("Search", "Flow name")}</div>\n'
                   + row("Checkbox", checkbox("View and run", True), checkbox("View and run", False), checkbox("Not available", False, disabled=True)))
    dd = block("Dropdown, closed and open",
               f'<div style="display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start">'
               f'{dropdown("Version", ["v3, from 01 Jul 2026", "v2, 01 Apr 2026 to 30 Jun 2026", "v1, 01 Jan 2026 to 31 Mar 2026"], 0)}'
               f'{dropdown("Version", ["v3, from 01 Jul 2026", "v2, 01 Apr 2026 to 30 Jun 2026", "v1, 01 Jan 2026 to 31 Mar 2026"], 0, static_open=True)}</div>', 220)
    dp = block("Date picker, closed and open",
               f'<div style="display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start">'
               f'{date_picker("Effective date", 2026, 9, 30)}{date_picker("Effective date", 2026, 9, 30, static_open=True)}</div>', 420)
    sk = block("Loading: the skeleton keeps the layout of the table",
               f'<div style="border: 1px solid #E8F1F4; border-radius: 12px; overflow: hidden">{skeleton([30, 16, 8, 14, 14, 18], 3, overlay=False)}</div>\n'
               + note("Shown only when loading takes longer than about 0.3 seconds, so fast screens do not flash."))
    progress = block("Run in progress",
                     '<div role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="12" aria-valuenow="7" style="height: 8px; border-radius: 4px; background: #E8F1F4; overflow: hidden">'
                     '<div style="width: 58%; height: 100%; background: #0F766E"></div></div>\n'
                     f'<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px"><span><b>Step 7 of 12</b>: Group OT hours</span>{btn("Cancel run", "secondary", "sm")}</div>')
    empty = block("Empty state",
                  f'<div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; text-align: center">{icon("inbox", 40, "#0F766E")}'
                  f'<b style="font-size: 16px">No flows yet</b><span style="color: #475569">Create your first flow, or ask the admin to share one with your group.</span>{btn("Create flow", "cta")}</div>')
    error = block("Error state",
                  f'<div role="alert" style="display: flex; gap: 12px; padding: 12px 16px; border-radius: 8px; border: 1px solid #B91C1C; background: #FEF2F2; color: #7F1D1D">{icon("alert", 20, "#B91C1C")}'
                  f'<div style="display: flex; flex-direction: column; gap: 8px"><span><b>The timesheet file could not be read.</b> Row 3 has no header named Employee ID. Check the header row in the Input file step, or choose another file.</span>'
                  f'<div style="display: flex; gap: 8px">{btn("Choose another file", "secondary", "sm")}{btn("Open the Input file step", "secondary", "sm")}</div></div></div>')
    dialog = block("Confirm before delete",
                   f'<div role="dialog" aria-label="Delete flow" style="align-self: center; width: 420px; max-width: 100%; box-sizing: border-box; padding: 20px; border-radius: 12px; border: 1px solid #6F918D; '
                   f'box-shadow: 0 8px 24px rgba(19, 78, 74, 0.14); display: flex; flex-direction: column; gap: 12px"><b style="font-size: 16px">Delete Monthly timesheet summary?</b>'
                   f'<span style="color: #475569">The flow and its 4 versions move to Deleted flows. The admin can restore it within 30 days.</span>'
                   f'<div style="display: flex; justify-content: flex-end; gap: 8px">{btn("Cancel", "secondary")}{btn("Delete flow", "secondary", extra="border-color: #B91C1C; color: #B91C1C")}</div></div>')
    grid = "display: grid; grid-template-columns: repeat(auto-fit, minmax(min(560px, 100%), 1fr)); gap: 24px; align-items: stretch"
    root = (f'<div style="box-sizing: border-box; min-height: {HEIGHTS["Components"]}px; padding: 32px 40px; display: flex; flex-direction: column; gap: 24px; {ROOT_STYLE}">\n'
            f'{page_header([("Design reference", None)], "Components and states", "Every control is built for this app. No browser-default dropdown, date picker, or checkbox is used.")}\n'
            f'<div style="{grid}">\n{buttons}\n{fields}\n{dd}\n{dp}\n{sk}\n{empty}\n{progress}\n{error}\n{dialog}\n</div>\n</div>')
    return document("Components", "Components and states", root)


SCREENS = {"Main": main_screen, "Builder": builder_screen, "Run": run_screen, "Versions": versions_screen,
           "RefTables": reftables_screen, "Admin": admin_screen, "Components": components_screen}

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, fn in SCREENS.items():
        (OUT / f"{name}.dc.html").write_text(fn())
    print("built", ", ".join(SCREENS))
