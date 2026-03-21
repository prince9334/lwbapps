/**
 * DPO Configurator — Storefront Widget
 * Supports all 12 field types, client-side rule engine,
 * real-time pricing, and runtime variant generation.
 * Version: 2.0.0
 */
(function (w, d) {
  "use strict";

  // ── Utilities ─────────────────────────────────────────────────────────────

  function host() {
    return w.CONFIGURATOR_APP_HOST || "/apps/configurator-api";
  }

  function fmt(n) {
    n = parseFloat(n) || 0;
    try {
      var currency = (w.Shopify && w.Shopify.currency && w.Shopify.currency.active) ? w.Shopify.currency.active : "USD";
      if (currency.length !== 3) currency = "USD";
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currency }).format(n);
    } catch (_) {
      return "$" + n.toFixed(2);
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function el(tag, cls, attrs) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function get(obj, path) {
    return path.split(".").reduce(function (o, k) { return o && o[k]; }, obj);
  }

  // ── Client-side Rule Engine ───────────────────────────────────────────────

  var RuleEngine = {
    match: function (op, selVal, condVal) {
      var s = String(selVal || "").toLowerCase();
      var c = String(condVal || "").toLowerCase();
      switch (op) {
        case "=": return s === c;
        case "!=": return s !== c;
        case ">": return parseFloat(selVal) > parseFloat(condVal);
        case "<": return parseFloat(selVal) < parseFloat(condVal);
        case ">=": return parseFloat(selVal) >= parseFloat(condVal);
        case "<=": return parseFloat(selVal) <= parseFloat(condVal);
        case "contains": return s.indexOf(c) !== -1;
        case "not_contains": return s.indexOf(c) === -1;
        case "is_empty": return s.trim() === "";
        case "is_not_empty": return s.trim() !== "";
        default: return false;
      }
    },

    evaluate: function (conditionJson, visibility, makeIt, selections) {
      // Returns true if field should be visible
      if (!conditionJson) return visibility === "visible";
      var conditions;
      try { conditions = JSON.parse(conditionJson); } catch (_) { return visibility === "visible"; }
      if (!conditions.length) return visibility === "visible";
      var allMatch = conditions.every(function (c) {
        return RuleEngine.match(c.operator, selections[c.conditionFieldId] || "", c.conditionValue || "");
      });
      if (allMatch) return makeIt === "visible" || makeIt === "required";
      return visibility === "visible";
    }
  };

  // ── Client-side Pricing Engine ────────────────────────────────────────────

  var PricingEngine = {
    calculate: function (config, selections, visibleIds) {
      var base = config.basePrice || 0;
      var total = base;
      var breakdown = { "Base Price": base };

      config.fields.forEach(function (field) {
        if (visibleIds.indexOf(field.id) === -1) return;
        var sel = selections[field.id];
        if (sel === undefined || sel === null || sel === "") return;

        // Direct field price (flat fee for any entry)
        if (field.price > 0 && ["input","textarea","date","file_upload"].indexOf(field.type) !== -1) {
          var cost = field.priceType === "percentage"
            ? base * field.price / 100
            : field.price;
          total += cost;
          breakdown[field.title] = (breakdown[field.title] || 0) + cost;
        }

        // Value-level modifiers for choice fields
        if (["dropdown","radio","checkbox","color_swatch","image_swatch"].indexOf(field.type) !== -1) {
          var chosen = Array.isArray(sel) ? sel : [sel];
          chosen.forEach(function (v) {
            var matched = (field.values || []).find(function (fv) {
              return fv.value === v;
            });
            if (matched && matched.priceModifier !== 0) {
              var mod = matched.priceType === "percentage"
                ? base * matched.priceModifier / 100
                : matched.priceModifier;
              total += mod;
              breakdown[field.title + ": " + matched.label] = (breakdown[field.title + ": " + matched.label] || 0) + mod;
            }
          });
        }

        // Per-character engraving (text fields with price = 0)
        if (["input","textarea"].indexOf(field.type) !== -1 && field.price === 0 && config.engravingRate > 0) {
          var txt = String(sel);
          if (txt.length > 0) {
            var engrCost = txt.length * config.engravingRate;
            total += engrCost;
            breakdown[field.title + " (" + txt.length + " chars)"] = engrCost;
          }
        }

        // Range / number multiplier
        if (["range_slider","step_counter","number"].indexOf(field.type) !== -1 && field.price > 0) {
          var num = parseFloat(sel) || 0;
          var numCost = field.priceType === "percentage"
            ? base * field.price * num / 100
            : num * field.price;
          total += numCost;
          breakdown[field.title + " × " + num] = numCost;
        }
      });

      return { finalPrice: Math.max(0, Math.round(total * 100) / 100), breakdown: breakdown };
    }
  };

  // ── Configurator Class ────────────────────────────────────────────────────

  function Configurator(container) {
    this.container = container;
    this.config = null;
    this.sections = [];
    this.selections = {};
    this.price = 0;
    this._calcDebounced = debounce(this._updatePrice.bind(this), 350);
    this._init();
  }

  Configurator.prototype._init = function () {
    var self = this;
    if (this.container.dataset.rendered === "true") return;
    this.container.dataset.rendered = "true";

    var productId = this.container.dataset.productId || w.CONFIGURATOR_PRODUCT_ID || "";
    if (!productId) { console.error("[DPO] No productId"); return; }

    this.container.innerHTML = '<div class="dpo-loading"><div class="dpo-spinner"></div><span>Loading options...</span></div>';

    fetch(host() + "/public-api/configurator?productId=" + encodeURIComponent(productId))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (cfg) {
        if (!cfg || cfg.error) {
          self.container.innerHTML = '<div class="dpo-empty">No product options configured.</div>';
          return;
        }
        self.config = cfg;
        self.sections = cfg.sections || [];
        self.price = cfg.basePrice || 0;
        self._applyDefaults();
        self._render();
      })
      .catch(function (err) {
        console.error("[DPO] Load error:", err);
        self.container.innerHTML = '<div class="dpo-error">Could not load product options.</div>';
      });
  };

  // Apply default values from config
  Configurator.prototype._applyDefaults = function () {
    var self = this;
    (this.sections || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (field) {
        if (field.defaultValue !== null && field.defaultValue !== undefined && field.defaultValue !== "") {
          self.selections[field.id] = field.defaultValue;
        }
        // Apply isDefault for choice fields
        (field.values || []).forEach(function (val) {
          if (val.isDefault) self.selections[field.id] = val.value;
        });
      });
    });
  };

  // Compute which fields should be visible
  Configurator.prototype._visibleIds = function () {
    var self = this;
    var visible = [];
    (this.sections || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (field) {
        if (RuleEngine.evaluate(field.conditionJson, field.visibility, field.makeIt, self.selections)) {
          visible.push(field.id);
        }
      });
    });
    return visible;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  Configurator.prototype._render = function () {
    var self = this;
    var wrap = el("div", "dpo-wrap");

    // For each section
    (this.sections || []).forEach(function (sec) {
      var secEl = el("div", "dpo-section");
      secEl.dataset.sectionId = sec.id;

      if (sec.label) {
        var lbl = el("div", "dpo-section-label");
        lbl.textContent = sec.label;
        secEl.appendChild(lbl);
      }

      var grid = el("div", "dpo-fields-grid");
      grid.style.gridTemplateColumns = "repeat(" + (sec.columns || 3) + ", 1fr)";

      (sec.fields || []).forEach(function (field) {
        var fieldEl = self._renderField(field);
        fieldEl.dataset.fieldId = field.id;
        // Initial visibility
        if (!RuleEngine.evaluate(field.conditionJson, field.visibility, field.makeIt, self.selections)) {
          fieldEl.style.display = "none";
        }
        grid.appendChild(fieldEl);
      });

      secEl.appendChild(grid);
      wrap.appendChild(secEl);
    });

    // Price display
    var priceSection = el("div", "dpo-price-wrap");
    priceSection.innerHTML =
      '<div class="dpo-price-label">Options Total</div>' +
      '<div class="dpo-price" id="dpo-price-' + this.config.id + '">' + fmt(this.price) + '</div>' +
      '<div class="dpo-breakdown" id="dpo-breakdown-' + this.config.id + '"></div>';
    wrap.appendChild(priceSection);

    // Add to Cart button
    var atcBtn = el("button", "dpo-atc-btn", { id: "dpo-atc-btn-" + this.config.id, type: "button" });
    atcBtn.textContent = "Add to Cart — " + fmt(this.price);
    atcBtn.addEventListener("click", this._handleAddToCart.bind(this));
    wrap.appendChild(atcBtn);

    // Error display
    var errEl = el("div", "dpo-error-msg");
    errEl.id = "dpo-err-" + this.config.id;
    errEl.style.display = "none";
    wrap.appendChild(errEl);

    // Inject custom CSS from settings
    if (this.config.customCss) {
      var styleEl = el("style");
      styleEl.textContent = this.config.customCss;
      wrap.appendChild(styleEl);
    }

    this.container.innerHTML = "";
    this.container.appendChild(wrap);

    // Move configurator into native form and hide native elements
    var nativeForm = d.querySelector('form[action^="/cart/add"]') || d.querySelector('.product-form form') || d.querySelector('.shopify-product-form');
    if (nativeForm) {
      // Hide native variant selectors to avoid duplicate options
      var nativeSelectors = nativeForm.querySelectorAll('variant-radios, variant-selects, .variant-wrapper, .product-form__input, .selector-wrapper');
      nativeSelectors.forEach(function(el) { el.style.display = "none"; });

      // Find the native Add to Cart button
      var nativeBtn = nativeForm.querySelector('[type="submit"], [name="add"], button.product-form__submit, button.add-to-cart');
      if (nativeBtn) {
        // Automatically inject the configurator exactly where the native variants/add-to-cart were
        nativeBtn.parentNode.insertBefore(this.container, nativeBtn);
        nativeBtn.style.display = "none";
      } else {
        nativeForm.appendChild(this.container);
      }
    }

    this._updatePrice();
  };

  // ── Field Renderers ────────────────────────────────────────────────────────

  Configurator.prototype._renderField = function (field) {
    var wrap = el("div", "dpo-field");
    if (field.cssClass) wrap.classList.add(field.cssClass);

    // Label
    var lbl = el("label", "dpo-field-label");
    lbl.textContent = field.title + (field.required ? " *" : "");
    if (field.tooltip) {
      var tip = el("span", "dpo-tooltip", { title: field.tooltip });
      tip.textContent = " ⓘ";
      lbl.appendChild(tip);
    }
    wrap.appendChild(lbl);

    // Input
    var input = this._buildInput(field);
    if (input) wrap.appendChild(input);

    return wrap;
  };

  Configurator.prototype._buildInput = function (field) {
    var self = this;
    var type = field.type;

    if (type === "input") return this._mkTextInput(field);
    if (type === "textarea") return this._mkTextarea(field);
    if (type === "number") return this._mkNumber(field);
    if (type === "date") return this._mkDate(field);
    if (type === "dropdown") return this._mkDropdown(field);
    if (type === "radio") return this._mkRadio(field);
    if (type === "checkbox") return this._mkCheckbox(field);
    if (type === "color_swatch") return this._mkColorSwatch(field);
    if (type === "image_swatch") return this._mkImageSwatch(field);
    if (type === "file_upload") return this._mkFileUpload(field);
    if (type === "range_slider") return this._mkRangeSlider(field);
    if (type === "step_counter") return this._mkStepCounter(field);
    return null;
  };

  Configurator.prototype._onChange = function (fieldId, value) {
    this.selections[fieldId] = value;
    this._applyVisibility();
    this._calcDebounced();
  };

  // Apply show/hide based on current selections
  Configurator.prototype._applyVisibility = function () {
    var self = this;
    var visIds = this._visibleIds();
    (this.sections || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (field) {
        var fieldEl = self.container.querySelector('[data-field-id="' + field.id + '"]');
        if (!fieldEl) return;
        fieldEl.style.display = visIds.indexOf(field.id) !== -1 ? "" : "none";
      });
    });
  };

  // Update displayed price
  Configurator.prototype._updatePrice = function () {
    var self = this;
    var visIds = this._visibleIds();
    var allFields = (this.sections || []).flatMap(function (s) { return s.fields || []; });
    var fieldConfigs = allFields.map(function (f) { return { id: f.id, type: f.type, title: f.title, price: f.price, priceType: f.priceType, values: f.values || [], engravingRate: self.config.engravingRate }; });

    var result = PricingEngine.calculate(
      { basePrice: this.config.basePrice, engravingRate: this.config.engravingRate, fields: allFields },
      this.selections,
      visIds
    );

    this.price = result.finalPrice;

    var priceEl = d.getElementById("dpo-price-" + this.config.id);
    if (priceEl) priceEl.textContent = fmt(result.finalPrice);

    var breakdownEl = d.getElementById("dpo-breakdown-" + this.config.id);
    if (breakdownEl) {
      var rows = Object.keys(result.breakdown)
        .filter(function (k) { return result.breakdown[k] !== 0 || k === "Base Price"; })
        .map(function (k) {
          var v = result.breakdown[k];
          return '<div class="dpo-bd-row"><span>' + k + '</span><span>' + (v >= 0 ? "+" : "") + fmt(v) + '</span></div>';
        });
      breakdownEl.innerHTML = rows.join("");
    }

    var btn = d.getElementById("dpo-atc-btn-" + this.config.id);
    if (btn) btn.textContent = "Add to Cart — " + fmt(result.finalPrice);
  };

  // ── Individual field builders ──────────────────────────────────────────────

  Configurator.prototype._mkTextInput = function (field) {
    var self = this;
    var inp = el("input", "dpo-input", { type: "text", placeholder: "Enter " + field.title + "…", autocomplete: "off" });
    if (field.maxLength) inp.maxLength = field.maxLength;
    if (field.required) inp.required = true;
    if (this.selections[field.id]) inp.value = this.selections[field.id];
    inp.addEventListener("input", function () { self._onChange(field.id, inp.value); });
    if (field.hideOnFocus) {
      inp.addEventListener("focus", function () { inp.previousElementSibling && (inp.previousElementSibling.style.opacity = "0"); });
      inp.addEventListener("blur", function () { inp.previousElementSibling && (inp.previousElementSibling.style.opacity = "1"); });
    }
    return inp;
  };

  Configurator.prototype._mkTextarea = function (field) {
    var self = this;
    var ta = el("textarea", "dpo-textarea");
    ta.placeholder = "Enter " + field.title + "…";
    ta.rows = 3;
    if (field.maxLength) ta.maxLength = field.maxLength;
    if (field.required) ta.required = true;
    if (this.selections[field.id]) ta.value = this.selections[field.id];
    ta.addEventListener("input", function () { self._onChange(field.id, ta.value); });
    return ta;
  };

  Configurator.prototype._mkNumber = function (field) {
    var self = this;
    var inp = el("input", "dpo-input dpo-number", { type: "number", autocomplete: "off" });
    if (field.required) inp.required = true;
    if (this.selections[field.id] !== undefined) inp.value = this.selections[field.id];
    inp.addEventListener("change", function () { self._onChange(field.id, parseFloat(inp.value) || 0); });
    return inp;
  };

  Configurator.prototype._mkDate = function (field) {
    var self = this;
    var inp = el("input", "dpo-input dpo-date", { type: "date" });
    if (field.required) inp.required = true;
    if (this.selections[field.id]) inp.value = this.selections[field.id];
    inp.addEventListener("change", function () { self._onChange(field.id, inp.value); });
    return inp;
  };

  Configurator.prototype._mkDropdown = function (field) {
    var self = this;
    var sel = el("select", "dpo-select");
    if (field.required) sel.required = true;
    var ph = el("option"); ph.value = ""; ph.textContent = "Select " + field.title + "…"; sel.appendChild(ph);
    (field.values || []).forEach(function (v) {
      var opt = el("option"); opt.value = v.value;
      opt.textContent = v.label + (v.priceModifier ? " (+" + (v.priceType === "percentage" ? v.priceModifier + "%" : fmt(v.priceModifier)) + ")" : "");
      if (self.selections[field.id] === v.value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { self._onChange(field.id, sel.value); });
    return sel;
  };

  Configurator.prototype._mkRadio = function (field) {
    var self = this;
    var grp = el("div", "dpo-radio-grp");
    (field.values || []).forEach(function (v) {
      var btn = el("button", "dpo-radio-btn", { type: "button" });
      btn.dataset.value = v.value;
      btn.innerHTML = v.label + (v.priceModifier ? '<span class="dpo-price-chip">+' + (v.priceType === "percentage" ? v.priceModifier + "%" : fmt(v.priceModifier)) + '</span>' : "");
      if (self.selections[field.id] === v.value) btn.classList.add("active");
      btn.addEventListener("click", function () {
        grp.querySelectorAll(".dpo-radio-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        self._onChange(field.id, v.value);
      });
      grp.appendChild(btn);
    });
    return grp;
  };

  Configurator.prototype._mkCheckbox = function (field) {
    var self = this;
    var grp = el("div", "dpo-check-grp");
    var currentVals = Array.isArray(self.selections[field.id]) ? self.selections[field.id] : [];
    (field.values || []).forEach(function (v) {
      var row = el("div", "dpo-check-row");
      var cb = el("input", "dpo-checkbox", { type: "checkbox", name: field.id, value: v.value });
      if (currentVals.indexOf(v.value) !== -1) cb.checked = true;
      var lbl = el("label", "dpo-check-label");
      lbl.textContent = v.label + (v.priceModifier ? " (+" + fmt(v.priceModifier) + ")" : "");
      cb.addEventListener("change", function () {
        var checked = Array.from(grp.querySelectorAll("input:checked")).map(function (i) { return i.value; });
        self._onChange(field.id, checked);
      });
      row.appendChild(cb);
      row.appendChild(lbl);
      grp.appendChild(row);
    });
    return grp;
  };

  Configurator.prototype._mkColorSwatch = function (field) {
    var self = this;
    var swatchEl = self.config.settings;
    var shape = (swatchEl && swatchEl.swatchShape) || "square";
    var size = (swatchEl && swatchEl.swatchSize) || 36;
    var grp = el("div", "dpo-swatch-grp");
    (field.values || []).forEach(function (v) {
      var sw = el("button", "dpo-swatch dpo-swatch-color", { type: "button", title: v.label });
      sw.dataset.value = v.value;
      sw.style.backgroundColor = v.colorHex || "#cccccc";
      sw.style.width = size + "px";
      sw.style.height = size + "px";
      sw.style.borderRadius = shape === "circle" ? "50%" : "4px";
      if (self.selections[field.id] === v.value) sw.classList.add("active");
      if (v.priceModifier) {
        var chip = el("span", "dpo-swatch-price");
        chip.textContent = "+" + fmt(v.priceModifier);
        sw.appendChild(chip);
      }
      sw.addEventListener("click", function () {
        grp.querySelectorAll(".dpo-swatch").forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
        self._onChange(field.id, v.value);
      });
      grp.appendChild(sw);
    });
    return grp;
  };

  Configurator.prototype._mkImageSwatch = function (field) {
    var self = this;
    var settings = self.config.settings || {};
    var size = settings.swatchSize || 60;
    var shape = settings.swatchShape || "square";
    var grp = el("div", "dpo-swatch-grp");
    (field.values || []).forEach(function (v) {
      var sw = el("button", "dpo-swatch dpo-swatch-img", { type: "button", title: v.label });
      sw.dataset.value = v.value;
      if (v.imageUrl) {
        var img = el("img");
        img.src = v.imageUrl; img.alt = v.label;
        img.style.width = size + "px"; img.style.height = size + "px";
        img.style.objectFit = "cover";
        img.style.borderRadius = shape === "circle" ? "50%" : "4px";
        sw.appendChild(img);
      } else {
        sw.textContent = v.label;
      }
      if (self.selections[field.id] === v.value) sw.classList.add("active");
      sw.addEventListener("click", function () {
        grp.querySelectorAll(".dpo-swatch").forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
        self._onChange(field.id, v.value);
      });
      grp.appendChild(sw);
    });
    return grp;
  };

  Configurator.prototype._mkFileUpload = function (field) {
    var self = this;
    var inp = el("input", "dpo-file", { type: "file" });
    inp.addEventListener("change", function () {
      self._onChange(field.id, inp.files[0] ? inp.files[0].name : "");
    });
    return inp;
  };

  Configurator.prototype._mkRangeSlider = function (field) {
    var self = this;
    var wrap = el("div", "dpo-range-wrap");
    var inp = el("input", "dpo-range", { type: "range", min: "0", max: "100", step: "1" });
    var display = el("span", "dpo-range-val");
    var initVal = self.selections[field.id] || 0;
    inp.value = initVal; display.textContent = initVal;
    inp.addEventListener("input", function () {
      display.textContent = inp.value;
      self._onChange(field.id, parseFloat(inp.value));
    });
    wrap.appendChild(inp);
    wrap.appendChild(display);
    return wrap;
  };

  Configurator.prototype._mkStepCounter = function (field) {
    var self = this;
    var wrap = el("div", "dpo-step-wrap");
    var val = parseInt(self.selections[field.id]) || 1;
    var minusBtn = el("button", "dpo-step-btn", { type: "button" });
    minusBtn.textContent = "−";
    var display = el("span", "dpo-step-val");
    display.textContent = val;
    var plusBtn = el("button", "dpo-step-btn", { type: "button" });
    plusBtn.textContent = "+";

    function update(n) {
      val = Math.max(1, n);
      display.textContent = val;
      self._onChange(field.id, val);
    }

    minusBtn.addEventListener("click", function () { update(val - 1); });
    plusBtn.addEventListener("click", function () { update(val + 1); });
    wrap.appendChild(minusBtn);
    wrap.appendChild(display);
    wrap.appendChild(plusBtn);
    return wrap;
  };

  // ── Add to Cart ────────────────────────────────────────────────────────────

  Configurator.prototype._handleAddToCart = function () {
    var self = this;
    var btn = d.getElementById("dpo-atc-btn-" + this.config.id);
    var errEl = d.getElementById("dpo-err-" + this.config.id);

    // Validate required fields
    var allFields = (this.sections || []).flatMap(function (s) { return s.fields || []; });
    var visIds = this._visibleIds();
    var missing = [];
    allFields.forEach(function (f) {
      if (f.required && visIds.indexOf(f.id) !== -1) {
        var sel = self.selections[f.id];
        if (!sel || (Array.isArray(sel) && !sel.length) || sel === "") {
          missing.push(f.title);
        }
      }
    });
    if (missing.length) {
      if (errEl) { errEl.textContent = "Please fill in: " + missing.join(", "); errEl.style.display = "block"; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Adding to Cart…"; }
    if (errEl) { errEl.style.display = "none"; }

    fetch(host() + "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: this.config.id,
        selections: this.selections,
        shop: this.container.dataset.shopDomain || (w.Shopify && w.Shopify.shop)
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Server error " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.variantId) throw new Error(data.error || "No variant returned");

        // Build line item properties (all visible field selections)
        var props = {};
        allFields.forEach(function (f) {
          if (visIds.indexOf(f.id) === -1) return;
          if (f.hideSkuInCart) return;
          var sel = self.selections[f.id];
          if (sel !== undefined && sel !== "") {
            props[f.title] = Array.isArray(sel) ? sel.join(", ") : String(sel);
          }
        });
        props["_config_price"] = "$" + data.price.toFixed(2);

        // Helper function to handle Shopify replication delay for newly created variants
        function addToCartWithRetry(variantId, props, retries) {
          return fetch(w.Shopify && w.Shopify.routes && w.Shopify.routes.root ? w.Shopify.routes.root + "cart/add.js" : "/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{
                id: Number(variantId),
                quantity: 1,
                properties: props
              }]
            })
          }).then(function (res) {
            if (res.ok) return res;
            if (retries > 0 && (res.status === 404 || res.status === 422)) {
              console.log("[DPO] Variant not ready or sold out status (422), retrying...", retries);
              return new Promise(function (resolve) {
                setTimeout(function () {
                  resolve(addToCartWithRetry(variantId, props, retries - 1));
                }, 2000);
              });
            }
            return res.json().then(function (e) { throw new Error(e.description || e.message || "Cart error"); });
          });
        }

        if (btn) btn.textContent = "Processing...";
        return addToCartWithRetry(data.variantId, props, 4);
      })
      .then(function () {
        w.location.href = (w.Shopify && w.Shopify.routes && w.Shopify.routes.root ? w.Shopify.routes.root : "/") + "cart";
      })
      .catch(function (err) {
        console.error("[DPO] Cart error:", err);
        if (errEl) { errEl.textContent = "Error: " + err.message; errEl.style.display = "block"; }
        if (btn) { btn.disabled = false; btn.textContent = "Add to Cart — " + fmt(self.price); }
      });
  };

  // ── Init ───────────────────────────────────────────────────────────────────

  function initAll() {
    d.querySelectorAll("[data-configurator]").forEach(function (el) {
      new Configurator(el);
    });
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", initAll);
  else initAll();

})(window, document);
