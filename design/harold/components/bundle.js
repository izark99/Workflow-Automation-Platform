/* @ds-bundle: {"format":4,"namespace":"Harold","components":[{"name":"Icon"},{"name":"Button"},{"name":"IconButton"},{"name":"Spinner"},{"name":"TextField"},{"name":"Select"},{"name":"DatePicker"},{"name":"Checkbox"},{"name":"RadioGroup"},{"name":"Switch"},{"name":"Card"},{"name":"KpiTile"},{"name":"Badge"},{"name":"Chip"},{"name":"Avatar"},{"name":"ProgressBar"},{"name":"Skeleton"},{"name":"Table"},{"name":"Pagination"},{"name":"Alert"},{"name":"Toaster"},{"name":"Tooltip"},{"name":"Dialog"},{"name":"Sheet"},{"name":"Tabs"},{"name":"SegmentedControl"},{"name":"Menu"},{"name":"Breadcrumbs"},{"name":"Sidebar"},{"name":"NavItem"},{"name":"TopBar"},{"name":"AppBar"},{"name":"BottomNav"},{"name":"ListItem"},{"name":"EmptyState"}]} */
/* Harold design system components. Requires React 18 (window.React, window.ReactDOM). Icons: Lucide v0.460.0, ISC license. */
(function () {
  "use strict";
  var R = window.React;
  var h = R.createElement;
  var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef, useCallback = R.useCallback, useMemo = R.useMemo, useId = R.useId || function () { var r = useRef(null); if (!r.current) r.current = "hd" + Math.random().toString(36).slice(2, 8); return r.current; };

  var ICONS = {"check":[["path",{"d":"M20 6 9 17l-5-5"}]],"x":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"chevron-down":[["path",{"d":"m6 9 6 6 6-6"}]],"chevron-up":[["path",{"d":"m18 15-6-6-6 6"}]],"chevron-left":[["path",{"d":"m15 18-6-6 6-6"}]],"chevron-right":[["path",{"d":"m9 18 6-6-6-6"}]],"chevrons-up-down":[["path",{"d":"m7 15 5 5 5-5"}],["path",{"d":"m7 9 5-5 5 5"}]],"calendar":[["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}]],"search":[["circle",{"cx":"11","cy":"11","r":"8"}],["path",{"d":"m21 21-4.3-4.3"}]],"plus":[["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],"minus":[["path",{"d":"M5 12h14"}]],"trash-2":[["path",{"d":"M3 6h18"}],["path",{"d":"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"}],["path",{"d":"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"}],["line",{"x1":"10","x2":"10","y1":"11","y2":"17"}],["line",{"x1":"14","x2":"14","y1":"11","y2":"17"}]],"pencil":[["path",{"d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}],["path",{"d":"m15 5 4 4"}]],"download":[["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{"points":"7 10 12 15 17 10"}],["line",{"x1":"12","x2":"12","y1":"15","y2":"3"}]],"upload":[["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["polyline",{"points":"17 8 12 3 7 8"}],["line",{"x1":"12","x2":"12","y1":"3","y2":"15"}]],"filter":[["polygon",{"points":"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"}]],"ellipsis":[["circle",{"cx":"12","cy":"12","r":"1"}],["circle",{"cx":"19","cy":"12","r":"1"}],["circle",{"cx":"5","cy":"12","r":"1"}]],"info":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]],"triangle-alert":[["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]],"circle-alert":[["circle",{"cx":"12","cy":"12","r":"10"}],["line",{"x1":"12","x2":"12","y1":"8","y2":"12"}],["line",{"x1":"12","x2":"12.01","y1":"16","y2":"16"}]],"circle-check":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m9 12 2 2 4-4"}]],"circle-x":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m15 9-6 6"}],["path",{"d":"m9 9 6 6"}]],"loader-circle":[["path",{"d":"M21 12a9 9 0 1 1-6.219-8.56"}]],"house":[["path",{"d":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"}],["path",{"d":"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}]],"users":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{"cx":"9","cy":"7","r":"4"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87"}],["path",{"d":"M16 3.13a4 4 0 0 1 0 7.75"}]],"user":[["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{"cx":"12","cy":"7","r":"4"}]],"settings":[["path",{"d":"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"bell":[["path",{"d":"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"}],["path",{"d":"M10.3 21a1.94 1.94 0 0 0 3.4 0"}]],"file-spreadsheet":[["path",{"d":"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"}],["path",{"d":"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{"d":"M8 13h2"}],["path",{"d":"M14 13h2"}],["path",{"d":"M8 17h2"}],["path",{"d":"M14 17h2"}]],"workflow":[["rect",{"width":"8","height":"8","x":"3","y":"3","rx":"2"}],["path",{"d":"M7 11v4a2 2 0 0 0 2 2h4"}],["rect",{"width":"8","height":"8","x":"13","y":"13","rx":"2"}]],"play":[["polygon",{"points":"6 3 20 12 6 21 6 3"}]],"chart-column":[["path",{"d":"M3 3v16a2 2 0 0 0 2 2h16"}],["path",{"d":"M18 17V9"}],["path",{"d":"M13 17V5"}],["path",{"d":"M8 17v-3"}]],"trending-up":[["polyline",{"points":"22 7 13.5 15.5 8.5 10.5 2 17"}],["polyline",{"points":"16 7 22 7 22 13"}]],"trending-down":[["polyline",{"points":"22 17 13.5 8.5 8.5 13.5 2 7"}],["polyline",{"points":"16 17 22 17 22 11"}]],"arrow-up":[["path",{"d":"m5 12 7-7 7 7"}],["path",{"d":"M12 19V5"}]],"arrow-down":[["path",{"d":"M12 5v14"}],["path",{"d":"m19 12-7 7-7-7"}]],"log-out":[["path",{"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}],["polyline",{"points":"16 17 21 12 16 7"}],["line",{"x1":"21","x2":"9","y1":"12","y2":"12"}]],"menu":[["line",{"x1":"4","x2":"20","y1":"12","y2":"12"}],["line",{"x1":"4","x2":"20","y1":"6","y2":"6"}],["line",{"x1":"4","x2":"20","y1":"18","y2":"18"}]],"eye":[["path",{"d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"copy":[["rect",{"width":"14","height":"14","x":"8","y":"8","rx":"2","ry":"2"}],["path",{"d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]],"refresh-cw":[["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]],"inbox":[["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}]],"clock":[["circle",{"cx":"12","cy":"12","r":"10"}],["polyline",{"points":"12 6 12 12 16 14"}]],"wallet":[["path",{"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}],["path",{"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],"briefcase":[["path",{"d":"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"}],["rect",{"width":"20","height":"14","x":"2","y":"6","rx":"2"}]],"calendar-days":[["path",{"d":"M8 2v4"}],["path",{"d":"M16 2v4"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2"}],["path",{"d":"M3 10h18"}],["path",{"d":"M8 14h.01"}],["path",{"d":"M12 14h.01"}],["path",{"d":"M16 14h.01"}],["path",{"d":"M8 18h.01"}],["path",{"d":"M12 18h.01"}],["path",{"d":"M16 18h.01"}]],"list-filter":[["path",{"d":"M3 6h18"}],["path",{"d":"M7 12h10"}],["path",{"d":"M10 18h4"}]]};

  function cx() { var out = []; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; if (a) out.push(a); } return out.join(" "); }
  function omit(obj, keys) { var o = {}; for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) o[k] = obj[k]; } return o; }

  /* Keeps an element mounted for its exit animation. */
  function usePresence(open, exitMs) {
    var st = useState(open), mounted = st[0], setMounted = st[1];
    var cl = useState(false), closing = cl[0], setClosing = cl[1];
    useEffect(function () {
      if (open) { setMounted(true); setClosing(false); return; }
      if (!mounted) return;
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setClosing(true);
      var t = setTimeout(function () { setMounted(false); setClosing(false); }, reduce ? 0 : exitMs);
      return function () { clearTimeout(t); };
    }, [open]);
    return [mounted, closing];
  }

  function useOutside(ref, onOutside, active) {
    useEffect(function () {
      if (!active) return;
      function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onOutside(); }
      document.addEventListener("mousedown", onDown);
      document.addEventListener("touchstart", onDown);
      return function () { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
    }, [active, onOutside]);
  }

  /* ---------- Icon ---------- */
  function Icon(p) {
    var nodes = ICONS[p.name];
    var size = p.size || 20;
    var stroke = p.strokeWidth || (size <= 16 ? 2 : 1.75);
    var kids = (nodes || []).map(function (n, i) { return h(n[0], Object.assign({ key: i }, n[1])); });
    return h("svg", {
      className: cx("hd-icon", p.spin && "hd-spin", p.className), width: size, height: size, viewBox: "0 0 24 24", fill: "none",
      stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round",
      "aria-hidden": p.label ? undefined : true, role: p.label ? "img" : undefined, "aria-label": p.label, style: p.style
    }, kids);
  }
  Icon.names = Object.keys(ICONS);

  function Spinner(p) { return h(Icon, { name: "loader-circle", size: p.size || 16, spin: true, label: p.label || "Loading", className: p.className }); }

  /* ---------- Button ---------- */
  var Button = R.forwardRef(function Button(p, ref) {
    var variant = p.variant || "secondary", size = p.size || "md";
    var rest = omit(p, ["variant", "size", "icon", "iconRight", "loading", "block", "className", "children", "as"]);
    var iconSize = size === "lg" ? 20 : 16;
    var tag = p.as || "button";
    if (tag === "button" && !rest.type) rest.type = "button";
    return h(tag, Object.assign(rest, {
      ref: ref,
      className: cx("hd-btn", "hd-btn--" + variant, size !== "md" && "hd-btn--" + size, p.block && "hd-btn--block", p.className),
      "aria-busy": p.loading ? "true" : undefined,
      disabled: tag === "button" ? (p.disabled || p.loading) : undefined
    }),
      p.loading ? h("span", { className: "hd-btn__spinner" }, h(Spinner, { size: iconSize })) : null,
      h("span", { className: "hd-btn__label", style: { display: "inline-flex", alignItems: "center", gap: "8px" } },
        p.icon ? h(Icon, { name: p.icon, size: iconSize }) : null,
        p.children,
        p.iconRight ? h(Icon, { name: p.iconRight, size: iconSize }) : null));
  });

  var IconButton = R.forwardRef(function IconButton(p, ref) {
    var variant = p.variant || "ghost", size = p.size || "md";
    var rest = omit(p, ["variant", "size", "icon", "label", "className", "tooltip"]);
    var btn = h("button", Object.assign({ type: "button" }, rest, {
      ref: ref,
      className: cx("hd-btn", "hd-btn--icon", "hd-btn--" + variant, size !== "md" && "hd-btn--" + size, p.className),
      "aria-label": p.label
    }), h(Icon, { name: p.icon, size: size === "lg" ? 22 : size === "sm" ? 16 : 20 }));
    return p.tooltip === false ? btn : h(Tooltip, { content: p.label }, btn);
  });

  /* ---------- Field shell ---------- */
  function Field(p) {
    return h("div", { className: cx("hd-field", p.className), style: p.style },
      p.label ? h("label", { className: "hd-field__label", htmlFor: p.id, id: p.id + "-label" }, p.label, p.required ? h("span", { className: "hd-field__req", "aria-hidden": true }, "*") : null) : null,
      p.children,
      p.error ? h("div", { className: "hd-field__error", id: p.id + "-msg", role: "alert" }, h(Icon, { name: "circle-alert", size: 14 }), p.error)
        : p.helper ? h("div", { className: "hd-field__help", id: p.id + "-msg" }, p.helper) : null);
  }

  function TextField(p) {
    var autoId = useId(); var id = p.id || autoId;
    var rest = omit(p, ["label", "helper", "error", "icon", "suffix", "size", "multiline", "className", "style", "id", "onValueChange"]);
    var tag = p.multiline ? "textarea" : "input";
    var input = h(tag, Object.assign(rest, {
      id: id, className: "hd-input",
      "aria-invalid": p.error ? "true" : undefined,
      "aria-describedby": (p.error || p.helper) ? id + "-msg" : undefined,
      onChange: function (e) { if (p.onChange) p.onChange(e); if (p.onValueChange) p.onValueChange(e.target.value); }
    }));
    return h(Field, { id: id, label: p.label, helper: p.helper, error: p.error, required: p.required, className: p.className, style: p.style },
      h("div", { className: cx("hd-control", p.size && "hd-control--" + p.size, p.multiline && "hd-control--area"), "data-invalid": p.error ? "true" : undefined, "data-disabled": p.disabled ? "true" : undefined },
        p.icon ? h(Icon, { name: p.icon, size: 18 }) : null, input,
        p.suffix ? h("span", { style: { color: "var(--ink-muted)", fontSize: "14px" } }, p.suffix) : null));
  }

  /* ---------- Select (custom listbox) ---------- */
  function Select(p) {
    var autoId = useId(); var id = p.id || autoId;
    var options = p.options || [];
    var st = useState(!!p.defaultOpen), open = st[0], setOpen = st[1];
    var ac = useState(-1), active = ac[0], setActive = ac[1];
    var inner = useState(p.defaultValue), innerVal = inner[0], setInnerVal = inner[1];
    var value = p.value !== undefined ? p.value : innerVal;
    var wrap = useRef(null), btn = useRef(null), typed = useRef({ s: "", t: 0 });
    var pres = usePresence(open, 120);
    var close = useCallback(function () { setOpen(false); }, []);
    useOutside(wrap, close, open);
    var selIdx = options.findIndex(function (o) { return o.value === value; });
    var sel = options[selIdx];
    function choose(i) { var o = options[i]; if (!o || o.disabled) return; if (p.value === undefined) setInnerVal(o.value); if (p.onChange) p.onChange(o.value, o); setOpen(false); if (btn.current) btn.current.focus(); }
    function move(d) { var i = active; for (var n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break; } setActive(i); }
    function onKey(e) {
      if (p.disabled) return;
      if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); setActive(selIdx >= 0 ? selIdx : 0); return; }
      if (!open) return;
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Home") { e.preventDefault(); setActive(0); }
      else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
      else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); }
      else if (e.key.length === 1) {
        var now = Date.now(); typed.current.s = (now - typed.current.t > 600 ? "" : typed.current.s) + e.key.toLowerCase(); typed.current.t = now;
        var f = options.findIndex(function (o) { return String(o.label).toLowerCase().indexOf(typed.current.s) === 0; }); if (f >= 0) setActive(f);
      }
    }
    return h(Field, { id: id, label: p.label, helper: p.helper, error: p.error, required: p.required, className: p.className, style: p.style },
      h("div", { className: "hd-anchor", ref: wrap },
        h("div", { className: cx("hd-control", p.size && "hd-control--" + p.size), "data-open": open ? "true" : undefined, "data-invalid": p.error ? "true" : undefined, "data-disabled": p.disabled ? "true" : undefined },
          p.icon ? h(Icon, { name: p.icon, size: 18 }) : null,
          h("button", {
            type: "button", id: id, ref: btn, className: "hd-trigger", disabled: p.disabled,
            "aria-haspopup": "listbox", "aria-expanded": open, "aria-controls": id + "-list",
            "aria-activedescendant": open && active >= 0 ? id + "-o" + active : undefined,
            onClick: function () { if (!p.disabled) { setOpen(!open); setActive(selIdx >= 0 ? selIdx : 0); } }, onKeyDown: onKey
          },
            h("span", { className: "hd-trigger__value", "data-placeholder": sel ? undefined : "true" }, sel ? sel.label : (p.placeholder || "Select")),
            h(Icon, { name: "chevron-down", size: 18, className: "hd-chev" }))),
        pres[0] ? h("div", { className: "hd-pop", "data-closing": pres[1] ? "true" : undefined },
          h("ul", { className: "hd-list", role: "listbox", id: id + "-list", "aria-labelledby": id + "-label" },
            options.map(function (o, i) {
              return h("li", {
                key: String(o.value), id: id + "-o" + i, role: "option", className: "hd-option",
                "aria-selected": o.value === value, "aria-disabled": o.disabled ? "true" : undefined, "data-active": i === active ? "true" : undefined,
                onMouseEnter: function () { setActive(i); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { choose(i); }
              }, o.icon ? h(Icon, { name: o.icon, size: 16 }) : null, h("span", null, o.label),
                o.value === value ? h(Icon, { name: "check", size: 16, className: "hd-option__check" }) : null);
            }))) : null));
  }

  /* ---------- DatePicker ---------- */
  var DOW = { vi: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"], en: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] };
  var MONTHS = { vi: function (m, y) { return "Tháng " + (m + 1) + ", " + y; }, en: function (m, y) { return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m] + " " + y; } };
  function toDate(v) { if (!v) return null; if (v instanceof Date) return v; var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmt(d) { return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); }
  function same(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function Calendar(p) {
    var locale = p.locale || "vi";
    var sel = toDate(p.value);
    var start = sel || new Date();
    var vs = useState(new Date(start.getFullYear(), start.getMonth(), 1)), view = vs[0], setView = vs[1];
    var fs = useState(sel || new Date()), focus = fs[0], setFocus = fs[1];
    var grid = useRef(null);
    useEffect(function () { var b = grid.current && grid.current.querySelector('[data-focus="true"]'); if (b && p.autoFocus) b.focus(); }, [focus, view]);
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var offset = (first.getDay() + 6) % 7;
    var days = [];
    for (var i = 0; i < 42; i++) days.push(new Date(view.getFullYear(), view.getMonth(), 1 - offset + i));
    var today = new Date();
    function shift(n) { var d = new Date(focus); d.setDate(d.getDate() + n); setFocus(d); if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) setView(new Date(d.getFullYear(), d.getMonth(), 1)); }
    function onKey(e) {
      var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (map[e.key]) { e.preventDefault(); shift(map[e.key]); }
      else if (e.key === "PageUp") { e.preventDefault(); shift(-30); }
      else if (e.key === "PageDown") { e.preventDefault(); shift(30); }
      else if (e.key === "Escape" && p.onCancel) p.onCancel();
    }
    return h("div", { className: "hd-cal" },
      h("div", { className: "hd-cal__head" },
        h(IconButton, { icon: "chevron-left", size: "sm", label: locale === "vi" ? "Tháng trước" : "Previous month", tooltip: false, onClick: function () { setView(new Date(view.getFullYear(), view.getMonth() - 1, 1)); } }),
        h("span", { "aria-live": "polite" }, MONTHS[locale](view.getMonth(), view.getFullYear())),
        h(IconButton, { icon: "chevron-right", size: "sm", label: locale === "vi" ? "Tháng sau" : "Next month", tooltip: false, onClick: function () { setView(new Date(view.getFullYear(), view.getMonth() + 1, 1)); } })),
      h("div", { className: "hd-cal__grid", role: "grid", ref: grid, onKeyDown: onKey },
        DOW[locale].map(function (d) { return h("div", { key: d, className: "hd-cal__dow", role: "columnheader" }, d); }),
        days.map(function (d) {
          var isFocus = same(d, focus);
          return h("button", {
            key: iso(d), type: "button", role: "gridcell", className: "hd-cal__day", tabIndex: isFocus ? 0 : -1,
            "data-focus": isFocus ? "true" : undefined, "data-outside": d.getMonth() !== view.getMonth() ? "true" : undefined,
            "data-today": same(d, today) ? "true" : undefined, "aria-selected": same(d, sel) ? "true" : undefined, "aria-label": fmt(d),
            onClick: function () { setFocus(d); p.onSelect(d); }
          }, d.getDate());
        })),
      h("div", { className: "hd-cal__foot" },
        h(Button, { variant: "ghost", size: "sm", onClick: function () { p.onSelect(new Date()); } }, locale === "vi" ? "Hôm nay" : "Today"),
        p.onClear ? h(Button, { variant: "ghost", size: "sm", onClick: p.onClear }, locale === "vi" ? "Xoá" : "Clear") : null));
  }

  function DatePicker(p) {
    var autoId = useId(); var id = p.id || autoId;
    var st = useState(!!p.defaultOpen), open = st[0], setOpen = st[1];
    var userOpened = useRef(false);
    var inner = useState(p.defaultValue || null), innerVal = inner[0], setInnerVal = inner[1];
    var value = p.value !== undefined ? p.value : innerVal;
    var d = toDate(value);
    var wrap = useRef(null), btn = useRef(null);
    var pres = usePresence(open, 120);
    var close = useCallback(function () { setOpen(false); }, []);
    useOutside(wrap, close, open);
    function set(v) { if (p.value === undefined) setInnerVal(v); if (p.onChange) p.onChange(v); setOpen(false); if (btn.current) btn.current.focus(); }
    return h(Field, { id: id, label: p.label, helper: p.helper, error: p.error, required: p.required, className: p.className, style: p.style },
      h("div", { className: "hd-anchor", ref: wrap },
        h("div", { className: cx("hd-control", p.size && "hd-control--" + p.size), "data-open": open ? "true" : undefined, "data-invalid": p.error ? "true" : undefined, "data-disabled": p.disabled ? "true" : undefined },
          h("button", {
            type: "button", id: id, ref: btn, className: "hd-trigger", disabled: p.disabled, "aria-haspopup": "dialog", "aria-expanded": open,
            onClick: function () { userOpened.current = true; setOpen(!open); }, onKeyDown: function (e) { if (e.key === "ArrowDown") { e.preventDefault(); userOpened.current = true; setOpen(true); } }
          },
            h("span", { className: "hd-trigger__value hd-num", "data-placeholder": d ? undefined : "true" }, d ? fmt(d) : (p.placeholder || "dd/mm/yyyy")),
            h(Icon, { name: "calendar", size: 18 }))),
        pres[0] ? h("div", { className: "hd-pop", role: "dialog", "aria-label": p.label || "Choose date", "data-closing": pres[1] ? "true" : undefined, style: { minWidth: 0 } },
          h(Calendar, { value: d, locale: p.locale, autoFocus: userOpened.current, onSelect: function (x) { set(iso(x)); }, onCancel: function () { setOpen(false); if (btn.current) btn.current.focus(); }, onClear: p.clearable ? function () { set(null); } : null })) : null));
  }

  /* ---------- Checkbox, RadioGroup, Switch ---------- */
  function Checkbox(p) {
    var ref = useRef(null);
    useEffect(function () { if (ref.current) ref.current.indeterminate = !!p.indeterminate; }, [p.indeterminate]);
    var rest = omit(p, ["label", "indeterminate", "className", "description", "onCheckedChange"]);
    return h("label", { className: cx("hd-check", p.className) },
      h("input", Object.assign(rest, { ref: ref, type: "checkbox", onChange: function (e) { if (p.onChange) p.onChange(e); if (p.onCheckedChange) p.onCheckedChange(e.target.checked); } })),
      h("span", { className: "hd-check__box", "aria-hidden": true }, h(Icon, { name: p.indeterminate ? "minus" : "check", size: 14, strokeWidth: 3 })),
      p.label ? h("span", null, p.label, p.description ? h("span", { style: { display: "block", fontSize: "13px", lineHeight: "18px", color: "var(--ink-muted)" } }, p.description) : null) : null);
  }

  function RadioGroup(p) {
    var autoName = useId(); var name = p.name || autoName;
    var inner = useState(p.defaultValue), innerVal = inner[0], setInnerVal = inner[1];
    var value = p.value !== undefined ? p.value : innerVal;
    return h("div", { role: "radiogroup", "aria-label": p.label, className: cx("hd-field", p.className) },
      p.label ? h("span", { className: "hd-field__label" }, p.label) : null,
      h("div", { style: { display: "flex", flexDirection: p.inline ? "row" : "column", gap: p.inline ? "16px" : "8px", flexWrap: "wrap" } },
        (p.options || []).map(function (o) {
          return h("label", { key: String(o.value), className: "hd-check hd-check--radio" },
            h("input", { type: "radio", name: name, value: o.value, checked: value === o.value, disabled: o.disabled, onChange: function () { if (p.value === undefined) setInnerVal(o.value); if (p.onChange) p.onChange(o.value); } }),
            h("span", { className: "hd-check__box", "aria-hidden": true }, h("span", { className: "hd-check__dot" })),
            h("span", null, o.label));
        })));
  }

  function Switch(p) {
    var inner = useState(!!p.defaultChecked), innerVal = inner[0], setInnerVal = inner[1];
    var checked = p.checked !== undefined ? p.checked : innerVal;
    var autoId = useId(); var id = p.id || autoId;
    return h("span", { className: cx("hd-switch", p.className) },
      h("button", { type: "button", role: "switch", id: id, className: "hd-switch__track", "aria-checked": checked ? "true" : "false", disabled: p.disabled, "aria-label": p.label ? undefined : p["aria-label"],
        onClick: function () { var v = !checked; if (p.checked === undefined) setInnerVal(v); if (p.onChange) p.onChange(v); } }),
      p.label ? h("label", { htmlFor: id, style: { cursor: "pointer" } }, p.label) : null);
  }

  /* ---------- Card, KpiTile ---------- */
  function Card(p) {
    var rest = omit(p, ["title", "subtitle", "actions", "flat", "inset", "interactive", "className", "children", "bodyStyle"]);
    return h("section", Object.assign(rest, { className: cx("hd-card", p.flat && "hd-card--flat", p.inset && "hd-card--inset", p.interactive && "hd-card--interactive", p.className), tabIndex: p.interactive ? 0 : undefined }),
      (p.title || p.actions) ? h("div", { className: "hd-card__head" },
        h("div", null, p.title ? h("h3", { className: "hd-card__title" }, p.title) : null, p.subtitle ? h("p", { className: "hd-card__sub" }, p.subtitle) : null),
        p.actions || null) : null,
      h("div", { className: "hd-card__body", style: p.bodyStyle }, p.children));
  }

  function KpiTile(p) {
    if (p.loading) {
      return h("div", { className: cx("hd-card hd-kpi", p.className), "aria-busy": "true", "aria-label": p.label },
        h(Skeleton, { width: "45%", variant: "text" }), h(Skeleton, { width: "60%", height: 36, style: { margin: "4px 0" } }), h(Skeleton, { width: "70%", variant: "text" }));
    }
    var dir = p.delta == null ? null : p.delta > 0 ? "up" : p.delta < 0 ? "down" : "flat";
    var good = p.positiveIsGood === false ? (dir === "down") : (dir === "up");
    var tone = dir === "flat" ? "flat" : (good ? "up" : "down");
    var icon = dir === "up" ? "trending-up" : dir === "down" ? "trending-down" : "minus";
    return h("div", { className: cx("hd-card hd-kpi hd-fade-in", p.className) },
      h("div", { className: "hd-kpi__label" }, p.label),
      h("div", { className: "hd-kpi__value" }, p.value, p.unit ? h("span", { className: "hd-kpi__unit" }, p.unit) : null),
      (dir || p.period) ? h("div", { className: "hd-kpi__foot" },
        dir ? h("span", { className: "hd-delta hd-delta--" + tone }, h(Icon, { name: icon, size: 14 }), p.deltaLabel || ((p.delta > 0 ? "+" : "") + p.delta + "%")) : null,
        p.period ? h("span", null, p.period) : null) : null);
  }

  /* ---------- Badge, Chip, Avatar, ProgressBar ---------- */
  function Badge(p) {
    var tone = p.tone || "neutral";
    var statusIcon = { success: "circle-check", warning: "triangle-alert", danger: "circle-alert", info: "info" }[tone];
    return h("span", { className: cx("hd-badge", "hd-badge--" + tone, p.className) },
      p.dot ? h("span", { className: "hd-badge__dot", "aria-hidden": true }) : (p.icon !== false && statusIcon ? h(Icon, { name: p.icon || statusIcon, size: 12, strokeWidth: 2.25 }) : null),
      p.children);
  }

  function Chip(p) {
    var rest = omit(p, ["selected", "onRemove", "icon", "className", "children"]);
    return h("button", Object.assign({ type: "button" }, rest, { className: cx("hd-chip", p.className), "aria-pressed": p.onRemove ? undefined : (p.selected ? "true" : "false") }),
      p.icon ? h(Icon, { name: p.icon, size: 16 }) : (p.selected && !p.onRemove ? h(Icon, { name: "check", size: 16 }) : null),
      p.children,
      p.onRemove ? h("span", { className: "hd-chip__x", role: "button", "aria-label": "Remove", tabIndex: -1, onClick: function (e) { e.stopPropagation(); p.onRemove(); } }, h(Icon, { name: "x", size: 14 })) : null);
  }

  function initials(name) { var parts = String(name || "").trim().split(/\s+/); if (!parts[0]) return "?"; return ((parts.length > 1 ? parts[parts.length - 2][0] : "") + parts[parts.length - 1][0]).toUpperCase(); }
  function Avatar(p) {
    return h("span", { className: cx("hd-avatar", p.size && p.size !== "md" && "hd-avatar--" + p.size, p.className), title: p.name, "aria-label": p.name, role: "img" },
      p.src ? h("img", { src: p.src, alt: "" }) : initials(p.name));
  }

  function ProgressBar(p) {
    var max = p.max || 100, val = p.value;
    var pct = val == null ? null : Math.max(0, Math.min(100, (val / max) * 100));
    return h("div", { className: cx("hd-progress", p.className) },
      (p.label || p.valueLabel) ? h("div", { className: "hd-progress__top" }, h("span", null, p.label), h("span", { className: "hd-num" }, p.valueLabel)) : null,
      h("div", { className: "hd-progress__track", role: "progressbar", "aria-label": p.label, "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": val == null ? undefined : val },
        h("div", { className: cx("hd-progress__bar", val == null && "hd-progress__bar--indeterminate", val > max && "hd-progress__bar--over"), style: pct == null ? null : { width: pct + "%" } })));
  }

  /* ---------- Skeleton ---------- */
  function Skeleton(p) {
    var v = p.variant || "block";
    if (v === "text" && p.lines > 1) {
      var lines = []; for (var i = 0; i < p.lines; i++) lines.push(h("span", { key: i, className: "hd-skel hd-skel--text", style: { width: i === p.lines - 1 ? "60%" : "100%" } }));
      return h("span", { className: cx("hd-skel-group", p.className), "aria-hidden": true }, lines);
    }
    var size = v === "circle" ? (p.size || 32) : null;
    return h("span", { className: cx("hd-skel", v !== "block" && "hd-skel--" + v, p.className), "aria-hidden": true,
      style: Object.assign({ width: size || p.width || "100%", height: size || p.height, borderRadius: p.radius }, p.style) });
  }

  /* ---------- Table ---------- */
  function Table(p) {
    var cols = p.columns || [], rows = p.rows || [];
    var rowKey = p.rowKey || function (r, i) { return r.id != null ? r.id : i; };
    var ss = useState(p.defaultSort || null), sortInner = ss[0], setSortInner = ss[1];
    var sort = p.sort !== undefined ? p.sort : sortInner;
    var sorted = useMemo(function () {
      if (!sort || p.sort !== undefined) return rows;
      var c = cols.find(function (x) { return x.key === sort.key; });
      var get = c && c.sortValue ? c.sortValue : function (r) { return r[sort.key]; };
      return rows.slice().sort(function (a, b) { var x = get(a), y = get(b); var r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi"); return sort.dir === "desc" ? -r : r; });
    }, [rows, sort && sort.key, sort && sort.dir]);
    function toggleSort(k) { var next = !sort || sort.key !== k ? { key: k, dir: "asc" } : sort.dir === "asc" ? { key: k, dir: "desc" } : null; if (p.sort === undefined) setSortInner(next); if (p.onSortChange) p.onSortChange(next); }
    var selected = p.selected || [];
    var allKeys = sorted.map(rowKey);
    var allOn = allKeys.length > 0 && allKeys.every(function (k) { return selected.indexOf(k) >= 0; });
    var someOn = !allOn && allKeys.some(function (k) { return selected.indexOf(k) >= 0; });
    function toggleRow(k) { if (!p.onSelectedChange) return; p.onSelectedChange(selected.indexOf(k) >= 0 ? selected.filter(function (x) { return x !== k; }) : selected.concat([k])); }
    var head = h("thead", null, h("tr", null,
      p.selectable ? h("th", { className: "hd-table__check" }, h(Checkbox, { checked: allOn, indeterminate: someOn, "aria-label": "Select all rows", onCheckedChange: function (on) { if (p.onSelectedChange) p.onSelectedChange(on ? allKeys : []); } })) : null,
      cols.map(function (c) {
        var isSort = sort && sort.key === c.key;
        var aria = isSort ? (sort.dir === "asc" ? "ascending" : "descending") : (c.sortable ? "none" : undefined);
        return h("th", { key: c.key, scope: "col", "aria-sort": aria, "data-align": c.align, style: { width: c.width, textAlign: c.align || "left" } },
          c.sortable ? h("button", { type: "button", className: "hd-table__sort", "data-active": isSort ? "true" : undefined, onClick: function () { toggleSort(c.key); } },
            c.header, h(Icon, { name: isSort ? (sort.dir === "asc" ? "arrow-up" : "arrow-down") : "chevrons-up-down", size: 14 })) : c.header);
      })));
    var body;
    if (p.loading) {
      var sk = []; for (var i = 0; i < (p.skeletonRows || 5); i++) {
        sk.push(h("tr", { key: "s" + i }, p.selectable ? h("td", null, h(Skeleton, { width: 18, height: 18 })) : null,
          cols.map(function (c, j) { return h("td", { key: c.key }, h(Skeleton, { variant: "text", width: c.align === "right" ? "50%" : (j === 0 ? "70%" : "85%"), style: c.align === "right" ? { marginLeft: "auto" } : null })); })));
      }
      body = h("tbody", { "aria-busy": "true" }, sk);
    } else if (!sorted.length) {
      body = h("tbody", null, h("tr", { className: "hd-table__empty" }, h("td", { colSpan: cols.length + (p.selectable ? 1 : 0) }, p.empty || h(EmptyState, { icon: "inbox", title: "No data", text: "Nothing matches the current filters." }))));
    } else {
      body = h("tbody", { className: "hd-fade-in" }, sorted.map(function (r, i) {
        var k = rowKey(r, i), on = selected.indexOf(k) >= 0;
        return h("tr", { key: k, "aria-selected": p.selectable ? (on ? "true" : "false") : undefined, onClick: p.onRowClick ? function () { p.onRowClick(r); } : undefined, style: p.onRowClick ? { cursor: "pointer" } : null },
          p.selectable ? h("td", { onClick: function (e) { e.stopPropagation(); } }, h(Checkbox, { checked: on, "aria-label": "Select row", onCheckedChange: function () { toggleRow(k); } })) : null,
          cols.map(function (c) { return h("td", { key: c.key, "data-align": c.align, className: c.nowrap ? "hd-nowrap" : undefined, style: { textAlign: c.align || "left" } }, c.render ? c.render(r) : r[c.key]); }));
      }));
    }
    return h("div", { className: cx("hd-table-wrap", p.className), style: p.maxHeight ? { maxHeight: p.maxHeight } : null },
      h("table", { className: cx("hd-table", p.dense && "hd-table--dense") }, p.caption ? h("caption", { className: "hd-sr" }, p.caption) : null, head, body));
  }

  function Pagination(p) {
    var page = p.page || 1, total = Math.max(1, p.pageCount || 1);
    var pages = [];
    var from = Math.max(1, Math.min(page - 2, total - 4)), to = Math.min(total, from + 4);
    for (var i = from; i <= to; i++) pages.push(i);
    function go(n) { if (n >= 1 && n <= total && n !== page && p.onChange) p.onChange(n); }
    return h("nav", { className: cx("hd-pager", p.className), "aria-label": "Pagination" },
      h("span", { className: "hd-num" }, p.summary || null),
      h("div", { className: "hd-pager__pages" },
        h("button", { type: "button", className: "hd-pager__page", disabled: page <= 1, "aria-label": "Previous page", onClick: function () { go(page - 1); } }, h(Icon, { name: "chevron-left", size: 16 })),
        pages.map(function (n) { return h("button", { key: n, type: "button", className: "hd-pager__page", "aria-current": n === page ? "page" : undefined, onClick: function () { go(n); } }, n); }),
        h("button", { type: "button", className: "hd-pager__page", disabled: page >= total, "aria-label": "Next page", onClick: function () { go(page + 1); } }, h(Icon, { name: "chevron-right", size: 16 }))));
  }

  /* ---------- Alert ---------- */
  function Alert(p) {
    var tone = p.tone || "info";
    var icon = { info: "info", success: "circle-check", warning: "triangle-alert", danger: "circle-alert" }[tone];
    return h("div", { className: cx("hd-alert", "hd-alert--" + tone, p.className), role: tone === "danger" ? "alert" : "status" },
      h(Icon, { name: icon, size: 20, className: "hd-alert__icon" }),
      h("div", { style: { flex: 1 } }, p.title ? h("p", { className: "hd-alert__title" }, p.title) : null, p.children ? h("p", { className: "hd-alert__text" }, p.children) : null,
        p.actions ? h("div", { className: "hd-alert__actions" }, p.actions) : null),
      p.onClose ? h(IconButton, { icon: "x", size: "sm", label: "Dismiss", tooltip: false, onClick: p.onClose, style: { margin: "-6px -8px 0 0" } }) : null);
  }

  /* ---------- Toasts ---------- */
  var toastStore = { list: [], subs: [], seq: 0 };
  function emit() { toastStore.subs.forEach(function (f) { f(toastStore.list.slice()); }); }
  function dismissToast(id) {
    toastStore.list = toastStore.list.map(function (t) { return t.id === id ? Object.assign({}, t, { closing: true }) : t; }); emit();
    setTimeout(function () { toastStore.list = toastStore.list.filter(function (t) { return t.id !== id; }); emit(); }, 170);
  }
  function toast(opts) {
    if (typeof opts === "string") opts = { title: opts };
    var id = ++toastStore.seq;
    toastStore.list = toastStore.list.concat([Object.assign({ id: id, tone: "info" }, opts)]).slice(-3); emit();
    var ms = opts.duration === undefined ? 5000 : opts.duration;
    if (ms) setTimeout(function () { dismissToast(id); }, ms);
    return id;
  }
  function Toaster(p) {
    var st = useState(toastStore.list), list = st[0], setList = st[1];
    useEffect(function () { toastStore.subs.push(setList); return function () { toastStore.subs = toastStore.subs.filter(function (f) { return f !== setList; }); }; }, []);
    var items = (p.items || list);
    var icon = { info: "info", success: "circle-check", warning: "triangle-alert", danger: "circle-alert" };
    return h("div", { className: cx("hd-toasts", p.inline && "hd-toasts--inline"), "aria-live": "polite", role: "region", "aria-label": "Notifications" },
      items.map(function (t) {
        return h("div", { key: t.id, className: "hd-toast", role: t.tone === "danger" ? "alert" : "status", "data-closing": t.closing ? "true" : undefined },
          h(Icon, { name: icon[t.tone] || "info", size: 18, style: { marginTop: "1px" } }),
          h("div", { className: "hd-toast__body" }, h("div", { style: { fontWeight: 500 } }, t.title), t.text ? h("div", { style: { opacity: 0.8 } }, t.text) : null,
            t.action ? h("button", { type: "button", className: "hd-toast__action", onClick: function () { t.action.onClick(); dismissToast(t.id); } }, t.action.label) : null),
          h("button", { type: "button", className: "hd-toast__close", "aria-label": "Close", onClick: function () { dismissToast(t.id); } }, h(Icon, { name: "x", size: 16 })));
      }));
  }

  /* ---------- Tooltip ---------- */
  function Tooltip(p) {
    var st = useState(false), show = st[0], setShow = st[1];
    var id = useId(), timer = useRef(null);
    function on() { clearTimeout(timer.current); timer.current = setTimeout(function () { setShow(true); }, 400); }
    function off() { clearTimeout(timer.current); setShow(false); }
    var child = R.Children.only(p.children);
    return h("span", { className: "hd-tip-anchor", onMouseEnter: on, onMouseLeave: off, onFocus: function () { setShow(true); }, onBlur: off, onKeyDown: function (e) { if (e.key === "Escape") off(); } },
      R.cloneElement(child, { "aria-describedby": show ? id : undefined }),
      show && p.content ? h("span", { role: "tooltip", id: id, className: "hd-tip" }, p.content) : null);
  }

  /* ---------- Dialog, Sheet ---------- */
  function useModal(open, onClose, panelRef, autoFocus) {
    var last = useRef(null);
    useEffect(function () {
      if (!open) return;
      last.current = document.activeElement;
      var t = setTimeout(function () {
        var el = panelRef.current; if (!el || autoFocus === false) return;
        var f = el.querySelector("[data-autofocus], input, select, textarea, button:not([aria-label='Close'])") || el;
        f.focus();
      }, 10);
      function onKey(e) {
        if (e.key === "Escape") { e.stopPropagation(); onClose && onClose(); }
        if (e.key === "Tab" && panelRef.current) {
          var nodes = panelRef.current.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])");
          if (!nodes.length) return;
          var first = nodes[0], lastN = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastN.focus(); }
          else if (!e.shiftKey && document.activeElement === lastN) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener("keydown", onKey);
      return function () { clearTimeout(t); document.removeEventListener("keydown", onKey); if (autoFocus !== false && last.current && last.current.focus) last.current.focus(); };
    }, [open]);
  }

  function Dialog(p) {
    var pres = usePresence(p.open, 170);
    var panel = useRef(null), id = useId();
    useModal(p.open, p.onClose, panel, p.autoFocus);
    if (!pres[0]) return null;
    return h("div", { className: cx("hd-scrim", p.contained && "hd-scrim--contained"), "data-closing": pres[1] ? "true" : undefined, onMouseDown: function (e) { if (e.target === e.currentTarget && p.dismissible !== false && p.onClose) p.onClose(); } },
      h("div", { className: "hd-dialog", role: p.tone === "danger" ? "alertdialog" : "dialog", "aria-modal": "true", "aria-labelledby": id, ref: panel, tabIndex: -1, style: p.width ? { width: "min(" + p.width + "px, 100%)" } : null },
        h("div", { className: "hd-dialog__head" }, h("h2", { className: "hd-dialog__title", id: id }, p.title),
          p.onClose ? h(IconButton, { icon: "x", size: "sm", label: "Close", tooltip: false, onClick: p.onClose }) : null),
        h("div", { className: "hd-dialog__body" }, p.children),
        p.footer ? h("div", { className: "hd-dialog__foot" }, p.footer) : null));
  }

  function Sheet(p) {
    var pres = usePresence(p.open, 170);
    var panel = useRef(null), id = useId();
    useModal(p.open, p.onClose, panel, p.autoFocus);
    if (!pres[0]) return null;
    return h("div", { className: cx("hd-scrim hd-scrim--sheet", p.contained && "hd-scrim--contained"), "data-closing": pres[1] ? "true" : undefined, onMouseDown: function (e) { if (e.target === e.currentTarget && p.onClose) p.onClose(); } },
      h("div", { className: "hd-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": id, ref: panel, tabIndex: -1 },
        h("div", { className: "hd-sheet__grip", "aria-hidden": true }),
        h("div", { className: "hd-dialog__head", style: { paddingTop: "8px" } }, h("h2", { className: "hd-dialog__title", id: id }, p.title)),
        h("div", { className: "hd-dialog__body" }, p.children),
        p.footer ? h("div", { className: "hd-dialog__foot", style: { flexDirection: "column-reverse", alignItems: "stretch" } }, p.footer) : null));
  }

  /* ---------- Tabs, SegmentedControl ---------- */
  function TabList(p, seg) {
    var inner = useState(p.defaultValue || (p.items[0] && p.items[0].value)), innerVal = inner[0], setInnerVal = inner[1];
    var value = p.value !== undefined ? p.value : innerVal;
    var refs = useRef([]);
    function pick(v) { if (p.value === undefined) setInnerVal(v); if (p.onChange) p.onChange(v); }
    function onKey(e, i) {
      var n = p.items.length, j = null;
      if (e.key === "ArrowRight") j = (i + 1) % n; else if (e.key === "ArrowLeft") j = (i - 1 + n) % n; else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1;
      if (j != null) { e.preventDefault(); refs.current[j].focus(); pick(p.items[j].value); }
    }
    return h("div", { className: cx(seg ? "hd-seg" : "hd-tabs", p.className), role: "tablist", "aria-label": p.label },
      p.items.map(function (t, i) {
        var on = t.value === value;
        return h("button", { key: t.value, ref: function (el) { refs.current[i] = el; }, type: "button", role: "tab", className: "hd-tab", "aria-selected": on ? "true" : "false", tabIndex: on ? 0 : -1, onClick: function () { pick(t.value); }, onKeyDown: function (e) { onKey(e, i); } },
          t.label, t.count != null ? h("span", { className: "hd-tab__count" }, t.count) : null);
      }));
  }
  function Tabs(p) { return TabList(p, false); }
  function SegmentedControl(p) { return TabList(p, true); }

  /* ---------- Menu ---------- */
  function Menu(p) {
    var st = useState(!!p.defaultOpen), open = st[0], setOpen = st[1];
    var ac = useState(0), active = ac[0], setActive = ac[1];
    var wrap = useRef(null), btn = useRef(null), list = useRef(null), id = useId(), userOpened = useRef(false);
    var pres = usePresence(open, 120);
    var close = useCallback(function () { setOpen(false); }, []);
    useOutside(wrap, close, open);
    var items = (p.items || []).filter(function (x) { return x !== "separator"; });
    useEffect(function () { if (open && userOpened.current && list.current) list.current.focus(); }, [open]);
    function run(it) { if (it.disabled) return; setOpen(false); if (btn.current) btn.current.focus(); if (it.onSelect) it.onSelect(); }
    function onKey(e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % items.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(items[active]); }
      else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); if (btn.current) btn.current.focus(); }
    }
    var trigger = p.trigger ? R.cloneElement(p.trigger, { ref: btn, "aria-haspopup": "menu", "aria-expanded": open, onClick: function () { userOpened.current = true; setOpen(!open); setActive(0); } })
      : h(IconButton, { icon: "ellipsis", label: p.label || "More actions", tooltip: false, ref: btn, "aria-haspopup": "menu", "aria-expanded": open, onClick: function () { userOpened.current = true; setOpen(!open); setActive(0); } });
    var idx = -1;
    return h("div", { className: "hd-anchor", ref: wrap, style: { display: "inline-block" } }, trigger,
      pres[0] ? h("div", { className: "hd-pop hd-menu", "data-closing": pres[1] ? "true" : undefined, style: p.align === "start" ? { left: 0, right: "auto", transformOrigin: "top left" } : null },
        h("ul", { className: "hd-list", role: "menu", id: id, tabIndex: -1, ref: list, onKeyDown: onKey, "aria-activedescendant": id + "-i" + active, style: { outline: "none" } },
          (p.items || []).map(function (it, i) {
            if (it === "separator") return h("li", { key: "sep" + i, role: "separator", className: "hd-sep" });
            idx++; var my = idx;
            return h("li", { key: it.label, id: id + "-i" + my, role: "menuitem", className: cx("hd-option", it.danger && "hd-option--danger"), "aria-disabled": it.disabled ? "true" : undefined, "data-active": my === active ? "true" : undefined,
              onMouseEnter: function () { setActive(my); }, onClick: function () { run(it); } },
              it.icon ? h(Icon, { name: it.icon, size: 16 }) : null, h("span", null, it.label),
              it.shortcut ? h("span", { style: { marginLeft: "auto", fontSize: "12px", color: "var(--ink-muted)" } }, it.shortcut) : null);
          }))) : null);
  }

  /* ---------- Navigation ---------- */
  function Breadcrumbs(p) {
    var items = p.items || [];
    return h("nav", { "aria-label": "Breadcrumb" }, h("ol", { className: "hd-crumbs", style: { listStyle: "none", margin: 0, padding: 0 } },
      items.map(function (it, i) {
        var last = i === items.length - 1;
        return h("li", { key: i, style: { display: "flex", alignItems: "center", gap: "4px" } },
          last ? h("span", { "aria-current": "page" }, it.label) : h("a", { href: it.href || "#", onClick: it.onClick }, it.label),
          last ? null : h(Icon, { name: "chevron-right", size: 14 }));
      })));
  }

  function NavItem(p) {
    var rest = omit(p, ["icon", "label", "active", "badge", "className"]);
    return h("a", Object.assign({ href: "#" }, rest, { className: cx("hd-nav-item", p.className), "aria-current": p.active ? "page" : undefined }),
      p.icon ? h(Icon, { name: p.icon, size: 20 }) : null, h("span", null, p.label),
      p.badge != null ? h("span", { className: "hd-nav-item__badge" }, h(Badge, { tone: "primary" }, p.badge)) : null);
  }

  function Sidebar(p) {
    return h("aside", { className: cx("hd-side", p.className), "aria-label": "Main navigation", style: p.style },
      h("div", { className: "hd-side__brand" }, h("span", { className: "hd-side__mark", "aria-hidden": true }), p.brand || "Harold"),
      h("nav", { style: { display: "flex", flexDirection: "column", gap: "2px" } },
        (p.sections || []).map(function (s, i) {
          return h(R.Fragment, { key: i }, s.title ? h("div", { className: "hd-side__group" }, s.title) : null,
            s.items.map(function (it) { return h(NavItem, { key: it.label, icon: it.icon, label: it.label, badge: it.badge, active: it.value === p.value, onClick: function (e) { e.preventDefault(); if (p.onChange) p.onChange(it.value); } }); }));
        })),
      p.footer ? h("div", { className: "hd-side__foot" }, p.footer) : null);
  }

  function TopBar(p) {
    return h("header", { className: cx("hd-topbar", p.className) },
      h("div", null, p.breadcrumbs ? h(Breadcrumbs, { items: p.breadcrumbs }) : null, h("h1", { className: "hd-topbar__title" }, p.title)),
      h("div", { className: "hd-topbar__spacer" }), p.actions || null);
  }

  function AppBar(p) {
    return h("header", { className: cx("hd-appbar", p.large && "hd-appbar--large", p.className) },
      p.onBack ? h(IconButton, { icon: "chevron-left", size: "lg", label: p.backLabel || "Back", tooltip: false, onClick: p.onBack }) : h("span", { style: { width: "8px" } }),
      h("h1", { className: "hd-appbar__title" }, p.title),
      p.actions ? h("div", { className: "hd-appbar__actions" }, p.actions) : null);
  }

  function BottomNav(p) {
    return h("nav", { className: cx("hd-bottomnav", p.className), "aria-label": "Main" },
      (p.items || []).slice(0, 5).map(function (it) {
        var on = it.value === p.value;
        return h("button", { key: it.value, type: "button", className: "hd-bottomnav__item", "aria-current": on ? "page" : undefined, onClick: function () { if (p.onChange) p.onChange(it.value); } },
          h("span", { className: "hd-bottomnav__pill" }, h(Icon, { name: it.icon, size: 22 })), it.label);
      }));
  }

  function ListItem(p) {
    var rest = omit(p, ["title", "subtitle", "leading", "meta", "chevron", "className"]);
    return h("button", Object.assign({ type: "button" }, rest, { className: cx("hd-listitem", p.className) }),
      p.leading || null,
      h("span", { className: "hd-listitem__main" }, h("span", { className: "hd-listitem__title", style: { display: "block" } }, p.title), p.subtitle ? h("span", { className: "hd-listitem__sub", style: { display: "block" } }, p.subtitle) : null),
      p.meta ? h("span", { className: "hd-listitem__meta" }, p.meta) : null,
      p.chevron !== false ? h(Icon, { name: "chevron-right", size: 18, style: { color: "var(--ink-muted)" } }) : null);
  }

  function EmptyState(p) {
    return h("div", { className: cx("hd-empty", p.className) },
      h("div", { className: "hd-empty__icon", "aria-hidden": true }, h(Icon, { name: p.icon || "inbox", size: 24 })),
      h("p", { className: "hd-empty__title" }, p.title),
      p.text ? h("p", { className: "hd-empty__text" }, p.text) : null,
      p.actions ? h("div", { className: "hd-empty__actions" }, p.actions) : null);
  }

  var api = {
    Icon: Icon, Button: Button, IconButton: IconButton, Spinner: Spinner, TextField: TextField, Select: Select, DatePicker: DatePicker, Calendar: Calendar,
    Checkbox: Checkbox, RadioGroup: RadioGroup, Switch: Switch, Card: Card, KpiTile: KpiTile, Badge: Badge, Chip: Chip, Avatar: Avatar,
    ProgressBar: ProgressBar, Skeleton: Skeleton, Table: Table, Pagination: Pagination, Alert: Alert, Toaster: Toaster, toast: toast, dismissToast: dismissToast,
    Tooltip: Tooltip, Dialog: Dialog, Sheet: Sheet, Tabs: Tabs, SegmentedControl: SegmentedControl, Menu: Menu, Breadcrumbs: Breadcrumbs,
    Sidebar: Sidebar, NavItem: NavItem, TopBar: TopBar, AppBar: AppBar, BottomNav: BottomNav, ListItem: ListItem, EmptyState: EmptyState,
    formatDate: fmt
  };
  window.Harold = Object.assign(window.Harold || {}, api);
})();
